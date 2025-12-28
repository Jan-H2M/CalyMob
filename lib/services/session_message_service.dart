import 'dart:io';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:path/path.dart' as path;
import '../models/session_message.dart';
import '../models/piscine_session.dart';

/// Service pour la gestion des messages de session piscine
class SessionMessageService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseStorage _storage = FirebaseStorage.instance;

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

    return query
        .orderBy('created_at', descending: false)
        .snapshots()
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
  }) async {
    final messageData = SessionMessage(
      id: '',
      senderId: senderId,
      senderName: senderName,
      message: message,
      groupType: groupType,
      groupLevel: groupLevel,
      attachments: attachments ?? [],
      readBy: [senderId], // L'expéditeur a lu son propre message
      createdAt: DateTime.now(),
    );

    final docRef = await _messagesCollection(clubId, sessionId)
        .add(messageData.toFirestore());

    return docRef.id;
  }

  /// Marquer un message comme lu
  Future<void> markAsRead({
    required String clubId,
    required String sessionId,
    required String messageId,
    required String userId,
  }) async {
    await _messagesCollection(clubId, sessionId).doc(messageId).update({
      'read_by': FieldValue.arrayUnion([userId]),
    });
  }

  /// Marquer tous les messages d'un groupe comme lus
  Future<void> markAllAsRead({
    required String clubId,
    required String sessionId,
    required SessionGroupType groupType,
    String? groupLevel,
    required String userId,
  }) async {
    Query<Map<String, dynamic>> query = _messagesCollection(clubId, sessionId)
        .where('group_type', isEqualTo: groupType.value);

    if (groupType == SessionGroupType.niveau && groupLevel != null) {
      query = query.where('group_level', isEqualTo: groupLevel);
    }

    final snapshot = await query.get();

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

  /// Compter les messages non lus pour un groupe
  Future<int> getUnreadCount({
    required String clubId,
    required String sessionId,
    required SessionGroupType groupType,
    String? groupLevel,
    required String userId,
  }) async {
    Query<Map<String, dynamic>> query = _messagesCollection(clubId, sessionId)
        .where('group_type', isEqualTo: groupType.value);

    if (groupType == SessionGroupType.niveau && groupLevel != null) {
      query = query.where('group_level', isEqualTo: groupLevel);
    }

    final snapshot = await query.get();

    return snapshot.docs.where((doc) {
      final readBy = List<String>.from(doc.data()['read_by'] ?? []);
      return !readBy.contains(userId);
    }).length;
  }

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
    );
  }

  /// Obtenir les groupes de chat disponibles pour un utilisateur dans une session
  List<SessionChatGroup> getAvailableGroups({
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
    final isAnyEncadrant = session.allEncadrants.any((e) => e.membreId == userId);
    if (isAnyEncadrant) {
      groups.add(SessionChatGroup(
        type: SessionGroupType.encadrants,
        displayName: 'Chat Encadrants',
      ));
    }

    // Ajouter les chats par niveau pour les encadrants
    for (final level in PiscineLevel.all) {
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

  /// Stream du nombre de messages non lus pour tous les groupes d'un utilisateur
  Stream<Map<String, int>> getUnreadCountsStream({
    required String clubId,
    required String sessionId,
    required String userId,
    required List<SessionChatGroup> groups,
  }) {
    return _messagesCollection(clubId, sessionId)
        .snapshots()
        .map((snapshot) {
      final counts = <String, int>{};

      for (final group in groups) {
        final groupMessages = snapshot.docs.where((doc) {
          final data = doc.data();
          if (data['group_type'] != group.type.value) return false;
          if (group.type == SessionGroupType.niveau) {
            return data['group_level'] == group.level;
          }
          return true;
        });

        counts[group.id] = groupMessages.where((doc) {
          final readBy = List<String>.from(doc.data()['read_by'] ?? []);
          return !readBy.contains(userId);
        }).length;
      }

      return counts;
    });
  }
}
