jest.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_options, handler) => handler }));
jest.mock('firebase-functions', () => ({ logger: { info: jest.fn(), warn: jest.fn() } }));
jest.mock('firebase-admin', () => ({ firestore: jest.fn() }));
jest.mock('../utils/badge-helper', () => ({
  collectTokensAndMembers: jest.fn(),
  sendNotificationsWithBadge: jest.fn(),
}));

const { _test } = require('./birthdayNotification');

describe('birthdayNotification helpers', () => {
  test('recognises both supported birth date fields', () => {
    const now = new Date('2026-08-07T05:00:00Z');
    expect(_test.hasBirthdayToday({ date_naissance: new Date('1980-08-07T00:00:00Z') }, now)).toBe(true);
    expect(_test.hasBirthdayToday({ birth_date: new Date('1990-08-07T00:00:00Z') }, now)).toBe(true);
    expect(_test.hasBirthdayToday({ birth_date: new Date('1990-08-08T00:00:00Z') }, now)).toBe(false);
  });

  test('only treats explicit active statuses as active', () => {
    expect(_test.isActiveMember({ member_status: 'active' })).toBe(true);
    expect(_test.isActiveMember({ status: 'ACTIVE' })).toBe(true);
    expect(_test.isActiveMember({ member_status: 'inactive' })).toBe(false);
  });

  test('builds the approved single and multiple birthday texts', () => {
    expect(_test.buildBirthdayMessage(['Marie'])).toEqual({
      title: '🎂 Joyeux anniversaire à Marie !',
      body: 'Toute la famille Calypso lui souhaite une merveilleuse journée ! 🥳',
    });
    expect(_test.buildBirthdayMessage(['Marie', 'Jean'])).toEqual({
      title: '🎂 Joyeux anniversaire !',
      body: 'Aujourd’hui, nous fêtons Marie et Jean. Toute la famille Calypso leur souhaite une merveilleuse journée ! 🥳',
    });
  });
});
