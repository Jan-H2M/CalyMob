import 'package:calymob/models/operation.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('waitlist is enabled by default for new operations', () {
    final operation = Operation(
      id: 'event-1',
      type: 'evenement',
      titre: 'Plongée Zélande',
      montantPrevu: 0,
      statut: 'ouvert',
      createdAt: DateTime(2026),
      updatedAt: DateTime(2026),
    );

    expect(operation.allowWaitlist, isTrue);
  });

  test('legacy operations without the field use the enabled default', () async {
    final firestore = FakeFirebaseFirestore();
    final reference = await firestore.collection('operations').add({
      'type': 'evenement',
      'titre': 'Legacy event',
      'montant_prevu': 0,
      'statut': 'ouvert',
    });

    final operation = Operation.fromFirestore(await reference.get());

    expect(operation.allowWaitlist, isTrue);
  });
}
