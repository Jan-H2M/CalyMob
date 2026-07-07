/**
 * WP-09 — Snapshot de formation matérialisé (SP4).
 *
 * Un seul document `clubs/{clubId}/members/{memberId}/formation_snapshot/current`
 * contient tout l'agrégat de formation d'un membre. Toutes les vues (mobile,
 * web, suggestions) le LISENT au lieu de recalculer — fin de la duplication
 * des deux services clients (Dart + TS).
 *
 * Ce fichier expose :
 *   - `rebuildSnapshot(clubId, memberId)` : lit les sources et écrit le doc.
 *   - 5 triggers `onDocumentWritten` minces qui appellent rebuildSnapshot.
 *   - le cron `rebuildStaleSnapshots` (onSchedule 04:00) de rattrapage.
 *   - des fonctions de calcul PURES, exportées pour les tests unitaires.
 *
 * Règles de calcul (glossaire + D9/D10 du PRD Carnet) :
 *   - comptage cumulatif (une plongée mer 50 m compte pour mer/30/40/45/50) ;
 *   - tolérance 10 % de profondeur « en nos eaux » (eau douce) : prof_20/30/40 ;
 *   - Zélande : tolérance 10 % sur mer ≤ 40 m, déco et > 40 m non comptées ;
 *   - encadrement / encadrement_mer : AUCUN champ carnet ne les capture →
 *     `have = 0` + `data_missing = true` (décision Jan 2026-07-07, §6). Ces
 *     lignes sont exclues du module_pct pour ne pas afficher un faux retard.
 *   - formation_pct pondéré par nombre d'exercices (D9).
 *
 * Rétro-compat : accepte les entrées carnet sans `counters.maree/surveillance`
 * ni `zone` (WP-07), sans `member_observations`, sans `formation_goals`.
 * Le snapshot est un dérivé jetable : on peut le supprimer et le reconstruire.
 *
 * Firebase Functions v2 (Gen2), région europe-west1.
 */

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');

const REGION = 'europe-west1';
const SNAPSHOT_DOC_ID = 'current';

// Statuts « en cours » d'un claim (pas encore validé/refusé).
const OPEN_CLAIM_STATUSES = [
  'draft',
  'submitted',
  'waiting_monitor',
  'waiting_external_review',
];

// Lignes MIL sans source de données aujourd'hui (décision Jan, §6).
const DATA_MISSING_KEYS = ['encadrement', 'encadrement_mer'];

// ===========================================================================
// Coercition de valeurs (Firestore renvoie des types variés / legacy)
// ===========================================================================

function toNum(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function counters(entry) {
  return (entry && typeof entry.counters === 'object' && entry.counters) || {};
}

function isPoolEntry(entry) {
  return String(entry && entry.source) === 'piscine';
}

function isSeaEntry(entry) {
  return counters(entry).mer === true || entry.water_type === 'sea';
}

function isZelandeEntry(entry) {
  return String(entry && entry.zone) === 'zelande';
}

// ===========================================================================
// Brevet visé : niveau LIFRAS (exercices) + colonne MIL (expériences)
// ===========================================================================

// Niveau explicite `members.target_formation_level` → code niveau LIFRAS.
function targetFromExplicit(value) {
  const raw = String(value || '').trim().toUpperCase();
  const map = {
    '1': 'NB', '1*': 'NB', P1: 'NB', NB: 'NB',
    '2': 'P2', '2*': 'P2', P2: 'P2',
    '3': 'P3', '3*': 'P3', P3: 'P3',
    '4': 'P4', '4*': 'P4', P4: 'P4',
    AM: 'AM', MC: 'MC', MF: 'MF', MN: 'MN',
  };
  return map[raw] || null;
}

// À défaut : niveau courant `plongeur_code` → niveau LIFRAS visé (le suivant).
function targetFromCurrentCode(value) {
  const raw = String(value || '').trim().toUpperCase();
  const map = {
    NB: 'NB',
    '1': 'P2', '1*': 'P2', P1: 'P2',
    '2': 'P3', '2*': 'P3', P2: 'P3',
    '3': 'P4', '3*': 'P4', P3: 'P4',
    '4': 'AM', '4*': 'AM', P4: 'AM',
    AM: 'MC', MC: 'MF', MF: 'MN',
  };
  return map[raw] || null;
}

// Code niveau LIFRAS → colonne du tableau des expériences MIL (§7.4.1,
// s'arrête à MF). MN n'a pas de tableau d'expériences.
function milColumnForNiveau(niveau) {
  const map = {
    NB: '1', P2: '2', P3: '3', P4: '4', AM: 'AM', MC: 'MC', MF: 'MF',
  };
  return map[String(niveau || '').toUpperCase()] || null;
}

// Code niveau LIFRAS → libellé « étoile » pour brevet_pct (clé du snapshot).
function starLabelForNiveau(niveau) {
  const map = {
    NB: '1*', P2: '2*', P3: '3*', P4: '4*',
    AM: 'AM', MC: 'MC', MF: 'MF', MN: 'MN',
  };
  return map[String(niveau || '').toUpperCase()] || String(niveau || '');
}

// ===========================================================================
// Comptage cumulatif des expériences MIL (fonction PURE, testée)
// ===========================================================================

/**
 * @param {Array<object>} entries  entrées carnet (déjà filtrées non-piscine)
 * @param {object} countingRules   `settings/mil_requirements.counting_rules`
 * @returns {Record<string, number>} compte cumulé par clé d'expérience MIL
 */
function computeExperienceCounts(entries, countingRules) {
  const rules = countingRules || {};
  const tolPct = toNum(rules.tolerance_pct);
  const tolFactor = 1 - (tolPct == null ? 10 : tolPct) / 100; // 10 % → 0.9
  const zel = rules.zelande || {};
  const excludeDeco = zel.exclude_deco !== false;
  const excludeBeyond40 = zel.exclude_beyond_40m !== false;
  const zelTolerance = zel.tolerance_mer_max_40m !== false;

  const c = {
    total_milieu_naturel: 0,
    prof_20m: 0, prof_30m: 0, prof_40m: 0,
    encadrement: 0, // data_missing
    nuit: 0,
    mer: 0, mer_30m: 0, mer_40m: 0, mer_maree: 0,
    encadrement_mer: 0, // data_missing
    dp_mer_deco: 0, mer_45m: 0, mer_50m: 0,
    surveillance_ciel: 0,
  };

  for (const entry of entries) {
    if (isPoolEntry(entry)) continue;
    const cnt = counters(entry);
    const d = toNum(entry.depth_max_meters);
    const sea = isSeaEntry(entry);
    const zelande = isZelandeEntry(entry);
    const deco = cnt.deco === true;

    c.total_milieu_naturel += 1;
    if (cnt.nuit === true) c.nuit += 1;
    if (cnt.surveillance === true) c.surveillance_ciel += 1;

    // Profondeur « en nos eaux » (eau douce) : tolérance 10 %.
    if (!sea && d != null) {
      if (d >= 20 * tolFactor) c.prof_20m += 1;
      if (d >= 30 * tolFactor) c.prof_30m += 1;
      if (d >= 40 * tolFactor) c.prof_40m += 1;
    }

    if (sea) {
      c.mer += 1;
      if (cnt.maree === true) c.mer_maree += 1;

      if (zelande) {
        // Zélande : déco et > 40 m non comptées ; tolérance sur mer ≤ 40 m.
        const skip = (excludeDeco && deco) || (excludeBeyond40 && d != null && d > 40);
        if (!skip && d != null) {
          const f = zelTolerance ? tolFactor : 1;
          if (d >= 30 * f) c.mer_30m += 1;
          if (d >= 40 * f) c.mer_40m += 1;
        }
        // mer_45m / mer_50m : hors Zélande uniquement → jamais ici.
      } else if (d != null) {
        // Mer ouverte : seuils exacts (tolérance réservée à la Zélande).
        if (d >= 30) c.mer_30m += 1;
        if (d >= 40) c.mer_40m += 1;
        if (d >= 45) c.mer_45m += 1;
        if (d >= 50) c.mer_50m += 1;
      }

      if (deco && cnt.dp === true && !zelande) c.dp_mer_deco += 1;
    }
  }

  return c;
}

// ===========================================================================
// Bloc MIL : have/need par exigence + module_pct (fonction PURE, testée)
// ===========================================================================

/**
 * @param {Array<object>} entries      entrées carnet (piscine incluse, filtrée ici)
 * @param {object} milRequirements     doc `settings/mil_requirements` (ou null)
 * @param {string|null} milColumn      colonne visée : '1'..'MF' (ou null)
 * @returns {object|null} { per_requirement, module_pct } ou null si pas de MIL
 */
function computeMilExperience(entries, milRequirements, milColumn) {
  if (!milRequirements || !milColumn) return null;
  const table = milRequirements.experience_table || {};
  const need = table[milColumn];
  if (!need || typeof need !== 'object') return null;

  const naturalEntries = (entries || []).filter((e) => !isPoolEntry(e));
  const have = computeExperienceCounts(naturalEntries, milRequirements.counting_rules);

  const perRequirement = {};
  let sumNeed = 0;
  let sumHave = 0;
  for (const key of Object.keys(need)) {
    const needVal = toNum(need[key]);
    if (needVal == null || needVal <= 0) continue; // cellule absente = non exigé
    const dataMissing = DATA_MISSING_KEYS.includes(key);
    const haveVal = dataMissing ? 0 : (have[key] || 0);
    perRequirement[key] = {
      have: haveVal,
      need: needVal,
      ...(dataMissing ? { data_missing: true } : {}),
    };
    // Les lignes sans source (encadrement) n'entrent pas dans le module_pct
    // pour ne pas afficher un faux retard (décision Jan, §6).
    if (!dataMissing) {
      sumNeed += needVal;
      sumHave += Math.min(haveVal, needVal);
    }
  }

  const modulePct = sumNeed > 0 ? Math.round((sumHave / sumNeed) * 100) : 0;
  return { per_requirement: perRequirement, module_pct: modulePct };
}

// ===========================================================================
// Statistiques de plongée (fonction PURE, testée)
// ===========================================================================

function computeDiveStats(entries, countingRules) {
  const natural = (entries || []).filter((e) => !isPoolEntry(e));
  const stats = {
    total: 0, mer: 0, nuit: 0, dp: 0, sf: 0, deco: 0, nitrox: 0, exo: 0,
    maree: 0, surveillance: 0, total_minutes: 0,
    zones: { '0_10': 0, '10_20': 0, '20_30': 0, '30_plus': 0 },
  };
  let maxDepth = null;
  let lastDive = null;

  for (const entry of natural) {
    const cnt = counters(entry);
    stats.total += 1;
    if (isSeaEntry(entry)) stats.mer += 1;
    if (cnt.nuit === true) stats.nuit += 1;
    if (cnt.dp === true) stats.dp += 1;
    if (cnt.sf === true) stats.sf += 1;
    if (cnt.deco === true) stats.deco += 1;
    if (cnt.nitrox === true) stats.nitrox += 1;
    if (cnt.exo === true) stats.exo += 1;
    if (cnt.maree === true) stats.maree += 1;
    if (cnt.surveillance === true) stats.surveillance += 1;
    const dur = toNum(entry.duration_minutes);
    if (dur != null) stats.total_minutes += dur;

    const d = toNum(entry.depth_max_meters);
    if (d != null) {
      if (d < 10) stats.zones['0_10'] += 1;
      else if (d < 20) stats.zones['10_20'] += 1;
      else if (d < 30) stats.zones['20_30'] += 1;
      else stats.zones['30_plus'] += 1;
      maxDepth = maxDepth == null ? d : Math.max(maxDepth, d);
    }

    const date = toDate(entry.date);
    if (date && (lastDive == null || date > lastDive)) lastDive = date;
  }

  stats.max_depth_meters = maxDepth;
  stats.last_dive_date = lastDive ? lastDive.toISOString() : null;
  // thresholds_cum : compteurs cumulés de profondeur/mer (réutilise le calcul MIL).
  stats.thresholds_cum = computeExperienceCounts(natural, countingRules);
  return stats;
}

// 3 dernières plongées hors piscine (pour la fiche + monitor_planning).
function computeRecentDives(entries, limit = 3) {
  return (entries || [])
    .filter((e) => !isPoolEntry(e))
    .map((e) => ({ entry: e, date: toDate(e.date) }))
    .sort((a, b) => (b.date ? b.date.getTime() : 0) - (a.date ? a.date.getTime() : 0))
    .slice(0, limit)
    .map(({ entry, date }) => ({
      id: entry.id || '',
      date: date ? date.toISOString() : null,
      location_name: (entry.location_name && String(entry.location_name).trim()) || 'Lieu inconnu',
      depth_max_meters: toNum(entry.depth_max_meters),
      duration_minutes: toNum(entry.duration_minutes),
      counters: counters(entry),
    }));
}

// ===========================================================================
// Observations → per_code + attention_points (fonctions PURES, testées)
// ===========================================================================

// Regroupe les member_observations `exercice_lifras` par code d'exercice.
function groupObservationsByCode(observations) {
  const perCode = {};
  const acquiredCodes = new Set();
  const inProgress = {};
  for (const obs of observations || []) {
    if (String(obs.category) !== 'exercice_lifras') continue;
    const code = obs.exerciceCode || obs.code;
    if (!code) continue;
    const result = String(obs.result || '');
    const date = toDate(obs.contextDate || obs.createdAt || obs.created_at);
    const cur = perCode[code] || { attempts: 0, last_result: null, last_date: null };
    cur.attempts += 1;
    if (date && (cur.last_date == null || date > toDate(cur.last_date))) {
      cur.last_result = result;
      cur.last_date = date ? date.toISOString() : cur.last_date;
    } else if (cur.last_result == null) {
      cur.last_result = result;
    }
    perCode[code] = cur;
    if (result === 'acquis') acquiredCodes.add(code);
    if (result === 'en_progres') inProgress[code] = (inProgress[code] || 0) + 1;
  }
  return { perCode, acquiredCodes, inProgress };
}

// WP-12 : point d'attention = dernier verdict `a_revoir`, OU ≥ 2 `en_progres`
// sans `acquis`.
function computeAttentionPoints({ perCode, acquiredCodes, inProgress }) {
  const points = new Set();
  for (const [code, data] of Object.entries(perCode)) {
    if (data.last_result === 'a_revoir') points.add(code);
  }
  for (const [code, count] of Object.entries(inProgress)) {
    if (count >= 2 && !acquiredCodes.has(code)) points.add(code);
  }
  return Array.from(points);
}

// ===========================================================================
// Lecture des sources + assemblage + écriture du document (I/O)
// ===========================================================================

function clubRef(db, clubId) {
  return db.collection('clubs').doc(clubId);
}

async function readMemberProfile(db, clubId, memberId) {
  const snap = await clubRef(db, clubId).collection('members').doc(memberId).get();
  return snap.exists ? snap.data() : null;
}

async function readValidatedExercises(db, clubId, memberId) {
  const snap = await clubRef(db, clubId)
    .collection('members').doc(memberId)
    .collection('exercices_valides').get();
  const validated = [];
  const pending = [];
  snap.forEach((doc) => {
    const d = doc.data();
    const status = d.status || 'validated'; // legacy = validé
    const item = {
      code: d.exercice_code || d.exercice_id || '',
      description: d.exercice_description || '',
      date: d.date_validation ? toIso(d.date_validation) : null,
      validator: d.moniteur_nom || d.moniteur_id || '',
      niveau: d.exercice_niveau || '',
    };
    if (!item.code) return;
    if (status === 'validated') validated.push(item);
    else if (status === 'pending') pending.push(item);
  });
  return { validated, pending };
}

async function readPendingClaims(db, clubId, memberId) {
  const snap = await clubRef(db, clubId)
    .collection('exercise_claims')
    .where('member_id', '==', memberId)
    .where('status', 'in', OPEN_CLAIM_STATUSES)
    .get();
  const claims = [];
  snap.forEach((doc) => {
    const d = doc.data();
    claims.push({
      id: doc.id,
      code: d.exercise_code || d.exercise_id || '',
      label: d.exercise_label || '',
      status: d.status || '',
      monitor_id: d.monitor_id || null,
      operation_id: d.operation_id || null,
      palanquee_id: d.palanquee_id || null,
    });
  });
  return claims;
}

async function readObservations(db, clubId, memberId) {
  const snap = await clubRef(db, clubId)
    .collection('member_observations')
    .where('memberId', '==', memberId)
    .get();
  const list = [];
  snap.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
  return list;
}

async function readLogbookEntries(db, clubId, memberId) {
  const snap = await clubRef(db, clubId)
    .collection('student_logbook_entries')
    .where('member_id', '==', memberId)
    .get();
  const list = [];
  snap.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
  return list;
}

async function readFormationGoals(db, clubId, memberId) {
  const ref = clubRef(db, clubId)
    .collection('members').doc(memberId)
    .collection('formation_goals').doc('current');
  const empty = {
    codes: [], difficult_codes: [], redo_codes: [], note: '',
    availability: {}, _ref: ref, _exists: false,
  };
  try {
    const doc = await ref.get();
    if (!doc.exists) return empty;
    const d = doc.data() || {};
    const arr = (v) => (Array.isArray(v) ? v.map(String) : []);
    return {
      codes: arr(d.codes),
      difficult_codes: arr(d.difficult_codes),
      redo_codes: arr(d.redo_codes),
      note: typeof d.note === 'string' ? d.note : '',
      availability:
        d.availability && typeof d.availability === 'object' ? d.availability : {},
      _ref: ref,
      _exists: true,
    };
  } catch (e) {
    return empty;
  }
}

async function readExercisesForNiveau(db, clubId, niveau) {
  if (!niveau) return [];
  const snap = await clubRef(db, clubId)
    .collection('exercices_lifras')
    .where('niveau', '==', niveau)
    .get();
  const list = [];
  snap.forEach((doc) => {
    const d = doc.data();
    if (d.code) list.push({ code: d.code, description: d.description || '', specialite: d.specialite || '' });
  });
  return list;
}

async function readMilRequirements(db, clubId) {
  try {
    const snap = await clubRef(db, clubId).collection('settings').doc('mil_requirements').get();
    return snap.exists ? snap.data() : null;
  } catch (e) {
    return null;
  }
}

function toIso(value) {
  const d = toDate(value);
  return d ? d.toISOString() : null;
}

/**
 * Reconstruit le snapshot d'un membre et l'écrit dans
 * `members/{memberId}/formation_snapshot/current`.
 *
 * @param {string} clubId
 * @param {string} memberId
 * @param {import('firebase-admin/firestore').Firestore} [firestore] injectable
 * @returns {Promise<object|null>} le snapshot écrit (ou null si membre absent)
 */
async function rebuildSnapshot(clubId, memberId, firestore) {
  const db = firestore || admin.firestore();
  if (!clubId || !memberId) return null;

  const member = await readMemberProfile(db, clubId, memberId);
  if (!member) {
    logger.warn(`[rebuildSnapshot] membre introuvable club=${clubId} member=${memberId}`);
    return null;
  }

  const currentCode = member.plongeur_code || '';
  const targetNiveau =
    targetFromExplicit(member.target_formation_level) || targetFromCurrentCode(currentCode);
  const milColumn = milColumnForNiveau(targetNiveau);

  const [
    { validated, pending },
    pendingClaims,
    observations,
    logbookEntries,
    goals,
    exercises,
    milRequirements,
  ] = await Promise.all([
    readValidatedExercises(db, clubId, memberId),
    readPendingClaims(db, clubId, memberId),
    readObservations(db, clubId, memberId),
    readLogbookEntries(db, clubId, memberId),
    readFormationGoals(db, clubId, memberId),
    readExercisesForNiveau(db, clubId, targetNiveau),
    readMilRequirements(db, clubId),
  ]);

  // Exercices restants = référentiel du niveau visé − validés − pending − claims.
  const validatedCodes = new Set(validated.map((e) => e.code));
  const pendingCodes = new Set(pending.map((e) => e.code));
  const pendingClaimCodes = new Set(pendingClaims.map((c) => c.code));
  const remaining = exercises
    .filter((ex) => !validatedCodes.has(ex.code))
    .filter((ex) => !pendingCodes.has(ex.code))
    .filter((ex) => !pendingClaimCodes.has(ex.code))
    .map((ex) => ({ code: ex.code, description: ex.description || '' }));

  // Observations → per_code + attention_points.
  const grouped = groupObservationsByCode(observations);
  const perCode = {};
  for (const [code, data] of Object.entries(grouped.perCode)) {
    perCode[code] = {
      attempts: data.attempts,
      last_result: data.last_result,
      last_date: data.last_date,
    };
  }
  const attentionPoints = computeAttentionPoints(grouped);

  const diveStats = computeDiveStats(
    logbookEntries,
    milRequirements ? milRequirements.counting_rules : null,
  );
  const recentDives = computeRecentDives(logbookEntries);
  const milExperience = computeMilExperience(logbookEntries, milRequirements, milColumn);

  // D7 — auto-nettoyage : retirer les codes devenus validés des objectifs, et
  // écrire le résultat dans formation_goals/current (write-back Admin SDK).
  // Convergent : le write ne se produit que s'il y a un changement, donc le
  // rebuild déclenché en cascade ne réécrit rien (pas de boucle).
  const cleanedGoalCodes = goals.codes.filter((c) => !validatedCodes.has(c));
  const cleanedRedoCodes = goals.redo_codes.filter((c) => !validatedCodes.has(c));
  if (
    goals._exists &&
    goals._ref &&
    (cleanedGoalCodes.length !== goals.codes.length ||
      cleanedRedoCodes.length !== goals.redo_codes.length)
  ) {
    try {
      await goals._ref.set(
        { codes: cleanedGoalCodes, redo_codes: cleanedRedoCodes },
        { merge: true },
      );
    } catch (e) {
      logger.warn(`[rebuildSnapshot] auto-nettoyage objectifs échoué ${memberId}`, e);
    }
  }

  // % : pondéré par nombre d'exercices (D9).
  const totalRequired = exercises.length;
  const validatedCount = validated.length;
  const exercisePct = totalRequired > 0 ? Math.round((validatedCount / totalRequired) * 100) : 0;
  const brevetPct = {};
  if (targetNiveau) brevetPct[starLabelForNiveau(targetNiveau)] = exercisePct;

  const snapshot = {
    updated_at: FieldValue.serverTimestamp(),
    schema_version: 1,
    member_id: memberId,
    target_level: targetNiveau ? starLabelForNiveau(targetNiveau) : null,
    current_code: currentCode,
    exercises: {
      validated,
      pending, // auto-déclarés en attente de validation
      pending_claims: pendingClaims,
      remaining,
      per_code: perCode,
      counts: {
        total_required: totalRequired,
        validated: validatedCount,
        pending: pending.length,
        pending_claims: pendingClaims.length,
        remaining: remaining.length,
      },
    },
    attention_points: attentionPoints,
    dive_stats: diveStats,
    recent_dives: recentDives,
    mil_experience: milExperience, // null si pas de MIL / niveau MN
    brevet_pct: brevetPct,
    formation_pct: exercisePct,
    goals: {
      codes: cleanedGoalCodes,
      difficult_codes: goals.difficult_codes,
      redo_codes: cleanedRedoCodes,
      note: goals.note,
      availability: goals.availability,
    },
  };

  await clubRef(db, clubId)
    .collection('members').doc(memberId)
    .collection('formation_snapshot').doc(SNAPSHOT_DOC_ID)
    .set(snapshot, { merge: false });

  return snapshot;
}

// ===========================================================================
// Triggers minces (onDocumentWritten) → rebuildSnapshot
// ===========================================================================
//
// ⚠️ Aucun trigger n'écoute `formation_snapshot` lui-même : pas de boucle.
// L'erreur d'un rebuild ne doit pas bloquer l'écriture source ⇒ on log et on
// retourne null au lieu de throw (le cron de rattrapage récupère les ratés).

function extractMemberId(event, fieldNames, paramName) {
  const after = event.data && event.data.after && event.data.after.data
    ? event.data.after.data()
    : null;
  const before = event.data && event.data.before && event.data.before.data
    ? event.data.before.data()
    : null;
  if (paramName && event.params && event.params[paramName]) {
    return event.params[paramName];
  }
  const source = after || before || {};
  for (const name of fieldNames) {
    if (source[name]) return source[name];
  }
  return null;
}

async function safeRebuild(clubId, memberId, tag) {
  if (!clubId || !memberId) return;
  try {
    await rebuildSnapshot(clubId, memberId);
    logger.info(`[snapshot:${tag}] rebuilt club=${clubId} member=${memberId}`);
  } catch (error) {
    logger.error(`[snapshot:${tag}] échec club=${clubId} member=${memberId}`, error);
  }
}

const onLogbookEntryWriteSnapshot = onDocumentWritten(
  { document: 'clubs/{clubId}/student_logbook_entries/{entryId}', region: REGION },
  async (event) => {
    const memberId = extractMemberId(event, ['member_id']);
    await safeRebuild(event.params.clubId, memberId, 'logbook');
    return null;
  },
);

const onExerciseClaimWriteSnapshot = onDocumentWritten(
  { document: 'clubs/{clubId}/exercise_claims/{claimId}', region: REGION },
  async (event) => {
    const memberId = extractMemberId(event, ['member_id']);
    await safeRebuild(event.params.clubId, memberId, 'claim');
    return null;
  },
);

const onMemberObservationWriteSnapshot = onDocumentWritten(
  { document: 'clubs/{clubId}/member_observations/{observationId}', region: REGION },
  async (event) => {
    const memberId = extractMemberId(event, ['memberId', 'member_id']);
    await safeRebuild(event.params.clubId, memberId, 'observation');
    return null;
  },
);

const onExercicesValidesWriteSnapshot = onDocumentWritten(
  { document: 'clubs/{clubId}/members/{memberId}/exercices_valides/{exerciceValideId}', region: REGION },
  async (event) => {
    await safeRebuild(event.params.clubId, event.params.memberId, 'exercices_valides');
    return null;
  },
);

const onFormationGoalsWriteSnapshot = onDocumentWritten(
  { document: 'clubs/{clubId}/members/{memberId}/formation_goals/{goalId}', region: REGION },
  async (event) => {
    await safeRebuild(event.params.clubId, event.params.memberId, 'formation_goals');
    return null;
  },
);

// ===========================================================================
// Cron de rattrapage (D9) — 04:00 Europe/Brussels
// ===========================================================================
//
// Reconstruit les snapshots des membres en formation (target_formation_level
// défini ou formation_active) + de tout membre ayant déjà un snapshot. Coût :
// 1 write/membre/nuit — négligeable pour le club (< 100 élèves). Filet de
// sécurité si un trigger a échoué (idempotent : le snapshot est un dérivé).

function isMemberInFormation(data) {
  if (!data) return false;
  if (data.formation_active === true) return true;
  const target = String(data.target_formation_level || '').trim();
  return target.length > 0;
}

const rebuildStaleSnapshots = onSchedule(
  {
    region: REGION,
    schedule: '0 4 * * *',
    timeZone: 'Europe/Brussels',
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async () => {
    const db = admin.firestore();
    const clubsSnap = await db.collection('clubs').get();
    let rebuilt = 0;
    for (const clubDoc of clubsSnap.docs) {
      const clubId = clubDoc.id;
      const membersSnap = await clubRef(db, clubId).collection('members').get();
      for (const memberDoc of membersSnap.docs) {
        if (!isMemberInFormation(memberDoc.data())) continue;
        try {
          await rebuildSnapshot(clubId, memberDoc.id, db);
          rebuilt += 1;
        } catch (error) {
          logger.error(`[rebuildStaleSnapshots] échec club=${clubId} member=${memberDoc.id}`, error);
        }
      }
    }
    logger.info(`[rebuildStaleSnapshots] ${rebuilt} snapshot(s) reconstruit(s)`);
  },
);

// ===========================================================================
// Exports
// ===========================================================================

module.exports = {
  // I/O
  rebuildSnapshot,
  // triggers
  onLogbookEntryWriteSnapshot,
  onExerciseClaimWriteSnapshot,
  onMemberObservationWriteSnapshot,
  onExercicesValidesWriteSnapshot,
  onFormationGoalsWriteSnapshot,
  // cron
  rebuildStaleSnapshots,
  // fonctions pures (tests unitaires)
  computeExperienceCounts,
  computeMilExperience,
  computeDiveStats,
  computeRecentDives,
  groupObservationsByCode,
  computeAttentionPoints,
  targetFromExplicit,
  targetFromCurrentCode,
  milColumnForNiveau,
  starLabelForNiveau,
};
