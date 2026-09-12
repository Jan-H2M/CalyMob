import 'package:calymob/models/formation_task.dart';
import 'package:calymob/screens/training/actions_evaluations_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets(
    'shows every active action source except duplicate buddy tasks on a narrow screen',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      PendingLogbookConfirmation? openedConfirmation;
      FormationTask? openedTask;

      await tester.pumpWidget(
        MaterialApp(
          home: ActionsEvaluationsScreen(
            previewMode: true,
            previewConfirmations: const [
              PendingLogbookConfirmation(
                id: 'confirmation-1',
                sourceMemberName: 'Sophie Dubois',
                locationName: 'Nemo 33',
                matchType: 'similar',
              ),
            ],
            previewTasks: [
              _task('validation', FormationTaskType.monitorValidation),
              _task('buddy duplicate', FormationTaskType.buddyConfirmation),
              _task('event prep', FormationTaskType.eventPreparation),
              _task('manual reminder', FormationTaskType.manualReminder),
              _task(
                'completed evaluation',
                FormationTaskType.monitorObservation,
                status: FormationTaskStatus.done,
              ),
            ],
            onOpenConfirmation: (value) => openedConfirmation = value,
            onOpenTask: (value) => openedTask = value,
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Actions & évaluations'), findsOneWidget);
      expect(find.text('Plongées à confirmer'), findsOneWidget);
      expect(find.text('Plongée avec Sophie Dubois'), findsOneWidget);
      expect(find.text('validation'), findsOneWidget);
      expect(find.text('buddy duplicate'), findsNothing);
      expect(find.text('event prep'), findsOneWidget);
      expect(find.text('manual reminder'), findsOneWidget);
      expect(find.text('completed evaluation'), findsNothing);
      await tester.tap(find.text('Plongée avec Sophie Dubois'));
      expect(openedConfirmation?.id, 'confirmation-1');
      await tester.tap(find.text('validation'));
      expect(openedTask?.id, 'validation');
    },
  );

  testWidgets('shows the paper-card scanner only to a LIFRAS validator', (
    tester,
  ) async {
    var openedScanner = false;
    await tester.pumpWidget(
      MaterialApp(
        home: ActionsEvaluationsScreen(
          previewMode: true,
          previewClubStatuten: const ['Encadrants'],
          previewPlongeurCode: 'MC',
          onOpenHistoricalQr: () => openedScanner = true,
        ),
      ),
    );

    expect(find.text('Outils de validation'), findsOneWidget);
    expect(find.text('Scanner une carte papier'), findsOneWidget);
    await tester.tap(find.text('Scanner une carte papier'));
    expect(openedScanner, isTrue);
  });

  testWidgets('hides the paper-card scanner from a non-validator', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: ActionsEvaluationsScreen(
          previewMode: true,
          previewClubStatuten: ['membre'],
          previewPlongeurCode: 'MC',
        ),
      ),
    );

    expect(find.text('Scanner une carte papier'), findsNothing);
    expect(find.text('Tout est à jour'), findsOneWidget);
  });

  testWidgets('search filters both domain sources without showing history', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: ActionsEvaluationsScreen(
          previewMode: true,
          previewConfirmations: const [
            PendingLogbookConfirmation(
              id: 'confirmation-1',
              sourceMemberName: 'Sophie Dubois',
              locationName: 'Nemo 33',
              matchType: 'identical',
            ),
          ],
          previewTasks: [
            _task('Valider le carnet de Marc', FormationTaskType.exerciseClaim),
          ],
        ),
      ),
    );

    await tester.enterText(find.byType(TextField), 'marc');
    await tester.pump();

    expect(find.text('Plongée avec Sophie Dubois'), findsNothing);
    expect(find.text('Valider le carnet de Marc'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'introuvable');
    await tester.pump();
    expect(find.text('Aucun résultat'), findsOneWidget);
  });
}

FormationTask _task(
  String id,
  FormationTaskType type, {
  FormationTaskStatus status = FormationTaskStatus.open,
}) {
  return FormationTask(
    id: id,
    type: type,
    title: id,
    status: status,
    memberId: 'member-1',
    memberName: 'Marc Lambert',
    currentAssigneeId: 'assignee-1',
    currentAssigneeType: FormationTaskAssigneeType.monitor,
    context: const FormationTaskContext(),
  );
}
