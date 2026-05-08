import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import 'crashlytics_service.dart';

/// Exception thrown by [RefundService] when a refund operation fails.
class RefundException implements Exception {
  final String message;
  final String? code;
  final dynamic details;

  RefundException(this.message, {this.code, this.details});

  @override
  String toString() {
    if (code != null) {
      return 'RefundException [$code]: $message';
    }
    return 'RefundException: $message';
  }
}

/// Service for creating inscription refunds (remboursement) via Cloud Function.
///
/// Communicates with the `createInscriptionRefund` Firebase Cloud Function
/// which validates ownership, amount decrease, and deadline server-side
/// before creating a `demande_remboursement` document.
class RefundService {
  final FirebaseFunctions _functions =
      FirebaseFunctions.instanceFor(region: 'europe-west1');

  /// Calls the [createInscriptionRefund] Cloud Function to request a refund
  /// for an inscription whose price decreased.
  ///
  /// Parameters:
  /// - [clubId]: Club ID
  /// - [operationId]: Operation (event) ID
  /// - [inscriptionId]: Inscription ID to refund
  /// - [oldAmount]: Previous (higher) amount paid
  /// - [newAmount]: New (lower) amount after edit
  /// - [editSessionId]: Idempotency key to prevent duplicate refund requests
  /// - [description]: Human-readable description shown in the refund queue
  ///   (also stored on the demande document). REQUIRED by the Cloud
  ///   Function — without it the call is rejected with `invalid-argument`.
  /// - [eventTitre]: Title of the event used for the demande titre
  ///   (`Modification inscription — <eventTitre>`). REQUIRED by the CF.
  ///
  /// Returns the `demandeId` of the newly created refund request.
  ///
  /// Throws [RefundException] on error.
  Future<String> createInscriptionRefund({
    required String clubId,
    required String operationId,
    required String inscriptionId,
    required double oldAmount,
    required double newAmount,
    required String editSessionId,
    required String description,
    required String eventTitre,
  }) async {
    try {
      debugPrint('🔄 Requesting refund: inscription=$inscriptionId, '
          'old=$oldAmount, new=$newAmount');

      final result = await _functions
          .httpsCallable('createInscriptionRefund')
          .call({
            'clubId': clubId,
            'operationId': operationId,
            'inscriptionId': inscriptionId,
            'oldAmount': oldAmount,
            'newAmount': newAmount,
            'editSessionId': editSessionId,
            'description': description,
            'eventTitre': eventTitre,
          });

      final demandeId = result.data['demandeId'] as String;
      debugPrint('✅ Refund request created: demandeId=$demandeId');
      return demandeId;
    } on FirebaseFunctionsException catch (e, stack) {
      CrashlyticsService.paymentError(
          e, stack, 'createInscriptionRefund CF error ${e.code}');
      debugPrint('❌ Firebase Functions error: ${e.code} - ${e.message}');
      throw RefundException(
        _getFriendlyErrorMessage(e.code),
        code: e.code,
        details: e.details,
      );
    } catch (e, stack) {
      CrashlyticsService.paymentError(
          e, stack, 'createInscriptionRefund unexpected');
      debugPrint('❌ Unexpected error creating refund: $e');
      throw RefundException(
        'Erreur lors de la demande de remboursement. Veuillez réessayer.',
        details: e,
      );
    }
  }

  /// Converts Firebase error codes to user-friendly French messages.
  String _getFriendlyErrorMessage(String code) {
    switch (code) {
      case 'unauthenticated':
        return 'Vous devez être connecté pour demander un remboursement';
      case 'permission-denied':
        return "Vous n'avez pas les permissions nécessaires pour cette demande";
      case 'invalid-argument':
        return 'Données de remboursement invalides';
      case 'not-found':
        return 'Inscription introuvable';
      case 'failed-precondition':
        return 'Aucun remboursement nécessaire ou délai dépassé';
      case 'already-exists':
        return 'Une demande de remboursement existe déjà pour cette modification';
      case 'deadline-exceeded':
      case 'unavailable':
        return 'Le service est temporairement indisponible. Veuillez réessayer.';
      case 'internal':
        return 'Erreur lors du traitement. Veuillez réessayer.';
      default:
        return 'Erreur de remboursement. Veuillez réessayer ou contacter le support.';
    }
  }
}
