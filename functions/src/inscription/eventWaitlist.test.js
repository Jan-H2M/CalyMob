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
    Timestamp: {
      now: jest.fn(() => ({
        toDate: () => new Date('2026-08-12T10:00:00Z'),
        toMillis: () => Date.parse('2026-08-12T10:00:00Z'),
      })),
      fromMillis: jest.fn(milliseconds => ({
        toDate: () => new Date(milliseconds),
        toMillis: () => milliseconds,
      })),
    },
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
  registerForEvent,
  addGuestToEvent,
  guestPricing,
  guestPayloadFingerprint,
  registrationPayloadFingerprint,
  memberRegistrationPrice,
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

describe('registerForEvent callable', () => {
  const validRequestId = 'request_20260812_member_1';

  function makeDoc(id, data) {
    return { id, ref: { id, path: `inscriptions/${id}` }, data: () => data };
  }

  function setupRegistrationDb(
    attempts,
    operationOverrides = {},
    memberOverrides = {},
    previousRequest = null,
  ) {
    const registrationRefs = [
      { id: 'generated-registration', path: 'inscriptions/generated-registration' },
      { id: 'generated-guest-1', path: 'inscriptions/generated-guest-1' },
      { id: 'generated-guest-2', path: 'inscriptions/generated-guest-2' },
    ];
    let nextRegistrationRef = 0;
    const inscriptionsRef = {
      path: 'clubs/calypso/operations/event-1/inscriptions',
      doc: jest.fn(() => registrationRefs[nextRegistrationRef++]),
    };
    const requestRef = {
      id: validRequestId,
      path: `clubs/calypso/operations/event-1/registration_requests/${validRequestId}`,
    };
    const operationRef = {
      path: 'clubs/calypso/operations/event-1',
      collection: jest.fn(name => {
        if (name === 'inscriptions') return inscriptionsRef;
        if (name === 'registration_requests') {
          return { doc: jest.fn(() => requestRef) };
        }
        if (name === 'waitlist_audit') return { doc: jest.fn() };
        throw new Error(`unexpected collection ${name}`);
      }),
    };
    const memberRef = {
      path: 'clubs/calypso/members/member-1',
      get: jest.fn(async () => ({
        exists: true,
        data: () => ({
          prenom: 'Alice',
          nom: 'Encadrant',
          app_role: 'membre',
          clubStatuten: ['Encadrants'],
          ...memberOverrides,
        }),
      })),
    };
    const operation = {
      titre: 'Plongée test',
      statut: 'ouvert',
      date_debut: new Date('2027-08-14T10:00:00Z'),
      capacite_max: 1,
      payment_required: true,
      registration_confirmation_policy: 'after_payment',
      payment_deadline_days: 3,
      event_tariffs: [
        { id: 'member', label: 'Membre', category: 'membre', price: 25 },
        {
          id: 'encadrant', label: 'Encadrant', category: 'encadrant', price: 0,
          installment_amounts: { deposit: 0 },
        },
      ],
      supplements: [{ id: 'bottle', name: 'Bouteille', price: 4 }],
      payment_plan_enabled: true,
      payment_installments: [{ id: 'deposit' }],
      ...operationOverrides,
    };
    if (Object.prototype.hasOwnProperty.call(operationOverrides, 'payment_required')
      && operationOverrides.payment_required === undefined) {
      delete operation.payment_required;
    }
    const transactions = [];
    const db = {
      doc: jest.fn(path => path === operationRef.path ? operationRef : memberRef),
      runTransaction: jest.fn(async callback => {
        let result;
        for (const docs of attempts) {
          const transaction = {
            get: jest.fn(async ref => {
              if (ref === operationRef) return { exists: true, data: () => operation };
              if (ref === inscriptionsRef) return { docs };
              if (ref === requestRef) {
                return {
                  exists: previousRequest !== null,
                  data: () => previousRequest,
                };
              }
              throw new Error(`unexpected get ${ref.path}`);
            }),
            set: jest.fn(),
            update: jest.fn(),
          };
          transactions.push(transaction);
          result = await callback(transaction);
        }
        return result;
      }),
    };
    admin.firestore.mockReturnValue(db);
    return {
      db,
      operationRef,
      registrationRef: registrationRefs[0],
      guestRefs: registrationRefs.slice(1),
      requestRef,
      transactions,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates one server-priced registration and locks the operation capacity', async () => {
    const { operationRef, registrationRef, transactions } = setupRegistrationDb([[]]);
    const payloadFingerprint = registrationPayloadFingerprint({
      clubId: 'calypso',
      operationId: 'event-1',
      selectedSupplementIds: ['bottle'],
      guests: [],
    });

    const result = await registerForEvent({
      auth: { uid: 'member-1' },
      data: {
        clubId: 'calypso',
        operationId: 'event-1',
        requestId: validRequestId,
        payloadFingerprint,
        selectedSupplementIds: ['bottle'],
        source: 'calymob',
        appVersion: '1.21.1+206',
      },
    });

    expect(result).toEqual({
      status: 'pending_payment',
      inscriptionId: 'generated-registration',
      guestInscriptionIds: [],
      idempotent: false,
    });
    expect(transactions[0].set).toHaveBeenCalledWith(
      registrationRef,
      expect.objectContaining({
        membre_id: 'member-1',
        membre_nom: 'Encadrant',
        membre_prenom: 'Alice',
        prix: 0,
        supplement_total: 4,
        selected_supplements: [{ id: 'bottle', name: 'Bouteille', price: 4 }],
        tariff_id: 'encadrant',
        tariff_selected_by: null,
        registration_status: 'pending_payment',
        installment_payments: { deposit: { status: 'unpaid', amount_due: 4 } },
      }),
    );
    expect(transactions[0].update).toHaveBeenCalledWith(
      operationRef,
      { registration_capacity_revision: 1 },
    );
    expect(transactions[0].set).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringContaining('registration_requests') }),
      expect.objectContaining({ payload_fingerprint: payloadFingerprint }),
    );
  });

  test('a transaction retry rejects the concurrent loser instead of overbooking', async () => {
    const newlyCommitted = makeDoc('winner', {
      membre_id: 'member-2',
      registration_status: 'confirmed',
    });
    const { transactions } = setupRegistrationDb([[], [newlyCommitted]]);

    await expect(registerForEvent({
      auth: { uid: 'member-1' },
      data: { clubId: 'calypso', operationId: 'event-1', requestId: validRequestId },
    })).rejects.toMatchObject({ code: 'resource-exhausted' });

    expect(transactions).toHaveLength(2);
    expect(transactions[0].set).toHaveBeenCalledTimes(2);
    expect(transactions[1].set).not.toHaveBeenCalled();
    expect(transactions[1].update).not.toHaveBeenCalled();
  });

  test('rejects duplicate active membership and forged supplement identifiers', async () => {
    setupRegistrationDb([[makeDoc('existing', {
      membre_id: 'member-1', registration_status: 'waitlisted',
    })]]);
    await expect(registerForEvent({
      auth: { uid: 'member-1' },
      data: { clubId: 'calypso', operationId: 'event-1', requestId: validRequestId },
    })).rejects.toMatchObject({ code: 'already-exists' });

    setupRegistrationDb([[]]);
    await expect(registerForEvent({
      auth: { uid: 'member-1' },
      data: {
        clubId: 'calypso', operationId: 'event-1', requestId: validRequestId,
        selectedSupplementIds: ['forged'],
      },
    })).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  test('preserves legacy paid-event defaults when payment_required is absent', async () => {
    const { transactions } = setupRegistrationDb([[]], {
      payment_required: undefined,
      registration_confirmation_policy: 'after_payment',
      payment_deadline_days: undefined,
      event_tariffs: [{ id: 'member', label: 'Membre', category: 'membre', price: 25 }],
    });

    const result = await registerForEvent({
      auth: { uid: 'member-1' },
      data: { clubId: 'calypso', operationId: 'event-1', requestId: validRequestId },
    });

    expect(result.status).toBe('pending_payment');
    const stored = transactions[0].set.mock.calls[0][1];
    expect(stored).toEqual(expect.objectContaining({
      prix: 25,
      payment_status: 'open',
      registration_status: 'pending_payment',
    }));
    expect(stored.payment_expires_at.toMillis()).toBe(
      Date.parse('2026-08-15T10:00:00Z'),
    );
  });

  test('ignores a forged privileged tariff and derives the member rate server-side', async () => {
    const { registrationRef, transactions } = setupRegistrationDb(
      [[]],
      {},
      { clubStatuten: ['Membres'], nom: 'Ordinaire' },
    );

    await registerForEvent({
      auth: { uid: 'member-1' },
      data: {
        clubId: 'calypso',
        operationId: 'event-1',
        requestId: validRequestId,
        selectedTariffId: 'encadrant',
      },
    });

    expect(transactions[0].set).toHaveBeenCalledWith(
      registrationRef,
      expect.objectContaining({ prix: 25, tariff_id: 'member', tariff_selected_by: null }),
    );
  });

  test('creates member and all guests atomically with server pricing', async () => {
    const { registrationRef, guestRefs, requestRef, transactions } = setupRegistrationDb(
      [[]],
      {
        capacite_max: 3,
        allow_guests: true,
        max_guests_per_member: 2,
        event_tariffs: [
          { id: 'member', label: 'Membre', category: 'membre', price: 25 },
          { id: 'guest-adult', label: 'Invité adulte', price: 35, is_guest_tariff: true },
        ],
      },
      { clubStatuten: ['Membres'] },
    );

    const result = await registerForEvent({
      auth: { uid: 'member-1' },
      data: {
        clubId: 'calypso',
        operationId: 'event-1',
        requestId: validRequestId,
        guests: [
          { firstName: 'Bob', lastName: 'Guest', tariffId: 'guest-adult' },
          {
            firstName: 'Eve', lastName: 'Guest', tariffId: 'guest-adult',
            selectedSupplementIds: ['bottle'],
          },
        ],
      },
    });

    expect(result.guestInscriptionIds).toEqual(['generated-guest-1', 'generated-guest-2']);
    expect(transactions[0].set).toHaveBeenCalledWith(registrationRef, expect.any(Object));
    expect(transactions[0].set).toHaveBeenCalledWith(
      guestRefs[0],
      expect.objectContaining({
        prix: 35,
        parent_inscription_id: 'generated-registration',
        membre_id: 'guest_generated-guest-1',
      }),
    );
    expect(transactions[0].set).toHaveBeenCalledWith(
      guestRefs[1],
      expect.objectContaining({ prix: 35, supplement_total: 4 }),
    );
    expect(transactions[0].set).toHaveBeenCalledWith(
      requestRef,
      expect.objectContaining({
        member_id: 'member-1',
        inscription_id: 'generated-registration',
        guest_inscription_ids: ['generated-guest-1', 'generated-guest-2'],
      }),
    );
  });

  test('accepts the dialog free token only when the server has no guest tariff', () => {
    expect(guestPricing({ event_tariffs: [] }, {
      firstName: 'Free', lastName: 'Guest', tariffId: 'free', selectedSupplementIds: [],
    })).toEqual({ tariff: null, price: 0, supplements: [], supplementTotal: 0 });
    expect(() => guestPricing({
      event_tariffs: [{ id: 'paid-guest', is_guest_tariff: true, price: 12 }],
    }, {
      firstName: 'Forged', lastName: 'Free', tariffId: 'free', selectedSupplementIds: [],
    })).toThrow('Tarif invité indisponible.');
  });

  test('rejects the complete group before writing when remaining capacity is insufficient', async () => {
    const legacy = makeDoc('legacy-direct-client', {
      membre_id: 'legacy-member',
      registration_status: 'confirmed',
    });
    const { transactions } = setupRegistrationDb(
      [[legacy]],
      {
        capacite_max: 2,
        allow_guests: true,
        max_guests_per_member: 1,
        event_tariffs: [
          { id: 'member', label: 'Membre', category: 'membre', price: 25 },
          { id: 'guest', label: 'Invité', price: 35, is_guest_tariff: true },
        ],
      },
    );

    await expect(registerForEvent({
      auth: { uid: 'member-1' },
      data: {
        clubId: 'calypso', operationId: 'event-1', requestId: validRequestId,
        guests: [{ firstName: 'No', lastName: 'Room', tariffId: 'guest' }],
      },
    })).rejects.toMatchObject({ code: 'resource-exhausted' });

    expect(transactions[0].set).not.toHaveBeenCalled();
    expect(transactions[0].update).not.toHaveBeenCalled();
  });

  test('rejects every group write when a later guest contains a forged tariff', async () => {
    const { transactions } = setupRegistrationDb(
      [[]],
      {
        capacite_max: 4,
        allow_guests: true,
        max_guests_per_member: 3,
        event_tariffs: [
          { id: 'member', label: 'Membre', category: 'membre', price: 25 },
          { id: 'guest', label: 'Invité', price: 35, is_guest_tariff: true },
        ],
      },
    );

    await expect(registerForEvent({
      auth: { uid: 'member-1' },
      data: {
        clubId: 'calypso', operationId: 'event-1', requestId: validRequestId,
        guests: [
          { firstName: 'Valid', lastName: 'Guest', tariffId: 'guest' },
          { firstName: 'Forged', lastName: 'Guest', tariffId: 'member' },
        ],
      },
    })).rejects.toMatchObject({ code: 'invalid-argument' });

    expect(transactions[0].set).not.toHaveBeenCalled();
    expect(transactions[0].update).not.toHaveBeenCalled();
  });

  test('returns the stored group on an idempotent retry without new writes', async () => {
    const payloadFingerprint = registrationPayloadFingerprint({
      clubId: 'calypso', operationId: 'event-1', selectedSupplementIds: [], guests: [],
    });
    const previousRequest = {
      member_id: 'member-1',
      inscription_id: 'original-member',
      guest_inscription_ids: ['original-guest-1', 'original-guest-2'],
      registration_status: 'confirmed',
      payload_fingerprint: payloadFingerprint,
    };
    const { transactions } = setupRegistrationDb([[]], {}, {}, previousRequest);

    const result = await registerForEvent({
      auth: { uid: 'member-1' },
      data: { clubId: 'calypso', operationId: 'event-1', requestId: validRequestId },
    });

    expect(result).toEqual({
      status: 'confirmed',
      inscriptionId: 'original-member',
      guestInscriptionIds: ['original-guest-1', 'original-guest-2'],
      idempotent: true,
    });
    expect(transactions[0].set).not.toHaveBeenCalled();
    expect(transactions[0].update).not.toHaveBeenCalled();
  });

  test('rejects a supplied fingerprint that does not match the canonical payload', async () => {
    const { transactions } = setupRegistrationDb([[]]);
    await expect(registerForEvent({
      auth: { uid: 'member-1' },
      data: {
        clubId: 'calypso', operationId: 'event-1', requestId: validRequestId,
        payloadFingerprint: 'forged',
      },
    })).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(transactions).toHaveLength(0);
  });

  test('fails closed when a receipt request id is replayed with a changed group', async () => {
    const originalFingerprint = registrationPayloadFingerprint({
      clubId: 'calypso', operationId: 'event-1', selectedSupplementIds: [], guests: [],
    });
    const previousRequest = {
      member_id: 'member-1',
      inscription_id: 'original-member',
      guest_inscription_ids: [],
      registration_status: 'confirmed',
      payload_fingerprint: originalFingerprint,
    };
    const { transactions } = setupRegistrationDb(
      [[]],
      { allow_guests: true, max_guests_per_member: 1 },
      {},
      previousRequest,
    );
    const changedGuests = [{
      firstName: 'Bob', lastName: 'Guest', tariffId: null, selectedSupplementIds: [],
    }];
    await expect(registerForEvent({
      auth: { uid: 'member-1' },
      data: {
        clubId: 'calypso', operationId: 'event-1', requestId: validRequestId,
        guests: changedGuests,
        payloadFingerprint: registrationPayloadFingerprint({
          clubId: 'calypso', operationId: 'event-1', selectedSupplementIds: [], guests: changedGuests,
        }),
      },
    })).rejects.toMatchObject({ code: 'already-exists' });
    expect(transactions[0].set).not.toHaveBeenCalled();
    expect(transactions[0].update).not.toHaveBeenCalled();
  });
});

describe('member pricing policy', () => {
  test('defaults to free only when no member tariff configuration exists', () => {
    expect(memberRegistrationPrice({}, {}).price).toBe(0);
    expect(memberRegistrationPrice({ prix_membre: 0 }, {}).price).toBe(0);
  });

  test.each([undefined, 0])(
    'fails closed for an unmatched dynamic category with prix_membre=%s',
    prixMembre => {
      const operation = {
        event_tariffs: [{ id: 'student', category: 'etudiant', price: 12 }],
        ...(prixMembre === undefined ? {} : { prix_membre: prixMembre }),
      };
      expect(() => memberRegistrationPrice(operation, {
        clubStatuten: ['Encadrant'],
      })).toThrow('Aucun tarif membre');
    },
  );
});

test('guest payload fingerprint matches the CalyMob canonical contract', () => {
  expect(guestPayloadFingerprint({
    clubId: 'club-1',
    operationId: 'event-1',
    parentInscriptionId: 'parent-1',
    guest: {
      firstName: 'Bob',
      lastName: 'Guest',
      tariffId: 'guest-adult',
      selectedSupplementIds: ['tank', 'meal'],
    },
  })).toBe('c22dd83086be920d982cb715caa0ad7662fe409d74755e11d9833ac6a1fd087d');
});

test('registration payload fingerprint sorts supplements but preserves guest order', () => {
  const common = {
    clubId: 'club-1',
    operationId: 'event-1',
    selectedSupplementIds: ['tank', 'meal'],
  };
  const bob = {
    firstName: 'Bob', lastName: 'Guest', tariffId: 'adult',
    selectedSupplementIds: ['air', 'meal'],
  };
  const eve = {
    firstName: 'Eve', lastName: 'Guest', tariffId: null,
    selectedSupplementIds: [],
  };
  const original = registrationPayloadFingerprint({ ...common, guests: [bob, eve] });
  expect(original).toBe('7b65c15b49215846b2a1c4f73397db35032d96d4594de41e72dd404e909adbfd');
  expect(registrationPayloadFingerprint({
    ...common,
    selectedSupplementIds: ['meal', 'tank'],
    guests: [{ ...bob, selectedSupplementIds: ['meal', 'air'] }, eve],
  })).toBe(original);
  expect(registrationPayloadFingerprint({ ...common, guests: [eve, bob] })).not.toBe(original);
});

describe('addGuestToEvent callable', () => {
  const requestId = 'append_request_20260812_1';

  function setupAppend({
    existingRequest = null,
    existingGuests = [],
    capacity = 4,
    memberData = { prenom: 'Alice', nom: 'Member', app_role: 'membre' },
    operationOverrides = {},
  } = {}) {
    const parentRef = { id: 'parent-1', path: 'inscriptions/parent-1' };
    const guestRef = { id: 'new-guest', path: 'inscriptions/new-guest' };
    const requestRef = { id: requestId, path: `registration_requests/${requestId}` };
    const docs = [
      { id: 'parent-1', ref: parentRef, data: () => ({ membre_id: 'member-1', registration_status: 'confirmed' }) },
      ...existingGuests.map((id) => ({
        id,
        ref: { id, path: `inscriptions/${id}` },
        data: () => ({ parent_inscription_id: 'parent-1', registration_status: 'confirmed', is_guest: true }),
      })),
    ];
    let generated = false;
    const inscriptionsRef = {
      path: 'clubs/calypso/operations/event-1/inscriptions',
      doc: jest.fn((id) => {
        if (id === 'parent-1') return parentRef;
        if (id) return { id, path: `inscriptions/${id}` };
        generated = true;
        return guestRef;
      }),
    };
    const operationRef = {
      path: 'clubs/calypso/operations/event-1',
      collection: jest.fn((name) => {
        if (name === 'inscriptions') return inscriptionsRef;
        if (name === 'registration_requests') return { doc: () => requestRef };
        if (name === 'waitlist_audit') return { doc: jest.fn() };
        throw new Error(`unexpected collection ${name}`);
      }),
    };
    const memberRef = {
      path: 'clubs/calypso/members/member-1',
      get: jest.fn(async () => ({
        exists: true,
        data: () => memberData,
      })),
    };
    const operation = {
      titre: 'Free event',
      statut: 'ouvert',
      date_debut: new Date('2027-08-14T10:00:00Z'),
      capacite_max: capacity,
      allow_guests: true,
      max_guests_per_member: 2,
      payment_required: false,
      event_tariffs: [],
      ...operationOverrides,
    };
    const transaction = {
      get: jest.fn(async (ref) => {
        if (ref === operationRef) return { exists: true, data: () => operation };
        if (ref === inscriptionsRef) return { docs };
        if (ref === parentRef) return { exists: true, data: () => docs[0].data() };
        if (ref === requestRef) return { exists: existingRequest !== null, data: () => existingRequest };
        throw new Error(`unexpected get ${ref.path}`);
      }),
      set: jest.fn(),
      update: jest.fn(),
    };
    admin.firestore.mockReturnValue({
      doc: jest.fn((path) => path === operationRef.path ? operationRef : memberRef),
      runTransaction: jest.fn(async (callback) => callback(transaction)),
    });
    return { transaction, operationRef, guestRef, requestRef, generated: () => generated };
  }

  beforeEach(() => jest.clearAllMocks());

  test('appends a free guest atomically to the authenticated active parent', async () => {
    const { transaction, operationRef, guestRef, requestRef } = setupAppend();
    const result = await addGuestToEvent({
      auth: { uid: 'member-1' },
      data: {
        clubId: 'calypso', operationId: 'event-1', parentInscriptionId: 'parent-1',
        requestId,
        guest: { firstName: 'Bob', lastName: 'Guest', tariffId: 'free' },
      },
    });
    expect(result).toEqual({ guestInscriptionId: 'new-guest', idempotent: false });
    expect(transaction.set).toHaveBeenCalledWith(guestRef, expect.objectContaining({
      parent_inscription_id: 'parent-1', prix: 0, tariff_id: null,
      registration_status: 'confirmed', payment_status: null,
    }));
    expect(transaction.set).toHaveBeenCalledWith(requestRef, expect.objectContaining({
      member_id: 'member-1', guest_inscription_id: 'new-guest',
      payload_fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
    expect(transaction.update).toHaveBeenCalledWith(operationRef, { registration_capacity_revision: 1 });
  });

  test('rejects reuse of a request id with a changed guest payload', async () => {
    const fingerprint = guestPayloadFingerprint({
      clubId: 'calypso',
      operationId: 'event-1',
      parentInscriptionId: 'parent-1',
      guest: {
        firstName: 'Bob', lastName: 'Guest', selectedSupplementIds: [],
      },
    });
    const { transaction } = setupAppend({ existingRequest: {
      member_id: 'member-1',
      parent_inscription_id: 'parent-1',
      guest_inscription_id: 'old-guest',
      payload_fingerprint: fingerprint,
    } });
    await expect(addGuestToEvent({
      auth: { uid: 'member-1' },
      data: {
        clubId: 'calypso', operationId: 'event-1', parentInscriptionId: 'parent-1',
        requestId, guest: { firstName: 'Eve', lastName: 'Changed' },
      },
    })).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(transaction.set).not.toHaveBeenCalled();
  });

  test('lets event staff append a standalone guest through the transaction', async () => {
    const { transaction, guestRef } = setupAppend({
      memberData: {
        prenom: 'Eva', nom: 'Staff', app_role: 'membre',
        clubStatuten: ['Encadrants'],
      },
      operationOverrides: { allow_guests: false },
    });
    const result = await addGuestToEvent({
      auth: { uid: 'member-1' },
      data: {
        clubId: 'calypso', operationId: 'event-1', requestId,
        guest: { firstName: 'Staff', lastName: 'Guest' },
      },
    });
    expect(result).toEqual({ guestInscriptionId: 'new-guest', idempotent: false });
    expect(transaction.set).toHaveBeenCalledWith(guestRef, expect.objectContaining({
      parent_inscription_id: null,
      is_guest: true,
    }));
  });

  test('rejects a standalone guest from ordinary members', async () => {
    const { transaction } = setupAppend();
    await expect(addGuestToEvent({
      auth: { uid: 'member-1' },
      data: {
        clubId: 'calypso', operationId: 'event-1', requestId,
        guest: { firstName: 'No', lastName: 'Privilege' },
      },
    })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(transaction.set).not.toHaveBeenCalled();
  });

  test('returns the receipt on retry and never stages a second guest', async () => {
    const { transaction } = setupAppend({ existingRequest: {
      member_id: 'member-1', parent_inscription_id: 'parent-1', guest_inscription_id: 'old-guest',
    } });
    const result = await addGuestToEvent({
      auth: { uid: 'member-1' },
      data: {
        clubId: 'calypso', operationId: 'event-1', parentInscriptionId: 'parent-1',
        requestId, guest: { firstName: 'Bob', lastName: 'Guest' },
      },
    });
    expect(result).toEqual({ guestInscriptionId: 'old-guest', idempotent: true });
    expect(transaction.set).not.toHaveBeenCalled();
    expect(transaction.update).not.toHaveBeenCalled();
  });

  test('rejects capacity and max-guest violations before any write', async () => {
    let setup = setupAppend({ capacity: 1 });
    await expect(addGuestToEvent({
      auth: { uid: 'member-1' },
      data: { clubId: 'calypso', operationId: 'event-1', parentInscriptionId: 'parent-1', requestId, guest: { firstName: 'No', lastName: 'Room' } },
    })).rejects.toMatchObject({ code: 'resource-exhausted' });
    expect(setup.transaction.set).not.toHaveBeenCalled();

    setup = setupAppend({ existingGuests: ['guest-1', 'guest-2'] });
    await expect(addGuestToEvent({
      auth: { uid: 'member-1' },
      data: { clubId: 'calypso', operationId: 'event-1', parentInscriptionId: 'parent-1', requestId, guest: { firstName: 'Too', lastName: 'Many' } },
    })).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(setup.transaction.set).not.toHaveBeenCalled();
  });
});

describe('unregisterFromEvent callable', () => {
  function makeDoc(id, data) {
    return { id, ref: { id, path: `inscriptions/${id}` }, data: () => data };
  }

  function setupDb(attemptDocs, actorRole = 'membre', operationOverrides = {}) {
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
              data: () => ({
                app_role: actorRole,
                prenom: 'Test',
                nom: 'Actor',
                notifications_enabled: false,
              }),
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
                    ...operationOverrides,
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

  test.each([
    ['missing', {}],
    ['null', { inscriptionId: null }],
    ['empty', { inscriptionId: '' }],
    ['whitespace', { inscriptionId: '   ' }],
  ])('rejects a %s inscription id before touching Firestore', async (_label, data) => {
    await expect(unregisterFromEvent({
      auth: { uid: 'member-1' },
      data: { clubId: 'calypso', operationId: 'event-1', ...data },
    })).rejects.toMatchObject({
      code: 'invalid-argument',
      message: 'inscriptionId requis.',
    });
    expect(admin.firestore).not.toHaveBeenCalled();
  });

  test('soft-cancels member and guests atomically and promotes every freed place FIFO', async () => {
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
      data: {
        clubId: 'calypso',
        operationId: 'event-1',
        inscriptionId: 'member',
        guestAction: 'delete',
        source: 'calymob',
        appVersion: '1.21.0+204',
      },
    });

    expect(result.promoted).toEqual(['wait-1', 'wait-2', 'wait-3']);
    expect(result.status).toBe('canceled');
    const transaction = db.transactions[0];
    expect(transaction.delete).not.toHaveBeenCalled();
    const canceledIds = transaction.update.mock.calls
      .filter(([, update]) => update.registration_status === 'canceled')
      .map(([ref]) => ref.id)
      .sort();
    expect(canceledIds).toEqual(['guest-1', 'guest-2', 'member']);
    expect(transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'member' }),
      expect.objectContaining({
        registration_status: 'canceled',
        canceled_by: 'member-1',
        canceled_source: 'calymob',
        canceled_app_version: '1.21.0+204',
      }),
    );
    const memberPatch = transaction.update.mock.calls.find(([ref]) => ref.id === 'member')[1];
    expect(memberPatch).not.toHaveProperty('paye');
    expect(memberPatch).not.toHaveProperty('transaction_id');
    expect(transaction.update.mock.calls.filter(([, update]) => update.waitlist_promoted_at))
      .toHaveLength(3);
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
      data: { clubId: 'calypso', operationId: 'event-1', inscriptionId: 'member' },
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
      data: {
        clubId: 'calypso',
        operationId: 'event-1',
        inscriptionId: 'member',
        guestAction: 'transfer',
      },
    });

    expect(result.promoted).toEqual(['wait-1']);
    const transaction = db.transactions[0];
    expect(transaction.delete).not.toHaveBeenCalled();
    expect(transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'member' }),
      expect.objectContaining({ registration_status: 'canceled' }),
    );
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

  test('lets an admin cancel another registration while preserving its payment data', async () => {
    const docs = [
      makeDoc('paid-member', {
        membre_id: 'member-2',
        registration_status: 'confirmed',
        paye: true,
        transaction_id: 'transaction-1',
      }),
    ];
    const { db } = setupDb([docs], 'admin', {
      registration_deadline: new Date('2026-08-11T10:00:00Z'),
    });

    const result = await unregisterFromEvent({
      auth: { uid: 'admin-1' },
      data: {
        clubId: 'calypso',
        operationId: 'event-1',
        inscriptionId: 'paid-member',
        source: 'calycompta',
        reason: 'admin_cancellation',
      },
    });

    expect(result.status).toBe('canceled');
    const transaction = db.transactions[0];
    expect(transaction.delete).not.toHaveBeenCalled();
    const patch = transaction.update.mock.calls.find(([ref]) => ref.id === 'paid-member')[1];
    expect(patch).toEqual(expect.objectContaining({
      registration_status: 'canceled',
      canceled_by: 'admin-1',
      canceled_source: 'calycompta',
    }));
    expect(patch).not.toHaveProperty('paye');
    expect(patch).not.toHaveProperty('transaction_id');
  });

  test('blocks a member after the explicit registration deadline', async () => {
    const docs = [makeDoc('member', {
      membre_id: 'member-1',
      registration_status: 'confirmed',
    })];
    setupDb([docs], 'membre', {
      registration_deadline: new Date('2026-08-12T09:59:59Z'),
    });

    await expect(unregisterFromEvent({
      auth: { uid: 'member-1' },
      data: {
        clubId: 'calypso',
        operationId: 'event-1',
        inscriptionId: 'member',
      },
    })).rejects.toMatchObject({
      code: 'failed-precondition',
      message: 'La date limite de désinscription est dépassée. Contactez l’organisateur.',
    });
  });

  test('blocks a member after the date-based fallback deadline', async () => {
    const docs = [makeDoc('member', {
      membre_id: 'member-1',
      registration_status: 'confirmed',
    })];
    setupDb([docs], 'membre', {
      date_debut: new Date('2026-08-13T09:00:00Z'),
    });

    await expect(unregisterFromEvent({
      auth: { uid: 'member-1' },
      data: {
        clubId: 'calypso',
        operationId: 'event-1',
        inscriptionId: 'member',
      },
    })).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  test('blocks a member-owned guest after the deadline', async () => {
    const docs = [makeDoc('guest', {
      is_guest: true,
      added_by: 'member-1',
      registration_status: 'confirmed',
    })];
    setupDb([docs], 'membre', {
      registration_deadline: new Date('2026-08-11T10:00:00Z'),
    });

    await expect(unregisterFromEvent({
      auth: { uid: 'member-1' },
      data: {
        clubId: 'calypso',
        operationId: 'event-1',
        inscriptionId: 'guest',
      },
    })).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  test('lets a waitlisted member leave after the deadline', async () => {
    const docs = [makeDoc('waitlisted-member', {
      membre_id: 'member-1',
      registration_status: 'waitlisted',
    })];
    const { db } = setupDb([docs], 'membre', {
      registration_deadline: new Date('2026-08-11T10:00:00Z'),
    });

    const result = await unregisterFromEvent({
      auth: { uid: 'member-1' },
      data: {
        clubId: 'calypso',
        operationId: 'event-1',
        inscriptionId: 'waitlisted-member',
      },
    });

    expect(result).toEqual({ status: 'canceled', promoted: [] });
    expect(db.transactions[0].update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'waitlisted-member' }),
      expect.objectContaining({ registration_status: 'canceled' }),
    );
  });

  test('cancels only the exact visible registration when the member has two active records', async () => {
    const memberId = 'member-1';
    const historicalId = 'historical-registration';
    const visibleId = 'visible-active-registration';
    const docs = [
      makeDoc(historicalId, {
        membre_id: memberId,
        registration_status: 'confirmed',
        date_inscription: new Date('2026-01-01T10:00:00Z'),
      }),
      makeDoc(visibleId, {
        membre_id: memberId,
        registration_status: 'confirmed',
        date_inscription: new Date('2026-09-01T10:00:00Z'),
      }),
    ];
    const { db } = setupDb([docs]);

    const result = await unregisterFromEvent({
      auth: { uid: memberId },
      data: {
        clubId: 'calypso',
        operationId: 'event-1',
        inscriptionId: visibleId,
        source: 'calymob',
      },
    });

    expect(result.status).toBe('canceled');
    const canceledIds = db.transactions[0].update.mock.calls
      .filter(([, update]) => update.registration_status === 'canceled')
      .map(([ref]) => ref.id);
    expect(canceledIds).toEqual([visibleId]);
    expect(canceledIds).not.toContain(historicalId);
  });

  test('blocks a member from cancelling somebody else', async () => {
    const docs = [makeDoc('other', { membre_id: 'member-2', registration_status: 'confirmed' })];
    setupDb([docs]);

    await expect(unregisterFromEvent({
      auth: { uid: 'member-1' },
      data: { clubId: 'calypso', operationId: 'event-1', inscriptionId: 'other' },
    })).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
