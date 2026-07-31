/**
 * WP-28 fase 3 — nettoie les copies « shared_logbook » créées AVANT le fix
 * du 2026-07-31 : elles contiennent encore la liste de binômes de l'AUTEUR
 * (le destinataire s'y trouve lui-même, l'auteur manque) et ses champs
 * personnels (combi / bouteille / lestage / O₂ / compteurs DP-SF-exo-
 * nitrox-surveillance).
 *
 * Pour chaque copie fautive :
 *   - binômes réécrits du point de vue du propriétaire :
 *     [auteur (shared_from_member_id)] + (autres − propriétaire) ;
 *     `buddies[]` legacy re-dérivé ;
 *   - champs personnels SUPPRIMÉS : combi, combi_type, tank, lestage_kg,
 *     o2_pct ;
 *   - counters filtrés sur les clés partagées (nuit / mer / maree / deco).
 *
 * Les copies créées après le fix passent le contrôle sans modification.
 * DRY-RUN par défaut. `--apply` pour écrire (après backup Firestore).
 */

const admin = require('firebase-admin');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const CLUB_ID = 'calypso';
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, '..', 'service-account-key.json'))) });
const db = admin.firestore();
const { FieldValue, Timestamp } = require('firebase-admin/firestore');

const SHARED_COUNTER_KEYS = ['nuit', 'mer', 'maree', 'deco'];
const PERSONAL_FIELDS = ['combi', 'combi_type', 'tank', 'lestage_kg', 'o2_pct'];

const norm = (v) => String(v || '').trim().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');

const binomeName = (b) => {
  if (!b) return '';
  if (typeof b === 'string') return b;
  return b.display_name || b.displayName || b.name || b.nom || '';
};

const binomeId = (b) => (b && typeof b === 'object' ? b.member_id || b.memberId || null : null);

function sharedCounters(counters = {}) {
  const out = {};
  if (!counters || typeof counters !== 'object') return out;
  for (const k of SHARED_COUNTER_KEYS) if (counters[k] === true) out[k] = true;
  return out;
}

function personalCounterKeys(counters = {}) {
  if (!counters || typeof counters !== 'object') return [];
  return ['exo', 'nitrox', 'dp', 'sf', 'surveillance'].filter((k) => counters[k] === true);
}

function legacyBuddies(binomes) {
  return binomes.map((b) => {
    const out = { name: binomeName(b) || 'Binôme' };
    const id = binomeId(b);
    if (id) out.member_id = id;
    if (b && typeof b === 'object' && b.club) out.external_organization = b.club;
    return out;
  });
}

async function main() {
  console.log(`\n=== fix_shared_logbook_copies ${APPLY ? '⚡ APPLY' : '🔍 DRY-RUN'} ===\n`);

  // Noms des membres (auteur + affichage rapport).
  const membersSnap = await db.collection('clubs').doc(CLUB_ID).collection('members').get();
  const memberName = new Map();
  for (const m of membersSnap.docs) {
    const d = m.data();
    const name = [d.prenom, d.nom].filter((s) => typeof s === 'string' && s.trim()).join(' ').trim();
    memberName.set(m.id, name || m.id);
  }

  const snap = await db.collection('clubs').doc(CLUB_ID)
    .collection('student_logbook_entries')
    .where('source', '==', 'shared_logbook')
    .get();

  console.log(`Copies shared_logbook trouvées : ${snap.size}\n`);

  let dirty = 0;
  let clean = 0;
  let noAuthor = 0;

  for (const docSnap of snap.docs) {
    const e = docSnap.data();
    const ownerId = e.member_id;
    const authorId = e.shared_from_member_id || null;
    const rawBinomes = Array.isArray(e.binomes) ? e.binomes : [];

    const containsOwner = rawBinomes.some((b) => {
      const id = binomeId(b);
      if (id) return id === ownerId;
      return norm(binomeName(b)) === norm(memberName.get(ownerId) || e.member_name);
    });
    const containsAuthor = authorId
      ? rawBinomes.some((b) => binomeId(b) === authorId)
      : true; // pas d'auteur connu → pas de remap possible
    const personalPresent = PERSONAL_FIELDS.filter((f) => e[f] !== undefined && e[f] !== null);
    const personalCnt = personalCounterKeys(e.counters);

    const needsBinomeFix = containsOwner || (authorId && !containsAuthor);
    const needsFieldFix = personalPresent.length > 0 || personalCnt.length > 0;

    if (!needsBinomeFix && !needsFieldFix) { clean += 1; continue; }
    dirty += 1;
    if (!authorId) noAuthor += 1;

    const dateStr = e.date && e.date.toDate ? e.date.toDate().toISOString().slice(0, 10) : '?';
    const problems = [];
    if (containsOwner) problems.push('se contient lui-même');
    if (authorId && !containsAuthor) problems.push('auteur absent');
    if (personalPresent.length) problems.push(`champs perso: ${personalPresent.join(',')}`);
    if (personalCnt.length) problems.push(`compteurs perso: ${personalCnt.join(',')}`);
    console.log(
      `- ${docSnap.id.slice(0, 8)} · ${memberName.get(ownerId) || ownerId} · ${dateStr} · "${(e.location_name || '').slice(0, 24)}"\n` +
      `    → ${problems.join(' · ')}`
    );

    if (!APPLY) continue;

    const update = { updated_at: FieldValue.serverTimestamp(), wp28_cleaned_at: FieldValue.serverTimestamp() };

    if (needsBinomeFix) {
      const others = rawBinomes.filter((b) => {
        const id = binomeId(b);
        if (id) return id !== ownerId && id !== authorId;
        const n = norm(binomeName(b));
        return n !== norm(memberName.get(ownerId) || e.member_name || '');
      });
      const now = Timestamp.now();
      const newBinomes = [];
      if (authorId) {
        newBinomes.push({
          type: 'member',
          member_id: authorId,
          memberId: authorId,
          display_name: memberName.get(authorId) || 'Membre',
          displayName: memberName.get(authorId) || 'Membre',
          added_at: now,
          addedAt: now,
        });
      }
      newBinomes.push(...others.map((b) =>
        (typeof b === 'string' ? { type: 'external', display_name: b, displayName: b } : b)));
      update.binomes = newBinomes;
      update.buddies = legacyBuddies(newBinomes);
    }

    for (const f of personalPresent) update[f] = FieldValue.delete();
    if (personalCnt.length) update.counters = sharedCounters(e.counters);

    await docSnap.ref.update(update);
  }

  console.log(`\nBilan : ${snap.size} copies · ${dirty} à corriger · ${clean} déjà propres` +
    (noAuthor ? ` · ${noAuthor} sans shared_from_member_id (nettoyage partiel)` : ''));
  console.log(APPLY ? '⚡ Corrections appliquées.' : '🔍 Aucune écriture (dry-run). Relance avec --apply pour corriger.');
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
