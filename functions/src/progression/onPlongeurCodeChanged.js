/**
 * Cloud Function — Carnet de Formation (WP-08, historique de brevets PP-H)
 *
 * Trigger : `clubs/{clubId}/members/{memberId}` onUpdate.
 *
 * Journalise chaque changement de `plongeur_code` dans la sous-collection
 * `members/{memberId}/brevet_history`. Pas de reconstruction rétroactive
 * (décision D13) : on n'enregistre que les changements survenus à partir de
 * maintenant. Les dates d'homologation passées sont saisies par le membre
 * lui-même (from='self_service', côté app/web).
 *
 * Spec : CARNET_PLONGEE_SPEC.md §WP-08.
 */

const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

const FUNCTION_NAME = 'onPlongeurCodeChanged';
const FUNCTION_REGION = 'europe-west1';

async function handlePlongeurCodeChanged(event) {
  const { clubId, memberId } = event.params;
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after) return;

  const oldCode = before.plongeur_code || null;
  const newCode = after.plongeur_code || null;
  if (oldCode === newCode) return;
  if (!newCode) return; // clearing the code is not a brevet acquisition

  const db = admin.firestore();
  const historyRef = db
    .collection('clubs')
    .doc(clubId)
    .collection('members')
    .doc(memberId)
    .collection('brevet_history')
    .doc();

  await historyRef.set({
    level: newCode,
    previous_level: oldCode,
    from: 'plongeur_code_change',
    effective_date: FieldValue.serverTimestamp(),
    recorded_at: FieldValue.serverTimestamp(),
    recorded_by: 'system',
  });

  console.log(
    `[${FUNCTION_NAME}] member ${memberId}: ${oldCode || '—'} → ${newCode} journalisé (${historyRef.id})`,
  );
}

const onPlongeurCodeChanged = onDocumentUpdated(
  {
    region: FUNCTION_REGION,
    document: 'clubs/{clubId}/members/{memberId}',
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  handlePlongeurCodeChanged,
);

module.exports = {
  onPlongeurCodeChanged,
  handlePlongeurCodeChanged,
};
