import 'package:calymob/models/formation_task.dart';
import 'package:calymob/models/formation_task_roster.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('aggregates a validator group and preserves duplicate task documents',
      () {
    final rosters = FormationTaskRoster.aggregate([
      _task('task-a', 'member-a', 'Alice'),
      _task('task-a-duplicate', 'member-a', 'Alice'),
      _task('task-b', 'member-b', 'Bob'),
    ]);

    expect(rosters, hasLength(1));
    expect(rosters.single.members, hasLength(2));
    expect(rosters.single.taskCount, 3);
    expect(
      rosters.single.members
          .singleWhere((member) => member.memberId == 'member-a')
          .tasks,
      hasLength(2),
    );
  });

  test('keeps incomplete legacy tasks separate from stable rosters', () {
    final rosters = FormationTaskRoster.aggregate([
      _task('stable', 'member-a', 'Alice'),
      _task('other-group', 'member-b', 'Bob', groupKey: '2star_groupe2'),
      _task('legacy-a', 'member-c', null, sessionId: ''),
      _task('legacy-b', 'member-d', null, sessionId: ''),
    ]);

    expect(rosters, hasLength(4));
    expect(
      rosters.where((roster) => roster.key.startsWith('legacy::')),
      hasLength(2),
    );
  });

  test('uses a persisted validator theme correction over the snapshot', () {
    final roster = FormationTaskRoster.aggregate([
      _task(
        'task-a',
        'member-a',
        'Alice',
        correctedTheme: 'Apnée dynamique',
      ),
    ]).single;

    expect(roster.theme, 'Apnée dynamique');
    expect(roster.members.single.primaryTask.context.themeSnapshot,
        'Observation post-piscine');
  });
}

FormationTask _task(
  String id,
  String memberId,
  String? memberName, {
  String sessionId = '2026-07-21',
  String groupKey = '2star_groupe1',
  String? correctedTheme,
}) {
  return FormationTask(
    id: id,
    type: FormationTaskType.monitorObservation,
    title: 'Évaluer Membre',
    status: FormationTaskStatus.open,
    memberId: memberId,
    memberName: memberName,
    currentAssigneeId: 'validator-1',
    currentAssigneeType: FormationTaskAssigneeType.monitor,
    context: FormationTaskContext(
      poolSessionId: sessionId,
      groupKey: groupKey,
      level: '2*',
      themeSnapshot: 'Observation post-piscine',
    ),
    completionData: {
      if (correctedTheme != null) 'theme_snapshot': correctedTheme,
    },
  );
}
