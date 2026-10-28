const { buildAmendmentPlan, projectPlanReceipt, currentPaymentRequest } = require('./paymentPlan');
const { currentBoutiquePayment, assertCurrentPayment } = require('./paymentContext');
const { getBoutiqueOrderPaymentHandler } = require('./getOrderPayment');
const { cancelBoutiqueOrderHandler } = require('./cancelOrder');

function seed() {
  const order = {
    status: 'awaiting_payment', orderNumber: 'BTQ-2026-9001', structuredCommunication: '+++BTQ-2026-9001+++',
    buyer: { userId: 'qa-member' },
    pricing: { total: 72 }, payment: { status: 'pending', iban: 'BE68539007547034', beneficiary: 'Club QA', amount: 72, epcPayload: 'OLD QR' },
    items: [],
  };
  order.paymentPlan = buildAmendmentPlan(order, 78.62, true, 'revision-qa-1');
  order.pricing.total = 78.62;
  return order;
}
function dependencies(order, qr = async () => 'data:image/png;base64,QA') {
  const ref = { get: jest.fn(async () => ({ exists: true, data: () => order })) };
  const clubRef = { collection: () => ({ doc: () => ref }) };
  const db = { collection: () => ({ doc: () => clubRef }) };
  return { db, assertAccess: jest.fn(async () => {}), qrToDataURL: qr, ref };
}
const request = { auth: { uid: 'qa-member' }, data: { clubId: 'calypso', orderId: 'qa-order' } };

test('current payment uses only 6.62 in the EPC amount field, not the cached full amount', () => {
  const context = currentBoutiquePayment(seed());
  expect(context.amount).toBe(6.62);
  expect(context.epcPayload.split('\n')[7]).toBe('EUR6.62');
  expect(context.receivedAmount).toBe(0);
  expect(context.reportedAmount).toBe(72);
  expect(context.communication).toBe('+++BTQ-2026-9001+++');
});
test('a supplement received before the original transfer produces no second payment request', () => {
  const order = seed();
  order.paymentPlan = projectPlanReceipt(order, 'extra-receipt', 6.62, 'qa-time').plan;
  const context = currentBoutiquePayment(order);
  expect(context.amount).toBe(0); expect(context.requestId).toBeNull();
  expect(context.reportedAmount).toBe(72); expect(context.receivedAmount).toBe(6.62);
});
test('fully received means complete, with no old or new QR', () => {
  const order = seed();
  order.paymentPlan = projectPlanReceipt(order, 'initial-receipt', 72, 'qa-time').plan;
  order.paymentPlan = projectPlanReceipt(order, 'extra-receipt', 6.62, 'qa-time').plan;
  order.status = 'paid'; order.payment.status = 'paid';
  expect(currentBoutiquePayment(order)).toMatchObject({ amount: 0, epcPayload: null, fullyPaid: true, receivedAmount: 78.62 });
});
test('an old payment context cannot be reused for a revised request or different amount', () => {
  const context = currentBoutiquePayment(seed());
  for (const changed of [{ ...context, revision: 'new' }, { ...context, requestId: 'other' }, { ...context, amount: 78.62 }]) {
    expect(() => assertCurrentPayment(context, changed)).toThrow('La demande de paiement a changé');
  }
});
test('current QR callable requires authentication and ownership and has no write path', async () => {
  const deps = dependencies(seed());
  await expect(getBoutiqueOrderPaymentHandler({ ...request, auth: null }, deps)).rejects.toMatchObject({ code: 'unauthenticated' });
  await expect(getBoutiqueOrderPaymentHandler({ ...request, auth: { uid: 'other-member' } }, deps)).rejects.toMatchObject({ code: 'permission-denied' });
  const result = await getBoutiqueOrderPaymentHandler(request, deps);
  expect(result.amount).toBe(6.62); expect(result.qrCodeUrl).toContain('base64');
});
test('QR generation refuses a concurrent size change rather than returning a stale QR', async () => {
  const order = seed();
  const deps = dependencies(order, async () => { order.paymentPlan.revision = 'changed-during-qr'; return 'OLD'; });
  await expect(getBoutiqueOrderPaymentHandler(request, deps)).rejects.toMatchObject({ code: 'invalid-argument' });
});
test('cancel refuses reported transfer and partial receipt plans with zero writes', async () => {
  for (const received of [false, true]) {
    const order = seed();
    if (received) order.paymentPlan = projectPlanReceipt(order, 'initial-receipt', 72, 'qa-time').plan;
    const deps = dependencies(order);
    const set = jest.fn();
    deps.db.runTransaction = (run) => run({ get: async () => ({ exists: true, data: () => order }), set });
    await expect(cancelBoutiqueOrderHandler(request, deps)).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(set).not.toHaveBeenCalled();
  }
});
test('issued unreceived supplement blocks a repeat edit, preserving the 72 and its 6.62 slot', () => {
  const order = seed();
  expect(() => buildAmendmentPlan(order, 84, true, 'revision-qa-2')).toThrow('boutique_pending_payment_request_requires_review');
  expect(order.paymentPlan.requests[0].amount).toBe(72);
  expect(currentPaymentRequest(order).amount).toBe(6.62);
});
