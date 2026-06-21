/// Carnet de Formation — formation_tasks Dart model.
///
/// Mirrors the TypeScript interface in
/// `CalyCompta/src/types/carnetFormation.ts` (FormationTask).
/// See `CARNET_DE_FORMATION_TECH.md` v2.1 §6.1.
///
/// Convention :
///   - Firestore field names are snake_case (English-canonical).
///   - Dart class fields are camelCase.

import 'package:cloud_firestore/cloud_firestore.dart';

enum FormationTaskType {
  poolCheckin,
  logbookCompletion,
  exerciseClaim,
  monitorValidation,
  externalProofReview,
  buddyConfirmation,
  eventPreparation,
  manualReminder,

  /// Student submitted existing paper-card exercises; a monitor must verify
  /// the physical card before the rows become official.
  historicalValidation,

  /// v2.2 — holistic evaluation by the group validator after a pool
  /// session is closed. Created by Cloud Function `onPoolSessionClosed`.
  monitorObservation,
}

enum FormationTaskStatus {
  open,
  snoozed,
  waitingForOther,
  done,
  dismissed,
  blocked,
  expired
}

enum FormationTaskAssigneeType {
  student,
  monitor,
  buddy,
  schoolResponsible,
  system
}

class FormationTaskAction {
  final String key;
  final String label;
  final String? targetScreen;

  const FormationTaskAction({
    required this.key,
    required this.label,
    this.targetScreen,
  });

  factory FormationTaskAction.fromMap(Map<String, dynamic> map) {
    return FormationTaskAction(
      key: map['key'] ?? '',
      label: map['label'] ?? '',
      targetScreen: map['target_screen'],
    );
  }
}

/// One group an encadrant supervised during a pool session.
///
/// Snapshotted from the planning (`piscine_sessions/{id}.niveaux[level]
/// .courses_by_hour[heure][i]`) by `onPiscineAttendeeCreated` when the
/// attendee is found in a course's `encadrants[]`. Used to pre-fill the
/// encadrant variant of the pool check-in screen.
class FormationTaskEncadrantGroup {
  final String? level; // '1*'/'2*'/...
  final int? groupNumber; // 1-based position of the course within the hour
  final String? theme;
  final String? courseId;
  final String? heure; // '1ere_heure' | '2eme_heure'

  const FormationTaskEncadrantGroup({
    this.level,
    this.groupNumber,
    this.theme,
    this.courseId,
    this.heure,
  });

  factory FormationTaskEncadrantGroup.fromMap(Map<String, dynamic> map) {
    return FormationTaskEncadrantGroup(
      level: map['level'],
      groupNumber: (map['group_number'] as num?)?.toInt(),
      theme: map['theme'],
      courseId: map['course_id'],
      heure: map['heure'],
    );
  }

  Map<String, dynamic> toMap() => {
        if (level != null) 'level': level,
        if (groupNumber != null) 'group_number': groupNumber,
        if (theme != null) 'theme': theme,
        if (courseId != null) 'course_id': courseId,
        if (heure != null) 'heure': heure,
      };

  /// e.g. "2★ · Groupe 1 — répétition brevet 2★"
  String get displayLabel {
    final lvl = level ?? '';
    final grp = groupNumber != null ? ' · Groupe $groupNumber' : '';
    final th = (theme != null && theme!.trim().isNotEmpty) ? ' — ${theme!.trim()}' : '';
    return '$lvl$grp$th'.trim();
  }
}

class FormationTaskContext {
  final String? operationId;
  final String? operationTitle;
  final String? poolSessionId;
  final String? attendeeId;
  final String? levelCourseId;
  final String? targetGroupLevel;
  final String? groupKey;
  final String? themeSnapshot;
  final String? level;
  final List<String> candidateValidatorIds;
  final String? logbookEntryId;
  final String? exerciseClaimId;
  final String? historicalClaimBatchId;
  final String? palanqueeId;
  final String? locationId;

  /// Role of the assignee for a pool_checkin task. `'encadrant'` switches the
  /// check-in screen to the formateur variant; null/absent ⇒ student variant.
  final String? role;

  /// Groups the encadrant supervised tonight (only set when role == 'encadrant').
  final List<FormationTaskEncadrantGroup> encadrantGroups;

  const FormationTaskContext({
    this.operationId,
    this.operationTitle,
    this.poolSessionId,
    this.attendeeId,
    this.levelCourseId,
    this.targetGroupLevel,
    this.groupKey,
    this.themeSnapshot,
    this.level,
    this.candidateValidatorIds = const [],
    this.logbookEntryId,
    this.exerciseClaimId,
    this.historicalClaimBatchId,
    this.palanqueeId,
    this.locationId,
    this.role,
    this.encadrantGroups = const [],
  });

  bool get isEncadrant => role == 'encadrant';

  factory FormationTaskContext.fromMap(Map<String, dynamic>? map) {
    if (map == null) return const FormationTaskContext();
    return FormationTaskContext(
      operationId: map['operation_id'],
      operationTitle: map['operation_title'],
      poolSessionId: map['pool_session_id'],
      attendeeId: map['attendee_id'],
      levelCourseId: map['level_course_id'],
      targetGroupLevel: map['target_group_level'],
      groupKey: map['group_key'],
      themeSnapshot: map['theme_snapshot'],
      level: map['level'],
      candidateValidatorIds:
          (map['candidate_validator_ids'] as List?)?.cast<String>() ?? const [],
      logbookEntryId: map['logbook_entry_id'],
      exerciseClaimId: map['exercise_claim_id'],
      historicalClaimBatchId: map['historical_claim_batch_id'],
      palanqueeId: map['palanquee_id'],
      locationId: map['location_id'],
      role: map['role'],
      encadrantGroups: (map['encadrant_groups'] as List?)
              ?.whereType<Map<String, dynamic>>()
              .map(FormationTaskEncadrantGroup.fromMap)
              .toList() ??
          const [],
    );
  }
}

class FormationTaskNotificationState {
  final DateTime? pushSentAt;
  final DateTime? emailSentAt;
  final int reminderCount;
  final DateTime? lastReminderAt;

  const FormationTaskNotificationState({
    this.pushSentAt,
    this.emailSentAt,
    this.reminderCount = 0,
    this.lastReminderAt,
  });

  factory FormationTaskNotificationState.fromMap(Map<String, dynamic>? map) {
    if (map == null) return const FormationTaskNotificationState();
    return FormationTaskNotificationState(
      pushSentAt: (map['push_sent_at'] as Timestamp?)?.toDate(),
      emailSentAt: (map['email_sent_at'] as Timestamp?)?.toDate(),
      reminderCount: (map['reminder_count'] as num?)?.toInt() ?? 0,
      lastReminderAt: (map['last_reminder_at'] as Timestamp?)?.toDate(),
    );
  }
}

class FormationTask {
  final String id;
  final FormationTaskType type;
  final String title;
  final String? description;
  final FormationTaskStatus status;
  final String priority; // 'low' | 'normal' | 'high'
  final String memberId;
  final String? memberName;
  final String currentAssigneeId;
  final String? currentAssigneeName;
  final FormationTaskAssigneeType currentAssigneeType;
  final FormationTaskContext context;
  final DateTime? dueAt;
  final DateTime? snoozedUntil;
  final DateTime? completedAt;
  final String? completedBy;
  final List<FormationTaskAction> availableActions;
  final FormationTaskNotificationState notificationState;
  final String createdBy;
  final String? createdByName;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  const FormationTask({
    required this.id,
    required this.type,
    required this.title,
    this.description,
    required this.status,
    this.priority = 'normal',
    required this.memberId,
    this.memberName,
    required this.currentAssigneeId,
    this.currentAssigneeName,
    required this.currentAssigneeType,
    required this.context,
    this.dueAt,
    this.snoozedUntil,
    this.completedAt,
    this.completedBy,
    this.availableActions = const [],
    this.notificationState = const FormationTaskNotificationState(),
    this.createdBy = 'system',
    this.createdByName,
    this.createdAt,
    this.updatedAt,
  });

  factory FormationTask.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return FormationTask(
      id: doc.id,
      type: _parseType(data['type']),
      title: data['title'] ?? '',
      description: data['description'],
      status: _parseStatus(data['status']),
      priority: data['priority'] ?? 'normal',
      memberId: data['member_id'] ?? '',
      memberName: data['member_name'],
      currentAssigneeId: data['current_assignee_id'] ?? '',
      currentAssigneeName: data['current_assignee_name'],
      currentAssigneeType: _parseAssigneeType(data['current_assignee_type']),
      context: FormationTaskContext.fromMap(
          data['context'] as Map<String, dynamic>?),
      dueAt: (data['due_at'] as Timestamp?)?.toDate(),
      snoozedUntil: (data['snoozed_until'] as Timestamp?)?.toDate(),
      completedAt: (data['completed_at'] as Timestamp?)?.toDate(),
      completedBy: data['completed_by'],
      availableActions: (data['available_actions'] as List?)
              ?.map(
                  (e) => FormationTaskAction.fromMap(e as Map<String, dynamic>))
              .toList() ??
          const [],
      notificationState: FormationTaskNotificationState.fromMap(
          data['notification_state'] as Map<String, dynamic>?),
      createdBy: data['created_by'] ?? 'system',
      createdByName: data['created_by_name'],
      createdAt: (data['created_at'] as Timestamp?)?.toDate(),
      updatedAt: (data['updated_at'] as Timestamp?)?.toDate(),
    );
  }

  static FormationTaskType _parseType(String? s) {
    switch (s) {
      case 'pool_checkin':
        return FormationTaskType.poolCheckin;
      case 'logbook_completion':
        return FormationTaskType.logbookCompletion;
      case 'exercise_claim':
        return FormationTaskType.exerciseClaim;
      case 'monitor_validation':
        return FormationTaskType.monitorValidation;
      case 'external_proof_review':
        return FormationTaskType.externalProofReview;
      case 'buddy_confirmation':
        return FormationTaskType.buddyConfirmation;
      case 'event_preparation':
        return FormationTaskType.eventPreparation;
      case 'historical_validation':
        return FormationTaskType.historicalValidation;
      case 'monitor_observation':
        return FormationTaskType.monitorObservation;
      default:
        return FormationTaskType.manualReminder;
    }
  }

  static FormationTaskStatus _parseStatus(String? s) {
    switch (s) {
      case 'snoozed':
        return FormationTaskStatus.snoozed;
      case 'waiting_for_other':
        return FormationTaskStatus.waitingForOther;
      case 'done':
        return FormationTaskStatus.done;
      case 'dismissed':
        return FormationTaskStatus.dismissed;
      case 'blocked':
        return FormationTaskStatus.blocked;
      case 'expired':
        return FormationTaskStatus.expired;
      default:
        return FormationTaskStatus.open;
    }
  }

  static FormationTaskAssigneeType _parseAssigneeType(String? s) {
    switch (s) {
      case 'monitor':
        return FormationTaskAssigneeType.monitor;
      case 'buddy':
        return FormationTaskAssigneeType.buddy;
      case 'school_responsible':
        return FormationTaskAssigneeType.schoolResponsible;
      case 'system':
        return FormationTaskAssigneeType.system;
      default:
        return FormationTaskAssigneeType.student;
    }
  }

  /// Human-readable French label for the task type (used in cards).
  String get typeLabel {
    switch (type) {
      case FormationTaskType.poolCheckin:
        return 'Piscine à compléter';
      case FormationTaskType.logbookCompletion:
        return 'Carnet à compléter';
      case FormationTaskType.exerciseClaim:
        return 'Exercice déclaré';
      case FormationTaskType.monitorValidation:
        return 'Validation';
      case FormationTaskType.externalProofReview:
        return 'Preuve externe';
      case FormationTaskType.buddyConfirmation:
        return 'Confirmation buddy';
      case FormationTaskType.eventPreparation:
        return 'Préparation';
      case FormationTaskType.manualReminder:
        return 'Rappel';
      case FormationTaskType.historicalValidation:
        return 'Carte papier';
      case FormationTaskType.monitorObservation:
        return 'Évaluation';
    }
  }

  /// Initial used for the avatar in the inbox card.
  String get glyph {
    switch (type) {
      case FormationTaskType.poolCheckin:
        return 'P';
      case FormationTaskType.logbookCompletion:
        return 'C';
      case FormationTaskType.exerciseClaim:
        return 'E';
      case FormationTaskType.monitorValidation:
        return 'V';
      case FormationTaskType.externalProofReview:
        return '!';
      case FormationTaskType.buddyConfirmation:
        return 'B';
      case FormationTaskType.eventPreparation:
        return 'P';
      case FormationTaskType.manualReminder:
        return '·';
      case FormationTaskType.historicalValidation:
        return 'H';
      case FormationTaskType.monitorObservation:
        return 'O';
    }
  }
}
