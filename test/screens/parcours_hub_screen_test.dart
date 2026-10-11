import 'package:calymob/screens/training/parcours_hub_screen.dart';
import 'package:calymob/models/formation_task.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Parcours hub keeps the agreed entry order', () {
    expect(
      parcoursHubEntryDefinitions.map((entry) => entry.title).toList(),
      equals([
        'Mon carnet',
        'Mes exercices',
        'Actions & évaluations',
        'Statistiques',
      ]),
    );
  });

  test('Only actionable sections expose badges', () {
    final badgedEntries = parcoursHubEntryDefinitions
        .where((entry) => entry.badge)
        .map((entry) => entry.key)
        .toList();

    expect(badgedEntries, equals(['actions']));
  });

  test(
    'formation overview is a direct searchable entry without action badge',
    () {
      expect(parcoursFormationOverviewEntry.key, 'formation-overview');
      expect(parcoursFormationOverviewEntry.title, 'Avancement des élèves');
      expect(
        parcoursFormationOverviewEntry.subtitle,
        contains('Rechercher un membre'),
      );
      expect(parcoursFormationOverviewEntry.badge, isFalse);
    },
  );

  test('action badge excludes buddies but keeps event and manual tasks', () {
    expect(
      parcoursOpenActionCount([
        _task(
          id: 'buddy',
          type: FormationTaskType.buddyConfirmation,
          status: FormationTaskStatus.open,
        ),
        _task(
          id: 'exercise',
          type: FormationTaskType.monitorValidation,
          status: FormationTaskStatus.open,
        ),
        _task(
          id: 'done',
          type: FormationTaskType.monitorValidation,
          status: FormationTaskStatus.done,
        ),
        _task(
          id: 'event',
          type: FormationTaskType.eventPreparation,
          status: FormationTaskStatus.open,
        ),
        _task(
          id: 'manual',
          type: FormationTaskType.manualReminder,
          status: FormationTaskStatus.open,
        ),
      ]),
      3,
    );
  });
}

FormationTask _task({
  required String id,
  required FormationTaskType type,
  required FormationTaskStatus status,
}) {
  return FormationTask(
    id: id,
    type: type,
    title: id,
    status: status,
    memberId: 'member',
    currentAssigneeId: 'assignee',
    currentAssigneeType: FormationTaskAssigneeType.student,
    context: const FormationTaskContext(),
  );
}
