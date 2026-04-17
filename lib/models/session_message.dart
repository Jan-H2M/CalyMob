import 'package:cloud_firestore/cloud_firestore.dart';
import 'poll.dart';

/// Type de groupe de discussion
enum SessionGroupType {
  accueil,
  encadrants,
  niveau,
}

extension SessionGroupTypeExtension on SessionGroupType {
  String get value {
    switch (this) {
      case SessionGroupType.accueil:
        return 'accueil';
      case SessionGroupType.encadrants:
        return 'encadrants';
      case SessionGroupType.niveau:
        return 'niveau';
    }
  }

  static SessionGroupType fromString(String value) {
    switch (value) {
      case 'accueil':
        return SessionGroupType.accueil;
      case 'encadrants':
        return SessionGroupType.encadrants;
      case 'niveau':
        return SessionGroupType.niveau;
      default:
        return SessionGroupType.encadrants;
    }
  }

  String get displayName {
    switch (this) {
      case SessionGroupType.accueil:
        return 'Équipe Accueil';
      case SessionGroupType.encadrants:
        return 'Encadrants';
      case SessionGroupType.niveau:
        return 'Niveau';
    }
  }

  String get icon {
    switch (this) {
      case SessionGroupType.accueil:
        return '🎫';
      case SessionGroupType.encadrants:
        return '🎓';
      case SessionGroupType.niveau:
        return '⭐';
    }
  }
}

/// Pièce jointe dans un message
class MessageAttachment {
  final String type; // 'image', 'pdf' ou 'video'
  final String url;
  final String filename;
  final int size;
  final String? storagePath;

  MessageAttachment({
    required this.type,
    required this.url,
    required this.filename,
    required this.size,
    this.storagePath,
  });

  factory MessageAttachment.fromMap(Map<String, dynamic> map) {
    return MessageAttachment(
      type: map['type'] ?? 'image',
      url: map['url'] ?? '',
      filename: map['filename'] ?? '',
      size: map['size'] ?? 0,
      storagePath: map['storage_path'],
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'type': type,
      'url': url,
      'filename': filename,
      'size': size,
      if (storagePath != null) 'storage_path': storagePath,
    };
  }

  bool get isImage => type == 'image';
  bool get isPdf => type == 'pdf';
  bool get isVideo => type == 'video';

  MessageAttachment copyWith({
    String? type,
    String? url,
    String? filename,
    int? size,
    String? storagePath,
    bool clearStoragePath = false,
  }) {
    return MessageAttachment(
      type: type ?? this.type,
      url: url ?? this.url,
      filename: filename ?? this.filename,
      size: size ?? this.size,
      storagePath: clearStoragePath ? null : (storagePath ?? this.storagePath),
    );
  }
}

/// Message dans un groupe de discussion de séance
class SessionMessage {
  final String id;
  final String senderId;
  final String senderName;
  final String message;
  final SessionGroupType groupType;
  final String? groupLevel; // Uniquement si groupType = niveau
  final List<MessageAttachment> attachments;
  final Map<String, List<String>> reactions;
  final Poll? poll;
  final DateTime createdAt;
  final DateTime? editedAt;

  SessionMessage({
    required this.id,
    required this.senderId,
    required this.senderName,
    required this.message,
    required this.groupType,
    this.groupLevel,
    this.attachments = const [],
    this.reactions = const {},
    this.poll,
    required this.createdAt,
    this.editedAt,
  });

  factory SessionMessage.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    return SessionMessage(
      id: doc.id,
      senderId: data['sender_id'] ?? '',
      senderName: data['sender_name'] ?? '',
      message: data['message'] ?? '',
      groupType: SessionGroupTypeExtension.fromString(
          data['group_type'] ?? 'encadrants'),
      groupLevel: data['group_level'],
      attachments: (data['attachments'] as List<dynamic>?)
              ?.map((a) => MessageAttachment.fromMap(a as Map<String, dynamic>))
              .toList() ??
          [],
      reactions: _parseReactions(data['reactions']),
      poll: data['poll'] != null
          ? Poll.fromMap(data['poll'] as Map<String, dynamic>)
          : null,
      createdAt: (data['created_at'] as Timestamp?)?.toDate() ?? DateTime.now(),
      editedAt: (data['edited_at'] as Timestamp?)?.toDate(),
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'sender_id': senderId,
      'sender_name': senderName,
      'message': message,
      'group_type': groupType.value,
      if (groupLevel != null) 'group_level': groupLevel,
      'attachments': attachments.map((a) => a.toMap()).toList(),
      if (reactions.isNotEmpty) 'reactions': reactions,
      if (poll != null) 'poll': poll!.toMap(),
      'created_at': Timestamp.fromDate(createdAt),
      if (editedAt != null) 'edited_at': Timestamp.fromDate(editedAt!),
    };
  }

  /// Formater l'heure pour l'affichage
  String get formattedTime {
    final hour = createdAt.hour.toString().padLeft(2, '0');
    final minute = createdAt.minute.toString().padLeft(2, '0');
    return '$hour:$minute';
  }

  /// Copie avec modifications
  SessionMessage copyWith({
    String? id,
    String? senderId,
    String? senderName,
    String? message,
    SessionGroupType? groupType,
    String? groupLevel,
    List<MessageAttachment>? attachments,
    Map<String, List<String>>? reactions,
    Poll? poll,
    bool clearPoll = false,
    DateTime? createdAt,
    DateTime? editedAt,
  }) {
    return SessionMessage(
      id: id ?? this.id,
      senderId: senderId ?? this.senderId,
      senderName: senderName ?? this.senderName,
      message: message ?? this.message,
      groupType: groupType ?? this.groupType,
      groupLevel: groupLevel ?? this.groupLevel,
      attachments: attachments ?? this.attachments,
      reactions: reactions ?? this.reactions,
      poll: clearPoll ? null : (poll ?? this.poll),
      createdAt: createdAt ?? this.createdAt,
      editedAt: editedAt ?? this.editedAt,
    );
  }

  bool get hasAttachments => attachments.isNotEmpty;
  bool get hasPoll => poll != null;
  bool get isEdited => editedAt != null;

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

/// Groupe de chat disponible pour une session
class SessionChatGroup {
  final SessionGroupType type;
  final String? level;
  final String displayName;
  final int unreadCount;

  SessionChatGroup({
    required this.type,
    this.level,
    required this.displayName,
    this.unreadCount = 0,
  });

  String get id {
    if (type == SessionGroupType.niveau && level != null) {
      return 'niveau_$level';
    }
    return type.value;
  }
}
