import 'package:calymob/services/operation_service.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const clubId = 'calypso';
  const operationId = 'operation-exercices';
  const userId = 'member-1';

  test('updateExercices persists an explicit empty list', () async {
    final firestore = FakeFirebaseFirestore();
    final service = OperationService(firestore: firestore);
    final inscription = firestore
        .collection('clubs/$clubId/operations/$operationId/inscriptions')
        .doc('inscription-1');
    await inscription.set({
      'membre_id': userId,
      'membre_prenom': 'Samuel',
      'membre_nom': 'Durt',
      'registration_status': 'confirmed',
      'exercices': ['p2-1'],
    });

    await service.updateExercices(
      clubId: clubId,
      operationId: operationId,
      userId: userId,
      exercices: const [],
    );

    final data = (await inscription.get()).data()!;
    expect(data['exercices'], isEmpty);
    expect(data['last_action'], 'updated');
    expect(data['last_action_reason'], 'exercises_updated');
  });
}
