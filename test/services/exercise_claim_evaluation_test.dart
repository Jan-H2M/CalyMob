import 'package:calymob/services/exercise_claim_service.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('evaluation request sends only authoritative identifiers', () async {
    Map<String, dynamic>? sent;
    final service = ExerciseClaimService(
      firestore: FakeFirebaseFirestore(),
      evaluationRequestInvoker: (payload) async {
        sent = payload;
        return {'claimId': 'evaluation-1'};
      },
    );

    final id = await service.createEvaluationRequest(
      clubId: 'calypso',
      exerciseId: 'exercise-1',
      contextType: 'pool',
      contextEntryId: 'logbook-1',
      monitorId: 'monitor-1',
      notes: '  Bonne séance  ',
    );

    expect(id, 'evaluation-1');
    expect(sent, {
      'clubId': 'calypso',
      'exerciseId': 'exercise-1',
      'contextType': 'pool',
      'contextEntryId': 'logbook-1',
      'monitorId': 'monitor-1',
      'notes': 'Bonne séance',
    });
    expect(sent, isNot(contains('memberId')));
    expect(sent, isNot(contains('exerciseCode')));
    expect(sent, isNot(contains('contextDate')));
  });

  test('monitor correction uses the dedicated decision callable', () async {
    Map<String, dynamic>? sent;
    final service = ExerciseClaimService(
      firestore: FakeFirebaseFirestore(),
      evaluationDecisionInvoker: (payload) async {
        sent = payload;
        return {'observationId': 'observation-1', 'revision': 2};
      },
    );

    final result = await service.decideEvaluation(
      clubId: 'calypso',
      claimId: 'claim-1',
      result: 'corrected',
      comment: '  Encore à stabiliser  ',
    );

    expect(result['revision'], 2);
    expect(sent, {
      'clubId': 'calypso',
      'claimId': 'claim-1',
      'result': 'corrected',
      'comment': 'Encore à stabiliser',
    });
  });
}
