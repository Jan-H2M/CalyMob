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
import 'package:cloud_functions/cloud_functions.dart';

typedef EvaluationRequestInvoker = Future<Map<String, dynamic>> Function(
  Map<String, dynamic> payload,
);

typedef EvaluationDecisionInvoker = Future<Map<String, dynamic>> Function(
  Map<String, dynamic> payload,
);

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
  final FirebaseFunctions? _injectedFunctions;
  final EvaluationRequestInvoker? _evaluationRequestInvoker;
  final EvaluationDecisionInvoker? _evaluationDecisionInvoker;

  ExerciseClaimService({
    FirebaseFirestore? firestore,
    FirebaseFunctions? functions,
    EvaluationRequestInvoker? evaluationRequestInvoker,
    EvaluationDecisionInvoker? evaluationDecisionInvoker,
  })  : _db = firestore ?? FirebaseFirestore.instance,
        _injectedFunctions = functions,
        _evaluationRequestInvoker = evaluationRequestInvoker,
        _evaluationDecisionInvoker = evaluationDecisionInvoker;

  FirebaseFunctions get _functions =>
      _injectedFunctions ??
      FirebaseFunctions.instanceFor(region: 'europe-west1');

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

  /// WP-16 — « Mes déclarations » : tous les claims du membre (hors inbox),
  /// pour affichage groupé par statut (en attente / validés / refusés).
  Future<List<Map<String, dynamic>>> fetchMyClaims(
    String clubId,
    String memberId,
  ) async {
    final snap =
        await _col(clubId).where('member_id', isEqualTo: memberId).get();
    return snap.docs.map((d) => {'id': d.id, ...d.data()}).toList();
  }

  /// Re-submit a rejected claim from CalyMob.
  ///
  /// The current retry value is read by the screen together with the claim and
  /// written back as an exact +1. This mirrors the Firestore rule and keeps the
  /// operation testable outside the widget.
  Future<void> resubmitRejectedClaim(
    String clubId,
    String claimId, {
    required int currentRetry,
    String? note,
  }) async {
    final update = <String, dynamic>{
      'status': 'submitted',
      'retry_count': currentRetry + 1,
      'updated_at': FieldValue.serverTimestamp(),
    };
    final trimmedNote = note?.trim();
    if (trimmedNote != null && trimmedNote.isNotEmpty) {
      update['declaration_notes'] = trimmedNote;
    }
    await _col(clubId).doc(claimId).update(update);
  }

  /// WP-13 — déclaration spontanée (« Je l'ai fait ») : crée un exercise_claim
  /// `submitted` directement (pas de draft préalable). La CF onClaimSubmitted
  /// crée ensuite la tâche de validation moniteur. Remplace l'ancienne écriture
  /// directe dans exercices_valides (désormais CF-only).
  Future<String> createSelfDeclarationClaim({
    required String clubId,
    required String memberId,
    required String declaredBy,
    required String exerciseCode,
    String? exerciseLabel,
    String? exerciseId,
    String? memberName,
    String? sessionId,
    DateTime? contextDate,
    String? notes,
  }) async {
    final ref = await _col(clubId).add({
      'member_id': memberId,
      'declared_by': declaredBy,
      'declared_by_member': true,
      'exercise_code': exerciseCode,
      if (exerciseLabel != null && exerciseLabel.isNotEmpty)
        'exercise_label': exerciseLabel,
      if (exerciseId != null && exerciseId.isNotEmpty)
        'exercise_id': exerciseId,
      if (memberName != null && memberName.isNotEmpty)
        'member_name': memberName,
      'status': 'submitted',
      'validation_mode': 'calypso_monitor',
      'context_type': 'manual',
      if (sessionId != null && sessionId.isNotEmpty) 'session_id': sessionId,
      if (contextDate != null) 'context_date': Timestamp.fromDate(contextDate),
      if (notes != null && notes.trim().isNotEmpty)
        'declaration_notes': notes.trim(),
      'created_at': FieldValue.serverTimestamp(),
      'updated_at': FieldValue.serverTimestamp(),
    });
    return ref.id;
  }

  /// Creates one durable student-initiated evaluation request.
  ///
  /// The document id is derived from the complete business identity of the
  /// request. A double tap, offline retry or resumed submit therefore returns
  /// the same claim instead of creating a second monitor task.
  Future<String> createEvaluationRequest({
    required String clubId,
    required String exerciseId,
    required String contextType,
    required String contextEntryId,
    required String monitorId,
    String? notes,
  }) async {
    if (contextType != 'pool' && contextType != 'dive') {
      throw ArgumentError.value(contextType, 'contextType');
    }
    final payload = <String, dynamic>{
      'clubId': clubId,
      'exerciseId': exerciseId,
      'contextType': contextType,
      'contextEntryId': contextEntryId,
      'monitorId': monitorId,
      if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
    };
    final result = _evaluationRequestInvoker != null
        ? await _evaluationRequestInvoker!(payload)
        : Map<String, dynamic>.from(
            (await _functions
                    .httpsCallable('requestExerciseEvaluation')
                    .call(payload))
                .data as Map,
          );
    final claimId = result['claimId']?.toString();
    if (claimId == null || claimId.isEmpty) {
      throw StateError('La demande n’a pas renvoyé de référence.');
    }
    return claimId;
  }

  Future<Map<String, dynamic>> decideEvaluation({
    required String clubId,
    required String claimId,
    required String result,
    String? comment,
    String? rejectionReason,
  }) async {
    final payload = <String, dynamic>{
      'clubId': clubId,
      'claimId': claimId,
      'result': result,
      if (comment != null && comment.trim().isNotEmpty)
        'comment': comment.trim(),
      if (rejectionReason != null && rejectionReason.trim().isNotEmpty)
        'rejectionReason': rejectionReason.trim(),
    };
    if (_evaluationDecisionInvoker != null) {
      return _evaluationDecisionInvoker!(payload);
    }
    return Map<String, dynamic>.from(
      (await _functions.httpsCallable('decideExerciseEvaluation').call(payload))
          .data as Map,
    );
  }
}
