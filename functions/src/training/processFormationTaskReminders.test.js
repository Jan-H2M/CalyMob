/**
 * WP-17 — tests du plan de rappel SLA 14 jours (monitor_validation).
 * On teste la fonction pure isDueForReminder (jours depuis created_at).
 */

// onSchedule/admin ne sont pas appelés par isDueForReminder ; on mocke pour
// permettre le require du module sans initialiser Firebase.
jest.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: () => () => {} }));
jest.mock('firebase-admin', () => ({ firestore: () => ({}) }));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => 'ts', increment: () => 1 },
  Timestamp: {},
}));

const { isDueForReminder } = require('./processFormationTaskReminders');

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

function task(overrides = {}) {
  const ageDays = overrides.ageDays ?? 0;
  return {
    type: overrides.type ?? 'monitor_validation',
    created_at: { toMillis: () => now - ageDays * DAY },
    notification_state: {
      reminder_count: overrides.reminderCount ?? 0,
      last_reminder_at: overrides.lastReminderDaysAgo != null
        ? { toMillis: () => now - overrides.lastReminderDaysAgo * DAY }
        : undefined,
    },
  };
}

describe('WP-17 — monitor_validation reminder plan [3,8,12] / escalate 14', () => {
  test('tâche de 9 jours, 1er rappel déjà envoyé → 2e rappel dû (jalon J+8)', () => {
    expect(isDueForReminder(task({ ageDays: 9, reminderCount: 1, lastReminderDaysAgo: 6 }), now)).toBe(true);
  });

  test('pas de 2e rappel le même jour (dernier rappel il y a 2h)', () => {
    const t = task({ ageDays: 9, reminderCount: 1 });
    t.notification_state.last_reminder_at = { toMillis: () => now - 2 * 60 * 60 * 1000 };
    expect(isDueForReminder(t, now)).toBe(false);
  });

  test('tâche de 2 jours → pas encore due (jalon J+3 pas atteint)', () => {
    expect(isDueForReminder(task({ ageDays: 2, reminderCount: 0 }), now)).toBe(false);
  });

  test('tâche de 3 jours, jamais rappelée → 1er rappel dû', () => {
    expect(isDueForReminder(task({ ageDays: 3, reminderCount: 0 }), now)).toBe(true);
  });

  test('les 3 rappels envoyés → plus de rappel (escalade prend le relais)', () => {
    expect(isDueForReminder(task({ ageDays: 13, reminderCount: 3 }), now)).toBe(false);
  });
});

describe('WP-17 — types sans plan gardent la cadence générique', () => {
  test('pool_checkin jamais rappelé → dû', () => {
    expect(isDueForReminder(task({ type: 'pool_checkin', reminderCount: 0 }), now)).toBe(true);
  });
});
