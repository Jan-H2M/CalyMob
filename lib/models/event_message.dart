import 'package:cloud_firestore/cloud_firestore.dart';
import 'session_message.dart' show MessageAttachment;
import 'poll.dart';

/// Preview d'un message pour les réponses
class ReplyPreview {
  final String senderName;
  final String messagePreview;

  ReplyPreview({
    required this.senderName,
    required this.messagePreview,
  });

  factory ReplyPreview.fromMap(Map<String, dynamic> map) {
    return ReplyPreview(
      senderName: map['sender_name'] ?? '',
      messagePreview: map['message_preview'] ?? '',
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'sender_name': senderName,
      'message_preview': messagePreview,
    };
  }
}

/// Modèle pour les messages liés à un événement
class EventMessage {
  final String id;
  final String senderId;
  final String senderName;
  final String message;
  final DateTime createdAt;
  final DateTime? editedAt;
  final String? replyToId;
  final ReplyPreview? replyToPreview;
  final List<MessageAttachment> attachments;
  final Map<String, List<String>> reactions;
  final Poll? poll;

  EventMessage({
    required this.id,
    required this.senderId,
    required this.senderName,
    required this.message,
    required this.createdAt,
    this.editedAt,
    this.replyToId,
    this.replyToPreview,
    this.attachments = const [],
    this.reactions = const {},
    this.poll,
  });

  /// Créer depuis Firestore
  factory EventMessage.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    return EventMessage(
      id: doc.id,
      senderId: data['sender_id'] ?? '',
      senderName: data['sender_name'] ?? '',
      message: data['message'] ?? '',
      createdAt: (data['created_at'] as Timestamp?)?.toDate() ?? DateTime.now(),
      editedAt: (data['edited_at'] as Timestamp?)?.toDate(),
      replyToId: data['reply_to_id'],
      replyToPreview: data['reply_to_preview'] != null
          ? ReplyPreview.fromMap(
              data['reply_to_preview'] as Map<String, dynamic>)
          : null,
      attachments: (data['attachments'] as List<dynamic>?)
              ?.map((a) => MessageAttachment.fromMap(a as Map<String, dynamic>))
              .toList() ??
          [],
      reactions: _parseReactions(data['reactions']),
      poll: data['poll'] != null
          ? Poll.fromMap(data['poll'] as Map<String, dynamic>)
          : null,
    );
  }

  /// Convertir vers Firestore
  Map<String, dynamic> toFirestore() {
    return {
      'sender_id': senderId,
      'sender_name': senderName,
      'message': message,
      'created_at': Timestamp.fromDate(createdAt),
      if (editedAt != null) 'edited_at': Timestamp.fromDate(editedAt!),
      if (replyToId != null) 'reply_to_id': replyToId,
      if (replyToPreview != null) 'reply_to_preview': replyToPreview!.toMap(),
      if (attachments.isNotEmpty)
        'attachments': attachments.map((a) => a.toMap()).toList(),
      if (reactions.isNotEmpty) 'reactions': reactions,
      if (poll != null) 'poll': poll!.toMap(),
    };
  }

  /// Copier avec modifications
  EventMessage copyWith({
    String? message,
    DateTime? editedAt,
    String? replyToId,
    ReplyPreview? replyToPreview,
    List<MessageAttachment>? attachments,
    Map<String, List<String>>? reactions,
    Poll? poll,
    bool clearPoll = false,
  }) {
    return EventMessage(
      id: id,
      senderId: senderId,
      senderName: senderName,
      message: message ?? this.message,
      createdAt: createdAt,
      editedAt: editedAt ?? this.editedAt,
      replyToId: replyToId ?? this.replyToId,
      replyToPreview: replyToPreview ?? this.replyToPreview,
      attachments: attachments ?? this.attachments,
      reactions: reactions ?? this.reactions,
      poll: clearPoll ? null : (poll ?? this.poll),
    );
  }

  /// Of dit bericht bewerkt is na het originele versturen.
  bool get isEdited => editedAt != null;

  /// A des pièces jointes
  bool get hasAttachments => attachments.isNotEmpty;

  /// Est une réponse à un autre message
  bool get isReply => replyToId != null;

  bool get hasPoll => poll != null;

  static Map<String, List<String>> _parseReactions(dynamic rawReactions) {
    if (rawReactions is! Map) return const {};

    final parsed = <String, List<String>>{};
    for (final entry in rawReactions.entries) {
      parsed[entry.key.toString()] = (entry.value as List<dynamic>?)
              ?.map((uid) => uid.toString())
              .toList() ??
          const [];
    }
    return parsed;
  }
}
