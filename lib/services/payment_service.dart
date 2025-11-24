import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import '../models/payment_response.dart';

/// Service pour gérer les paiements via Noda (Open Banking)
///
/// Ce service communique avec Firebase Cloud Functions qui
/// interagissent de manière sécurisée avec l'API Noda.
/// Les clés API sont stockées côté serveur pour la sécurité.
class PaymentService {
  final FirebaseFunctions _functions = FirebaseFunctions.instance;

  /// Crée un paiement pour une inscription à une opération
  ///
  /// Paramètres:
  /// - [clubId]: ID du club
  /// - [operationId]: ID de l'opération (événement)
  /// - [participantId]: ID du participant dans la collection operation_participants
  /// - [amount]: Montant à payer en euros
  /// - [description]: Description du paiement (titre de l'opération)
  ///
  /// Retourne un [PaymentResponse] avec l'URL de paiement Noda
  ///
  /// Lance [PaymentException] en cas d'erreur
  Future<PaymentResponse> createPayment({
    required String clubId,
    required String operationId,
    required String participantId,
    required double amount,
    required String description,
  }) async {
    try {
      debugPrint('Creating payment: amount=$amount, operationId=$operationId');

      final result = await _functions.httpsCallable('createNodaPayment').call({
        'clubId': clubId,
        'operationId': operationId,
        'participantId': participantId,
        'amount': amount,
        'currency': 'EUR',
        'description': description,
      });

      debugPrint('Payment created successfully: ${result.data}');

      return PaymentResponse.fromJson(Map<String, dynamic>.from(result.data));
    } on FirebaseFunctionsException catch (e) {
      debugPrint('Firebase Functions error: ${e.code} - ${e.message}');
      throw PaymentException(
        _getFriendlyErrorMessage(e.code),
        code: e.code,
        details: e.details,
      );
    } catch (e) {
      debugPrint('Error creating payment: $e');
      throw PaymentException(
        'Erreur lors de la création du paiement. Veuillez réessayer.',
        details: e,
      );
    }
  }

  /// Vérifie le statut d'un paiement
  ///
  /// Paramètres:
  /// - [paymentId]: ID du paiement Noda
  ///
  /// Retourne un [PaymentStatus] avec l'état actuel du paiement
  ///
  /// Lance [PaymentException] en cas d'erreur
  Future<PaymentStatus> checkPaymentStatus(String paymentId) async {
    try {
      debugPrint('Checking payment status: $paymentId');

      final result =
          await _functions.httpsCallable('checkNodaPaymentStatus').call({
        'paymentId': paymentId,
      });

      return PaymentStatus.fromJson(Map<String, dynamic>.from(result.data));
    } on FirebaseFunctionsException catch (e) {
      debugPrint('Firebase Functions error: ${e.code} - ${e.message}');
      throw PaymentException(
        'Impossible de vérifier le statut du paiement',
        code: e.code,
        details: e.details,
      );
    } catch (e) {
      debugPrint('Error checking payment status: $e');
      throw PaymentException(
        'Erreur lors de la vérification du paiement',
        details: e,
      );
    }
  }

  /// Convertit les codes d'erreur Firebase en messages conviviaux
  String _getFriendlyErrorMessage(String code) {
    switch (code) {
      case 'unauthenticated':
        return 'Vous devez être connecté pour effectuer un paiement';
      case 'permission-denied':
        return 'Vous n\'avez pas les permissions nécessaires';
      case 'invalid-argument':
        return 'Données de paiement invalides';
      case 'not-found':
        return 'Paiement introuvable';
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
