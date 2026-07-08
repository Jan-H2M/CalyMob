/**
 * WP-22 (D3) — Migration : les plongées piscine ne consomment plus de
 * `dive_number`. Par membre : retire `dive_number` des entrées piscine, puis
 * renumérote les entrées restantes (non-piscine) par date ASC (1,2,3…) et
 * recale `settings/logbook_counter.next`.
 *
 * ⚠️ SEULE modification de données membres du plan carnet. OBLIGATOIRE avant
 * `--apply` : export Firestore de sauvegarde + communication aux membres
 * (le numéro affiché change). Par défaut : DRY-RUN (aucune écriture).
 *
 * Usage :
 *   node scripts/migrate_dive_numbers.cjs                 # dry-run (défaut)
 *   node scripts/migrate_dive_numbers.cjs --member <id>   # dry-run 1 membre
 *   node scripts/migrate_dive_numbers.cjs --apply         # EXÉCUTE (backup requis)
 *
 * Vérification post-migration intégrée : signale tout doublon ou trou dans la
 * séquence par membre.
 */

const admin = require('firebase-admin');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const memberFlagIdx = process.argv.indexOf('--member');
const ONLY_MEMBER = memberFlagIdx !== -1 ? process.argv[memberFlagIdx + 1] : null;
const CLUB_ID = 'calypso';

const serviceAccount = require(path.join(__dirname, '..', 'service-account-key.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function toMillis(v) {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

async function migrateMember(memberId) {
  const entriesCol = db
    .collection('clubs').doc(CLUB_ID)
    .collection('student_logbook_entries');
  const snap = await entriesCol.where('member_id', '==', memberId).get();
  if (snap.empty) return { memberId, dives: 0, poolCleared: 0, changes: [] };

  const docs = snap.docs.map((d) => ({ id: d.id, ref: d.ref, data: d.data() }));
  const pool = docs.filter((d) => d.data.source === 'piscine');
  const dives = docs
    .filter((d) => d.data.source !== 'piscine')
    .sort((a, b) => toMillis(a.data.date) - toMillis(b.data.date));

  const changes = [];
  const batch = db.batch();

  // 1) Retirer dive_number des entrées piscine.
  let poolCleared = 0;
  for (const p of pool) {
    if (p.data.dive_number != null) {
      poolCleared++;
      changes.push(`  piscine ${p.id} : dive_number ${p.data.dive_number} → (retiré)`);
      if (APPLY) {
        batch.update(p.ref, {
          dive_number: admin.firestore.FieldValue.delete(),
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
  }

  // 2) (WP-22 révisé — choix Jan 2026-07-08) : NE PAS renuméroter. On préserve
  // tous les numéros de plongée existants (dont les historiques importés, ex.
  // N°413). On retire uniquement le dive_number des entrées piscine (étape 1).

  // 3) Recaler le compteur sur le plus grand numéro conservé (évite toute
  // collision à la prochaine plongée créée).
  let maxNum = 0;
  for (const d of dives) {
    const nn = d.data.dive_number;
    if (typeof nn === 'number' && nn > maxNum) maxNum = nn;
  }
  const counterRef = db
    .collection('clubs').doc(CLUB_ID)
    .collection('members').doc(memberId)
    .collection('settings').doc('logbook_counter');
  if (APPLY && poolCleared > 0) {
    batch.set(counterRef, {
      next: maxNum + 1,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await batch.commit();
  }

  // 4) Contrôle : aucun doublon de numéro parmi les plongées conservées.
  const nums = dives.map((d) => d.data.dive_number).filter((x) => typeof x === 'number');
  const control = nums.length === new Set(nums).size;

  return { memberId, dives: dives.length, poolCleared, changes, control };
}

async function main() {
  console.log(`\n=== migrate_dive_numbers ${APPLY ? '⚡ APPLY (écriture)' : '🔍 DRY-RUN (lecture seule)'} ===\n`);

  let memberIds;
  if (ONLY_MEMBER) {
    memberIds = [ONLY_MEMBER];
  } else {
    const membersSnap = await db.collection('clubs').doc(CLUB_ID).collection('members').get();
    memberIds = membersSnap.docs.map((d) => d.id);
  }

  let totalDives = 0;
  let totalPoolCleared = 0;
  let totalChanges = 0;
  let controlFailures = 0;

  for (const memberId of memberIds) {
    const r = await migrateMember(memberId);
    totalDives += r.dives;
    totalPoolCleared += r.poolCleared;
    totalChanges += r.changes.length;
    if (r.control === false) controlFailures++;
    if (r.changes.length > 0) {
      console.log(`membre ${memberId} — ${r.dives} plongées, ${r.poolCleared} piscine nettoyées :`);
      r.changes.slice(0, 50).forEach((c) => console.log(c));
      if (r.changes.length > 50) console.log(`  … (+${r.changes.length - 50} autres)`);
      console.log('');
    }
  }

  console.log('--- résumé ---');
  console.log(`membres traités            : ${memberIds.length}`);
  console.log(`entrées piscine nettoyées  : ${totalPoolCleared} (numéro retiré)`);
  console.log(`numéros de plongée modifiés: 0 (préservés — pas de renumérotation)`);
  console.log(`membres avec doublon N°    : ${controlFailures}`);
  void totalDives; void totalChanges;
  console.log(APPLY ? '\n✅ Écritures appliquées.' : '\n🔍 Dry-run : aucune écriture. Relancer avec --apply APRÈS backup Firestore.');
  process.exit(0);
}

main().catch((e) => { console.error('ERREUR', e); process.exit(1); });
