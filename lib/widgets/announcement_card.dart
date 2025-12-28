import 'package:flutter/material.dart';
import '../models/announcement.dart';
import 'package:intl/intl.dart';

class AnnouncementCard extends StatelessWidget {
  final Announcement announcement;
  final VoidCallback? onDelete;
  final VoidCallback? onTap;
  final bool isAdmin;
  final String? currentUserId;

  const AnnouncementCard({
    super.key,
    required this.announcement,
    this.onDelete,
    this.onTap,
    this.isAdmin = false,
    this.currentUserId,
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
    final isRead = currentUserId != null && announcement.isReadBy(currentUserId!);

    return GestureDetector(
      onTap: onTap,
      child: Card(
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        elevation: 2,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(color: color.withOpacity(0.3), width: 1),
        ),
        child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header with type badge
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
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
                if (isAdmin && onDelete != null)
                  IconButton(
                    icon: const Icon(Icons.delete_outline, size: 20),
                    color: Colors.grey[600],
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                    onPressed: onDelete,
                  ),
              ],
            ),
          ),

          // Content
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Title
                Text(
                  announcement.title,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),

                // Message
                Text(
                  announcement.message,
                  style: TextStyle(
                    fontSize: 15,
                    color: Colors.grey[800],
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 12),

                // Footer with sender and date
                Row(
                  children: [
                    Icon(Icons.person_outline, size: 16, color: Colors.grey[600]),
                    const SizedBox(width: 4),
                    Flexible(
                      child: Text(
                        announcement.senderName,
                        style: TextStyle(
                          fontSize: 13,
                          color: Colors.grey[600],
                        ),
                        overflow: TextOverflow.ellipsis,
                        maxLines: 1,
                      ),
                    ),
                    const SizedBox(width: 16),
                    Icon(Icons.access_time, size: 16, color: Colors.grey[600]),
                    const SizedBox(width: 4),
                    Text(
                      dateFormat.format(announcement.createdAt),
                      style: TextStyle(
                        fontSize: 13,
                        color: Colors.grey[600],
                      ),
                    ),
                  ],
                ),

                // Stats row (read count, reply count, attachments)
                const SizedBox(height: 12),
                Row(
                  children: [
                    // Read count
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: isRead ? Colors.green.shade50 : Colors.grey.shade100,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            isRead ? Icons.visibility : Icons.visibility_outlined,
                            size: 14,
                            color: isRead ? Colors.green.shade700 : Colors.grey[600],
                          ),
                          const SizedBox(width: 4),
                          Text(
                            'Lu par ${announcement.readCount}',
                            style: TextStyle(
                              fontSize: 12,
                              color: isRead ? Colors.green.shade700 : Colors.grey[600],
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),

                    // Reply count
                    if (announcement.hasReplies)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.blue.shade50,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.chat_bubble_outline,
                              size: 14,
                              color: Colors.blue.shade700,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              '${announcement.replyCount}',
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.blue.shade700,
                              ),
                            ),
                          ],
                        ),
                      ),

                    // Attachment indicator
                    if (announcement.attachments.isNotEmpty) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.orange.shade50,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.attach_file,
                              size: 14,
                              color: Colors.orange.shade700,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              '${announcement.attachments.length}',
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.orange.shade700,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],

                    const Spacer(),

                    // Tap hint
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
}
