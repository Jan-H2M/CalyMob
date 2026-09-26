const { MemoryTimestamp } = require('../../test-utils/memoryFirestore');
const {
  prepareNotificationUnreadTimestamp,
} = require('./notificationUnreadTimestamp');

test('transient stamp failure never loses notification delivery authority', async () => {
  const trusted = new MemoryTimestamp(10, 123_000_900);
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  const result = await prepareNotificationUnreadTimestamp({
    snapshot: { createTime: trusted, ref: { path: 'clubs/c/messages/m' } },
    stamp: async () => { throw new Error('transient write failure'); },
    label: 'event_message',
  });
  expect(result).toBe(trusted);
  expect(log).toHaveBeenCalledWith(
    expect.stringContaining('notification_unread_timestamp_deferred'),
  );
  log.mockRestore();
});

test('successful stamp uses the exact snapshot createTime', async () => {
  const trusted = new MemoryTimestamp(10, 123_000_901);
  let calls = 0;
  await expect(prepareNotificationUnreadTimestamp({
    snapshot: { createTime: trusted, ref: { path: 'clubs/c/messages/m' } },
    stamp: async () => { calls += 1; },
    label: 'team_message',
  })).resolves.toBe(trusted);
  expect(calls).toBe(1);
});
