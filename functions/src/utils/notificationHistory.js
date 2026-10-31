const admin = require('firebase-admin');
const { notificationLog } = require('./notificationLogContext');

const CATEGORY_BY_TYPE = {
  announcement: 'Annonce',
  announcement_reply: 'Annonce',
  event_message: 'Conversation',
  team_message: 'Conversation',
  session_message: 'Conversation',
  new_operation: 'Activité',
  event_waitlist_promoted: 'Activité',
  session_reminder: 'Activité',
  piscine_task_assigned: 'Action',
  exercice_declared: 'Action',
  exercice_digest: 'Action',
  formation_reminder: 'Action',
  claim_rejected: 'Action',
  logbook_dive_confirmation: 'Action',
  logbook_dive_confirmation_result: 'Action',
  medical_certificate: 'Médical',
  bug_report_resolution: 'Signalement',
  birthday: 'Profil',
};

function stringPayload(data = {}) {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)]),
  );
}

function buildNotificationHistoryRecord(basePayload, category) {
  const notification = basePayload?.notification || {};
  const data = stringPayload(basePayload?.data || {});
  const type = data.type || 'unknown';
  return {
    title: String(notification.title || ''),
    body: String(notification.body || ''),
    type,
    category: CATEGORY_BY_TYPE[type] || category || 'Notification',
    data,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    read: false,
    read_at: null,
  };
}

function buildBugResolutionHistoryRecord({ reportId, feedbackId, title, reporterFirstName }) {
  return {
    title: `Signalement ${title}`,
    body: `Bonjour ${reporterFirstName || ''}, votre signalement est résolu. Pouvez-vous tester et nous dire si tout fonctionne ?`.trim(),
    type: 'bug_report_resolution',
    category: 'Signalement',
    data: stringPayload({
      type: 'bug_report_resolution',
      report_id: reportId,
      resolution_feedback_id: feedbackId,
    }),
    // This explicit bit makes this new persisted notification independent of
    // older notification-history records, which remain display-only history.
    counts_toward_unread_badge: true,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    read: false,
    read_at: null,
  };
}

async function persistNotificationHistory(
  clubId,
  memberId,
  basePayload,
  category,
) {
  try {
    await admin.firestore()
      .collection('clubs')
      .doc(clubId)
      .collection('members')
      .doc(memberId)
      .collection('notifications')
      .add(buildNotificationHistoryRecord(basePayload, category));
    return true;
  } catch (error) {
    // History must never turn a successfully delivered push into a failed send.
    notificationLog.error(
      `Notification history write failed for ${memberId}: ${error.message}`,
    );
    return false;
  }
}

module.exports = {
  buildNotificationHistoryRecord,
  buildBugResolutionHistoryRecord,
  persistNotificationHistory,
};
