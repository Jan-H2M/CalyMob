const { amountForRegistration } = require('./eventDirectQr');

describe('amount for a direct event payment QR', () => {
  test('uses the remaining price and supplements in cents', () => {
    expect(amountForRegistration({ prix: 15, supplement_total: 2.5 }, null)).toBe(1750);
  });
  test('does not charge paid or waived installments', () => {
    const registration = { installment_payments: {
      first: { status: 'paid', amount_due: 10 },
      second: { status: 'unpaid', amount_due: 7.5 },
    } };
    expect(amountForRegistration(registration, 'first')).toBe(0);
    expect(amountForRegistration(registration, 'second')).toBe(750);
    expect(amountForRegistration(registration, null)).toBe(750);
    expect(amountForRegistration({ prix: 15, payment_status: 'settled' }, null)).toBe(0);
    expect(amountForRegistration({ paye: true, installment_payments: { a: { status: 'unpaid', amount_due: 15 } } }, 'a')).toBe(0);
    expect(amountForRegistration({ transaction_matched: true, prix: 15 }, null)).toBe(0);
  });
  test('fails closed for bank review and ambiguous transactions', () => {
    expect(() => amountForRegistration({ prix: 15, payment_status: 'manual_review' }, null)).toThrow();
    expect(() => amountForRegistration({ prix: 15, payment_status: 'pending_bank' }, null)).toThrow();
    expect(() => amountForRegistration({ prix: 15, transaction_id: 'pending' }, null)).toThrow();
    expect(() => amountForRegistration({ prix: 15, payment_status: 'partial', amount_paid: 5 }, null)).toThrow();
    expect(() => amountForRegistration({ installment_payments: { a: { status: 'unpaid', amount_due: 5, transaction_id: 'pending' } } }, 'a')).toThrow();
    expect(() => amountForRegistration({ installment_payments: { a: { status: 'unpaid', amount_due: 5, amount_paid: 2 } } }, 'a')).toThrow();
  });
  test('rejects missing installments and invalid amounts', () => {
    expect(() => amountForRegistration({ installment_payments: {} }, 'missing')).toThrow();
    expect(() => amountForRegistration({ prix: -1 }, null)).toThrow();
  });
});
