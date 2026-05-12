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
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

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
  Future<List<FormationTask>> fetchUserInbox(String clubId, String userId) async {
    final snap = await _collection(clubId)
        .where('current_assignee_id', isEqualTo: userId)
        .where('status',
            whereIn: ['open', 'snoozed', 'waiting_for_other', 'blocked'])
        .orderBy('created_at', descending: true)
        .get();
    return snap.docs.map((doc) => FormationTask.fromFirestore(doc)).toList();
  }

  // -----------------------------------------------------------------------
  // Narrow updates (must match the whitelist in firestore.rules §10.1)
  // -----------------------------------------------------------------------

  Future<void> markCompleted(String clubId, String taskId, String userId) async {
    await _collection(clubId).doc(taskId).update({
      'status': 'done',
      'completed_at': FieldValue.serverTimestamp(),
      'completed_by': userId,
      'updated_at': FieldValue.serverTimestamp(),
    });
  }

  Future<void> snooze(String clubId, String taskId, DateTime snoozedUntil) async {
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
}
