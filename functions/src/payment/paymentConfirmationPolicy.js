const { HttpsError } = require('firebase-functions/v2/https');

function assertPaymentMethod(operation, method) {
  const required = Object.prototype.hasOwnProperty.call(operation, 'payment_required')
    ? operation.payment_required === true
    : Number(operation.prix_membre || 0) > 0
      || (Array.isArray(operation.event_tariffs)
        && operation.event_tariffs.some((tariff) => Number(tariff?.price || 0) > 0));
  const methods = Array.isArray(operation.allowed_payment_methods)
    ? operation.allowed_payment_methods : ['qr_immediate', 'qr_email', 'on_site'];
  if (!required || !methods.includes(method)) {
    throw new HttpsError('failed-precondition', 'Ce mode de paiement n’est pas autorisé pour cette activité');
  }
}

function assertActive(inscription) {
  if (inscription.registration_status === 'canceled') {
    throw new HttpsError('failed-precondition', 'Une inscription annulée ne peut pas être payée');
  }
}

function positiveAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpsError('failed-precondition', 'Aucun montant valide restant à payer');
  }
  return amount;
}

module.exports = { assertPaymentMethod, assertActive, positiveAmount };
