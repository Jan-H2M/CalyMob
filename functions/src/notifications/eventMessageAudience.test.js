const {
  isEligibleEventMessageRegistration,
  shouldNotifyForOperation,
} = require('./eventMessageAudience');

describe('event message notification audience', () => {
  test.each(['confirmed', 'pending_payment', 'waitlisted'])(
    'includes %s registrations',
    (registrationStatus) => {
      expect(isEligibleEventMessageRegistration({ registration_status: registrationStatus })).toBe(true);
    },
  );

  test('includes legacy registrations without an explicit status', () => {
    expect(isEligibleEventMessageRegistration({})).toBe(true);
  });

  test('excludes canceled registrations retained for audit', () => {
    expect(isEligibleEventMessageRegistration({ registration_status: 'canceled' })).toBe(false);
  });

  test('suppresses notifications for operations removed from CalyMob', () => {
    expect(shouldNotifyForOperation({ statut: 'supprime' })).toBe(false);
    expect(shouldNotifyForOperation({ statut: 'annule' })).toBe(true);
    expect(shouldNotifyForOperation({ statut: 'ouvert' })).toBe(true);
  });
});
