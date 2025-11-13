import 'package:url_launcher/url_launcher.dart';

/// Utilitaires pour gérer les documents (images, PDFs)
class DocumentUtils {
  /// Détermine si une URL pointe vers un PDF
  static bool isPdf(String url) {
    final lowerUrl = url.toLowerCase();
    return lowerUrl.endsWith('.pdf') ||
           lowerUrl.contains('.pdf?') ||
           lowerUrl.contains('application/pdf');
  }

  /// Détermine si une URL pointe vers une image
  static bool isImage(String url) {
    final lowerUrl = url.toLowerCase();
    return lowerUrl.endsWith('.jpg') ||
           lowerUrl.endsWith('.jpeg') ||
           lowerUrl.endsWith('.png') ||
           lowerUrl.endsWith('.gif') ||
           lowerUrl.endsWith('.webp') ||
           lowerUrl.contains('.jpg?') ||
           lowerUrl.contains('.jpeg?') ||
           lowerUrl.contains('.png?');
  }

  /// Ouvre un PDF dans l'application externe par défaut
  static Future<bool> openPdf(String url) async {
    try {
      final uri = Uri.parse(url);
      if (await canLaunchUrl(uri)) {
        return await launchUrl(
          uri,
          mode: LaunchMode.externalApplication, // Ouvre dans app externe (Adobe Reader, etc.)
        );
      }
      return false;
    } catch (e) {
      print('❌ Erreur ouverture PDF: $e');
      return false;
    }
  }

  /// Retourne le type de document (pour affichage)
  static String getDocumentType(String url) {
    if (isPdf(url)) return 'PDF';
    if (isImage(url)) return 'Image';
    return 'Document';
  }
}
