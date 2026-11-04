'use strict';

// Synthetic loopback emulator only. Never load credentials or a live project.
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || '';
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(emulatorHost)) {
  throw new Error('A loopback Firestore emulator is required');
}

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');
const {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  Timestamp,
} = require('firebase/firestore');
const requireFunctions = createRequire(path.join(__dirname, '../functions/package.json'));
const admin = requireFunctions('firebase-admin');
const {
  executeQrAttendance,
} = require('../functions/src/training/poolQrAttendance');

async function main() {
  const projectId = 'demo-calymob-pool-scan-flow';
  const [host, rawPort] = emulatorHost.split(':');
  const env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(rawPort),
      rules: fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8'),
    },
  });
  const app = admin.initializeApp({ projectId }, `pool-scan-${Date.now()}`);
  const db = admin.firestore(app);
  const club = db.collection('clubs').doc('calypso');
  const session = club.collection('piscine_sessions').doc('session');
  const now = Date.parse('2026-11-04T20:00:00.000Z');

  try {
    await env.clearFirestore();
    await club.collection('members').doc('scanner').set({
      app_role: 'admin',
      member_status: 'active',
      prenom: 'Sophie',
      nom: 'Scanner',
    });
    await club.collection('members').doc('member').set({
      app_role: 'user',
      member_status: 'active',
      prenom: 'Alice',
      nom: 'Exemple',
    });
    await club.collection('members').doc('manual-member').set({
      app_role: 'user',
      member_status: 'active',
      prenom: 'Manuel',
      nom: 'COM-162',
    });
    await session.set({
      type: 'piscine',
      date: admin.firestore.Timestamp.fromMillis(now),
    });

    const request = {
      clubId: 'calypso',
      sessionId: 'session',
      memberId: 'member',
    };
    const attendee = session.collection('attendees').doc('member');
    const receipt = session.collection('qr_scan_receipts').doc('member');

    // First scan creates both server-authoritative documents.
    assert.deepEqual(
      await executeQrAttendance(db, 'scanner', request, now),
      { registered: true },
    );
    assert.equal((await attendee.get()).exists, true);
    assert.equal((await receipt.get()).exists, true);

    const scannerDb = env.authenticatedContext('scanner').firestore();
    const memberDb = env.authenticatedContext('member').firestore();

    // Authorized check-out removes attendance; the immutable receipt remains.
    await assertSucceeds(deleteDoc(doc(
      scannerDb,
      'clubs/calypso/piscine_sessions/session/attendees/member',
    )));
    assert.equal((await attendee.get()).exists, false);
    assert.equal((await receipt.get()).exists, true);

    // A later scan can check the same member in again.
    assert.deepEqual(
      await executeQrAttendance(db, 'scanner', request, now + 1000),
      { registered: true },
    );
    assert.equal((await attendee.get()).exists, true);

    // COM-162 manual adds stay independent from the callable path.
    const manualPath =
        'clubs/calypso/piscine_sessions/session/attendees/manual-member';
    await assertSucceeds(setDoc(doc(scannerDb, manualPath), {
      memberId: 'manual-member',
      memberName: 'Manuel COM-162',
      scannedAt: Timestamp.fromMillis(now),
      scannedBy: 'scanner',
      isGuest: false,
    }));
    assert.equal((await getDoc(doc(scannerDb, manualPath))).exists(), true);
    await assertSucceeds(deleteDoc(doc(scannerDb, manualPath)));
    assert.equal((await getDoc(doc(scannerDb, manualPath))).exists(), false);
    assert.deepEqual(
      await executeQrAttendance(db, 'scanner', {
        ...request,
        memberId: 'manual-member',
      }, now + 2000),
      { registered: true },
    );

    // Client code cannot forge the server receipt or trusted QR proof.
    await assertFails(setDoc(doc(
      memberDb,
      'clubs/calypso/piscine_sessions/session/qr_scan_receipts/forged',
    ), {
      version: 1,
      scannerUid: 'member',
      memberId: 'member',
      sessionId: 'session',
      scannedAt: Timestamp.fromMillis(now),
    }));
    await assertFails(setDoc(doc(
      memberDb,
      'clubs/calypso/piscine_sessions/session/attendees/forged',
    ), {
      memberId: 'member',
      memberName: 'Forged',
      scannedAt: Timestamp.fromMillis(now),
      scannedBy: 'member',
      isGuest: false,
      qrVerified: {
        version: 1,
        scannerUid: 'member',
        memberId: 'member',
        sessionId: 'session',
        scannedAt: Timestamp.fromMillis(now),
      },
    }));

    console.log(
      'PASS: pool scan, attendee+receipt, authorized check-out, rescan, '
      + 'COM-162 manual attendance, and direct-client QR write denials.',
    );
  } finally {
    await db.terminate();
    await app.delete();
    await env.cleanup();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
