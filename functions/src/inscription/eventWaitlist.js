const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');

const REGION = 'europe-west1';
const ACTIVE_STATUSES = new Set(['confirmed', 'pending_payment']);

function asDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function effectiveDeadline(operation) {
  return asDate(operation.registration_deadline)
    || (asDate(operation.date_debut)
      ? new Date(asDate(operation.date_debut).getTime() - 24 * 60 * 60 * 1000)
      : null);
}

function waitlistReason(operation, activeCount, now = new Date()) {
  const start = asDate(operation.date_debut);
  if (operation.statut === 'annule') return null;
  if (!start || now >= start) return null;
  if (operation.allow_waitlist !== true) return null;
  const capacity = Number(operation.capacite_max);
  if (Number.isFinite(capacity) && capacity > 0 && activeCount >= capacity) return 'full';
  const deadline = effectiveDeadline(operation);
  if (deadline && now > deadline) return 'deadline';
  if (operation.statut !== 'ouvert') return 'closed';
  return null;
}

function registrationStatusAfterPromotion(operation) {
  return operation.payment_required === true
    && operation.registration_confirmation_policy === 'after_payment'
    ? 'pending_payment'
    : 'confirmed';
}

function refs(clubId, operationId) {
  const operationRef = admin.firestore().doc(`clubs/${clubId}/operations/${operationId}`);
  return {
    operationRef,
    inscriptionsRef: operationRef.collection('inscriptions'),
    auditRef: operationRef.collection('waitlist_audit'),
  };
}

async function requireMember(clubId, uid) {
  const memberRef = admin.firestore().doc(`clubs/${clubId}/members/${uid}`);
  const member = await memberRef.get();
  if (!member.exists) throw new HttpsError('permission-denied', 'Membre du club requis.');
  return member;
}

function canManageWaitlist(member, uid, operation) {
  return ['admin', 'superadmin', 'validateur'].includes(member.app_role)
    || operation.organisateur_id === uid;
}

async function activeCount(transaction, inscriptionsRef) {
  const snapshot = await transaction.get(inscriptionsRef);
  return snapshot.docs.filter(doc => ACTIVE_STATUSES.has(doc.data().registration_status || 'confirmed')).length;
}

const joinEventWaitlist = onCall({ region: REGION }, async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Authentification requise.');
  const { clubId, operationId } = request.data || {};
  if (!clubId || !operationId) throw new HttpsError('invalid-argument', 'clubId et operationId requis.');

  const member = await requireMember(clubId, uid);
  const { operationRef, inscriptionsRef, auditRef } = refs(clubId, operationId);
  const waitlistRef = inscriptionsRef.doc(`waitlist_${uid}`);

  return admin.firestore().runTransaction(async transaction => {
    const operationSnap = await transaction.get(operationRef);
    if (!operationSnap.exists) throw new HttpsError('not-found', 'Événement introuvable.');
    const operation = operationSnap.data();
    const memberRegistrations = await transaction.get(inscriptionsRef.where('membre_id', '==', uid));
    const active = memberRegistrations.docs.find(doc => doc.data().registration_status !== 'canceled');
    if (active) {
      throw new HttpsError('already-exists', active.data().registration_status === 'waitlisted'
        ? 'Vous êtes déjà sur la liste d’attente.' : 'Vous êtes déjà inscrit.');
    }
    const count = await activeCount(transaction, inscriptionsRef);
    const reason = waitlistReason(operation, count);
    if (!reason) throw new HttpsError('failed-precondition', 'La liste d’attente n’est pas disponible.');

    const now = admin.firestore.Timestamp.now();
    const memberData = member.data();
    transaction.set(waitlistRef, {
      operation_id: operationId,
      operation_titre: operation.titre || '',
      membre_id: uid,
      membre_nom: memberData.nom || memberData.lastName || '',
      membre_prenom: memberData.prenom || memberData.firstName || '',
      prix: 0,
      paye: false,
      payment_status: null,
      registration_status: 'waitlisted',
      waitlist_reason: reason,
      requested_at: now,
      date_inscription: now,
      created_at: now,
      updated_at: now,
    });
    transaction.set(auditRef.doc(), { action: 'joined', membre_id: uid, inscription_id: waitlistRef.id, reason, at: now, by: uid });
    return { status: 'waitlisted', reason };
  });
});

const leaveEventWaitlist = onCall({ region: REGION }, async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Authentification requise.');
  const { clubId, operationId } = request.data || {};
  if (!clubId || !operationId) throw new HttpsError('invalid-argument', 'clubId et operationId requis.');
  await requireMember(clubId, uid);
  const { operationRef, inscriptionsRef, auditRef } = refs(clubId, operationId);
  return admin.firestore().runTransaction(async transaction => {
    const operationSnap = await transaction.get(operationRef);
    if (!operationSnap.exists) throw new HttpsError('not-found', 'Événement introuvable.');
    const matches = await transaction.get(inscriptionsRef.where('membre_id', '==', uid));
    const entry = matches.docs.find(doc => doc.data().registration_status === 'waitlisted');
    if (!entry) throw new HttpsError('not-found', 'Entrée de liste d’attente introuvable.');
    const now = admin.firestore.Timestamp.now();
    transaction.delete(entry.ref);
    transaction.set(auditRef.doc(), { action: 'left', membre_id: uid, inscription_id: entry.id, at: now, by: uid });
    return { status: 'removed' };
  });
});

async function sendPromotionNotification(clubId, operationId, operation, memberId) {
  const memberRef = admin.firestore().doc(`clubs/${clubId}/members/${memberId}`);
  const memberSnap = await memberRef.get();
  if (!memberSnap.exists) return;
  const member = memberSnap.data();
  const notification = {
    type: 'event_waitlist_promoted',
    title: 'Place disponible',
    body: `Votre inscription à « ${operation.titre || 'l’activité'} » est confirmée.`,
    operation_id: operationId,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    read: false,
  };
  await memberRef.collection('notifications').add(notification);
  if (member.notifications_enabled === false) return;
  const tokens = Array.isArray(member.fcm_tokens) ? member.fcm_tokens : [member.fcm_token].filter(Boolean);
  if (tokens.length === 0) return;
  await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title: notification.title, body: notification.body },
    data: { type: notification.type, clubId, operationId },
    apns: { payload: { aps: { sound: 'default' } } },
  });
}

const promoteEventWaitlistEntry = onCall({ region: REGION }, async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Authentification requise.');
  const { clubId, operationId, inscriptionId } = request.data || {};
  if (!clubId || !operationId || !inscriptionId) throw new HttpsError('invalid-argument', 'Paramètres incomplets.');
  const { operationRef, inscriptionsRef, auditRef } = refs(clubId, operationId);
  const organizer = await requireMember(clubId, uid);
  let notificationData;
  const result = await admin.firestore().runTransaction(async transaction => {
    const [operationSnap, entrySnap] = await Promise.all([
      transaction.get(operationRef), transaction.get(inscriptionsRef.doc(inscriptionId)),
    ]);
    if (!operationSnap.exists || !entrySnap.exists) throw new HttpsError('not-found', 'Événement ou entrée introuvable.');
    const operation = operationSnap.data();
    if (!canManageWaitlist(organizer.data(), uid, operation)) {
      throw new HttpsError('permission-denied', 'Réservé à l’organisateur ou aux administrateurs.');
    }
    if (entrySnap.data().registration_status !== 'waitlisted') throw new HttpsError('failed-precondition', 'Cette entrée n’est plus en attente.');
    if (operation.statut === 'annule' || (asDate(operation.date_debut) && new Date() >= asDate(operation.date_debut))) {
      throw new HttpsError('failed-precondition', 'Cet événement ne peut plus accepter d’inscriptions.');
    }
    const count = await activeCount(transaction, inscriptionsRef);
    const capacity = Number(operation.capacite_max);
    if (Number.isFinite(capacity) && capacity > 0 && count >= capacity) {
      throw new HttpsError('resource-exhausted', 'L’événement est toujours complet.');
    }
    const now = admin.firestore.Timestamp.now();
    const status = registrationStatusAfterPromotion(operation);
    transaction.update(entrySnap.ref, {
      registration_status: status,
      payment_status: operation.payment_required === true ? 'open' : null,
      waitlist_promoted_at: now,
      waitlist_promoted_by: uid,
      updated_at: now,
    });
    transaction.set(auditRef.doc(), { action: 'promoted', membre_id: entrySnap.data().membre_id, inscription_id: entrySnap.id, at: now, by: uid, resulting_status: status });
    notificationData = { operation, memberId: entrySnap.data().membre_id };
    return { status };
  });
  try {
    await sendPromotionNotification(clubId, operationId, notificationData.operation, notificationData.memberId);
  } catch (error) {
    console.error('Waitlist promotion notification failed', { clubId, operationId, error });
  }
  return result;
});

module.exports = {
  ACTIVE_STATUSES,
  effectiveDeadline,
  waitlistReason,
  registrationStatusAfterPromotion,
  canManageWaitlist,
  joinEventWaitlist,
  leaveEventWaitlist,
  promoteEventWaitlistEntry,
};
