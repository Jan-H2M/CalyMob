import 'package:calymob/models/member_profile.dart';
import 'package:calymob/models/operation.dart';
import 'package:calymob/models/tariff.dart';
import 'package:calymob/utils/tariff_utils.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final now = DateTime(2026, 10, 2);
  final operation = Operation(
    id: 'barrages-2026-10-04',
    type: 'evenement',
    titre: "Barrages de l'Eau d'Heure",
    montantPrevu: 0,
    statut: 'ouvert',
    eventTariffs: [
      Tariff(
        id: 'member',
        label: 'Membre',
        category: 'membre',
        price: 6,
        isDefault: true,
      ),
      Tariff(
        id: 'encadrant',
        label: 'Encadrants',
        category: 'Encadrants',
        price: 2,
      ),
    ],
    createdAt: now,
    updatedAt: now,
  );

  MemberProfile profile(
    List<String> clubStatuten, {
    String? fonctionDefaut,
  }) {
    return MemberProfile(
      id: 'member-1',
      nom: 'Test',
      prenom: 'Membre',
      email: 'member@example.test',
      clubStatuten: clubStatuten,
      fonctionDefaut: fonctionDefaut,
    );
  }

  group('event tariff role eligibility', () {
    test('official encadrant receives the encadrant tariff', () {
      for (final role in const [
        'Encadrant',
        'Encadrants',
        'E',
        'Encadrant Carrière',
      ]) {
        expect(
          TariffUtils.computeRegistrationPrice(
            operation: operation,
            profile: profile([role]),
          ),
          2,
          reason: role,
        );
      }
    });

    test('pool-only assistants keep the member tariff', () {
      for (final roles in const [
        ['Membre', 'Encadrants et assistants'],
        ['Membre', 'Encadrant Piscine'],
        ['Membre', 'P'],
      ]) {
        expect(
          TariffUtils.computeRegistrationPrice(
            operation: operation,
            profile: profile(roles),
          ),
          6,
          reason: roles.join(', '),
        );
      }
    });

    test('official default roles use the same tariff as the server', () {
      for (final role in const ['E', 'Encadrant Carrière']) {
        expect(
          TariffUtils.computeRegistrationPrice(
            operation: operation,
            profile: profile(['Membre'], fonctionDefaut: role),
          ),
          2,
          reason: role,
        );
      }
    });

    test('pool-only default roles do not inherit the encadrant tariff', () {
      for (final role in const ['P', 'Encadrants et assistants']) {
        expect(
          TariffUtils.computeRegistrationPrice(
            operation: operation,
            profile: profile(['Membre'], fonctionDefaut: role),
          ),
          6,
          reason: role,
        );
      }
    });
  });
}
