import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/contracts/expense_claim_contract.dart';

void main() {
  group('expense-claim status contract (Dart, mirror of expenseClaimContract.json)', () {
    test('includes a_verifier_paiement -> payment_verification_pending', () {
      expect(legacyToCanonicalStatus('a_verifier_paiement'),
          'payment_verification_pending');
      expect(canonicalToLegacyStatus('payment_verification_pending'),
          'a_verifier_paiement');
    });

    test('round-trips every status bijectively', () {
      legacyToCanonicalStatusMap.forEach((legacy, canonical) {
        expect(legacyToCanonicalStatus(legacy), canonical);
        expect(canonicalToLegacyStatus(canonical), legacy);
      });
      // no two legacy statuses collapse onto the same canonical value
      expect(canonicalToLegacyStatusMap.length,
          legacyToCanonicalStatusMap.length);
    });

    test('passes an unknown status through unchanged', () {
      expect(legacyToCanonicalStatus('weird_status'), 'weird_status');
    });
  });
}
