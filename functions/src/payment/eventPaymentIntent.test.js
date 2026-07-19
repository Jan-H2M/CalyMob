const {
  allocationSignature,
  buildInstallmentAllocations,
  buildIntentId,
  normalizePaymentCommunication,
} = require('./eventPaymentIntent');

describe('eventPaymentIntent', () => {
  test('snapshots a member and all open guests without folding amounts into the member', () => {
    const allocations = buildInstallmentAllocations({
      participantId: 'samuel',
      memberFirstName: 'Samuel',
      memberLastName: 'DURT',
      installmentPayment: {
        ownOpen: true,
        amountDue: 500,
        guests: [
          { inscriptionId: 'clara', name: 'clara mathues', prix: 250 },
          { inscriptionId: 'rose', name: 'rose durt', prix: 250 },
          { inscriptionId: 'remy', name: 'remy durt', prix: 250 },
        ],
      },
    });

    expect(allocations).toEqual([
      { inscription_id: 'samuel', person_name: 'Samuel DURT', amount_cents: 50000, role: 'member' },
      { inscription_id: 'clara', person_name: 'clara mathues', amount_cents: 25000, role: 'guest' },
      { inscription_id: 'rose', person_name: 'rose durt', amount_cents: 25000, role: 'guest' },
      { inscription_id: 'remy', person_name: 'remy durt', amount_cents: 25000, role: 'guest' },
    ]);
  });

  test('creates a guest-only intent when the member installment is already paid', () => {
    expect(buildInstallmentAllocations({
      participantId: 'patrick',
      memberFirstName: 'Patrick',
      memberLastName: 'BAUFFE',
      installmentPayment: {
        ownOpen: false,
        amountDue: 0,
        guests: [{ inscriptionId: 'marie', name: 'Marie vandeputte', prix: 250 }],
      },
    })).toEqual([
      { inscription_id: 'marie', person_name: 'Marie vandeputte', amount_cents: 25000, role: 'guest' },
    ]);
  });

  test('normalizes bank variants of the same communication', () => {
    expect(normalizePaymentCommunication('+++OP-300006+++ Gozo ÉDM  Tranche 2 Samuel DURT'))
      .toBe(normalizePaymentCommunication(' OP-300006 / Gozo EDM tranche 2 Samuel Durt '));
  });

  test('intent ids are stable regardless of allocation order', () => {
    const a = [
      { inscription_id: 'member', amount_cents: 50000 },
      { inscription_id: 'guest', amount_cents: 25000 },
    ];
    const b = [...a].reverse();
    expect(allocationSignature(a)).toBe(allocationSignature(b));
    expect(buildIntentId('op', 'payer', 'inst', a)).toBe(buildIntentId('op', 'payer', 'inst', b));
  });
});
