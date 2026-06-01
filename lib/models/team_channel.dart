import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
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
  formation1,
  formation2,
  formation3,
  formation4,
  formationAM,
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
      case TeamChannelType.formation1:
        return 'formation_1_etoile';
      case TeamChannelType.formation2:
        return 'formation_2_etoiles';
      case TeamChannelType.formation3:
        return 'formation_3_etoiles';
      case TeamChannelType.formation4:
        return 'formation_4_etoiles';
      case TeamChannelType.formationAM:
        return 'formation_AM';
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
      case TeamChannelType.formation1:
        return 'formation_1_etoile';
      case TeamChannelType.formation2:
        return 'formation_2_etoiles';
      case TeamChannelType.formation3:
        return 'formation_3_etoiles';
      case TeamChannelType.formation4:
        return 'formation_4_etoiles';
      case TeamChannelType.formationAM:
        return 'formation_AM';
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
      case 'formation_1_etoile':
        return TeamChannelType.formation1;
      case 'formation_2_etoiles':
        return TeamChannelType.formation2;
      case 'formation_3_etoiles':
        return TeamChannelType.formation3;
      case 'formation_4_etoiles':
        return TeamChannelType.formation4;
      case 'formation_AM':
        return TeamChannelType.formationAM;
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
      case TeamChannelType.formation1:
        return 'Formation 1*';
      case TeamChannelType.formation2:
        return 'Formation 2*';
      case TeamChannelType.formation3:
        return 'Formation 3*';
      case TeamChannelType.formation4:
        return 'Formation 4*';
      case TeamChannelType.formationAM:
        return 'Formation AM';
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
      case TeamChannelType.formation1:
        return 'Discussion permanente pour les NB et débutants qui préparent le 1*';
      case TeamChannelType.formation2:
        return 'Discussion permanente pour les 1* qui préparent le 2*';
      case TeamChannelType.formation3:
        return 'Discussion permanente pour les 2* qui préparent le 3*';
      case TeamChannelType.formation4:
        return 'Discussion permanente pour les 3* qui préparent le 4*';
      case TeamChannelType.formationAM:
        return 'Discussion permanente pour les 4* qui préparent AM';
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
      case TeamChannelType.formation1:
        return '⭐';
      case TeamChannelType.formation2:
        return '⭐⭐';
      case TeamChannelType.formation3:
        return '⭐⭐⭐';
      case TeamChannelType.formation4:
        return '⭐⭐⭐⭐';
      case TeamChannelType.formationAM:
        return '🧭';
    }
  }

  IconData get iconData {
    switch (this) {
      case TeamChannelType.general:
        return Icons.chat_bubble_outline_rounded;
      case TeamChannelType.ca:
        return Icons.badge_outlined;
      case TeamChannelType.accueil:
        return Icons.qr_code_scanner_rounded;
      case TeamChannelType.encadrants:
        return Icons.school_outlined;
      case TeamChannelType.gonflage:
        return Icons.air_rounded;
      case TeamChannelType.bureau:
        return Icons.assignment_outlined;
      case TeamChannelType.formation1:
        return Icons.looks_one_outlined;
      case TeamChannelType.formation2:
        return Icons.looks_two_outlined;
      case TeamChannelType.formation3:
        return Icons.looks_3_outlined;
      case TeamChannelType.formation4:
        return Icons.looks_4_outlined;
      case TeamChannelType.formationAM:
        return Icons.explore_outlined;
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
  final DateTime? editedAt;

  TeamMessage({
    required this.id,
    required this.senderId,
    required this.senderName,
    required this.message,
    this.attachments = const [],
    this.reactions = const {},
    this.poll,
    required this.createdAt,
    this.editedAt,
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
      editedAt: (data['edited_at'] as Timestamp?)?.toDate(),
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
      if (editedAt != null) 'edited_at': Timestamp.fromDate(editedAt!),
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
