import 'package:cloud_firestore/cloud_firestore.dart';
import 'session_message.dart' show MessageAttachment;

/// Type d'annonce
enum AnnouncementType {
  info,
  warning,
  urgent,
}

/// Optional v1 visibility field. Legacy announcements do not have it yet.
enum AnnouncementVisibility { published, deleted }

/// Modèle pour les annonces du club
class Announcement {
  final String id;
  final String title;
  final String message;
  final String senderId;
  final String senderName;
  final AnnouncementType type;
  final DateTime createdAt;
  final List<MessageAttachment> attachments;
  final int replyCount;
  final DateTime? deletedAt;
  final String? deletedBy;
  final AnnouncementVisibility? visibility;
  final DateTime? lastActivityAt;

  Announcement({
    required this.id,
    required this.title,
    required this.message,
    required this.senderId,
    required this.senderName,
    required this.type,
    required this.createdAt,
    this.attachments = const [],
    this.replyCount = 0,
    this.deletedAt,
    this.deletedBy,
    this.visibility,
    this.lastActivityAt,
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
      createdAt: data['created_at'] != null
          ? (data['created_at'] as Timestamp).toDate()
          : DateTime.now(),
      attachments: (data['attachments'] as List<dynamic>?)
              ?.map((a) => MessageAttachment.fromMap(a as Map<String, dynamic>))
              .toList() ??
          [],
      replyCount: data['reply_count'] ?? 0,
      deletedAt: data['deleted_at'] != null
          ? (data['deleted_at'] as Timestamp).toDate()
          : null,
      deletedBy: data['deleted_by'] as String?,
      visibility: _parseVisibility(data['visibility']),
      lastActivityAt: data['last_activity_at'] is Timestamp
          ? (data['last_activity_at'] as Timestamp).toDate()
          : null,
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
      if (attachments.isNotEmpty)
        'attachments': attachments.map((a) => a.toMap()).toList(),
      'reply_count': replyCount,
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

  static AnnouncementVisibility? _parseVisibility(dynamic visibility) {
    switch (visibility) {
      case 'published':
        return AnnouncementVisibility.published;
      case 'deleted':
        return AnnouncementVisibility.deleted;
      default:
        return null;
    }
  }

  /// Copier avec modifications
  Announcement copyWith({
    String? title,
    String? message,
    AnnouncementType? type,
    List<MessageAttachment>? attachments,
    int? replyCount,
    DateTime? deletedAt,
    String? deletedBy,
    AnnouncementVisibility? visibility,
    DateTime? lastActivityAt,
  }) {
    return Announcement(
      id: id,
      title: title ?? this.title,
      message: message ?? this.message,
      senderId: senderId,
      senderName: senderName,
      type: type ?? this.type,
      createdAt: createdAt,
      attachments: attachments ?? this.attachments,
      replyCount: replyCount ?? this.replyCount,
      deletedAt: deletedAt ?? this.deletedAt,
      deletedBy: deletedBy ?? this.deletedBy,
      visibility: visibility ?? this.visibility,
      lastActivityAt: lastActivityAt ?? this.lastActivityAt,
    );
  }

  /// Is soft-deleted
  bool get isDeleted => deletedAt != null;

  /// A des pièces jointes
  bool get hasAttachments => attachments.isNotEmpty;

  /// A des réponses
  bool get hasReplies => replyCount > 0;
}
