import 'dart:io';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:path/path.dart' as path;
import '../models/team_channel.dart';

/// Service pour la gestion des canaux d'équipe permanents
class TeamChannelService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseStorage _storage = FirebaseStorage.instance;

  /// Référence à la collection de canaux
  CollectionReference<Map<String, dynamic>> _channelsCollection(String clubId) {
    return _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('team_channels');
  }

  /// Référence à la collection de messages d'un canal
  CollectionReference<Map<String, dynamic>> _messagesCollection(
      String clubId, String channelId) {
    return _channelsCollection(clubId)
        .doc(channelId)
        .collection('messages');
  }

  /// Obtenir ou créer un canal par type
  Future<TeamChannel> getOrCreateChannel(
      String clubId, TeamChannelType type) async {
    final channelId = type.id;
    final docRef = _channelsCollection(clubId).doc(channelId);
    final doc = await docRef.get();

    if (doc.exists) {
      return TeamChannel.fromFirestore(doc);
    }

    // Créer le canal s'il n'existe pas
    final channel = TeamChannel.defaultForType(type);
    await docRef.set(channel.toFirestore());

    return channel;
  }

  /// Stream des canaux disponibles pour un utilisateur
  Stream<List<TeamChannel>> getChannelsForUser(
      String clubId, List<String> userRoles) {
    // Filtrer les types de canaux basés sur les rôles de l'utilisateur
    final availableTypes = <TeamChannelType>[];

    if (userRoles.contains('accueil') || userRoles.contains('Accueil')) {
      availableTypes.add(TeamChannelType.accueil);
    }

    if (userRoles.contains('encadrant') || userRoles.contains('Encadrant')) {
      availableTypes.add(TeamChannelType.encadrants);
    }

    if (userRoles.contains('gonflage') || userRoles.contains('Gonflage')) {
      availableTypes.add(TeamChannelType.gonflage);
    }

    if (availableTypes.isEmpty) {
      return Stream.value([]);
    }

    // Récupérer les canaux correspondants
    return _channelsCollection(clubId)
        .where('type', whereIn: availableTypes.map((t) => t.value).toList())
        .snapshots()
        .map((snapshot) {
      final channels = snapshot.docs
          .map((doc) => TeamChannel.fromFirestore(doc))
          .toList();

      // Ajouter les canaux manquants
      for (final type in availableTypes) {
        if (!channels.any((c) => c.type == type)) {
          channels.add(TeamChannel.defaultForType(type));
        }
      }

      return channels;
    });
  }

  /// Stream de messages pour un canal
  Stream<List<TeamMessage>> getMessages(String clubId, String channelId) {
    return _messagesCollection(clubId, channelId)
        .orderBy('created_at', descending: false)
        .snapshots()
        .map((snapshot) => snapshot.docs
            .map((doc) => TeamMessage.fromFirestore(doc))
            .toList());
  }

  /// Envoyer un message
  Future<String> sendMessage({
    required String clubId,
    required String channelId,
    required String senderId,
    required String senderName,
    required String message,
    List<TeamMessageAttachment>? attachments,
  }) async {
    // S'assurer que le canal existe
    await _channelsCollection(clubId).doc(channelId).get().then((doc) async {
      if (!doc.exists) {
        // Déterminer le type basé sur l'ID
        TeamChannelType type;
        if (channelId == 'equipe_accueil') {
          type = TeamChannelType.accueil;
        } else if (channelId == 'equipe_gonflage') {
          type = TeamChannelType.gonflage;
        } else {
          type = TeamChannelType.encadrants;
        }
        await getOrCreateChannel(clubId, type);
      }
    });

    final messageData = TeamMessage(
      id: '',
      senderId: senderId,
      senderName: senderName,
      message: message,
      attachments: attachments ?? [],
      readBy: [senderId],
      createdAt: DateTime.now(),
    );

    final docRef = await _messagesCollection(clubId, channelId)
        .add(messageData.toFirestore());

    return docRef.id;
  }

  /// Marquer un message comme lu
  Future<void> markAsRead({
    required String clubId,
    required String channelId,
    required String messageId,
    required String userId,
  }) async {
    await _messagesCollection(clubId, channelId).doc(messageId).update({
      'read_by': FieldValue.arrayUnion([userId]),
    });
  }

  /// Marquer tous les messages comme lus
  Future<void> markAllAsRead({
    required String clubId,
    required String channelId,
    required String userId,
  }) async {
    final snapshot = await _messagesCollection(clubId, channelId).get();

    final batch = _firestore.batch();
    for (final doc in snapshot.docs) {
      final readBy = List<String>.from(doc.data()['read_by'] ?? []);
      if (!readBy.contains(userId)) {
        batch.update(doc.reference, {
          'read_by': FieldValue.arrayUnion([userId]),
        });
      }
    }

    await batch.commit();
  }

  /// Compter les messages non lus
  Future<int> getUnreadCount({
    required String clubId,
    required String channelId,
    required String userId,
  }) async {
    final snapshot = await _messagesCollection(clubId, channelId).get();

    return snapshot.docs.where((doc) {
      final readBy = List<String>.from(doc.data()['read_by'] ?? []);
      return !readBy.contains(userId);
    }).length;
  }

  /// Stream du nombre de messages non lus pour un canal
  Stream<int> getUnreadCountStream({
    required String clubId,
    required String channelId,
    required String userId,
  }) {
    return _messagesCollection(clubId, channelId)
        .snapshots()
        .map((snapshot) {
      return snapshot.docs.where((doc) {
        final readBy = List<String>.from(doc.data()['read_by'] ?? []);
        return !readBy.contains(userId);
      }).length;
    });
  }

  /// Stream du nombre de messages non lus pour tous les canaux
  Stream<Map<String, int>> getAllUnreadCountsStream({
    required String clubId,
    required String userId,
    required List<TeamChannel> channels,
  }) {
    if (channels.isEmpty) {
      return Stream.value({});
    }

    // Combiner les streams de tous les canaux
    final streams = channels.map((channel) {
      return getUnreadCountStream(
        clubId: clubId,
        channelId: channel.id,
        userId: userId,
      ).map((count) => MapEntry(channel.id, count));
    });

    return Stream.periodic(const Duration(seconds: 1)).asyncMap((_) async {
      final counts = <String, int>{};
      for (final channel in channels) {
        counts[channel.id] = await getUnreadCount(
          clubId: clubId,
          channelId: channel.id,
          userId: userId,
        );
      }
      return counts;
    });
  }

  /// Upload une pièce jointe
  Future<TeamMessageAttachment> uploadAttachment({
    required String clubId,
    required String channelId,
    required File file,
    required String type,
  }) async {
    final filename = path.basename(file.path);
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final storagePath =
        'clubs/$clubId/team_channels/$channelId/attachments/${timestamp}_$filename';

    final ref = _storage.ref().child(storagePath);
    await ref.putFile(file);

    final url = await ref.getDownloadURL();
    final fileSize = await file.length();

    return TeamMessageAttachment(
      type: type,
      url: url,
      filename: filename,
      size: fileSize,
    );
  }
}
