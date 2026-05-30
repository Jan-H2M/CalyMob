import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

import '../../models/cotisation/cotisation_models.dart';

class CotisationService {
  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  CotisationService({
    FirebaseFirestore? firestore,
    FirebaseFunctions? functions,
  })  : _firestore = firestore ?? FirebaseFirestore.instance,
        _functions =
            functions ?? FirebaseFunctions.instanceFor(region: 'europe-west1');

  Stream<MembershipSeason?> watchActiveSeason(String clubId) {
    return _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('membership_seasons')
        .where('is_active', isEqualTo: true)
        .limit(1)
        .snapshots()
        .map((snapshot) {
      if (snapshot.docs.isEmpty) return null;
      return MembershipSeason.fromFirestore(snapshot.docs.first);
    });
  }

  Stream<List<CotisationPayment>> watchMyPayments({
    required String clubId,
    required String memberId,
  }) {
    return _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('cotisation_payments')
        .where('memberId', isEqualTo: memberId)
        .snapshots()
        .map((snapshot) {
      final payments =
          snapshot.docs.map(CotisationPayment.fromFirestore).toList();
      payments.sort((a, b) => b.id.compareTo(a.id));
      return payments;
    });
  }

  Future<CotisationPayment> createPayment(String clubId,
      {required String period}) async {
    final result =
        await _functions.httpsCallable('createCotisationPayment').call({
      'clubId': clubId,
      'period': period,
    });
    final data = Map<String, dynamic>.from(result.data as Map);
    return CotisationPayment(
      id: data['paymentId']?.toString() ?? '',
      status: data['status']?.toString() ?? 'awaiting_payment',
      communication: data['paymentCommunication']?.toString() ?? '',
      amount: (data['amount'] as num?)?.toDouble() ?? 0,
      seasonLabel: '',
      seasonId: '',
      tariffLabel: '',
      period: 'jan_dec',
      epcPayload: data['epcPayload']?.toString(),
      iban: data['iban']?.toString(),
      beneficiary: data['beneficiary']?.toString(),
      validityUntil: data['validityUntil'] != null
          ? DateTime.tryParse(data['validityUntil'].toString())
          : null,
    );
  }
}
