import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import '../models/payment_response.dart';

/// Service for managing payments via Noda (Open Banking)
///
/// Communicates with Firebase Cloud Functions that securely interact
/// with the Noda payment API. API credentials are stored server-side.
class PaymentService {
  final FirebaseFunctions _functions = FirebaseFunctions.instanceFor(region: 'europe-west1');

  /// Creates a Noda payment request for an event registration
  ///
  /// Parameters:
  /// - [clubId]: Club ID
  /// - [operationId]: Operation (event) ID
  /// - [participantId]: Participant ID in inscriptions collection
  /// - [amount]: Amount to pay in EUR
  /// - [description]: Payment description (event title)
  ///
  /// Returns a [PaymentResponse] with the Noda payment URL
  ///
  /// Throws [PaymentException] on error
  Future<PaymentResponse> createNodaPayment({
    required String clubId,
    required String operationId,
    required String participantId,
    required double amount,
    required String description,
  }) async {
    try {
      debugPrint('💳 Creating Noda payment: amount=$amount, operationId=$operationId');

      final result = await _functions.httpsCallable('createNodaPayment').call({
        'clubId': clubId,
        'operationId': operationId,
        'participantId': participantId,
        'amount': amount,
        'description': description,
      });

      debugPrint('✅ Noda payment created successfully: ${result.data}');

      return PaymentResponse.fromJson(Map<String, dynamic>.from(result.data));
    } on FirebaseFunctionsException catch (e) {
      debugPrint('❌ Firebase Functions error: ${e.code} - ${e.message}');
      throw PaymentException(
        _getFriendlyErrorMessage(e.code),
        code: e.code,
        details: e.details,
      );
    } catch (e) {
      debugPrint('❌ Error creating Noda payment: $e');
      throw PaymentException(
        'Erreur lors de la creation du paiement. Veuillez reessayer.',
        details: e,
      );
    }
  }

  /// Checks Noda payment status
  ///
  /// Parameters:
  /// - [clubId]: Club ID
  /// - [operationId]: Operation ID
  /// - [participantId]: Participant ID
  ///
  /// Returns a [PaymentStatus] with current payment state
  ///
  /// Throws [PaymentException] on error
  Future<PaymentStatus> checkNodaPaymentStatus({
    required String clubId,
    required String operationId,
    required String participantId,
  }) async {
    try {
      debugPrint('🔍 Checking Noda payment status for participant: $participantId');

      final result = await _functions.httpsCallable('checkNodaPaymentStatus').call({
        'clubId': clubId,
        'operationId': operationId,
        'participantId': participantId,
      });

      final status = PaymentStatus.fromJson(Map<String, dynamic>.from(result.data));
      debugPrint('📊 Noda payment status: ${status.status}, paye: ${status.paye}');

      return status;
    } on FirebaseFunctionsException catch (e) {
      debugPrint('❌ Firebase Functions error: ${e.code} - ${e.message}');
      throw PaymentException(
        'Impossible de verifier le statut du paiement',
        code: e.code,
        details: e.details,
      );
    } catch (e) {
      debugPrint('❌ Error checking Noda payment status: $e');
      throw PaymentException(
        'Erreur lors de la verification du paiement',
        details: e,
      );
    }
  }

  /// Converts Firebase error codes to user-friendly messages
  String _getFriendlyErrorMessage(String code) {
    switch (code) {
      case 'unauthenticated':
        return 'Vous devez etre connecte pour effectuer un paiement';
      case 'permission-denied':
        return 'Vous n\'avez pas les permissions necessaires';
      case 'invalid-argument':
        return 'Donnees de paiement invalides';
      case 'not-found':
        return 'Inscription non trouvee';
      case 'already-exists':
        return 'Ce paiement a deja ete effectue';
      case 'deadline-exceeded':
      case 'unavailable':
        return 'Le service de paiement est temporairement indisponible. Veuillez reessayer.';
      case 'internal':
        return 'Erreur lors du traitement du paiement. Veuillez reessayer.';
      default:
        return 'Erreur de paiement. Veuillez reessayer ou contacter le support.';
    }
  }
}
