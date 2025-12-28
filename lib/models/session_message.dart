import 'package:cloud_firestore/cloud_firestore.dart';

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
  final String type; // 'image' ou 'pdf'
  final String url;
  final String filename;
  final int size;

  MessageAttachment({
    required this.type,
    required this.url,
    required this.filename,
    required this.size,
  });

  factory MessageAttachment.fromMap(Map<String, dynamic> map) {
    return MessageAttachment(
      type: map['type'] ?? 'image',
      url: map['url'] ?? '',
      filename: map['filename'] ?? '',
      size: map['size'] ?? 0,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'type': type,
      'url': url,
      'filename': filename,
      'size': size,
    };
  }

  bool get isImage => type == 'image';
  bool get isPdf => type == 'pdf';
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
  final List<String> readBy;
  final DateTime createdAt;

  SessionMessage({
    required this.id,
    required this.senderId,
    required this.senderName,
    required this.message,
    required this.groupType,
    this.groupLevel,
    this.attachments = const [],
    this.readBy = const [],
    required this.createdAt,
  });

  factory SessionMessage.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    return SessionMessage(
      id: doc.id,
      senderId: data['sender_id'] ?? '',
      senderName: data['sender_name'] ?? '',
      message: data['message'] ?? '',
      groupType: SessionGroupTypeExtension.fromString(data['group_type'] ?? 'encadrants'),
      groupLevel: data['group_level'],
      attachments: (data['attachments'] as List<dynamic>?)
              ?.map((a) => MessageAttachment.fromMap(a as Map<String, dynamic>))
              .toList() ??
          [],
      readBy: List<String>.from(data['read_by'] ?? []),
      createdAt: (data['created_at'] as Timestamp?)?.toDate() ?? DateTime.now(),
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
      'read_by': readBy,
      'created_at': Timestamp.fromDate(createdAt),
    };
  }

  /// Formater l'heure pour l'affichage
  String get formattedTime {
    final hour = createdAt.hour.toString().padLeft(2, '0');
    final minute = createdAt.minute.toString().padLeft(2, '0');
    return '$hour:$minute';
  }

  /// Vérifier si le message a été lu par un utilisateur
  bool isReadBy(String userId) => readBy.contains(userId);

  /// Copie avec modifications
  SessionMessage copyWith({
    String? id,
    String? senderId,
    String? senderName,
    String? message,
    SessionGroupType? groupType,
    String? groupLevel,
    List<MessageAttachment>? attachments,
    List<String>? readBy,
    DateTime? createdAt,
  }) {
    return SessionMessage(
      id: id ?? this.id,
      senderId: senderId ?? this.senderId,
      senderName: senderName ?? this.senderName,
      message: message ?? this.message,
      groupType: groupType ?? this.groupType,
      groupLevel: groupLevel ?? this.groupLevel,
      attachments: attachments ?? this.attachments,
      readBy: readBy ?? this.readBy,
      createdAt: createdAt ?? this.createdAt,
    );
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
