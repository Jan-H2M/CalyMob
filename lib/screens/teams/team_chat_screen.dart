import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:provider/provider.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/poll.dart';
import '../../models/team_channel.dart';
import '../../providers/auth_provider.dart';
import '../../providers/unread_count_provider.dart';
import '../../services/local_read_tracker.dart';
import '../../services/profile_service.dart';
import '../../services/team_channel_service.dart';
import '../../widgets/attachment_display.dart';
import '../../widgets/message_hover_caret.dart';
import '../../widgets/attachment_picker.dart';
import '../../widgets/message_edit_sheet.dart';
import '../../widgets/message_reactions.dart';
import '../../widgets/linkified_message_text.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import '../../widgets/poll_compose_dialog.dart';
import '../../widgets/poll_widget.dart';

class TeamChatScreen extends StatefulWidget {
  final TeamChannel channel;

  const TeamChatScreen({
    super.key,
    required this.channel,
  });

  @override
  State<TeamChatScreen> createState() => _TeamChatScreenState();
}

class _TeamChatScreenState extends State<TeamChatScreen> {
  final TeamChannelService _channelService = TeamChannelService();
  final ProfileService _profileService = ProfileService();
  final TextEditingController _messageController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final FocusNode _focusNode = FocusNode();
  final List<_PendingAttachment> _pendingAttachments = [];

  /// Cache de photo Futures par senderId
  final Map<String, Future<String?>> _photoFutureCache = {};

  bool _isSending = false;
  bool _hasMarkedAsRead = false;
  bool _initialScrollDone = false;
  Poll? _pendingPoll;

  @override
  void initState() {
    super.initState();
    _markMessagesAsRead();
  }

  @override
  void dispose() {
    _messageController.dispose();
    _scrollController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

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

  Color get _teamColor {
    switch (widget.channel.type) {
      case TeamChannelType.general:
        return AppColors.middenblauw;
      case TeamChannelType.ca:
        return const Color(0xFF31507A);
      case TeamChannelType.accueil:
        return Colors.blue;
      case TeamChannelType.encadrants:
        return const Color(0xFF5B5BD6);
      case TeamChannelType.gonflage:
        return AppColors.oranje;
      case TeamChannelType.bureau:
        return const Color(0xFF0E8A75);
    }
  }

  Future<void> _markMessagesAsRead() async {
    if (_hasMarkedAsRead) return;
    _hasMarkedAsRead = true;

    final tracker = LocalReadTracker();
    await tracker.init();
    await tracker.markAsRead('team_${widget.channel.id}');

    if (!mounted) return;
    final unreadProvider = context.read<UnreadCountProvider>();
    await unreadProvider.refresh();
  }

  Future<void> _sendMessage() async {
    final text = _messageController.text.trim();
    if ((text.isEmpty && _pendingAttachments.isEmpty && _pendingPoll == null) ||
        _isSending) {
      return;
    }

    final authProvider = context.read<AuthProvider>();
    const clubId = FirebaseConfig.defaultClubId;
    final userId = authProvider.currentUser?.uid;
    final userName = authProvider.displayName ??
        authProvider.currentUser?.email ??
        'Anonyme';

    if (userId == null) return;

    setState(() => _isSending = true);

    try {
      final attachments = <TeamMessageAttachment>[];
      for (final pending in _pendingAttachments) {
        final attachment = await _channelService.uploadAttachment(
          clubId: clubId,
          channelId: widget.channel.id,
          file: pending.file,
          type: pending.type,
        );
        attachments.add(attachment);
      }

      await _channelService.sendMessage(
        clubId: clubId,
        channelId: widget.channel.id,
        senderId: userId,
        senderName: userName,
        message: text,
        attachments: attachments,
        poll: _pendingPoll,
      );

      _messageController.clear();
      setState(() {
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
        setState(() => _isSending = false);
      }
    }
  }

  Future<void> _toggleReaction(String messageId, String emoji) async {
    final userId = context.read<AuthProvider>().currentUser?.uid;
    if (userId == null) return;

    await _channelService.toggleReaction(
      clubId: FirebaseConfig.defaultClubId,
      channelId: widget.channel.id,
      messageId: messageId,
      emoji: emoji,
      userId: userId,
    );
  }

  Future<void> _togglePollVote(String messageId, String optionId) async {
    final userId = context.read<AuthProvider>().currentUser?.uid;
    if (userId == null) return;

    await _channelService.togglePollVote(
      clubId: FirebaseConfig.defaultClubId,
      channelId: widget.channel.id,
      messageId: messageId,
      optionId: optionId,
      userId: userId,
    );
  }

  Future<void> _closePoll(String messageId) async {
    await _channelService.closePoll(
      clubId: FirebaseConfig.defaultClubId,
      channelId: widget.channel.id,
      messageId: messageId,
    );
  }

  Future<void> _editMessage(TeamMessage message) async {
    final result = await showMessageEditSheet(
      context,
      initialText: message.message,
      initialAttachments: message.attachments,
    );
    if (result == null || !mounted) return;

    // Tenminste tekst OF een attachment vereist.
    if (result.text.isEmpty &&
        result.keptAttachments.isEmpty &&
        result.newFiles.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Le message ne peut pas être vide')),
      );
      return;
    }

    const clubId = FirebaseConfig.defaultClubId;
    final channelId = widget.channel.id;

    try {
      // Upload eventuele nieuwe files.
      final newUploaded = <TeamMessageAttachment>[];
      for (final nf in result.newFileTuples) {
        final uploaded = await _channelService.uploadAttachment(
          clubId: clubId,
          channelId: channelId,
          file: nf.file,
          type: nf.type,
        );
        newUploaded.add(uploaded);
      }

      // Bepaal welke bestaande attachments verwijderd zijn.
      final keptIds = result.keptAttachments
          .map((a) => a.storagePath ?? a.url)
          .toSet();
      final removed = message.attachments
          .where((a) => !keptIds.contains(a.storagePath ?? a.url))
          .toList();

      // Concat: bewaarde bestaande attachments (zelfde type) + nieuwe.
      final mergedAttachments = <TeamMessageAttachment>[
        ...message.attachments.where(
          (a) => keptIds.contains(a.storagePath ?? a.url),
        ),
        ...newUploaded,
      ];

      await _channelService.updateMessage(
        clubId: clubId,
        channelId: channelId,
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

  Future<void> _deleteMessage(String messageId) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Supprimer le message'),
        content: const Text('Voulez-vous supprimer ce message ?'),
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

    if (confirmed != true) return;

    try {
      await _channelService.deleteMessage(
        clubId: FirebaseConfig.defaultClubId,
        channelId: widget.channel.id,
        messageId: messageId,
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

  Future<void> _showMessageOptions(TeamMessage message, bool isOwn) async {
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
                const Text(
                  'Réagir',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 10),
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
                  leading: const Icon(Icons.copy_outlined),
                  title: const Text('Copier'),
                  onTap: () async {
                    Navigator.of(sheetContext).pop();
                    await Clipboard.setData(
                      ClipboardData(text: message.message),
                    );
                    if (!mounted) return;
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Message copié')),
                    );
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
                      _deleteMessage(message.id);
                    },
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _createPoll() async {
    final poll = await showPollComposerDialog(context);
    if (poll == null || !mounted) return;
    setState(() => _pendingPoll = poll);
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

  void _scrollToBottom() {
    if (!_scrollController.hasClients) return;
    _scrollController.animateTo(
      _scrollController.position.maxScrollExtent,
      duration: const Duration(milliseconds: 250),
      curve: Curves.easeOut,
    );
  }

  /// Scroll robuste à la fin de la liste à l'ouverture. On répète l'opération
  /// sur quelques frames pour absorber les changements de hauteur dus aux
  /// avatars qui se chargent en async.
  Future<void> _performInitialScrollToBottom() async {
    for (var attempt = 0; attempt < 4; attempt++) {
      if (!mounted) return;
      if (_scrollController.hasClients) {
        _scrollController.jumpTo(_scrollController.position.maxScrollExtent);
      }
      await Future<void>.delayed(const Duration(milliseconds: 90));
    }
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();
    const clubId = FirebaseConfig.defaultClubId;
    final userId = authProvider.currentUser?.uid;

    if (userId == null) {
      return const Scaffold(
        body: Center(child: Text('Niet verbonden')),
      );
    }

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: _teamColor.withValues(alpha: 0.92),
        elevation: 0,
        title: Row(
          children: [
            Icon(
              widget.channel.type.iconData,
              color: Colors.white,
              size: 24,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.channel.name,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                    ),
                  ),
                  Text(
                    'Canal permanent',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.72),
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      body: OceanGradientBackground(
        creatures: CreatureSet.jellyfish,
        opacity: 0.6,
        child: SafeArea(
          child: Column(
            children: [
              Expanded(
                child: StreamBuilder<List<TeamMessage>>(
                  stream:
                      _channelService.getMessages(clubId, widget.channel.id),
                  builder: (context, snapshot) {
                    if (snapshot.connectionState == ConnectionState.waiting) {
                      return const Center(
                        child: CircularProgressIndicator(color: Colors.white),
                      );
                    }

                    if (snapshot.hasError) {
                      return Center(
                        child: Text(
                          'Erreur de chargement',
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.8),
                          ),
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
                              Icons.forum_outlined,
                              size: 64,
                              color: Colors.white.withValues(alpha: 0.5),
                            ),
                            const SizedBox(height: 16),
                            Text(
                              'Aucun message',
                              style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.75),
                                fontSize: 16,
                              ),
                            ),
                          ],
                        ),
                      );
                    }

                    if (!_initialScrollDone) {
                      _initialScrollDone = true;
                      WidgetsBinding.instance.addPostFrameCallback((_) {
                        _performInitialScrollToBottom();
                      });
                    }

                    return ListView.builder(
                      controller: _scrollController,
                      padding: const EdgeInsets.all(16),
                      itemCount: messages.length,
                      itemBuilder: (context, index) {
                        final message = messages[index];
                        final isOwn = message.senderId == userId;
                        final showDateHeader = index == 0 ||
                            !_isSameDay(
                              messages[index - 1].createdAt,
                              message.createdAt,
                            );

                        return Column(
                          children: [
                            if (showDateHeader)
                              _DateHeader(date: message.createdAt),
                            FutureBuilder<String?>(
                              future: isOwn ? Future.value(null) : _getPhotoUrl(message.senderId),
                              builder: (context, snapshot) {
                                return _MessageBubble(
                                  message: message,
                                  isOwn: isOwn,
                                  teamColor: _teamColor,
                                  currentUserId: userId,
                                  senderPhotoUrl: snapshot.data,
                                  onLongPress: () =>
                                      _showMessageOptions(message, isOwn),
                                  onToggleReaction: (emoji) =>
                                      _toggleReaction(message.id, emoji),
                                  onVote: (optionId) =>
                                      _togglePollVote(message.id, optionId),
                                  onClosePoll: isOwn && message.hasPoll
                                      ? () => _closePoll(message.id)
                                      : null,
                                );
                              },
                            ),
                          ],
                        );
                      },
                    );
                  },
                ),
              ),
              _buildComposer(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildComposer() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: const BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Color(0x14000000),
            blurRadius: 8,
            offset: Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_pendingPoll != null)
              _PendingPollCard(
                poll: _pendingPoll!,
                onRemove: () => setState(() => _pendingPoll = null),
              ),
            if (_pendingAttachments.isNotEmpty)
              SizedBox(
                height: 70,
                child: ListView.builder(
                  scrollDirection: Axis.horizontal,
                  itemCount: _pendingAttachments.length,
                  itemBuilder: (context, index) {
                    final attachment = _pendingAttachments[index];
                    return PendingAttachmentPreview(
                      file: attachment.file,
                      type: attachment.type,
                      onRemove: () => _removeAttachment(index),
                    );
                  },
                ),
              ),
            Row(
              children: [
                AttachmentPicker(
                  onAttachmentSelected: _addAttachment,
                  onCreatePoll: _createPoll,
                ),
                Expanded(
                  child: Container(
                    decoration: BoxDecoration(
                      color: Colors.grey.shade100,
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: TextField(
                      controller: _messageController,
                      focusNode: _focusNode,
                      decoration: InputDecoration(
                        hintText: _pendingPoll != null
                            ? 'Ajoutez un contexte si besoin...'
                            : 'Message à l\'équipe...',
                        border: InputBorder.none,
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 20,
                          vertical: 12,
                        ),
                      ),
                      maxLines: null,
                      textCapitalization: TextCapitalization.sentences,
                      onSubmitted: (_) => _sendMessage(),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Material(
                  color: _teamColor,
                  borderRadius: BorderRadius.circular(24),
                  child: InkWell(
                    onTap: _isSending ? null : _sendMessage,
                    borderRadius: BorderRadius.circular(24),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: _isSending
                          ? const SizedBox(
                              width: 24,
                              height: 24,
                              child: CircularProgressIndicator(
                                color: Colors.white,
                                strokeWidth: 2,
                              ),
                            )
                          : const Icon(Icons.send,
                              color: Colors.white, size: 24),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  bool _isSameDay(DateTime a, DateTime b) {
    return a.year == b.year && a.month == b.month && a.day == b.day;
  }
}

class _DateHeader extends StatelessWidget {
  final DateTime date;

  const _DateHeader({required this.date});

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final isToday =
        date.year == now.year && date.month == now.month && date.day == now.day;
    final yesterday = now.subtract(const Duration(days: 1));
    final isYesterday = date.year == yesterday.year &&
        date.month == yesterday.month &&
        date.day == yesterday.day;

    String text;
    if (isToday) {
      text = 'Aujourd\'hui';
    } else if (isYesterday) {
      text = 'Hier';
    } else {
      text = '${date.day}/${date.month}/${date.year}';
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          decoration: BoxDecoration(
            color: Colors.black.withValues(alpha: 0.3),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            text,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  final TeamMessage message;
  final bool isOwn;
  final Color teamColor;
  final String currentUserId;
  final String? senderPhotoUrl;
  final VoidCallback onLongPress;
  final ValueChanged<String> onToggleReaction;
  final ValueChanged<String> onVote;
  final VoidCallback? onClosePoll;

  const _MessageBubble({
    required this.message,
    required this.isOwn,
    required this.teamColor,
    required this.currentUserId,
    this.senderPhotoUrl,
    required this.onLongPress,
    required this.onToggleReaction,
    required this.onVote,
    this.onClosePoll,
  });

  @override
  Widget build(BuildContext context) {
    final bubbleColor = isOwn ? teamColor : Colors.white;
    final textColor = isOwn ? Colors.white : Colors.black87;

    return MessageHoverCaret(
      onTap: onLongPress,
      alignEnd: isOwn,
      child: GestureDetector(
        onLongPress: onLongPress,
        child: Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Row(
            mainAxisAlignment:
                isOwn ? MainAxisAlignment.end : MainAxisAlignment.start,
            crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            if (!isOwn) ...[
              CircleAvatar(
                radius: 16,
                backgroundColor: teamColor,
                backgroundImage: senderPhotoUrl != null
                    ? CachedNetworkImageProvider(senderPhotoUrl!)
                    : null,
                child: senderPhotoUrl == null
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
              ),
              const SizedBox(width: 8),
            ],
            Flexible(
              child: Container(
                constraints: BoxConstraints(
                  maxWidth: MediaQuery.of(context).size.width * 0.78,
                ),
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: bubbleColor,
                  borderRadius: BorderRadius.only(
                    topLeft: const Radius.circular(16),
                    topRight: const Radius.circular(16),
                    bottomLeft: Radius.circular(isOwn ? 16 : 4),
                    bottomRight: Radius.circular(isOwn ? 4 : 16),
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.08),
                      blurRadius: 4,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (!isOwn)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Text(
                          message.senderName,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: teamColor,
                          ),
                        ),
                      ),
                    if (message.message.isNotEmpty)
                      LinkifiedMessageText(
                        text: message.message,
                        style: TextStyle(color: textColor, fontSize: 15),
                        linkColor: isOwn ? Colors.white : Colors.blue,
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
                        onVote: onVote,
                        onClose: onClosePoll,
                        canClose: onClosePoll != null,
                      ),
                    if (message.reactions.isNotEmpty)
                      MessageReactions(
                        reactions: message.reactions,
                        currentUserId: currentUserId,
                        clubId: FirebaseConfig.defaultClubId,
                        onToggleReaction: onToggleReaction,
                        compact: true,
                      ),
                    const SizedBox(height: 4),
                    Text(
                      message.formattedTime,
                      style: TextStyle(
                        fontSize: 10,
                        color: isOwn
                            ? Colors.white.withValues(alpha: 0.72)
                            : Colors.grey.shade500,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
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
          IconButton(
            onPressed: onRemove,
            icon: const Icon(Icons.close),
          ),
        ],
      ),
    );
  }
}

class _PendingAttachment {
  final File file;
  final String type;

  _PendingAttachment({
    required this.file,
    required this.type,
  });
}
