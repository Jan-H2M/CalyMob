/// Payment API response models
///
/// Used for communication with Cloud Functions that interact with
/// payment providers (Ponto Connect, Noda, Mollie).

class PaymentResponse {
  final String paymentId;
  final String? molliePaymentId; // Mollie's tr_xxx ID
  final String? paymentUrl;
  final String status;
  final DateTime? expiresAt;
  final String? provider; // 'ponto', 'noda', or 'mollie'
  final String? method; // Payment method (bancontact, kbc, etc.)

  PaymentResponse({
    required this.paymentId,
    this.molliePaymentId,
    this.paymentUrl,
    required this.status,
    this.expiresAt,
    this.provider,
    this.method,
  });

  factory PaymentResponse.fromJson(Map<String, dynamic> json) {
    return PaymentResponse(
      paymentId: json['paymentId'] as String,
      molliePaymentId: json['molliePaymentId'] as String?,
      paymentUrl: json['paymentUrl'] as String?,
      status: json['status'] as String,
      expiresAt: json['expiresAt'] != null
          ? DateTime.tryParse(json['expiresAt'] as String)
          : null,
      provider: json['provider'] as String?,
      method: json['method'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'paymentId': paymentId,
      'molliePaymentId': molliePaymentId,
      'paymentUrl': paymentUrl,
      'status': status,
      'expiresAt': expiresAt?.toIso8601String(),
      'provider': provider,
      'method': method,
    };
  }

  /// Whether this payment has a valid redirect URL
  bool get hasPaymentUrl => paymentUrl != null && paymentUrl!.isNotEmpty;
}

class PaymentStatus {
  // Mollie: 'open', 'pending', 'paid', 'failed', 'canceled', 'expired'
  // Ponto/Noda: 'pending', 'signed', 'completed', 'failed', 'cancelled'
  final String status;
  final bool paye;
  final DateTime? completedAt;
  final String? failureReason;
  final String? paymentId;
  final String? molliePaymentId;
  final String? method;
  final String? provider;

  PaymentStatus({
    required this.status,
    this.paye = false,
    this.completedAt,
    this.failureReason,
    this.paymentId,
    this.molliePaymentId,
    this.method,
    this.provider,
  });

  factory PaymentStatus.fromJson(Map<String, dynamic> json) {
    return PaymentStatus(
      status: json['status'] as String,
      paye: json['paye'] as bool? ?? false,
      completedAt: json['completedAt'] != null
          ? DateTime.tryParse(json['completedAt'] as String)
          : (json['updatedAt'] != null
              ? DateTime.tryParse(json['updatedAt'] as String)
              : null),
      failureReason: json['failureReason'] as String?,
      paymentId: json['paymentId'] as String?,
      molliePaymentId: json['molliePaymentId'] as String?,
      method: json['method'] as String?,
      provider: json['provider'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'status': status,
      'paye': paye,
      'completedAt': completedAt?.toIso8601String(),
      'failureReason': failureReason,
      'paymentId': paymentId,
      'molliePaymentId': molliePaymentId,
      'method': method,
      'provider': provider,
    };
  }

  // Ponto/Noda status checks
  bool get isPending => status == 'pending' || status == 'open';
  bool get isSigned => status == 'signed';

  // Combined completed check (works for all providers)
  bool get isCompleted => status == 'completed' || status == 'paid' || paye;

  // Failed checks (supports both naming conventions)
  bool get isFailed => status == 'failed';
  bool get isCancelled => status == 'cancelled' || status == 'canceled';
  bool get isExpired => status == 'expired';

  /// Whether the payment is in a final (terminal) state
  bool get isFinal => isCompleted || isFailed || isCancelled || isExpired;
}

class PaymentException implements Exception {
  final String message;
  final String? code;
  final dynamic details;

  PaymentException(this.message, {this.code, this.details});

  @override
  String toString() {
    if (code != null) {
      return 'PaymentException [$code]: $message';
    }
    return 'PaymentException: $message';
  }
}
