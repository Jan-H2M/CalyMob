import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import '../models/payment_response.dart';

/// Available payment methods for Mollie
enum MolliePaymentMethod {
  bancontact,
  kbc,
  belfius,
  creditcard,
  applepay,
}

extension MolliePaymentMethodExtension on MolliePaymentMethod {
  String get value {
    switch (this) {
      case MolliePaymentMethod.bancontact:
        return 'bancontact';
      case MolliePaymentMethod.kbc:
        return 'kbc';
      case MolliePaymentMethod.belfius:
        return 'belfius';
      case MolliePaymentMethod.creditcard:
        return 'creditcard';
      case MolliePaymentMethod.applepay:
        return 'applepay';
    }
  }

  String get label {
    switch (this) {
      case MolliePaymentMethod.bancontact:
        return 'Bancontact';
      case MolliePaymentMethod.kbc:
        return 'KBC/CBC';
      case MolliePaymentMethod.belfius:
        return 'Belfius';
      case MolliePaymentMethod.creditcard:
        return 'Carte bancaire';
      case MolliePaymentMethod.applepay:
        return 'Apple Pay';
    }
  }
}

/// Service for managing payments via Mollie and Ponto Connect
///
/// Communicates with Firebase Cloud Functions that securely interact
/// with payment APIs. API credentials are stored server-side.
///
/// Mollie is the primary payment provider for Belgian payments:
/// - Bancontact, KBC/CBC, Belfius, Credit cards, Apple Pay
class PaymentService {
  final FirebaseFunctions _functions = FirebaseFunctions.instanceFor(region: 'europe-west1');

  // ============================================================================
  // MOLLIE PAYMENTS (Primary)
  // ============================================================================

  /// Creates a Mollie payment for an event registration
  ///
  /// Parameters:
  /// - [clubId]: Club ID
  /// - [operationId]: Operation (event) ID
  /// - [participantId]: Participant ID in inscriptions collection
  /// - [amount]: Amount to pay in EUR
  /// - [description]: Payment description (event title)
  /// - [method]: Optional specific payment method
  /// - [locale]: Locale for payment page (default: nl_BE)
  ///
  /// Returns a [PaymentResponse] with the Mollie checkout URL
  ///
  /// Throws [PaymentException] on error
  Future<PaymentResponse> createMolliePayment({
    required String clubId,
    required String operationId,
    required String participantId,
    required double amount,
    required String description,
    MolliePaymentMethod? method,
    String locale = 'nl_BE',
  }) async {
    try {
      debugPrint('💳 Creating Mollie payment: amount=$amount, operationId=$operationId, method=${method?.value ?? 'customer_choice'}');

      final callData = {
        'clubId': clubId,
        'operationId': operationId,
        'participantId': participantId,
        'amount': amount,
        'description': description,
        'locale': locale,
      };

      if (method != null) {
        callData['method'] = method.value;
      }

      final result = await _functions.httpsCallable('createMolliePayment').call(callData);

      debugPrint('✅ Mollie payment created: ${result.data}');

      return PaymentResponse.fromJson(Map<String, dynamic>.from(result.data));
    } on FirebaseFunctionsException catch (e) {
      debugPrint('❌ Firebase Functions error: ${e.code} - ${e.message}');
      // Use server message if available, otherwise fallback to generic message
      final message = e.message ?? _getFriendlyErrorMessage(e.code);
      throw PaymentException(
        message,
        code: e.code,
        details: e.details,
      );
    } catch (e) {
      debugPrint('❌ Error creating Mollie payment: $e');
      throw PaymentException(
        'Erreur lors de la creation du paiement. Veuillez reessayer.',
        details: e,
      );
    }
  }

  /// Checks Mollie payment status
  ///
  /// Parameters:
  /// - [clubId]: Club ID
  /// - [operationId]: Operation (event) ID
  /// - [participantId]: Participant ID
  ///
  /// Returns a [PaymentStatus] with current payment state
  ///
  /// Throws [PaymentException] on error
  Future<PaymentStatus> checkMolliePaymentStatus({
    required String clubId,
    required String operationId,
    required String participantId,
  }) async {
    try {
      debugPrint('🔍 Checking Mollie payment status for participant: $participantId');

      final result = await _functions.httpsCallable('checkMolliePaymentStatus').call({
        'clubId': clubId,
        'operationId': operationId,
        'participantId': participantId,
      });

      final status = PaymentStatus.fromJson(Map<String, dynamic>.from(result.data));
      debugPrint('📊 Mollie payment status: ${status.status}, paye: ${status.paye}');

      return status;
    } on FirebaseFunctionsException catch (e) {
      debugPrint('❌ Firebase Functions error: ${e.code} - ${e.message}');
      throw PaymentException(
        'Impossible de verifier le statut du paiement',
        code: e.code,
        details: e.details,
      );
    } catch (e) {
      debugPrint('❌ Error checking Mollie payment status: $e');
      throw PaymentException(
        'Erreur lors de la verification du paiement',
        details: e,
      );
    }
  }

  // ============================================================================
  // PONTO PAYMENTS (Legacy)
  // ============================================================================

  /// Creates a Ponto payment request for an event registration (Legacy)
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
        'Erreur lors de la creation du paiement. Veuillez reessayer.',
        details: e,
      );
    }
  }

  /// Checks Ponto payment status (Legacy)
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
        'Impossible de verifier le statut du paiement',
        code: e.code,
        details: e.details,
      );
    } catch (e) {
      debugPrint('❌ Error checking payment status: $e');
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
