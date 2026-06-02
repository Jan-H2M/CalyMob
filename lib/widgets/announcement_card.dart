import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/announcement.dart';
import '../utils/search_highlight.dart';
import 'linkified_message_text.dart';

class AnnouncementCard extends StatelessWidget {
  final Announcement announcement;
  final VoidCallback? onTap;
  final String? currentUserId;
  final int unreadReplyCount;
  final bool isUnread;
  final String searchQuery;

  const AnnouncementCard({
    super.key,
    required this.announcement,
    this.onTap,
    this.currentUserId,
    this.unreadReplyCount = 0,
    this.isUnread = false,
    this.searchQuery = '',
  });

  Color _getTypeColor() {
    switch (announcement.type) {
      case AnnouncementType.info:
        return Colors.blue;
      case AnnouncementType.warning:
        return Colors.orange;
      case AnnouncementType.urgent:
        return Colors.red;
    }
  }

  IconData _getTypeIcon() {
    switch (announcement.type) {
      case AnnouncementType.info:
        return Icons.info_outline;
      case AnnouncementType.warning:
        return Icons.warning_amber_outlined;
      case AnnouncementType.urgent:
        return Icons.error_outline;
    }
  }

  String _getTypeLabel() {
    switch (announcement.type) {
      case AnnouncementType.info:
        return 'Info';
      case AnnouncementType.warning:
        return 'Attention';
      case AnnouncementType.urgent:
        return 'Urgent';
    }
  }

  @override
  Widget build(BuildContext context) {
    final color = _getTypeColor();
    final dateFormat = DateFormat('dd/MM/yyyy HH:mm');
    final query = searchQuery.trim();
    final titleStyle = TextStyle(
      fontSize: 18,
      fontWeight: FontWeight.w500,
      color: Colors.grey[800],
    );
    final messageStyle = TextStyle(
      fontSize: 15,
      color: Colors.grey[800],
      height: 1.4,
    );
    final senderStyle = TextStyle(fontSize: 13, color: Colors.grey[600]);

    return GestureDetector(
      onTap: onTap,
      child: Card(
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        elevation: isUnread ? 4 : 2,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(
            color: isUnread ? Colors.red : color.withValues(alpha: 0.3),
            width: isUnread ? 2 : 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.1),
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(12),
                  topRight: Radius.circular(12),
                ),
              ),
              child: Row(
                children: [
                  Icon(_getTypeIcon(), color: color, size: 20),
                  const SizedBox(width: 8),
                  Text(
                    _getTypeLabel(),
                    style: TextStyle(
                      color: color,
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                    ),
                  ),
                  const Spacer(),
                  if (isUnread)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.red,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Text(
                        'NOUVEAU',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text.rich(
                    TextSpan(
                      children: searchHighlightSpans(
                        announcement.title,
                        query,
                        titleStyle,
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  if (query.isEmpty)
                    LinkifiedMessageText(
                      text: announcement.message,
                      style: messageStyle,
                    )
                  else
                    Text.rich(
                      TextSpan(
                        children: searchHighlightSpans(
                          announcement.message,
                          query,
                          messageStyle,
                        ),
                      ),
                    ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Icon(
                        Icons.person_outline,
                        size: 16,
                        color: Colors.grey[600],
                      ),
                      const SizedBox(width: 4),
                      Flexible(
                        child: Text.rich(
                          TextSpan(
                            children: searchHighlightSpans(
                              announcement.senderName,
                              query,
                              senderStyle,
                            ),
                          ),
                          overflow: TextOverflow.ellipsis,
                          maxLines: 1,
                        ),
                      ),
                      const SizedBox(width: 16),
                      Icon(
                        Icons.access_time,
                        size: 16,
                        color: Colors.grey[600],
                      ),
                      const SizedBox(width: 4),
                      Text(
                        dateFormat.format(announcement.createdAt),
                        style: senderStyle,
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      if (announcement.hasReplies) _buildReplyBadge(),
                      if (announcement.attachments.isNotEmpty) ...[
                        const SizedBox(width: 8),
                        _buildAttachmentBadge(),
                      ],
                      const Spacer(),
                      Icon(
                        Icons.chevron_right,
                        size: 20,
                        color: Colors.grey[400],
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildReplyBadge() {
    final hasUnreadReplies = unreadReplyCount > 0;
    final color = hasUnreadReplies ? Colors.red : Colors.blue;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: hasUnreadReplies ? Colors.red.shade50 : Colors.blue.shade50,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            hasUnreadReplies ? Icons.chat_bubble : Icons.chat_bubble_outline,
            size: 14,
            color: color.shade700,
          ),
          const SizedBox(width: 4),
          Text(
            hasUnreadReplies
                ? '$unreadReplyCount nouveau${unreadReplyCount > 1 ? 'x' : ''}'
                : '${announcement.replyCount}',
            style: TextStyle(
              fontSize: 12,
              fontWeight:
                  hasUnreadReplies ? FontWeight.bold : FontWeight.normal,
              color: color.shade700,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAttachmentBadge() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.orange.shade50,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.attach_file, size: 14, color: Colors.orange.shade700),
          const SizedBox(width: 4),
          Text(
            '${announcement.attachments.length}',
            style: TextStyle(fontSize: 12, color: Colors.orange.shade700),
          ),
        ],
      ),
    );
  }
}
