import 'package:calymob/services/operation_service.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const clubId = 'calypso';
  const operationId = 'event-1';
  late FakeFirebaseFirestore firestore;
  late OperationService service;

  setUp(() {
    firestore = FakeFirebaseFirestore();
    service = OperationService(firestore: firestore);
  });

  test('waitlisted entries do not consume capacity or appear as participants',
      () async {
    final inscriptions = firestore.collection(
      'clubs/$clubId/operations/$operationId/inscriptions',
    );
    await inscriptions.doc('confirmed').set({
      'membre_id': 'member-1',
      'registration_status': 'confirmed',
      'date_inscription': DateTime(2026),
    });
    await inscriptions.doc('waiting').set({
      'membre_id': 'member-2',
      'registration_status': 'waitlisted',
      'date_inscription': DateTime(2026),
    });

    expect(await service.countParticipants(clubId, operationId), 1);
    expect(await service.isUserRegistered(clubId, operationId, 'member-2'),
        isFalse);
    expect(await service.getParticipants(clubId, operationId), hasLength(1));
    expect(
      (await service.getUserInscription(
        clubId: clubId,
        operationId: operationId,
        userId: 'member-2',
      ))
          ?.isWaitlisted,
      isTrue,
    );
  });
}
