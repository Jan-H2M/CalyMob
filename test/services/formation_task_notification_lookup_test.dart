import 'package:calymob/services/formation_task_service.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const clubId = 'calypso';

  Map<String, dynamic> taskData({required String assignee}) => {
        'type': 'monitor_validation',
        'title': 'Exercice à confirmer',
        'status': 'open',
        'member_id': 'student-1',
        'current_assignee_id': assignee,
        'current_assignee_type': 'monitor',
        'context': {'exercise_claim_id': 'claim-1'},
      };

  test('returns an existing task assigned to the signed-in user', () async {
    final firestore = FakeFirebaseFirestore();
    await firestore
        .collection('clubs/$clubId/formation_tasks')
        .doc('task-1')
        .set(taskData(assignee: 'monitor-1'));

    final task = await FormationTaskService(firestore: firestore)
        .fetchAssignedTask(clubId, 'task-1', 'monitor-1');

    expect(task?.id, 'task-1');
    expect(task?.context.exerciseClaimId, 'claim-1');
  });

  test('returns null for deleted or stale task ids', () async {
    final firestore = FakeFirebaseFirestore();

    final task = await FormationTaskService(firestore: firestore)
        .fetchAssignedTask(clubId, 'missing', 'monitor-1');

    expect(task, isNull);
  });

  test('never opens a task that has been reassigned', () async {
    final firestore = FakeFirebaseFirestore();
    await firestore
        .collection('clubs/$clubId/formation_tasks')
        .doc('task-1')
        .set(taskData(assignee: 'monitor-2'));

    final task = await FormationTaskService(firestore: firestore)
        .fetchAssignedTask(clubId, 'task-1', 'monitor-1');

    expect(task, isNull);
  });
}
