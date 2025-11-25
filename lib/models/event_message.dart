import 'package:cloud_firestore/cloud_firestore.dart';

/// Modèle pour les messages liés à un événement
class EventMessage {
  final String id;
  final String senderId;
  final String senderName;
  final String message;
  final DateTime createdAt;

  EventMessage({
    required this.id,
    required this.senderId,
    required this.senderName,
    required this.message,
    required this.createdAt,
  });

  /// Créer depuis Firestore
  factory EventMessage.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    return EventMessage(
      id: doc.id,
      senderId: data['sender_id'] ?? '',
      senderName: data['sender_name'] ?? '',
      message: data['message'] ?? '',
      createdAt: (data['created_at'] as Timestamp).toDate(),
    );
  }

  /// Convertir vers Firestore
  Map<String, dynamic> toFirestore() {
    return {
      'sender_id': senderId,
      'sender_name': senderName,
      'message': message,
      'created_at': Timestamp.fromDate(createdAt),
    };
  }

  /// Copier avec modifications
  EventMessage copyWith({
    String? message,
  }) {
    return EventMessage(
      id: id,
      senderId: senderId,
      senderName: senderName,
      message: message ?? this.message,
      createdAt: createdAt,
    );
  }
}
