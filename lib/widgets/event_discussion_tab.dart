import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/event_message.dart';
import '../models/session_message.dart' show MessageAttachment;
import '../providers/event_message_provider.dart';
import '../providers/auth_provider.dart';
import '../providers/unread_count_provider.dart';
import 'package:intl/intl.dart';
import 'attachment_display.dart';
import 'attachment_picker.dart';

class EventDiscussionTab extends StatefulWidget {
  final String clubId;
  final String operationId;

  const EventDiscussionTab({
    super.key,
    required this.clubId,
    required this.operationId,
  });

  @override
  State<EventDiscussionTab> createState() => _EventDiscussionTabState();
}

class _EventDiscussionTabState extends State<EventDiscussionTab> {
  final TextEditingController _messageController = TextEditingController();
  final ScrollController _scrollController = ScrollController();

  // État pour les réponses
  EventMessage? _replyingTo;

  // État pour les pièces jointes
  final List<_PendingAttachment> _pendingAttachments = [];
  bool _isUploading = false;

  @override
  void initState() {
    super.initState();
    _checkParticipation();
    _markMessagesAsRead();
  }

  @override
  void dispose() {
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _checkParticipation() {
    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final messageProvider =
        Provider.of<EventMessageProvider>(context, listen: false);
    final userId = authProvider.currentUser?.uid ?? '';

    messageProvider.checkParticipation(
      clubId: widget.clubId,
      operationId: widget.operationId,
      userId: userId,
    );
  }

  /// Marquer tous les messages comme lus quand on ouvre la discussion
  Future<void> _markMessagesAsRead() async {
    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final messageProvider = Provider.of<EventMessageProvider>(context, listen: false);
    final unreadProvider = Provider.of<UnreadCountProvider>(context, listen: false);
    final userId = authProvider.currentUser?.uid ?? '';
    if (userId.isEmpty) return;

    await messageProvider.markAsRead(
      clubId: widget.clubId,
      operationId: widget.operationId,
      userId: userId,
      unreadProvider: unreadProvider,
    );
  }

  Future<void> _sendMessage() async {
    final text = _messageController.text.trim();
    if (text.isEmpty && _pendingAttachments.isEmpty) return;

    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final messageProvider =
        Provider.of<EventMessageProvider>(context, listen: false);
    final currentUser = authProvider.currentUser;
    final displayName = authProvider.displayName;

    if (currentUser == null) return;

    setState(() => _isUploading = true);

    try {
      // Upload des pièces jointes
      List<MessageAttachment>? attachments;
      if (_pendingAttachments.isNotEmpty) {
        attachments = [];
        for (final pending in _pendingAttachments) {
          final attachment = await messageProvider.uploadAttachment(
            clubId: widget.clubId,
            operationId: widget.operationId,
            file: pending.file,
            type: pending.type,
          );
          attachments.add(attachment);
        }
      }

      // Créer le preview de réponse si nécessaire
      ReplyPreview? replyPreview;
      if (_replyingTo != null) {
        replyPreview = messageProvider.createReplyPreview(_replyingTo!);
      }

      await messageProvider.sendMessage(
        clubId: widget.clubId,
        operationId: widget.operationId,
        senderId: currentUser.uid,
        senderName: displayName ?? 'Membre',
        message: text,
        replyToId: _replyingTo?.id,
        replyToPreview: replyPreview,
        attachments: attachments,
      );

      _messageController.clear();
      setState(() {
        _replyingTo = null;
        _pendingAttachments.clear();
      });

      // Scroll to bottom
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erreur: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isUploading = false);
      }
    }
  }

  void _startReplyTo(EventMessage message) {
    setState(() {
      _replyingTo = message;
    });
  }

  void _cancelReply() {
    setState(() {
      _replyingTo = null;
    });
  }

  void _addAttachment(File file, String type) {
    setState(() {
      _pendingAttachments.add(_PendingAttachment(file: file, type: type));
    });
  }

  void _removeAttachment(int index) {
    setState(() {
      _pendingAttachments.removeAt(index);
    });
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = Provider.of<AuthProvider>(context);
    final messageProvider = Provider.of<EventMessageProvider>(context);
    final currentUser = authProvider.currentUser;
    final currentUserId = currentUser?.uid ?? '';

    final isParticipant = messageProvider.isParticipant(widget.operationId);

    return Column(
      children: [
        // Messages list
        Expanded(
          child: StreamBuilder<List<EventMessage>>(
            stream: messageProvider.watchMessages(
                widget.clubId, widget.operationId),
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Center(child: CircularProgressIndicator());
              }

              if (snapshot.hasError) {
                return Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.error_outline,
                          size: 64, color: Colors.red),
                      const SizedBox(height: 16),
                      Text('Erreur: ${snapshot.error}'),
                    ],
                  ),
                );
              }

              final messages = snapshot.data ?? [];

              if (messages.isEmpty) {
                return Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.chat_bubble_outline,
                          size: 80, color: Colors.grey[400]),
                      const SizedBox(height: 16),
                      Text(
                        'Aucun message',
                        style: TextStyle(
                          fontSize: 18,
                          color: Colors.grey[600],
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Soyez le premier à poser une question',
                        style: TextStyle(
                          fontSize: 14,
                          color: Colors.grey[500],
                        ),
                      ),
                    ],
                  ),
                );
              }

              // After build, scroll to bottom
              WidgetsBinding.instance.addPostFrameCallback((_) {
                if (_scrollController.hasClients) {
                  _scrollController.jumpTo(
                    _scrollController.position.maxScrollExtent,
                  );
                }
              });

              return ListView.builder(
                controller: _scrollController,
                padding: const EdgeInsets.all(16),
                itemCount: messages.length,
                itemBuilder: (context, index) {
                  final message = messages[index];
                  final isOwnMessage = message.senderId == currentUserId;

                  return _buildMessageBubble(message, isOwnMessage);
                },
              );
            },
          ),
        ),

        // Input bar - tous les membres authentifiés peuvent envoyer des messages
        _buildMessageInput(),
      ],
    );
  }

  Widget _buildMessageBubble(EventMessage message, bool isOwnMessage) {
    final dateFormat = DateFormat('HH:mm');

    return GestureDetector(
      onLongPress: () => _showMessageOptions(message, isOwnMessage),
      child: Align(
        alignment: isOwnMessage ? Alignment.centerRight : Alignment.centerLeft,
        child: Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          constraints: BoxConstraints(
            maxWidth: MediaQuery.of(context).size.width * 0.75,
          ),
          decoration: BoxDecoration(
            color: isOwnMessage ? Colors.blue[100] : Colors.grey[200],
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Sender name (only for other users' messages)
              if (!isOwnMessage)
                Text(
                  message.senderName,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: Colors.black87,
                  ),
                ),
              if (!isOwnMessage) const SizedBox(height: 4),

              // Reply preview (if this is a reply)
              if (message.isReply && message.replyToPreview != null)
                _buildReplyPreview(message.replyToPreview!),

              // Message text
              if (message.message.isNotEmpty)
                Text(
                  message.message,
                  style: const TextStyle(
                    fontSize: 15,
                    color: Colors.black87,
                  ),
                ),

              // Attachments
              if (message.hasAttachments)
                AttachmentDisplay(
                  attachments: message.attachments,
                  compact: true,
                ),

              const SizedBox(height: 4),
              Text(
                dateFormat.format(message.createdAt),
                style: TextStyle(
                  fontSize: 11,
                  color: Colors.grey[600],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildReplyPreview(ReplyPreview preview) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.05),
        borderRadius: BorderRadius.circular(8),
        border: Border(
          left: BorderSide(
            color: Colors.blue.shade400,
            width: 3,
          ),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            preview.senderName,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: Colors.blue.shade700,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            preview.messagePreview,
            style: TextStyle(
              fontSize: 12,
              color: Colors.grey[700],
              fontStyle: FontStyle.italic,
            ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  void _showMessageOptions(EventMessage message, bool isOwnMessage) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.reply),
                title: const Text('Répondre'),
                onTap: () {
                  Navigator.pop(context);
                  _startReplyTo(message);
                },
              ),
              if (isOwnMessage)
                ListTile(
                  leading: const Icon(Icons.delete_outline, color: Colors.red),
                  title: const Text('Supprimer', style: TextStyle(color: Colors.red)),
                  onTap: () {
                    Navigator.pop(context);
                    _confirmDeleteMessage(message);
                  },
                ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _confirmDeleteMessage(EventMessage message) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Supprimer le message'),
        content: const Text('Êtes-vous sûr de vouloir supprimer ce message ?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Annuler'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Supprimer'),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      try {
        final messageProvider = Provider.of<EventMessageProvider>(context, listen: false);
        await messageProvider.deleteMessage(
          clubId: widget.clubId,
          operationId: widget.operationId,
          messageId: message.id,
        );
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Message supprimé'),
              backgroundColor: Colors.green,
            ),
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Erreur: $e'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    }
  }

  Widget _buildMessageInput() {
    // Use viewInsets.bottom for keyboard height, padding.bottom for safe area
    final keyboardHeight = MediaQuery.of(context).viewInsets.bottom;
    final bottomSafeArea = MediaQuery.of(context).padding.bottom;
    // When keyboard is visible, use keyboard height; otherwise use safe area
    final bottomPadding = keyboardHeight > 0 ? keyboardHeight : bottomSafeArea;

    return Container(
      padding: EdgeInsets.only(
        left: 8,
        right: 8,
        top: 8,
        bottom: 8 + bottomPadding,
      ),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(
          top: BorderSide(color: Colors.grey[300]!),
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Reply preview bar
          if (_replyingTo != null) _buildReplyingToBar(),

          // Pending attachments preview
          if (_pendingAttachments.isNotEmpty) _buildPendingAttachmentsBar(),

          // Input row
          Row(
            children: [
              // Attachment picker
              AttachmentPicker(onAttachmentSelected: _addAttachment),

              // Text input
              Expanded(
                child: TextField(
                  controller: _messageController,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: InputDecoration(
                    hintText: _replyingTo != null
                        ? 'Repondre...'
                        : 'Votre message...',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(24),
                      borderSide: BorderSide(color: Colors.grey[300]!),
                    ),
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 10,
                    ),
                  ),
                  maxLines: null,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _sendMessage(),
                  enabled: !_isUploading,
                ),
              ),
              const SizedBox(width: 8),

              // Send button
              _isUploading
                  ? const SizedBox(
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : IconButton(
                      onPressed: _sendMessage,
                      icon: const Icon(Icons.send),
                      color: Colors.blue,
                      tooltip: 'Envoyer',
                    ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildReplyingToBar() {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.blue.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border(
          left: BorderSide(
            color: Colors.blue.shade400,
            width: 3,
          ),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Repondre a ${_replyingTo!.senderName}',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: Colors.blue.shade700,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  _replyingTo!.message.length > 50
                      ? '${_replyingTo!.message.substring(0, 50)}...'
                      : _replyingTo!.message,
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey[700],
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.close, size: 18),
            onPressed: _cancelReply,
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(),
          ),
        ],
      ),
    );
  }

  Widget _buildPendingAttachmentsBar() {
    return Container(
      height: 70,
      margin: const EdgeInsets.only(bottom: 8),
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: _pendingAttachments.length,
        itemBuilder: (context, index) {
          final pending = _pendingAttachments[index];
          return PendingAttachmentPreview(
            file: pending.file,
            type: pending.type,
            onRemove: () => _removeAttachment(index),
          );
        },
      ),
    );
  }
}

/// Classe helper pour les pièces jointes en attente
class _PendingAttachment {
  final File file;
  final String type;

  _PendingAttachment({required this.file, required this.type});
}
