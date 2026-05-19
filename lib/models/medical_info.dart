import 'package:cloud_firestore/cloud_firestore.dart';

class MedicalInfo {
  final String? medication;
  final String? allergies;
  final String? bloodGroup;
  final String? notes;
  final bool shareWithStaff;
  final DateTime? consentDate;
  final DateTime? updatedAt;

  const MedicalInfo({
    this.medication,
    this.allergies,
    this.bloodGroup,
    this.notes,
    this.shareWithStaff = false,
    this.consentDate,
    this.updatedAt,
  });

  factory MedicalInfo.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>? ?? {};
    return MedicalInfo(
      medication: data['medical_medication'],
      allergies: data['medical_allergies'],
      bloodGroup: data['medical_blood_group'],
      notes: data['medical_notes'],
      shareWithStaff: data['gdpr_share_medical_with_staff'] == true,
      consentDate: (data['gdpr_consent_date_medical'] as Timestamp?)?.toDate(),
      updatedAt: (data['updated_at'] as Timestamp?)?.toDate(),
    );
  }

  bool get hasData =>
      _hasText(medication) ||
      _hasText(allergies) ||
      _hasText(bloodGroup) ||
      _hasText(notes);

  bool _hasText(String? value) => value != null && value.trim().isNotEmpty;
}
