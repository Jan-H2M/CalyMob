const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');

const REGION = 'europe-west1';
const ACTIVE_STATUSES = new Set(['confirmed', 'pending_payment']);
const ELEVATED_ROLES = new Set(['admin', 'superadmin', 'validateur']);

function cleanAuditText(value, fallback = null, maxLength = 160) {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.trim().slice(0, maxLength);
  return cleaned || fallback;
}

function actorName(member, uid) {
  const firstName = cleanAuditText(member.prenom || member.firstName, '', 80);
  const lastName = cleanAuditText(member.nom || member.lastName, '', 80);
  return `${firstName} ${lastName}`.trim() || cleanAuditText(member.display_name, uid, 160);
}

function actionMetadata({ member, uid, source, appVersion, reason, action, now }) {
  return {
    last_action: action,
    last_action_at: now,
    last_action_by: uid,
    last_action_by_name: actorName(member, uid),
    last_action_by_role: cleanAuditText(member.app_role, 'member', 40),
    last_action_source: cleanAuditText(source, 'unknown', 40),
    last_action_app_version: cleanAuditText(appVersion, null, 40),
    last_action_reason: cleanAuditText(reason, null, 240),
  };
}

function cancellationPatch(input) {
  return {
    registration_status: 'canceled',
    canceled_at: input.now,
    canceled_by: input.uid,
    canceled_by_name: actorName(input.member, input.uid),
    canceled_by_role: cleanAuditText(input.member.app_role, 'member', 40),
    canceled_source: cleanAuditText(input.source, 'unknown', 40),
    canceled_app_version: cleanAuditText(input.appVersion, null, 40),
    canceled_reason: cleanAuditText(input.reason, 'withdrawal', 240),
    updated_at: input.now,
    ...actionMetadata(input),
  };
}

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

function timestampMillis(value) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const date = asDate(value);
  return date ? date.getTime() : Number.MAX_SAFE_INTEGER;
}

function oldestWaitlistEntry(docs) {
  return docs
    .filter(doc => doc.data().registration_status === 'waitlisted')
    .sort((left, right) => {
      const leftData = left.data();
      const rightData = right.data();
      const byRequestTime = timestampMillis(leftData.requested_at || leftData.date_inscription)
        - timestampMillis(rightData.requested_at || rightData.date_inscription);
      return byRequestTime || left.id.localeCompare(right.id);
    })[0] || null;
}

function promotionCandidatesAfterWithdrawal(operation, docs, withdrawnIds, now = new Date()) {
  const start = asDate(operation.date_debut);
  if (operation.allow_waitlist !== true || operation.statut === 'annule' || (start && now >= start)) {
    return [];
  }
  const capacity = Number(operation.capacite_max);
  if (!Number.isFinite(capacity) || capacity <= 0) return [];
  const removedIds = new Set(withdrawnIds);
  const releasedPlaces = docs.filter(doc => (
    removedIds.has(doc.id)
    && ACTIVE_STATUSES.has(doc.data().registration_status || 'confirmed')
  )).length;
  const activeAfterWithdrawal = docs.filter(doc => (
    !removedIds.has(doc.id)
    && ACTIVE_STATUSES.has(doc.data().registration_status || 'confirmed')
  )).length;
  const availablePlaces = Math.min(releasedPlaces, Math.max(0, capacity - activeAfterWithdrawal));
  if (availablePlaces === 0) return [];
  return docs
    .filter(doc => !removedIds.has(doc.id) && doc.data().registration_status === 'waitlisted')
    .sort((left, right) => {
      const leftData = left.data();
      const rightData = right.data();
      const byRequestTime = timestampMillis(leftData.requested_at || leftData.date_inscription)
        - timestampMillis(rightData.requested_at || rightData.date_inscription);
      return byRequestTime || left.id.localeCompare(right.id);
    })
    .slice(0, availablePlaces);
}

function promotionCandidateAfterWithdrawal(operation, docs, withdrawnId, now = new Date()) {
  return promotionCandidatesAfterWithdrawal(operation, docs, [withdrawnId], now)[0] || null;
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
  return ELEVATED_ROLES.has(member.app_role)
    || operation.organisateur_id === uid;
}

async function activeCount(transaction, inscriptionsRef) {
  const snapshot = await transaction.get(inscriptionsRef);
  return snapshot.docs.filter(doc => ACTIVE_STATUSES.has(doc.data().registration_status || 'confirmed')).length;
}

function normalizedFunction(value) {
  return typeof value === 'string'
    ? value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/s$/, '')
    : '';
}

function tariffCategory(tariff) {
  const explicit = normalizedFunction(tariff?.category);
  if (explicit) return explicit;
  const label = normalizedFunction(tariff?.label);
  if (label.includes('encadrant')) return 'encadrant';
  if (label === 'ca' || label.includes('comite')) return 'ca';
  if (label.includes('junior')) return 'junior';
  if (label.includes('etudiant')) return 'etudiant';
  if (label.includes('non-membre') || label.includes('non membre')) return 'non-membre';
  if (label.includes('membre')) return 'membre';
  return label;
}

function bestMemberFunction(member) {
  const clubFunctions = Array.isArray(member.clubStatuten)
    ? member.clubStatuten.map(normalizedFunction).filter(Boolean)
    : [];
  const functions = [
    ...clubFunctions,
    normalizedFunction(member.fonction_defaut),
  ].filter(Boolean);
  if (functions.some(value => value.includes('encadrant'))) return 'encadrant';
  if (functions.some(value => value === 'ca' || value.includes('comite'))) return 'ca';
  if (functions.some(value => value.includes('membre'))) return 'membre';
  return functions[0] || 'membre';
}

function memberTariff(operation, member) {
  const tariffs = Array.isArray(operation.event_tariffs)
    ? operation.event_tariffs.filter(tariff => tariff && tariff.is_guest_tariff !== true)
    : [];
  if (tariffs.length === 0) return null;
  const preferred = bestMemberFunction(member);
  const byCategory = category => tariffs.find(
    tariff => tariffCategory(tariff) === normalizedFunction(category),
  );
  // Eligibility comes exclusively from the server-side member document. A
  // client-provided tariff identifier must never grant a CA/encadrant rate.
  return byCategory(preferred) || byCategory('membre') || null;
}

function selectedSupplements(operation, requestedIds) {
  if (requestedIds === undefined || requestedIds === null) return [];
  if (!Array.isArray(requestedIds) || requestedIds.length > 50
    || requestedIds.some(id => typeof id !== 'string' || !id.trim())
    || new Set(requestedIds).size !== requestedIds.length) {
    throw new HttpsError('invalid-argument', 'Sélection de suppléments invalide.');
  }
  const available = Array.isArray(operation.supplements) ? operation.supplements : [];
  return requestedIds.map(id => {
    const supplement = available.find(item => item && item.id === id);
    if (!supplement || !Number.isFinite(Number(supplement.price)) || Number(supplement.price) < 0) {
      throw new HttpsError('invalid-argument', 'Supplément indisponible.');
    }
    return { id: supplement.id, name: cleanAuditText(supplement.name, '', 160), price: Number(supplement.price) };
  });
}

function installmentPayments(operation, tariff, supplementTotal) {
  if (operation.payment_plan_enabled !== true || !Array.isArray(operation.payment_installments)) return {};
  const amounts = tariff && typeof tariff.installment_amounts === 'object'
    ? tariff.installment_amounts : {};
  const result = {};
  let extraApplied = supplementTotal <= 0;
  for (const installment of operation.payment_installments) {
    if (!installment || typeof installment.id !== 'string' || !installment.id) continue;
    let amount = Number(amounts[installment.id] || 0);
    if (!Number.isFinite(amount) || amount < 0) amount = 0;
    if (!extraApplied && amount > 0) {
      amount += supplementTotal;
      extraApplied = true;
    }
    result[installment.id] = { status: amount > 0 ? 'unpaid' : 'waived', amount_due: amount };
  }
  const firstId = operation.payment_installments.find(item => item && result[item.id])?.id;
  if (!extraApplied && firstId) {
    result[firstId] = { status: 'unpaid', amount_due: result[firstId].amount_due + supplementTotal };
  }
  return result;
}

function paymentRequiredForOperation(operation) {
  if (Object.prototype.hasOwnProperty.call(operation, 'payment_required')) {
    return operation.payment_required === true;
  }
  if (Number(operation.prix_membre || 0) > 0 || Number(operation.prix_non_membre || 0) > 0) {
    return true;
  }
  return Array.isArray(operation.event_tariffs)
    && operation.event_tariffs.some(tariff => Number(tariff?.price || 0) > 0);
}

function assertRegistrationOpen(operation, active, requestedPlaces = 1, now = new Date()) {
  if (operation.statut !== 'ouvert') {
    throw new HttpsError('failed-precondition', 'Les inscriptions sont fermées pour cet événement.');
  }
  const deadline = effectiveDeadline(operation);
  if (deadline && now > deadline) {
    throw new HttpsError('failed-precondition', 'La date limite d’inscription est dépassée.');
  }
  const capacity = Number(operation.capacite_max);
  if (Number.isFinite(capacity) && capacity > 0 && active + requestedPlaces > capacity) {
    throw new HttpsError('resource-exhausted', `Événement complet (${capacity} places).`);
  }
}

function registrationRequestId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(value)) {
    throw new HttpsError('invalid-argument', 'Identifiant de demande invalide.');
  }
  return value;
}

function requestedGuests(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 10) {
    throw new HttpsError('invalid-argument', 'Liste d’invités invalide.');
  }
  return value.map(guest => {
    if (!guest || typeof guest !== 'object' || Array.isArray(guest)) {
      throw new HttpsError('invalid-argument', 'Invité invalide.');
    }
    const firstName = cleanAuditText(guest.firstName, '', 80);
    const lastName = cleanAuditText(guest.lastName, '', 80);
    const tariffId = guest.tariffId ?? null;
    if (!firstName || !lastName
      || (tariffId !== null && (typeof tariffId !== 'string' || !tariffId))) {
      throw new HttpsError('invalid-argument', 'Nom ou tarif invité invalide.');
    }
    return {
      firstName,
      lastName,
      tariffId,
      selectedSupplementIds: guest.selectedSupplementIds ?? [],
    };
  });
}

function guestPricing(operation, guest) {
  const guestTariffs = Array.isArray(operation.event_tariffs)
    ? operation.event_tariffs.filter(item => item?.is_guest_tariff === true)
    : [];
  const requestedTariffId = guestTariffs.length === 0 && guest.tariffId === 'free'
    ? null : guest.tariffId;
  const tariff = requestedTariffId
    ? guestTariffs.find(item => item.id === requestedTariffId)
    : null;
  if ((requestedTariffId && !tariff) || (!requestedTariffId && guestTariffs.length > 0)) {
    throw new HttpsError('invalid-argument', 'Tarif invité indisponible.');
  }
  const price = tariff ? Number(tariff.price || 0) : 0;
  if (!Number.isFinite(price) || price < 0) {
    throw new HttpsError('failed-precondition', 'Tarif invité invalide.');
  }
  const supplements = selectedSupplements(operation, guest.selectedSupplementIds);
  return {
    tariff,
    price,
    supplements,
    supplementTotal: supplements.reduce((sum, item) => sum + item.price, 0),
  };
}

function guestRegistrationPayload({
  operation,
  operationId,
  guest,
  pricing,
  guestRef,
  parentInscriptionId,
  registrationStatus,
  paymentExpiresAt,
  member,
  uid,
  source,
  appVersion,
  now,
}) {
  return {
    operation_id: operationId,
    operation_titre: operation.titre || '',
    membre_id: `guest_${guestRef.id}`,
    membre_nom: guest.lastName,
    membre_prenom: guest.firstName,
    prix: pricing.price,
    paye: false,
    registration_status: registrationStatus,
    payment_status: paymentRequiredForOperation(operation) ? 'open' : null,
    payment_expires_at: paymentExpiresAt || null,
    date_inscription: now,
    is_guest: true,
    added_by: uid,
    added_by_name: actorName(member, uid),
    parent_inscription_id: parentInscriptionId,
    tariff_id: pricing.tariff?.id || null,
    tariff_label: pricing.tariff?.label || null,
    selected_supplements: pricing.supplements,
    supplement_total: pricing.supplementTotal,
    installment_payments: installmentPayments(
      operation,
      pricing.tariff,
      pricing.supplementTotal,
    ),
    created_at: now,
    updated_at: now,
    created_by: uid,
    created_by_name: actorName(member, uid),
    created_source: cleanAuditText(source, 'calymob', 40),
    created_app_version: cleanAuditText(appVersion, null, 40),
    ...actionMetadata({
      member,
      uid,
      source,
      appVersion,
      reason: 'guest_registration',
      action: 'registered',
      now,
    }),
  };
}

const registerForEvent = onCall({ region: REGION }, async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Authentification requise.');
  const {
    clubId,
    operationId,
    requestId: rawRequestId,
    selectedSupplementIds = [],
    guests: rawGuests = [],
    source = 'calymob',
    appVersion = null,
  } = request.data || {};
  if (typeof clubId !== 'string' || typeof operationId !== 'string'
    || !/^[A-Za-z0-9_-]+$/.test(clubId) || !/^[A-Za-z0-9_-]+$/.test(operationId)) {
    throw new HttpsError('invalid-argument', 'clubId et operationId requis.');
  }
  const requestId = registrationRequestId(rawRequestId);
  const guests = requestedGuests(rawGuests);

  const member = await requireMember(clubId, uid);
  const memberData = member.data();
  const { operationRef, inscriptionsRef } = refs(clubId, operationId);
  const requestRef = operationRef.collection('registration_requests').doc(requestId);
  // References are allocated once, outside the retried transaction. The
  // request document makes transport/user retries return the same group.
  const registrationRef = inscriptionsRef.doc();
  const guestRefs = guests.map(() => inscriptionsRef.doc());

  return admin.firestore().runTransaction(async transaction => {
    const [operationSnap, inscriptionsSnap, requestSnap] = await Promise.all([
      transaction.get(operationRef),
      transaction.get(inscriptionsRef),
      transaction.get(requestRef),
    ]);
    if (!operationSnap.exists) throw new HttpsError('not-found', 'Événement introuvable.');
    if (requestSnap.exists) {
      const previous = requestSnap.data();
      if (previous.member_id !== uid) {
        throw new HttpsError('permission-denied', 'Cette demande appartient à un autre membre.');
      }
      return {
        status: previous.registration_status,
        inscriptionId: previous.inscription_id,
        guestInscriptionIds: previous.guest_inscription_ids || [],
        idempotent: true,
      };
    }
    const duplicate = inscriptionsSnap.docs.find(doc => {
      const data = doc.data();
      return data.membre_id === uid && data.registration_status !== 'canceled';
    });
    if (duplicate) {
      throw new HttpsError('already-exists', duplicate.data().registration_status === 'waitlisted'
        ? 'Vous êtes déjà sur la liste d’attente.' : 'Vous êtes déjà inscrit.');
    }

    const operation = operationSnap.data();
    const count = inscriptionsSnap.docs.filter(doc => ACTIVE_STATUSES.has(
      doc.data().registration_status || 'confirmed',
    )).length;
    if (guests.length > 0) {
      const maxGuests = Number(operation.max_guests_per_member);
      if (operation.allow_guests !== true
        || (Number.isInteger(maxGuests) && maxGuests >= 0 && guests.length > maxGuests)) {
        throw new HttpsError('failed-precondition', 'Ces invités ne sont pas autorisés.');
      }
    }
    assertRegistrationOpen(operation, count, 1 + guests.length);
    const tariff = memberTariff(operation, memberData);
    const supplements = selectedSupplements(operation, selectedSupplementIds);
    const supplementTotal = supplements.reduce((sum, item) => sum + item.price, 0);
    const price = tariff ? Number(tariff.price || 0) : Number(operation.prix_membre || 0);
    if (!Number.isFinite(price) || price < 0) {
      throw new HttpsError('failed-precondition', 'Tarif de l’événement invalide.');
    }
    const now = admin.firestore.Timestamp.now();
    const paymentRequired = paymentRequiredForOperation(operation);
    const registrationStatus = paymentRequired
      && operation.registration_confirmation_policy === 'after_payment'
      ? 'pending_payment' : 'confirmed';
    const deadlineDays = Number(operation.payment_deadline_days ?? 3);
    const paymentExpiresAt = registrationStatus === 'pending_payment'
      && Number.isInteger(deadlineDays) && deadlineDays > 0
      ? admin.firestore.Timestamp.fromMillis(now.toMillis() + deadlineDays * 24 * 60 * 60 * 1000)
      : null;
    // Validate and price the entire group before staging any write. Firestore
    // would roll a thrown transaction back either way, but this ordering also
    // makes the all-or-nothing contract explicit and directly testable.
    const guestPricings = guests.map(guest => guestPricing(operation, guest));

    transaction.set(registrationRef, {
      operation_id: operationId,
      operation_titre: operation.titre || '',
      membre_id: uid,
      membre_nom: memberData.nom || memberData.lastName || '',
      membre_prenom: memberData.prenom || memberData.firstName || '',
      prix: price,
      paye: false,
      date_paiement: null,
      date_inscription: now,
      commentaire: null,
      notes: null,
      exercices: [],
      selected_supplements: supplements,
      supplement_total: supplementTotal,
      payment_status: paymentRequired ? 'open' : null,
      registration_status: registrationStatus,
      payment_expires_at: paymentExpiresAt,
      transaction_matched: false,
      transaction_id: null,
      mode_paiement: null,
      present: null,
      present_at: null,
      present_by: null,
      present_by_name: null,
      is_guest: false,
      added_by: null,
      added_by_name: null,
      parent_inscription_id: null,
      tariff_id: tariff?.id || null,
      tariff_label: tariff?.label || null,
      tariff_selected_by: null,
      tariff_validation_status: tariff?.requires_admin_validation === true ? 'pending' : 'accepted',
      installment_payments: installmentPayments(operation, tariff, supplementTotal),
      amount_paid: null,
      edit_history: null,
      created_at: now,
      updated_at: now,
      created_by: uid,
      created_by_name: actorName(memberData, uid),
      created_source: cleanAuditText(source, 'calymob', 40),
      created_app_version: cleanAuditText(appVersion, null, 40),
      ...actionMetadata({
        member: memberData,
        uid,
        source,
        appVersion,
        reason: 'self_registration',
        action: 'registered',
        now,
      }),
    });
    guestRefs.forEach((guestRef, index) => {
      const guest = guests[index];
      const pricing = guestPricings[index];
      transaction.set(guestRef, guestRegistrationPayload({
        operation,
        operationId,
        guest,
        pricing,
        guestRef,
        parentInscriptionId: registrationRef.id,
        registrationStatus,
        paymentExpiresAt,
        member: memberData,
        uid,
        source,
        appVersion,
        now,
      }));
    });
    transaction.set(requestRef, {
      member_id: uid,
      inscription_id: registrationRef.id,
      guest_inscription_ids: guestRefs.map(ref => ref.id),
      registration_status: registrationStatus,
      created_at: now,
    });
    // Every successful registration writes the same operation document. This
    // creates a transaction conflict between concurrent last-place attempts;
    // the retry then observes the newly committed inscription before counting.
    transaction.update(operationRef, {
      registration_capacity_revision: Number(operation.registration_capacity_revision || 0) + 1,
    });
    return {
      status: registrationStatus,
      inscriptionId: registrationRef.id,
      guestInscriptionIds: guestRefs.map(ref => ref.id),
      idempotent: false,
    };
  });
});

const addGuestToEvent = onCall({ region: REGION }, async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Authentification requise.');
  const {
    clubId,
    operationId,
    parentInscriptionId,
    requestId: rawRequestId,
    guest: rawGuest,
    source = 'calymob',
    appVersion = null,
  } = request.data || {};
  if (typeof clubId !== 'string' || typeof operationId !== 'string'
    || typeof parentInscriptionId !== 'string' || !parentInscriptionId
    || !/^[A-Za-z0-9_-]+$/.test(clubId) || !/^[A-Za-z0-9_-]+$/.test(operationId)) {
    throw new HttpsError('invalid-argument', 'Paramètres d’inscription invité invalides.');
  }
  const requestId = registrationRequestId(rawRequestId);
  const [guest] = requestedGuests([rawGuest]);
  const member = await requireMember(clubId, uid);
  const memberData = member.data();
  const { operationRef, inscriptionsRef } = refs(clubId, operationId);
  const parentRef = inscriptionsRef.doc(parentInscriptionId);
  const guestRef = inscriptionsRef.doc();
  const requestRef = operationRef.collection('registration_requests').doc(requestId);

  return admin.firestore().runTransaction(async transaction => {
    const [operationSnap, inscriptionsSnap, parentSnap, requestSnap] = await Promise.all([
      transaction.get(operationRef),
      transaction.get(inscriptionsRef),
      transaction.get(parentRef),
      transaction.get(requestRef),
    ]);
    if (!operationSnap.exists || !parentSnap.exists) {
      throw new HttpsError('not-found', 'Événement ou inscription principale introuvable.');
    }
    if (requestSnap.exists) {
      const previous = requestSnap.data();
      if (previous.member_id !== uid || previous.parent_inscription_id !== parentInscriptionId) {
        throw new HttpsError('permission-denied', 'Cette demande appartient à une autre inscription.');
      }
      return { guestInscriptionId: previous.guest_inscription_id, idempotent: true };
    }
    const parent = parentSnap.data();
    if (parent.membre_id !== uid || parent.is_guest === true
      || parent.registration_status === 'canceled' || parent.registration_status === 'waitlisted') {
      throw new HttpsError('permission-denied', 'Seul le membre inscrit peut ajouter un invité.');
    }
    const operation = operationSnap.data();
    if (operation.allow_guests !== true) {
      throw new HttpsError('failed-precondition', 'Les invités ne sont pas autorisés.');
    }
    const existingGuests = inscriptionsSnap.docs.filter(doc => {
      const data = doc.data();
      return data.parent_inscription_id === parentInscriptionId
        && data.registration_status !== 'canceled';
    });
    const maxGuests = Number(operation.max_guests_per_member);
    if (Number.isInteger(maxGuests) && maxGuests >= 0 && existingGuests.length + 1 > maxGuests) {
      throw new HttpsError('failed-precondition', 'Nombre maximal d’invités atteint.');
    }
    const count = inscriptionsSnap.docs.filter(doc => ACTIVE_STATUSES.has(
      doc.data().registration_status || 'confirmed',
    )).length;
    assertRegistrationOpen(operation, count, 1);
    const pricing = guestPricing(operation, guest);
    const now = admin.firestore.Timestamp.now();
    const registrationStatus = parent.registration_status;
    transaction.set(guestRef, guestRegistrationPayload({
      operation,
      operationId,
      guest,
      pricing,
      guestRef,
      parentInscriptionId,
      registrationStatus,
      paymentExpiresAt: parent.payment_expires_at || null,
      member: memberData,
      uid,
      source,
      appVersion,
      now,
    }));
    transaction.set(requestRef, {
      member_id: uid,
      parent_inscription_id: parentInscriptionId,
      guest_inscription_id: guestRef.id,
      registration_status: registrationStatus,
      created_at: now,
    });
    transaction.update(operationRef, {
      registration_capacity_revision: Number(operation.registration_capacity_revision || 0) + 1,
    });
    return { guestInscriptionId: guestRef.id, idempotent: false };
  });
});

const joinEventWaitlist = onCall({ region: REGION }, async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Authentification requise.');
  const { clubId, operationId, source = 'calymob', appVersion = null } = request.data || {};
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
      created_by: uid,
      created_by_name: actorName(memberData, uid),
      created_source: cleanAuditText(source, 'calymob', 40),
      created_app_version: cleanAuditText(appVersion, null, 40),
      ...actionMetadata({
        member: memberData,
        uid,
        source,
        appVersion,
        reason: reason === 'full' ? 'waitlist_full' : `waitlist_${reason}`,
        action: 'waitlisted',
        now,
      }),
    });
    transaction.set(auditRef.doc(), {
      action: 'joined',
      membre_id: uid,
      inscription_id: waitlistRef.id,
      reason,
      at: now,
      by: uid,
      by_name: actorName(memberData, uid),
      source: cleanAuditText(source, 'calymob', 40),
      app_version: cleanAuditText(appVersion, null, 40),
    });
    return { status: 'waitlisted', reason };
  });
});

const leaveEventWaitlist = onCall({ region: REGION }, async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Authentification requise.');
  const {
    clubId,
    operationId,
    source = 'calymob',
    appVersion = null,
    reason = 'left_waitlist',
  } = request.data || {};
  if (!clubId || !operationId) throw new HttpsError('invalid-argument', 'clubId et operationId requis.');
  const member = await requireMember(clubId, uid);
  const { operationRef, inscriptionsRef, auditRef } = refs(clubId, operationId);
  return admin.firestore().runTransaction(async transaction => {
    const operationSnap = await transaction.get(operationRef);
    if (!operationSnap.exists) throw new HttpsError('not-found', 'Événement introuvable.');
    const matches = await transaction.get(inscriptionsRef.where('membre_id', '==', uid));
    const entry = matches.docs.find(doc => doc.data().registration_status === 'waitlisted');
    if (!entry) throw new HttpsError('not-found', 'Entrée de liste d’attente introuvable.');
    const now = admin.firestore.Timestamp.now();
    transaction.update(entry.ref, cancellationPatch({
      member: member.data(),
      uid,
      source,
      appVersion,
      reason,
      action: 'left_waitlist',
      now,
    }));
    transaction.set(auditRef.doc(), {
      action: 'left',
      membre_id: uid,
      inscription_id: entry.id,
      at: now,
      by: uid,
      by_name: actorName(member.data(), uid),
      source: cleanAuditText(source, 'calymob', 40),
      app_version: cleanAuditText(appVersion, null, 40),
      reason: cleanAuditText(reason, 'left_waitlist', 240),
    });
    return { status: 'canceled' };
  });
});

const unregisterFromEvent = onCall({ region: REGION }, async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Authentification requise.');
  const {
    clubId,
    operationId,
    inscriptionId,
    guestAction = null,
    source = 'calymob',
    appVersion = null,
    reason = null,
  } = request.data || {};
  if (!clubId || !operationId) throw new HttpsError('invalid-argument', 'clubId et operationId requis.');
  if (typeof inscriptionId !== 'string' || inscriptionId.trim().length === 0) {
    throw new HttpsError('invalid-argument', 'inscriptionId requis.');
  }
  if (![null, 'delete', 'transfer'].includes(guestAction)) {
    throw new HttpsError('invalid-argument', 'Gestion des invités invalide.');
  }
  const member = await requireMember(clubId, uid);
  const memberData = member.data();
  const { operationRef, inscriptionsRef, auditRef } = refs(clubId, operationId);

  const result = await admin.firestore().runTransaction(async transaction => {
    const [operationSnap, inscriptionsSnap] = await Promise.all([
      transaction.get(operationRef),
      transaction.get(inscriptionsRef),
    ]);
    if (!operationSnap.exists) throw new HttpsError('not-found', 'Événement introuvable.');
    const ownEntry = inscriptionsSnap.docs.find(doc => {
      const data = doc.data();
      if (data.registration_status === 'canceled') return false;
      return doc.id === inscriptionId;
    });
    if (!ownEntry) throw new HttpsError('not-found', 'Inscription introuvable.');

    const ownData = ownEntry.data();
    const isElevated = ELEVATED_ROLES.has(memberData.app_role);
    const ownsRegistration = ownData.membre_id === uid;
    const ownsGuest = ownData.is_guest === true && ownData.added_by === uid;
    if (!isElevated && !ownsRegistration && !ownsGuest) {
      throw new HttpsError('permission-denied', 'Vous ne pouvez pas annuler cette inscription.');
    }

    const operation = operationSnap.data();
    const wasWaitlisted = ownData.registration_status === 'waitlisted';
    const now = admin.firestore.Timestamp.now();
    const deadline = effectiveDeadline(operation);
    if (!isElevated && !wasWaitlisted && deadline && asDate(now) > deadline) {
      throw new HttpsError(
        'failed-precondition',
        'La date limite de désinscription est dépassée. Contactez l’organisateur.',
      );
    }
    const guests = inscriptionsSnap.docs.filter(doc => (
      doc.data().parent_inscription_id === ownEntry.id
      && doc.data().registration_status !== 'canceled'
    ));
    const effectiveGuestAction = guestAction || (isElevated ? 'transfer' : null);
    if (guests.length > 0 && effectiveGuestAction === null) {
      throw new HttpsError('failed-precondition', 'Choisissez le traitement des invités.');
    }
    const removedEntries = [ownEntry];
    if (effectiveGuestAction === 'delete') {
      for (const guest of guests) {
        transaction.update(guest.ref, cancellationPatch({
          member: memberData,
          uid,
          source,
          appVersion,
          reason: 'parent_withdrawal',
          action: 'guest_unregistered',
          now,
        }));
        removedEntries.push(guest);
        transaction.set(auditRef.doc(), {
          action: 'guest_removed_after_withdrawal',
          inscription_id: guest.id,
          released_by: uid,
          at: now,
          by: uid,
          by_name: actorName(memberData, uid),
          source: cleanAuditText(source, 'calymob', 40),
          app_version: cleanAuditText(appVersion, null, 40),
        });
      }
    } else if (effectiveGuestAction === 'transfer') {
      const organizerEntry = inscriptionsSnap.docs.find(doc => {
        const data = doc.data();
        return doc.id !== ownEntry.id
          && data.membre_id === operation.organisateur_id
          && data.registration_status !== 'canceled'
          && data.is_guest !== true;
      });
      for (const guest of guests) {
        transaction.update(guest.ref, {
          parent_inscription_id: organizerEntry?.id || null,
          ...(operation.organisateur_id ? { added_by: operation.organisateur_id } : {}),
          ...(operation.organisateur_nom ? { added_by_name: operation.organisateur_nom } : {}),
          updated_at: now,
          ...actionMetadata({
            member: memberData,
            uid,
            source,
            appVersion,
            reason: 'parent_withdrawal_transfer',
            action: 'guest_transferred',
            now,
          }),
        });
      }
    }
    transaction.update(ownEntry.ref, cancellationPatch({
      member: memberData,
      uid,
      source,
      appVersion,
      reason: reason || (isElevated && !ownsRegistration ? 'admin_cancellation' : 'self_withdrawal'),
      action: wasWaitlisted ? 'left_waitlist' : 'unregistered',
      now,
    }));
    transaction.set(auditRef.doc(), {
      action: wasWaitlisted ? 'left' : 'unregistered',
      membre_id: ownData.membre_id || null,
      inscription_id: ownEntry.id,
      at: now,
      by: uid,
      by_name: actorName(memberData, uid),
      by_role: cleanAuditText(memberData.app_role, 'member', 40),
      source: cleanAuditText(source, 'calymob', 40),
      app_version: cleanAuditText(appVersion, null, 40),
      reason: cleanAuditText(reason, isElevated && !ownsRegistration ? 'admin_cancellation' : 'self_withdrawal', 240),
    });

    if (wasWaitlisted) {
      return { status: 'canceled', promoted: [], notifications: [] };
    }
    const nextEntries = promotionCandidatesAfterWithdrawal(
      operation,
      inscriptionsSnap.docs,
      removedEntries.map(entry => entry.id),
    );
    if (nextEntries.length === 0) return { status: 'canceled', promoted: [], notifications: [] };
    const promotedStatus = registrationStatusAfterPromotion(operation);
    for (const nextEntry of nextEntries) {
      transaction.update(nextEntry.ref, {
        registration_status: promotedStatus,
        payment_status: operation.payment_required === true ? 'open' : null,
        waitlist_promoted_at: now,
        waitlist_promoted_by: 'automatic_after_withdrawal',
        updated_at: now,
        ...actionMetadata({
          member: { prenom: 'Système', app_role: 'system' },
          uid: 'system',
          source: 'cloud_function',
          appVersion: null,
          reason: 'automatic_after_withdrawal',
          action: 'waitlist_promoted',
          now,
        }),
      });
      transaction.set(auditRef.doc(), {
        action: 'promoted_after_withdrawal',
        membre_id: nextEntry.data().membre_id,
        inscription_id: nextEntry.id,
        released_by: uid,
        at: now,
        by: 'system',
        resulting_status: promotedStatus,
      });
    }
    return {
      status: 'canceled',
      promoted: nextEntries.map(entry => entry.id),
      promotedStatus,
      notifications: nextEntries.map(entry => ({ operation, memberId: entry.data().membre_id })),
    };
  });

  for (const notification of result.notifications) {
    try {
      await sendPromotionNotification(
        clubId,
        operationId,
        notification.operation,
        notification.memberId,
      );
    } catch (error) {
      console.error('Automatic waitlist promotion notification failed', { clubId, operationId, error });
    }
  }
  const { notifications: _notifications, ...response } = result;
  return response;
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
  const {
    clubId,
    operationId,
    inscriptionId,
    source = 'calymob',
    appVersion = null,
  } = request.data || {};
  if (!clubId || !operationId || !inscriptionId) throw new HttpsError('invalid-argument', 'Paramètres incomplets.');
  const { operationRef, inscriptionsRef, auditRef } = refs(clubId, operationId);
  const organizer = await requireMember(clubId, uid);
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
      ...actionMetadata({
        member: organizer.data(),
        uid,
        source,
        appVersion,
        reason: 'manual_waitlist_promotion',
        action: 'waitlist_promoted',
        now,
      }),
    });
    transaction.set(auditRef.doc(), { action: 'promoted', membre_id: entrySnap.data().membre_id, inscription_id: entrySnap.id, at: now, by: uid, resulting_status: status });
    return { status, notification: { operation, memberId: entrySnap.data().membre_id } };
  });
  try {
    await sendPromotionNotification(clubId, operationId, result.notification.operation, result.notification.memberId);
  } catch (error) {
    console.error('Waitlist promotion notification failed', { clubId, operationId, error });
  }
  return { status: result.status };
});

module.exports = {
  ACTIVE_STATUSES,
  actionMetadata,
  cancellationPatch,
  effectiveDeadline,
  waitlistReason,
  registrationStatusAfterPromotion,
  oldestWaitlistEntry,
  promotionCandidateAfterWithdrawal,
  promotionCandidatesAfterWithdrawal,
  canManageWaitlist,
  guestPricing,
  joinEventWaitlist,
  registerForEvent,
  addGuestToEvent,
  leaveEventWaitlist,
  unregisterFromEvent,
  promoteEventWaitlistEntry,
};
