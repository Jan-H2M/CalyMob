const admin = require('firebase-admin');

const {
  allocateCreatedEntry,
  backfillMemberDiveNumbers,
} = require('./assignDiveNumber');
const {
  deterministicCopyEntryId,
  handleRespondToLogbookDiveConfirmation,
} = require('./logbookDiveConfirmations');

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const describeWithEmulator = emulatorAvailable ? describe : describe.skip;

describeWithEmulator('COM-085 Firestore emulator transactions', () => {
  let db;
  let clubId;
  let memberId;
  let entries;
  let confirmations;
  let counterRef;

  beforeAll(() => {
    if (admin.apps.length === 0) {
      admin.initializeApp({
        projectId: process.env.GCLOUD_PROJECT || 'demo-calypso-com085',
      });
    }
    db = admin.firestore();
  });

  beforeEach(() => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    clubId = `qa-com085-${suffix}`;
    memberId = `member-${suffix}`;
    entries = db.collection('clubs').doc(clubId)
      .collection('student_logbook_entries');
    confirmations = db.collection('clubs').doc(clubId)
      .collection('logbook_dive_confirmations');
    counterRef = db.collection('clubs').doc(clubId)
      .collection('members').doc(memberId)
      .collection('settings').doc('logbook_counter');
  });

  test('parallel creates and backfill allocate unique numbers and skip piscine', async () => {
    const firstRef = entries.doc('first');
    const secondRef = entries.doc('second');
    const legacyRef = entries.doc('legacy');
    const poolRef = entries.doc('pool');
    await Promise.all([
      firstRef.set({ member_id: memberId, source: 'manual' }),
      secondRef.set({ member_id: memberId, source: 'manual' }),
      legacyRef.set({
        member_id: memberId,
        source: 'manual',
        date: admin.firestore.Timestamp.fromDate(new Date('2020-01-01')),
      }),
      poolRef.set({ member_id: memberId, source: 'piscine' }),
      counterRef.set({ next: 30 }),
    ]);

    await Promise.all([
      allocateCreatedEntry({
        db, clubId, entryId: firstRef.id, entryRef: firstRef,
      }),
      allocateCreatedEntry({
        db, clubId, entryId: secondRef.id, entryRef: secondRef,
      }),
      backfillMemberDiveNumbers({ db, clubId, memberId }),
    ]);

    const [first, second, legacy, pool, counter] = await Promise.all([
      firstRef.get(),
      secondRef.get(),
      legacyRef.get(),
      poolRef.get(),
      counterRef.get(),
    ]);
    const numbered = [first, second, legacy].map((snap) => snap.data().dive_number);
    expect(numbered.every(Number.isSafeInteger)).toBe(true);
    expect(new Set(numbered).size).toBe(3);
    expect(pool.data().dive_number).toBeUndefined();
    expect(counter.data().next).toBeGreaterThan(Math.max(...numbered));
  });

  test('copy and retry persist exactly one numbered entry with metadata', async () => {
    const confirmationId = 'copy-once';
    await Promise.all([
      db.collection('clubs').doc(clubId).collection('members').doc(memberId)
        .set({ first_name: 'Test', last_name: 'Diver' }),
      counterRef.set({ next: 81 }),
      confirmations.doc(confirmationId).set({
        target_member_id: memberId,
        target_member_name: 'Test Diver',
        source_member_id: 'source-member',
        source_member_name: 'Source Diver',
        source_entry_id: 'source-entry',
        status: 'pending',
        dive_snapshot: {
          date: admin.firestore.Timestamp.fromDate(new Date('2026-08-01T10:00:00Z')),
          location_name: 'Vodelée',
          depth_max_meters: 20,
          duration_minutes: 40,
        },
      }),
    ]);
    const request = {
      auth: { uid: memberId },
      data: { clubId, confirmationId, action: 'confirm_copy' },
    };

    const first = await handleRespondToLogbookDiveConfirmation(
      request,
      { db, notify: async () => {} }
    );
    const retry = await handleRespondToLogbookDiveConfirmation(
      request,
      { db, notify: async () => {} }
    );

    expect(retry).toEqual(first);
    expect(first).toMatchObject({
      status: 'confirmed_copied',
      diveNumber: 81,
    });
    const copies = await entries
      .where('logbook_confirmation_id', '==', confirmationId)
      .get();
    expect(copies.size).toBe(1);
    expect(copies.docs[0].id).toBe(deterministicCopyEntryId(confirmationId));
    expect(copies.docs[0].data()).toMatchObject({
      dive_number: 81,
      dive_number_source: 'respondToLogbookDiveConfirmation',
    });
    expect(copies.docs[0].data().dive_number_allocated_at).toBeDefined();
    expect((await counterRef.get()).data().next).toBe(82);
  });

  test.each(['decline', 'confirm_no_import'])(
    '%s leaves the counter unchanged',
    async (action) => {
      const confirmationId = action;
      await Promise.all([
        db.collection('clubs').doc(clubId).collection('members').doc(memberId)
          .set({ first_name: 'Test' }),
        counterRef.set({ next: 21 }),
        confirmations.doc(confirmationId).set({
          target_member_id: memberId,
          source_member_id: 'source-member',
          source_entry_id: 'source-entry',
          status: 'pending',
          dive_snapshot: {},
        }),
      ]);

      await handleRespondToLogbookDiveConfirmation({
        auth: { uid: memberId },
        data: { clubId, confirmationId, action },
      }, { db, notify: async () => {} });

      expect((await counterRef.get()).data().next).toBe(21);
      expect((await entries.get()).empty).toBe(true);
    }
  );
});
