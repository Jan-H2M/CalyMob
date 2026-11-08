const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { assertPaymentMethod } = require('./paymentConfirmationPolicy');
const { buildIntentId, allocationSignature, normalizePaymentCommunication } = require('./eventPaymentIntent');
const { generatePaymentCommunication } = require('./sendPaymentQrEmail');

const inactive = new Set(['canceled', 'cancelled', 'annule', 'annulé', 'waitlisted']);
const closed = new Set(['paid', 'settled', 'waived', 'canceled', 'cancelled']);

function amountForRegistration(registration, installmentId) {
  const paymentStatus = String(registration.payment_status || '').trim().toLowerCase();
  if (registration.paye === true || registration.transaction_matched === true || ['paid', 'settled'].includes(paymentStatus)) return 0;
  if (paymentStatus === 'manual_review' || paymentStatus === 'pending_bank') {
    throw new HttpsError('failed-precondition', 'Ce paiement doit être vérifié avant de créer un QR.');
  }
  const installments = registration.installment_payments || {};
  const open = item => {
    if (!item || closed.has(item.status)) return 0;
    if (item.transaction_id || Number(item.amount_paid || 0) > 0 || item.status === 'partial') throw new HttpsError('failed-precondition', 'Paiement en cours de vérification.');
    const amount = Number(item.amount_due);
    if (!Number.isFinite(amount) || amount < 0) throw new HttpsError('failed-precondition', 'Montant invalide.');
    return Math.round(amount * 100);
  };
  if (installmentId) {
    if (!installments[installmentId]) throw new HttpsError('failed-precondition', 'Tranche introuvable.');
    return open(installments[installmentId]);
  }
  if (Object.keys(installments).length) return Object.values(installments).reduce((sum, item) => sum + open(item), 0);
  if (closed.has(paymentStatus)) return 0;
  if (registration.transaction_id || Number(registration.amount_paid || 0) > 0 || paymentStatus === 'partial') throw new HttpsError('failed-precondition', 'Paiement en cours de vérification.');
  const amount = Number(registration.prix || 0) + Number(registration.supplement_total || 0);
  if (!Number.isFinite(amount) || amount < 0) throw new HttpsError('failed-precondition', 'Montant invalide.');
  return Math.round(amount * 100);
}

/** Compute and record the exact payment instructions in one transaction. */
async function issueDirectEventQr(db, { clubId, operationId, participantId, installmentId, uid, asOrganizer = false, manualTransfer = false }) {
  const club = db.collection('clubs').doc(clubId);
  const operation = club.collection('operations').doc(operationId);
  const registrations = operation.collection('inscriptions');
  const callerRef = club.collection('members').doc(uid);
  const payerRef = registrations.doc(participantId);
  const bankRef = club.collection('settings').doc('bank');
  return db.runTransaction(async tx => {
    const [callerSnap, operationSnap, payerSnap, bankSnap, guestsSnap] = await Promise.all([
      tx.get(callerRef), tx.get(operation), tx.get(payerRef), tx.get(bankRef),
      tx.get(registrations.where('parent_inscription_id', '==', participantId).where('is_guest', '==', true)),
    ]);
    if (!callerSnap.exists || !operationSnap.exists || !payerSnap.exists) throw new HttpsError('not-found', 'Inscription ou activité introuvable.');
    const caller = callerSnap.data();
    const payer = payerSnap.data();
    const staff = ['admin', 'superadmin'].includes(caller.app_role)
      || (Array.isArray(caller.clubStatuten) && caller.clubStatuten.some(r => ['O', 'organisateur', 'Organisateur'].includes(r)));
    if ((asOrganizer && !staff) || (!staff && payer.membre_id !== uid)) throw new HttpsError('permission-denied', 'Paiement non autorisé.');
    const event = operationSnap.data();
    if (['canceled', 'cancelled', 'annule', 'annulé'].includes(String(event.statut || '').toLowerCase())) throw new HttpsError('failed-precondition', 'Cette activité est annulée.');
    const methods = Array.isArray(event.allowed_payment_methods) ? event.allowed_payment_methods : ['qr_immediate', 'qr_email', 'on_site'];
    const method = asOrganizer ? 'on_site' : manualTransfer && !methods.includes('qr_immediate') ? 'qr_email' : 'qr_immediate';
    assertPaymentMethod(event, method);
    if (inactive.has(String(payer.registration_status || '').trim().toLowerCase())) throw new HttpsError('failed-precondition', 'Inscription annulée ou en liste d’attente.');
    const bank = bankSnap.data() || {};
    const cleanIban = String(bank.iban || '').replace(/\s/g, '').toUpperCase();
    const beneficiary = String(bank.beneficiaryName || '').trim();
    const bic = String(bank.bic || '').replace(/\s/g, '').toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{13,32}$/.test(cleanIban) || !beneficiary || beneficiary.length > 70 || (bic && !/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/.test(bic))) throw new HttpsError('failed-precondition', 'Coordonnées bancaires indisponibles.');
    const eventNumber = event.event_number;
    if (!/^(?:[PS][A-Z]{4}|\d[A-Z0-9]{5})$/.test(eventNumber || '')) throw new HttpsError('failed-precondition', 'Référence de l’activité indisponible. Contactez le club.');
    const installment = installmentId && (event.payment_installments || []).find(item => item.id === installmentId);
    if (installmentId && !installment) throw new HttpsError('failed-precondition', 'Tranche introuvable.');
    const installmentLabel = installment?.label || installment?.nom || null;
    const allocations = [];
    function add(id, data, role) {
      const state = String(data.registration_status || '').trim().toLowerCase();
      if (state === 'waitlisted') return;
      if (role === 'guest' && installmentId && !data.installment_payments?.[installmentId]) return;
      const cents = amountForRegistration(data, installmentId);
      if (inactive.has(state)) {
        if (cents > 0) throw new HttpsError('failed-precondition', 'Un invité annulé a un montant ouvert. Vérifiez sa situation.');
        return;
      }
      if (cents > 0) allocations.push({ inscription_id: id, person_name: `${data.membre_prenom || ''} ${data.membre_nom || ''}`.trim() || (role === 'member' ? 'Membre' : 'Invité'), amount_cents: cents, role });
    }
    add(participantId, payer, 'member');
    guestsSnap.forEach(doc => add(doc.id, doc.data(), 'guest'));
    const cents = allocations.reduce((sum, allocation) => sum + allocation.amount_cents, 0);
    if (cents <= 0 || cents > 99999999999) throw new HttpsError('failed-precondition', 'Aucun montant valide à payer.');
    const intentId = buildIntentId(operationId, participantId, installmentId || 'full', allocations);
    const intentRef = club.collection('event_payment_intents').doc(intentId);
    const existing = await tx.get(intentRef);
    if (existing.exists && existing.get('status') === 'settled') throw new HttpsError('failed-precondition', 'Ce paiement est déjà réglé.');
    if (existing.exists && !['prepared', 'issued'].includes(existing.get('status'))) throw new HttpsError('failed-precondition', 'Ce paiement doit être vérifié.');
    const generated = generatePaymentCommunication(eventNumber, operationId, event.titre || event.title || 'Événement', null, payer.membre_prenom, payer.membre_nom, installmentLabel);
    const communication = existing.exists ? existing.get('communication') : generated;
    if (!communication) throw new HttpsError('failed-precondition', 'Référence de paiement indisponible.');
    const now = admin.firestore.FieldValue.serverTimestamp();
    if (existing.exists) {
      tx.update(intentRef, { status: 'issued', issued_at: now, updated_at: now });
    } else {
      tx.set(intentRef, {
        schema_version: 1, status: 'issued', operation_id: operationId, event_number: eventNumber,
        payer_inscription_id: participantId, installment_id: installmentId || null, installment_label: installmentLabel,
        expected_amount_cents: cents, allocations, allocation_signature: allocationSignature(allocations),
        communication, communication_normalized: normalizePaymentCommunication(communication),
        issued_at: now, updated_at: now, created_at: now,
      });
    }
    return { amount: cents / 100, communication, iban: cleanIban, beneficiaryName: beneficiary, bic, installmentLabel, eventNumber, intentId, allocations };
  });
}

const createDirectEventPaymentQr = onCall({ region: 'europe-west1', memory: '256MiB', timeoutSeconds: 30 }, async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Authentification requise.');
  const { clubId, operationId, participantId, installmentId, asOrganizer, manualTransfer } = request.data || {};
  if (![clubId, operationId, participantId].every(v => typeof v === 'string' && v && !v.includes('/')) || (installmentId != null && (typeof installmentId !== 'string' || !installmentId || installmentId.includes('/')))) {
    throw new HttpsError('invalid-argument', 'Inscription invalide.');
  }
  return issueDirectEventQr(admin.firestore(), { clubId, operationId, participantId, installmentId, asOrganizer: asOrganizer === true, manualTransfer: manualTransfer === true, uid: request.auth.uid });
});

module.exports = { amountForRegistration, issueDirectEventQr, createDirectEventPaymentQr };
