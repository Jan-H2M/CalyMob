const fixtures = require('../../../test/fixtures/boutique_payment_context.json');
const { currentBoutiquePayment } = require('./paymentContext');
test.each(fixtures.filter((f) => f.expected))('shared Dart/server payment contract: $name', ({ order, expected }) => {
  expect(currentBoutiquePayment(order)).toEqual(expected);
});
