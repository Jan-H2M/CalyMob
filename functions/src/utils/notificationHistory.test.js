jest.mock('firebase-admin', () => ({
  firestore: Object.assign(jest.fn(), {
    FieldValue: { serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP') },
  }),
}));

const { buildNotificationHistoryRecord } = require('./notificationHistory');

describe('buildNotificationHistoryRecord', () => {
  it('stores the visible push content and a string-only deep-link payload', () => {
    const record = buildNotificationHistoryRecord({
      notification: { title: 'Nouveau message', body: 'Bonjour' },
      data: {
        type: 'team_message',
        channel_id: 'team-1',
        task_count: 2,
        ignored: null,
      },
    }, 'team_messages');

    expect(record).toEqual({
      title: 'Nouveau message',
      body: 'Bonjour',
      type: 'team_message',
      category: 'Conversation',
      data: {
        type: 'team_message',
        channel_id: 'team-1',
        task_count: '2',
      },
      created_at: 'SERVER_TIMESTAMP',
      read: false,
      read_at: null,
    });
  });

  it('uses the delivery category for an unknown notification type', () => {
    const record = buildNotificationHistoryRecord({
      notification: { title: 'Autre', body: 'Message' },
      data: { type: 'future_type' },
    }, 'Boutique');

    expect(record.category).toBe('Boutique');
  });
});

describe('buildBugResolutionHistoryRecord', () => {
  const { buildBugResolutionHistoryRecord } = require('./notificationHistory');

  it('shows the reporter what was corrected before asking for a test', () => {
    const record = buildBugResolutionHistoryRecord({
      reportId: 'report-1',
      feedbackId: 'resolution_report-1',
      title: 'Boutons décalés',
      reporterFirstName: 'Marc',
      explanation: ' Les boutons de l’accueil sont de nouveau alignés. ',
    });
    expect(record.title).toBe('Signalement Boutons décalés');
    expect(record.body).toBe([
      'Bonjour Marc, votre signalement est résolu.',
      'Les boutons de l’accueil sont de nouveau alignés.',
      'Pouvez-vous tester et nous dire si tout fonctionne ?',
    ].join('\n\n'));
    expect(record.data).toEqual({
      type: 'bug_report_resolution',
      report_id: 'report-1',
      resolution_feedback_id: 'resolution_report-1',
    });
    expect(record.read).toBe(false);
  });
});
