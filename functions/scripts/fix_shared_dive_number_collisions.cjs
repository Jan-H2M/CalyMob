/**
 * Opkuis gerichte — corrige les doublons de dive_number causés par l'import
 * en masse des entrées `shared_logbook` (2026-07-06 : elles ont hérité du
 * numéro de la plongée source → collision avec les plongées du membre).
 *
 * Pour chaque numéro en double : on GARDE l'entrée « originale » (préférence :
 * source ≠ shared_logbook ; à défaut la plus ancienne created_at) à son numéro,
 * et on donne aux autres un NOUVEAU numéro libre (max + 1, +2, …) du membre.
 * Aucun autre numéro n'est touché (pas de renumérotation globale).
 *
 * DRY-RUN par défaut. `--apply` pour écrire (après backup Firestore).
 */

const admin = require('firebase-admin');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const CLUB_ID = 'calypso';
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, '..', 'service-account-key.json'))) });
const db = admin.firestore();

const ms = (v) => (v && v.toMillis ? v.toMillis() : (v ? new Date(v).getTime() : 0));

// Priorité de conservation : plus c'est bas, plus on garde. Une entrée
// « shared_logbook » cède sa place ; sinon on garde la plus ancienne.
function keepScore(e) {
  return e.source === 'shared_logbook' ? 1 : 0;
}

async function fixMember(memberId) {
  const col = db.collection('clubs').doc(CLUB_ID).collection('student_logbook_entries');
  const snap = await col.where('member_id', '==', memberId).get();
  const dives = snap.docs
    .map((d) => ({ id: d.id, ref: d.ref, ...d.data() }))
    .filter((e) => e.source !== 'piscine');

  const byNum = {};
  let maxNum = 0;
  for (const e of dives) {
    if (typeof e.dive_number === 'number') {
      (byNum[e.dive_number] = byNum[e.dive_number] || []).push(e);
      if (e.dive_number > maxNum) maxNum = e.dive_number;
    }
  }
  const dups = Object.values(byNum).filter((arr) => arr.length > 1);
  if (dups.length === 0) return { memberId, changes: [] };

  const changes = [];
  const batch = db.batch();
  let nextFree = maxNum + 1;

  for (const group of dups) {
    // Trie : le « keeper » d'abord (score bas, puis created_at ancien).
    group.sort((a, b) => keepScore(a) - keepScore(b) || ms(a.created_at) - ms(b.created_at));
    const [, ...toRenumber] = group;
    for (const e of toRenumber) {
      const from = e.dive_number;
      const to = nextFree++;
      changes.push(`  ${e.id.slice(0, 6)} "${(e.location_name || e.lieu || '').slice(0, 22)}" (${e.source}) : N°${from} → N°${to}`);
      if (APPLY) {
        batch.update(e.ref, { dive_number: to, updated_at: admin.firestore.FieldValue.serverTimestamp() });
      }
    }
  }

  if (APPLY && changes.length) {
    const counterRef = db.collection('clubs').doc(CLUB_ID)
      .collection('members').doc(memberId).collection('settings').doc('logbook_counter');
    batch.set(counterRef, { next: nextFree, updated_at: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await batch.commit();
  }
  return { memberId, changes };
}

async function main() {
  console.log(`\n=== fix_shared_dive_number_collisions ${APPLY ? '⚡ APPLY' : '🔍 DRY-RUN'} ===\n`);
  const members = await db.collection('clubs').doc(CLUB_ID).collection('members').get();
  let total = 0;
  for (const m of members.docs) {
    const r = await fixMember(m.id);
    if (r.changes.length) {
      const md = m.data();
      console.log(`${md.prenom || ''} ${md.nom || ''} (${m.id.slice(0, 8)}) :`);
      r.changes.forEach((c) => console.log(c));
      total += r.changes.length;
    }
  }
  console.log(`\n--- résumé : ${total} entrée(s) renumérotée(s) ---`);
  console.log(APPLY ? '✅ Écritures appliquées.' : '🔍 Dry-run : aucune écriture. --apply pour exécuter.');
  process.exit(0);
}

main().catch((e) => { console.error('ERREUR', e); process.exit(1); });
