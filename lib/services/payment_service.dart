import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import '../models/payment_response.dart';

/// Service for managing payments
///
/// Provides EPC QR code payment emails and legacy Noda Open Banking integration.
/// Communicates with Firebase Cloud Functions.
class PaymentService {
  final FirebaseFunctions _functions = FirebaseFunctions.instanceFor(region: 'europe-west1');

  // ===========================================================================
  // EPC QR CODE PAYMENT EMAIL
  // ===========================================================================

  /// Sends an email with EPC QR code for event payment
  ///
  /// Parameters:
  /// - [clubId]: Club ID
  /// - [operationId]: Operation (event) ID
  /// - [participantId]: Participant ID in inscriptions collection
  /// - [memberEmail]: Email address to send to
  /// - [memberFirstName]: Member's first name
  /// - [memberLastName]: Member's last name
  /// - [amount]: Amount to pay in EUR
  /// - [operationTitle]: Event title for the email
  /// - [operationNumber]: Event number (optional)
  /// - [operationDate]: Event date (optional)
  ///
  /// Returns true if email was sent successfully
  ///
  /// Throws [PaymentException] on error
  Future<bool> sendPaymentQrEmail({
    required String clubId,
    required String operationId,
    required String participantId,
    required String memberEmail,
    required String memberFirstName,
    required String memberLastName,
    required double amount,
    required String operationTitle,
    String? operationNumber,
    DateTime? operationDate,
  }) async {
    try {
      debugPrint('📧 Sending EPC QR payment email to: $memberEmail');

      final result = await _functions.httpsCallable('sendPaymentQrEmail').call({
        'clubId': clubId,
        'operationId': operationId,
        'participantId': participantId,
        'memberEmail': memberEmail,
        'memberFirstName': memberFirstName,
        'memberLastName': memberLastName,
        'amount': amount,
        'operationTitle': operationTitle,
        if (operationNumber != null) 'operationNumber': operationNumber,
        if (operationDate != null) 'operationDate': operationDate.toIso8601String(),
      });

      final success = result.data['success'] == true;
      if (success) {
        debugPrint('✅ EPC QR payment email sent successfully');
      } else {
        debugPrint('⚠️ EPC QR payment email failed: ${result.data['error']}');
      }

      return success;
    } on FirebaseFunctionsException catch (e) {
      debugPrint('❌ Firebase Functions error: ${e.code} - ${e.message}');
      throw PaymentException(
        _getFriendlyErrorMessage(e.code),
        code: e.code,
        details: e.details,
      );
    } catch (e) {
      debugPrint('❌ Error sending EPC QR payment email: $e');
      throw PaymentException(
        'Erreur lors de l\'envoi de l\'email de paiement. Veuillez réessayer.',
        details: e,
      );
    }
  }

  // ===========================================================================
  // NODA PAYMENT (DEPRECATED - kept for backward compatibility)
  // ===========================================================================

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
