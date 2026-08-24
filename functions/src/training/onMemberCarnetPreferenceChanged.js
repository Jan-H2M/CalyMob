/**
 * MOB-020 — when a member turns the carnet off, close leftover invites.
 *
 * Trigger : clubs/{clubId}/members/{memberId} onUpdate
 * Only acts on a transition of `uses_carnet` to false.
 */
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { isCarnetTaskType } = require('./carnetPreference');

const FUNCTION_NAME = 'onMemberCarnetPreferenceChanged';
const FUNCTION_REGION = 'europe-west1';

async function applyCarnetOptOut(db, clubId, memberId) {
  const clubRef = db.collection('clubs').doc(clubId);
  let closedTasks = 0;
  let acceptedConfirmations = 0;

  const tasksSnap = await clubRef
    .collection('formation_tasks')
    .where('current_assignee_id', '==', memberId)
    .where('status', '==', 'open')
    .get();

  for (const doc of tasksSnap.docs) {
    if (!isCarnetTaskType(doc.data().type)) continue;
    await doc.ref.update({
      status: 'done',
      completed_at: FieldValue.serverTimestamp(),
      completed_by: memberId,
      completed_reason: 'carnet_opt_out',
      updated_at: FieldValue.serverTimestamp(),
    });
    closedTasks += 1;
  }

  const confirmSnap = await clubRef
    .collection('logbook_dive_confirmations')
    .where('target_member_id', '==', memberId)
    .where('status', '==', 'pending')
    .get();

  for (const doc of confirmSnap.docs) {
    await doc.ref.update({
      status: 'confirmed_no_import',
      auto_accepted: true,
      auto_accepted_reason: 'carnet_opt_out',
      responded_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    acceptedConfirmations += 1;
  }

  return { closedTasks, acceptedConfirmations };
}

async function handleMemberCarnetPreferenceChanged(event) {
  const { clubId, memberId } = event.params;
  const before = event.data?.before?.data() || {};
  const after = event.data?.after?.data() || {};

  const optedOutNow = after.uses_carnet === false && before.uses_carnet !== false;
  if (!optedOutNow) return { skipped: true };

  const db = admin.firestore();
  const result = await applyCarnetOptOut(db, clubId, memberId);
  console.log(
    `[${FUNCTION_NAME}] ${memberId} opted out: closed=${result.closedTasks} accepted=${result.acceptedConfirmations}`,
  );
  return result;
}

const onMemberCarnetPreferenceChanged = onDocumentUpdated(
  {
    region: FUNCTION_REGION,
    document: 'clubs/{clubId}/members/{memberId}',
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  handleMemberCarnetPreferenceChanged,
);

module.exports = {
  onMemberCarnetPreferenceChanged,
  handleMemberCarnetPreferenceChanged,
  applyCarnetOptOut,
};
