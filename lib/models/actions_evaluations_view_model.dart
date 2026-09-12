import 'package:cloud_firestore/cloud_firestore.dart';

import 'formation_task.dart';
import 'formation_task_roster.dart';

enum ActionsEvaluationsSegment { todo, done, all }

extension ActionsEvaluationsSegmentLabel on ActionsEvaluationsSegment {
  String get label => switch (this) {
        ActionsEvaluationsSegment.todo => 'À faire',
        ActionsEvaluationsSegment.done => 'Fait',
        ActionsEvaluationsSegment.all => 'Tout',
      };
}

/// Status-bearing presentation model for one durable buddy confirmation.
class LogbookConfirmationAction {
  final String id;
  final String sourceMemberName;
  final String locationName;
  final String matchType;
  final String status;
  final DateTime? createdAt;
  final DateTime? respondedAt;

  const LogbookConfirmationAction({
    required this.id,
    required this.sourceMemberName,
    required this.locationName,
    required this.matchType,
    this.status = 'pending',
    this.createdAt,
    this.respondedAt,
  });

  factory LogbookConfirmationAction.fromFirestore(
    QueryDocumentSnapshot<Map<String, dynamic>> document,
  ) {
    final data = document.data();
    final dive = Map<String, dynamic>.from(
      (data['dive_snapshot'] as Map?) ?? const {},
    );
    return LogbookConfirmationAction(
      id: document.id,
      sourceMemberName:
          (data['source_member_name'] as String?)?.trim().isNotEmpty == true
              ? (data['source_member_name'] as String).trim()
              : 'Un membre',
      locationName:
          (dive['location_name'] as String?)?.trim().isNotEmpty == true
              ? (dive['location_name'] as String).trim()
              : 'Plongée',
      matchType: data['match_type'] as String? ?? 'none',
      status: data['status'] as String? ?? 'pending',
      createdAt: _dateFrom(data['created_at']),
      respondedAt:
          _dateFrom(data['responded_at']) ?? _dateFrom(data['updated_at']),
    );
  }

  bool get isActionable => status == 'pending';
  bool get isDone => !isActionable;
  DateTime? get activityAt => respondedAt ?? createdAt;

  String get statusLabel => switch (status) {
        'pending' => 'À confirmer',
        'confirmed_copied' => 'Confirmée et copiée',
        'confirmed_existing_identical' => 'Confirmée · déjà identique',
        'confirmed_existing_notes_merged' => 'Confirmée · notes ajoutées',
        'confirmed_existing_different' => 'Confirmée · version conservée',
        'confirmed_no_import' => 'Confirmée sans import',
        'declined' => 'Refusée',
        'cancelled' => 'Annulée',
        _ => 'Réponse enregistrée',
      };

  bool matches(String query) => matchesActionsSearch(query, [
        sourceMemberName,
        locationName,
        'Carnet',
        'plongée',
        statusLabel,
        if (isActionable) ...['confirmer', 'importer', 'ignorer'],
      ]);
}

class ActionsEvaluationsViewModel {
  final List<LogbookConfirmationAction> confirmations;
  final List<FormationTask> standaloneTasks;
  final List<FormationTaskRoster> rosters;

  const ActionsEvaluationsViewModel({
    required this.confirmations,
    required this.standaloneTasks,
    required this.rosters,
  });

  factory ActionsEvaluationsViewModel.build({
    required Iterable<LogbookConfirmationAction> confirmations,
    required Iterable<FormationTask> tasks,
    required ActionsEvaluationsSegment segment,
    String searchQuery = '',
  }) {
    final uniqueConfirmations = _latestById<LogbookConfirmationAction>(
      confirmations,
      idOf: (item) => item.id,
      dateOf: (item) => item.activityAt,
    )
        .where((item) => _matchesSegment(item.isActionable, segment))
        .where(
          (item) => item.matches(searchQuery),
        )
        .toList()
      ..sort((a, b) => compareActionsNewest(a.activityAt, b.activityAt));

    final uniqueTasks = _latestById<FormationTask>(
      tasks.where((task) => task.belongsInActionsEvaluations),
      idOf: (task) => task.id,
      dateOf: taskActivityAt,
    ).where((task) => _matchesSegment(!task.isClosed, segment)).toList();

    // Active observation tasks retain their grouped workflow. Closed
    // observations are individual history entries so a validator can inspect
    // and, for completed evaluations, correct that exact persisted outcome.
    final activeObservationTasks = uniqueTasks
        .where(
          (task) =>
              task.type == FormationTaskType.monitorObservation &&
              !task.isClosed,
        )
        .toList(growable: false);
    final standaloneTasks = uniqueTasks
        .where(
          (task) =>
              (task.type != FormationTaskType.monitorObservation ||
                  task.isClosed) &&
              taskMatchesActionsSearch(task, searchQuery),
        )
        .toList()
      ..sort(
        (a, b) => compareActionsNewest(taskActivityAt(a), taskActivityAt(b)),
      );
    final rosters = FormationTaskRoster.aggregate(activeObservationTasks)
        .where((roster) => rosterMatchesActionsSearch(roster, searchQuery))
        .toList()
      ..sort(
        (a, b) => compareActionsNewest(
          rosterActivityAt(a),
          rosterActivityAt(b),
        ),
      );

    return ActionsEvaluationsViewModel(
      confirmations: List.unmodifiable(uniqueConfirmations),
      standaloneTasks: List.unmodifiable(standaloneTasks),
      rosters: List.unmodifiable(rosters),
    );
  }

  bool get isEmpty =>
      confirmations.isEmpty && standaloneTasks.isEmpty && rosters.isEmpty;
}

bool _matchesSegment(bool actionable, ActionsEvaluationsSegment segment) =>
    switch (segment) {
      ActionsEvaluationsSegment.todo => actionable,
      ActionsEvaluationsSegment.done => !actionable,
      ActionsEvaluationsSegment.all => true,
    };

List<T> _latestById<T>(
  Iterable<T> values, {
  required String Function(T) idOf,
  required DateTime? Function(T) dateOf,
}) {
  final byId = <String, T>{};
  for (final value in values) {
    final id = idOf(value);
    final existing = byId[id];
    if (existing == null ||
        compareActionsNewest(dateOf(value), dateOf(existing)) < 0) {
      byId[id] = value;
    }
  }
  return byId.values.toList(growable: false);
}

DateTime? taskActivityAt(FormationTask task) =>
    task.completedAt ?? task.updatedAt ?? task.createdAt;

DateTime? rosterActivityAt(FormationTaskRoster roster) {
  DateTime? latest;
  for (final task in roster.members.expand((member) => member.tasks)) {
    final value = taskActivityAt(task);
    if (value != null && (latest == null || value.isAfter(latest))) {
      latest = value;
    }
  }
  return latest;
}

int compareActionsNewest(DateTime? a, DateTime? b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b.compareTo(a);
}

bool taskMatchesActionsSearch(FormationTask task, String query) =>
    matchesActionsSearch(query, [
      task.title,
      task.description,
      task.memberName,
      task.currentAssigneeName,
      task.context.operationTitle,
      task.context.targetGroupLevel,
      task.context.groupKey,
      task.effectiveThemeSnapshot,
      task.typeLabel,
      formationTaskStatusLabel(task.status),
    ]);

bool rosterMatchesActionsSearch(FormationTaskRoster roster, String query) =>
    matchesActionsSearch(query, [
      roster.level,
      roster.theme,
      roster.groupKey,
      'Évaluation groupée',
      ...roster.members.map((member) => member.displayName),
    ]);

bool matchesActionsSearch(String query, Iterable<String?> values) {
  final normalized = _normalize(query);
  if (normalized.isEmpty) return true;
  return values.any((value) => _normalize(value ?? '').contains(normalized));
}

String formationTaskStatusLabel(FormationTaskStatus status) => switch (status) {
      FormationTaskStatus.open => 'À faire',
      FormationTaskStatus.snoozed => 'Reportée',
      FormationTaskStatus.waitingForOther => 'En attente',
      FormationTaskStatus.blocked => 'Action requise',
      FormationTaskStatus.done => 'Terminée',
      FormationTaskStatus.dismissed => 'Classée sans suite',
      FormationTaskStatus.expired => 'Expirée',
    };

String _normalize(String value) => value
    .trim()
    .toLowerCase()
    .replaceAll(RegExp(r'[àáâä]'), 'a')
    .replaceAll(RegExp(r'[èéêë]'), 'e')
    .replaceAll(RegExp(r'[ìíîï]'), 'i')
    .replaceAll(RegExp(r'[òóôö]'), 'o')
    .replaceAll(RegExp(r'[ùúûü]'), 'u')
    .replaceAll('ç', 'c')
    .replaceAll(RegExp(r'\s+'), ' ');

DateTime? _dateFrom(Object? value) {
  if (value is Timestamp) return value.toDate();
  if (value is DateTime) return value;
  if (value is String) return DateTime.tryParse(value);
  return null;
}
