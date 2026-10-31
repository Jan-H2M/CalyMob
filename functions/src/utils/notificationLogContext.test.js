const { notificationLog, withPrivateNotificationLogs } = require('./notificationLogContext');
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
