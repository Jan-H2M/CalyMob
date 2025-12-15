import 'package:flutter/material.dart';
import 'package:pdfrx/pdfrx.dart';
import '../../config/app_assets.dart';
import '../../config/app_colors.dart';

/// Fullscreen PDF viewer met zoom en navigation
class PdfViewerScreen extends StatelessWidget {
  final String pdfUrl;
  final String title;

  const PdfViewerScreen({
    super.key,
    required this.pdfUrl,
    this.title = 'Document PDF',
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: Text(title, style: const TextStyle(color: Colors.white)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: Stack(
        children: [
          // Ocean background
          Positioned.fill(
            child: Image.asset(
              AppAssets.backgroundFull,
              fit: BoxFit.cover,
            ),
          ),
          // PDF viewer content
          SafeArea(
            child: Container(
              margin: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
              ),
              clipBehavior: Clip.antiAlias,
              child: PdfViewer.uri(
                Uri.parse(pdfUrl),
                params: PdfViewerParams(
                  // Loading indicator
                  loadingBannerBuilder: (context, bytesDownloaded, totalBytes) {
                    return Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          CircularProgressIndicator(
                            valueColor: AlwaysStoppedAnimation<Color>(AppColors.middenblauw),
                          ),
                          const SizedBox(height: 16),
                          if (totalBytes != null)
                            Text(
                              '${(bytesDownloaded / 1024 / 1024).toStringAsFixed(1)} / ${(totalBytes / 1024 / 1024).toStringAsFixed(1)} MB',
                              style: TextStyle(color: Colors.grey[600]),
                            )
                          else
                            Text(
                              'Chargement...',
                              style: TextStyle(color: Colors.grey[600]),
                            ),
                        ],
                      ),
                    );
                  },
                  // Error handling
                  errorBannerBuilder: (context, error, stackTrace, documentRef) {
                    return Center(
                      child: Padding(
                        padding: const EdgeInsets.all(16.0),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(
                              Icons.error_outline,
                              color: Colors.red,
                              size: 64,
                            ),
                            const SizedBox(height: 16),
                            const Text(
                              'Erreur de chargement du PDF',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              error.toString(),
                              textAlign: TextAlign.center,
                              style: TextStyle(color: Colors.grey[600]),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
