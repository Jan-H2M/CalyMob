const crypto = require('crypto');
const admin = require('firebase-admin');
const { HttpsError } = require('firebase-functions/v2/https');

const DISPATCH_WINDOW_MS = 120000;

function isActiveRegistration(value) {
  return !['canceled', 'cancelled', 'annulé', 'annule', 'waitlisted']
    .includes(String(value.registration_status || '').trim().toLowerCase());
}

function hasPendingDispatch(data, nowMillis) {
  return Object.values(data?.attempts || {}).some(attempt => {
    const expiresAt = attempt?.expires_at;
    return expiresAt && typeof expiresAt.toMillis === 'function' && expiresAt.toMillis() > nowMillis;
  });
}

/** Mark the short provider-dispatch window without blocking a cancellation. */
async function beginPaymentEmailDispatch(db, clubId, operationId, payerId, intent, installmentId) {
  if (!intent || !intent.allocations?.length) throw new HttpsError('failed-precondition', 'Aucun montant à payer.');
  const operation = db.collection('clubs').doc(clubId).collection('operations').doc(operationId);
  const ids = [...new Set([payerId, ...intent.allocations.map(a => a.inscription_id)])];
  const registrations = ids.map(id => operation.collection('inscriptions').doc(id));
  const dispatches = ids.map(id => operation.collection('payment_email_dispatches').doc(id));
  const attemptId = crypto.randomUUID().replace(/-/g, '');
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + DISPATCH_WINDOW_MS);
  await db.runTransaction(async tx => {
    const [snapshots, dispatchSnapshots] = await Promise.all([
      Promise.all(registrations.map(ref => tx.get(ref))),
      Promise.all(dispatches.map(ref => tx.get(ref))),
    ]);
    const states = new Map(ids.map((id, i) => [id, snapshots[i]]));
    for (const id of ids) {
      const snap = states.get(id);
      if (!snap.exists || !isActiveRegistration(snap.data())) {
        throw new HttpsError('failed-precondition', 'Inscription annulée ou modifiée. Actualisez avant de demander un paiement.');
      }
    }
    for (const allocation of intent.allocations) {
      const data = states.get(allocation.inscription_id).data();
      if (allocation.inscription_id !== payerId && data.parent_inscription_id !== payerId) {
        throw new HttpsError('failed-precondition', 'Les invités ont changé. Actualisez avant de demander un paiement.');
      }
      const installment = installmentId && data.installment_payments?.[installmentId];
      const due = installmentId ? Number(installment?.amount_due) : Number(data.prix || 0) + Number(data.supplement_total || 0);
      if ((installmentId && (!installment || ['paid', 'waived'].includes(installment.status) || installment.transaction_id))
        || (!installmentId && (data.paye === true || data.transaction_id || data.transaction_matched === true))
        || !Number.isFinite(due) || Math.round(due * 100) !== allocation.amount_cents) {
        throw new HttpsError('failed-precondition', 'Le montant ou le paiement a changé. Actualisez avant de réessayer.');
      }
    }
    dispatches.forEach((ref, index) => {
      const existing = dispatchSnapshots[index].data()?.attempts || {};
      const active = Object.fromEntries(Object.entries(existing).filter(([, attempt]) =>
        attempt?.expires_at && typeof attempt.expires_at.toMillis === 'function' && attempt.expires_at.toMillis() > Date.now()));
      tx.set(ref, { attempts: { ...active, [attemptId]: { expires_at: expiresAt } } });
    });
  });
  return { dispatches, attemptId };
}

async function endPaymentEmailDispatch(db, dispatch) {
  if (!dispatch) return;
  const batch = db.batch();
  for (const ref of dispatch.dispatches) {
    // Retain the short-lived marker after acceptance: cancellation immediately
    // after the provider returns should still warn that a mail was sent.
    batch.update(ref, `attempts.${dispatch.attemptId}.finished`, true);
  }
  await batch.commit();
}

module.exports = { beginPaymentEmailDispatch, endPaymentEmailDispatch, hasPendingDispatch };
