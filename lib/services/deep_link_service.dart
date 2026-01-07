import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:app_links/app_links.dart';

/// Service for handling deep links (payment return URLs, password reset, etc.)
///
/// Supported deep link formats:
/// - calymob://payment/return?provider=noda&payment=xxx&clubId=xxx&operationId=xxx
/// - calymob://reset-password?oobCode=xxx&mode=resetPassword (custom scheme)
/// - https://caly.club/reset-password?oobCode=xxx&mode=resetPassword (Universal/App Links)
class DeepLinkService {
  static final DeepLinkService _instance = DeepLinkService._internal();
  factory DeepLinkService() => _instance;
  DeepLinkService._internal();

  final AppLinks _appLinks = AppLinks();

  // Stream controller for payment return events
  final _paymentReturnController = StreamController<PaymentReturnData>.broadcast();
  Stream<PaymentReturnData> get onPaymentReturn => _paymentReturnController.stream;

  // Stream controller for password reset events
  final _passwordResetController = StreamController<PasswordResetData>.broadcast();
  Stream<PasswordResetData> get onPasswordReset => _passwordResetController.stream;

  StreamSubscription<Uri>? _linkSubscription;
  bool _isInitialized = false;

  /// Initialize the deep link service
  Future<void> initialize() async {
    if (_isInitialized) return;
    _isInitialized = true;

    // Handle link when app is started from a deep link
    try {
      final initialLink = await _appLinks.getInitialLink();
      if (initialLink != null) {
        debugPrint('DeepLink: Initial link received: $initialLink');
        _handleDeepLink(initialLink);
      }
    } catch (e) {
      debugPrint('DeepLink: Error getting initial link: $e');
    }

    // Handle links when app is already running
    _linkSubscription = _appLinks.uriLinkStream.listen(
      (Uri uri) {
        debugPrint('DeepLink: Link received while running: $uri');
        _handleDeepLink(uri);
      },
      onError: (err) {
        debugPrint('DeepLink: Error in link stream: $err');
      },
    );

    debugPrint('DeepLink: Service initialized');
  }

  /// Handle incoming deep link
  void _handleDeepLink(Uri uri) {
    debugPrint('DeepLink: Handling URI: $uri');
    debugPrint('DeepLink: Scheme: ${uri.scheme}, Host: ${uri.host}, Path: ${uri.path}');

    // Check if it's a password reset link from caly.club
    // Format: https://caly.club/reset-password?oobCode=xxx&mode=resetPassword
    if ((uri.scheme == 'https' || uri.scheme == 'http') &&
        uri.host == 'caly.club' &&
        uri.path == '/reset-password') {
      final oobCode = uri.queryParameters['oobCode'];
      final mode = uri.queryParameters['mode'];

      if (oobCode != null && mode == 'resetPassword') {
        debugPrint('DeepLink: Password reset detected - oobCode: ${oobCode.substring(0, 10)}...');

        _passwordResetController.add(PasswordResetData(
          oobCode: oobCode,
        ));
      } else {
        debugPrint('DeepLink: Missing oobCode or invalid mode for password reset');
      }
      return;
    }

    // Check if it's a password reset link via custom scheme
    // Format: calymob://reset-password?oobCode=xxx&mode=resetPassword
    if (uri.scheme == 'calymob' && uri.host == 'reset-password') {
      final oobCode = uri.queryParameters['oobCode'];
      final mode = uri.queryParameters['mode'];

      if (oobCode != null && mode == 'resetPassword') {
        debugPrint('DeepLink: Password reset via custom scheme - oobCode: ${oobCode.substring(0, 10)}...');

        _passwordResetController.add(PasswordResetData(
          oobCode: oobCode,
        ));
      } else {
        debugPrint('DeepLink: Missing oobCode or invalid mode for password reset (custom scheme)');
      }
      return;
    }

    // Check if it's a payment return link
    // Format: calymob://payment/return?provider=noda&payment=xxx
    if (uri.scheme == 'calymob' && uri.host == 'payment' && uri.path == '/return') {
      final provider = uri.queryParameters['provider'];
      final paymentId = uri.queryParameters['payment'];
      final clubId = uri.queryParameters['clubId'];
      final operationId = uri.queryParameters['operationId'];

      if (provider != null && paymentId != null) {
        debugPrint('DeepLink: Payment return detected - provider: $provider, paymentId: $paymentId');

        _paymentReturnController.add(PaymentReturnData(
          provider: provider,
          paymentId: paymentId,
          clubId: clubId,
          operationId: operationId,
        ));
      } else {
        debugPrint('DeepLink: Missing required payment parameters');
      }
      return;
    }

    debugPrint('DeepLink: Unknown deep link format');
  }

  /// Dispose of the service
  void dispose() {
    _linkSubscription?.cancel();
    _paymentReturnController.close();
    _passwordResetController.close();
    _isInitialized = false;
  }
}

/// Data class for payment return events
class PaymentReturnData {
  final String provider;
  final String paymentId;
  final String? clubId;
  final String? operationId;

  PaymentReturnData({
    required this.provider,
    required this.paymentId,
    this.clubId,
    this.operationId,
  });

  @override
  String toString() => 'PaymentReturnData(provider: $provider, paymentId: $paymentId, clubId: $clubId, operationId: $operationId)';
}

/// Data class for password reset events
class PasswordResetData {
  final String oobCode;

  PasswordResetData({
    required this.oobCode,
  });

  @override
  String toString() => 'PasswordResetData(oobCode: ${oobCode.substring(0, 10)}...)';
}
