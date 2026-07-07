/**
 * Cloud Function — Carnet de Formation (WP-11, objectifs de l'élève / SP2).
 *
 * Trigger : `clubs/{clubId}/members/{memberId}` onUpdate.
 *
 * Quand un élève change son brevet visé (`target_formation_level`) — modifiable
 * par l'élève lui-même depuis « Mes objectifs » (D12) — on notifie le chef
 * d'école via une `formation_task` de type `manual_reminder`, pour qu'il puisse
 * annuler si nécessaire. Le champ `target_formation_level` reste le champ
 * moteur existant (prefill piscine, etc.) — on ne le duplique pas.
 *
 * Idempotent : on ne crée pas de doublon pour le même (membre, nouveau niveau)
 * tant qu'une tâche ouverte existe. Ne journalise que les changements réels.
 *
 * Spec : CARNET_PLONGEE_SPEC.md §WP-11 (D12).
 */

const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

const FUNCTION_NAME = 'onTargetLevelChanged';
const FUNCTION_REGION = 'europe-west1';

async function findChefEcoleId(clubRef) {
  try {
    const snap = await clubRef
      .collection('members')
      .where('app_role', 'in', ['admin', 'superadmin'])
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(1)
      .get();
    if (!snap.empty) return snap.docs[0].id;
  } catch (err) {
    console.warn(`[${FUNCTION_NAME}] admin lookup failed: ${err.message}`);
  }
  return '';
}

async function handleTargetLevelChanged(event) {
  const { clubId, memberId } = event.params;
  const before = event.data && event.data.before && event.data.before.data();
  const after = event.data && event.data.after && event.data.after.data();
  if (!before || !after) return;

  const oldLevel = (before.target_formation_level || '').toString().trim();
  const newLevel = (after.target_formation_level || '').toString().trim();
  if (oldLevel === newLevel) return;
  if (!newLevel) return; // effacer l'objectif ne déclenche pas de notification

  const db = admin.firestore();
  const clubRef = db.collection('clubs').doc(clubId);

  // Idempotence : pas de doublon pour le même (membre, nouveau niveau).
  const existing = await clubRef
    .collection('formation_tasks')
    .where('context.reason', '==', 'target_level_changed')
    .where('context.target_member', '==', memberId)
    .where('context.target_new_level', '==', newLevel)
    .where('status', '==', 'open')
    .limit(1)
    .get();
  if (!existing.empty) {
    console.log(
      `[${FUNCTION_NAME}] skip ${memberId} → ${newLevel} — tâche déjà ouverte (${existing.docs[0].id})`,
    );
    return;
  }

  const memberName =
    `${after.prenom || after.firstName || ''} ${after.nom || after.lastName || ''}`.trim() ||
    'Membre';
  const assigneeId = await findChefEcoleId(clubRef);

  const taskRef = clubRef.collection('formation_tasks').doc();
  await taskRef.set({
    type: 'manual_reminder',
    status: 'open',
    priority: 'normal',
    title: `Brevet visé modifié : ${memberName} → ${newLevel}`,
    member_id: memberId,
    member_name: memberName,
    current_assignee_id: assigneeId,
    current_assignee_type: 'admin',
    context: {
      reason: 'target_level_changed',
      target_member: memberId,
      target_old_level: oldLevel || null,
      target_new_level: newLevel,
    },
    available_actions: [
      { key: 'open', label: 'Voir la fiche', target_screen: 'student_360' },
    ],
    notification_state: { reminder_count: 0 },
    created_by: 'system',
    created_by_name: FUNCTION_NAME,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  console.log(
    `[${FUNCTION_NAME}] member ${memberId}: brevet visé ${oldLevel || '—'} → ${newLevel} ` +
      `notifié au chef d'école (${assigneeId || 'non assigné'}, tâche ${taskRef.id})`,
  );
}

const onTargetLevelChanged = onDocumentUpdated(
  {
    region: FUNCTION_REGION,
    document: 'clubs/{clubId}/members/{memberId}',
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  handleTargetLevelChanged,
);

module.exports = {
  onTargetLevelChanged,
  handleTargetLevelChanged,
};
