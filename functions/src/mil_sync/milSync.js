/**
 * WP-26 MS-A — Détection automatique des changements du MIL publié sur
 * mil.amb-lifras.be (copie bénévole, PWA une-page, contenu inline).
 *
 * Chaque semaine : GET la page → snapshot brut dans Storage
 * `mil_snapshots/{ISO}.html` → compare marqueur de version + hash SHA-256 au
 * run précédent → écrit `clubs/{clubId}/mil_sync/runs/items/{id}` → e-mail à
 * Jan si changement OU erreur (+ heartbeat trimestriel « rien à signaler »).
 *
 * NE JAMAIS appliquer automatiquement (D15) : cette CF ne fait que détecter et
 * notifier. L'approbation et l'écriture des référentiels se font à l'écran
 * (MS-C, à venir). Mode dégradé : toute erreur = e-mail, jamais de crash.
 *
 * MS-B (segmentation + diff par section) et MS-C/D (écran d'approbation +
 * impactanalyse) sont des lots ultérieurs.
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const crypto = require('crypto');
const axios = require('axios');
const { sendEmailWithConfig } = require('../utils/emailDelivery');

const REGION = 'europe-west1';
const CLUB_ID = 'calypso';
const MIL_URL = 'https://mil.amb-lifras.be/';
const DEFAULT_RECIPIENTS = ['jan.andriessens@gmail.com'];
const MIN_SIZE = 10 * 1024; // 10 KB : plus petit = anomalie
// La page réelle fait ~5 Mo (contenu + assets inline), pas ~92 Ko : borne large.
const MAX_SIZE = 20 * 1024 * 1024; // 20 MB : plus grand = anomalie
const HEARTBEAT_DAYS = 90;

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

// Marqueur de version type « v2026-7 » (best effort — null si absent).
function extractVersion(html) {
  const m = String(html).match(/v20\d{2}[-.]\d+/i);
  return m ? m[0] : null;
}

// ===========================================================================
// MS-B — segmentation + diff par section + classification N0..N3
// ===========================================================================

const MAX_EXCERPT = 3000;

/**
 * Découpe la page MIL en sections (un « écran » de la PWA par bouton home).
 * Chaque écran = un standard / une condition / une épreuve. Retourne une liste
 * { key, title, text, hash }. Robustesse : si < 5 sections, l'appelant bascule
 * en mode dégradé (diff global).
 */
function segmentPage(html) {
  const DELIM = '';
  let s = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  // Délimiteur avant chaque bouton « home » (début d'un écran).
  s = s.replace(/<[^>]*class="[^"]*\bbutton\b[^"]*\bhome\b[^"]*"[^>]*>/gi, DELIM + '$&');
  s = s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#?[a-z0-9]+;/gi, ' ');
  const chunks = s.split(DELIM)
    .map((x) => x.replace(/\s+/g, ' ').trim())
    .filter((x) => x.length > 0);

  const seen = {};
  return chunks.map((text) => {
    let title = text.replace(/^Accueil\s+Retour\s+/i, '').slice(0, 80).trim();
    if (!title) title = text.slice(0, 60);
    let key = title;
    if (seen[key] != null) { seen[key] += 1; key = `${title} #${seen[key]}`; }
    else seen[key] = 0;
    return { key, title, text, hash: sha256(text) };
  });
}

// Normalisation pour comparaison « de fond » : minuscules, sans ponctuation ni
// espaces (détecte les diffs purement cosmétiques).
function normalizeForCompare(text) {
  return String(text).toLowerCase().replace(/[\s.,;:!?'’"«»()\-–—/]/g, '');
}

function digitsOf(text) {
  return (String(text).match(/\d+/g) || []).join(',');
}

/**
 * Classe un changement de section :
 *   N0 = cosmétique (espaces/ponctuation) · N1 = description (texte) ·
 *   N2 = chiffres/exigences · N3 = structurel (géré à l'appel : ajout/suppr.).
 */
function classifyChange(before, after) {
  if (normalizeForCompare(before) === normalizeForCompare(after)) return 'N0';
  if (digitsOf(before) !== digitsOf(after)) return 'N2';
  return 'N1';
}

/**
 * Diff par section entre deux segmentations. Retourne les propositions
 * { key, title, before, after, level } pour les sections modifiées / ajoutées
 * / supprimées.
 */
function diffSections(prevSections, curSections) {
  const prevByKey = new Map(prevSections.map((s) => [s.key, s]));
  const curByKey = new Map(curSections.map((s) => [s.key, s]));
  const props = [];

  for (const cur of curSections) {
    const prev = prevByKey.get(cur.key);
    if (!prev) {
      props.push({ key: cur.key, title: cur.title, before: '', after: cur.text.slice(0, MAX_EXCERPT), level: 'N3' });
    } else if (prev.hash !== cur.hash) {
      props.push({
        key: cur.key,
        title: cur.title,
        before: prev.text.slice(0, MAX_EXCERPT),
        after: cur.text.slice(0, MAX_EXCERPT),
        level: classifyChange(prev.text, cur.text),
      });
    }
  }
  for (const prev of prevSections) {
    if (!curByKey.has(prev.key)) {
      props.push({ key: prev.key, title: prev.title, before: prev.text.slice(0, MAX_EXCERPT), after: '', level: 'N3' });
    }
  }
  return props;
}

async function loadEmailConfig(db, clubId) {
  try {
    const snap = await db.collection('clubs').doc(clubId)
      .collection('settings').doc('email_config').get();
    return snap.exists ? snap.data() : null;
  } catch (e) {
    return null;
  }
}

async function sendReport(db, clubId, recipients, subject, html) {
  const emailConfig = await loadEmailConfig(db, clubId);
  if (!emailConfig) {
    console.warn('[milSync] pas d\'email_config — rapport loggé seulement:', subject);
    return { sent: false, error: 'email_config manquant', to: recipients };
  }
  try {
    const res = await sendEmailWithConfig(emailConfig, {
      to: recipients.join(','),
      subject,
      html,
      text: html.replace(/<[^>]+>/g, ' '),
    });
    console.log(`[milSync] e-mail envoyé à ${recipients.join(',')} (id ${res.messageId || '?'})`);
    return { sent: true, messageId: res.messageId || null, to: recipients };
  } catch (e) {
    console.error('[milSync] envoi e-mail échoué:', e.message);
    return { sent: false, error: e.message, to: recipients };
  }
}

// MS-B — télécharge le snapshot précédent, segmente les deux, écrit les
// propositions et retourne un résumé (pour l'e-mail). Mode dégradé si la
// segmentation échoue (< 5 sections) : pas de proposition, note globale.
async function buildProposals(db, milSyncRef, runId, prevPath, curHtml, recipients) {
  const empty = { total: 0, byLevel: { N0: 0, N1: 0, N2: 0, N3: 0 }, html: '' };
  let prevHtml = null;
  if (prevPath) {
    try {
      const [buf] = await admin.storage().bucket().file(prevPath).download();
      prevHtml = buf.toString('utf8');
    } catch (e) {
      console.warn('[milSync] snapshot precedent illisible:', e.message);
    }
  }
  if (!prevHtml) {
    return { ...empty, html: '<p><i>Pas de snapshot precedent exploitable : diff par section indisponible.</i></p>' };
  }

  const prevSections = segmentPage(prevHtml);
  const curSections = segmentPage(curHtml);
  if (prevSections.length < 5 || curSections.length < 5) {
    // Mode dégradé (D15 risque) : segmentation non fiable → tout en manuel.
    return { ...empty, html: '<p><i>Segmentation non fiable (structure de page modifiee ?) : controle manuel global requis.</i></p>' };
  }

  const props = diffSections(prevSections, curSections);
  const byLevel = { N0: 0, N1: 0, N2: 0, N3: 0 };
  const propsCol = milSyncRef.doc('proposals').collection('items');
  for (const p of props) {
    byLevel[p.level] = (byLevel[p.level] || 0) + 1;
    await propsCol.add({
      run_id: runId,
      section_key: p.key,
      title: p.title,
      before: p.before,
      after: p.after,
      level: p.level,
      // N0 (cosmétique) auto-marqué reviewed ; le reste attend l'approbation.
      status: p.level === 'N0' ? 'reviewed' : 'open',
      created_at: FieldValue.serverTimestamp(),
    });
  }

  const excerpts = props
    .filter((p) => p.level !== 'N0')
    .slice(0, 5)
    .map((p) => `<li><b>[${p.level}] ${p.title}</b><br><small>avant : ${escapeHtml(p.before.slice(0, 180))}…<br>apres : ${escapeHtml(p.after.slice(0, 180))}…</small></li>`)
    .join('');

  return {
    total: props.length,
    byLevel,
    html: excerpts ? `<ul>${excerpts}</ul>` : '',
  };
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Cœur de la synchro. Retourne un résumé du run.
 * @param {FirebaseFirestore.Firestore} db
 * @param {{trigger?: string}} [opts]
 */
async function runMilSync(db, opts = {}) {
  const milSyncRef = db.collection('clubs').doc(CLUB_ID).collection('mil_sync');
  const runsRef = milSyncRef.doc('runs').collection('items');

  const configSnap = await milSyncRef.doc('config').get();
  const config = configSnap.exists ? configSnap.data() : {};
  const recipients = Array.isArray(config.recipients) && config.recipients.length
    ? config.recipients
    : DEFAULT_RECIPIENTS;

  const nowIso = new Date().toISOString();
  const runDoc = {
    date: FieldValue.serverTimestamp(),
    trigger: opts.trigger || 'schedule',
    version: null,
    hash: null,
    changed: false,
    error: null,
    size: 0,
    snapshot_path: null,
  };

  // ---- Fetch -------------------------------------------------------------
  let html;
  try {
    const res = await axios.get(MIL_URL, {
      timeout: 30000,
      responseType: 'text',
      headers: { 'User-Agent': 'CalypsoMilSync/1.0 (+https://caly.club; carnet de formation)' },
      transformResponse: (d) => d,
    });
    html = typeof res.data === 'string' ? res.data : String(res.data);
  } catch (err) {
    runDoc.error = `fetch: ${err.message}`;
    await runsRef.add(runDoc);
    await sendReport(db, CLUB_ID, recipients,
      '[MIL sync] erreur de recuperation',
      `<p>Impossible de recuperer ${MIL_URL} le ${nowIso}.</p><p>Erreur : ${err.message}</p>`);
    return { ok: false, error: runDoc.error };
  }

  runDoc.size = Buffer.byteLength(html, 'utf8');
  runDoc.version = extractVersion(html);
  runDoc.hash = sha256(html);

  // ---- Garde-fous : taille anormale -> ne pas ecraser, alerter ----------
  if (runDoc.size < MIN_SIZE || runDoc.size > MAX_SIZE) {
    runDoc.error = `taille anormale: ${runDoc.size} octets`;
    await runsRef.add(runDoc);
    await sendReport(db, CLUB_ID, recipients,
      '[MIL sync] page de taille anormale',
      `<p>La page fait ${runDoc.size} octets (hors bornes ${MIN_SIZE}-${MAX_SIZE}). Snapshot NON ecrase, controle manuel requis.</p>`);
    return { ok: false, error: runDoc.error };
  }

  // ---- Snapshot Storage --------------------------------------------------
  try {
    const path = `mil_snapshots/${nowIso.replace(/[:.]/g, '-')}.html`;
    await admin.storage().bucket().file(path).save(html, {
      contentType: 'text/html; charset=utf-8',
      resumable: false,
    });
    runDoc.snapshot_path = path;
  } catch (err) {
    console.error('[milSync] snapshot Storage echoue:', err.message);
    runDoc.error = `storage: ${err.message}`;
  }

  // ---- Comparaison au run precedent -------------------------------------
  const prevSnap = await runsRef.orderBy('date', 'desc').limit(1).get();
  const prev = prevSnap.empty ? null : prevSnap.docs[0].data();
  runDoc.changed = prev
    ? (prev.hash !== runDoc.hash || (!!runDoc.version && !!prev.version && runDoc.version !== prev.version))
    : false; // premier run = reference, pas de changement

  const runRef = await runsRef.add(runDoc);

  // ---- Notification ------------------------------------------------------
  let emailResult = null;
  if (runDoc.changed) {
    // MS-B — diff par section contre le snapshot précédent + propositions.
    const diffSummary = await buildProposals(
      db, milSyncRef, runRef.id, prev && prev.snapshot_path, html, recipients);
    emailResult = await sendReport(db, CLUB_ID, recipients,
      `[MIL sync] changement detecte (${runDoc.version || 'version ?'})`,
      `<p>Un changement du MIL a ete detecte le ${nowIso}.</p>
       <ul>
         <li>Version detectee : <b>${runDoc.version || '-'}</b> (precedente : ${prev && prev.version ? prev.version : '-'})</li>
         <li>Taille : ${runDoc.size} octets - Snapshot : ${runDoc.snapshot_path || '-'}</li>
         <li>Sections modifiees : <b>${diffSummary.total}</b> (N3 struct.: ${diffSummary.byLevel.N3}, N2 chiffres: ${diffSummary.byLevel.N2}, N1 texte: ${diffSummary.byLevel.N1}, N0 cosm.: ${diffSummary.byLevel.N0})</li>
       </ul>
       ${diffSummary.html}
       <p>Rien n'a ete applique automatiquement (D15). Approuvez/rejetez les propositions dans Parametres &gt; Regles LIFRAS &gt; Synchronisation MIL.</p>`);
  } else if (opts.trigger === 'manual') {
    // Run manuel : toujours envoyer un accusé (permet de tester la chaîne).
    emailResult = await sendReport(db, CLUB_ID, recipients,
      '[MIL sync] run manuel - aucun changement',
      `<p>Run manuel du ${nowIso}. Aucun changement detecte.</p>
       <ul>
         <li>Version : ${runDoc.version || '-'}</li>
         <li>Taille : ${runDoc.size} octets - Snapshot : ${runDoc.snapshot_path || '-'}</li>
       </ul>`);
  } else {
    // Heartbeat trimestriel « rien a signaler ».
    const lastHeartbeat = config.last_heartbeat_at && config.last_heartbeat_at.toMillis
      ? config.last_heartbeat_at.toMillis() : 0;
    const days = (Date.now() - lastHeartbeat) / (24 * 60 * 60 * 1000);
    if (days >= HEARTBEAT_DAYS) {
      await sendReport(db, CLUB_ID, recipients,
        '[MIL sync] rien a signaler (heartbeat trimestriel)',
        `<p>La surveillance du MIL fonctionne. Aucun changement depuis le dernier rapport. Version : ${runDoc.version || '-'}.</p>`);
      await milSyncRef.doc('config').set(
        { last_heartbeat_at: FieldValue.serverTimestamp() }, { merge: true });
    }
  }

  return {
    ok: true,
    changed: runDoc.changed,
    version: runDoc.version,
    size: runDoc.size,
    email: emailResult,
    recipients,
  };
}

// ---- Scheduled (hebdomadaire) --------------------------------------------
const milSyncWeekly = onSchedule(
  {
    region: REGION,
    schedule: '0 6 * * 1', // lundi 06:00
    timeZone: 'Europe/Brussels',
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  async () => {
    const db = admin.firestore();
    const configSnap = await db.collection('clubs').doc(CLUB_ID)
      .collection('mil_sync').doc('config').get();
    if (configSnap.exists && configSnap.data().enabled === false) {
      console.log('[milSyncWeekly] desactive (config.enabled=false)');
      return;
    }
    const res = await runMilSync(db, { trigger: 'schedule' });
    console.log('[milSyncWeekly]', JSON.stringify(res));
  }
);

// ---- Callable manuel (test / run a la demande, admin) --------------------
const runMilSyncNow = onCall(
  { region: REGION, timeoutSeconds: 120, memory: '256MiB' },
  async (request) => {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Authentification requise');
    const db = admin.firestore();
    const memberSnap = await db.collection('clubs').doc(CLUB_ID)
      .collection('members').doc(uid).get();
    const role = memberSnap.exists ? memberSnap.data().app_role : null;
    if (role !== 'admin' && role !== 'superadmin') {
      throw new HttpsError('permission-denied', 'Reserve aux administrateurs');
    }
    return runMilSync(db, { trigger: 'manual' });
  }
);

// ---- MS-C : approuver / rejeter une proposition (admin) ------------------
const reviewMilProposal = onCall(
  { region: REGION, timeoutSeconds: 60, memory: '256MiB' },
  async (request) => {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Authentification requise');
    const db = admin.firestore();
    const memberSnap = await db.collection('clubs').doc(CLUB_ID)
      .collection('members').doc(uid).get();
    const role = memberSnap.exists ? memberSnap.data().app_role : null;
    if (role !== 'admin' && role !== 'superadmin') {
      throw new HttpsError('permission-denied', 'Reserve aux administrateurs');
    }
    const { proposalId, decision } = request.data || {};
    if (!proposalId || !['reviewed', 'rejected', 'open'].includes(decision)) {
      throw new HttpsError('invalid-argument', 'proposalId + decision (reviewed|rejected|open) requis');
    }
    const ref = db.collection('clubs').doc(CLUB_ID)
      .collection('mil_sync').doc('proposals').collection('items').doc(proposalId);
    // Le contrôle croisé avec le document officiel extranet + la mise à jour de
    // settings/mil_requirements restent MANUELS (D15) : approuver = « vu/validé ».
    await ref.set({
      status: decision,
      reviewed_by: uid,
      reviewed_at: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { ok: true, proposalId, status: decision };
  }
);

module.exports = {
  milSyncWeekly,
  runMilSyncNow,
  reviewMilProposal,
  // exportes pour tests
  sha256,
  extractVersion,
  segmentPage,
  classifyChange,
  diffSections,
  normalizeForCompare,
};
