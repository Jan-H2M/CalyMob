import 'package:cloud_firestore/cloud_firestore.dart';

/// Record of a member check-in for attendance tracking
class AttendanceRecord {
  final String id;
  final String membreId;
  final String membreNom;
  final String membrePrenom;
  final String? photoUrl;

  final DateTime checkedInAt;
  final String checkedInBy;
  final String checkedInByName;

  final String cotisationStatus; // 'valid', 'warning', 'expired', 'missing'
  final DateTime? cotisationValidite;
  final String certificatStatus; // 'valid', 'warning', 'expired', 'missing'
  final DateTime? certificatValidite;

  final String scanMethod; // 'qr', 'barcode', 'manual'

  AttendanceRecord({
    required this.id,
    required this.membreId,
    required this.membreNom,
    required this.membrePrenom,
    this.photoUrl,
    required this.checkedInAt,
    required this.checkedInBy,
    required this.checkedInByName,
    required this.cotisationStatus,
    this.cotisationValidite,
    required this.certificatStatus,
    this.certificatValidite,
    required this.scanMethod,
  });

  /// Create from Firestore document
  factory AttendanceRecord.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    return AttendanceRecord(
      id: doc.id,
      membreId: data['membre_id'] ?? '',
      membreNom: data['membre_nom'] ?? '',
      membrePrenom: data['membre_prenom'] ?? '',
      photoUrl: data['photo_url'],
      checkedInAt: (data['checked_in_at'] as Timestamp).toDate(),
      checkedInBy: data['checked_in_by'] ?? '',
      checkedInByName: data['checked_in_by_name'] ?? '',
      cotisationStatus: data['cotisation_status'] ?? 'missing',
      cotisationValidite:
          (data['cotisation_validite'] as Timestamp?)?.toDate(),
      certificatStatus: data['certificat_status'] ?? 'missing',
      certificatValidite:
          (data['certificat_validite'] as Timestamp?)?.toDate(),
      scanMethod: data['scan_method'] ?? 'manual',
    );
  }

  /// Convert to Firestore map
  Map<String, dynamic> toFirestore() {
    return {
      'membre_id': membreId,
      'membre_nom': membreNom,
      'membre_prenom': membrePrenom,
      'photo_url': photoUrl,
      'checked_in_at': Timestamp.fromDate(checkedInAt),
      'checked_in_by': checkedInBy,
      'checked_in_by_name': checkedInByName,
      'cotisation_status': cotisationStatus,
      'cotisation_validite': cotisationValidite != null
          ? Timestamp.fromDate(cotisationValidite!)
          : null,
      'certificat_status': certificatStatus,
      'certificat_validite': certificatValidite != null
          ? Timestamp.fromDate(certificatValidite!)
          : null,
      'scan_method': scanMethod,
    };
  }

  /// Full name of the checked-in member
  String get fullName => '$membrePrenom $membreNom'.trim();

  /// Date only (without time) for duplicate checking
  String get dateKey {
    return '${checkedInAt.year}-${checkedInAt.month.toString().padLeft(2, '0')}-${checkedInAt.day.toString().padLeft(2, '0')}';
  }
}
