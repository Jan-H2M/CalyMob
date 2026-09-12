import 'package:calymob/models/actions_evaluations_view_model.dart';
import 'package:calymob/models/formation_task.dart';
import 'package:calymob/screens/training/actions_evaluations_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets(
    'todo shows every active source except duplicate buddy tasks',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 1100));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      LogbookConfirmationAction? openedConfirmation;
      FormationTask? openedTask;

      await tester.pumpWidget(
        MaterialApp(
          home: ActionsEvaluationsScreen(
            previewMode: true,
            previewConfirmations: const [
              LogbookConfirmationAction(
                id: 'confirmation-1',
                sourceMemberName: 'Sophie Dubois',
                locationName: 'Nemo 33',
                matchType: 'similar',
              ),
              LogbookConfirmationAction(
                id: 'answered-1',
                sourceMemberName: 'Louise Martin',
                locationName: 'Zilvermeer',
                matchType: 'identical',
                status: 'declined',
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
      expect(find.text('Plongée avec Louise Martin'), findsNothing);
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

  testWidgets('done history exposes answered confirmations and closed states', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(430, 1300));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    FormationTask? openedTask;
    await tester.pumpWidget(
      MaterialApp(
        home: ActionsEvaluationsScreen(
          previewMode: true,
          previewClubStatuten: const ['Encadrants'],
          previewPlongeurCode: 'MC',
          previewConfirmations: const [
            LogbookConfirmationAction(
              id: 'pending',
              sourceMemberName: 'Pending Person',
              locationName: 'Nemo',
              matchType: 'none',
            ),
            LogbookConfirmationAction(
              id: 'declined',
              sourceMemberName: 'Declined Person',
              locationName: 'Vodelee',
              matchType: 'none',
              status: 'declined',
            ),
            LogbookConfirmationAction(
              id: 'copied',
              sourceMemberName: 'Copied Person',
              locationName: 'Zeeland',
              matchType: 'none',
              status: 'confirmed_copied',
            ),
          ],
          previewTasks: [
            _task('active task', FormationTaskType.manualReminder),
            _task(
              'done evaluation',
              FormationTaskType.monitorObservation,
              status: FormationTaskStatus.done,
            ),
            _task(
              'dismissed evaluation',
              FormationTaskType.monitorObservation,
              status: FormationTaskStatus.dismissed,
            ),
            _task(
              'expired evaluation',
              FormationTaskType.monitorObservation,
              status: FormationTaskStatus.expired,
            ),
          ],
          onOpenTask: (value) => openedTask = value,
        ),
      ),
    );

    await tester.tap(find.byKey(const ValueKey('actions-segment-done')));
    await tester.pump();

    expect(find.text('Plongée avec Pending Person'), findsNothing);
    expect(find.text('Plongée avec Declined Person'), findsOneWidget);
    expect(find.text('Refusée'), findsOneWidget);
    expect(find.text('Plongée avec Copied Person'), findsOneWidget);
    expect(find.text('Confirmée et copiée'), findsOneWidget);
    expect(find.text('active task'), findsNothing);
    expect(find.text('done evaluation'), findsOneWidget);
    expect(find.text('dismissed evaluation'), findsOneWidget);
    expect(find.text('expired evaluation'), findsOneWidget);
    expect(find.text('Scanner une carte papier'), findsNothing);

    await tester.tap(find.text('done evaluation'));
    expect(openedTask?.status, FormationTaskStatus.done);
  });

  testWidgets('scanner is gated and appears only in todo and all', (
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

    expect(find.text('Scanner une carte papier'), findsOneWidget);
    await tester.tap(find.text('Scanner une carte papier'));
    expect(openedScanner, isTrue);

    await tester.tap(find.byKey(const ValueKey('actions-segment-done')));
    await tester.pump();
    expect(find.text('Scanner une carte papier'), findsNothing);

    await tester.tap(find.byKey(const ValueKey('actions-segment-all')));
    await tester.pump();
    expect(find.text('Scanner une carte papier'), findsOneWidget);
  });

  testWidgets('scanner remains hidden from non-validator in every segment', (
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
    await tester.tap(find.byKey(const ValueKey('actions-segment-all')));
    await tester.pump();
    expect(find.text('Scanner une carte papier'), findsNothing);
  });

  testWidgets('search filters done history by status and member', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: ActionsEvaluationsScreen(
          previewMode: true,
          previewConfirmations: const [
            LogbookConfirmationAction(
              id: 'confirmation-1',
              sourceMemberName: 'Sophie Dubois',
              locationName: 'Nemo 33',
              matchType: 'identical',
              status: 'declined',
            ),
          ],
          previewTasks: [
            _task(
              'Valider le carnet de Marc',
              FormationTaskType.exerciseClaim,
              status: FormationTaskStatus.done,
            ),
          ],
        ),
      ),
    );
    await tester.tap(find.byKey(const ValueKey('actions-segment-done')));
    await tester.pump();

    await tester.enterText(find.byType(TextField), 'marc');
    await tester.pump();
    expect(find.text('Plongée avec Sophie Dubois'), findsNothing);
    expect(find.text('Valider le carnet de Marc'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'refusee');
    await tester.pump();
    expect(find.text('Plongée avec Sophie Dubois'), findsOneWidget);
    expect(find.text('Valider le carnet de Marc'), findsNothing);
  });

  testWidgets('completed evaluations remain reachable for monitor correction', (
    tester,
  ) async {
    FormationTask? openedTask;
    await tester.pumpWidget(MaterialApp(
      home: ActionsEvaluationsScreen(
        previewMode: true,
        previewTasks: [
          _task(
            'Évaluation historique P2.DP',
            FormationTaskType.monitorValidation,
            status: FormationTaskStatus.done,
          ),
        ],
        onOpenTask: (task) => openedTask = task,
      ),
    ));

    expect(find.text('Évaluation historique P2.DP'), findsNothing);
    await tester.tap(find.text('Fait'));
    await tester.pump();
    expect(find.text('Évaluation historique P2.DP'), findsOneWidget);
    await tester.tap(find.text('Évaluation historique P2.DP'));
    expect(openedTask?.status, FormationTaskStatus.done);
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
