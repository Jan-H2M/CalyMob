import 'package:calymob/models/formation_task.dart';
import 'package:calymob/screens/training/exercise_claim_retry_screen.dart';
import 'package:calymob/screens/training/formation_task_detail_screen.dart';
import 'package:calymob/screens/training/monitor_observation_screen.dart';
import 'package:calymob/screens/training/monitor_validation_screen.dart';
import 'package:calymob/services/formation_task_navigation_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  FormationTask task(
    FormationTaskType type, {
    FormationTaskStatus status = FormationTaskStatus.open,
  }) =>
      FormationTask(
        id: 'task-1',
        type: type,
        title: 'Action',
        status: status,
        memberId: 'student-1',
        currentAssigneeId: 'monitor-1',
        currentAssigneeType: FormationTaskAssigneeType.monitor,
        context: const FormationTaskContext(exerciseClaimId: 'claim-1'),
      );

  testWidgets('exercise confirmation opens monitor validation directly',
      (tester) async {
    final destination =
        formationTaskDestination(task(FormationTaskType.monitorValidation));

    expect(destination, isA<MonitorValidationScreen>());
    expect((destination as MonitorValidationScreen).task.id, 'task-1');
  });

  testWidgets('rejected exercise opens its correction screen directly',
      (tester) async {
    final destination =
        formationTaskDestination(task(FormationTaskType.claimRejected));

    expect(destination, isA<ExerciseClaimRetryScreen>());
  });

  testWidgets('closed generic task opens read-only history detail',
      (tester) async {
    final destination = formationTaskDestination(
      task(
        FormationTaskType.monitorValidation,
        status: FormationTaskStatus.done,
      ),
    );

    expect(destination, isA<FormationTaskDetailScreen>());
  });

  testWidgets('completed observation keeps its dedicated correction screen',
      (tester) async {
    final destination = formationTaskDestination(
      task(
        FormationTaskType.monitorObservation,
        status: FormationTaskStatus.done,
      ),
    );

    expect(destination, isA<MonitorObservationScreen>());
  });
}
