import 'package:calymob/models/formation_task.dart';
import 'package:calymob/services/formation_task_service.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
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

  test('history includes all states for only the current assignee', () async {
    final firestore = FakeFirebaseFirestore();
    final collection = firestore.collection('clubs/$clubId/formation_tasks');
    for (final entry in const {
      'open': 'open',
      'done': 'done',
      'dismissed': 'dismissed',
      'expired': 'expired',
    }.entries) {
      await collection.doc(entry.key).set({
        ...taskData(assignee: 'monitor-1'),
        'status': entry.value,
        'updated_at': Timestamp.fromDate(
          DateTime.utc(2026, 9, entry.key.length),
        ),
      });
    }
    await collection.doc('other-user').set({
      ...taskData(assignee: 'monitor-2'),
      'status': 'done',
    });

    final tasks = await FormationTaskService(firestore: firestore)
        .streamUserHistory(clubId, 'monitor-1')
        .first;

    expect(tasks, hasLength(4));
    expect(tasks.map((task) => task.status).toSet(), {
      FormationTaskStatus.open,
      FormationTaskStatus.done,
      FormationTaskStatus.dismissed,
      FormationTaskStatus.expired,
    });
    expect(tasks.any((task) => task.currentAssigneeId == 'monitor-2'), isFalse);
    expect(tasks.first.id, 'dismissed');
  });
}
