import 'package:cloud_firestore/cloud_firestore.dart';
import 'poll.dart';
import 'session_message.dart' show MessageAttachment;

/// Types de canaux d'équipe
enum TeamChannelType {
  general,
  ca,
  accueil,
  encadrants,
  gonflage,
  bureau,
}

extension TeamChannelTypeExtension on TeamChannelType {
  String get value {
    switch (this) {
      case TeamChannelType.general:
        return 'general';
      case TeamChannelType.ca:
        return 'ca';
      case TeamChannelType.accueil:
        return 'accueil';
      case TeamChannelType.encadrants:
        return 'encadrants';
      case TeamChannelType.gonflage:
        return 'gonflage';
      case TeamChannelType.bureau:
        return 'bureau';
    }
  }

  String get id {
    switch (this) {
      case TeamChannelType.general:
        return 'general';
      case TeamChannelType.ca:
        return 'equipe_ca';
      case TeamChannelType.accueil:
        return 'equipe_accueil';
      case TeamChannelType.encadrants:
        return 'equipe_encadrants';
      case TeamChannelType.gonflage:
        return 'equipe_gonflage';
      case TeamChannelType.bureau:
        return 'bureau';
    }
  }

  static TeamChannelType fromString(String value) {
    switch (value) {
      case 'general':
        return TeamChannelType.general;
      case 'ca':
        return TeamChannelType.ca;
      case 'accueil':
        return TeamChannelType.accueil;
      case 'encadrants':
        return TeamChannelType.encadrants;
      case 'gonflage':
        return TeamChannelType.gonflage;
      case 'bureau':
        return TeamChannelType.bureau;
      default:
        return TeamChannelType.encadrants;
    }
  }

  String get displayName {
    switch (this) {
      case TeamChannelType.general:
        return 'General';
      case TeamChannelType.ca:
        return 'CA';
      case TeamChannelType.accueil:
        return 'Équipe Accueil';
      case TeamChannelType.encadrants:
        return 'Équipe Encadrants';
      case TeamChannelType.gonflage:
        return 'Équipe Gonflage';
      case TeamChannelType.bureau:
        return 'Bureau';
    }
  }

  String get description {
    switch (this) {
      case TeamChannelType.general:
        return 'Discussion libre pour tous les membres du club';
      case TeamChannelType.ca:
        return 'Discussion permanente pour les membres du conseil d\'administration';
      case TeamChannelType.accueil:
        return 'Discussion permanente pour l\'équipe d\'accueil piscine';
      case TeamChannelType.encadrants:
        return 'Discussion permanente pour tous les encadrants';
      case TeamChannelType.gonflage:
        return 'Discussion permanente pour l\'équipe gonflage';
      case TeamChannelType.bureau:
        return 'Discussion permanente pour les signataires et la coordination financière';
    }
  }

  String get icon {
    switch (this) {
      case TeamChannelType.general:
        return '💬';
      case TeamChannelType.ca:
        return '👔';
      case TeamChannelType.accueil:
        return '🎫';
      case TeamChannelType.encadrants:
        return '🎓';
      case TeamChannelType.gonflage:
        return '🎈';
      case TeamChannelType.bureau:
        return '📋';
    }
  }
}

/// Canal d'équipe permanent
class TeamChannel {
  final String id;
  final String name;
  final TeamChannelType type;
  final String? description;
  final DateTime createdAt;

  TeamChannel({
    required this.id,
    required this.name,
    required this.type,
    this.description,
    required this.createdAt,
  });

  factory TeamChannel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    return TeamChannel(
      id: doc.id,
      name: data['name'] ?? '',
      type: TeamChannelTypeExtension.fromString(data['type'] ?? 'encadrants'),
      description: data['description'],
      createdAt: (data['created_at'] as Timestamp?)?.toDate() ?? DateTime.now(),
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'name': name,
      'type': type.value,
      if (description != null) 'description': description,
      'created_at': Timestamp.fromDate(createdAt),
    };
  }

  /// Créer un canal par défaut pour un type
  factory TeamChannel.defaultForType(TeamChannelType type) {
    return TeamChannel(
      id: type.id,
      name: type.displayName,
      type: type,
      description: type.description,
      createdAt: DateTime.now(),
    );
  }
}

/// Message dans un canal d'équipe
class TeamMessage {
  final String id;
  final String senderId;
  final String senderName;
  final String message;
  final List<TeamMessageAttachment> attachments;
  final Map<String, List<String>> reactions;
  final Poll? poll;
  final DateTime createdAt;

  TeamMessage({
    required this.id,
    required this.senderId,
    required this.senderName,
    required this.message,
    this.attachments = const [],
    this.reactions = const {},
    this.poll,
    required this.createdAt,
  });

  factory TeamMessage.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    return TeamMessage(
      id: doc.id,
      senderId: data['sender_id'] ?? '',
      senderName: data['sender_name'] ?? '',
      message: data['message'] ?? '',
      attachments: (data['attachments'] as List<dynamic>?)
              ?.map((a) =>
                  TeamMessageAttachment.fromMap(a as Map<String, dynamic>))
              .toList() ??
          [],
      reactions: _parseReactions(data['reactions']),
      poll: data['poll'] != null
          ? Poll.fromMap(data['poll'] as Map<String, dynamic>)
          : null,
      createdAt: (data['created_at'] as Timestamp?)?.toDate() ?? DateTime.now(),
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'sender_id': senderId,
      'sender_name': senderName,
      'message': message,
      'attachments': attachments.map((a) => a.toMap()).toList(),
      if (reactions.isNotEmpty) 'reactions': reactions,
      if (poll != null) 'poll': poll!.toMap(),
      'created_at': Timestamp.fromDate(createdAt),
    };
  }

  /// Formater l'heure pour l'affichage
  String get formattedTime {
    final hour = createdAt.hour.toString().padLeft(2, '0');
    final minute = createdAt.minute.toString().padLeft(2, '0');
    return '$hour:$minute';
  }

  bool get hasAttachments => attachments.isNotEmpty;
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

/// Pièce jointe dans un message d'équipe
class TeamMessageAttachment extends MessageAttachment {
  TeamMessageAttachment({
    required super.type,
    required super.url,
    required super.filename,
    required super.size,
    super.storagePath,
  });

  factory TeamMessageAttachment.fromMap(Map<String, dynamic> map) {
    return TeamMessageAttachment(
      type: map['type'] ?? 'image',
      url: map['url'] ?? '',
      filename: map['filename'] ?? '',
      size: map['size'] ?? 0,
      storagePath: map['storage_path'],
    );
  }
}
