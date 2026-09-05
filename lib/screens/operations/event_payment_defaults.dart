class EventPaymentDefaults {
  const EventPaymentDefaults._();

  static const paymentRequired = true;
  static const allowedPaymentMethods = {'qr_email'};
  static const registrationConfirmationPolicy = 'after_payment';
  static const paymentDeadlineDays = 3;
  // Never auto-cancel an unpaid registration. Payment follow-up and an
  // explicit, audited unregistration are separate actions.
  static const autoCancelUnpaid = false;
}
