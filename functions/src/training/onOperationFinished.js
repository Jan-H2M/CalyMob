/**
 * Cloud Function — Carnet de Formation phase 1
 *
 * Trigger : `clubs/{clubId}/operations/{operationId}` onUpdate
 *           when `status` transitions to 'terminée' / 'terminé' / 'ferme'
 *
 * Creates `logbook_completion` formation_tasks for each confirmed
 * participant of a finished sortie, pre-filled with operation context
 * and palanquée info when available.
 *
 * Trigger explosion safeguard
 *   A single operation can have 50+ participants → 50+ writes.
 *   The reminder dispatcher (processFormationTaskReminders) caps
 *   at 1 push per member per day, so even if every participant gets
 *   a task simultaneously the push volume is bounded.
 *
 * Spec : `CARNET_DE_FORMATION_TECH.md` §8.2
 */

const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

const FUNCTION_NAME = 'onOperationFinished';
const FUNCTION_REGION = 'europe-west1';

// Operation types that trigger logbook tasks. Pool sessions are excluded —
// they go through onPiscineAttendeeCreated instead (see piscine_sessions
// subcollection trigger).
const DIVE_OPERATION_TYPES = new Set([
  'sortie',
  'sortie_mer',
  'sortie_carriere',
  'sortie_lac',
  'sortie_riviere',
  'plongee',
  'evenement', // some events are dive outings
]);

// Status values that count as "finished" — different databases use different
// strings. Accept all common variants.
const FINISHED_STATUS_VALUES = new Set([
  'terminée',
  'terminé',
  'termine',
  'ferme',
  'fermée',
  'fermé',
  'finished',
  'closed',
]);

function isFinished(status) {
  if (!status) return false;
  return FINISHED_STATUS_VALUES.has(String(status).toLowerCase().trim());
}

const onOperationFinished = onDocumentUpdated(
  {
    region: FUNCTION_REGION,
    document: 'clubs/{clubId}/operations/{operationId}',
  },
  async (event) => {
    const { clubId, operationId } = event.params;
    const db = admin.firestore();

    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;

    // Only fire on a status TRANSITION to finished — not on every update of an
    // already-finished operation.
    if (isFinished(before.status || before.statut)) return;
    if (!isFinished(after.status || after.statut)) return;

    // Operation type filter — only dive outings, not cotisations, événements
    // administratifs etc. that happen to be marked finished.
    const opType = after.type || after.operation_type;
    if (!opType || !DIVE_OPERATION_TYPES.has(String(opType).toLowerCase())) {
      console.log(`[${FUNCTION_NAME}] operation ${operationId} type='${opType}' is not a dive, skipping`);
      return;
    }

    const operationTitle = after.titre || after.title || `Sortie ${operationId}`;
    const locationId = after.lieu_id || after.location_id || null;

    console.log(
      `[${FUNCTION_NAME}] operation ${operationId} (${operationTitle}) finished, creating logbook tasks`
    );

    // ---- Fetch confirmed participants ----
    const participantsSnap = await db
      .collection('clubs')
      .doc(clubId)
      .collection('participant_operation')
      .where('operation_id', '==', operationId)
      .get();

    if (participantsSnap.empty) {
      // Fall back to the legacy `inscriptions` subcollection layout
      // (clubs/{clubId}/operations/{operationId}/inscriptions/{inscriptionId})
      const legacySnap = await db
        .collection('clubs')
        .doc(clubId)
        .collection('operations')
        .doc(operationId)
        .collection('inscriptions')
        .get();
      if (legacySnap.empty) {
        console.log(`[${FUNCTION_NAME}] no participants found for ${operationId}`);
        return;
      }
      return processParticipants(db, clubId, operationId, operationTitle, locationId, legacySnap.docs);
    }

    await processParticipants(db, clubId, operationId, operationTitle, locationId, participantsSnap.docs);
  }
);

async function processParticipants(db, clubId, operationId, operationTitle, locationId, participantDocs) {
  // Pre-fetch palanquées for this operation to denormalise per-member palanquée_id.
  const palanqueesSnap = await db
    .collection('clubs')
    .doc(clubId)
    .collection('palanquees')
    .where('operation_id', '==', operationId)
    .get();

  // Build a member_id → palanquee_id index
  const palanqueeByMember = new Map();
  for (const palanqueeDoc of palanqueesSnap.docs) {
    const palanquee = palanqueeDoc.data();
    const memberIds = extractPalanqueeMemberIds(palanquee);
    for (const mid of memberIds) {
      palanqueeByMember.set(mid, palanqueeDoc.id);
    }
  }

  const batch = db.batch();
  let createdCount = 0;
  let skippedCount = 0;

  for (const partDoc of participantDocs) {
    const participant = partDoc.data();
    const memberId = participant.membre_id || participant.member_id || participant.membreId;
    if (!memberId) continue;

    // Only confirmed participants — skip declined / cancelled / on waiting list.
    const partStatus = participant.statut || participant.status || 'confirmé';
    if (!['confirmé', 'confirme', 'confirmed', 'present', 'présent'].includes(String(partStatus).toLowerCase())) {
      skippedCount += 1;
      continue;
    }

    // Filter on formation_active — same rule as onPiscineAttendeeCreated.
    const memberSnap = await db
      .collection('clubs')
      .doc(clubId)
      .collection('members')
      .doc(memberId)
      .get();
    if (!memberSnap.exists) {
      skippedCount += 1;
      continue;
    }
    const member = memberSnap.data();
    if (!member.formation_active) {
      skippedCount += 1;
      continue;
    }

    // Idempotency : skip if a logbook task already exists for this op+member.
    const existing = await db
      .collection('clubs')
      .doc(clubId)
      .collection('formation_tasks')
      .where('type', '==', 'logbook_completion')
      .where('member_id', '==', memberId)
      .where('context.operation_id', '==', operationId)
      .limit(1)
      .get();
    if (!existing.empty) {
      skippedCount += 1;
      continue;
    }

    const memberName = composeMemberName(member);
    const palanqueeId = palanqueeByMember.get(memberId) || null;

    const taskRef = db
      .collection('clubs')
      .doc(clubId)
      .collection('formation_tasks')
      .doc();

    batch.set(taskRef, {
      type: 'logbook_completion',
      title: `Carnet ${operationTitle} à compléter`,
      status: 'open',
      priority: 'normal',
      member_id: memberId,
      member_name: memberName,
      current_assignee_id: memberId,
      current_assignee_type: 'student',
      context: {
        operation_id: operationId,
        operation_title: operationTitle,
        palanquee_id: palanqueeId,
        location_id: locationId,
      },
      available_actions: [
        { key: 'complete_now', label: 'Compléter mon carnet', target_screen: 'logbook_entry' },
        { key: 'snooze', label: 'Plus tard' },
        { key: 'dismiss', label: 'Pas concerné' },
      ],
      notification_state: { reminder_count: 0 },
      created_by: 'system',
      created_by_name: FUNCTION_NAME,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    createdCount += 1;
  }

  if (createdCount > 0) await batch.commit();

  console.log(
    `[${FUNCTION_NAME}] operation ${operationId}: ${createdCount} logbook tasks created, ${skippedCount} skipped`
  );
}

function extractPalanqueeMemberIds(palanquee) {
  const ids = new Set();
  const members = palanquee.members || palanquee.membres || palanquee.plongeurs || [];
  if (Array.isArray(members)) {
    for (const m of members) {
      if (typeof m === 'string') ids.add(m);
      else if (m && (m.membre_id || m.member_id || m.id)) {
        ids.add(m.membre_id || m.member_id || m.id);
      }
    }
  }
  // Some palanquée variants index members by role (dp, sf, plongeurs[])
  for (const role of ['dp', 'sf', 'serre_file', 'directeur_palanquee']) {
    const entry = palanquee[role];
    if (entry && typeof entry === 'object' && (entry.membre_id || entry.member_id)) {
      ids.add(entry.membre_id || entry.member_id);
    } else if (typeof entry === 'string') {
      ids.add(entry);
    }
  }
  return Array.from(ids);
}

function composeMemberName(member) {
  const prenom = member.prenom || member.first_name || '';
  const nom = member.nom || member.last_name || '';
  return `${prenom} ${nom}`.trim() || member.email || 'Membre';
}

module.exports = {
  onOperationFinished,
  // Exported for unit tests
  isFinished,
  extractPalanqueeMemberIds,
};
