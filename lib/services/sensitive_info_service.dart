import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/banking_info.dart';
import '../models/emergency_contact.dart';
import '../models/emergency_info.dart';
import '../models/medical_info.dart';

class SensitiveInfoService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  DocumentReference<Map<String, dynamic>> _doc(
    String clubId,
    String userId,
    String name,
  ) {
    return _firestore
        .collection('clubs/$clubId/members/$userId/sensitive_info')
        .doc(name);
  }

  Stream<BankingInfo?> watchBanking(String clubId, String userId) {
    return _doc(clubId, userId, 'banking').snapshots().map((doc) {
      if (!doc.exists) return null;
      return BankingInfo.fromFirestore(doc);
    });
  }

  Stream<EmergencyInfo?> watchEmergency(String clubId, String userId) {
    return _doc(clubId, userId, 'emergency').snapshots().map((doc) {
      if (!doc.exists) return null;
      return EmergencyInfo.fromFirestore(doc);
    });
  }

  Stream<MedicalInfo?> watchMedical(String clubId, String userId) {
    return _doc(clubId, userId, 'medical').snapshots().map((doc) {
      if (!doc.exists) return null;
      return MedicalInfo.fromFirestore(doc);
    });
  }

  Future<void> saveBanking(
    String clubId,
    String userId, {
    required String? iban,
    required String? holderName,
  }) {
    return _doc(clubId, userId, 'banking').set({
      'iban': _emptyToNull(iban),
      'iban_holder_name': _emptyToNull(holderName),
      'updated_at': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }

  Future<void> deleteBanking(String clubId, String userId) {
    return _doc(clubId, userId, 'banking').delete();
  }

  Future<void> saveEmergency(
    String clubId,
    String userId, {
    required List<EmergencyContact> contacts,
    required bool shareWithStaff,
    DateTime? previousConsentDate,
  }) {
    return _doc(clubId, userId, 'emergency').set({
      'emergency_contacts': contacts.map((contact) => contact.toMap()).toList(),
      'gdpr_share_emergency_with_staff': shareWithStaff,
      'gdpr_consent_date_emergency': shareWithStaff
          ? (previousConsentDate != null
              ? Timestamp.fromDate(previousConsentDate)
              : FieldValue.serverTimestamp())
          : null,
      'updated_at': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }

  Future<void> deleteEmergency(String clubId, String userId) {
    return _doc(clubId, userId, 'emergency').delete();
  }

  Future<void> saveMedical(
    String clubId,
    String userId, {
    required String? medication,
    required String? allergies,
    required String? bloodGroup,
    required String? notes,
    required bool shareWithStaff,
    DateTime? previousConsentDate,
  }) {
    return _doc(clubId, userId, 'medical').set({
      'medical_medication': _emptyToNull(medication),
      'medical_allergies': _emptyToNull(allergies),
      'medical_blood_group': _emptyToNull(bloodGroup),
      'medical_notes': _emptyToNull(notes),
      'gdpr_share_medical_with_staff': shareWithStaff,
      'gdpr_consent_date_medical': shareWithStaff
          ? (previousConsentDate != null
              ? Timestamp.fromDate(previousConsentDate)
              : FieldValue.serverTimestamp())
          : null,
      'updated_at': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }

  Future<void> deleteMedical(String clubId, String userId) {
    return _doc(clubId, userId, 'medical').delete();
  }

  String? _emptyToNull(String? value) {
    final trimmed = value?.trim();
    return trimmed == null || trimmed.isEmpty ? null : trimmed;
  }
}
