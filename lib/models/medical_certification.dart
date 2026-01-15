import 'package:cloud_firestore/cloud_firestore.dart';

/// Statut de validation du certificat médical
enum CertificateStatus {
  pending,   // En attente de validation par un admin
  approved,  // Approuvé avec date de validité
  rejected,  // Refusé avec raison
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
      uploadedAt: (data['uploaded_at'] as Timestamp?)?.toDate() ?? DateTime.now(),
      status: _parseStatus(data['status']),
      validUntil: (data['valid_until'] as Timestamp?)?.toDate(),
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
    if (status != CertificateStatus.approved) return false;
    if (validUntil == null) return false;
    return validUntil!.isAfter(DateTime.now());
  }

  /// Vérifie si le certificat expire bientôt (dans les 30 jours)
  bool get isExpiringSoon {
    if (status != CertificateStatus.approved) return false;
    if (validUntil == null) return false;
    final daysUntilExpiry = validUntil!.difference(DateTime.now()).inDays;
    return daysUntilExpiry >= 0 && daysUntilExpiry <= 30;
  }

  /// Vérifie si le certificat est expiré
  bool get isExpired {
    if (status != CertificateStatus.approved) return false;
    if (validUntil == null) return false;
    return validUntil!.isBefore(DateTime.now());
  }

  /// Nombre de jours jusqu'à l'expiration (négatif si expiré)
  int? get daysUntilExpiry {
    if (validUntil == null) return null;
    return validUntil!.difference(DateTime.now()).inDays;
  }

  /// Peut être présenté (valide et non expiré)
  bool get canPresent => isValid && !isExpired;
}
