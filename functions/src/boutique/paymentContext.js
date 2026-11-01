const { buildEpcQrPayload, buildDomainError } = require('./shared');
const { currentPaymentRequest, receivedCents, validatePlan, requestPaymentReference } = require('./paymentPlan');

function currentBoutiquePayment(order) {
  if (!['awaiting_payment', 'paid'].includes(order.status)) {
    throw buildDomainError('ORDER_NOT_CANCELLABLE', 'Cette commande ne peut plus être payée.');
  }
  const payment = order.payment || {};
  let request = null; let receivedAmount = 0; let reportedAmount = 0;
  if (order.paymentPlan) {
    const plan = validatePlan(order.paymentPlan);
    request = currentPaymentRequest(order);
    receivedAmount = receivedCents(plan) / 100;
    reportedAmount = plan.requests.filter((r) => r.status === 'pending' && r.reportedSent).reduce((sum, r) => sum + r.amount, 0);
  } else if (order.status === 'awaiting_payment' && payment.status === 'pending') {
    request = { id: 'initial', amount: Number(order.pricing?.total), kind: 'initial' };
  } else if (payment.status === 'paid' && payment.bankRef) {
    receivedAmount = Number(payment.matchedAmount ?? order.pricing?.total ?? 0);
  }
  const amount = request?.amount || 0;
  if (!Number.isFinite(amount) || amount < 0) throw buildDomainError('INVALID_INPUT', 'Montant invalide.');
  const communication = request && order.paymentPlan ? requestPaymentReference(order, request)
    : order.structuredCommunication || payment.communication || order.orderNumber;
  const iban = String(payment.iban || '').replace(/\s/g, '').toUpperCase();
  const beneficiary = String(payment.beneficiary || '');
  if (request && (!iban || !beneficiary || !communication)) {
    throw buildDomainError('INVALID_INPUT', 'Coordonnées de paiement indisponibles. Contactez le club.');
  }
  return {
    orderNumber: order.orderNumber,
    orderTotal: Number(order.pricing?.total || 0),
    receivedAmount, reportedAmount,
    amount, requestId: request?.id || null, kind: request?.kind || null,
    revision: order.paymentPlan?.revision || 'legacy',
    communication, iban, beneficiary,
    epcPayload: request ? buildEpcQrPayload({ iban, beneficiary, amount, communication }) : null,
    awaitingBankReceipt: !request && order.payment?.status !== 'paid',
    fullyPaid: !request && order.payment?.status === 'paid',
    refundAmount: Math.max(0, receivedAmount - Number(order.pricing?.total || 0)),
    oldInstructionsObsolete: Boolean(order.paymentPlan),
    presentation: payment.presentation || 'unspecified',
    emailStatus: payment.email_status || null,
  };
}
function assertCurrentPayment(expected, actual) {
  if (expected.requestId !== actual.requestId || expected.revision !== actual.revision || expected.amount !== actual.amount
      || expected.communication !== actual.communication) {
    throw buildDomainError('INVALID_INPUT', 'La demande de paiement a changé. Ouvrez à nouveau le paiement actuel.');
  }
}
module.exports = { currentBoutiquePayment, assertCurrentPayment };
