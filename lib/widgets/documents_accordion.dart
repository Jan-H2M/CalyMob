import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../config/app_colors.dart';
import '../models/document_justificatif.dart';

/// Accordion widget for displaying operation documents
/// Styled consistently with other accordions in event detail screen
class DocumentsAccordion extends StatelessWidget {
  final List<DocumentJustificatif> documents;
  final bool initiallyExpanded;

  const DocumentsAccordion({
    super.key,
    required this.documents,
    this.initiallyExpanded = false,
  });

  @override
  Widget build(BuildContext context) {
    if (documents.isEmpty) return const SizedBox.shrink();

    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.lichtblauw.withOpacity(0.5)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: ExpansionTile(
          initiallyExpanded: initiallyExpanded,
          backgroundColor: AppColors.lichtblauw.withOpacity(0.2),
          collapsedBackgroundColor: Colors.white.withOpacity(0.9),
          tilePadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          leading: Icon(Icons.attach_file, color: AppColors.middenblauw),
          title: Text(
            'Documents',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: AppColors.donkerblauw,
            ),
          ),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                margin: const EdgeInsets.only(right: 8),
                decoration: BoxDecoration(
                  color: AppColors.lichtblauw.withOpacity(0.5),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  '${documents.length}',
                  style: TextStyle(
                    fontSize: 14,
                    color: AppColors.donkerblauw,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              const Icon(Icons.expand_more),
            ],
          ),
          children: [
            Container(
              color: Colors.white.withOpacity(0.95),
              child: Column(
                children:
                    documents.map((doc) => _buildDocumentTile(doc)).toList(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDocumentTile(DocumentJustificatif doc) {
    final icon = doc.isPdf ? Icons.picture_as_pdf : Icons.image;
    final iconColor = doc.isPdf ? Colors.red.shade700 : AppColors.middenblauw;

    return ListTile(
      onTap: () => _openDocument(doc),
      leading: Icon(icon, color: iconColor, size: 28),
      title: Text(
        doc.nomAffichage,
        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
      ),
      subtitle: Text(
        doc.formattedSize,
        style: TextStyle(fontSize: 12, color: Colors.grey[600]),
      ),
      trailing: Icon(Icons.open_in_new, color: Colors.grey[400], size: 18),
    );
  }

  Future<void> _openDocument(DocumentJustificatif doc) async {
    final uri = Uri.parse(doc.url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }
}
