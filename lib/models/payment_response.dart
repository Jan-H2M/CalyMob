/// Payment API response models
///
/// Used for communication with Cloud Functions that interact with
/// payment providers (Ponto Connect, Noda).

class PaymentResponse {
  final String paymentId;
  final String? paymentUrl;
  final String status;
  final DateTime? expiresAt;
  final String? provider; // 'ponto' or 'noda'

  PaymentResponse({
    required this.paymentId,
    this.paymentUrl,
    required this.status,
    this.expiresAt,
    this.provider,
  });

  factory PaymentResponse.fromJson(Map<String, dynamic> json) {
    return PaymentResponse(
      paymentId: json['paymentId'] as String,
      paymentUrl: json['paymentUrl'] as String?,
      status: json['status'] as String,
      expiresAt: json['expiresAt'] != null
          ? DateTime.tryParse(json['expiresAt'] as String)
          : null,
      provider: json['provider'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'paymentId': paymentId,
      'paymentUrl': paymentUrl,
      'status': status,
      'expiresAt': expiresAt?.toIso8601String(),
      'provider': provider,
    };
  }

  /// Whether this payment has a valid redirect URL
  bool get hasPaymentUrl => paymentUrl != null && paymentUrl!.isNotEmpty;
}

class PaymentStatus {
  final String status; // 'pending', 'signed', 'completed', 'failed', 'cancelled'
  final bool paye;
  final DateTime? completedAt;
  final String? failureReason;
  final String? paymentId;

  PaymentStatus({
    required this.status,
    this.paye = false,
    this.completedAt,
    this.failureReason,
    this.paymentId,
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
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'status': status,
      'paye': paye,
      'completedAt': completedAt?.toIso8601String(),
      'failureReason': failureReason,
      'paymentId': paymentId,
    };
  }

  bool get isPending => status == 'pending';
  bool get isSigned => status == 'signed';
  bool get isCompleted => status == 'completed' || paye;
  bool get isFailed => status == 'failed';
  bool get isCancelled => status == 'cancelled';
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
