// Server-authoritative split receipts for one amended Boutique order.
// A reported transfer is a request, never a receipt.
function planError(code) { const error = new Error(code); error.code = code; return error; }
function cents(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0
      || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) throw planError('boutique_payment_plan_invalid');
  return Math.round(value * 100);
}
function money(value) { return value / 100; }
function validatePlan(plan) {
  if (!plan || plan.version !== 1 || typeof plan.revision !== 'string' || !plan.revision
      || !Array.isArray(plan.requests) || !plan.requests.length || plan.requests.length > 100) throw planError('boutique_payment_plan_invalid');
  const ids = new Set(); const refs = new Set();
  for (const request of plan.requests) {
    if (!request || typeof request.id !== 'string' || !request.id || ids.has(request.id)
        || !['initial', 'supplement'].includes(request.kind)
        || !['pending', 'received', 'cancelled'].includes(request.status)
        || cents(request.amount) <= 0) throw planError('boutique_payment_plan_invalid');
    ids.add(request.id);
    if (request.status === 'received') {
      if (typeof request.bankRef !== 'string' || !request.bankRef || refs.has(request.bankRef)) throw planError('boutique_payment_plan_invalid');
      refs.add(request.bankRef);
    } else if (request.bankRef) throw planError('boutique_payment_plan_invalid');
  }
  const active = plan.requests.filter((r) => r.status !== 'cancelled');
  if (active.filter((r) => r.kind === 'initial').length !== 1
      || active.filter((r) => r.kind === 'supplement' && r.status === 'pending').length > 1) throw planError('boutique_payment_plan_invalid');
  return plan;
}
function receivedCents(plan) {
  validatePlan(plan);
  return plan.requests.filter((r) => r.status === 'received').reduce((sum, r) => sum + cents(r.amount), 0);
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
      ...(order.payment.paidAt ? { receivedAt: order.payment.paidAt } : {}) }];
  } else {
    const amount = reportInitialTransfer ? (order.pendingTransfer?.reportedAmount ?? order.pricing?.total) : total;
    cents(amount);
    requests = [{ id: 'initial', kind: 'initial', amount, status: 'pending', reportedSent: reportInitialTransfer === true }];
  }
  const committed = requests.filter((r) => r.status !== 'cancelled').reduce((sum, r) => sum + cents(r.amount), 0);
  if (target > committed) requests.push({
    id: 'supplement-' + revision.slice(0, 24), kind: 'supplement',
    amount: money(target - committed), status: 'pending', reportedSent: false,
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
function receiptMatchesPlan(order, transactionId, amount) {
  if (!order.paymentPlan) return false;
  const plan = validatePlan(order.paymentPlan);
  const amountCents = cents(amount);
  const existing = plan.requests.find((r) => r.bankRef === transactionId);
  return existing ? cents(existing.amount) === amountCents
    : plan.requests.some((r) => r.status === 'pending' && cents(r.amount) === amountCents);
}
function projectPlanReceipt(order, transactionId, amount, receivedAt) {
  const plan = validatePlan(order.paymentPlan);
  const amountCents = cents(amount);
  const previous = plan.requests.find((r) => r.bankRef === transactionId);
  if (previous && cents(previous.amount) !== amountCents) throw planError('boutique_receipt_changed');
  const request = previous || plan.requests.find((r) => r.status === 'pending' && cents(r.amount) === amountCents);
  if (!request) throw planError('amount_mismatch');
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
module.exports = { buildAmendmentPlan, currentPaymentRequest, receivedCents, receiptMatchesPlan, projectPlanReceipt, validatePlan };
