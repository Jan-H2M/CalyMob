import 'package:flutter/material.dart';
import '../screens/expenses/photo_viewer_screen.dart';
import '../screens/expenses/pdf_viewer_screen.dart';
import '../utils/document_utils.dart';

/// Widget pour afficher une galerie de photos avec preview
class ExpensePhotoGallery extends StatelessWidget {
  final List<String> photoUrls;
  final double thumbnailSize;
  final double spacing;

  const ExpensePhotoGallery({
    super.key,
    required this.photoUrls,
    this.thumbnailSize = 100,
    this.spacing = 8,
  });

  @override
  Widget build(BuildContext context) {
    if (photoUrls.isEmpty) {
      return const SizedBox.shrink();
    }

    return Wrap(
      spacing: spacing,
      runSpacing: spacing,
      children: photoUrls.asMap().entries.map((entry) {
        final index = entry.key;
        final url = entry.value;
        return _buildDocumentThumbnail(context, url, index);
      }).toList(),
    );
  }

  Widget _buildDocumentThumbnail(BuildContext context, String url, int index) {
    final isPdf = DocumentUtils.isPdf(url);

    return GestureDetector(
      onTap: () {
        if (isPdf) {
          // Ouvrir PDF in-app avec pdfrx
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => PdfViewerScreen(
                pdfUrl: url,
                title: 'Justificatif PDF',
              ),
            ),
          );
        } else {
          // Ouvrir galerie photo pour les images (filtrer les PDFs)
          final imageUrls = photoUrls.where((url) => !DocumentUtils.isPdf(url)).toList();
          final imageIndex = imageUrls.indexOf(url);

          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => PhotoViewerScreen(
                photoUrls: imageUrls,
                initialIndex: imageIndex >= 0 ? imageIndex : 0,
              ),
            ),
          );
        }
      },
      child: Hero(
        tag: 'photo_$url',
        child: Container(
          width: thumbnailSize,
          height: thumbnailSize,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: Colors.grey[300]!),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.1),
                blurRadius: 4,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          clipBehavior: Clip.antiAlias,
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (isPdf)
                // Afficher icône PDF
                _buildPdfThumbnail()
              else
                // Afficher image avec loading indicator
                _buildImageThumbnail(url),

              // Overlay pour hover effect
              Positioned.fill(
                child: Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.transparent,
                        Colors.black.withOpacity(0.2),
                      ],
                    ),
                  ),
                ),
              ),

              // Icône action (zoom pour image, PDF pour PDF)
              Positioned(
                bottom: 4,
                right: 4,
                child: Icon(
                  isPdf ? Icons.picture_as_pdf : Icons.zoom_in,
                  color: Colors.white,
                  size: 20,
                  shadows: const [
                    Shadow(
                      color: Colors.black,
                      blurRadius: 4,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Affichage pour les PDFs
  Widget _buildPdfThumbnail() {
    return Container(
      color: Colors.red[50],
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.picture_as_pdf,
            size: 48,
            color: Colors.red[700],
          ),
          const SizedBox(height: 4),
          Text(
            'PDF',
            style: TextStyle(
              color: Colors.red[700],
              fontWeight: FontWeight.bold,
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }

  /// Affichage pour les images
  Widget _buildImageThumbnail(String url) {
    return Image.network(
      url,
      fit: BoxFit.cover,
      loadingBuilder: (context, child, loadingProgress) {
        if (loadingProgress == null) return child;
        return Center(
          child: CircularProgressIndicator(
            value: loadingProgress.expectedTotalBytes != null
                ? loadingProgress.cumulativeBytesLoaded /
                    loadingProgress.expectedTotalBytes!
                : null,
          ),
        );
      },
      errorBuilder: (context, error, stackTrace) {
        return Container(
          color: Colors.grey[200],
          child: const Center(
            child: Icon(
              Icons.broken_image,
              color: Colors.grey,
              size: 40,
            ),
          ),
        );
      },
    );
  }
}
