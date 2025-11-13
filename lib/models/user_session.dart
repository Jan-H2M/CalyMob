import 'package:cloud_firestore/cloud_firestore.dart';

/// Model UserSession - Session utilisateur avec timeout
class UserSession {
  final String userId;
  final String clubId;
  final DateTime loginAt;
  final DateTime lastActivityAt;
  final DateTime expiresAt;
  final String deviceInfo;
  final bool isActive;
  final String? userAgent;

  UserSession({
    required this.userId,
    required this.clubId,
    required this.loginAt,
    required this.lastActivityAt,
    required this.expiresAt,
    required this.deviceInfo,
    this.isActive = true,
    this.userAgent,
  });

  /// Convertir depuis Firestore
  factory UserSession.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    return UserSession(
      userId: data['userId'] ?? '',
      clubId: data['clubId'] ?? '',
      loginAt: (data['loginAt'] as Timestamp).toDate(),
      lastActivityAt: (data['lastActivityAt'] as Timestamp).toDate(),
      expiresAt: (data['expiresAt'] as Timestamp).toDate(),
      deviceInfo: data['deviceInfo'] ?? '',
      isActive: data['isActive'] ?? true,
      userAgent: data['userAgent'],
    );
  }

  /// Est-ce que la session est expirée ?
  bool isExpired() {
    return DateTime.now().isAfter(expiresAt);
  }
}
