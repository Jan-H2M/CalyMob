/// Modèles pour les réponses de l'API de paiement Noda
///
/// Ces modèles sont utilisés pour communiquer avec les Cloud Functions
/// qui interagissent avec l'API Noda pour le traitement des paiements.

class PaymentResponse {
  final String paymentId;
  final String paymentUrl;
  final String status;
  final DateTime expiresAt;

  PaymentResponse({
    required this.paymentId,
    required this.paymentUrl,
    required this.status,
    required this.expiresAt,
  });

  factory PaymentResponse.fromJson(Map<String, dynamic> json) {
    return PaymentResponse(
      paymentId: json['paymentId'] as String,
      paymentUrl: json['paymentUrl'] as String,
      status: json['status'] as String,
      expiresAt: DateTime.parse(json['expiresAt'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'paymentId': paymentId,
      'paymentUrl': paymentUrl,
      'status': status,
      'expiresAt': expiresAt.toIso8601String(),
    };
  }
}

class PaymentStatus {
  final String status; // 'pending', 'completed', 'failed', 'cancelled'
  final DateTime? completedAt;
  final String? failureReason;

  PaymentStatus({
    required this.status,
    this.completedAt,
    this.failureReason,
  });

  factory PaymentStatus.fromJson(Map<String, dynamic> json) {
    return PaymentStatus(
      status: json['status'] as String,
      completedAt: json['completedAt'] != null
          ? DateTime.parse(json['completedAt'] as String)
          : null,
      failureReason: json['failureReason'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'status': status,
      'completedAt': completedAt?.toIso8601String(),
      'failureReason': failureReason,
    };
  }

  bool get isPending => status == 'pending';
  bool get isCompleted => status == 'completed';
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
