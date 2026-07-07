import 'package:flutter_test/flutter_test.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:calymob/services/exercise_claim_service.dart';

void main() {
  const clubId = 'calypso';
  const userId = 'alice';
  const opId = 'op-1';
  const claimsPath = 'clubs/$clubId/exercise_claims';

  late FakeFirebaseFirestore firestore;
  late ExerciseClaimService service;

  Future<void> seedClaim(String id, Map<String, dynamic> data) async {
    await firestore.collection(claimsPath).doc(id).set(data);
  }

  Map<String, dynamic> draft({
    String member = userId,
    String status = 'draft',
    String operation = opId,
    String code = 'P2.DP',
  }) =>
      {
        'member_id': member,
        'status': status,
        'operation_id': operation,
        'exercise_code': code,
        'exercise_label': 'Direction de palanquée',
        'monitor_name': 'Bob',
      };

  setUp(() {
    firestore = FakeFirebaseFirestore();
    service = ExerciseClaimService(firestore: firestore);
  });

  group('fetchDraftsForOperation', () {
    test('returns empty when the member has no drafts', () async {
      final drafts = await service.fetchDraftsForOperation(clubId, userId, opId);
      expect(drafts, isEmpty);
    });

    test('returns the single draft for the operation', () async {
      await seedClaim('c1', draft());
      final drafts = await service.fetchDraftsForOperation(clubId, userId, opId);
      expect(drafts, hasLength(1));
      expect(drafts.first.exerciseCode, 'P2.DP');
      expect(drafts.first.monitorName, 'Bob');
    });

    test('returns N drafts and filters out other operations / statuses / members',
        () async {
      await seedClaim('c1', draft(code: 'P2.DP'));
      await seedClaim('c2', draft(code: 'P2.RA'));
      await seedClaim('c3', draft(operation: 'other-op')); // wrong operation
      await seedClaim('c4', draft(status: 'submitted')); // not a draft
      await seedClaim('c5', draft(member: 'bob')); // other member

      final drafts = await service.fetchDraftsForOperation(clubId, userId, opId);
      final codes = drafts.map((d) => d.id).toSet();
      expect(drafts, hasLength(2));
      expect(codes, containsAll(<String>['c1', 'c2']));
    });
  });

  group('submitClaims', () {
    test('submits only the kept drafts; discarded stay draft', () async {
      await seedClaim('c1', draft(code: 'P2.DP'));
      await seedClaim('c2', draft(code: 'P2.RA'));

      // Keep only c1.
      await service.submitClaims(clubId, ['c1'], notes: {'c1': 'ok fait'});

      final c1 = await firestore.collection(claimsPath).doc('c1').get();
      final c2 = await firestore.collection(claimsPath).doc('c2').get();
      expect(c1.data()!['status'], 'submitted');
      expect(c1.data()!['declaration_notes'], 'ok fait');
      expect(c2.data()!['status'], 'draft'); // untouched
    });

    test('no-op on empty id list', () async {
      await seedClaim('c1', draft());
      await service.submitClaims(clubId, []);
      final c1 = await firestore.collection(claimsPath).doc('c1').get();
      expect(c1.data()!['status'], 'draft');
    });
  });
}
