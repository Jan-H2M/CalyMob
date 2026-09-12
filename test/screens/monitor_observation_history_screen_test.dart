import 'package:calymob/models/formation_task.dart';
import 'package:calymob/screens/training/monitor_observation_screen.dart';
import 'package:calymob/services/formation_task_service.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('completed evaluation opens with its saved correction values', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(430, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final task = _task(
      status: FormationTaskStatus.done,
      completionData: const {
        'verdict': 'en_progres',
        'comment': 'Bonne remontée contrôlée',
        'attendance_status': 'present',
      },
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MonitorObservationScreen(
          task: task,
          taskService: FormationTaskService(
            firestore: FakeFirebaseFirestore(),
          ),
        ),
      ),
    );
    await tester.pump();

    expect(
        find.text('Évaluation enregistrée. Une correction met aussi à jour '
            'l’observation durable du carnet.'),
        findsOneWidget);
    expect(find.text('CORRIGER LE VERDICT'), findsOneWidget);
    expect(find.text("Corriger l'évaluation"), findsOneWidget);
    expect(
      tester.widget<TextField>(find.byType(TextField)).controller?.text,
      'Bonne remontée contrôlée',
    );
  });

  testWidgets('dismissed and expired evaluations are tappable read-only detail',
      (
    tester,
  ) async {
    for (final status in const [
      FormationTaskStatus.dismissed,
      FormationTaskStatus.expired,
    ]) {
      await tester.pumpWidget(
        MaterialApp(
          home: MonitorObservationScreen(
            task: _task(status: status),
            taskService: FormationTaskService(
              firestore: FakeFirebaseFirestore(),
            ),
          ),
        ),
      );
      await tester.pump();

      expect(find.text("Corriger l'évaluation"), findsNothing);
      expect(find.text('Fermer'), findsOneWidget);
      expect(
        find.text(
          status == FormationTaskStatus.expired
              ? 'Cette évaluation a expiré et reste disponible en lecture.'
              : 'Cette évaluation a été classée sans suite.',
        ),
        findsOneWidget,
      );
    }
  });
}

FormationTask _task({
  required FormationTaskStatus status,
  Map<String, dynamic> completionData = const {},
}) {
  return FormationTask(
    id: 'observation-task',
    type: FormationTaskType.monitorObservation,
    title: 'Évaluer Alice',
    status: status,
    memberId: 'alice',
    memberName: 'Alice Martin',
    currentAssigneeId: 'monitor',
    currentAssigneeType: FormationTaskAssigneeType.monitor,
    context: const FormationTaskContext(
      poolSessionId: '2026-09-10',
      groupKey: '2star_groupe1',
      themeSnapshot: 'Remontée contrôlée',
    ),
    completionData: completionData,
  );
}
