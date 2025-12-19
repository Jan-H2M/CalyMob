import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/event_message.dart';
import '../providers/event_message_provider.dart';
import '../providers/auth_provider.dart';
import 'package:intl/intl.dart';

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

  @override
  void initState() {
    super.initState();
    _checkParticipation();
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

  Future<void> _sendMessage() async {
    final text = _messageController.text.trim();
    if (text.isEmpty) return;

    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final messageProvider =
        Provider.of<EventMessageProvider>(context, listen: false);
    final currentUser = authProvider.currentUser;
    final displayName = authProvider.displayName;

    if (currentUser == null) return;

    try {
      await messageProvider.sendMessage(
        clubId: widget.clubId,
        operationId: widget.operationId,
        senderId: currentUser.uid,
        senderName: displayName ?? 'Membre',
        message: text,
      );

      _messageController.clear();

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
            content: Text('❌ Erreur: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
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
                        isParticipant
                            ? 'Soyez le premier à poser une question'
                            : 'Les participants peuvent discuter ici',
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

        // Input bar
        if (isParticipant)
          _buildMessageInput()
        else
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.grey[100],
              border: Border(
                top: BorderSide(color: Colors.grey[300]!),
              ),
            ),
            child: Row(
              children: [
                Icon(Icons.info_outline, color: Colors.grey[600], size: 20),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Inscrivez-vous à l\'événement pour participer à la discussion',
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey[700],
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _buildMessageBubble(EventMessage message, bool isOwnMessage) {
    final dateFormat = DateFormat('HH:mm');

    return Align(
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

            // Message text
            Text(
              message.message,
              style: const TextStyle(
                fontSize: 15,
                color: Colors.black87,
              ),
            ),

            // Timestamp
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
    );
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
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _messageController,
              decoration: InputDecoration(
                hintText: 'Votre message...',
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
            ),
          ),
          const SizedBox(width: 8),
          IconButton(
            onPressed: _sendMessage,
            icon: const Icon(Icons.send),
            color: Colors.blue,
            tooltip: 'Envoyer',
          ),
        ],
      ),
    );
  }
}
