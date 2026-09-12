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

const {
  isDueForReminder,
  buildReminderPayload,
  buildReminderNotification,
  reminderRecipientId,
  groupTasksByReminderRecipient,
  processDueTaskReminders,
} = require('./processFormationTaskReminders');

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

describe('notification deep-link payload', () => {
  test('one task carries an explicit stable route and task id', () => {
    expect(buildReminderPayload('calypso', [{ id: 'task-1' }])).toEqual({
      type: 'formation_reminder',
      club_id: 'calypso',
      task_count: '1',
      deeplink: 'formation_task:task-1',
      formation_task_id: 'task-1',
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
    });
  });

  test('an event/manual digest routes to their shared Actions home', () => {
    expect(buildReminderPayload('calypso', [
      { id: 'event-1', type: 'event_preparation' },
      { id: 'manual-1', type: 'manual_reminder' },
    ])).toEqual({
      type: 'formation_reminder',
      club_id: 'calypso',
      task_count: '2',
      deeplink: 'actions:evaluations',
      target_tab: 'actions_evaluations',
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
    });
  });
});

describe('notification wording', () => {
  test('one task keeps its exact title', () => {
    expect(buildReminderNotification([{ title: 'Valider la palanquée' }])).toEqual({
      title: 'Valider la palanquée',
      body: 'Ouvre Calypso pour la traiter',
    });
  });

  test('multi-task reminder avoids a misleading exact visible count', () => {
    const notification = buildReminderNotification([
      { title: 'Action A' },
      { title: 'Action B' },
    ]);

    expect(notification).toEqual({
      title: "Des actions t'attendent",
      body: "Ouvre l'onglet Actions pour les retrouver",
    });
    expect(notification.title).not.toContain('2');
  });
});

describe('authoritative reminder recipients', () => {
  test('monitor validations route to the current assignee while student tasks stay with the member', () => {
    const docs = [
      {
        id: 'monitor-task',
        ref: { id: 'monitor-task' },
        data: () => ({
          type: 'monitor_validation',
          member_id: 'student-1',
          current_assignee_id: 'monitor-1',
        }),
      },
      {
        id: 'student-task',
        ref: { id: 'student-task' },
        data: () => ({
          type: 'buddy_confirmation',
          member_id: 'student-1',
          current_assignee_id: 'someone-else',
        }),
      },
      {
        id: 'second-monitor-task',
        ref: { id: 'second-monitor-task' },
        data: () => ({
          type: 'monitor_validation',
          member_id: 'student-2',
          current_assignee_id: 'monitor-1',
        }),
      },
    ];

    const grouped = groupTasksByReminderRecipient(docs);
    expect([...grouped.keys()]).toEqual(['monitor-1', 'student-1']);
    expect(grouped.get('monitor-1').map(t => t.id)).toEqual([
      'monitor-task',
      'second-monitor-task',
    ]);
    expect(grouped.get('student-1').map(t => t.id)).toEqual(['student-task']);
    expect(reminderRecipientId({
      type: 'monitor_validation', member_id: 'student', current_assignee_id: '',
    })).toBe('');
  });

  test('tokens, history and daily stamp all use the authoritative mixed recipients', async () => {
    const monitorRef = {
      get: jest.fn(async () => ({
        exists: true,
        data: () => ({ fcm_tokens: ['monitor-token'] }),
      })),
      update: jest.fn(async () => undefined),
    };
    const studentRef = {
      get: jest.fn(async () => ({
        exists: true,
        data: () => ({ fcm_tokens: ['student-token'] }),
      })),
      update: jest.fn(async () => undefined),
    };
    const db = {
      collection: jest.fn(() => ({
        doc: () => ({
          collection: () => ({
            doc: id => (id === 'monitor-1' ? monitorRef : studentRef),
          }),
        }),
      })),
    };
    const monitorTaskRef = { update: jest.fn(async () => undefined) };
    const studentTaskRef = { update: jest.fn(async () => undefined) };
    const taskDocs = [
      {
        id: 'monitor-task',
        ref: monitorTaskRef,
        data: () => ({
          type: 'monitor_validation', member_id: 'student-1',
          current_assignee_id: 'monitor-1',
          title: 'Évaluer Sam',
          created_at: { toMillis: () => now - 4 * DAY },
          notification_state: { reminder_count: 0 },
        }),
      },
      {
        id: 'student-task',
        ref: studentTaskRef,
        data: () => ({
          type: 'buddy_confirmation', member_id: 'student-1',
          current_assignee_id: 'student-1',
          title: 'Confirmer la plongée',
          created_at: { toMillis: () => now - DAY },
          notification_state: { reminder_count: 0 },
        }),
      },
    ];
    const messaging = {
      sendEachForMulticast: jest.fn(async () => ({ successCount: 1 })),
    };
    const persistHistory = jest.fn(async () => undefined);

    await expect(processDueTaskReminders({
      db, clubId: 'calypso', taskDocs, now, messaging, persistHistory,
    })).resolves.toEqual({ sent: 2 });

    expect(messaging.sendEachForMulticast.mock.calls.map(([payload]) => payload.tokens))
      .toEqual([['monitor-token'], ['student-token']]);
    expect(persistHistory.mock.calls.map(call => call[1]))
      .toEqual(['monitor-1', 'student-1']);
    expect(monitorRef.update).toHaveBeenCalledWith({ last_formation_push_at: 'ts' });
    expect(studentRef.update).toHaveBeenCalledWith({ last_formation_push_at: 'ts' });
    expect(monitorTaskRef.update).toHaveBeenCalled();
    expect(studentTaskRef.update).toHaveBeenCalled();
  });

  test('the monitor daily cap cannot consume or inspect the student cap', async () => {
    const monitorRef = {
      get: jest.fn(async () => ({
        exists: true,
        data: () => ({
          fcm_tokens: ['monitor-token'],
          last_formation_push_at: { toMillis: () => now - 60 * 60 * 1000 },
        }),
      })),
      update: jest.fn(async () => undefined),
    };
    const taskRef = { update: jest.fn(async () => undefined) };
    const db = {
      collection: () => ({
        doc: () => ({ collection: () => ({ doc: () => monitorRef }) }),
      }),
    };
    const messaging = { sendEachForMulticast: jest.fn() };
    const taskDocs = [{
      id: 'monitor-task',
      ref: taskRef,
      data: () => ({
        type: 'monitor_validation', member_id: 'student-1',
        current_assignee_id: 'monitor-1',
        created_at: { toMillis: () => now - 4 * DAY },
        notification_state: { reminder_count: 0 },
      }),
    }];

    await processDueTaskReminders({
      db, clubId: 'calypso', taskDocs, now, messaging,
      persistHistory: jest.fn(),
    });
    expect(monitorRef.get).toHaveBeenCalledTimes(1);
    expect(messaging.sendEachForMulticast).not.toHaveBeenCalled();
    expect(taskRef.update).toHaveBeenCalledWith(expect.objectContaining({
      'notification_state.last_reminder_at': 'ts',
    }));
  });
});
