import 'package:calymob/models/member_profile.dart';
import 'package:calymob/models/operation.dart';
import 'package:calymob/models/supplement.dart';
import 'package:calymob/models/tariff.dart';
import 'package:calymob/services/operation_service.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'registration delegates automatic tariff selection to the server',
    () async {
      final firestore = FakeFirebaseFirestore();
      Map<String, dynamic>? request;
      final service = OperationService(
        firestore: firestore,
        registerForEventInvoker: (payload) async => request = payload,
      );
      final now = DateTime(2026, 8, 13);
      final operation = Operation(
        id: 'event-1',
        type: 'evenement',
        titre: 'Sortie club',
        montantPrevu: 0,
        statut: 'ouvert',
        eventTariffs: [
          Tariff(
            id: 'member',
            label: 'Membre',
            category: 'membre',
            price: 25,
            isDefault: true,
          ),
          Tariff(
            id: 'encadrant',
            label: 'Encadrant',
            category: 'encadrant',
            price: 0,
          ),
        ],
        createdAt: now,
        updatedAt: now,
      );
      final profile = MemberProfile(
        id: 'member-1',
        nom: 'Test',
        prenom: 'Encadrant',
        email: 'encadrant@example.com',
        clubStatuten: const ['Encadrants'],
      );
      await service.registerToOperation(
        clubId: 'club-1',
        operationId: operation.id,
        userId: profile.id,
        userName: profile.email,
        operation: operation,
        memberProfile: profile,
      );

      expect(request, {
        'clubId': 'club-1',
        'operationId': 'event-1',
        'selectedSupplementIds': <String>[],
        'source': 'calymob',
      });
      expect(
        (await firestore
                .collection('clubs/club-1/operations/event-1/inscriptions')
                .get())
            .docs,
        isEmpty,
      );
    },
  );

  test(
    'registration is rejected when the current event status is annule',
    () async {
      final firestore = FakeFirebaseFirestore();
      var calls = 0;
      final service = OperationService(
        firestore: firestore,
        registerForEventInvoker: (_) async {
          calls += 1;
          throw Exception('Les inscriptions sont fermées pour cet événement');
        },
      );
      final now = DateTime(2026, 8, 13);
      final operation = Operation(
        id: 'cancelled-event',
        type: 'evenement',
        titre: 'Sortie annulée',
        montantPrevu: 0,
        statut: 'ouvert', // Simulates a stale detail screen.
        createdAt: now,
        updatedAt: now,
      );
      await expectLater(
        service.registerToOperation(
          clubId: 'club-1',
          operationId: operation.id,
          userId: 'member-1',
          userName: 'Membre Test',
          operation: operation,
        ),
        throwsA(
          predicate(
            (error) => error.toString().contains('inscriptions sont fermées'),
          ),
        ),
      );

      final inscriptions = await firestore
          .collection('clubs/club-1/operations/cancelled-event/inscriptions')
          .get();
      expect(inscriptions.docs, isEmpty);
      expect(calls, 1);
    },
  );

  test(
    'registration sends identifiers, never client-authored prices',
    () async {
      final firestore = FakeFirebaseFirestore();
      Map<String, dynamic>? request;
      final service = OperationService(
        firestore: firestore,
        registerForEventInvoker: (payload) async => request = payload,
      );
      final now = DateTime(2026, 8, 13);
      final operation = Operation(
        id: 'event-2',
        type: 'evenement',
        titre: 'Plongée club',
        montantPrevu: 0,
        statut: 'ouvert',
        createdAt: now,
        updatedAt: now,
      );
      final tariff = Tariff(
        id: 'member',
        label: 'Membre',
        category: 'membre',
        price: 25,
      );

      await service.registerToOperation(
        clubId: 'club-1',
        operationId: operation.id,
        userId: 'member-1',
        userName: 'member@example.com',
        operation: operation,
        selectedTariff: tariff,
        selectedSupplements: [
          SelectedSupplement(id: 'bottle', name: 'Bouteille', price: 999),
        ],
        supplementTotal: 999,
      );

      expect(request, {
        'clubId': 'club-1',
        'operationId': 'event-2',
        'selectedTariffId': 'member',
        'selectedSupplementIds': ['bottle'],
        'source': 'calymob',
      });
      expect(request, isNot(containsPair('price', 25)));
      expect(request, isNot(containsPair('supplementTotal', 999)));
    },
  );

  test(
    'linked guest registration sends identifiers, never client-authored prices',
    () async {
      final firestore = FakeFirebaseFirestore();
      Map<String, dynamic>? request;
      final service = OperationService(
        firestore: firestore,
        registerGuestForEventInvoker: (payload) async => request = payload,
      );

      await service.createGuestInscription(
        clubId: 'club-1',
        operationId: 'event-1',
        operationTitle: 'Plongée club',
        guestPrenom: 'Bob',
        guestNom: 'Guest',
        prix: 999,
        addedByUserId: 'member-1',
        addedByUserName: 'Alice Member',
        parentInscriptionId: 'parent-1',
        tariffId: 'guest-adult',
        selectedSupplements: [
          SelectedSupplement(id: 'bottle', name: 'Bouteille', price: 999),
        ],
        supplementTotal: 999,
      );

      expect(request, {
        'clubId': 'club-1',
        'operationId': 'event-1',
        'parentInscriptionId': 'parent-1',
        'guestFirstName': 'Bob',
        'guestLastName': 'Guest',
        'tariffId': 'guest-adult',
        'selectedSupplementIds': ['bottle'],
        'source': 'calymob',
      });
      expect(request, isNot(containsPair('price', 999)));
      expect(request, isNot(containsPair('supplementTotal', 999)));
      expect(
        (await firestore
                .collection('clubs/club-1/operations/event-1/inscriptions')
                .get())
            .docs,
        isEmpty,
      );
    },
  );
}
