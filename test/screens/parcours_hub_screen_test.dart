import 'package:calymob/screens/training/parcours_hub_screen.dart';
import 'package:calymob/models/formation_task.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Parcours hub keeps the agreed entry order', () {
    expect(
      parcoursHubEntryDefinitions.map((entry) => entry.title).toList(),
      equals([
        'Mon carnet',
        'Plongées à confirmer',
        'Mes exercices',
        'Mes demandes',
        'Actions & évaluations',
        'Statistiques',
        'Reprendre ma carte papier',
      ]),
    );
  });

  test('Only actionable sections expose badges', () {
    final badgedEntries = parcoursHubEntryDefinitions
        .where((entry) => entry.badge)
        .map((entry) => entry.key)
        .toList();

    expect(badgedEntries, equals(['confirmations', 'actions']));
  });

  test('generic action badge excludes dedicated buddy confirmations', () {
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
          type: FormationTaskType.manualReminder,
          status: FormationTaskStatus.done,
        ),
      ]),
      1,
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
