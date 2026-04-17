import 'dart:io';
import 'package:flutter/foundation.dart';
import '../models/event_message.dart';
import '../models/poll.dart';
import '../models/session_message.dart' show MessageAttachment;
import '../services/event_message_service.dart';
import '../services/local_read_tracker.dart';
import 'unread_count_provider.dart';

/// Provider pour la gestion des messages d'événement
class EventMessageProvider with ChangeNotifier {
  final EventMessageService _eventMessageService = EventMessageService();

  final Map<String, List<EventMessage>> _messagesByOperation = {};
  final Map<String, bool> _loadingByOperation = {};
  final Map<String, String?> _errorByOperation = {};
  final Map<String, bool> _isParticipantByOperation = {};

  /// Obtenir les messages pour un événement
  List<EventMessage> getMessages(String operationId) {
    return _messagesByOperation[operationId] ?? [];
  }

  /// Vérifier si en cours de chargement
  bool isLoading(String operationId) {
    return _loadingByOperation[operationId] ?? false;
  }

  /// Obtenir l'erreur pour un événement
  String? getError(String operationId) {
    return _errorByOperation[operationId];
  }

  /// Vérifier si l'utilisateur est participant
  bool isParticipant(String operationId) {
    return _isParticipantByOperation[operationId] ?? false;
  }

  /// Charger les messages d'un événement
  Future<void> loadMessages(String clubId, String operationId) async {
    _loadingByOperation[operationId] = true;
    _errorByOperation[operationId] = null;
    notifyListeners();

    try {
      final messages =
          await _eventMessageService.getEventMessages(clubId, operationId);
      _messagesByOperation[operationId] = messages;
      _errorByOperation[operationId] = null;
    } catch (e) {
      _errorByOperation[operationId] = e.toString();
      debugPrint('❌ Erreur chargement messages: $e');
    } finally {
      _loadingByOperation[operationId] = false;
      notifyListeners();
    }
  }

  /// Écouter les messages en temps réel
  Stream<List<EventMessage>> watchMessages(String clubId, String operationId) {
    return _eventMessageService.getEventMessagesStream(clubId, operationId);
  }

  /// Vérifier si l'utilisateur est inscrit
  Future<void> checkParticipation({
    required String clubId,
    required String operationId,
    required String userId,
  }) async {
    try {
      final isParticipant = await _eventMessageService.isUserParticipant(
        clubId: clubId,
        operationId: operationId,
        userId: userId,
      );

      _isParticipantByOperation[operationId] = isParticipant;
      notifyListeners();
    } catch (e) {
      debugPrint('❌ Erreur vérification participation: $e');
      _isParticipantByOperation[operationId] = false;
      notifyListeners();
    }
  }

  /// Envoyer un message
  Future<String> sendMessage({
    required String clubId,
    required String operationId,
    required String senderId,
    required String senderName,
    required String message,
    String? replyToId,
    ReplyPreview? replyToPreview,
    List<MessageAttachment>? attachments,
    Poll? poll,
  }) async {
    try {
      final messageId = await _eventMessageService.sendMessage(
        clubId: clubId,
        operationId: operationId,
        senderId: senderId,
        senderName: senderName,
        message: message,
        replyToId: replyToId,
        replyToPreview: replyToPreview,
        attachments: attachments,
        poll: poll,
      );

      // Recharger les messages
      await loadMessages(clubId, operationId);
      return messageId;
    } catch (e) {
      _errorByOperation[operationId] = e.toString();
      debugPrint('❌ Erreur envoi message: $e');
      rethrow;
    }
  }

  /// Upload une pièce jointe
  Future<MessageAttachment> uploadAttachment({
    required String clubId,
    required String operationId,
    required File file,
    required String type,
  }) async {
    return await _eventMessageService.uploadAttachment(
      clubId: clubId,
      operationId: operationId,
      file: file,
      type: type,
    );
  }

  /// Créer un ReplyPreview à partir d'un message
  ReplyPreview createReplyPreview(EventMessage message) {
    return _eventMessageService.createReplyPreview(message);
  }

  /// Récupérer un message par ID
  Future<EventMessage?> getMessage({
    required String clubId,
    required String operationId,
    required String messageId,
  }) async {
    return await _eventMessageService.getMessage(
      clubId: clubId,
      operationId: operationId,
      messageId: messageId,
    );
  }

  /// Supprimer un message
  Future<void> deleteMessage({
    required String clubId,
    required String operationId,
    required String messageId,
  }) async {
    try {
      await _eventMessageService.deleteMessage(
        clubId: clubId,
        operationId: operationId,
        messageId: messageId,
      );

      // Retirer de la liste locale
      _messagesByOperation[operationId]?.removeWhere((m) => m.id == messageId);
      notifyListeners();
    } catch (e) {
      _errorByOperation[operationId] = e.toString();
      debugPrint('❌ Erreur suppression message: $e');
      rethrow;
    }
  }

  /// Modifier un message existant (auteur uniquement).
  Future<void> updateMessage({
    required String clubId,
    required String operationId,
    required String messageId,
    required String newText,
    required List<MessageAttachment> attachments,
    List<MessageAttachment> removedAttachments = const [],
  }) async {
    try {
      await _eventMessageService.updateMessage(
        clubId: clubId,
        operationId: operationId,
        messageId: messageId,
        newText: newText,
        attachments: attachments,
        removedAttachments: removedAttachments,
      );
    } catch (e) {
      _errorByOperation[operationId] = e.toString();
      debugPrint('❌ Erreur mise à jour message: $e');
      rethrow;
    }
  }

  Future<void> toggleReaction({
    required String clubId,
    required String operationId,
    required String messageId,
    required String emoji,
    required String userId,
  }) {
    return _eventMessageService.toggleReaction(
      clubId: clubId,
      operationId: operationId,
      messageId: messageId,
      emoji: emoji,
      userId: userId,
    );
  }

  Future<void> togglePollVote({
    required String clubId,
    required String operationId,
    required String messageId,
    required String optionId,
    required String userId,
  }) {
    return _eventMessageService.togglePollVote(
      clubId: clubId,
      operationId: operationId,
      messageId: messageId,
      optionId: optionId,
      userId: userId,
    );
  }

  Future<void> closePoll({
    required String clubId,
    required String operationId,
    required String messageId,
  }) {
    return _eventMessageService.closePoll(
      clubId: clubId,
      operationId: operationId,
      messageId: messageId,
    );
  }

  /// Réinitialiser l'erreur pour un événement
  void clearError(String operationId) {
    _errorByOperation[operationId] = null;
    notifyListeners();
  }

  /// Markeer lokaal als gelezen (via LocalReadTracker)
  /// Als [unreadProvider] wordt meegegeven, wordt direct een refresh getriggerd
  /// zodat badges/counts meteen bijwerken (niet wachten op 60s timer).
  Future<void> markAsRead({
    required String operationId,
    UnreadCountProvider? unreadProvider,
  }) async {
    final tracker = LocalReadTracker();
    await tracker.init();
    await tracker.markAsRead('operation_$operationId');

    // Trigger onmiddellijke refresh van unread counts + badge
    if (unreadProvider != null) {
      await unreadProvider.refresh();
    }
  }

  /// Nettoyer les données d'un événement
  void clearOperationData(String operationId) {
    _messagesByOperation.remove(operationId);
    _loadingByOperation.remove(operationId);
    _errorByOperation.remove(operationId);
    _isParticipantByOperation.remove(operationId);
    notifyListeners();
  }
}
