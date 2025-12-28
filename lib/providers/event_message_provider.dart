import 'dart:io';
import 'package:flutter/foundation.dart';
import '../models/event_message.dart';
import '../models/session_message.dart' show MessageAttachment;
import '../services/event_message_service.dart';

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

  /// Réinitialiser l'erreur pour un événement
  void clearError(String operationId) {
    _errorByOperation[operationId] = null;
    notifyListeners();
  }

  /// Marquer tous les messages comme lus
  Future<void> markAsRead({
    required String clubId,
    required String operationId,
    required String userId,
  }) async {
    await _eventMessageService.markMessagesAsRead(
      clubId: clubId,
      operationId: operationId,
      userId: userId,
    );
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
