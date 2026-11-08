import 'package:flutter/foundation.dart';

/// A matching total is insufficient when a different guest could receive it.
bool paymentAllocationsMatch(Map<String, int> expected, Map<String, int> issued) =>
    mapEquals(expected, issued);

/// Sequential server confirmations are individually idempotent, not an atomic
/// group transaction. Always reload authoritative state, including on failure.
Future<void> confirmPaymentsAndRefresh({
  required Future<void> Function() confirm,
  required Future<void> Function() refresh,
}) async {
  Object? confirmationError;
  bool refreshed = true;
  try {
    await confirm();
  } catch (error) {
    confirmationError = error;
  }
  try {
    await refresh();
  } catch (error) {
    refreshed = false;
    if (confirmationError == null) {
      throw StateError(
        'Confirmations enregistrées, mais la liste n’a pas pu être actualisée. '
        'Rouvrez la fiche pour vérifier les paiements.',
      );
    }
    debugPrint('Payment confirmation refresh failed: $error');
  }
  if (confirmationError != null) {
    throw StateError(
      'Confirmation incomplète : certaines confirmations peuvent déjà être '
      'enregistrées. '
      '${refreshed ? 'Vérifiez la liste actualisée' : 'Rouvrez la fiche pour actualiser la liste'} '
      'puis réessayez ; les '
      'confirmations déjà enregistrées ne seront pas doublées. '
      'Erreur : $confirmationError',
    );
  }
}
