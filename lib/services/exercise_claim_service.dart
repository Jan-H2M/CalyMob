/// Carnet de Formation — exercise_claims read/submit service (WP-04).
///
/// Reads the member's `draft` claims for a given operation and submits the ones
/// the student decides to keep (batch `draft → submitted`). The onClaimSubmitted
/// Cloud Function then spawns the monitor_validation task.
///
/// Note: to avoid requiring a new 3-field composite index, we query on the
/// existing (member_id, status) index and filter `operation_id` in memory —
/// a member only ever has a handful of draft claims at once.

import 'package:cloud_firestore/cloud_firestore.dart';

class ExerciseClaimDraft {
  final String id;
  final String exerciseCode;
  final String? exerciseLabel;
  final String? monitorName;

  const ExerciseClaimDraft({
    required this.id,
    required this.exerciseCode,
    this.exerciseLabel,
    this.monitorName,
  });
}

class ExerciseClaimService {
  final FirebaseFirestore _db;

  ExerciseClaimService({FirebaseFirestore? firestore})
      : _db = firestore ?? FirebaseFirestore.instance;

  CollectionReference<Map<String, dynamic>> _col(String clubId) =>
      _db.collection('clubs').doc(clubId).collection('exercise_claims');

  /// Draft claims of [memberId] filed against [operationId].
  Future<List<ExerciseClaimDraft>> fetchDraftsForOperation(
    String clubId,
    String memberId,
    String operationId,
  ) async {
    final snap = await _col(clubId)
        .where('member_id', isEqualTo: memberId)
        .where('status', isEqualTo: 'draft')
        .get();

    return snap.docs
        .where((d) => (d.data()['operation_id'] ?? '') == operationId)
        .map((d) {
      final data = d.data();
      return ExerciseClaimDraft(
        id: d.id,
        exerciseCode:
            (data['exercise_code'] ?? data['exercise_id'] ?? '?').toString(),
        exerciseLabel: data['exercise_label'] as String?,
        monitorName: data['monitor_name'] as String?,
      );
    }).toList();
  }

  /// Batch-submit the kept drafts. [notes] maps claimId → optional note to
  /// persist as `declaration_notes`. Only ids present in [claimIds] are touched;
  /// a claim already moved out of `draft` elsewhere is left as-is by the merge.
  Future<void> submitClaims(
    String clubId,
    List<String> claimIds, {
    Map<String, String> notes = const {},
  }) async {
    if (claimIds.isEmpty) return;
    final batch = _db.batch();
    for (final id in claimIds) {
      final update = <String, dynamic>{
        'status': 'submitted',
        'updated_at': FieldValue.serverTimestamp(),
      };
      final note = notes[id];
      if (note != null && note.trim().isNotEmpty) {
        update['declaration_notes'] = note.trim();
      }
      batch.update(_col(clubId).doc(id), update);
    }
    await batch.commit();
  }
}
