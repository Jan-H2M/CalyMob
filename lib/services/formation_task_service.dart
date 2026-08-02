/// Carnet de Formation — task read/update service.
///
/// Reads `clubs/{clubId}/formation_tasks` filtered to the current user's
/// assigned tasks. Narrow updates (status / snooze / completion) match
/// the firestore.rules whitelist.
///
/// See `CARNET_DE_FORMATION_TECH.md` v2.1 §6.1 + §10.1.

import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/formation_task.dart';

class FormationTaskService {
  final FirebaseFirestore _firestore;

  FormationTaskService({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  CollectionReference<Map<String, dynamic>> _collection(String clubId) =>
      _firestore.collection('clubs').doc(clubId).collection('formation_tasks');

  /// Real-time stream of OPEN inbox tasks for the current user.
  /// Includes `open` / `snoozed` / `waiting_for_other` / `blocked` (everything
  /// the user still has to deal with). Excludes `done` and `dismissed`.
  Stream<List<FormationTask>> streamUserInbox(String clubId, String userId) {
    return _collection(clubId)
        .where('current_assignee_id', isEqualTo: userId)
        .where('status',
            whereIn: ['open', 'snoozed', 'waiting_for_other', 'blocked'])
        .orderBy('created_at', descending: true)
        .snapshots()
        .map((snap) =>
            snap.docs.map((doc) => FormationTask.fromFirestore(doc)).toList());
  }

  /// One-shot fetch — used for splash screens or testing.
  Future<List<FormationTask>> fetchUserInbox(
      String clubId, String userId) async {
    final snap = await _collection(clubId)
        .where('current_assignee_id', isEqualTo: userId)
        .where('status',
            whereIn: ['open', 'snoozed', 'waiting_for_other', 'blocked'])
        .orderBy('created_at', descending: true)
        .get();
    return snap.docs.map((doc) => FormationTask.fromFirestore(doc)).toList();
  }

  /// Fetch one notification target and verify it still belongs to the user.
  ///
  /// The explicit assignee check is defence in depth in addition to Firestore
  /// rules. A stale notification must never open another member's task after
  /// reassignment.
  Future<FormationTask?> fetchAssignedTask(
    String clubId,
    String taskId,
    String userId,
  ) async {
    final snap = await _collection(clubId).doc(taskId).get();
    if (!snap.exists) return null;
    final task = FormationTask.fromFirestore(snap);
    if (task.currentAssigneeId != userId) return null;
    return task;
  }

  // -----------------------------------------------------------------------
  // Narrow updates (must match the whitelist in firestore.rules §10.1)
  // -----------------------------------------------------------------------

  Future<void> markCompleted(
      String clubId, String taskId, String userId) async {
    await markDone(clubId, taskId, userId);
  }

  /// Mark a task as done.
  ///
  /// Optional [completionData] is written to the task and is read by
  /// downstream Cloud Functions — e.g. `onPoolCheckinCompleted` reads it to
  /// propagate the chosen group / outcome onto the attendee doc.
  ///
  /// Mirrors the TypeScript helper in CalyCompta
  /// `formationTaskService.markTaskCompleted`.
  Future<void> markDone(
    String clubId,
    String taskId,
    String userId, {
    Map<String, dynamic>? completionData,
  }) async {
    final payload = <String, dynamic>{
      'status': 'done',
      'completed_at': FieldValue.serverTimestamp(),
      'completed_by': userId,
      'updated_at': FieldValue.serverTimestamp(),
    };
    if (completionData != null && completionData.isNotEmpty) {
      payload['completion_data'] = completionData;
    }
    await _collection(clubId).doc(taskId).update(payload);
  }

  Future<void> snooze(
      String clubId, String taskId, DateTime snoozedUntil) async {
    await _collection(clubId).doc(taskId).update({
      'status': 'snoozed',
      'snoozed_until': Timestamp.fromDate(snoozedUntil),
      'updated_at': FieldValue.serverTimestamp(),
    });
  }

  Future<void> dismiss(String clubId, String taskId, String userId) async {
    await _collection(clubId).doc(taskId).update({
      'status': 'dismissed',
      'completed_at': FieldValue.serverTimestamp(),
      'completed_by': userId,
      'updated_at': FieldValue.serverTimestamp(),
    });
  }

  /// Completes every legacy task represented by a group roster atomically.
  ///
  /// Existing task documents remain the source of truth, so the existing
  /// `onMonitorObservationCompleted` trigger continues to materialise one
  /// pool-theme observation per member without a schema migration.
  Future<void> markObservationRosterDone(
    String clubId,
    String userId,
    String observerName,
    Map<String, FormationTaskRosterCompletion> completions,
  ) async {
    if (completions.isEmpty) return;
    final batch = _firestore.batch();
    for (final entry in completions.entries) {
      final value = entry.value;
      batch.update(_collection(clubId).doc(entry.key), {
        'status': 'done',
        'completed_at': FieldValue.serverTimestamp(),
        'completed_by': userId,
        'updated_at': FieldValue.serverTimestamp(),
        'completion_data': {
          if (value.verdict != null) 'verdict': value.verdict,
          'attendance_status': value.attendanceStatus,
          'pool_session_id': value.poolSessionId,
          'group_key': value.groupKey,
          'theme_snapshot': value.themeSnapshot,
          'member_id': value.memberId,
          if (value.logbookEntryId != null)
            'logbook_entry_id': value.logbookEntryId,
          'observer_id': userId,
          'observer_name': observerName,
          if (value.comment.trim().isNotEmpty) 'comment': value.comment.trim(),
        },
      });
    }
    await batch.commit();
  }

  /// Persists a validator correction without completing the roster.
  ///
  /// `completion_data` is an existing client-writable compatibility field.
  /// Keeping the override on each underlying task makes legacy documents
  /// reload consistently while preserving their original context snapshots.
  Future<void> updateObservationRosterTheme(
    String clubId,
    Iterable<String> taskIds,
    String theme,
  ) async {
    final normalized = theme.trim();
    if (normalized.isEmpty) {
      throw ArgumentError.value(theme, 'theme', 'Le thème est obligatoire');
    }
    final ids = taskIds.toSet();
    if (ids.isEmpty) return;
    final batch = _firestore.batch();
    for (final taskId in ids) {
      batch.update(_collection(clubId).doc(taskId), {
        'completion_data.theme_snapshot': normalized,
        'updated_at': FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
}

class FormationTaskRosterCompletion {
  final String? verdict;
  final String attendanceStatus;
  final String comment;
  final String? poolSessionId;
  final String? groupKey;
  final String? themeSnapshot;
  final String memberId;
  final String? logbookEntryId;

  const FormationTaskRosterCompletion({
    required this.verdict,
    required this.attendanceStatus,
    required this.comment,
    this.poolSessionId,
    this.groupKey,
    this.themeSnapshot,
    required this.memberId,
    this.logbookEntryId,
  });
}
