import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/payment_response.dart';
import '../services/payment_service.dart';

/// Provider pour gérer l'état des paiements
///
/// Gère la création de paiements, le suivi du statut,
/// et la communication avec le service de paiement Noda.
class PaymentProvider with ChangeNotifier {
  final PaymentService _paymentService = PaymentService();

  bool _isProcessing = false;
  String? _currentPaymentId;
  String? _currentPaymentUrl;
  String? _errorMessage;
  Timer? _statusCheckTimer;

  bool get isProcessing => _isProcessing;
  String? get currentPaymentId => _currentPaymentId;
  String? get currentPaymentUrl => _currentPaymentUrl;
  String? get errorMessage => _errorMessage;

  /// Crée un nouveau paiement
  ///
  /// Retourne l'URL de paiement Noda si succès, null si erreur
  Future<String?> createPayment({
    required String clubId,
    required String operationId,
    required String participantId,
    required double amount,
    required String description,
  }) async {
    _isProcessing = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final response = await _paymentService.createPayment(
        clubId: clubId,
        operationId: operationId,
        participantId: participantId,
        amount: amount,
        description: description,
      );

      _currentPaymentId = response.paymentId;
      _currentPaymentUrl = response.paymentUrl;
      _isProcessing = false;
      notifyListeners();

      return response.paymentUrl;
    } on PaymentException catch (e) {
      _errorMessage = e.message;
      _isProcessing = false;
      notifyListeners();
      return null;
    } catch (e) {
      _errorMessage = 'Erreur inattendue lors de la création du paiement';
      _isProcessing = false;
      notifyListeners();
      return null;
    }
  }

  /// Vérifie le statut d'un paiement
  ///
  /// Retourne le statut actuel ou null si erreur
  Future<PaymentStatus?> checkPaymentStatus(String paymentId) async {
    try {
      return await _paymentService.checkPaymentStatus(paymentId);
    } on PaymentException catch (e) {
      _errorMessage = e.message;
      notifyListeners();
      return null;
    } catch (e) {
      _errorMessage = 'Erreur lors de la vérification du statut';
      notifyListeners();
      return null;
    }
  }

  /// Démarre la vérification périodique du statut de paiement
  ///
  /// Vérifie le statut toutes les 3 secondes pendant max 5 minutes
  /// Arrête automatiquement quand le paiement est complété/échoué
  void startPaymentStatusPolling(
    String paymentId,
    Function(PaymentStatus) onStatusUpdate,
  ) {
    stopPaymentStatusPolling(); // Arrête un éventuel polling en cours

    int tickCount = 0;
    const maxTicks = 100; // 5 minutes (100 * 3 secondes)

    _statusCheckTimer = Timer.periodic(const Duration(seconds: 3), (timer) async {
      tickCount++;

      // Arrêter après 5 minutes
      if (tickCount > maxTicks) {
        debugPrint('Payment status polling timeout');
        stopPaymentStatusPolling();
        return;
      }

      try {
        final status = await _paymentService.checkPaymentStatus(paymentId);
        onStatusUpdate(status);

        // Arrêter si le paiement est terminé (succès ou échec)
        if (status.isCompleted || status.isFailed || status.isCancelled) {
          debugPrint('Payment status final: ${status.status}');
          stopPaymentStatusPolling();
        }
      } catch (e) {
        debugPrint('Error checking payment status: $e');
        // Continue à vérifier malgré les erreurs
      }
    });
  }

  /// Arrête la vérification périodique du statut
  void stopPaymentStatusPolling() {
    _statusCheckTimer?.cancel();
    _statusCheckTimer = null;
  }

  /// Réinitialise l'état du provider
  void reset() {
    stopPaymentStatusPolling();
    _isProcessing = false;
    _currentPaymentId = null;
    _currentPaymentUrl = null;
    _errorMessage = null;
    notifyListeners();
  }

  @override
  void dispose() {
    stopPaymentStatusPolling();
    super.dispose();
  }
}
