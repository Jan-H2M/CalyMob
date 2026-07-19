const crypto = require('crypto');
const admin = require('firebase-admin');

const COLLECTION = 'event_payment_intents';
const SCHEMA_VERSION = 1;

function normalizePaymentCommunication(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toCents(value) {
  return Math.round(Number(value || 0) * 100);
}

function buildInstallmentAllocations({
  participantId,
  memberFirstName,
  memberLastName,
  installmentPayment,
}) {
  if (!installmentPayment) return [];

  const allocations = [];
  if (installmentPayment.ownOpen && toCents(installmentPayment.amountDue) > 0) {
    allocations.push({
      inscription_id: participantId,
      person_name: `${memberFirstName || ''} ${memberLastName || ''}`.trim() || 'Membre',
      amount_cents: toCents(installmentPayment.amountDue),
      role: 'member',
    });
  }

  for (const guest of installmentPayment.guests || []) {
    const amountCents = toCents(guest.prix);
    if (!guest.inscriptionId || amountCents <= 0) continue;
    allocations.push({
      inscription_id: guest.inscriptionId,
      person_name: guest.name || 'Invité',
      amount_cents: amountCents,
      role: 'guest',
    });
  }

  return allocations;
}

function allocationSignature(allocations) {
  return allocations
    .map((allocation) => `${allocation.inscription_id}:${allocation.amount_cents}`)
    .sort()
    .join('|');
}

function buildIntentId(operationId, participantId, installmentId, allocations) {
  const digest = crypto
    .createHash('sha256')
    .update(allocationSignature(allocations))
    .digest('hex')
    .slice(0, 12);
  return `${operationId}__${participantId}__${installmentId}__${digest}`;
}

async function prepareEventPaymentIntent(db, data) {
  const allocations = buildInstallmentAllocations(data);
  if (!data.installmentId || allocations.length === 0) return null;

  const expectedAmountCents = allocations.reduce(
    (sum, allocation) => sum + allocation.amount_cents,
    0
  );
  if (expectedAmountCents !== toCents(data.amount)) {
    throw new Error(
      `Payment intent allocation mismatch: allocations=${expectedAmountCents}, QR=${toCents(data.amount)}`
    );
  }

  const intentId = buildIntentId(
    data.operationId,
    data.participantId,
    data.installmentId,
    allocations
  );
  const ref = db.collection('clubs').doc(data.clubId).collection(COLLECTION).doc(intentId);
  const now = admin.firestore.FieldValue.serverTimestamp();

  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists && existing.get('status') === 'settled') {
      throw new Error(`Payment intent ${intentId} is already settled`);
    }
    transaction.set(ref, {
      schema_version: SCHEMA_VERSION,
      status: 'prepared',
      operation_id: data.operationId,
      event_number: data.eventNumber || null,
      payer_inscription_id: data.participantId,
      installment_id: data.installmentId,
      installment_label: data.installmentLabel || null,
      expected_amount_cents: expectedAmountCents,
      allocations,
      allocation_signature: allocationSignature(allocations),
      communication: data.communication,
      communication_normalized: normalizePaymentCommunication(data.communication),
      prepared_at: now,
      updated_at: now,
      ...(existing.exists ? {} : { created_at: now }),
    }, { merge: true });
  });

  return { id: intentId, ref, allocations, expectedAmountCents };
}

async function markEventPaymentIntentIssued(intent, messageId) {
  if (!intent) return;
  await intent.ref.set({
    status: 'issued',
    email_message_id: messageId || null,
    issued_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

module.exports = {
  COLLECTION,
  SCHEMA_VERSION,
  allocationSignature,
  buildInstallmentAllocations,
  buildIntentId,
  markEventPaymentIntentIssued,
  normalizePaymentCommunication,
  prepareEventPaymentIntent,
  toCents,
};
