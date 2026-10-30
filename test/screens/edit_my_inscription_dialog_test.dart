import 'package:calymob/models/supplement.dart';
import 'package:calymob/screens/operations/edit_my_inscription_dialog.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('post-save feedback uses the authoritative server delta after drift',
      () {
    final result = registrationEditDialogResult(
      // The stale dialog preview could have predicted +5 to pay. The server
      // sees repriced data and authoritatively reports a 7 euro decrease.
      authoritativeServerDelta: 7,
      wasPaid: true,
      forceRefundClaim: false,
      supplements: const <SelectedSupplement>[],
      supplementTotal: 0,
    );

    expect(result['delta'], -7);
    expect(result['refundCreated'], isTrue);
    expect(result['requiresPaymentVerification'], isFalse);
  });

  test('server-side increase opens payment with the authoritative amount', () {
    final result = registrationEditDialogResult(
      authoritativeServerDelta: -12.5,
      wasPaid: false,
      forceRefundClaim: true,
      supplements: const <SelectedSupplement>[],
      supplementTotal: 0,
    );

    expect(result['delta'], 12.5);
    expect(result['refundCreated'], isFalse);
    expect(result['requiresPaymentVerification'], isFalse);
  });
}
