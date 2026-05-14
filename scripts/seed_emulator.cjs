#!/usr/bin/env node
/**
 * Seed minimal test data into the Firebase Emulator so we can exercise the
 * Phase A Cloud Function chain end-to-end without any productie risk.
 *
 * Run after `firebase emulators:start --project calycompta`:
 *     node scripts/seed_emulator.cjs
 *
 * Seeds:
 *   - clubs/calypso (config doc)
 *   - clubs/calypso/members/admin-jan      (admin)
 *   - clubs/calypso/members/student-bob   (student, formation_active=true, P1 → cible 2*)
 *   - clubs/calypso/members/encadrant-eve (encadrant)
 *   - clubs/calypso/piscine_sessions/2026-05-19 (with niveaux + level_courses)
 *
 * After seeding, you can simulate a pool entrance scan by creating
 * `clubs/calypso/piscine_sessions/2026-05-19/attendees/student-bob` →
 * onPiscineAttendeeCreated fires → formation_task appears in
 * `clubs/calypso/formation_tasks`. The script can do that too via
 * `node scripts/seed_emulator.cjs --scan`.
 */

const admin = require('firebase-admin');

// Connect to the emulator instead of production.
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199';

admin.initializeApp({ projectId: 'calycompta' });
const db = admin.firestore();

const CLUB = 'calypso';
const TODAY = new Date();
const SESSION_DATE = isoDate(addDays(nextTuesday(TODAY), 0));

async function main() {
  const doScan = process.argv.includes('--scan');
  const doSessionClose = process.argv.includes('--close-session');

  console.log(`📦 Seeding emulator (club=${CLUB}, session=${SESSION_DATE})`);

  await seedClub();
  await seedMembers();
  await seedPiscineSession();

  if (doScan) {
    await seedAttendeeScan();
  }
  if (doSessionClose) {
    await closeSession();
  }

  console.log('✅ Seed terminé');
  console.log('');
  console.log('Astuce :');
  console.log('  - Vue Firestore  : http://127.0.0.1:4000/firestore');
  console.log('  - Logs Functions : http://127.0.0.1:4000/logs');
  console.log('');
  console.log('Pour simuler un scan (déclenche onPiscineAttendeeCreated) :');
  console.log('  node scripts/seed_emulator.cjs --scan');
  console.log('');
  console.log('Pour clôturer la séance (déclenche onPoolSessionClosed) :');
  console.log('  node scripts/seed_emulator.cjs --close-session');

  process.exit(0);
}

async function seedClub() {
  await db.collection('clubs').doc(CLUB).set(
    {
      name: 'Calypso Diving Club (emulator)',
      seeded_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  console.log('  ✓ club doc');
}

async function seedMembers() {
  const m = (id, data) =>
    db.collection('clubs').doc(CLUB).collection('members').doc(id).set(data, { merge: true });

  await m('admin-jan', {
    prenom: 'Jan',
    nom: 'ANDRIESSENS',
    email: 'jan@calypso.test',
    app_role: 'admin',
    clubStatuten: ['E', 'CA'],
    plongeur_code: 'MN',
    plongeur_niveau: 'MN 2★',
    formation_active: false,
    target_formation_level: null,
  });
  await m('student-bob', {
    prenom: 'Bob',
    nom: 'PLONGEUR',
    email: 'bob@calypso.test',
    app_role: 'member',
    clubStatuten: [],
    plongeur_code: 'P1',
    plongeur_niveau: '1★',
    formation_active: true,
    target_formation_level: '2*',
  });
  await m('encadrant-eve', {
    prenom: 'Eve',
    nom: 'MONITRICE',
    email: 'eve@calypso.test',
    app_role: 'member',
    clubStatuten: ['E'],
    plongeur_code: 'MC',
    plongeur_niveau: 'MC',
    formation_active: false,
  });
  console.log('  ✓ 3 members (admin / student / encadrant)');
}

async function seedPiscineSession() {
  const sessionRef = db
    .collection('clubs')
    .doc(CLUB)
    .collection('piscine_sessions')
    .doc(SESSION_DATE);
  await sessionRef.set(
    {
      date: admin.firestore.Timestamp.fromDate(parseIsoDate(SESSION_DATE)),
      pool_name: 'Watermael-Boitsfort',
      status: 'open',
      closedBy: null,
      closedAt: null,
      niveaux: {
        '2*': {
          courses_by_hour: {
            '1ere_heure': [
              {
                id: '2star_h1_0',
                encadrants: [{ membre_id: 'encadrant-eve', membre_nom: 'Eve MONITRICE' }],
                theme: 'Démasquage profond',
              },
            ],
            '2eme_heure': [],
          },
        },
      },
    },
    { merge: true },
  );
  console.log(`  ✓ piscine_session ${SESSION_DATE} (niveau 2* avec Eve comme moniteur)`);
}

async function seedAttendeeScan() {
  const attendeeRef = db
    .collection('clubs')
    .doc(CLUB)
    .collection('piscine_sessions')
    .doc(SESSION_DATE)
    .collection('attendees')
    .doc('student-bob');
  await attendeeRef.set({
    membre_id: 'student-bob',
    memberName: 'Bob PLONGEUR',
    isGuest: false,
    scannedAt: admin.firestore.FieldValue.serverTimestamp(),
    scannedBy: 'admin-jan',
  });
  console.log(`  ✓ scan attendee student-bob @ ${SESSION_DATE}`);
  console.log('     → onPiscineAttendeeCreated devrait créer une formation_task');
  console.log('     → check : http://127.0.0.1:4000/firestore/data/clubs/calypso/formation_tasks');
}

async function closeSession() {
  const sessionRef = db
    .collection('clubs')
    .doc(CLUB)
    .collection('piscine_sessions')
    .doc(SESSION_DATE);
  await sessionRef.update({
    status: 'closed',
    closedBy: 'admin-jan',
    closedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`  ✓ session ${SESSION_DATE} status=closed`);
  console.log('     → onPoolSessionClosed devrait fan-out logbook_entries + monitor_observation tasks');
}

// --- helpers ---

function pad(n) {
  return n.toString().padStart(2, '0');
}
function isoDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseIsoDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function nextTuesday(d) {
  // Pool sessions are on Tuesdays — round to the next one (or today if today is Tuesday).
  const day = d.getDay();
  const delta = day === 2 ? 0 : (2 - day + 7) % 7;
  return addDays(d, delta);
}

main().catch((err) => {
  console.error('❌ Seed failed', err);
  process.exit(1);
});
