import 'package:cloud_firestore/cloud_firestore.dart';

enum HistoricalExerciseClaimBatchStatus {
  draft,
  submitted,
  inReview,
  validated,
  partiallyValidated,
  rejected,
  cancelled,
}

extension HistoricalExerciseClaimBatchStatusX
    on HistoricalExerciseClaimBatchStatus {
  String get code {
    switch (this) {
      case HistoricalExerciseClaimBatchStatus.draft:
        return 'draft';
      case HistoricalExerciseClaimBatchStatus.submitted:
        return 'submitted';
      case HistoricalExerciseClaimBatchStatus.inReview:
        return 'in_review';
      case HistoricalExerciseClaimBatchStatus.validated:
        return 'validated';
      case HistoricalExerciseClaimBatchStatus.partiallyValidated:
        return 'partially_validated';
      case HistoricalExerciseClaimBatchStatus.rejected:
        return 'rejected';
      case HistoricalExerciseClaimBatchStatus.cancelled:
        return 'cancelled';
    }
  }

  String get label {
    switch (this) {
      case HistoricalExerciseClaimBatchStatus.draft:
        return 'Brouillon';
      case HistoricalExerciseClaimBatchStatus.submitted:
        return 'À vérifier';
      case HistoricalExerciseClaimBatchStatus.inReview:
        return 'En contrôle';
      case HistoricalExerciseClaimBatchStatus.validated:
        return 'Validé';
      case HistoricalExerciseClaimBatchStatus.partiallyValidated:
        return 'Partiellement validé';
      case HistoricalExerciseClaimBatchStatus.rejected:
        return 'Refusé';
      case HistoricalExerciseClaimBatchStatus.cancelled:
        return 'Annulé';
    }
  }

  static HistoricalExerciseClaimBatchStatus fromCode(String? code) {
    switch (code) {
      case 'draft':
        return HistoricalExerciseClaimBatchStatus.draft;
      case 'in_review':
        return HistoricalExerciseClaimBatchStatus.inReview;
      case 'validated':
        return HistoricalExerciseClaimBatchStatus.validated;
      case 'partially_validated':
        return HistoricalExerciseClaimBatchStatus.partiallyValidated;
      case 'rejected':
        return HistoricalExerciseClaimBatchStatus.rejected;
      case 'cancelled':
        return HistoricalExerciseClaimBatchStatus.cancelled;
      case 'submitted':
      default:
        return HistoricalExerciseClaimBatchStatus.submitted;
    }
  }
}

class HistoricalExerciseClaimBatch {
  final String id;
  final String memberId;
  final String? memberName;
  final String? targetLevel;
  final HistoricalExerciseClaimBatchStatus status;
  final List<String> claimIds;
  final DateTime? submittedAt;
  final String? reviewedBy;
  final String? reviewedByName;
  final DateTime? reviewedAt;
  final String? reviewComment;

  const HistoricalExerciseClaimBatch({
    required this.id,
    required this.memberId,
    this.memberName,
    this.targetLevel,
    required this.status,
    this.claimIds = const [],
    this.submittedAt,
    this.reviewedBy,
    this.reviewedByName,
    this.reviewedAt,
    this.reviewComment,
  });

  factory HistoricalExerciseClaimBatch.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    final review = data['review'] as Map<String, dynamic>? ?? const {};
    return HistoricalExerciseClaimBatch(
      id: doc.id,
      memberId: data['member_id'] ?? '',
      memberName: data['member_name'],
      targetLevel: data['target_level'],
      status: HistoricalExerciseClaimBatchStatusX.fromCode(data['status']),
      claimIds: (data['claim_ids'] as List?)?.cast<String>() ?? const [],
      submittedAt: (data['submitted_at'] as Timestamp?)?.toDate(),
      reviewedBy: review['reviewed_by'],
      reviewedByName: review['reviewed_by_name'],
      reviewedAt: (review['reviewed_at'] as Timestamp?)?.toDate(),
      reviewComment: review['comment'],
    );
  }
}

enum HistoricalExerciseClaimDecision { pending, accepted, rejected }

class HistoricalExerciseClaim {
  final String id;
  final String memberId;
  final String exerciseId;
  final String exerciseCode;
  final String exerciseLabel;
  final String? targetLevel;
  final String status;
  final String? decisionComment;

  const HistoricalExerciseClaim({
    required this.id,
    required this.memberId,
    required this.exerciseId,
    required this.exerciseCode,
    required this.exerciseLabel,
    this.targetLevel,
    required this.status,
    this.decisionComment,
  });

  bool get isAccepted => status == 'accepted';
  bool get isRejected => status == 'rejected';

  factory HistoricalExerciseClaim.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    final decision = data['decision'] as Map<String, dynamic>? ?? const {};
    return HistoricalExerciseClaim(
      id: doc.id,
      memberId: data['member_id'] ?? '',
      exerciseId: data['exercise_id'] ?? '',
      exerciseCode: data['exercise_code'] ?? data['exercise_id'] ?? '',
      exerciseLabel: data['exercise_label'] ?? '',
      targetLevel: data['target_level'],
      status: data['status'] ?? 'submitted',
      decisionComment: decision['comment'],
    );
  }
}
