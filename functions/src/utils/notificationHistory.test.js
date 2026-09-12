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
