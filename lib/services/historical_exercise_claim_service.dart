import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/exercice_lifras.dart';
import '../models/historical_exercise_claim_batch.dart';

class HistoricalExerciseClaimService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  CollectionReference<Map<String, dynamic>> _batches(String clubId) =>
      _firestore
          .collection('clubs')
          .doc(clubId)
          .collection('historical_exercise_claim_batches');

  CollectionReference<Map<String, dynamic>> _claims(String clubId) =>
      _firestore.collection('clubs').doc(clubId).collection('exercise_claims');

  CollectionReference<Map<String, dynamic>> _tasks(String clubId) =>
      _firestore.collection('clubs').doc(clubId).collection('formation_tasks');

  Stream<List<HistoricalExerciseClaimBatch>> streamMemberBatches({
    required String clubId,
    required String memberId,
  }) {
    return _batches(clubId)
        .where('member_id', isEqualTo: memberId)
        .snapshots()
        .map((snap) {
      final batches = snap.docs
          .map((doc) => HistoricalExerciseClaimBatch.fromFirestore(doc))
          .toList();
      batches.sort((a, b) {
        final aDate = a.submittedAt ?? DateTime.fromMillisecondsSinceEpoch(0);
        final bDate = b.submittedAt ?? DateTime.fromMillisecondsSinceEpoch(0);
        return bDate.compareTo(aDate);
      });
      return batches;
    });
  }

  Future<HistoricalExerciseClaimBatch?> getBatch({
    required String clubId,
    required String batchId,
  }) async {
    final doc = await _batches(clubId).doc(batchId).get();
    if (!doc.exists) return null;
    return HistoricalExerciseClaimBatch.fromFirestore(doc);
  }

  Stream<List<HistoricalExerciseClaim>> streamBatchClaims({
    required String clubId,
    required String batchId,
  }) {
    return _claims(clubId)
        .where('historical_claim_batch_id', isEqualTo: batchId)
        .snapshots()
        .map((snap) {
      final claims = snap.docs
          .map((doc) => HistoricalExerciseClaim.fromFirestore(doc))
          .toList();
      claims.sort((a, b) => a.exerciseCode.compareTo(b.exerciseCode));
      return claims;
    });
  }

  Future<String> submitHistoricalClaims({
    required String clubId,
    required String memberId,
    required String memberName,
    required String targetLevel,
    required List<ExerciceLIFRAS> exercises,
    String? note,
  }) async {
    if (exercises.isEmpty) {
      throw ArgumentError('At least one exercise is required');
    }

    final batchRef = _batches(clubId).doc();
    final taskRef = _tasks(clubId).doc();
    final writeBatch = _firestore.batch();
    final claimIds = <String>[];

    for (final exercise in exercises) {
      final claimRef = _claims(clubId).doc();
      claimIds.add(claimRef.id);
      writeBatch.set(claimRef, {
        'member_id': memberId,
        'member_name': memberName,
        'exercise_id': exercise.id,
        'exercise_code': exercise.code,
        'exercise_label': exercise.description,
        'target_level': targetLevel,
        'context_type': 'historical_paper_card',
        'declared_by': memberId,
        'declared_at': FieldValue.serverTimestamp(),
        if (note != null && note.trim().isNotEmpty)
          'declaration_notes': note.trim(),
        'validation_mode': 'paper_card_in_person',
        'evidence': const <Map<String, dynamic>>[],
        'status': 'submitted',
        'source': 'student_historical_claim',
        'historical_claim_batch_id': batchRef.id,
        'evidence_type': 'paper_progress_card',
        'created_at': FieldValue.serverTimestamp(),
        'updated_at': FieldValue.serverTimestamp(),
      });
    }

    writeBatch.set(batchRef, {
      'member_id': memberId,
      'member_name': memberName,
      'target_level': targetLevel,
      'status': 'submitted',
      'claim_ids': claimIds,
      'source': 'student_historical_claim',
      'evidence_required': 'paper_progress_card',
      if (note != null && note.trim().isNotEmpty) 'evidence_note': note.trim(),
      'submitted_at': FieldValue.serverTimestamp(),
      'submitted_by': memberId,
      'review': <String, dynamic>{},
      'created_at': FieldValue.serverTimestamp(),
      'updated_at': FieldValue.serverTimestamp(),
    });

    // Student-facing task: it keeps the reprise visible as "à vérifier",
    // without assigning surprise work to a monitor or sending a push storm.
    writeBatch.set(taskRef, {
      'type': 'historical_validation',
      'title': 'Carte papier à faire vérifier',
      'description':
          'Montre ta carte papier à un moniteur. Les exercices seront officiels uniquement après contrôle.',
      'status': 'waiting_for_other',
      'priority': 'normal',
      'member_id': memberId,
      'member_name': memberName,
      'current_assignee_id': memberId,
      'current_assignee_name': memberName,
      'current_assignee_type': 'student',
      'context': {
        'historical_claim_batch_id': batchRef.id,
      },
      'available_actions': const [
        {'key': 'open', 'label': 'Afficher le QR'},
      ],
      'notification_state': {
        'reminder_count': 0,
        'skip_automatic_reminders': true,
      },
      'created_by': memberId,
      'created_by_name': memberName,
      'created_at': FieldValue.serverTimestamp(),
      'updated_at': FieldValue.serverTimestamp(),
    });

    await writeBatch.commit();
    return batchRef.id;
  }

  Future<void> validateBatch({
    required String clubId,
    required String batchId,
    required String monitorId,
    required String monitorName,
    required Map<String, HistoricalExerciseClaimDecision> decisions,
    String? comment,
  }) async {
    if (decisions.isEmpty) {
      throw ArgumentError('At least one decision is required');
    }

    final acceptedCount = decisions.values
        .where(
            (decision) => decision == HistoricalExerciseClaimDecision.accepted)
        .length;
    final rejectedCount = decisions.values
        .where(
            (decision) => decision == HistoricalExerciseClaimDecision.rejected)
        .length;

    final batchStatus = acceptedCount > 0 && rejectedCount == 0
        ? HistoricalExerciseClaimBatchStatus.validated.code
        : acceptedCount > 0
            ? HistoricalExerciseClaimBatchStatus.partiallyValidated.code
            : HistoricalExerciseClaimBatchStatus.rejected.code;

    final writeBatch = _firestore.batch();
    for (final entry in decisions.entries) {
      if (entry.value == HistoricalExerciseClaimDecision.pending) continue;
      writeBatch.update(_claims(clubId).doc(entry.key), {
        'status': entry.value == HistoricalExerciseClaimDecision.accepted
            ? 'accepted'
            : 'rejected',
        'decision': {
          'decided_by': monitorId,
          'decided_by_name': monitorName,
          'decided_at': FieldValue.serverTimestamp(),
          if (comment != null && comment.trim().isNotEmpty)
            'comment': comment.trim(),
        },
        'updated_at': FieldValue.serverTimestamp(),
      });
    }

    writeBatch.update(_batches(clubId).doc(batchId), {
      'status': batchStatus,
      'review': {
        'review_method': 'qr_scan',
        'reviewed_by': monitorId,
        'reviewed_by_name': monitorName,
        'reviewed_at': FieldValue.serverTimestamp(),
        if (comment != null && comment.trim().isNotEmpty)
          'comment': comment.trim(),
      },
      'updated_at': FieldValue.serverTimestamp(),
    });

    final taskSnap = await _tasks(clubId)
        .where('context.historical_claim_batch_id', isEqualTo: batchId)
        .limit(1)
        .get();
    if (taskSnap.docs.isNotEmpty) {
      writeBatch.update(taskSnap.docs.first.reference, {
        'status': 'done',
        'completed_at': FieldValue.serverTimestamp(),
        'completed_by': monitorId,
        'updated_at': FieldValue.serverTimestamp(),
      });
    }

    await writeBatch.commit();
  }
}
