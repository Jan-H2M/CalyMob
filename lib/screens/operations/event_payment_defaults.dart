class EventPaymentDefaults {
  const EventPaymentDefaults._();

  static const paymentRequired = true;
  static const allowedPaymentMethods = {'qr_email'};
  static const registrationConfirmationPolicy = 'after_payment';
  static const paymentDeadlineDays = 3;
  static const autoCancelUnpaid = true;
}
