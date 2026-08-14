jest.mock('firebase-functions/v2/https', () => ({
  onCall: (_options, handler) => handler,
  HttpsError: class HttpsError extends Error {},
}));
jest.mock('firebase-admin', () => ({ firestore: Object.assign(jest.fn(), { Timestamp: { now: jest.fn() }, FieldValue: {} }) }));

const { waitlistReason, registrationStatusAfterPromotion, canManageWaitlist } = require('./eventWaitlist');

describe('event waitlist policy', () => {
  const now = new Date('2026-08-12T10:00:00Z');
  const base = { allow_waitlist: true, statut: 'ouvert', date_debut: new Date('2026-08-14T10:00:00Z'), capacite_max: 2 };
  test('opens only when full, deadline passed or manually closed', () => {
    expect(waitlistReason(base, 2, now)).toBe('full');
    expect(waitlistReason({ ...base, registration_deadline: new Date('2026-08-11') }, 1, now)).toBe('deadline');
    expect(waitlistReason({ ...base, statut: 'ferme' }, 1, now)).toBe('closed');
    expect(waitlistReason(base, 1, now)).toBeNull();
  });
  test('keeps the default enabled for legacy events without the field', () => {
    const legacy = { ...base };
    delete legacy.allow_waitlist;
    expect(waitlistReason(legacy, 2, now)).toBe('full');
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
});
