import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../config/app_assets.dart';
import '../../models/announcement.dart';
import '../../models/announcement_reply.dart';
import '../../models/session_message.dart' show MessageAttachment;
import '../../models/event_message.dart' show ReplyPreview;
import '../../services/announcement_service.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/attachment_display.dart';
import '../../widgets/attachment_picker.dart';

class AnnouncementDetailScreen extends StatefulWidget {
  final Announcement announcement;
  final String clubId;

  const AnnouncementDetailScreen({
    super.key,
    required this.announcement,
    required this.clubId,
  });

  @override
  State<AnnouncementDetailScreen> createState() => _AnnouncementDetailScreenState();
}

class _AnnouncementDetailScreenState extends State<AnnouncementDetailScreen> {
  final AnnouncementService _announcementService = AnnouncementService();
  final TextEditingController _messageController = TextEditingController();
  final ScrollController _scrollController = ScrollController();

  AnnouncementReply? _replyingTo;
  final List<_PendingAttachment> _pendingAttachments = [];
  bool _isUploading = false;

  @override
  void initState() {
    super.initState();
    _markAsRead();
  }

  @override
  void dispose() {
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _markAsRead() async {
    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final userId = authProvider.currentUser?.uid;
    if (userId == null) return;

    await _announcementService.markAnnouncementAsRead(
      clubId: widget.clubId,
      announcementId: widget.announcement.id,
      userId: userId,
    );
  }

  Future<void> _sendReply() async {
    final text = _messageController.text.trim();
    if (text.isEmpty && _pendingAttachments.isEmpty) return;

    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final currentUser = authProvider.currentUser;
    final displayName = authProvider.displayName;

    if (currentUser == null) return;

    setState(() => _isUploading = true);

    try {
      List<MessageAttachment>? attachments;
      if (_pendingAttachments.isNotEmpty) {
        attachments = [];
        for (final pending in _pendingAttachments) {
          final attachment = await _announcementService.uploadAnnouncementAttachment(
            clubId: widget.clubId,
            announcementId: widget.announcement.id,
            file: pending.file,
            type: pending.type,
          );
          attachments.add(attachment);
        }
      }

      ReplyPreview? replyPreview;
      if (_replyingTo != null) {
        replyPreview = _announcementService.createReplyPreview(_replyingTo!);
      }

      await _announcementService.sendReply(
        clubId: widget.clubId,
        announcementId: widget.announcement.id,
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
          SnackBar(content: Text('Erreur: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isUploading = false);
      }
    }
  }

  void _startReplyTo(AnnouncementReply reply) {
    setState(() => _replyingTo = reply);
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
    setState(() => _pendingAttachments.removeAt(index));
  }

  Color _getTypeColor() {
    switch (widget.announcement.type) {
      case AnnouncementType.info:
        return Colors.blue;
      case AnnouncementType.warning:
        return Colors.orange;
      case AnnouncementType.urgent:
        return Colors.red;
    }
  }

  IconData _getTypeIcon() {
    switch (widget.announcement.type) {
      case AnnouncementType.info:
        return Icons.info_outline;
      case AnnouncementType.warning:
        return Icons.warning_amber_outlined;
      case AnnouncementType.urgent:
        return Icons.error_outline;
    }
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = Provider.of<AuthProvider>(context);
    final currentUserId = authProvider.currentUser?.uid ?? '';
    final dateFormat = DateFormat('dd/MM/yyyy HH:mm');

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          image: DecorationImage(
            image: AssetImage(AppAssets.backgroundLight),
            fit: BoxFit.cover,
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              // Header
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                child: Row(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.arrow_back, color: Colors.white, size: 28),
                      onPressed: () => Navigator.pop(context),
                    ),
                    const Expanded(
                      child: Text(
                        'Discussion',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 22,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              // Content
              Expanded(
                child: Column(
                  children: [
                    // Announcement header card
                    _buildAnnouncementHeader(dateFormat),

                    // Replies list
                    Expanded(
                      child: StreamBuilder<List<AnnouncementReply>>(
                        stream: _announcementService.getRepliesStream(
                          clubId: widget.clubId,
                          announcementId: widget.announcement.id,
                        ),
                        builder: (context, snapshot) {
                          final replies = snapshot.data ?? [];

                          if (replies.isEmpty) {
                            return Center(
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(Icons.chat_bubble_outline,
                                      size: 60, color: Colors.white.withOpacity(0.5)),
                                  const SizedBox(height: 16),
                                  Text(
                                    'Aucune reponse',
                                    style: TextStyle(
                                      color: Colors.white.withOpacity(0.7),
                                      fontSize: 16,
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    'Soyez le premier a reagir',
                                    style: TextStyle(
                                      color: Colors.white.withOpacity(0.5),
                                      fontSize: 14,
                                    ),
                                  ),
                                ],
                              ),
                            );
                          }

                          return ListView.builder(
                            controller: _scrollController,
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                            itemCount: replies.length,
                            itemBuilder: (context, index) {
                              final reply = replies[index];
                              final isOwnReply = reply.senderId == currentUserId;
                              return _buildReplyBubble(reply, isOwnReply, dateFormat);
                            },
                          );
                        },
                      ),
                    ),

                    // Input bar
                    _buildMessageInput(),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildAnnouncementHeader(DateFormat dateFormat) {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.95),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.1),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Type badge + title
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: _getTypeColor().withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(_getTypeIcon(), size: 16, color: _getTypeColor()),
                    const SizedBox(width: 4),
                    Text(
                      widget.announcement.type.name.toUpperCase(),
                      style: TextStyle(
                        color: _getTypeColor(),
                        fontWeight: FontWeight.bold,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Title
          Text(
            widget.announcement.title,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: Colors.black87,
            ),
          ),
          const SizedBox(height: 8),

          // Message
          Text(
            widget.announcement.message,
            style: const TextStyle(
              fontSize: 15,
              color: Colors.black87,
              height: 1.4,
            ),
          ),

          // Attachments
          if (widget.announcement.hasAttachments) ...[
            const SizedBox(height: 12),
            AttachmentDisplay(attachments: widget.announcement.attachments),
          ],

          const SizedBox(height: 12),
          const Divider(),

          // Footer: sender, date, read count
          Row(
            children: [
              Icon(Icons.person_outline, size: 16, color: Colors.grey[600]),
              const SizedBox(width: 4),
              Text(
                widget.announcement.senderName,
                style: TextStyle(fontSize: 13, color: Colors.grey[600]),
              ),
              const SizedBox(width: 16),
              Icon(Icons.access_time, size: 16, color: Colors.grey[600]),
              const SizedBox(width: 4),
              Text(
                dateFormat.format(widget.announcement.createdAt),
                style: TextStyle(fontSize: 13, color: Colors.grey[600]),
              ),
              const Spacer(),
              if (widget.announcement.readCount > 0) ...[
                Icon(Icons.visibility, size: 16, color: Colors.grey[600]),
                const SizedBox(width: 4),
                Text(
                  '${widget.announcement.readCount}',
                  style: TextStyle(fontSize: 13, color: Colors.grey[600]),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildReplyBubble(AnnouncementReply reply, bool isOwnReply, DateFormat dateFormat) {
    return GestureDetector(
      onLongPress: () => _showReplyOptions(reply),
      child: Align(
        alignment: isOwnReply ? Alignment.centerRight : Alignment.centerLeft,
        child: Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          constraints: BoxConstraints(
            maxWidth: MediaQuery.of(context).size.width * 0.75,
          ),
          decoration: BoxDecoration(
            color: isOwnReply ? Colors.blue[100] : Colors.white,
            borderRadius: BorderRadius.circular(12),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.05),
                blurRadius: 5,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (!isOwnReply)
                Text(
                  reply.senderName,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: Colors.black87,
                  ),
                ),
              if (!isOwnReply) const SizedBox(height: 4),

              // Reply preview
              if (reply.isReply && reply.replyToPreview != null)
                _buildReplyPreviewWidget(reply.replyToPreview!),

              // Message
              if (reply.message.isNotEmpty)
                Text(
                  reply.message,
                  style: const TextStyle(fontSize: 15, color: Colors.black87),
                ),

              // Attachments
              if (reply.hasAttachments)
                AttachmentDisplay(attachments: reply.attachments, compact: true),

              // Footer
              const SizedBox(height: 4),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    DateFormat('HH:mm').format(reply.createdAt),
                    style: TextStyle(fontSize: 11, color: Colors.grey[600]),
                  ),
                  if (reply.readCount > 1) ...[
                    const SizedBox(width: 8),
                    Icon(Icons.done_all, size: 14, color: Colors.blue[400]),
                    const SizedBox(width: 2),
                    Text(
                      '${reply.readCount}',
                      style: TextStyle(fontSize: 11, color: Colors.grey[600]),
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildReplyPreviewWidget(ReplyPreview preview) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.05),
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

  void _showReplyOptions(AnnouncementReply reply) {
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
                title: const Text('Repondre'),
                onTap: () {
                  Navigator.pop(context);
                  _startReplyTo(reply);
                },
              ),
              if (reply.readCount > 0)
                ListTile(
                  leading: const Icon(Icons.visibility),
                  title: Text('Lu par ${reply.readCount} personne${reply.readCount > 1 ? 's' : ''}'),
                  enabled: false,
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildMessageInput() {
    final keyboardHeight = MediaQuery.of(context).viewInsets.bottom;
    final bottomSafeArea = MediaQuery.of(context).padding.bottom;
    final bottomPadding = keyboardHeight > 0 ? keyboardHeight : bottomSafeArea;

    return Container(
      padding: EdgeInsets.only(left: 8, right: 8, top: 8, bottom: 8 + bottomPadding),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: Colors.grey[300]!)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (_replyingTo != null) _buildReplyingToBar(),
          if (_pendingAttachments.isNotEmpty) _buildPendingAttachmentsBar(),
          Row(
            children: [
              AttachmentPicker(onAttachmentSelected: _addAttachment),
              Expanded(
                child: TextField(
                  controller: _messageController,
                  decoration: InputDecoration(
                    hintText: _replyingTo != null ? 'Repondre...' : 'Votre message...',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(24),
                      borderSide: BorderSide(color: Colors.grey[300]!),
                    ),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  ),
                  maxLines: null,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _sendReply(),
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
                      onPressed: _sendReply,
                      icon: const Icon(Icons.send),
                      color: Colors.blue,
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
        border: Border(left: BorderSide(color: Colors.blue.shade400, width: 3)),
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

class _PendingAttachment {
  final File file;
  final String type;

  _PendingAttachment({required this.file, required this.type});
}
