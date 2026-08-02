import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/firebase_config.dart';
import '../models/formation_task.dart';
import '../providers/auth_provider.dart';
import '../screens/training/exercise_claim_retry_screen.dart';
import '../screens/training/exercise_claim_screen.dart';
import '../screens/training/formation_task_detail_screen.dart';
import '../screens/training/historical_claims_screen.dart';
import '../screens/training/historical_validation_screen.dart';
import '../screens/training/logbook_dive_confirmation_screen.dart';
import '../screens/training/logbook_entry_screen.dart';
import '../screens/training/manual_exercise_claim_screen.dart';
import '../screens/training/monitor_observation_screen.dart';
import '../screens/training/monitor_planning_screen.dart';
import '../screens/training/monitor_validation_screen.dart';
import '../screens/training/pool_checkin_screen.dart';
import 'formation_task_service.dart';

/// Single route mapping for formation tasks, used by both the inbox and push
/// notifications. Keeping it here prevents notification deep links from
/// drifting away from the routes users get when tapping the same inbox card.
void openFormationTask(BuildContext context, FormationTask task) {
  if (task.type == FormationTaskType.eventPreparation) {
    unawaited(_openEventPreparationTask(context, task));
    return;
  }
  Navigator.of(context).push(MaterialPageRoute(
    builder: (_) => formationTaskDestination(task),
  ));
}

/// Exposed for focused route-contract tests without starting Firestore-backed
/// screen state. [openFormationTask] remains the only navigation entry point.
Widget formationTaskDestination(FormationTask task) {
  switch (task.type) {
    case FormationTaskType.poolCheckin:
      return PoolCheckinScreen(task: task);
    case FormationTaskType.monitorValidation:
    case FormationTaskType.externalProofReview:
      return MonitorValidationScreen(task: task);
    case FormationTaskType.logbookCompletion:
      return LogbookEntryScreen.auto(task: task);
    case FormationTaskType.historicalValidation:
      final batchId = task.context.historicalClaimBatchId;
      if (batchId == null || batchId.isEmpty) {
        return const HistoricalClaimsScreen();
      }
      if (task.currentAssigneeType == FormationTaskAssigneeType.monitor ||
          task.currentAssigneeType ==
              FormationTaskAssigneeType.schoolResponsible) {
        return HistoricalValidationScreen(batchId: batchId);
      }
      return HistoricalClaimQrScreen(batchId: batchId);
    case FormationTaskType.monitorObservation:
      return MonitorObservationScreen(task: task);
    case FormationTaskType.exerciseClaim:
      if (task.context.operationId?.isNotEmpty == true) {
        return ExerciseClaimScreen(task: task);
      }
      return ManualExerciseClaimScreen(task: task);
    case FormationTaskType.claimRejected:
      return ExerciseClaimRetryScreen(task: task);
    case FormationTaskType.buddyConfirmation:
      return const LogbookDiveConfirmationsInboxScreen();
    case FormationTaskType.eventPreparation:
      return FormationTaskDetailScreen(task: task);
    case FormationTaskType.manualReminder:
      return FormationTaskDetailScreen(task: task);
  }
}

Future<void> _openEventPreparationTask(
  BuildContext context,
  FormationTask task,
) async {
  final operationId = task.context.operationId;
  if (operationId == null || operationId.isEmpty) {
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => FormationTaskDetailScreen(
        task: task,
        missingContextMessage:
            'Cette préparation ne contient pas encore de sortie associée.',
      ),
    ));
    return;
  }

  final saved = await Navigator.of(context).push<bool>(MaterialPageRoute(
    builder: (_) => MonitorPlanningScreen(
      operationId: operationId,
      palanqueeId: task.context.palanqueeId,
    ),
  ));
  if (saved != true || !context.mounted) return;

  final userId = context.read<AuthProvider>().currentUser?.uid;
  if (userId == null) return;
  try {
    await FormationTaskService().markDone(
      FirebaseConfig.defaultClubId,
      task.id,
      userId,
      completionData: {
        'operation_id': operationId,
        if (task.context.palanqueeId != null)
          'palanquee_id': task.context.palanqueeId,
      },
    );
  } catch (error) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
            'Le planning est sauvé, mais l\'action reste ouverte : $error'),
      ),
    );
  }
}
