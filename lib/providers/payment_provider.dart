import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/payment_response.dart';
import '../services/payment_service.dart';

/// Provider for managing payment state
///
/// Handles payment creation, status tracking, and communication
/// with payment services (Mollie primary, Ponto legacy).
class PaymentProvider with ChangeNotifier {
  final PaymentService _paymentService = PaymentService();

  bool _isProcessing = false;
  String? _currentPaymentId;
  String? _currentMolliePaymentId;
  String? _currentPaymentUrl;
  String? _errorMessage;
  String? _currentProvider; // 'mollie' or 'ponto'
  Timer? _statusCheckTimer;
  bool _isPollingInProgress = false; // Prevents overlapping async polls

  // Current payment context for status polling
  String? _currentClubId;
  String? _currentOperationId;
  String? _currentParticipantId;

  bool get isProcessing => _isProcessing;
  String? get currentPaymentId => _currentPaymentId;
  String? get currentMolliePaymentId => _currentMolliePaymentId;
  String? get currentPaymentUrl => _currentPaymentUrl;
  String? get errorMessage => _errorMessage;
  String? get currentProvider => _currentProvider;

  // ============================================================================
  // MOLLIE PAYMENTS (Primary)
  // ============================================================================

  /// Creates a new Mollie payment request
  ///
  /// Returns the Mollie checkout URL on success, null on error
  Future<String?> createMolliePayment({
    required String clubId,
    required String operationId,
    required String participantId,
    required double amount,
    required String description,
    MolliePaymentMethod? method,
    String locale = 'nl_BE',
  }) async {
    _isProcessing = true;
    _errorMessage = null;
    _currentProvider = 'mollie';

    // Store context for status polling
    _currentClubId = clubId;
    _currentOperationId = operationId;
    _currentParticipantId = participantId;

    notifyListeners();

    try {
      final response = await _paymentService.createMolliePayment(
        clubId: clubId,
        operationId: operationId,
        participantId: participantId,
        amount: amount,
        description: description,
        method: method,
        locale: locale,
      );

      _currentPaymentId = response.paymentId;
      _currentMolliePaymentId = response.molliePaymentId;
      _currentPaymentUrl = response.paymentUrl;
      _isProcessing = false;
      notifyListeners();

      debugPrint('💳 Mollie payment URL: $_currentPaymentUrl');
      return response.paymentUrl;
    } on PaymentException catch (e) {
      _errorMessage = e.message;
      _isProcessing = false;
      notifyListeners();
      return null;
    } catch (e) {
      _errorMessage = 'Erreur inattendue lors de la creation du paiement';
      _isProcessing = false;
      notifyListeners();
      return null;
    }
  }

  /// Checks Mollie payment status
  ///
  /// Returns current status or null on error
  Future<PaymentStatus?> checkMolliePaymentStatus({
    required String clubId,
    required String operationId,
    required String participantId,
  }) async {
    try {
      return await _paymentService.checkMolliePaymentStatus(
        clubId: clubId,
        operationId: operationId,
        participantId: participantId,
      );
    } on PaymentException catch (e) {
      _errorMessage = e.message;
      notifyListeners();
      return null;
    } catch (e) {
      _errorMessage = 'Erreur lors de la verification du statut';
      notifyListeners();
      return null;
    }
  }

  /// Starts periodic Mollie payment status polling
  ///
  /// Checks status every 3 seconds for max 5 minutes
  /// Automatically stops when payment is completed/failed
  void startMolliePaymentStatusPolling({
    required String clubId,
    required String operationId,
    required String participantId,
    required Function(PaymentStatus) onStatusUpdate,
  }) {
    stopPaymentStatusPolling(); // Stop any existing polling

    int tickCount = 0;
    const maxTicks = 100; // 5 minutes (100 * 3 seconds)
    int consecutiveErrors = 0;
    const maxConsecutiveErrors = 5;

    debugPrint('🔄 Starting Mollie payment status polling for participant: $participantId');

    _statusCheckTimer = Timer.periodic(const Duration(seconds: 3), (timer) async {
      // Prevent overlapping async operations
      if (_isPollingInProgress) {
        debugPrint('⏳ Mollie poll skipped - previous poll still in progress');
        return;
      }

      tickCount++;

      // Stop after 5 minutes
      if (tickCount > maxTicks) {
        debugPrint('⏰ Mollie payment status polling timeout');
        stopPaymentStatusPolling();
        return;
      }

      _isPollingInProgress = true;
      try {
        final status = await _paymentService.checkMolliePaymentStatus(
          clubId: clubId,
          operationId: operationId,
          participantId: participantId,
        ).timeout(const Duration(seconds: 10)); // Add timeout to prevent hanging

        consecutiveErrors = 0; // Reset error count on success
        onStatusUpdate(status);

        // Stop if payment is final (success or failure)
        if (status.isFinal) {
          debugPrint('✅ Mollie payment status final: ${status.status}, paye: ${status.paye}');
          stopPaymentStatusPolling();
        }
      } catch (e) {
        consecutiveErrors++;
        debugPrint('❌ Error checking Mollie payment status ($consecutiveErrors/$maxConsecutiveErrors): $e');

        // Stop polling after too many consecutive errors
        if (consecutiveErrors >= maxConsecutiveErrors) {
          debugPrint('🛑 Mollie polling stopped due to repeated errors');
          stopPaymentStatusPolling();
        }
      } finally {
        _isPollingInProgress = false;
      }
    });
  }

  // ============================================================================
  // PONTO PAYMENTS (Legacy)
  // ============================================================================

  /// Creates a new Ponto payment request (Legacy)
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
    _currentProvider = 'ponto';

    // Store context for status polling
    _currentClubId = clubId;
    _currentOperationId = operationId;
    _currentParticipantId = participantId;

    notifyListeners();

    try {
      final response = await _paymentService.createNodaPayment(
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
      _errorMessage = 'Erreur inattendue lors de la creation du paiement';
      _isProcessing = false;
      notifyListeners();
      return null;
    }
  }

  /// Checks Ponto payment status (Legacy)
  ///
  /// Returns current status or null on error
  Future<PaymentStatus?> checkPaymentStatus({
    required String clubId,
    required String operationId,
    required String participantId,
    required String paymentId,
  }) async {
    try {
      return await _paymentService.checkNodaPaymentStatus(
        clubId: clubId,
        operationId: operationId,
        participantId: participantId,
      );
    } on PaymentException catch (e) {
      _errorMessage = e.message;
      notifyListeners();
      return null;
    } catch (e) {
      _errorMessage = 'Erreur lors de la verification du statut';
      notifyListeners();
      return null;
    }
  }

  /// Starts periodic Ponto payment status polling (Legacy)
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
        final status = await _paymentService.checkNodaPaymentStatus(
          clubId: clubId,
          operationId: operationId,
          participantId: participantId,
        );
        onStatusUpdate(status);

        // Stop if payment is final (success or failure)
        if (status.isFinal) {
          debugPrint('✅ Payment status final: ${status.status}, paye: ${status.paye}');
          stopPaymentStatusPolling();
        }
      } catch (e) {
        debugPrint('❌ Error checking payment status: $e');
        // Continue polling despite errors
      }
    });
  }

  // ============================================================================
  // COMMON
  // ============================================================================

  /// Stops periodic status polling
  void stopPaymentStatusPolling() {
    _statusCheckTimer?.cancel();
    _statusCheckTimer = null;
    _isPollingInProgress = false;
  }

  /// Resets provider state
  void reset() {
    stopPaymentStatusPolling();
    _isProcessing = false;
    _currentPaymentId = null;
    _currentMolliePaymentId = null;
    _currentPaymentUrl = null;
    _errorMessage = null;
    _currentProvider = null;
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
