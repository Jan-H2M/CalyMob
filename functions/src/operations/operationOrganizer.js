const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

const REGION = 'europe-west1';
const ELEVATED_ROLES = new Set(['superadmin', 'admin', 'validateur']);
const CLIENT_OPERATION_FIELDS = new Set([
  'type', 'event_number', 'source', 'isEditable', 'titre', 'description',
  'info_document', 'montant_prevu', 'statut', 'budget_prevu_revenus',
  'budget_prevu_depenses', 'documents_justificatifs', 'categorie',
  'code_comptable', 'fiscal_year_id', 'event_category', 'date_debut',
  'date_fin', 'lieu', 'lieu_id', 'lieu_type', 'capacite_max',
  'registration_deadline', 'prix_membre', 'prix_non_membre', 'event_tariffs',
  'allow_guests', 'allow_waitlist', 'price_tbd', 'payment_plan_enabled',
  'payment_installments', 'payment_required', 'allowed_payment_methods',
  'registration_confirmation_policy', 'payment_deadline_days',
  'auto_cancel_unpaid', 'supplements', 'periode_debut', 'periode_fin',
  'tarifs', 'created_by', 'communication',
]);
const REQUIRED_CREATE_FIELDS = ['type', 'titre', 'statut'];
const NON_DELETABLE_FIELDS = new Set(['type', 'titre', 'statut']);

function cleanString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function canonicalMemberName(member) {
  const first = cleanString(member.first_name)
    || cleanString(member.firstName)
    || cleanString(member.prenom);
  const last = cleanString(member.last_name)
    || cleanString(member.lastName)
    || cleanString(member.nom);
  const constructed = [first, last].filter(Boolean).join(' ');
  if (constructed) return constructed;
  return cleanString(member.display_name) || cleanString(member.displayName);
}

function isValidDocumentId(value) {
  return typeof value === 'string'
    && value === value.trim()
    && value.length > 0
    && value.length <= 200
    && !value.includes('/');
}

function hasOrganizerBadge(member) {
  const values = Array.isArray(member.clubStatuten) ? member.clubStatuten : [];
  return values.some((value) => ['organisateur', 'o'].includes(String(value).trim().toLowerCase()));
}

function timestampMillis(value) {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return Number.NaN;
}

function hasValidSession(snapshot, now) {
  if (!snapshot.exists) return true;
  const session = snapshot.data() || {};
  return session.isActive === true
    && timestampMillis(session.expiresAt) > timestampMillis(now);
}

function decodeClientValue(value, Timestamp = admin.firestore.Timestamp) {
  if (Array.isArray(value)) return value.map((item) => decodeClientValue(item, Timestamp));
  if (!value || typeof value !== 'object') return value;
  if (Object.keys(value).length === 1 && Number.isSafeInteger(value.__timestamp_ms)) {
    return Timestamp.fromMillis(value.__timestamp_ms);
  }
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
      throw new HttpsError('invalid-argument', 'Champ imbriqué invalide.');
    }
    result[key] = decodeClientValue(item, Timestamp);
  }
  return result;
}

function sanitizeFields(fields, Timestamp) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    throw new HttpsError('invalid-argument', 'Les données de l’opération sont requises.');
  }
  const result = {};
  for (const [field, value] of Object.entries(fields)) {
    if (!CLIENT_OPERATION_FIELDS.has(field)) {
      throw new HttpsError('invalid-argument', `Champ d’opération interdit: ${field}`);
    }
    result[field] = decodeClientValue(value, Timestamp);
  }
  return result;
}

function sanitizeDeleteFields(fields) {
  if (fields === undefined) return [];
  if (!Array.isArray(fields)) {
    throw new HttpsError('invalid-argument', 'deleteFields doit être une liste.');
  }
  const unique = [...new Set(fields)];
  for (const field of unique) {
    if (!CLIENT_OPERATION_FIELDS.has(field) || NON_DELETABLE_FIELDS.has(field)) {
      throw new HttpsError('invalid-argument', `Champ impossible à supprimer: ${field}`);
    }
  }
  return unique;
}

function canCreateFor(actorId, actor, organizerId, fields) {
  if (ELEVATED_ROLES.has(actor.app_role)) return true;
  return organizerId === actorId
    && fields.type === 'evenement'
    && (actor.app_role === 'user' || hasOrganizerBadge(actor));
}

function canEditOperation(actorId, actor, operation) {
  if (ELEVATED_ROLES.has(actor.app_role)) return true;
  return operation.type === 'evenement'
    && operation.organisateur_id === actorId
    && (actor.app_role === 'user' || hasOrganizerBadge(actor));
}

function canHandoverOperation(actorId, actor, operation) {
  if (ELEVATED_ROLES.has(actor.app_role)) return true;
  return operation.type === 'evenement' && (
    operation.organisateur_id === actorId
    || (operation.creator_user_id || operation.organisateur_id) === actorId
  );
}

function canModifyFiscalYear(actor, fiscalYear) {
  if (!fiscalYear) return true;
  const status = cleanString(fiscalYear.status);
  if (status === 'open') return true;
  if (status === 'closed') return ['superadmin', 'admin'].includes(actor.app_role);
  if (status === 'permanently_closed') return actor.app_role === 'superadmin';
  return false;
}

function validateRequest(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpsError('invalid-argument', 'Requête opération invalide.');
  }
  const action = data.action;
  if (!['create', 'update', 'handover'].includes(action)) {
    throw new HttpsError('invalid-argument', 'Action opération invalide.');
  }
  if (!isValidDocumentId(data.clubId) || !isValidDocumentId(data.organizerId)) {
    throw new HttpsError('invalid-argument', 'Club ou organisateur invalide.');
  }
  if (action !== 'create' && !isValidDocumentId(data.operationId)) {
    throw new HttpsError('invalid-argument', 'Opération invalide.');
  }
  return data;
}

async function writeOperationHandler(request, dependencies = {}) {
  const actorId = request && request.auth && request.auth.uid;
  if (!actorId) throw new HttpsError('unauthenticated', 'Authentification requise.');
  const data = validateRequest(request.data);
  const db = dependencies.db || admin.firestore();
  const now = dependencies.now || new Date();
  const Timestamp = dependencies.Timestamp || admin.firestore.Timestamp;
  const serverTimestamp = dependencies.serverTimestamp
    || (() => admin.firestore.FieldValue.serverTimestamp());
  const deleteField = dependencies.deleteField
    || (() => admin.firestore.FieldValue.delete());

  const fields = data.action === 'handover' ? {} : sanitizeFields(data.fields, Timestamp);
  const requestedDeleteFields = data.action === 'handover' ? [] : sanitizeDeleteFields(data.deleteFields);
  // Web/mobile serializers use deleteFields for explicit undefined optional
  // values. On create there is no existing field to delete, so validated
  // deletion hints are intentionally ignored.
  const deleteFields = data.action === 'create' ? [] : requestedDeleteFields;
  const clubRef = db.collection('clubs').doc(data.clubId);
  const actorRef = clubRef.collection('members').doc(actorId);
  const sessionRef = clubRef.collection('sessions').doc(actorId);
  const organizerRef = clubRef.collection('members').doc(data.organizerId);
  const operationRef = data.action === 'create'
    ? clubRef.collection('operations').doc()
    : clubRef.collection('operations').doc(data.operationId);

  return db.runTransaction(async (transaction) => {
    const actorSnapshot = await transaction.get(actorRef);
    const sessionSnapshot = await transaction.get(sessionRef);
    const organizerSnapshot = actorRef.path === organizerRef.path
      ? actorSnapshot
      : await transaction.get(organizerRef);
    const operationSnapshot = data.action === 'create'
      ? null
      : await transaction.get(operationRef);

    if (!actorSnapshot.exists) throw new HttpsError('permission-denied', 'Membre appelant introuvable.');
    if (!hasValidSession(sessionSnapshot, now)) {
      throw new HttpsError('permission-denied', 'Session expirée ou inactive.');
    }
    if (!organizerSnapshot.exists) {
      throw new HttpsError('not-found', 'L’organisateur sélectionné est introuvable.');
    }
    const actor = actorSnapshot.data() || {};
    const organizerName = canonicalMemberName(organizerSnapshot.data() || {});
    if (!organizerName) {
      throw new HttpsError('failed-precondition', 'Le membre sélectionné n’a pas de nom canonique.');
    }

    if (data.action === 'create') {
      for (const field of REQUIRED_CREATE_FIELDS) {
        if (fields[field] === undefined || fields[field] === null || fields[field] === '') {
          throw new HttpsError('invalid-argument', `Champ requis manquant: ${field}`);
        }
      }
      if (!canCreateFor(actorId, actor, data.organizerId, fields)) {
        throw new HttpsError('permission-denied', 'Création pour cet organisateur interdite.');
      }
      const fiscalYearId = fields.fiscal_year_id;
      if (fiscalYearId !== undefined && fiscalYearId !== null) {
        if (!isValidDocumentId(fiscalYearId)) {
          throw new HttpsError('invalid-argument', 'Exercice fiscal invalide.');
        }
        const fiscalYearSnapshot = await transaction.get(clubRef.collection('fiscal_years').doc(fiscalYearId));
        if (!fiscalYearSnapshot.exists || !canModifyFiscalYear(actor, fiscalYearSnapshot.data() || {})) {
          throw new HttpsError('permission-denied', 'Exercice fiscal verrouillé ou introuvable.');
        }
      }
      const created = {
        ...fields,
        club_id: data.clubId,
        organisateur_id: data.organizerId,
        organisateur_nom: organizerName,
        creator_user_id: actorId,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      };
      transaction.create(operationRef, created);
      return { success: true, operationId: operationRef.id, organizerName };
    }

    if (!operationSnapshot.exists) throw new HttpsError('not-found', 'Opération introuvable.');
    const operation = operationSnapshot.data() || {};
    if (deleteFields.includes('fiscal_year_id')
      || (Object.prototype.hasOwnProperty.call(fields, 'fiscal_year_id')
        && fields.fiscal_year_id !== operation.fiscal_year_id)) {
      throw new HttpsError('invalid-argument', 'L’exercice fiscal d’une opération est immuable.');
    }
    const fiscalYearId = operation.fiscal_year_id;
    if (fiscalYearId !== undefined && fiscalYearId !== null) {
      if (!isValidDocumentId(fiscalYearId)) {
        throw new HttpsError('failed-precondition', 'Exercice fiscal existant invalide.');
      }
      const fiscalYearSnapshot = await transaction.get(clubRef.collection('fiscal_years').doc(fiscalYearId));
      if (!fiscalYearSnapshot.exists || !canModifyFiscalYear(actor, fiscalYearSnapshot.data() || {})) {
        throw new HttpsError('permission-denied', 'Exercice fiscal verrouillé ou introuvable.');
      }
    }
    const organizerChanged = data.organizerId !== operation.organisateur_id;
    if (data.action === 'handover') {
      if (!canHandoverOperation(actorId, actor, operation)) {
        throw new HttpsError('permission-denied', 'Transfert du responsable interdit.');
      }
    } else {
      if (!canEditOperation(actorId, actor, operation)) {
        throw new HttpsError('permission-denied', 'Modification de l’opération interdite.');
      }
      if (organizerChanged) {
        throw new HttpsError('invalid-argument', 'Utilisez l’action handover pour changer le responsable.');
      }
    }

    const patch = {
      ...fields,
      organisateur_id: data.organizerId,
      organisateur_nom: organizerName,
      updated_at: serverTimestamp(),
    };
    for (const field of deleteFields) patch[field] = deleteField();
    if (organizerChanged) {
      patch.organizer_last_action_by = actorId;
      patch.organizer_last_action_at = serverTimestamp();
      patch.organizer_last_action_source = cleanString(data.source) || 'server_writer';
    }
    transaction.update(operationRef, patch);
    return { success: true, operationId: operationRef.id, organizerName, handover: organizerChanged };
  });
}

function organizerAuditActor(before, after) {
  const stampChanged = before.organizer_last_action_by !== after.organizer_last_action_by
    || timestampMillis(before.organizer_last_action_at) !== timestampMillis(after.organizer_last_action_at);
  return stampChanged && cleanString(after.organizer_last_action_by)
    ? {
      actor_uid: after.organizer_last_action_by,
      source: cleanString(after.organizer_last_action_source) || 'server_writer',
    }
    : { actor_uid: null, source: 'unattributed_direct_write' };
}

async function writeIntegrityAlert(db, event, reason, operation) {
  const { clubId, operationId } = event.params;
  const alertRef = db.collection('clubs').doc(clubId)
    .collection('audit_logs').doc(`organizer-integrity-${event.id}`);
  await alertRef.set({
    action: 'operation.organizer.orphan_detected',
    userId: 'system',
    targetId: operationId,
    targetType: 'event',
    targetName: cleanString(operation.titre) || operationId,
    clubId,
    severity: 'critical',
    details: {
      reason,
      organisateur_id: cleanString(operation.organisateur_id),
      stored_name: cleanString(operation.organisateur_nom),
      event_id: event.id,
    },
    timestamp: event.time
      ? admin.firestore.Timestamp.fromDate(new Date(event.time))
      : admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: false });
}

async function operationOrganizerTriggerHandler(event, dependencies = {}) {
  const db = dependencies.db || admin.firestore();
  const afterSnapshot = event.data && event.data.after;
  if (!afterSnapshot || !afterSnapshot.exists) return null;
  const beforeSnapshot = event.data && event.data.before;
  const before = beforeSnapshot && beforeSnapshot.exists ? beforeSnapshot.data() || {} : null;
  const after = afterSnapshot.data() || {};
  const { clubId, operationId } = event.params;

  if (before && before.organisateur_id !== after.organisateur_id) {
    const actor = organizerAuditActor(before, after);
    await db.collection('clubs').doc(clubId)
      .collection('operations').doc(operationId)
      .collection('organizer_audit').doc(event.id)
      .set({
        event: 'organizer_handover',
        operation_id: operationId,
        old_organizer_id: before.organisateur_id || null,
        old_organizer_name: before.organisateur_nom || null,
        new_organizer_id: after.organisateur_id || null,
        new_organizer_name: after.organisateur_nom || null,
        actor_uid: actor.actor_uid,
        source: actor.source,
        event_id: event.id,
        at: event.time
          ? admin.firestore.Timestamp.fromDate(new Date(event.time))
          : admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: false });
  }

  const rawOrganizerId = after.organisateur_id;
  if (rawOrganizerId === undefined || rawOrganizerId === null || rawOrganizerId === '') {
    await writeIntegrityAlert(db, event, 'missing_organizer_id', after);
    return null;
  }
  if (!isValidDocumentId(rawOrganizerId)) {
    await writeIntegrityAlert(db, event, 'invalid_organizer_id', after);
    return null;
  }
  const organizerId = rawOrganizerId;
  const memberSnapshot = await db.collection('clubs').doc(clubId)
    .collection('members').doc(organizerId).get();
  if (!memberSnapshot.exists) {
    await writeIntegrityAlert(db, event, 'unknown_organizer_id', after);
    return null;
  }
  const canonicalName = canonicalMemberName(memberSnapshot.data() || {});
  if (!canonicalName) {
    await writeIntegrityAlert(db, event, 'organizer_without_canonical_name', after);
    return null;
  }
  // Re-trigger guard: the repair writes only when the stored projection is
  // different. The follow-up event sees equality and exits without writing.
  if (after.organisateur_nom === canonicalName) return null;
  await afterSnapshot.ref.update({
    organisateur_nom: canonicalName,
    organizer_identity_synced_at: admin.firestore.FieldValue.serverTimestamp(),
  });
  return null;
}

async function memberOrganizerNameTriggerHandler(event, dependencies = {}) {
  const db = dependencies.db || admin.firestore();
  const beforeSnapshot = event.data && event.data.before;
  const afterSnapshot = event.data && event.data.after;
  if (!beforeSnapshot || !beforeSnapshot.exists) return null;
  const before = beforeSnapshot.data() || {};
  const { clubId, memberId } = event.params;
  if (!afterSnapshot || !afterSnapshot.exists) {
    const operations = await db.collection('clubs').doc(clubId)
      .collection('operations').where('organisateur_id', '==', memberId).get();
    await Promise.all(operations.docs.map((operation) => writeIntegrityAlert(db, {
      ...event,
      id: `${event.id}-${operation.id}`,
      params: { clubId, operationId: operation.id },
    }, 'organizer_member_deleted', operation.data() || {})));
    return null;
  }
  const after = afterSnapshot.data() || {};
  const beforeName = canonicalMemberName(before);
  const afterName = canonicalMemberName(after);
  if (beforeName === afterName) return null;
  if (!afterName) {
    await writeIntegrityAlert(db, {
      ...event,
      params: { clubId, operationId: `member:${memberId}` },
    }, 'member_rename_without_canonical_name', { organisateur_id: memberId });
    return null;
  }
  const operations = await db.collection('clubs').doc(clubId)
    .collection('operations').where('organisateur_id', '==', memberId).get();
  const writer = db.bulkWriter();
  operations.docs.forEach((operation) => writer.update(operation.ref, {
    organisateur_nom: afterName,
    organizer_identity_synced_at: admin.firestore.FieldValue.serverTimestamp(),
  }));
  await writer.close();
  await db.collection('clubs').doc(clubId).collection('audit_logs').doc(`organizer-rename-${event.id}`).set({
    action: 'operation.organizer.rename_propagated',
    userId: memberId,
    targetId: memberId,
    targetType: 'member',
    targetName: afterName,
    clubId,
    severity: 'info',
    previousValue: beforeName,
    newValue: afterName,
    details: { operation_count: operations.size, event_id: event.id },
    timestamp: event.time
      ? admin.firestore.Timestamp.fromDate(new Date(event.time))
      : admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: false });
  return null;
}

const writeOperation = onCall({ region: REGION }, (request) => writeOperationHandler(request));
const onOperationOrganizerWritten = onDocumentWritten(
  { document: 'clubs/{clubId}/operations/{operationId}', region: REGION },
  (event) => operationOrganizerTriggerHandler(event),
);
const onMemberOrganizerNameUpdated = onDocumentWritten(
  { document: 'clubs/{clubId}/members/{memberId}', region: REGION },
  (event) => memberOrganizerNameTriggerHandler(event),
);

module.exports = {
  CLIENT_OPERATION_FIELDS,
  canonicalMemberName,
  canCreateFor,
  canEditOperation,
  canHandoverOperation,
  canModifyFiscalYear,
  decodeClientValue,
  hasOrganizerBadge,
  hasValidSession,
  memberOrganizerNameTriggerHandler,
  onMemberOrganizerNameUpdated,
  onOperationOrganizerWritten,
  operationOrganizerTriggerHandler,
  sanitizeDeleteFields,
  sanitizeFields,
  writeOperation,
  writeOperationHandler,
};
