const {
  buildMaterialLoanEpcPayload,
  isMaterialLoanManager,
  renderMaterialLoanPaymentEmail,
} = require('./materialLoanPayment');

describe('material loan payment helpers', () => {
  test('creates an EPC payload with the fixed loan reference', () => {
    const payload = buildMaterialLoanEpcPayload({
      beneficiaryName: 'Calypso Diving Club',
      iban: 'BE71 0961 2345 6769',
      amount: 100,
      reference: '+++PRET-2026-0001+++',
    });

    expect(payload.split('\n')).toEqual(expect.arrayContaining([
      'BCD',
      'SCT',
      'BE71096123456769',
      'EUR100.00',
      '+++PRET-2026-0001+++',
    ]));
  });

  test('allows only operational material-loan roles', () => {
    expect(isMaterialLoanManager({ app_role: 'admin' })).toBe(true);
    expect(isMaterialLoanManager({ clubStatuten: ['Encadrant'] })).toBe(true);
    expect(isMaterialLoanManager({ clubStatuten: ['gonflage'] })).toBe(true);
    expect(isMaterialLoanManager({ clubStatuten: ['membre'] })).toBe(false);
  });

  test('renders the payment email without exposing another recipient', () => {
    const email = renderMaterialLoanPaymentEmail({
      memberName: 'Alice DUPONT',
      loanNumber: 'PRET-2026-0001',
      amount: 100,
      beneficiaryName: 'Calypso Diving Club',
      iban: 'BE71096123456769',
      reference: '+++PRET-2026-0001+++',
      clubName: 'Calypso',
    });

    expect(email.subject).toContain('PRET-2026-0001');
    expect(email.html).toContain('Alice DUPONT');
    expect(email.html).toContain('cid:qrcode');
    expect(email.html).toContain('+++PRET-2026-0001+++');
  });
});
