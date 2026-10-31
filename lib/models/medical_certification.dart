import 'package:cloud_firestore/cloud_firestore.dart';
import '../utils/medical_validity.dart';

/// Statut de validation du certificat médical
enum CertificateStatus {
  pending, // En attente de validation par un admin
  approved, // Approuvé avec date de validité
  rejected, // Refusé avec raison
}

/// Modèle pour un certificat médical
class MedicalCertification {
  final String id;
  final String memberId;
  final String documentUrl;
  final String documentType; // 'image' ou 'pdf'
  final String? fileName;
  final DateTime uploadedAt;
  final CertificateStatus status;

  // Champs remplis par l'admin dans CalyCompta
  final DateTime? validUntil;
  final DateTime? issuedOn;
  final bool datesNeedReview;
  final String? reviewedBy;
  final String? reviewedByNom; // Display name of the reviewer
  final DateTime? reviewedAt;
  final String? rejectionReason;

  MedicalCertification({
    required this.id,
    required this.memberId,
    required this.documentUrl,
    required this.documentType,
    this.fileName,
    required this.uploadedAt,
    required this.status,
    this.validUntil,
    this.issuedOn,
    this.datesNeedReview = false,
    this.reviewedBy,
    this.reviewedByNom,
    this.reviewedAt,
    this.rejectionReason,
  });

  /// Convertir depuis Firestore
  factory MedicalCertification.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    return MedicalCertification(
      id: doc.id,
      memberId: data['member_id'] ?? '',
      documentUrl: data['document_url'] ?? '',
      documentType: data['document_type'] ?? 'image',
      fileName: data['file_name'],
      uploadedAt:
          (data['uploaded_at'] as Timestamp?)?.toDate() ?? DateTime.now(),
      status: _parseStatus(data['status']),
      validUntil: parseMedicalDate(data['valid_until']),
      issuedOn: parseMedicalDate(data['issued_on']),
      datesNeedReview: (data['issued_on'] != null &&
              parseMedicalDate(data['issued_on']) == null) ||
          (data['valid_until'] != null &&
              parseMedicalDate(data['valid_until']) == null),
      reviewedBy: data['reviewed_by'],
      reviewedByNom: data['reviewed_by_nom'],
      reviewedAt: (data['reviewed_at'] as Timestamp?)?.toDate(),
      rejectionReason: data['rejection_reason'],
    );
  }

  /// Convertir vers Firestore
  Map<String, dynamic> toFirestore() {
    return {
      'member_id': memberId,
      'document_url': documentUrl,
      'document_type': documentType,
      'file_name': fileName,
      'uploaded_at': Timestamp.fromDate(uploadedAt),
      'status': status.name,
      if (validUntil != null) 'valid_until': Timestamp.fromDate(validUntil!),
      if (issuedOn != null) 'issued_on': Timestamp.fromDate(issuedOn!),
      if (reviewedBy != null) 'reviewed_by': reviewedBy,
      if (reviewedAt != null) 'reviewed_at': Timestamp.fromDate(reviewedAt!),
      if (rejectionReason != null) 'rejection_reason': rejectionReason,
    };
  }

  static CertificateStatus _parseStatus(String? status) {
    switch (status) {
      case 'approved':
        return CertificateStatus.approved;
      case 'rejected':
        return CertificateStatus.rejected;
      case 'pending':
      default:
        return CertificateStatus.pending;
    }
  }

  /// Vérifie si le certificat est actuellement valide (approuvé et non expiré)
  bool get isValid {
    return validity.status == MedicalValidityStatus.valid || isExpiringSoon;
  }

  /// Vérifie si le certificat expire bientôt (dans les 30 jours)
  bool get isExpiringSoon {
    return validity.status == MedicalValidityStatus.expiringSoon;
  }

  /// Vérifie si le certificat est expiré
  bool get isExpired {
    return validity.status == MedicalValidityStatus.expired;
  }

  /// Nombre de jours jusqu'à l'expiration (négatif si expiré)
  int? get daysUntilExpiry {
    return validity.daysRemaining;
  }

  MedicalValidity get validity => MedicalValidity.evaluate(
      issuedOn: issuedOn,
      validUntil: validUntil,
      needsReview: datesNeedReview,
      approved: status == CertificateStatus.approved);

  /// The annual issue date belongs to the canonical current member summary,
  /// not to a file's upload time. Join only on the same approved validity date;
  /// conflicting summaries stay unknown rather than reviving an old document.
  MedicalCertification withMemberDates(Map<String, dynamic> member) {
    if (status != CertificateStatus.approved) return this;
    final rawIssued = member['certificat_medical_date'];
    final rawUntil = member['certificat_medical_validite'];
    final issue = parseMedicalDate(rawIssued),
        until = parseMedicalDate(rawUntil);
    final conflicting = (until == null ||
        validUntil == null ||
        until.year != validUntil!.year ||
        until.month != validUntil!.month ||
        until.day != validUntil!.day);
    return MedicalCertification(
        id: id,
        memberId: memberId,
        documentUrl: documentUrl,
        documentType: documentType,
        fileName: fileName,
        uploadedAt: uploadedAt,
        status: status,
        validUntil: validUntil,
        issuedOn: conflicting ? issuedOn : issue ?? issuedOn,
        datesNeedReview: datesNeedReview ||
            conflicting ||
            (rawIssued != null && issue == null),
        reviewedBy: reviewedBy,
        reviewedByNom: reviewedByNom,
        reviewedAt: reviewedAt,
        rejectionReason: rejectionReason);
  }

  /// Peut être présenté (valide et non expiré)
  bool get canPresent => isValid && !isExpired;
}
