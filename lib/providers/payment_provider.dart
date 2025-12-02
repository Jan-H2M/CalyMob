import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/payment_response.dart';
import '../services/payment_service.dart';

/// Provider for managing payment state
///
/// Handles payment creation, status tracking, and communication
/// with the Ponto Connect payment service.
class PaymentProvider with ChangeNotifier {
  final PaymentService _paymentService = PaymentService();

  bool _isProcessing = false;
  String? _currentPaymentId;
  String? _currentPaymentUrl;
  String? _errorMessage;
  Timer? _statusCheckTimer;

  // Current payment context for status polling
  String? _currentClubId;
  String? _currentOperationId;
  String? _currentParticipantId;

  bool get isProcessing => _isProcessing;
  String? get currentPaymentId => _currentPaymentId;
  String? get currentPaymentUrl => _currentPaymentUrl;
  String? get errorMessage => _errorMessage;

  /// Creates a new payment request
  ///
  /// Returns the Ponto payment URL on success, null on error
  Future<String?> createPayment({
    required String clubId,
    required String operationId,
    required String participantId,
    required double amount,
    required String description,
  }) async {
    _isProcessing = true;
    _errorMessage = null;

    // Store context for status polling
    _currentClubId = clubId;
    _currentOperationId = operationId;
    _currentParticipantId = participantId;

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

      debugPrint('💳 Payment URL: $_currentPaymentUrl');
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

  /// Checks payment status
  ///
  /// Returns current status or null on error
  Future<PaymentStatus?> checkPaymentStatus({
    required String clubId,
    required String operationId,
    required String participantId,
    required String paymentId,
  }) async {
    try {
      return await _paymentService.checkPaymentStatus(
        clubId: clubId,
        operationId: operationId,
        participantId: participantId,
        paymentId: paymentId,
      );
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

  /// Starts periodic payment status polling
  ///
  /// Checks status every 3 seconds for max 5 minutes
  /// Automatically stops when payment is completed/failed
  void startPaymentStatusPolling({
    required String clubId,
    required String operationId,
    required String participantId,
    required String paymentId,
    required Function(PaymentStatus) onStatusUpdate,
  }) {
    stopPaymentStatusPolling(); // Stop any existing polling

    int tickCount = 0;
    const maxTicks = 100; // 5 minutes (100 * 3 seconds)

    debugPrint('🔄 Starting payment status polling for: $paymentId');

    _statusCheckTimer = Timer.periodic(const Duration(seconds: 3), (timer) async {
      tickCount++;

      // Stop after 5 minutes
      if (tickCount > maxTicks) {
        debugPrint('⏰ Payment status polling timeout');
        stopPaymentStatusPolling();
        return;
      }

      try {
        final status = await _paymentService.checkPaymentStatus(
          clubId: clubId,
          operationId: operationId,
          participantId: participantId,
          paymentId: paymentId,
        );
        onStatusUpdate(status);

        // Stop if payment is final (success or failure)
        if (status.isCompleted || status.isFailed || status.isCancelled) {
          debugPrint('✅ Payment status final: ${status.status}, paye: ${status.paye}');
          stopPaymentStatusPolling();
        }
      } catch (e) {
        debugPrint('❌ Error checking payment status: $e');
        // Continue polling despite errors
      }
    });
  }

  /// Stops periodic status polling
  void stopPaymentStatusPolling() {
    _statusCheckTimer?.cancel();
    _statusCheckTimer = null;
  }

  /// Resets provider state
  void reset() {
    stopPaymentStatusPolling();
    _isProcessing = false;
    _currentPaymentId = null;
    _currentPaymentUrl = null;
    _errorMessage = null;
    _currentClubId = null;
    _currentOperationId = null;
    _currentParticipantId = null;
    notifyListeners();
  }

  @override
  void dispose() {
    stopPaymentStatusPolling();
    super.dispose();
  }
}
