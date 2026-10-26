import '../models/participant_operation.dart';

enum UnpaidPaymentCardKind {
  standard,
  paymentPlan,
  manualReview,
}

/// Selects the unpaid-status presentation before any payment-plan CTA is built.
///
/// A participant-specific bank review always wins over the event's payment
/// plan: the member must see the review state and must not receive another QR.
UnpaidPaymentCardKind unpaidPaymentCardKind({
  required ParticipantOperation inscription,
  required bool paymentPlanEnabled,
}) {
  if (inscription.isPaymentInManualReview) {
    return UnpaidPaymentCardKind.manualReview;
  }
  if (paymentPlanEnabled) {
    return UnpaidPaymentCardKind.paymentPlan;
  }
  return UnpaidPaymentCardKind.standard;
}
