import 'package:calymob/screens/operations/event_payment_defaults.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('new activities use the club payment workflow by default', () {
    expect(EventPaymentDefaults.paymentRequired, isTrue);
    expect(EventPaymentDefaults.allowedPaymentMethods, {'qr_email'});
    expect(
      EventPaymentDefaults.registrationConfirmationPolicy,
      'after_payment',
    );
    expect(EventPaymentDefaults.paymentDeadlineDays, 3);
    expect(EventPaymentDefaults.autoCancelUnpaid, isTrue);
  });
}
