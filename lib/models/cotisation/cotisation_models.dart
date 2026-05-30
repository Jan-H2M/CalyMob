import 'package:cloud_firestore/cloud_firestore.dart';

class MembershipTariff {
  final String id;
  final String code;
  final String label;
  final double? priceJanDec;
  final double? priceSeptDec;

  const MembershipTariff({
    required this.id,
    required this.code,
    required this.label,
    this.priceJanDec,
    this.priceSeptDec,
  });

  factory MembershipTariff.fromMap(Map<String, dynamic> data) {
    return MembershipTariff(
      id: data['id']?.toString() ?? data['code']?.toString() ?? '',
      code: data['code']?.toString() ?? '',
      label: data['label']?.toString() ?? '',
      priceJanDec: _toDouble(data['price_jan_dec']),
      priceSeptDec: _toDouble(data['price_sept_dec']),
    );
  }

  double? priceForPeriod(String period) {
    return period == 'sept_dec' ? priceSeptDec : priceJanDec;
  }
}

class MembershipSeason {
  final String id;
  final String label;
  final int startYear;
  final String paymentStatus;
  final String paymentMessage;
  final List<MembershipTariff> tariffs;

  const MembershipSeason({
    required this.id,
    required this.label,
    required this.startYear,
    required this.paymentStatus,
    required this.paymentMessage,
    required this.tariffs,
  });

  factory MembershipSeason.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    final rawTariffs = data['tariffs'] as List<dynamic>? ?? const [];
    return MembershipSeason(
      id: doc.id,
      label: data['label']?.toString() ?? data['start_year']?.toString() ?? '',
      startYear: (data['start_year'] as num?)?.toInt() ?? DateTime.now().year,
      paymentStatus: data['payment_status']?.toString() ?? 'closed',
      paymentMessage: data['payment_message']?.toString() ?? '',
      tariffs: rawTariffs
          .whereType<Map>()
          .map((item) => MembershipTariff.fromMap(
                item.map((key, value) => MapEntry(key.toString(), value)),
              ))
          .toList(),
    );
  }
}

class CotisationPayment {
  final String id;
  final String status;
  final String communication;
  final double amount;
  final String seasonLabel;
  final String seasonId;
  final String tariffLabel;
  final String period;
  final String? epcPayload;
  final String? iban;
  final String? beneficiary;
  final DateTime? validityUntil;
  final DateTime? emailSentAt;

  const CotisationPayment({
    required this.id,
    required this.status,
    required this.communication,
    required this.amount,
    required this.seasonLabel,
    required this.seasonId,
    required this.tariffLabel,
    required this.period,
    this.epcPayload,
    this.iban,
    this.beneficiary,
    this.validityUntil,
    this.emailSentAt,
  });

  factory CotisationPayment.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return CotisationPayment(
      id: doc.id,
      status: data['status']?.toString() ?? 'awaiting_payment',
      communication: data['payment_communication']?.toString() ??
          data['paymentCommunication']?.toString() ??
          '',
      amount: _toDouble(data['amount']) ?? 0,
      seasonLabel: data['season_label']?.toString() ?? '',
      seasonId:
          data['seasonId']?.toString() ?? data['season_id']?.toString() ?? '',
      tariffLabel: data['tariff_label_snapshot']?.toString() ??
          data['tariff_label']?.toString() ??
          '',
      period: data['period']?.toString() ?? 'jan_dec',
      epcPayload: data['epcPayload']?.toString(),
      iban: data['iban']?.toString(),
      beneficiary: data['beneficiary']?.toString(),
      validityUntil: (data['validity_until'] as Timestamp?)?.toDate(),
      emailSentAt: (data['email_sent_at'] as Timestamp?)?.toDate(),
    );
  }
}

double? _toDouble(dynamic value) {
  if (value is num) return value.toDouble();
  if (value is String) return double.tryParse(value.replaceAll(',', '.'));
  return null;
}
