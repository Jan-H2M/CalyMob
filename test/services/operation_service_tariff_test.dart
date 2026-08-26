import 'package:calymob/models/member_profile.dart';
import 'package:calymob/models/operation.dart';
import 'package:calymob/models/tariff.dart';
import 'package:calymob/services/operation_service.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'registration derives the member tariff from the club function',
    () async {
      final firestore = FakeFirebaseFirestore();
      final service = OperationService(firestore: firestore);
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
      await firestore.doc('clubs/club-1/operations/event-1').set({
        'type': 'evenement',
        'titre': operation.titre,
        'statut': 'ouvert',
      });

      await service.registerToOperation(
        clubId: 'club-1',
        operationId: operation.id,
        userId: profile.id,
        userName: profile.email,
        operation: operation,
        memberProfile: profile,
      );

      final inscriptions = await firestore
          .collection('clubs/club-1/operations/event-1/inscriptions')
          .get();
      expect(inscriptions.docs, hasLength(1));
      final data = inscriptions.docs.single.data();
      expect(data['prix'], 0);
      expect(data['tariff_id'], 'encadrant');
      expect(data['tariff_label'], 'Encadrant');
      expect(data['tariff_selected_by'], isNull);
    },
  );

  test(
    'registration is rejected when the current event status is annule',
    () async {
      final firestore = FakeFirebaseFirestore();
      final service = OperationService(firestore: firestore);
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
      await firestore.doc('clubs/club-1/operations/cancelled-event').set({
        'type': 'evenement',
        'titre': operation.titre,
        'statut': 'annule',
      });

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
    },
  );
}
