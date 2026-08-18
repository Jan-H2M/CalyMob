import 'package:calymob/services/material_return_service.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const clubId = 'calypso-test';

  test(
    'borrowable items exclude hors-service and active-loan inventory',
    () async {
      final firestore = FakeFirebaseFirestore();
      final club = firestore.collection('clubs').doc(clubId);
      final inventory = club.collection('inventory_items');
      final loans = club.collection('inventory_loans');

      await inventory.doc('available').set({
        'code': 'PALM-P07',
        'nom': 'Palmes',
        'statut': 'disponible',
      });
      await inventory.doc('out-of-service').set({
        'code': 'GILET-027',
        'nom': 'Gilet',
        'statut': 'hors_service',
      });
      await inventory.doc('loaned-but-stale').set({
        'code': 'LAMP-3',
        'nom': 'Lampe',
        'numero_serie': 'AL-13000-NP2',
        'statut': 'disponible',
      });
      await inventory.doc('reserved-but-stale').set({
        'code': 'DET-4',
        'nom': 'Detendeur',
        'numero_serie': 'REG-004',
        'statut': 'disponible',
      });
      await loans.doc('active-loan').set({
        'statut': 'actif',
        'itemIds': ['loaned-but-stale'],
      });
      await loans.doc('pending-caution').set({
        'statut': 'attente_caution',
        'itemIds': ['reserved-but-stale'],
      });

      final service = MaterialReturnService(firestore: firestore);
      final result = await service
          .watchBorrowableItems(clubId)
          .first
          .timeout(const Duration(seconds: 2));

      expect(result.map((item) => item.id), ['available']);
    },
  );
}
