const {
  isEligibleEventMessageRegistration,
  shouldNotifyForOperation,
} = require('./eventMessageAudience');

describe('event message notification audience', () => {
  test.each(['confirmed', 'pending_payment'])(
    'includes %s registrations',
    (registrationStatus) => {
      expect(isEligibleEventMessageRegistration({ registration_status: registrationStatus })).toBe(true);
    },
  );

  test('includes legacy registrations without an explicit status', () => {
    expect(isEligibleEventMessageRegistration({})).toBe(true);
  });

  test.each(['canceled', 'waitlisted', 'withdrawn'])(
    'excludes %s registrations retained for audit',
    (registrationStatus) => {
      expect(isEligibleEventMessageRegistration({ registration_status: registrationStatus })).toBe(false);
    },
  );

  test('suppresses notifications for operations removed from CalyMob', () => {
    const event = { type: 'evenement', statut: 'ouvert' };
    expect(shouldNotifyForOperation({ ...event, statut: 'supprime' })).toBe(false);
    expect(shouldNotifyForOperation({ ...event, statut: ' Supprimé ' })).toBe(false);
    expect(shouldNotifyForOperation({ ...event, deleted_at: new Date() })).toBe(false);
    expect(shouldNotifyForOperation({ ...event, statut: 'annule' })).toBe(true);
    expect(shouldNotifyForOperation(event)).toBe(true);
    expect(shouldNotifyForOperation({ ...event, statut: 'brouillon' })).toBe(false);
    expect(shouldNotifyForOperation({ ...event, type: 'cotisation' })).toBe(false);
    expect(shouldNotifyForOperation({ ...event, event_category: 'piscine' })).toBe(false);
    expect(shouldNotifyForOperation({ ...event, categorie: ' PiScInE ' })).toBe(false);
  });
});
