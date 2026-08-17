const { resolveFirstOpenInstallment } = require('./paymentReminderHelpers');

describe('payment reminder installment fallback', () => {
  test('derives Gozo-style installment ids from inscription maps', () => {
    expect(resolveFirstOpenInstallment(
      { payment_plan_enabled: true, payment_installments: null },
      { installment_payments: {
        inst_1: { status: 'paid', amount_due: 500 },
        inst_2: { status: 'unpaid', amount_due: 500 },
      } },
      [],
    )).toMatchObject({ installment_id: 'inst_2', amount_due: 500 });
  });
});
