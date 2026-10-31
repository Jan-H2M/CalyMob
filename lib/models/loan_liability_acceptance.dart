import 'package:cloud_firestore/cloud_firestore.dart';

/// DEV candidate wording, versioned for review before production activation.
/// It never authorizes a debit or computes a debt.
const loanLiabilityTermsVersion = 'av-loan-001-v1';
const loanLiabilityTermsText =
    'Je reconnais assumer l’entière responsabilité financière du matériel emprunté en cas de perte, de vol ou de dommage, jusqu’au coût de remplacement d’un matériel équivalent. Les constatations et ma version des faits seront examinées par le conseil d’administration avant toute décision. Cette acceptation n’autorise aucun prélèvement automatique.';

Map<String, dynamic> newLoanLiabilityAcceptance(
    {required bool accepted, required String memberId}) {
  if (!accepted || memberId.trim().isEmpty) {
    throw StateError(
        'Le membre emprunteur doit accepter la responsabilité financière.');
  }
  return {
    'accepted': true,
    'accepted_by_uid': memberId,
    'accepted_at': FieldValue.serverTimestamp(),
    'terms_version': loanLiabilityTermsVersion,
    'terms_text': loanLiabilityTermsText
  };
}

class LoanLiabilityAcceptance {
  final String acceptedByUid;
  final DateTime acceptedAt;
  final String termsVersion;
  final String termsText;
  const LoanLiabilityAcceptance(
      {required this.acceptedByUid,
      required this.acceptedAt,
      required this.termsVersion,
      required this.termsText});
  static LoanLiabilityAcceptance? fromMap(Object? value,
      {required String memberId}) {
    if (value is! Map ||
        value['accepted'] != true ||
        value['accepted_by_uid'] is! String ||
        value['accepted_by_uid'] != memberId ||
        (value['accepted_by_uid'] as String).isEmpty ||
        value['accepted_at'] is! Timestamp ||
        value['terms_version'] != loanLiabilityTermsVersion ||
        value['terms_text'] != loanLiabilityTermsText) return null;
    return LoanLiabilityAcceptance(
        acceptedByUid: value['accepted_by_uid'],
        acceptedAt: (value['accepted_at'] as Timestamp).toDate(),
        termsVersion: value['terms_version'],
        termsText: value['terms_text']);
  }
}
