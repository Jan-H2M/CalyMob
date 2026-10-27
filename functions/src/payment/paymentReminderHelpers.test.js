const { resolveFirstOpenInstallment } = require('./paymentReminderHelpers');
const { generatePaymentCommunication } = require('./sendPaymentQrEmail');

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

describe('generatePaymentCommunication whitespace normalization', () => {
  test('collapses double spaces when installmentLabel is empty so 30-char bank truncation preserves an extra character', () => {
    const comm = generatePaymentCommunication(
      'PAAHG',
      'EYzu2VtdBGcgIx19g7lk',
      'Vodelée',
      null,
      'Sylvie',
      'DEFALQUE',
      ''
    );
    expect(comm).toBe('+++OP-PAAHG+++ Vodelée Sylvie DEFALQUE');
    expect(comm).not.toContain('  ');
    expect(comm.substring(0, 30)).toBe('+++OP-PAAHG+++ Vodelée Sylvie ');
  });

  test('preserves single spaces when installmentLabel is present', () => {
    const comm = generatePaymentCommunication(
      'PAAAG',
      'op1',
      'Gozo 2026',
      null,
      'Jean',
      'Dupont',
      'Acompte 2'
    );
    expect(comm).toBe('+++OP-PAAAG+++ Gozo deux mille vingt-six Tranche 2 Jean Dupont');
  });
});
