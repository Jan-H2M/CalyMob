import 'package:cloud_firestore/cloud_firestore.dart';
import 'session_message.dart' show MessageAttachment;
import 'event_message.dart' show ReplyPreview;

/// Modèle pour les réponses aux annonces du club
/// Collection: clubs/{clubId}/announcements/{announcementId}/replies
class AnnouncementReply {
  final String id;
  final String senderId;
  final String senderName;
  final String message;
  final DateTime createdAt;
  final List<String> readBy;
  final String? replyToId;
  final ReplyPreview? replyToPreview;
  final List<MessageAttachment> attachments;

  AnnouncementReply({
    required this.id,
    required this.senderId,
    required this.senderName,
    required this.message,
    required this.createdAt,
    this.readBy = const [],
    this.replyToId,
    this.replyToPreview,
    this.attachments = const [],
  });

  /// Créer depuis Firestore
  factory AnnouncementReply.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    return AnnouncementReply(
      id: doc.id,
      senderId: data['sender_id'] ?? '',
      senderName: data['sender_name'] ?? '',
      message: data['message'] ?? '',
      createdAt: (data['created_at'] as Timestamp).toDate(),
      readBy: (data['read_by'] as List<dynamic>?)?.cast<String>() ?? [],
      replyToId: data['reply_to_id'],
      replyToPreview: data['reply_to_preview'] != null
          ? ReplyPreview.fromMap(data['reply_to_preview'] as Map<String, dynamic>)
          : null,
      attachments: (data['attachments'] as List<dynamic>?)
              ?.map((a) => MessageAttachment.fromMap(a as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }

  /// Convertir vers Firestore
  Map<String, dynamic> toFirestore() {
    return {
      'sender_id': senderId,
      'sender_name': senderName,
      'message': message,
      'created_at': Timestamp.fromDate(createdAt),
      'read_by': readBy,
      if (replyToId != null) 'reply_to_id': replyToId,
      if (replyToPreview != null) 'reply_to_preview': replyToPreview!.toMap(),
      if (attachments.isNotEmpty)
        'attachments': attachments.map((a) => a.toMap()).toList(),
    };
  }

  /// Copier avec modifications
  AnnouncementReply copyWith({
    String? message,
    List<String>? readBy,
    String? replyToId,
    ReplyPreview? replyToPreview,
    List<MessageAttachment>? attachments,
  }) {
    return AnnouncementReply(
      id: id,
      senderId: senderId,
      senderName: senderName,
      message: message ?? this.message,
      createdAt: createdAt,
      readBy: readBy ?? this.readBy,
      replyToId: replyToId ?? this.replyToId,
      replyToPreview: replyToPreview ?? this.replyToPreview,
      attachments: attachments ?? this.attachments,
    );
  }

  /// Vérifier si la réponse a été lue par un utilisateur
  bool isReadBy(String userId) => readBy.contains(userId);

  /// Nombre de lecteurs
  int get readCount => readBy.length;

  /// A des pièces jointes
  bool get hasAttachments => attachments.isNotEmpty;

  /// Est une réponse à un autre message
  bool get isReply => replyToId != null;
}
