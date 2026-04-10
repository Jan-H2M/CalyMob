import 'dart:io';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:path/path.dart' as path;
import '../models/poll.dart';
import '../models/team_channel.dart';
import '../services/local_read_tracker.dart';
import '../utils/club_role_utils.dart';

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
    return _channelsCollection(clubId).doc(channelId).collection('messages');
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
      String clubId, List<String> userRoles,
      {bool includeAllChannels = false}) {
    final availableTypes = ClubRoleUtils.getVisibleTeamChannelTypes(
      userRoles,
      includeAllChannels: includeAllChannels,
    );

    // Récupérer les canaux correspondants
    return _channelsCollection(clubId)
        .where('type', whereIn: availableTypes.map((t) => t.value).toList())
        .snapshots()
        .map((snapshot) {
      final channels =
          snapshot.docs.map((doc) => TeamChannel.fromFirestore(doc)).toList();

      // Ajouter les canaux manquants
      for (final type in availableTypes) {
        if (!channels.any((c) => c.type == type)) {
          channels.add(TeamChannel.defaultForType(type));
        }
      }

      channels.sort((a, b) => TeamChannelType.values
          .indexOf(a.type)
          .compareTo(TeamChannelType.values.indexOf(b.type)));

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
    Poll? poll,
  }) async {
    // S'assurer que le canal existe
    await _channelsCollection(clubId).doc(channelId).get().then((doc) async {
      if (!doc.exists) {
        // Déterminer le type basé sur l'ID
        TeamChannelType type;
        if (channelId == TeamChannelType.general.id) {
          type = TeamChannelType.general;
        } else if (channelId == TeamChannelType.ca.id) {
          type = TeamChannelType.ca;
        } else if (channelId == 'equipe_accueil') {
          type = TeamChannelType.accueil;
        } else if (channelId == 'equipe_gonflage') {
          type = TeamChannelType.gonflage;
        } else if (channelId == TeamChannelType.bureau.id) {
          type = TeamChannelType.bureau;
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
      poll: poll,
      createdAt: DateTime.now(),
    );

    final docRef = await _messagesCollection(clubId, channelId)
        .add(messageData.toFirestore());

    return docRef.id;
  }

  // markAsRead, markAllAsRead, getUnreadCount, getUnreadCountStream, getAllUnreadCountsStream verwijderd
  // → read tracking gaat nu via LocalReadTracker + UnreadCountService

  Future<int> countUnreadForChannel(String clubId, String channelId) async {
    final tracker = LocalReadTracker();
    await tracker.init();
    final lastRead = tracker.getLastRead('team_$channelId') ??
        tracker.installBaseline ??
        DateTime(2024, 1, 1);

    final snapshot = await _messagesCollection(clubId, channelId)
        .where('created_at', isGreaterThan: Timestamp.fromDate(lastRead))
        .count()
        .get();

    return snapshot.count ?? 0;
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
      storagePath: storagePath,
    );
  }

  Future<void> toggleReaction({
    required String clubId,
    required String channelId,
    required String messageId,
    required String emoji,
    required String userId,
  }) async {
    final messageRef = _messagesCollection(clubId, channelId).doc(messageId);

    await _firestore.runTransaction((transaction) async {
      final snapshot = await transaction.get(messageRef);
      if (!snapshot.exists) return;

      final message = TeamMessage.fromFirestore(snapshot);
      final reactions = message.reactions.map(
        (key, value) => MapEntry(key, List<String>.from(value)),
      );
      final users = List<String>.from(reactions[emoji] ?? const []);

      if (users.contains(userId)) {
        users.remove(userId);
      } else {
        users.add(userId);
      }

      if (users.isEmpty) {
        reactions.remove(emoji);
      } else {
        reactions[emoji] = users;
      }

      transaction.update(messageRef, {'reactions': reactions});
    });
  }

  Future<void> togglePollVote({
    required String clubId,
    required String channelId,
    required String messageId,
    required String optionId,
    required String userId,
  }) async {
    final messageRef = _messagesCollection(clubId, channelId).doc(messageId);

    await _firestore.runTransaction((transaction) async {
      final snapshot = await transaction.get(messageRef);
      if (!snapshot.exists) return;

      final message = TeamMessage.fromFirestore(snapshot);
      final poll = message.poll;
      if (poll == null || poll.isClosed) return;

      final options = poll.options
          .map((option) =>
              option.copyWith(votes: List<String>.from(option.votes)))
          .toList();
      final selectedIndex =
          options.indexWhere((option) => option.id == optionId);
      if (selectedIndex == -1) return;

      final hasSelectedOption = options[selectedIndex].votes.contains(userId);

      if (!poll.allowMultiple) {
        for (var i = 0; i < options.length; i++) {
          final updatedVotes = List<String>.from(options[i].votes)
            ..remove(userId);
          options[i] = options[i].copyWith(votes: updatedVotes);
        }
        if (!hasSelectedOption) {
          final updatedVotes = List<String>.from(options[selectedIndex].votes)
            ..add(userId);
          options[selectedIndex] =
              options[selectedIndex].copyWith(votes: updatedVotes);
        }
      } else {
        final updatedVotes = List<String>.from(options[selectedIndex].votes);
        if (hasSelectedOption) {
          updatedVotes.remove(userId);
        } else {
          updatedVotes.add(userId);
        }
        options[selectedIndex] =
            options[selectedIndex].copyWith(votes: updatedVotes);
      }

      transaction.update(
          messageRef, {'poll': poll.copyWith(options: options).toMap()});
    });
  }

  Future<void> closePoll({
    required String clubId,
    required String channelId,
    required String messageId,
  }) async {
    final messageRef = _messagesCollection(clubId, channelId).doc(messageId);

    await _firestore.runTransaction((transaction) async {
      final snapshot = await transaction.get(messageRef);
      if (!snapshot.exists) return;

      final message = TeamMessage.fromFirestore(snapshot);
      final poll = message.poll;
      if (poll == null || poll.isClosed) return;

      transaction.update(messageRef, {
        'poll': poll.copyWith(closedAt: DateTime.now()).toMap(),
      });
    });
  }

  Future<void> deleteMessage({
    required String clubId,
    required String channelId,
    required String messageId,
  }) async {
    await _messagesCollection(clubId, channelId).doc(messageId).delete();
  }
}
