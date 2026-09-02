jest.mock('firebase-functions/v2/https', () => ({
  onCall: (_options, handler) => handler,
  HttpsError: class HttpsError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  },
}));
jest.mock('firebase-admin', () => ({
  firestore: Object.assign(jest.fn(), {
    Timestamp: { now: jest.fn(() => new Date('2026-08-12T10:00:00Z')) },
    FieldValue: { serverTimestamp: jest.fn(() => 'server-time') },
  }),
  messaging: jest.fn(),
}));

const admin = require('firebase-admin');

const {
  waitlistReason,
  registrationStatusAfterPromotion,
  canManageWaitlist,
  oldestWaitlistEntry,
  promotionCandidateAfterWithdrawal,
  promotionCandidatesAfterWithdrawal,
  unregisterFromEvent,
} = require('./eventWaitlist');

describe('event waitlist policy', () => {
  const now = new Date('2026-08-12T10:00:00Z');
  const base = { allow_waitlist: true, statut: 'ouvert', date_debut: new Date('2026-08-14T10:00:00Z'), capacite_max: 2 };
  test('opens only when full, deadline passed or manually closed', () => {
    expect(waitlistReason(base, 2, now)).toBe('full');
    expect(waitlistReason({ ...base, registration_deadline: new Date('2026-08-11') }, 1, now)).toBe('deadline');
    expect(waitlistReason({ ...base, statut: 'ferme' }, 1, now)).toBe('closed');
    expect(waitlistReason(base, 1, now)).toBeNull();
  });
  test('blocks disabled, cancelled and started events', () => {
    expect(waitlistReason({ ...base, allow_waitlist: false }, 2, now)).toBeNull();
    expect(waitlistReason({ ...base, statut: 'annule' }, 2, now)).toBeNull();
    expect(waitlistReason({ ...base, date_debut: new Date('2026-08-12T09:00:00Z') }, 2, now)).toBeNull();
  });
  test('promotion preserves payment confirmation policy', () => {
    expect(registrationStatusAfterPromotion(base)).toBe('confirmed');
    expect(registrationStatusAfterPromotion({ payment_required: true, registration_confirmation_policy: 'after_payment' })).toBe('pending_payment');
  });
  test('promotion is restricted to the organizer and elevated roles', () => {
    expect(canManageWaitlist({ app_role: 'membre' }, 'organizer', { organisateur_id: 'organizer' })).toBe(true);
    expect(canManageWaitlist({ app_role: 'admin' }, 'admin', { organisateur_id: 'other' })).toBe(true);
    expect(canManageWaitlist({ app_role: 'membre' }, 'member', { organisateur_id: 'other' })).toBe(false);
  });
  test('automatic promotion selects the oldest waiting registration FIFO', () => {
    const doc = (id, status, requestedAt) => ({
      id,
      data: () => ({ registration_status: status, requested_at: new Date(requestedAt) }),
    });
    const oldest = oldestWaitlistEntry([
      doc('confirmed', 'confirmed', '2026-08-10T08:00:00Z'),
      doc('second', 'waitlisted', '2026-08-10T10:00:00Z'),
      doc('first', 'waitlisted', '2026-08-10T09:00:00Z'),
    ]);
    expect(oldest.id).toBe('first');
  });
  test('a withdrawal opens one place and promotes the oldest waiting member', () => {
    const doc = (id, status, requestedAt) => ({
      id,
      data: () => ({ registration_status: status, requested_at: new Date(requestedAt) }),
    });
    const docs = [
      doc('leaving', 'confirmed', '2026-08-10T08:00:00Z'),
      doc('staying', 'confirmed', '2026-08-10T08:30:00Z'),
      doc('first', 'waitlisted', '2026-08-10T09:00:00Z'),
      doc('second', 'waitlisted', '2026-08-10T10:00:00Z'),
    ];
    expect(promotionCandidateAfterWithdrawal(base, docs, 'leaving', now).id).toBe('first');
    expect(promotionCandidateAfterWithdrawal(base, docs, 'missing', now)).toBeNull();
  });

  test('removing a member and two guests promotes three FIFO candidates', () => {
    const doc = (id, status, requestedAt, extra = {}) => ({
      id,
      data: () => ({ registration_status: status, requested_at: new Date(requestedAt), ...extra }),
    });
    const operation = { ...base, capacite_max: 4 };
    const docs = [
      doc('member', 'confirmed', '2026-08-10T08:00:00Z'),
      doc('guest-1', 'confirmed', '2026-08-10T08:01:00Z'),
      doc('guest-2', 'confirmed', '2026-08-10T08:02:00Z'),
      doc('staying', 'confirmed', '2026-08-10T08:03:00Z'),
      doc('wait-2', 'waitlisted', '2026-08-10T10:00:00Z'),
      doc('wait-1', 'waitlisted', '2026-08-10T09:00:00Z'),
      doc('wait-3', 'waitlisted', '2026-08-10T11:00:00Z'),
      doc('wait-4', 'waitlisted', '2026-08-10T12:00:00Z'),
    ];
    expect(promotionCandidatesAfterWithdrawal(
      operation,
      docs,
      ['member', 'guest-1', 'guest-2'],
      now,
    ).map(entry => entry.id)).toEqual(['wait-1', 'wait-2', 'wait-3']);
  });
});

describe('unregisterFromEvent callable', () => {
  function makeDoc(id, data) {
    return { id, ref: { id, path: `inscriptions/${id}` }, data: () => data };
  }

  function setupDb(attemptDocs) {
    const notifications = [];
    const operationRef = {
      path: 'clubs/calypso/operations/event-1',
      collection: jest.fn(name => {
        if (name === 'inscriptions') return inscriptionsRef;
        if (name === 'waitlist_audit') return auditRef;
        throw new Error(`unexpected operation collection ${name}`);
      }),
    };
    const inscriptionsRef = { path: `${operationRef.path}/inscriptions` };
    const auditRef = { doc: jest.fn(() => ({ path: 'audit/generated' })) };
    const memberRefs = new Map();
    const db = {
      doc: jest.fn(path => {
        if (path === operationRef.path) return operationRef;
        if (!memberRefs.has(path)) {
          memberRefs.set(path, {
            path,
            get: jest.fn(async () => ({
              exists: true,
              data: () => ({ app_role: 'membre', notifications_enabled: false }),
            })),
            collection: jest.fn(() => ({
              add: jest.fn(async payload => notifications.push({ path, payload })),
            })),
          });
        }
        return memberRefs.get(path);
      }),
      runTransaction: jest.fn(async callback => {
        let finalResult;
        for (const docs of attemptDocs) {
          const transaction = {
            get: jest.fn(async ref => {
              if (ref === operationRef) {
                return {
                  exists: true,
                  data: () => ({
                    allow_waitlist: true,
                    statut: 'ouvert',
                    date_debut: new Date('2027-08-14T10:00:00Z'),
                    capacite_max: 3,
                    titre: 'Plongée test',
                    organisateur_id: 'organizer',
                    organisateur_nom: 'Orga',
                  }),
                };
              }
              if (ref === inscriptionsRef) return { docs };
              throw new Error(`unexpected transaction get ${ref.path}`);
            }),
            delete: jest.fn(),
            update: jest.fn(),
            set: jest.fn(),
          };
          finalResult = await callback(transaction);
          db.transactions.push(transaction);
        }
        return finalResult;
      }),
      transactions: [],
    };
    admin.firestore.mockReturnValue(db);
    admin.messaging.mockReturnValue({ sendEachForMulticast: jest.fn() });
    return { db, notifications };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('requires authentication before touching Firestore', async () => {
    await expect(unregisterFromEvent({ auth: null, data: {} }))
      .rejects.toThrow('Authentification requise.');
    expect(admin.firestore).not.toHaveBeenCalled();
  });

  test('deletes member and guests atomically and promotes every freed place FIFO', async () => {
    const docs = [
      makeDoc('member', { membre_id: 'member-1', registration_status: 'confirmed' }),
      makeDoc('guest-1', { membre_id: 'guest-1', registration_status: 'confirmed', is_guest: true, parent_inscription_id: 'member' }),
      makeDoc('guest-2', { membre_id: 'guest-2', registration_status: 'confirmed', is_guest: true, parent_inscription_id: 'member' }),
      makeDoc('wait-2', { membre_id: 'waiting-2', registration_status: 'waitlisted', requested_at: new Date('2026-08-10T10:00:00Z') }),
      makeDoc('wait-1', { membre_id: 'waiting-1', registration_status: 'waitlisted', requested_at: new Date('2026-08-10T09:00:00Z') }),
      makeDoc('wait-3', { membre_id: 'waiting-3', registration_status: 'waitlisted', requested_at: new Date('2026-08-10T11:00:00Z') }),
    ];
    const { db, notifications } = setupDb([docs]);

    const result = await unregisterFromEvent({
      auth: { uid: 'member-1' },
      data: { clubId: 'calypso', operationId: 'event-1', guestAction: 'delete' },
    });

    expect(result.promoted).toEqual(['wait-1', 'wait-2', 'wait-3']);
    const transaction = db.transactions[0];
    expect(transaction.delete.mock.calls.map(([ref]) => ref.id).sort())
      .toEqual(['guest-1', 'guest-2', 'member']);
    expect(transaction.update.mock.calls.map(([ref]) => ref.id))
      .toEqual(['wait-1', 'wait-2', 'wait-3']);
    expect(notifications.map(item => item.path)).toEqual([
      'clubs/calypso/members/waiting-1',
      'clubs/calypso/members/waiting-2',
      'clubs/calypso/members/waiting-3',
    ]);
  });

  test('transaction retry notifies only promotions returned by the committed attempt', async () => {
    const firstAttempt = [
      makeDoc('member', { membre_id: 'member-1', registration_status: 'confirmed' }),
      makeDoc('old-waiter', { membre_id: 'old-waiter', registration_status: 'waitlisted', requested_at: new Date('2026-08-10T09:00:00Z') }),
    ];
    const committedAttempt = [
      makeDoc('member', { membre_id: 'member-1', registration_status: 'waitlisted' }),
      makeDoc('already-filled', { membre_id: 'other', registration_status: 'confirmed' }),
      makeDoc('also-filled', { membre_id: 'other-2', registration_status: 'confirmed' }),
      makeDoc('old-waiter', { membre_id: 'old-waiter', registration_status: 'waitlisted', requested_at: new Date('2026-08-10T09:00:00Z') }),
    ];
    const { notifications } = setupDb([firstAttempt, committedAttempt]);

    const result = await unregisterFromEvent({
      auth: { uid: 'member-1' },
      data: { clubId: 'calypso', operationId: 'event-1' },
    });

    expect(result.promoted).toEqual([]);
    expect(notifications).toEqual([]);
  });

  test('transfers linked guests inside the transaction and frees only the member place', async () => {
    const docs = [
      makeDoc('member', { membre_id: 'member-1', registration_status: 'confirmed' }),
      makeDoc('guest-1', { membre_id: 'guest-1', registration_status: 'confirmed', is_guest: true, parent_inscription_id: 'member' }),
      makeDoc('organizer-entry', { membre_id: 'organizer', registration_status: 'confirmed' }),
      makeDoc('wait-1', { membre_id: 'waiting-1', registration_status: 'waitlisted', requested_at: new Date('2026-08-10T09:00:00Z') }),
      makeDoc('wait-2', { membre_id: 'waiting-2', registration_status: 'waitlisted', requested_at: new Date('2026-08-10T10:00:00Z') }),
    ];
    const { db, notifications } = setupDb([docs]);

    const result = await unregisterFromEvent({
      auth: { uid: 'member-1' },
      data: { clubId: 'calypso', operationId: 'event-1', guestAction: 'transfer' },
    });

    expect(result.promoted).toEqual(['wait-1']);
    const transaction = db.transactions[0];
    expect(transaction.delete.mock.calls.map(([ref]) => ref.id)).toEqual(['member']);
    expect(transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'guest-1' }),
      expect.objectContaining({
        parent_inscription_id: 'organizer-entry',
        added_by: 'organizer',
      }),
    );
    expect(transaction.update.mock.calls.filter(([ref]) => ref.id.startsWith('wait-')))
      .toHaveLength(1);
    expect(notifications.map(item => item.path)).toEqual([
      'clubs/calypso/members/waiting-1',
    ]);
  });
});
