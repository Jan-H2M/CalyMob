const { eventTariffProblems, missingPaidMemberTariffProblem, tariffCategory } = require('./eventTariffSafety');

const member = { id: 'member', label: 'Membre', category: 'Membre', price: 27, is_default: true };
const coach = { id: 'coach', label: 'Encadrants', price: 23, is_guest_tariff: false };
const guest = { id: 'guest', label: 'Invité', price: 0, is_guest_tariff: true };

test.each([
  { event_tariffs: [{ ...member, is_guest_tariff: true }, coach], allow_guests: true },
  { event_tariffs: [guest], prix_membre: 27 },
  { event_tariffs: [coach], price_tbd: true },
  { event_tariffs: [{ ...member, category: 'Non-membre' }] },
])('flags events without an ordinary member tariff: %j', (config) => {
  expect(eventTariffProblems(config)).toEqual([expect.stringContaining('membres ordinaires')]);
});

test.each([
  [{ ...member, category: '  MÉMBRÉS  ', label: 'Autre' }, 'membre'],
  [{ label: 'Prix pour les Me\u0301mbres' }, 'membre'],
  [{ label: 'ÉTUDIANTS membres' }, 'etudiant'],
  [{ label: 'CA' }, 'ca'],
  [{ label: 'Comité' }, 'ca'],
  [{ label: 'Non membres' }, 'non-membre'],
  [{ label: 'Junior membre' }, 'junior'],
  [coach, 'encadrant'],
])('matches the registration category for %j', (tariff, category) => {
  expect(tariffCategory(tariff)).toBe(category);
});

test('paid events with guests need an explicit guest tariff, even for free guests', () => {
  expect(eventTariffProblems({ event_tariffs: [member], allow_guests: true }))
    .toEqual([expect.stringContaining('leur tarif manque')]);
  expect(eventTariffProblems({ event_tariffs: [member, guest], allow_guests: true })).toEqual([]);
  expect(eventTariffProblems({ allow_guests: true })).toEqual([]);
  expect(eventTariffProblems({ prix_membre: 27, allow_guests: true }))
    .toEqual([expect.stringContaining('leur tarif manque')]);
  expect(eventTariffProblems({ payment_required: false, event_tariffs: [member], allow_guests: true })).toEqual([]);
  expect(eventTariffProblems({ price_tbd: true, event_tariffs: [member], allow_guests: true })).toEqual([]);
});

test('deduplicates problems and handles malformed Firestore values', () => {
  expect(eventTariffProblems({
    event_tariffs: [member, { ...member, label: ' ', price: -1 }, null, { ...coach, price: '23' }],
  })).toEqual([
    expect.stringContaining('identifiant unique'),
    expect.stringContaining('libellé'),
    expect.stringContaining('prix valide'),
  ]);
  expect(eventTariffProblems({ event_tariffs: {} })).toEqual([expect.stringContaining('liste des tarifs')]);
});

test('requires an explicit price when removing the last paid legacy tariff', () => {
  expect(eventTariffProblems({}, { previousTariffs: [member] })).toEqual([missingPaidMemberTariffProblem]);
  expect(eventTariffProblems({ payment_required: true })).toEqual([missingPaidMemberTariffProblem]);
  expect(eventTariffProblems({ payment_required: false }, { previousTariffs: [member] })).toEqual([]);
  expect(eventTariffProblems({ prix_membre: 27 }, { previousTariffs: [member] })).toEqual([]);
  expect(eventTariffProblems({ event_tariffs: [{ ...member, price: 0 }] }, { previousTariffs: [member] })).toEqual([]);
});

test('installments must be distinct, complete, finite, and total the tariff price', () => {
  const config = {
    payment_plan_enabled: true,
    payment_installments: [{ id: 'first', label: 'Acompte' }, { id: 'last', label: 'Solde' }],
  };
  const check = amounts => eventTariffProblems({
    ...config,
    event_tariffs: [{ ...member, installment_amounts: amounts }],
  });
  expect(check({ first: 10, last: 17 })).toEqual([]);
  expect(check({ first: 0, last: 27 })).toEqual([]);
  expect(check({ first: 10 })).toEqual([expect.stringContaining('Complétez')]);
  expect(check({ first: 10, last: 16 })).toEqual([expect.stringContaining('La somme')]);
  expect(check({ first: Infinity, last: 27 })).toEqual([
    expect.stringContaining('Chaque montant'), expect.stringContaining('Complétez'),
  ]);
  expect(eventTariffProblems({ ...config, payment_installments: [{ id: 'first', label: ' ' }] }))
    .toEqual([expect.stringContaining('tranches distinctes'), expect.stringContaining('Ajoutez un tarif membre')]);
});
