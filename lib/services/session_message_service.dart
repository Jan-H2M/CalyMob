import 'dart:io';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:path/path.dart' as path;
import '../models/poll.dart';
import '../models/session_message.dart';
import '../models/piscine_session.dart';

/// Service pour la gestion des messages de session piscine
class SessionMessageService {
  final FirebaseFirestore _firestore;
  final FirebaseStorage _storage;
  final FirebaseFunctions _functions;
  final Map<String, Future<void>> _aclReadiness = <String, Future<void>>{};

  SessionMessageService({
    FirebaseFirestore? firestore,
    FirebaseStorage? storage,
    FirebaseFunctions? functions,
  })  : _firestore = firestore ?? FirebaseFirestore.instance,
        _storage = storage ?? FirebaseStorage.instance,
        _functions =
            functions ?? FirebaseFunctions.instanceFor(region: 'europe-west1');

  /// Référence à la collection de messages pour une session
  CollectionReference<Map<String, dynamic>> _messagesCollection(
      String clubId, String sessionId) {
    return _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('piscine_sessions')
        .doc(sessionId)
        .collection('messages');
  }

  /// Stream de messages pour un groupe spécifique
  Stream<List<SessionMessage>> getMessages({
    required String clubId,
    required String sessionId,
    required SessionGroupType groupType,
    String? groupLevel,
  }) {
    Query<Map<String, dynamic>> query = _messagesCollection(clubId, sessionId)
        .where('group_type', isEqualTo: groupType.value);

    if (groupType == SessionGroupType.niveau && groupLevel != null) {
      query = query.where('group_level', isEqualTo: groupLevel);
    }

    return Stream<void>.fromFuture(_ensureChatAcl(clubId, sessionId))
        .asyncExpand(
          (_) => query.orderBy('created_at', descending: false).snapshots(),
        )
        .map((snapshot) => snapshot.docs
            .map((doc) => SessionMessage.fromFirestore(doc))
            .toList());
  }

  /// Envoyer un message
  Future<String> sendMessage({
    required String clubId,
    required String sessionId,
    required String senderId,
    required String senderName,
    required String message,
    required SessionGroupType groupType,
    String? groupLevel,
    List<MessageAttachment>? attachments,
    Poll? poll,
  }) async {
    await _ensureChatAcl(clubId, sessionId);
    final messageData = SessionMessage(
      id: '',
      senderId: senderId,
      senderName: senderName,
      message: message,
      groupType: groupType,
      groupLevel: groupLevel,
      attachments: attachments ?? [],
      poll: poll,
      createdAt: DateTime.now(),
    );

    final docRef = await _messagesCollection(clubId, sessionId).add({
      ...messageData.toFirestore(),
      'created_at': FieldValue.serverTimestamp(),
      'unread_created_at': FieldValue.serverTimestamp(),
    });

    return docRef.id;
  }

  Future<void> _ensureChatAcl(String clubId, String sessionId) {
    final key = '$clubId\u0000$sessionId';
    final existing = _aclReadiness[key];
    if (existing != null) return existing;
    late final Future<void> readiness;
    readiness = _functions
        .httpsCallable('ensurePiscineSessionChatAcl')
        .call(<String, Object>{'clubId': clubId, 'sessionId': sessionId}).then<
            void>((result) {
      if (result.data is! Map ||
          !{'ready', 'repaired'}.contains((result.data as Map)['status'])) {
        throw StateError('Session chat access could not be prepared.');
      }
    }).catchError((Object error, StackTrace stackTrace) {
      if (identical(_aclReadiness[key], readiness)) {
        _aclReadiness.remove(key);
      }
      Error.throwWithStackTrace(error, stackTrace);
    });
    _aclReadiness[key] = readiness;
    return readiness;
  }

  // markAsRead, markAllAsRead, getUnreadCount verwijderd
  // → read tracking gaat nu via LocalReadTracker + UnreadCountService

  /// Upload une pièce jointe et retourner l'URL
  Future<MessageAttachment> uploadAttachment({
    required String clubId,
    required String sessionId,
    required File file,
    required String type, // 'image' ou 'pdf'
  }) async {
    final filename = path.basename(file.path);
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final storagePath =
        'clubs/$clubId/piscine_sessions/$sessionId/attachments/${timestamp}_$filename';

    final ref = _storage.ref().child(storagePath);
    await ref.putFile(file);

    final url = await ref.getDownloadURL();
    final fileSize = await file.length();

    return MessageAttachment(
      type: type,
      url: url,
      filename: filename,
      size: fileSize,
      storagePath: storagePath,
    );
  }

  Future<void> toggleReaction({
    required String clubId,
    required String sessionId,
    required String messageId,
    required String emoji,
    required String userId,
  }) async {
    final messageRef = _messagesCollection(clubId, sessionId).doc(messageId);

    await _firestore.runTransaction((transaction) async {
      final snapshot = await transaction.get(messageRef);
      if (!snapshot.exists) return;

      final message = SessionMessage.fromFirestore(snapshot);
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
    required String sessionId,
    required String messageId,
    required String optionId,
    required String userId,
  }) async {
    final messageRef = _messagesCollection(clubId, sessionId).doc(messageId);

    await _firestore.runTransaction((transaction) async {
      final snapshot = await transaction.get(messageRef);
      if (!snapshot.exists) return;

      final message = SessionMessage.fromFirestore(snapshot);
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

      transaction.update(messageRef, {
        'poll': poll.copyWith(options: options).toMap(),
      });
    });
  }

  Future<void> closePoll({
    required String clubId,
    required String sessionId,
    required String messageId,
  }) async {
    final messageRef = _messagesCollection(clubId, sessionId).doc(messageId);

    await _firestore.runTransaction((transaction) async {
      final snapshot = await transaction.get(messageRef);
      if (!snapshot.exists) return;

      final message = SessionMessage.fromFirestore(snapshot);
      final poll = message.poll;
      if (poll == null || poll.isClosed) return;

      transaction.update(messageRef, {
        'poll': poll.copyWith(closedAt: DateTime.now()).toMap(),
      });
    });
  }

  Future<void> deleteMessage({
    required String clubId,
    required String sessionId,
    required String messageId,
  }) async {
    await _messagesCollection(clubId, sessionId).doc(messageId).delete();
  }

  /// Modifier un message existant (auteur uniquement).
  Future<void> updateMessage({
    required String clubId,
    required String sessionId,
    required String messageId,
    required String newText,
    required List<MessageAttachment> attachments,
    List<MessageAttachment> removedAttachments = const [],
  }) async {
    await _messagesCollection(clubId, sessionId).doc(messageId).update({
      'message': newText,
      'attachments': attachments.map((a) => a.toMap()).toList(),
      'edited_at': Timestamp.fromDate(DateTime.now()),
    });

    for (final removed in removedAttachments) {
      final p = removed.storagePath;
      if (p == null || p.isEmpty) continue;
      try {
        await _storage.ref().child(p).delete();
      } catch (_) {
        // Best effort — storage cleanup mag de update niet blokkeren.
      }
    }
  }

  /// Obtenir les groupes de chat disponibles pour un utilisateur dans une session
  List<SessionChatGroup> getAvailableGroups({
    required PiscineSession session,
    required String userId,
  }) =>
      availableGroupsForMember(session: session, userId: userId);

  static List<SessionChatGroup> availableGroupsForMember({
    required PiscineSession session,
    required String userId,
  }) {
    final groups = <SessionChatGroup>[];

    // Vérifier si l'utilisateur est dans l'équipe accueil
    if (session.isAccueil(userId)) {
      groups.add(SessionChatGroup(
        type: SessionGroupType.accueil,
        displayName: 'Équipe Accueil',
      ));
    }

    // Vérifier si l'utilisateur est encadrant (tous les encadrants ont accès au chat encadrants)
    final isAnyEncadrant =
        session.allEncadrants.any((e) => e.membreId == userId);
    if (isAnyEncadrant) {
      groups.add(SessionChatGroup(
        type: SessionGroupType.encadrants,
        displayName: 'Chat Encadrants',
      ));
    }

    // Ajouter les chats par niveau pour les encadrants
    for (final level in session.niveaux.keys) {
      if (session.isEncadrantForLevel(userId, level)) {
        groups.add(SessionChatGroup(
          type: SessionGroupType.niveau,
          level: level,
          displayName: 'Niveau ${PiscineLevel.displayName(level)}',
        ));
      }
    }

    return groups;
  }

  // getTotalUnreadCountStream, getUnreadCountsStream verwijderd
  // → read tracking gaat nu via LocalReadTracker + UnreadCountService
}
