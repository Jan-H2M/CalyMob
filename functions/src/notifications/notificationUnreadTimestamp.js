const { authoritativeCreateTime } = require('./unreadTimestampAuthority');

/**
 * Notification delivery must not be lost because the additive timestamp
 * repair write has a transient failure. The dedicated retry-enabled
 * reconciliation trigger performs that write durably; this helper lets the
 * one-shot notification path continue with the same server-owned createTime.
 */
async function prepareNotificationUnreadTimestamp({
  snapshot,
  eventTime,
  stamp,
  label,
}) {
  const authoritative = authoritativeCreateTime(snapshot, eventTime);
  try {
    await stamp();
  } catch (error) {
    console.error(JSON.stringify({
      event: 'notification_unread_timestamp_deferred',
      label,
      path: snapshot?.ref?.path || null,
      error: error.message,
    }));
  }
  return authoritative;
}

module.exports = { prepareNotificationUnreadTimestamp };
