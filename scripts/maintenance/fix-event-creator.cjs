/**
 * fix-event-creator.cjs
 *
 * One-off Firestore patch: correct `organisateur_id` on a specific event.
 *
 * Background: when the responsable is reassigned via CalyCompta, only
 * `organisateur_nom` (label) is updated — `organisateur_id` (FK) keeps
 * pointing to the old responsable. That breaks two things:
 *   1. CalyMob's `_canManagePalanquees` check (creator_user_id falls back
 *      to organisateur_id, both wrong → encadrant-fallback is the only
 *      path through, and even then `canEdit` was wrongly forced to false
 *      pre-fix in operation_detail_screen.dart).
 *   2. The responsable's phone number shown in the event header is read
 *      from the member document keyed by organisateur_id — so it shows
 *      the OLD responsable's number under the NEW responsable's name.
 *
 * The proper code fix lives in lib/screens/operations/operation_detail_screen.dart
 * (already applied), but for events already in this broken state we patch
 * organisateur_id directly.
 *
 * Usage:
 *   node fix-event-creator.cjs                # DRY RUN — prints what it would do
 *   node fix-event-creator.cjs --apply        # actually writes
 *
 * Edit the CONFIG block below for each run.
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// --- CONFIG ---------------------------------------------------------------
const CLUB_ID = 'calypso';

// Target event: La Gombe — dimanche 26 avril 2026, responsable Yves DEHOGNE.
// Searched by lieu + date so we don't have to hardcode the operationId.
const TARGET = {
  lieu: 'La Gombe',
  // dateDebut on the operation is a Firestore Timestamp; we match by the
  // calendar date in Belgium time.
  dateYmd: '2026-04-26',
};

// New organisateur_id to write. Yves DEHOGNE per Jan's confirmation.
// (organisateur_nom is already 'Yves DEHOGNE' — only the FK is wrong.)
const NEW_ORGANISATEUR_ID = 'mhm3y0igqqej58qpig';
const NEW_ORGANISATEUR_LABEL = 'Yves DEHOGNE (LIFRAS 51991)';
// --------------------------------------------------------------------------

const APPLY = process.argv.includes('--apply');

const possibleServiceAccountPaths = [
  '/Users/jan/Documents/CALYPSO/calycompta-firebase-adminsdk-fbsvc-7981ec9e47.json',
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
  path.join(__dirname, '..', '..', 'functions', 'service-account-key.json'),
].filter(Boolean);

function loadServiceAccount() {
  for (const p of possibleServiceAccountPaths) {
    if (fs.existsSync(p)) {
      console.log(`[init] Service account: ${p}`);
      return require(p);
    }
  }
  throw new Error(
    'No Firebase Admin credentials found. Tried:\n  ' +
      possibleServiceAccountPaths.join('\n  '),
  );
}

admin.initializeApp({ credential: admin.credential.cert(loadServiceAccount()) });
const db = admin.firestore();

function ymd(date) {
  const d = date instanceof Date ? date : date.toDate();
  // Belgium = UTC+1 (winter) / UTC+2 (summer). For 26 April 2026 → CEST (+2).
  // Cheap heuristic: just match local-tz components.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function findTargetOperation() {
  const snap = await db
    .collection(`clubs/${CLUB_ID}/operations`)
    .where('lieu', '==', TARGET.lieu)
    .get();

  const matches = [];
  snap.forEach((doc) => {
    const data = doc.data();
    if (!data.date_debut) return;
    if (ymd(data.date_debut) === TARGET.dateYmd) {
      matches.push({ id: doc.id, ref: doc.ref, data });
    }
  });
  return matches;
}

async function main() {
  console.log(`\n=== Fix event organisateur_id ${APPLY ? '(APPLY)' : '(DRY RUN)'} ===`);
  console.log(`Club:               ${CLUB_ID}`);
  console.log(`Target lieu:        ${TARGET.lieu}`);
  console.log(`Target date:        ${TARGET.dateYmd}`);
  console.log(`New organisateur:   ${NEW_ORGANISATEUR_ID} (${NEW_ORGANISATEUR_LABEL})\n`);

  const matches = await findTargetOperation();
  if (matches.length === 0) {
    console.error(`! No operation found matching lieu="${TARGET.lieu}" on ${TARGET.dateYmd}.`);
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(`! ${matches.length} operations match — refine TARGET to disambiguate:`);
    matches.forEach((m) =>
      console.error(`    ${m.id} — ${m.data.titre || m.data.nom || '(no title)'}`),
    );
    process.exit(1);
  }

  const op = matches[0];
  console.log(`Found operation: ${op.id}`);
  console.log(`  titre:             ${op.data.titre || op.data.nom || '(none)'}`);
  console.log(`  lieu:              ${op.data.lieu}`);
  console.log(`  date_debut:        ${op.data.date_debut.toDate().toISOString()}`);
  console.log(`  organisateur_id:   ${op.data.organisateur_id || '(none)'}`);
  console.log(`  organisateur_nom:  ${op.data.organisateur_nom || '(none)'}`);
  console.log(`  creator_user_id:   ${op.data.creator_user_id || '(none)'}\n`);

  if (op.data.organisateur_id === NEW_ORGANISATEUR_ID) {
    console.log(`✔ organisateur_id is already ${NEW_ORGANISATEUR_ID}. Nothing to do.`);
    process.exit(0);
  }

  const planned = {
    organisateur_id: NEW_ORGANISATEUR_ID,
    organisateur_id_patched_at: admin.firestore.FieldValue.serverTimestamp(),
    organisateur_id_patched_from: op.data.organisateur_id || null,
    organisateur_id_patch_reason:
      'Manual patch: organisateur_nom was reassigned but organisateur_id still pointed to the old responsable; CalyMob palanquées + phone display fix',
  };

  console.log('Planned write:');
  console.log('  organisateur_id            →', NEW_ORGANISATEUR_ID);
  console.log('  organisateur_id_patched_from →', op.data.organisateur_id || '(none)');
  console.log('  organisateur_id_patched_at  → serverTimestamp()');
  console.log('  organisateur_id_patch_reason → (audit string)\n');

  if (!APPLY) {
    console.log('DRY RUN — no write performed. Re-run with --apply to commit.');
    process.exit(0);
  }

  await op.ref.update(planned);
  console.log('✔ Update written.');
  const after = await op.ref.get();
  console.log('After:');
  console.log('  organisateur_id:  ', after.data().organisateur_id);
  console.log('  organisateur_nom: ', after.data().organisateur_nom);
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
