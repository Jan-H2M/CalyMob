/**
 * Complete, append-only audit trail for event registrations.
 *
 * Every create, update, cancellation and unexpected hard delete is recorded in
 * clubs/{clubId}/operations/{operationId}/inscription_logs. New cancellation
 * flows keep the registration document and set registration_status=canceled;
 * a hard delete is still logged as a security incident so it can never vanish
 * silently.
 */

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

const IGNORED_DIFF_FIELDS = new Set(['updated_at', 'last_action_at']);

function comparable(value) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.path === 'string') return value.path;
  if (Array.isArray(value)) return value.map(comparable);
  if (typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = comparable(value[key]);
      return result;
    }, {});
  }
  return value;
}

function changedFields(before = {}, after = {}) {
  const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...fields]
    .filter(field => !IGNORED_DIFF_FIELDS.has(field))
    .filter(field => JSON.stringify(comparable(before[field])) !== JSON.stringify(comparable(after[field])))
    .sort();
}

function classifyEvent(before, after) {
  if (!after) return 'hard_deleted';
  if (!before) {
    if (after.historical_reconstructed === true || after.last_action === 'historical_restored') {
      return 'historical_restored';
    }
    return after.registration_status === 'waitlisted' ? 'waitlisted' : 'registered';
  }
  if (before.registration_status !== 'canceled' && after.registration_status === 'canceled') {
    return after.last_action === 'left_waitlist' ? 'left_waitlist' : 'unregistered';
  }
  if (before.registration_status === 'canceled' && after.registration_status !== 'canceled') {
    return 're_registered';
  }
  if (before.registration_status === 'waitlisted' && after.registration_status !== 'waitlisted') {
    return 'waitlist_promoted';
  }
  return 'updated';
}

function actorMetadata(before, after, auditEvent) {
  if (auditEvent === 'hard_deleted') {
    return {
      actor_uid: null,
      actor_name: null,
      actor_role: null,
      source: 'unattributed_direct_delete',
      app_version: null,
      reason: 'unexpected_hard_delete',
    };
  }

  const current = after || before || {};
  const isCreate = !before && Boolean(after);
  const hasFreshActionStamp = isCreate || (
    comparable(before?.last_action_at) !== comparable(after?.last_action_at)
    || before?.last_action_by !== after?.last_action_by
    || before?.last_action_source !== after?.last_action_source
  );
  if (!hasFreshActionStamp) {
    return {
      actor_uid: null,
      actor_name: null,
      actor_role: null,
      source: 'unattributed_update',
      app_version: null,
      reason: 'missing_fresh_action_metadata',
    };
  }
  return {
    actor_uid: current.last_action_by ?? current.created_by ?? current.membre_id ?? null,
    actor_name: current.last_action_by_name ?? current.created_by_name ?? null,
    actor_role: current.last_action_by_role ?? null,
    source: current.last_action_source ?? current.created_source ?? (isCreate ? 'legacy_client' : 'unknown'),
    app_version: current.last_action_app_version ?? current.created_app_version ?? null,
    reason: current.last_action_reason ?? current.canceled_reason ?? null,
  };
}

function subjectFields(before, after) {
  const current = after || before || {};
  return {
    is_guest: current.is_guest ?? null,
    parent_inscription_id: current.parent_inscription_id ?? null,
    membre_id: current.membre_id ?? null,
    membre_nom: current.membre_nom ?? current.nom ?? '',
    membre_prenom: current.membre_prenom ?? current.prenom ?? '',
    registration_status_from: before ? before.registration_status ?? null : null,
    registration_status_to: after ? after.registration_status ?? null : null,
    paye_from: before ? before.paye ?? null : null,
    paye_to: after ? after.paye ?? null : null,
    transaction_id_from: before ? before.transaction_id ?? null : null,
    transaction_id_to: after ? after.transaction_id ?? null : null,
    prix_from: before ? before.prix ?? null : null,
    prix_to: after ? after.prix ?? null : null,
    date_inscription: current.date_inscription ?? null,
  };
}

const onInscriptionChangeAudit = onDocumentWritten(
  {
    document: 'clubs/{clubId}/operations/{operationId}/inscriptions/{inscriptionId}',
    region: 'europe-west1',
  },
  async (event) => {
    const { clubId, operationId, inscriptionId } = event.params;
    const beforeSnap = event.data && event.data.before;
    const afterSnap = event.data && event.data.after;
    const before = beforeSnap && beforeSnap.exists ? beforeSnap.data() : null;
    const after = afterSnap && afterSnap.exists ? afterSnap.data() : null;
    const auditEvent = classifyEvent(before, after);
    const logRef = admin.firestore()
      .collection('clubs').doc(clubId)
      .collection('operations').doc(operationId)
      .collection('inscription_logs');

    const logEntry = {
      operation_id: operationId,
      inscription_id: inscriptionId,
      event: auditEvent,
      hard_delete: auditEvent === 'hard_deleted',
      ...subjectFields(before, after),
      ...actorMetadata(before, after, auditEvent),
      changed_fields: changedFields(before || {}, after || {}),
      snapshot_before: before,
      snapshot_after: after,
      event_id: event.id || null,
      event_time: event.time ? admin.firestore.Timestamp.fromDate(new Date(event.time)) : null,
      action_at: after?.last_action_at || null,
      at: event.time
        ? admin.firestore.Timestamp.fromDate(new Date(event.time))
        : admin.firestore.FieldValue.serverTimestamp(),
    };

    try {
      await logRef.add(logEntry);
      const person = `${logEntry.membre_prenom || ''} ${logEntry.membre_nom || ''}`.trim() || inscriptionId;
      console.log(`[inscriptionLog] ${auditEvent} — ${person} (${operationId})`);
    } catch (error) {
      console.error('[inscriptionLog] audit write failed', {
        clubId,
        operationId,
        inscriptionId,
        auditEvent,
        error,
      });
      throw error;
    }
    return null;
  },
);

module.exports = {
  actorMetadata,
  changedFields,
  classifyEvent,
  onInscriptionChangeAudit,
  subjectFields,
};
