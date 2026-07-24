import 'package:calymob/services/formation_task_service.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('persists a theme correction on every underlying task', () async {
    final firestore = FakeFirebaseFirestore();
    final collection =
        firestore.collection('clubs').doc('club').collection('formation_tasks');
    await collection.doc('task-a').set({
      'status': 'open',
      'completion_data': {'kept': true},
    });
    await collection.doc('task-b').set({'status': 'open'});

    await FormationTaskService(firestore: firestore)
        .updateObservationRosterTheme(
      'club',
      ['task-a', 'task-b', 'task-a'],
      '  Apnée dynamique  ',
    );

    for (final taskId in ['task-a', 'task-b']) {
      final data = (await collection.doc(taskId).get()).data()!;
      expect(data['status'], 'open');
      expect(
        (data['completion_data'] as Map)['theme_snapshot'],
        'Apnée dynamique',
      );
    }
    expect(
      ((await collection.doc('task-a').get()).data()!['completion_data']
          as Map)['kept'],
      isTrue,
    );
  });

  test('completes every roster task atomically with compatible data', () async {
    final firestore = FakeFirebaseFirestore();
    final collection =
        firestore.collection('clubs').doc('club').collection('formation_tasks');
    await collection.doc('task-a').set({'status': 'open', 'kept': true});
    await collection.doc('task-b').set({'status': 'open', 'kept': true});

    await FormationTaskService(firestore: firestore).markObservationRosterDone(
      'club',
      'validator',
      'Valérie Validatrice',
      {
        for (final taskId in ['task-a', 'task-b'])
          taskId: const FormationTaskRosterCompletion(
            verdict: 'acquis',
            attendanceStatus: 'present',
            comment: '  Bonne progression  ',
            poolSessionId: '2026-07-21',
            groupKey: '2star_groupe1',
            themeSnapshot: 'Vidage de masque',
            memberId: 'member-a',
          ),
      },
    );

    for (final taskId in ['task-a', 'task-b']) {
      final data = (await collection.doc(taskId).get()).data()!;
      expect(data['status'], 'done');
      expect(data['completed_by'], 'validator');
      expect(data['kept'], isTrue);
      expect(data['completion_data'], {
        'verdict': 'acquis',
        'attendance_status': 'present',
        'pool_session_id': '2026-07-21',
        'group_key': '2star_groupe1',
        'theme_snapshot': 'Vidage de masque',
        'member_id': 'member-a',
        'observer_id': 'validator',
        'observer_name': 'Valérie Validatrice',
        'comment': 'Bonne progression',
      });
    }
  });

  test('completes an absent member without a verdict', () async {
    final firestore = FakeFirebaseFirestore();
    final collection =
        firestore.collection('clubs').doc('club').collection('formation_tasks');
    await collection.doc('task-a').set({'status': 'open'});

    await FormationTaskService(firestore: firestore).markObservationRosterDone(
      'club',
      'validator',
      'Valérie',
      {
        'task-a': const FormationTaskRosterCompletion(
          verdict: null,
          attendanceStatus: 'absent',
          comment: '',
          memberId: 'member-a',
        ),
      },
    );

    final completion = (await collection.doc('task-a').get())
        .data()!['completion_data'] as Map;
    expect(completion['attendance_status'], 'absent');
    expect(completion.containsKey('verdict'), isFalse);
  });
}
