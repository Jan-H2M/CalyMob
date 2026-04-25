import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../config/app_colors.dart';
import '../config/firebase_config.dart';
import '../models/event_message.dart';
import '../models/poll.dart';
import 'message_hover_caret.dart';
import '../models/session_message.dart' show MessageAttachment;
import '../providers/auth_provider.dart';
import '../providers/event_message_provider.dart';
import '../providers/unread_count_provider.dart';
import '../services/local_read_tracker.dart';
import '../services/profile_service.dart';
import 'attachment_display.dart';
import 'attachment_picker.dart';
import 'message_edit_sheet.dart';
import 'message_reactions.dart';
import 'poll_compose_dialog.dart';
import 'poll_widget.dart';

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
  final ProfileService _profileService = ProfileService();
  final List<_PendingAttachment> _pendingAttachments = [];

  /// Cache de photo Futures par senderId
  final Map<String, Future<String?>> _photoFutureCache = {};

  EventMessage? _replyingTo;
  Poll? _pendingPoll;
  bool _hasCheckedParticipation = false;
  bool _isUploading = false;
  bool _initialScrollDone = false;
  DateTime? _lastReadBeforeOpen;

  /// Key sur le divider "Nouveaux messages" — sert à scroller exactement
  /// jusqu'à la première ligne non-lue à l'ouverture du chat.
  final GlobalKey _newMessagesDividerKey = GlobalKey();

  /// Haal de foto URL op voor een member (cached Future)
  Future<String?> _getPhotoUrl(String senderId) {
    return _photoFutureCache.putIfAbsent(senderId, () async {
      final profile = await _profileService.getProfile(
        FirebaseConfig.defaultClubId,
        senderId,
      );
      return (profile?.hasPhoto == true) ? profile!.photoUrl : null;
    });
  }

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

  Future<void> _checkParticipation() async {
    final authProvider = context.read<AuthProvider>();
    final messageProvider = context.read<EventMessageProvider>();
    final userId = authProvider.currentUser?.uid ?? '';

    await messageProvider.checkParticipation(
      clubId: widget.clubId,
      operationId: widget.operationId,
      userId: userId,
    );

    if (!mounted) return;
    setState(() => _hasCheckedParticipation = true);
  }

  Future<void> _markMessagesAsRead() async {
    final tracker = LocalReadTracker();
    await tracker.init();
    final key = 'operation_${widget.operationId}';
    _lastReadBeforeOpen =
        tracker.getLastRead(key) ?? tracker.installBaseline ?? DateTime(2024);

    if (!mounted) return;
    final unreadProvider = context.read<UnreadCountProvider>();
    await context.read<EventMessageProvider>().markAsRead(
          operationId: widget.operationId,
          unreadProvider: unreadProvider,
        );
  }

  Future<void> _sendMessage() async {
    final text = _messageController.text.trim();
    if ((text.isEmpty && _pendingAttachments.isEmpty && _pendingPoll == null) ||
        _isUploading) {
      return;
    }

    final authProvider = context.read<AuthProvider>();
    final messageProvider = context.read<EventMessageProvider>();
    final currentUser = authProvider.currentUser;
    final displayName = authProvider.displayName;

    if (currentUser == null) return;
    if (!_hasCheckedParticipation ||
        !messageProvider.isParticipant(widget.operationId)) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Inscrivez-vous pour participer à la discussion'),
        ),
      );
      return;
    }

    setState(() => _isUploading = true);

    try {
      final attachments = <MessageAttachment>[];
      for (final pending in _pendingAttachments) {
        final attachment = await messageProvider.uploadAttachment(
          clubId: widget.clubId,
          operationId: widget.operationId,
          file: pending.file,
          type: pending.type,
        );
        attachments.add(attachment);
      }

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
        poll: _pendingPoll,
      );

      _messageController.clear();
      setState(() {
        _replyingTo = null;
        _pendingAttachments.clear();
        _pendingPoll = null;
      });

      WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToBottom());
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erreur: $e'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _isUploading = false);
      }
    }
  }

  Future<void> _toggleReaction(String messageId, String emoji) async {
    final userId = context.read<AuthProvider>().currentUser?.uid;
    if (userId == null) return;

    await context.read<EventMessageProvider>().toggleReaction(
          clubId: widget.clubId,
          operationId: widget.operationId,
          messageId: messageId,
          emoji: emoji,
          userId: userId,
        );
  }

  Future<void> _togglePollVote(String messageId, String optionId) async {
    final userId = context.read<AuthProvider>().currentUser?.uid;
    if (userId == null) return;

    await context.read<EventMessageProvider>().togglePollVote(
          clubId: widget.clubId,
          operationId: widget.operationId,
          messageId: messageId,
          optionId: optionId,
          userId: userId,
        );
  }

  Future<void> _closePoll(String messageId) async {
    await context.read<EventMessageProvider>().closePoll(
          clubId: widget.clubId,
          operationId: widget.operationId,
          messageId: messageId,
        );
  }

  void _startReplyTo(EventMessage message) {
    setState(() => _replyingTo = message);
  }

  void _cancelReply() {
    setState(() => _replyingTo = null);
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

  Future<void> _createPoll() async {
    final poll = await showPollComposerDialog(context);
    if (poll == null || !mounted) return;
    setState(() => _pendingPoll = poll);
  }

  Future<void> _copyMessage(String text) async {
    await Clipboard.setData(ClipboardData(text: text));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Message copié')),
    );
  }

  Future<void> _editMessage(EventMessage message) async {
    final result = await showMessageEditSheet(
      context,
      initialText: message.message,
      initialAttachments: message.attachments,
    );
    if (result == null || !mounted) return;

    if (result.text.isEmpty &&
        result.keptAttachments.isEmpty &&
        result.newFiles.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Le message ne peut pas être vide')),
      );
      return;
    }

    final messageProvider = context.read<EventMessageProvider>();

    try {
      final newUploaded = <MessageAttachment>[];
      for (final nf in result.newFileTuples) {
        final uploaded = await messageProvider.uploadAttachment(
          clubId: widget.clubId,
          operationId: widget.operationId,
          file: nf.file,
          type: nf.type,
        );
        newUploaded.add(uploaded);
      }

      final keptIds = result.keptAttachments
          .map((a) => a.storagePath ?? a.url)
          .toSet();
      final removed = message.attachments
          .where((a) => !keptIds.contains(a.storagePath ?? a.url))
          .toList();

      final mergedAttachments = <MessageAttachment>[
        ...message.attachments.where(
          (a) => keptIds.contains(a.storagePath ?? a.url),
        ),
        ...newUploaded,
      ];

      await messageProvider.updateMessage(
        clubId: widget.clubId,
        operationId: widget.operationId,
        messageId: message.id,
        newText: result.text,
        attachments: mergedAttachments,
        removedAttachments: removed,
      );

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Message modifié')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Erreur: $e'), backgroundColor: Colors.red),
      );
    }
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

    if (confirmed != true || !mounted) return;

    try {
      await context.read<EventMessageProvider>().deleteMessage(
            clubId: widget.clubId,
            operationId: widget.operationId,
            messageId: message.id,
          );

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Message supprimé'),
          backgroundColor: Colors.green,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erreur: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Future<void> _showMessageOptions(EventMessage message, bool isOwn) async {
    await showModalBottomSheet<void>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (sheetContext) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final emoji in MessageReactions.quickReactions)
                      ActionChip(
                        label: Text(emoji),
                        onPressed: () async {
                          Navigator.of(sheetContext).pop();
                          await _toggleReaction(message.id, emoji);
                        },
                      ),
                  ],
                ),
                const SizedBox(height: 8),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.reply),
                  title: const Text('Répondre'),
                  onTap: () {
                    Navigator.of(sheetContext).pop();
                    _startReplyTo(message);
                  },
                ),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.copy_outlined),
                  title: const Text('Copier'),
                  onTap: () {
                    Navigator.of(sheetContext).pop();
                    _copyMessage(message.message);
                  },
                ),
                if (isOwn && !message.hasPoll)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.edit_outlined),
                    title: const Text('Modifier'),
                    onTap: () {
                      Navigator.of(sheetContext).pop();
                      _editMessage(message);
                    },
                  ),
                if (isOwn)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading:
                        const Icon(Icons.delete_outline, color: Colors.red),
                    title: const Text(
                      'Supprimer',
                      style: TextStyle(color: Colors.red),
                    ),
                    onTap: () {
                      Navigator.of(sheetContext).pop();
                      _confirmDeleteMessage(message);
                    },
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _scrollToBottom() {
    if (!_scrollController.hasClients) return;
    _scrollController.animateTo(
      _scrollController.position.maxScrollExtent,
      duration: const Duration(milliseconds: 250),
      curve: Curves.easeOut,
    );
  }

  /// Saute immédiatement à la fin de la liste, sans animation. Utilisé à
  /// l'ouverture pour éviter qu'on voie un scroll parasite quand la liste
  /// est encore en train de mesurer ses items (avatars async).
  void _jumpToBottom() {
    if (!_scrollController.hasClients) return;
    _scrollController.jumpTo(_scrollController.position.maxScrollExtent);
  }

  /// Scroll initial à l'ouverture du chat:
  /// - s'il y a un divider "Nouveaux messages", on aligne ce divider en haut
  ///   du viewport pour que le membre commence sa lecture aux non-lus.
  /// - sinon on saute au dernier message.
  ///
  /// On répète l'opération sur quelques frames pour absorber les changements
  /// de hauteur dus aux avatars / images qui arrivent en async.
  Future<void> _performInitialScroll() async {
    for (var attempt = 0; attempt < 4; attempt++) {
      if (!mounted) return;
      final dividerContext = _newMessagesDividerKey.currentContext;
      if (dividerContext != null && dividerContext.mounted) {
        await Scrollable.ensureVisible(
          dividerContext,
          alignment: 0.15,
          duration: Duration.zero,
          curve: Curves.linear,
        );
      } else {
        _jumpToBottom();
      }
      await Future<void>.delayed(const Duration(milliseconds: 90));
    }
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();
    final messageProvider = context.watch<EventMessageProvider>();
    final currentUserId = authProvider.currentUser?.uid ?? '';
    final canWrite = _hasCheckedParticipation &&
        messageProvider.isParticipant(widget.operationId);

    return Column(
      children: [
        Expanded(
          child: StreamBuilder<List<EventMessage>>(
            stream: messageProvider.watchMessages(
              widget.clubId,
              widget.operationId,
            ),
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
                      Icon(
                        Icons.chat_bubble_outline,
                        size: 80,
                        color: Colors.grey[400],
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'Aucun message',
                        style: TextStyle(
                          fontSize: 18,
                          color: Colors.grey[600],
                        ),
                      ),
                    ],
                  ),
                );
              }

              if (!_initialScrollDone) {
                _initialScrollDone = true;
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  _performInitialScroll();
                });
              }

              int? newMessagesDividerIndex;
              if (_lastReadBeforeOpen != null) {
                for (var i = 0; i < messages.length; i++) {
                  if (messages[i].createdAt.isAfter(_lastReadBeforeOpen!)) {
                    newMessagesDividerIndex = i;
                    break;
                  }
                }
              }

              final hasNewDivider = newMessagesDividerIndex != null;
              final totalItems = messages.length + (hasNewDivider ? 1 : 0);

              return ListView.builder(
                controller: _scrollController,
                padding: const EdgeInsets.all(16),
                itemCount: totalItems,
                itemBuilder: (context, index) {
                  if (hasNewDivider && index == newMessagesDividerIndex) {
                    return _buildNewMessagesDivider();
                  }

                  final messageIndex =
                      hasNewDivider && index > newMessagesDividerIndex!
                          ? index - 1
                          : index;
                  final message = messages[messageIndex];
                  final isOwnMessage = message.senderId == currentUserId;

                  return _buildMessageBubble(
                    message: message,
                    isOwnMessage: isOwnMessage,
                    currentUserId: currentUserId,
                  );
                },
              );
            },
          ),
        ),
        canWrite ? _buildMessageInput() : _buildReadOnlyInfo(),
      ],
    );
  }

  Widget _buildNewMessagesDivider() {
    return Padding(
      key: _newMessagesDividerKey,
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        children: [
          Expanded(child: Divider(color: Colors.red.shade300, thickness: 1)),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Text(
              'Nouveaux messages',
              style: TextStyle(
                color: Colors.red.shade400,
                fontSize: 13,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          Expanded(child: Divider(color: Colors.red.shade300, thickness: 1)),
        ],
      ),
    );
  }

  Widget _buildMessageBubble({
    required EventMessage message,
    required bool isOwnMessage,
    required String currentUserId,
  }) {
    final dateFormat = DateFormat('HH:mm');

    return MessageHoverCaret(
      onTap: () => _showMessageOptions(message, isOwnMessage),
      alignEnd: isOwnMessage,
      child: GestureDetector(
        onLongPress: () => _showMessageOptions(message, isOwnMessage),
        child: Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Row(
            mainAxisAlignment: isOwnMessage ? MainAxisAlignment.end : MainAxisAlignment.start,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            if (!isOwnMessage) ...[
              FutureBuilder<String?>(
                future: _getPhotoUrl(message.senderId),
                builder: (context, snapshot) {
                  return CircleAvatar(
                    radius: 16,
                    backgroundColor: AppColors.middenblauw,
                    backgroundImage: snapshot.data != null
                        ? CachedNetworkImageProvider(snapshot.data!)
                        : null,
                    child: snapshot.data == null
                        ? Text(
                            message.senderName.isEmpty
                                ? '?'
                                : message.senderName[0].toUpperCase(),
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                              fontSize: 12,
                            ),
                          )
                        : null,
                  );
                },
              ),
              const SizedBox(width: 8),
            ],
            Flexible(
              child: Container(
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
              if (message.isReply && message.replyToPreview != null)
                _buildReplyPreview(message.replyToPreview!),
              if (message.message.isNotEmpty)
                Text(
                  message.message,
                  style: const TextStyle(fontSize: 15, color: Colors.black87),
                ),
              if (message.hasAttachments)
                AttachmentDisplay(
                  attachments: message.attachments,
                  compact: true,
                ),
              if (message.hasPoll)
                ChatPollWidget(
                  poll: message.poll!,
                  currentUserId: currentUserId,
                  onVote: (optionId) => _togglePollVote(message.id, optionId),
                  onClose: isOwnMessage ? () => _closePoll(message.id) : null,
                  canClose: isOwnMessage,
                ),
              if (message.reactions.isNotEmpty)
                MessageReactions(
                  reactions: message.reactions,
                  currentUserId: currentUserId,
                  onToggleReaction: (emoji) =>
                      _toggleReaction(message.id, emoji),
                  compact: true,
                ),
              const SizedBox(height: 4),
              Text(
                dateFormat.format(message.createdAt),
                style: TextStyle(fontSize: 11, color: Colors.grey[600]),
              ),
            ],
          ),
        ),
            ), // Flexible
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
        color: Colors.black.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(8),
        border: Border(
          left: BorderSide(color: Colors.blue.shade400, width: 3),
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

  Widget _buildMessageInput() {
    final keyboardHeight = MediaQuery.of(context).viewInsets.bottom;
    final bottomSafeArea = MediaQuery.of(context).padding.bottom;
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
        border: Border(top: BorderSide(color: Colors.grey[300]!)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (_replyingTo != null) _buildReplyingToBar(),
          if (_pendingPoll != null)
            _PendingPollCard(
              poll: _pendingPoll!,
              onRemove: () => setState(() => _pendingPoll = null),
            ),
          if (_pendingAttachments.isNotEmpty) _buildPendingAttachmentsBar(),
          Row(
            children: [
              AttachmentPicker(
                onAttachmentSelected: _addAttachment,
                onCreatePoll: _createPoll,
              ),
              Expanded(
                child: TextField(
                  controller: _messageController,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: InputDecoration(
                    hintText: _replyingTo != null
                        ? 'Répondre...'
                        : _pendingPoll != null
                            ? 'Ajoutez un contexte si besoin...'
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

  Widget _buildReadOnlyInfo() {
    final bottomSafeArea = MediaQuery.of(context).padding.bottom;

    return Container(
      padding: EdgeInsets.fromLTRB(12, 10, 12, 10 + bottomSafeArea),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: Colors.grey[300]!)),
      ),
      child: Row(
        children: [
          Icon(Icons.info_outline, color: Colors.grey[600], size: 18),
          const SizedBox(width: 8),
          const Expanded(
            child: Text(
              'Inscrivez-vous pour participer à la discussion',
              style: TextStyle(fontSize: 13, color: Colors.grey),
            ),
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
        border: Border(left: BorderSide(color: Colors.blue.shade400, width: 3)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Répondre à ${_replyingTo!.senderName}',
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
                  style: TextStyle(fontSize: 12, color: Colors.grey[700]),
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

class _PendingPollCard extends StatelessWidget {
  final Poll poll;
  final VoidCallback onRemove;

  const _PendingPollCard({
    required this.poll,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.blue.shade50,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          const Icon(Icons.poll_outlined, color: Colors.blue),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              poll.question,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          IconButton(onPressed: onRemove, icon: const Icon(Icons.close)),
        ],
      ),
    );
  }
}

class _PendingAttachment {
  final File file;
  final String type;

  _PendingAttachment({required this.file, required this.type});
}
