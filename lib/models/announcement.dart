import 'package:cloud_firestore/cloud_firestore.dart';

/// Type d'annonce
enum AnnouncementType {
  info,
  warning,
  urgent,
}

/// Modèle pour les annonces du club
class Announcement {
  final String id;
  final String title;
  final String message;
  final String senderId;
  final String senderName;
  final AnnouncementType type;
  final DateTime createdAt;

  Announcement({
    required this.id,
    required this.title,
    required this.message,
    required this.senderId,
    required this.senderName,
    required this.type,
    required this.createdAt,
  });

  /// Créer depuis Firestore
  factory Announcement.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    return Announcement(
      id: doc.id,
      title: data['title'] ?? '',
      message: data['message'] ?? '',
      senderId: data['sender_id'] ?? '',
      senderName: data['sender_name'] ?? '',
      type: _parseType(data['type']),
      createdAt: (data['created_at'] as Timestamp).toDate(),
    );
  }

  /// Convertir vers Firestore
  Map<String, dynamic> toFirestore() {
    return {
      'title': title,
      'message': message,
      'sender_id': senderId,
      'sender_name': senderName,
      'type': type.name,
      'created_at': Timestamp.fromDate(createdAt),
    };
  }

  /// Parser le type depuis string
  static AnnouncementType _parseType(dynamic type) {
    if (type == null) return AnnouncementType.info;

    switch (type.toString().toLowerCase()) {
      case 'warning':
        return AnnouncementType.warning;
      case 'urgent':
        return AnnouncementType.urgent;
      case 'info':
      default:
        return AnnouncementType.info;
    }
  }

  /// Copier avec modifications
  Announcement copyWith({
    String? title,
    String? message,
    AnnouncementType? type,
  }) {
    return Announcement(
      id: id,
      title: title ?? this.title,
      message: message ?? this.message,
      senderId: senderId,
      senderName: senderName,
      type: type ?? this.type,
      createdAt: createdAt,
    );
  }
}
