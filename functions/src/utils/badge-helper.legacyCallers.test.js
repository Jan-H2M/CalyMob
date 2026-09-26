const fs = require('fs');
const path = require('path');

const CALLERS = [
  '../notifications/birthdayNotification.js',
  '../notifications/dailyExerciseDeclarationDigest.js',
  '../notifications/onExerciceDeclared.js',
  '../training/logbookDiveConfirmations.js',
  '../training/onClaimRejected.js',
  '../notifications/onMedicalCertStatusChange.js',
  '../notifications/sessionReminder.js',
];

describe('legacy APNs badge caller neutralization', () => {
  test.each(CALLERS)('%s routes through the cursor-aware badge bridge', (relative) => {
    const source = fs.readFileSync(path.join(__dirname, relative), 'utf8');
    expect(source).toContain('sendNotificationsWithBadge');
    expect(source).not.toContain('getBadgeCount(');
  });

  test('new-event notifications do not invent an unread discussion item', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../notifications/onNewOperation.js'),
      'utf8',
    );
    expect(source).toContain("'new_events'");
    expect(source).not.toContain('incrementUnreadCounts(');
    expect(source).toContain('sendNotificationsWithBadge');
  });
});
