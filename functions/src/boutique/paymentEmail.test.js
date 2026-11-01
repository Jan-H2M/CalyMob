jest.mock('../utils/emailDelivery', () => ({ sendEmailWithConfig: jest.fn(async () => ({ provider: 'resend', messageId: 'qa-message' })) }));
jest.mock('../utils/communicationTemplates', () => ({
  buildEmailRouting: jest.fn(() => ({ headers: {}, replyKey: 'qa' })),
  logEmailHistoryAndCommunication: jest.fn(async () => {}),
  resolveCommunicationTemplate: jest.fn(async () => ({ template: { id: 'qa-template', name: 'QA' } })),
  renderCommunicationTemplate: jest.fn((_template, data) => ({ subject: 'Commande QA', html: '<p>' + data.amountFormatted + '</p>' })),
}));
jest.mock('qrcode', () => ({ toDataURL: jest.fn(async () => 'data:image/png;base64,UUE=') }));
const { sendBoutiqueOrderEmail } = require('./createOrder');
const { buildAmendmentPlan, currentPaymentRequest, requestPaymentReference } = require('./paymentPlan');
const { sendEmailWithConfig } = require('../utils/emailDelivery');
const QRCode = require('qrcode');
const { resolveCommunicationTemplate } = require('../utils/communicationTemplates');
const { projectPlanReceipt } = require('./paymentPlan');

function fixture(initial = 72, supplement = 6.62, reported = true) {
  const order = { orderNumber: 'BTQ-2026-9001', structuredCommunication: '+++BTQ-2026-9001+++',
    status: 'awaiting_payment', buyer: { userId: 'qa-member', displayName: 'QA Buyer', email: 'qa@example.test' },
    pricing: { total: initial }, payment: { status: 'pending', amount: initial, iban: 'BE68539007547034', beneficiary: 'Club QA', qrCodeUrl: 'OLD FULL QR' }, items: [] };
  order.paymentPlan = buildAmendmentPlan(order, Math.round((initial + supplement) * 100) / 100, reported, 'qa-revision');
  order.pricing.total = Math.round((initial + supplement) * 100) / 100;
  const orderRef = { id: 'qa-order', get: jest.fn(async () => ({ exists: true, data: () => order })), update: jest.fn(async () => {}) };
  const clubRef = { firestore: {}, collection: () => ({ doc: (name) => ({ get: async () => ({
    exists: true, data: () => name === 'email_config' ? { provider: 'resend', resend: { apiKey: 'synthetic-not-a-secret', fromEmail: 'club@example.test' } } : { clubName: 'Club QA' },
  }) }) }) };
  return { order, orderRef, clubRef, clubId: 'calypso' };
}
beforeEach(() => jest.clearAllMocks());
test('email regenerates only the actual 6.62 request QR and warns against stale full-total instructions', async () => {
  const input = fixture();
  await sendBoutiqueOrderEmail(input);
  expect(QRCode.toDataURL.mock.calls[0][0].split('\n')[7]).toBe('EUR6.62');
  expect(QRCode.toDataURL.mock.calls[0][0].split('\n')[10]).toBe(currentPaymentRequest(input.order).reference);
  const email = sendEmailWithConfig.mock.calls[0][1];
  expect(email.subject).toContain('Complément de paiement');
  expect(email.html).toContain('6,62 € uniquement');
  expect(email.html).toContain('Ne payez pas à nouveau le total');
  expect(email.html).toContain(currentPaymentRequest(input.order).reference);
  expect(email.attachments[0].content).toBe('UUE=');
  expect(input.orderRef.update).toHaveBeenCalledTimes(1);
  expect(input.order.payment.status).toBe('pending');
});
test.each([[42.37, 3.19], [25, 25], [19.99, 0.01]])('generic %s plus %s email shows only the supplement with its own copyable reference', async (initial, supplement) => {
  const input = fixture(initial, supplement);
  await sendBoutiqueOrderEmail(input);
  const request = currentPaymentRequest(input.order);
  const qr = QRCode.toDataURL.mock.calls[0][0].split('\n');
  expect(qr[7]).toBe('EUR' + supplement.toFixed(2));
  expect(qr[10]).toBe(request.reference);
  expect(qr[10]).not.toBe(input.order.structuredCommunication);
  expect(sendEmailWithConfig.mock.calls[0][1].html).toContain(request.reference);
});
test('not-yet-sent full replacement instructions do not incorrectly forbid paying the new total', async () => {
  const input = fixture(42.37, 3.19, false);
  await sendBoutiqueOrderEmail(input);
  expect(QRCode.toDataURL.mock.calls[0][0].split('\n')[7]).toBe('EUR45.56');
  expect(sendEmailWithConfig.mock.calls[0][1].html).not.toContain('Ne payez pas à nouveau le total');
});
test('email refuses a concurrent revision change before any external send or metadata write', async () => {
  const input = fixture();
  input.orderRef.get.mockResolvedValue({ exists: true, data: () => ({
    ...input.order, paymentPlan: { ...input.order.paymentPlan, revision: 'different' },
  }) });
  await expect(sendBoutiqueOrderEmail(input)).rejects.toThrow('La demande de paiement a changé');
  expect(sendEmailWithConfig).not.toHaveBeenCalled();
  expect(input.orderRef.update).not.toHaveBeenCalled();
});

test('a supplement received during late template resolution suppresses the obsolete e-mail', async () => {
  const input = fixture();
  resolveCommunicationTemplate.mockImplementationOnce(async () => {
    input.order.paymentPlan = projectPlanReceipt(input.order, 'late-extra-receipt', 6.62, 'qa-time', requestPaymentReference(input.order, currentPaymentRequest(input.order))).plan;
    return { template: { id: 'qa-template', name: 'QA' } };
  });
  await expect(sendBoutiqueOrderEmail(input)).rejects.toThrow('La demande de paiement a changé');
  expect(sendEmailWithConfig).not.toHaveBeenCalled();
  expect(input.orderRef.update).not.toHaveBeenCalled();
});

test('a legacy initial order gets a fresh QR and full manual details even with an old custom template', async () => {
  const input = fixture(41.5, 0.01, false);
  delete input.order.paymentPlan;
  input.order.pricing.total = 41.5;
  input.order.payment.amount = 999; // stale historical snapshot must be ignored
  await sendBoutiqueOrderEmail(input);
  const email = sendEmailWithConfig.mock.calls[0][1];
  expect(QRCode.toDataURL.mock.calls[0][0].split('\n')[7]).toBe('EUR41.50');
  expect(email.html).toContain('41,50 €');
  expect(email.html).toContain('BE68 5390 0754 7034');
  expect(email.html).toContain('Club QA');
  expect(email.html).toContain('+++BTQ-2026-9001+++');
  expect(email.html).toContain('pas une communication structurée');
  expect(email.html).toContain('cid:qrcode');
  expect(email.attachments[0].content).toBe('UUE=');
});
test('an initial receipt arriving during mail preparation suppresses obsolete instructions too', async () => {
  const input = fixture();
  delete input.order.paymentPlan;
  resolveCommunicationTemplate.mockImplementationOnce(async () => {
    input.order.status = 'paid'; input.order.payment.status = 'paid'; input.order.payment.bankRef = 'qa-receipt';
    return { template: { id: 'qa-template', name: 'QA' } };
  });
  await expect(sendBoutiqueOrderEmail(input)).rejects.toThrow('La demande de paiement a changé');
  expect(sendEmailWithConfig).not.toHaveBeenCalled();
});
