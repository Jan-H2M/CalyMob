jest.mock('firebase-functions/v2/https', () => ({
  onCall: (_options, handler) => handler,
  HttpsError: class HttpsError extends Error {},
}));
jest.mock('firebase-admin', () => ({ firestore: Object.assign(jest.fn(), { Timestamp: { now: jest.fn() }, FieldValue: {} }) }));

const {
  waitlistReason,
  registrationStatusAfterPromotion,
  canManageWaitlist,
  oldestWaitlistEntry,
  promotionCandidateAfterWithdrawal,
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
});
