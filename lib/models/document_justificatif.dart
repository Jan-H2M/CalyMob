import 'package:cloud_firestore/cloud_firestore.dart';

/// Document justificatif attaché à une opération
/// Structure identique à CalyCompta pour compatibilité Firestore
class DocumentJustificatif {
  final String url;
  final String nomOriginal;
  final String nomAffichage;
  final String type; // MIME type (application/pdf, image/jpeg, etc.)
  final int taille; // Size in bytes
  final DateTime dateUpload;
  final String? uploadedBy;
  final String? uploadedByNom;

  DocumentJustificatif({
    required this.url,
    required this.nomOriginal,
    required this.nomAffichage,
    required this.type,
    required this.taille,
    required this.dateUpload,
    this.uploadedBy,
    this.uploadedByNom,
  });

  /// Parse from Firestore map
  factory DocumentJustificatif.fromMap(Map<String, dynamic> map) {
    return DocumentJustificatif(
      url: map['url'] ?? '',
      nomOriginal: map['nom_original'] ?? '',
      nomAffichage: map['nom_affichage'] ?? map['nom_original'] ?? '',
      type: map['type'] ?? 'application/octet-stream',
      taille: map['taille'] ?? 0,
      dateUpload:
          (map['date_upload'] as Timestamp?)?.toDate() ?? DateTime.now(),
      uploadedBy: map['uploaded_by'],
      uploadedByNom: map['uploaded_by_nom'],
    );
  }

  /// Check if document is a PDF
  bool get isPdf => type.contains('pdf');

  /// Check if document is an image
  bool get isImage => type.startsWith('image/');

  /// Get human-readable file size
  String get formattedSize {
    if (taille < 1024) return '$taille B';
    if (taille < 1024 * 1024) {
      return '${(taille / 1024).toStringAsFixed(1)} KB';
    }
    return '${(taille / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}
