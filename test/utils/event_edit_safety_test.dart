import 'package:calymob/models/tariff.dart';
import 'package:calymob/screens/operations/event_tariff_editor.dart';
import 'package:calymob/utils/event_edit_safety.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

const member = {
  'id': 'member',
  'label': 'Membre',
  'category': 'Membre',
  'price': 27,
  'is_default': true,
};
const coach = {'id': 'coach', 'label': 'Encadrants', 'price': 23};
const guest = {
  'id': 'guest',
  'label': 'Invité',
  'price': 0,
  'is_guest_tariff': true,
};

void main() {
  test('the Nemo 33 configuration has no ordinary member tariff', () {
    for (final priceTbd in [false, true]) {
      final problems = eventTariffProblems({
        'allow_guests': true,
        'price_tbd': priceTbd,
        'event_tariffs': [
          {...member, 'is_guest_tariff': true},
          coach,
        ],
      });
      expect(problems, [ordinaryMemberTariffProblem]);
    }
  });

  test('category and label fallbacks mirror the server', () {
    expect(registrationTariffCategory(' MÉMBRÉS ', 'Non-membre'), 'membre');
    expect(registrationTariffCategory('', 'Pour les Me\u0301mbres'), 'membre');
    expect(registrationTariffCategory(null, 'Carte membres'), 'membre');
    expect(registrationTariffCategory(null, 'Encadrants membres'), 'encadrant');
    expect(registrationTariffCategory(null, 'Non membres'), 'non-membre');
    expect(registrationTariffCategory(null, 'Comité'), 'ca');
    expect(registrationTariffCategory(null, 'Étudiants membres'), 'etudiant');
    expect(registrationTariffCategory(null, 'Juniors membres'), 'junior');
    expect(
        eventTariffProblems({
          'event_tariffs': [guest],
          'prix_membre': 27
        }),
        [ordinaryMemberTariffProblem]);
  });

  test('paid guest-enabled events require an explicit guest rate', () {
    expect(
      eventTariffProblems({
        'event_tariffs': [member],
        'allow_guests': true
      }),
      [contains('leur tarif manque')],
    );
    expect(
        eventTariffProblems({
          'event_tariffs': [member, guest],
          'allow_guests': true,
        }),
        isEmpty);
    expect(eventTariffProblems({'allow_guests': true}), isEmpty);
    expect(eventTariffProblems({'prix_membre': 27, 'allow_guests': true}),
        [contains('leur tarif manque')]);
  });

  test('empty labels, duplicate IDs and invalid prices all block a write', () {
    final problems = eventTariffProblems({
      'event_tariffs': [
        member,
        {...member, 'label': ' ', 'price': -1},
        {...guest, 'id': '', 'price': double.nan},
      ],
    });
    expect(problems, [
      contains('identifiant unique'),
      contains('libellé'),
      contains('prix valide'),
    ]);
    expect(parseEventPriceInput('27,50'), 27.5);
    expect(parseEventPriceInput('NaN'), isNull);
    expect(parseEventPriceInput('inconnu'), isNull);
    expect(parseEventPriceInput('-1'), isNull);
  });

  test('a legacy tariff with a missing price needs correction before saving',
      () {
    final tariff = EditableEventTariff.fromTariff(
      Tariff.fromMap({...member, 'price': null}),
    );
    expect(
      eventTariffProblems({
        'event_tariffs': [tariff.toMap()]
      }),
      [contains('prix valide')],
    );
    tariff.price = 0;
    expect(
        eventTariffProblems({
          'event_tariffs': [tariff.toMap()]
        }),
        isEmpty);
  });

  test('paid tariffs must not disappear implicitly', () {
    expect(eventTariffProblems({}, previousTariffs: [member]),
        [contains('devenir gratuite implicitement')]);
    expect(
        eventTariffProblems({'payment_required': false},
            previousTariffs: [member]),
        isEmpty);
    expect(eventTariffProblems({'prix_membre': 27}, previousTariffs: [member]),
        isEmpty);
    expect(
        eventTariffProblems({
          'event_tariffs': [
            {...member, 'price': 0},
          ],
        }, previousTariffs: [
          member
        ]),
        isEmpty);
  });

  test('the editor preserves installment amounts and validates their total',
      () {
    final tariff = EditableEventTariff.fromTariff(Tariff.fromMap({
      ...member,
      'installment_amounts': {'first': 10, 'last': 17},
      'self_selectable': false,
      'requires_admin_validation': true,
    }));
    final settings = {
      'payment_plan_enabled': true,
      'payment_installments': [
        {'id': 'first', 'label': 'Acompte'},
        {'id': 'last', 'label': 'Solde'},
      ],
      'event_tariffs': [tariff.toMap()],
    };
    expect(eventTariffProblems(settings), isEmpty);
    expect(tariff.toMap()['self_selectable'], isFalse);
    expect(tariff.toMap()['requires_admin_validation'], isTrue);
    tariff.price = 26;
    expect(
      eventTariffProblems({
        ...settings,
        'event_tariffs': [tariff.toMap()]
      }),
      [contains('La somme des tranches')],
    );
    expect(
        eventTariffProblems({
          ...settings,
          'event_tariffs': [
            {
              ...member,
              'installment_amounts': {'first': 10}
            },
          ],
        }),
        [contains('Complétez chaque montant de tranche')]);
  });

  testWidgets('marking the only member tariff as guest-only warns inline',
      (tester) async {
    final tariff = EditableEventTariff.fromTariff(Tariff.fromMap(member));
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: StatefulBuilder(
          builder: (context, setState) => EventTariffEditorRow(
            tariff: tariff,
            hasOrdinaryMemberTariff: tariff.isOrdinaryMember,
            onChanged: () => setState(() {}),
            onRemove: () {},
          ),
        ),
      ),
    ));
    expect(find.text(ordinaryMemberTariffProblem), findsNothing);
    await tester.tap(find.text('Invités uniquement'));
    await tester.pump();
    expect(tariff.isGuestTariff, isTrue);
    expect(find.text(ordinaryMemberTariffProblem), findsOneWidget);
    await tester.tap(find.text('Invités uniquement'));
    await tester.pump();
    expect(find.text(ordinaryMemberTariffProblem), findsNothing);
  });
}
