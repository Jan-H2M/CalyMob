const admin = require('firebase-admin');
const { calculateOgmCheckDigit, formatOgmDisplay, validateOgm } = require('./ogm');

const PAYMENT_REFERENCES_COLLECTION = 'payment_references';
const SETTINGS_COLLECTION = 'settings';
const OGM_COUNTER_DOC_ID = 'ogm_counter';
const OGM_COUNTER_FIELD = 'counter';
const OGM_COUNTER_START = 1000000001;

function getCounterRef(db, clubId) {
  return db.collection('clubs').doc(clubId)
    .collection(SETTINGS_COLLECTION).doc(OGM_COUNTER_DOC_ID);
}

function getPaymentReferenceRef(db, clubId, ogm) {
  return db.collection('clubs').doc(clubId)
    .collection(PAYMENT_REFERENCES_COLLECTION).doc(ogm);
}

async function generateNextOgm(db, clubId, transaction) {
  const counterRef = getCounterRef(db, clubId);

  const buildNextOgm = async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const nextCounter = counterSnap.exists
      ? Number(counterSnap.get(OGM_COUNTER_FIELD) || 0) + 1
      : OGM_COUNTER_START;

    tx.set(counterRef, {
      [OGM_COUNTER_FIELD]: nextCounter,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    const base10 = String(nextCounter).padStart(10, '0');
    return base10 + calculateOgmCheckDigit(base10);
  };

  if (transaction) {
    return buildNextOgm(transaction);
  }

  return db.runTransaction(async (tx) => buildNextOgm(tx));
}

async function createPaymentReference(db, clubId, data, transaction) {
  const {
    ogm,
    payload_text,
    context_type,
    context_id = '',
    amount_cents,
    created_by,
  } = data || {};

  if (!validateOgm(ogm)) {
    throw new Error(`Invalid OGM for payment reference: ${ogm}`);
  }

  const ref = getPaymentReferenceRef(db, clubId, ogm);
  const payloadText = String(payload_text || '').substring(0, 140);
  const now = admin.firestore.Timestamp.now();
  const docData = {
    ogm,
    ogm_display: formatOgmDisplay(ogm),
    payload_text: payloadText,
    context_type,
    context_id: context_id || '',
    amount_cents: Number.isInteger(amount_cents) ? amount_cents : null,
    status: 'NEW',
    created_by: created_by || 'system',
    created_at: now,
    updated_at: now,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (transaction) {
    transaction.set(ref, docData);
    return ref;
  }

  await ref.set(docData);
  return ref;
}

module.exports = {
  OGM_COUNTER_DOC_ID,
  OGM_COUNTER_FIELD,
  OGM_COUNTER_START,
  PAYMENT_REFERENCES_COLLECTION,
  SETTINGS_COLLECTION,
  createPaymentReference,
  generateNextOgm,
};
