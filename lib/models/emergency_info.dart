import 'package:cloud_firestore/cloud_firestore.dart';
import 'emergency_contact.dart';

class EmergencyInfo {
  final List<EmergencyContact> contacts;
  final bool shareWithStaff;
  final DateTime? consentDate;
  final DateTime? updatedAt;

  const EmergencyInfo({
    this.contacts = const [],
    this.shareWithStaff = true,
    this.consentDate,
    this.updatedAt,
  });

  factory EmergencyInfo.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>? ?? {};
    return EmergencyInfo(
      contacts: (data['emergency_contacts'] as List<dynamic>? ?? [])
          .whereType<Map>()
          .map((contact) =>
              EmergencyContact.fromMap(Map<String, dynamic>.from(contact)))
          .toList()
        ..sort((a, b) => a.priority.compareTo(b.priority)),
      // Sharing is the default for new/incomplete profiles. An explicitly
      // stored false remains an opt-out and is always respected.
      shareWithStaff: data['gdpr_share_emergency_with_staff'] != false,
      consentDate:
          (data['gdpr_consent_date_emergency'] as Timestamp?)?.toDate(),
      updatedAt: (data['updated_at'] as Timestamp?)?.toDate(),
    );
  }

  bool get hasData => contacts.isNotEmpty;
}
