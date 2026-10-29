// Server-authoritative split receipts for one amended Boutique order.
// A reported transfer is a request, never a receipt.
const { createHash } = require('crypto');
const FULL_REFERENCE = /^BTQ-\d{4}-\d{4,}(?:-S[A-F0-9]{24})?$/;
function normalizedPlanReference(value) {
  const text = String(value || '').toUpperCase();
  // A communication spanning payment domains is ambiguous regardless of token
  // order. Never let a BTQ suffix become an OP/REM/COT/PRET fallback.
  if (/(?:^|[^\p{L}\p{M}\p{N}\p{Pc}-])(?:OP|REM|COT|PRET)-[A-Z0-9-]+/u.test(text)
      || /\+\+\+(?:[PS][A-Z]{4}|\d[A-Z0-9]{5})\+\+\+/.test(text)) return null;
  const tokens = text.match(/BTQ-[\p{L}\p{M}\p{N}\p{Pc}-]+/gu) || [];
  if (tokens.some((token) => !FULL_REFERENCE.test(token))) return null;
  const matches = [...text.matchAll(/(?:^|[^\p{L}\p{M}\p{N}\p{Pc}-])(BTQ-\d{4}-\d{4,}(?:-S[A-F0-9]{24})?)(?![\p{L}\p{M}\p{N}\p{Pc}-])/gu)].map((match) => match[1]);
  const keys = [...new Set(matches)];
  return keys.length === 1 ? keys[0] : null;
}
function baseBoutiqueReference(value) {
  return normalizedPlanReference(value)?.replace(/-S[A-F0-9]{24}$/, '') || null;
}
function orderBaseReference(order) {
  const base = baseBoutiqueReference(order.structuredCommunication || order.payment?.communication || order.orderNumber);
  const numberBase = order.orderNumber ? baseBoutiqueReference(order.orderNumber) : base;
  if (!base || base !== numberBase) throw planError('boutique_payment_plan_invalid');
  return base;
}
function supplementReference(order, requestId) {
  const base = orderBaseReference(order);
  const suffix = createHash('sha256').update(base + ':' + requestId).digest('hex').slice(0, 24).toUpperCase();
  return '+++' + base + '-S' + suffix + '+++';
}
function requestPaymentReference(order, request) {
  const base = orderBaseReference(order);
  // Existing v1 requests without a reference must keep their already-issued
  // original communication. Never silently migrate an in-flight transfer.
  if (request.reference === undefined) return '+++' + base + '+++';
  const key = normalizedPlanReference(request.reference);
  const expected = request.kind === 'initial' ? base : normalizedPlanReference(supplementReference(order, request.id));
  if (!key || key !== expected) throw planError('boutique_payment_plan_invalid');
  return '+++' + key + '+++';
}
function planError(code) { const error = new Error(code); error.code = code; return error; }
function cents(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0
      || !Number.isSafeInteger(Math.round(value * 100))
      || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) throw planError('boutique_payment_plan_invalid');
  return Math.round(value * 100);
}
function addCents(left, right) {
  const sum = left + right;
  if (!Number.isSafeInteger(sum)) throw planError('boutique_payment_plan_invalid');
  return sum;
}
function money(value) { return value / 100; }
function validatePlan(plan) {
  if (!plan || plan.version !== 1 || typeof plan.revision !== 'string' || !plan.revision
      || !Array.isArray(plan.requests) || !plan.requests.length || plan.requests.length > 100) throw planError('boutique_payment_plan_invalid');
  const ids = new Set(); const refs = new Set(); const communications = new Set();
  for (const request of plan.requests) {
    if (!request || typeof request.id !== 'string' || !request.id || ids.has(request.id)
        || !['initial', 'supplement'].includes(request.kind)
        || !['pending', 'received', 'cancelled'].includes(request.status)
        || cents(request.amount) <= 0) throw planError('boutique_payment_plan_invalid');
    ids.add(request.id);
    if (request.reference !== undefined) {
      const reference = normalizedPlanReference(request.reference);
      if (!reference || communications.has(reference)) throw planError('boutique_payment_plan_invalid');
      communications.add(reference);
    }
    if (request.status === 'received') {
      if (typeof request.bankRef !== 'string' || !request.bankRef || refs.has(request.bankRef)) throw planError('boutique_payment_plan_invalid');
      refs.add(request.bankRef);
    } else if (request.bankRef) throw planError('boutique_payment_plan_invalid');
  }
  const active = plan.requests.filter((r) => r.status !== 'cancelled');
  active.reduce((sum, request) => addCents(sum, cents(request.amount)), 0);
  if (active.filter((r) => r.kind === 'initial').length !== 1
      || active.filter((r) => r.kind === 'supplement' && r.status === 'pending').length > 1) throw planError('boutique_payment_plan_invalid');
  return plan;
}
function receivedCents(plan) {
  validatePlan(plan);
  return plan.requests.filter((r) => r.status === 'received').reduce((sum, r) => addCents(sum, cents(r.amount)), 0);
}
function buildAmendmentPlan(order, total, reportInitialTransfer, revision) {
  const target = cents(total);
  if (target <= 0) throw planError('boutique_payment_plan_invalid');
  const existing = order.paymentPlan ? validatePlan(order.paymentPlan) : null;
  if (existing?.requests.some((r) => r.status === 'pending' && !r.reportedSent)) {
    throw planError('boutique_pending_payment_request_requires_review');
  }
  let requests;
  if (existing) {
    requests = existing.requests.map((r) => ({ ...r }));
    // Undelivered payment requests are superseded, never receipt history.
    requests = requests.map((r) => r.status === 'pending' && r.kind === 'supplement' ? { ...r, status: 'cancelled' } : r);
    const initial = requests.find((r) => r.kind === 'initial' && r.status !== 'cancelled');
    if (!initial) throw planError('boutique_payment_plan_invalid');
    if (initial.status === 'pending' && !initial.reportedSent && !reportInitialTransfer
        && !requests.some((r) => r.status === 'received')) initial.amount = total;
    if (initial.status === 'pending' && reportInitialTransfer) initial.reportedSent = true;
  } else if (order.payment?.status === 'paid' && order.payment?.bankRef) {
    const amount = order.payment.matchedAmount ?? order.paymentAdjustment?.paidAmount ?? order.pricing?.total;
    cents(amount);
    requests = [{ id: 'initial', kind: 'initial', amount, status: 'received', bankRef: order.payment.bankRef,
      reference: '+++' + orderBaseReference(order) + '+++',
      ...(order.payment.paidAt ? { receivedAt: order.payment.paidAt } : {}) }];
  } else {
    const amount = reportInitialTransfer ? (order.pendingTransfer?.reportedAmount ?? order.pricing?.total) : total;
    cents(amount);
    requests = [{ id: 'initial', kind: 'initial', amount, status: 'pending', reportedSent: reportInitialTransfer === true,
      reference: '+++' + orderBaseReference(order) + '+++' }];
  }
  const committed = requests.filter((r) => r.status !== 'cancelled').reduce((sum, r) => addCents(sum, cents(r.amount)), 0);
  if (target > committed) requests.push({
    id: 'supplement-' + revision.slice(0, 24), kind: 'supplement',
    amount: money(target - committed), status: 'pending', reportedSent: false,
    reference: supplementReference(order, 'supplement-' + revision.slice(0, 24)),
  });
  return validatePlan({ version: 1, revision, requests });
}
function currentPaymentRequest(order) {
  if (!order.paymentPlan) return null;
  const plan = validatePlan(order.paymentPlan);
  if (!['awaiting_payment', 'paid'].includes(order.status)) return null;
  return plan.requests.find((r) => r.status === 'pending' && r.kind === 'supplement')
    || plan.requests.find((r) => r.status === 'pending' && !r.reportedSent) || null;
}
function selectReceiptRequest(order, transactionId, amount, communication) {
  const plan = validatePlan(order.paymentPlan);
  const amountCents = cents(amount);
  const existing = plan.requests.find((r) => r.bankRef === transactionId);
  if (existing && cents(existing.amount) !== amountCents) throw planError('boutique_receipt_changed');
  const candidates = existing ? [existing] : plan.requests.filter((r) => r.status === 'pending' && cents(r.amount) === amountCents);
  if (!candidates.length) throw planError('amount_mismatch');
  const reference = normalizedPlanReference(communication);
  if (!reference) throw planError('boutique_reference_mismatch');
  const matching = candidates.filter((r) => normalizedPlanReference(requestPaymentReference(order, r)) === reference);
  if (matching.length !== 1) throw planError(matching.length > 1 ? 'boutique_payment_plan_ambiguous' : 'boutique_reference_mismatch');
  return matching[0];
}
function receiptMatchesPlan(order, transactionId, amount, communication) {
  if (!order.paymentPlan) return false;
  try { selectReceiptRequest(order, transactionId, amount, communication); return true; } catch { return false; }
}
function projectPlanReceipt(order, transactionId, amount, receivedAt, communication) {
  const plan = validatePlan(order.paymentPlan);
  const previous = plan.requests.find((r) => r.bankRef === transactionId);
  const request = selectReceiptRequest(order, transactionId, amount, communication);
  const requests = plan.requests.map((r) => r.id === request.id ? { ...r, status: 'received', bankRef: transactionId, receivedAt: r.receivedAt || receivedAt } : { ...r });
  const updated = { ...plan, requests };
  const received = receivedCents(updated); const total = cents(order.pricing?.total);
  const unpaid = requests.some((r) => r.status === 'pending');
  return {
    plan: updated, requestId: request.id, alreadyReceived: Boolean(previous),
    receivedAmount: money(received), fullyPaid: !unpaid && received >= total,
    outstandingAmount: money(Math.max(0, total - received)),
    refundAmount: money(Math.max(0, received - total)),
  };
}
module.exports = { buildAmendmentPlan, currentPaymentRequest, receivedCents, receiptMatchesPlan, projectPlanReceipt, validatePlan,
  normalizedPlanReference, baseBoutiqueReference, requestPaymentReference };
