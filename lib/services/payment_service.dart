import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import '../models/payment_response.dart';

/// Service for managing payments via Ponto Connect (Ibanity)
///
/// Communicates with Firebase Cloud Functions that securely interact
/// with the Ponto Connect API. API credentials are stored server-side.
class PaymentService {
  final FirebaseFunctions _functions = FirebaseFunctions.instance;

  /// Creates a payment request for an event registration
  ///
  /// Parameters:
  /// - [clubId]: Club ID
  /// - [operationId]: Operation (event) ID
  /// - [participantId]: Participant ID in inscriptions collection
  /// - [amount]: Amount to pay in EUR
  /// - [description]: Payment description (event title)
  ///
  /// Returns a [PaymentResponse] with the Ponto payment URL
  ///
  /// Throws [PaymentException] on error
  Future<PaymentResponse> createPayment({
    required String clubId,
    required String operationId,
    required String participantId,
    required double amount,
    required String description,
  }) async {
    try {
      debugPrint('💳 Creating Ponto payment: amount=$amount, operationId=$operationId');

      final result = await _functions.httpsCallable('pontoCreatePayment').call({
        'clubId': clubId,
        'operationId': operationId,
        'participantId': participantId,
        'amount': amount,
        'description': description,
      });

      debugPrint('✅ Payment created successfully: ${result.data}');

      return PaymentResponse.fromJson(Map<String, dynamic>.from(result.data));
    } on FirebaseFunctionsException catch (e) {
      debugPrint('❌ Firebase Functions error: ${e.code} - ${e.message}');
      throw PaymentException(
        _getFriendlyErrorMessage(e.code),
        code: e.code,
        details: e.details,
      );
    } catch (e) {
      debugPrint('❌ Error creating payment: $e');
      throw PaymentException(
        'Erreur lors de la création du paiement. Veuillez réessayer.',
        details: e,
      );
    }
  }

  /// Checks payment status
  ///
  /// Parameters:
  /// - [clubId]: Club ID
  /// - [operationId]: Operation ID
  /// - [participantId]: Participant ID
  /// - [paymentId]: Ponto payment request ID
  ///
  /// Returns a [PaymentStatus] with current payment state
  ///
  /// Throws [PaymentException] on error
  Future<PaymentStatus> checkPaymentStatus({
    required String clubId,
    required String operationId,
    required String participantId,
    required String paymentId,
  }) async {
    try {
      debugPrint('🔍 Checking Ponto payment status: $paymentId');

      final result =
          await _functions.httpsCallable('pontoCheckStatus').call({
        'clubId': clubId,
        'operationId': operationId,
        'participantId': participantId,
        'paymentId': paymentId,
      });

      final status = PaymentStatus.fromJson(Map<String, dynamic>.from(result.data));
      debugPrint('📊 Payment status: ${status.status}, paye: ${status.paye}');

      return status;
    } on FirebaseFunctionsException catch (e) {
      debugPrint('❌ Firebase Functions error: ${e.code} - ${e.message}');
      throw PaymentException(
        'Impossible de vérifier le statut du paiement',
        code: e.code,
        details: e.details,
      );
    } catch (e) {
      debugPrint('❌ Error checking payment status: $e');
      throw PaymentException(
        'Erreur lors de la vérification du paiement',
        details: e,
      );
    }
  }

  /// Converts Firebase error codes to user-friendly messages
  String _getFriendlyErrorMessage(String code) {
    switch (code) {
      case 'unauthenticated':
        return 'Vous devez être connecté pour effectuer un paiement';
      case 'permission-denied':
        return 'Vous n\'avez pas les permissions nécessaires';
      case 'invalid-argument':
        return 'Données de paiement invalides';
      case 'not-found':
        return 'Inscription non trouvée';
      case 'already-exists':
        return 'Ce paiement a déjà été effectué';
      case 'deadline-exceeded':
      case 'unavailable':
        return 'Le service de paiement est temporairement indisponible. Veuillez réessayer.';
      case 'internal':
        return 'Erreur lors du traitement du paiement. Veuillez réessayer.';
      default:
        return 'Erreur de paiement. Veuillez réessayer ou contacter le support.';
    }
  }
}
