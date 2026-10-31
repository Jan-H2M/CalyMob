const { notificationLog, withPrivateNotificationLogs } = require('./notificationLogContext');
const { getUnreadCursorV1Config } = require('../notifications/unreadCursorFeatureFlag');
const { usesUnreadTimestampV2 } = require('../notifications/unreadTimestampFeatureFlag');

test('actual timestamp authority failure does not leak private context, ordinary failure still logs', async () => {
  const db = { doc: () => ({ get: () => Promise.reject(new Error('synthetic-private-member-and-token')) }) };
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await expect(withPrivateNotificationLogs(() => usesUnreadTimestampV2(db, 'fictional', 'dev-member'))).resolves.toBe(false);
    expect(warn).not.toHaveBeenCalled();
    await expect(usesUnreadTimestampV2(db, 'fictional', 'dev-member')).resolves.toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  } finally { warn.mockRestore(); }
});

test('actual flag-reader failure is private only inside the medical context', async () => {
  const get = jest.fn().mockRejectedValue(new Error('synthetic-private-token-and-member'));
  const db = { collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({ get }) }) }) }) };
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await expect(withPrivateNotificationLogs(() => getUnreadCursorV1Config(db, 'fictional')))
      .resolves.toEqual({ known: false, data: {} });
    expect(warn).not.toHaveBeenCalled();
    await getUnreadCursorV1Config(db, 'fictional');
    expect(warn).toHaveBeenCalledTimes(1);
  } finally { warn.mockRestore(); }
});

test('privacy context suppresses helper/history diagnostics, without hiding concurrent ordinary logs', async () => {
  const spies = ['log', 'warn', 'error'].map(method => jest.spyOn(console, method).mockImplementation(() => {}));
  try {
    await Promise.all([
      withPrivateNotificationLogs(async () => {
        await Promise.resolve();
        notificationLog.log('private-member-id', 'Médical');
        notificationLog.warn('private-token');
        notificationLog.error('private-raw-error');
      }),
      (async () => { await Promise.resolve(); notificationLog.log('ordinary diagnostic'); })(),
    ]);
    expect(spies[0]).toHaveBeenCalledTimes(1);
    expect(spies[0]).toHaveBeenCalledWith('ordinary diagnostic');
    expect(spies[1]).not.toHaveBeenCalled(); expect(spies[2]).not.toHaveBeenCalled();
    notificationLog.error('ordinary after medical dispatch');
    expect(spies[2]).toHaveBeenCalledWith('ordinary after medical dispatch');
  } finally { spies.forEach(s => s.mockRestore()); }
});
