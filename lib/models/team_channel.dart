import 'package:cloud_firestore/cloud_firestore.dart';

/// Types de canaux d'équipe
enum TeamChannelType {
  accueil,
  encadrants,
  gonflage,
}

extension TeamChannelTypeExtension on TeamChannelType {
  String get value {
    switch (this) {
      case TeamChannelType.accueil:
        return 'accueil';
      case TeamChannelType.encadrants:
        return 'encadrants';
      case TeamChannelType.gonflage:
        return 'gonflage';
    }
  }

  String get id {
    switch (this) {
      case TeamChannelType.accueil:
        return 'equipe_accueil';
      case TeamChannelType.encadrants:
        return 'equipe_encadrants';
      case TeamChannelType.gonflage:
        return 'equipe_gonflage';
    }
  }

  static TeamChannelType fromString(String value) {
    switch (value) {
      case 'accueil':
        return TeamChannelType.accueil;
      case 'encadrants':
        return TeamChannelType.encadrants;
      case 'gonflage':
        return TeamChannelType.gonflage;
      default:
        return TeamChannelType.encadrants;
    }
  }

  String get displayName {
    switch (this) {
      case TeamChannelType.accueil:
        return 'Équipe Accueil';
      case TeamChannelType.encadrants:
        return 'Équipe Encadrants';
      case TeamChannelType.gonflage:
        return 'Équipe Gonflage';
    }
  }

  String get description {
    switch (this) {
      case TeamChannelType.accueil:
        return 'Discussion permanente pour l\'équipe d\'accueil piscine';
      case TeamChannelType.encadrants:
        return 'Discussion permanente pour tous les encadrants';
      case TeamChannelType.gonflage:
        return 'Discussion permanente pour l\'équipe gonflage';
    }
  }

  String get icon {
    switch (this) {
      case TeamChannelType.accueil:
        return '🎫';
      case TeamChannelType.encadrants:
        return '🎓';
      case TeamChannelType.gonflage:
        return '🎈';
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
  final DateTime createdAt;

  TeamMessage({
    required this.id,
    required this.senderId,
    required this.senderName,
    required this.message,
    this.attachments = const [],
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
              ?.map((a) => TeamMessageAttachment.fromMap(a as Map<String, dynamic>))
              .toList() ??
          [],
      createdAt: (data['created_at'] as Timestamp?)?.toDate() ?? DateTime.now(),
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'sender_id': senderId,
      'sender_name': senderName,
      'message': message,
      'attachments': attachments.map((a) => a.toMap()).toList(),
      'created_at': Timestamp.fromDate(createdAt),
    };
  }

  /// Formater l'heure pour l'affichage
  String get formattedTime {
    final hour = createdAt.hour.toString().padLeft(2, '0');
    final minute = createdAt.minute.toString().padLeft(2, '0');
    return '$hour:$minute';
  }

}

/// Pièce jointe dans un message d'équipe
class TeamMessageAttachment {
  final String type;
  final String url;
  final String filename;
  final int size;

  TeamMessageAttachment({
    required this.type,
    required this.url,
    required this.filename,
    required this.size,
  });

  factory TeamMessageAttachment.fromMap(Map<String, dynamic> map) {
    return TeamMessageAttachment(
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
}
