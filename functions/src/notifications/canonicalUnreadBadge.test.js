const fs = require('fs');
const path = require('path');
const {
  eventUnreadUntil, isUnreadEligibleEvent, isCountableRegistration, readStateSessionScopeId,
} = require('./canonicalUnreadBadge');

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../test/fixtures/unread_contract_v1.json')));

describe('canonical unread contract v1', () => {
  test('uses a seven Brussels calendar-day event window across DST', () => {
    const event = { date_fin: new Date(fixture.eventExpiry.dateFin) };
    expect(isUnreadEligibleEvent(event, new Date(fixture.eventExpiry.withinGrace))).toBe(true);
    expect(isUnreadEligibleEvent(event, new Date(fixture.eventExpiry.afterGrace))).toBe(false);
    expect(eventUnreadUntil(event.date_fin)).toBeInstanceOf(Date);
  });

  test('excludes canceled, waitlisted and withdrawn registrations', () => {
    expect(isCountableRegistration({ registration_status: 'active' })).toBe(true);
    ['canceled', 'waitlisted', 'withdrawn'].forEach((status) => {
      expect(isCountableRegistration({ registration_status: status })).toBe(false);
    });
  });

  test('shares the deterministic session scope contract with Dart', () => {
    expect(readStateSessionScopeId('session-1', 'niveau', 'P2')).toBe(fixture.sessionScope);
  });
});
