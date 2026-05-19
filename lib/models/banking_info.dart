import 'package:cloud_firestore/cloud_firestore.dart';

class BankingInfo {
  final String? iban;
  final String? ibanHolderName;
  final DateTime? updatedAt;

  const BankingInfo({
    this.iban,
    this.ibanHolderName,
    this.updatedAt,
  });

  factory BankingInfo.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>? ?? {};
    return BankingInfo(
      iban: data['iban'],
      ibanHolderName: data['iban_holder_name'],
      updatedAt: (data['updated_at'] as Timestamp?)?.toDate(),
    );
  }

  bool get hasData =>
      (iban != null && iban!.trim().isNotEmpty) ||
      (ibanHolderName != null && ibanHolderName!.trim().isNotEmpty);
}
