import 'package:calymob/models/actions_evaluations_view_model.dart';
import 'package:calymob/models/formation_task.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ActionsEvaluationsViewModel', () {
    test('segments pending and every answered confirmation status', () {
      const confirmations = [
        LogbookConfirmationAction(
          id: 'pending',
          sourceMemberName: 'A',
          locationName: 'One',
          matchType: 'none',
        ),
        LogbookConfirmationAction(
          id: 'declined',
          sourceMemberName: 'B',
          locationName: 'Two',
          matchType: 'none',
          status: 'declined',
        ),
        LogbookConfirmationAction(
          id: 'cancelled',
          sourceMemberName: 'C',
          locationName: 'Three',
          matchType: 'none',
          status: 'cancelled',
        ),
        LogbookConfirmationAction(
          id: 'no-import',
          sourceMemberName: 'D',
          locationName: 'Four',
          matchType: 'none',
          status: 'confirmed_no_import',
        ),
      ];

      final todo = ActionsEvaluationsViewModel.build(
        confirmations: confirmations,
        tasks: const [],
        segment: ActionsEvaluationsSegment.todo,
      );
      final done = ActionsEvaluationsViewModel.build(
        confirmations: confirmations,
        tasks: const [],
        segment: ActionsEvaluationsSegment.done,
      );

      expect(todo.confirmations.map((item) => item.id), ['pending']);
      expect(
        done.confirmations.map((item) => item.id).toSet(),
        {'declined', 'cancelled', 'no-import'},
      );
      expect(done.confirmations.every((item) => item.isDone), isTrue);
    });

    test('deduplicates by id, keeps latest snapshot and sorts newest first',
        () {
      final old = DateTime.utc(2026, 9, 1);
      final recent = DateTime.utc(2026, 9, 10);
      final middle = DateTime.utc(2026, 9, 5);
      final model = ActionsEvaluationsViewModel.build(
        confirmations: [
          LogbookConfirmationAction(
            id: 'same',
            sourceMemberName: 'Ancien',
            locationName: 'One',
            matchType: 'none',
            status: 'declined',
            respondedAt: old,
          ),
          LogbookConfirmationAction(
            id: 'same',
            sourceMemberName: 'Récent',
            locationName: 'One',
            matchType: 'none',
            status: 'confirmed_copied',
            respondedAt: recent,
          ),
          LogbookConfirmationAction(
            id: 'middle',
            sourceMemberName: 'Milieu',
            locationName: 'Two',
            matchType: 'none',
            status: 'cancelled',
            respondedAt: middle,
          ),
        ],
        tasks: [
          _task('task', FormationTaskStatus.done, updatedAt: old),
          _task('task', FormationTaskStatus.done, updatedAt: recent),
        ],
        segment: ActionsEvaluationsSegment.done,
      );

      expect(model.confirmations.map((item) => item.id), ['same', 'middle']);
      expect(model.confirmations.first.sourceMemberName, 'Récent');
      expect(model.standaloneTasks, hasLength(1));
      expect(model.standaloneTasks.single.updatedAt, recent);
    });

    test('done/dismissed/expired are history and active observations group',
        () {
      final model = ActionsEvaluationsViewModel.build(
        confirmations: const [],
        tasks: [
          _task('open-1', FormationTaskStatus.open, memberId: 'one'),
          _task('open-2', FormationTaskStatus.open, memberId: 'two'),
          _task('done', FormationTaskStatus.done),
          _task('dismissed', FormationTaskStatus.dismissed),
          _task('expired', FormationTaskStatus.expired),
          _task(
            'buddy',
            FormationTaskStatus.done,
            type: FormationTaskType.buddyConfirmation,
          ),
        ],
        segment: ActionsEvaluationsSegment.all,
      );

      expect(model.rosters, hasLength(1));
      expect(model.rosters.single.members, hasLength(2));
      expect(
        model.standaloneTasks.map((task) => task.id).toSet(),
        {'done', 'dismissed', 'expired'},
      );
    });

    test('accent-insensitive search includes status, theme and member', () {
      final tasks = [
        _task(
          'expired',
          FormationTaskStatus.expired,
          memberName: 'Élodie',
          theme: 'Apnée dynamique',
        ),
      ];

      for (final query in ['expiree', 'elodie', 'apnee']) {
        final model = ActionsEvaluationsViewModel.build(
          confirmations: const [],
          tasks: tasks,
          segment: ActionsEvaluationsSegment.done,
          searchQuery: query,
        );
        expect(model.standaloneTasks.map((task) => task.id), ['expired']);
      }
    });
  });
}

FormationTask _task(
  String id,
  FormationTaskStatus status, {
  FormationTaskType type = FormationTaskType.monitorObservation,
  String memberId = 'member',
  String memberName = 'Membre',
  String theme = 'Thème',
  DateTime? updatedAt,
}) {
  return FormationTask(
    id: id,
    type: type,
    title: id,
    status: status,
    memberId: memberId,
    memberName: memberName,
    currentAssigneeId: 'monitor',
    currentAssigneeType: FormationTaskAssigneeType.monitor,
    context: FormationTaskContext(
      poolSessionId: 'session',
      groupKey: 'group',
      themeSnapshot: theme,
    ),
    updatedAt: updatedAt,
  );
}
