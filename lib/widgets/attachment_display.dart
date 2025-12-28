import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/session_message.dart' show MessageAttachment;

/// Widget pour afficher les pièces jointes dans un message
class AttachmentDisplay extends StatelessWidget {
  final List<MessageAttachment> attachments;
  final bool compact;

  const AttachmentDisplay({
    super.key,
    required this.attachments,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    if (attachments.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: attachments.map((attachment) {
        if (attachment.isImage) {
          return _buildImageAttachment(context, attachment);
        } else {
          return _buildPdfAttachment(context, attachment);
        }
      }).toList(),
    );
  }

  Widget _buildImageAttachment(BuildContext context, MessageAttachment attachment) {
    return GestureDetector(
      onTap: () => _showFullScreenImage(context, attachment),
      child: Container(
        margin: const EdgeInsets.only(top: 8),
        constraints: BoxConstraints(
          maxWidth: compact ? 150 : 250,
          maxHeight: compact ? 150 : 200,
        ),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: Colors.grey.shade300),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Image.network(
            attachment.url,
            fit: BoxFit.cover,
            loadingBuilder: (context, child, loadingProgress) {
              if (loadingProgress == null) return child;
              return Container(
                width: compact ? 150 : 250,
                height: compact ? 100 : 150,
                color: Colors.grey.shade200,
                child: const Center(
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              );
            },
            errorBuilder: (context, error, stackTrace) {
              return Container(
                width: compact ? 150 : 250,
                height: compact ? 100 : 150,
                color: Colors.grey.shade200,
                child: const Center(
                  child: Icon(Icons.broken_image, color: Colors.grey),
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _buildPdfAttachment(BuildContext context, MessageAttachment attachment) {
    return GestureDetector(
      onTap: () => _openPdf(attachment),
      child: Container(
        margin: const EdgeInsets.only(top: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.red.shade50,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: Colors.red.shade200),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.picture_as_pdf, color: Colors.red.shade700, size: 24),
            const SizedBox(width: 8),
            Flexible(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    attachment.filename,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: Colors.red.shade900,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  Text(
                    _formatFileSize(attachment.size),
                    style: TextStyle(
                      fontSize: 11,
                      color: Colors.red.shade700,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Icon(Icons.open_in_new, color: Colors.red.shade400, size: 16),
          ],
        ),
      ),
    );
  }

  void _showFullScreenImage(BuildContext context, MessageAttachment attachment) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => _FullScreenImageView(attachment: attachment),
      ),
    );
  }

  Future<void> _openPdf(MessageAttachment attachment) async {
    final uri = Uri.parse(attachment.url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  String _formatFileSize(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}

/// Vue plein écran pour les images
class _FullScreenImageView extends StatelessWidget {
  final MessageAttachment attachment;

  const _FullScreenImageView({required this.attachment});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        iconTheme: const IconThemeData(color: Colors.white),
        title: Text(
          attachment.filename,
          style: const TextStyle(color: Colors.white, fontSize: 14),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.download),
            onPressed: () => _downloadImage(),
          ),
        ],
      ),
      body: Center(
        child: InteractiveViewer(
          minScale: 0.5,
          maxScale: 4.0,
          child: Image.network(
            attachment.url,
            fit: BoxFit.contain,
            loadingBuilder: (context, child, loadingProgress) {
              if (loadingProgress == null) return child;
              return const Center(
                child: CircularProgressIndicator(color: Colors.white),
              );
            },
          ),
        ),
      ),
    );
  }

  Future<void> _downloadImage() async {
    final uri = Uri.parse(attachment.url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }
}
