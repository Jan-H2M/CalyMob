import 'package:calymob/services/member_observation_service.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late FakeFirebaseFirestore firestore;
  late MemberObservationService service;

  setUp(() async {
    firestore = FakeFirebaseFirestore();
    service = MemberObservationService(firestore: firestore);

    final observations = firestore
        .collection('clubs')
        .doc('calypso')
        .collection('member_observations');
    await observations.doc('own-target').set({
      'memberId': 'member-a',
      'memberName': 'Alice',
      'contextId': 'operation-target',
      'contextDate': Timestamp.fromDate(DateTime.utc(2026, 10, 17)),
    });
    await observations.doc('own-other').set({
      'memberId': 'member-a',
      'memberName': 'Alice',
      'contextId': 'operation-other',
      'contextDate': Timestamp.fromDate(DateTime.utc(2026, 10, 16)),
    });
    await observations.doc('other-target').set({
      'memberId': 'member-b',
      'memberName': 'Bob',
      'contextId': 'operation-target',
      'contextDate': Timestamp.fromDate(DateTime.utc(2026, 10, 15)),
    });
  });

  test(
    'own-session watcher never returns another member observation',
    () async {
      final result = await service
          .watchOwnSessionObservations(
            'calypso',
            'member-a',
            'operation-target',
          )
          .first;

      expect(result.map((observation) => observation.id), ['own-target']);
      expect(
        result.every((observation) => observation.memberId == 'member-a'),
        isTrue,
      );
    },
  );

  test(
    'full-session watcher returns the complete authorized session',
    () async {
      final result = await service
          .watchFullSessionObservations('calypso', 'operation-target')
          .first;

      expect(result.map((observation) => observation.id).toSet(), {
        'own-target',
        'other-target',
      });
    },
  );
}
