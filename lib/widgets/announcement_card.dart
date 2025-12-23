import 'package:flutter/material.dart';
import '../models/announcement.dart';
import 'package:intl/intl.dart';

class AnnouncementCard extends StatelessWidget {
  final Announcement announcement;
  final VoidCallback? onDelete;
  final bool isAdmin;

  const AnnouncementCard({
    super.key,
    required this.announcement,
    this.onDelete,
    this.isAdmin = false,
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

    return Card(
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
              ],
            ),
          ),
        ],
      ),
    );
  }
}
