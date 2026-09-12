const admin = require('firebase-admin');

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
    console.error(
      `Notification history write failed for ${memberId}: ${error.message}`,
    );
    return false;
  }
}

module.exports = {
  buildNotificationHistoryRecord,
  persistNotificationHistory,
};
