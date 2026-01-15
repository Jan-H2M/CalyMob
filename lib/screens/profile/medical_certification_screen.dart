import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:file_picker/file_picker.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:cunning_document_scanner/cunning_document_scanner.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:path_provider/path_provider.dart';
import '../../config/app_assets.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/medical_certification.dart';
import '../../services/medical_certification_service.dart';
import '../../widgets/certification_status_badge.dart';
import '../../widgets/ocean_background.dart';
import 'certificate_presentation_screen.dart';

/// Écran de gestion du certificat médical
class MedicalCertificationScreen extends StatefulWidget {
  final String userId;

  const MedicalCertificationScreen({
    super.key,
    required this.userId,
  });

  @override
  State<MedicalCertificationScreen> createState() => _MedicalCertificationScreenState();
}

class _MedicalCertificationScreenState extends State<MedicalCertificationScreen> {
  final MedicalCertificationService _certService = MedicalCertificationService();
  final String _clubId = FirebaseConfig.defaultClubId;

  // Maximum file size: 10 MB
  static const int _maxFileSizeBytes = 10 * 1024 * 1024;

  MedicalCertification? _certification;
  bool _isLoading = true;
  bool _isUploading = false;

  @override
  void initState() {
    super.initState();
    _loadCertification();
  }

  Future<void> _loadCertification() async {
    setState(() => _isLoading = true);
    try {
      final cert = await _certService.getCurrentCertification(_clubId, widget.userId);
      setState(() {
        _certification = cert;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erreur de chargement: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text(
          'Certificat Médical',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
      ),
      body: OceanBackground(
        useFullBackground: true,
        child: SafeArea(
          child: _isLoading
              ? const Center(
                  child: CircularProgressIndicator(color: Colors.white),
                )
              : _buildContent(),
        ),
      ),
    );
  }

  Widget _buildContent() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Status card
          _buildStatusCard(),
          const SizedBox(height: 16),

          // Document preview
          if (_certification != null) ...[
            _buildDocumentPreview(),
            const SizedBox(height: 16),
          ],

          // Present button (only if valid)
          if (_certification?.canPresent == true) ...[
            _buildPresentButton(),
            const SizedBox(height: 16),
          ],

          // Upload section
          _buildUploadSection(),

          // Info text
          const SizedBox(height: 24),
          _buildInfoText(),
        ],
      ),
    );
  }

  Widget _buildStatusCard() {
    return Card(
      color: Colors.white.withOpacity(0.95),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      elevation: 4,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            Icon(
              Icons.medical_services_outlined,
              size: 48,
              color: AppColors.middenblauw,
            ),
            const SizedBox(height: 12),
            const Text(
              'Statut du certificat',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: AppColors.donkerblauw,
              ),
            ),
            const SizedBox(height: 16),
            CertificationStatusBadge(certification: _certification),
            if (_certification != null && _certification!.uploadedAt != null) ...[
              const SizedBox(height: 12),
              Text(
                'Téléchargé le ${_formatDate(_certification!.uploadedAt)}',
                style: TextStyle(
                  fontSize: 13,
                  color: Colors.grey[600],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildDocumentPreview() {
    final cert = _certification!;
    final isImage = cert.documentType == 'image';

    return Card(
      color: Colors.white.withOpacity(0.95),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      elevation: 4,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Icon(
                  isImage ? Icons.image : Icons.picture_as_pdf,
                  color: isImage ? AppColors.middenblauw : Colors.red[700],
                ),
                const SizedBox(width: 8),
                Text(
                  'Document actuel',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: AppColors.donkerblauw,
                  ),
                ),
              ],
            ),
          ),
          if (isImage)
            GestureDetector(
              onTap: () => _showFullScreenImage(cert.documentUrl),
              child: Container(
                height: 200,
                margin: const EdgeInsets.symmetric(horizontal: 16),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.grey[300]!),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Image.network(
                    cert.documentUrl,
                    fit: BoxFit.cover,
                    loadingBuilder: (context, child, progress) {
                      if (progress == null) return child;
                      return Center(
                        child: CircularProgressIndicator(
                          value: progress.expectedTotalBytes != null
                              ? progress.cumulativeBytesLoaded / progress.expectedTotalBytes!
                              : null,
                        ),
                      );
                    },
                    errorBuilder: (context, error, stack) {
                      return Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.broken_image, size: 48, color: Colors.grey[400]),
                            const SizedBox(height: 8),
                            Text('Image non disponible', style: TextStyle(color: Colors.grey[600])),
                          ],
                        ),
                      );
                    },
                  ),
                ),
              ),
            )
          else
            GestureDetector(
              onTap: () => _openPdf(cert.documentUrl),
              child: Container(
                margin: const EdgeInsets.symmetric(horizontal: 16),
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: Colors.red[50],
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.red[200]!),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.picture_as_pdf, size: 48, color: Colors.red[700]),
                    const SizedBox(width: 16),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          cert.fileName ?? 'Certificat médical.pdf',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w500,
                            color: Colors.red[900],
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Appuyez pour ouvrir',
                          style: TextStyle(
                            fontSize: 13,
                            color: Colors.red[700],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(width: 16),
                    Icon(Icons.open_in_new, color: Colors.red[400]),
                  ],
                ),
              ),
            ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }

  Widget _buildPresentButton() {
    return Card(
      color: AppColors.success.withOpacity(0.95),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      elevation: 4,
      child: InkWell(
        onTap: _presentCertificate,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.badge, size: 32, color: Colors.white),
              const SizedBox(width: 12),
              const Text(
                'Présenter mon certificat',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildUploadSection() {
    return Card(
      color: Colors.white.withOpacity(0.95),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      elevation: 4,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(Icons.cloud_upload_outlined, color: AppColors.middenblauw),
                const SizedBox(width: 8),
                Text(
                  _certification == null
                      ? 'Télécharger un certificat'
                      : 'Télécharger un nouveau certificat',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: AppColors.donkerblauw,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            if (_isUploading)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(20),
                  child: Column(
                    children: [
                      CircularProgressIndicator(),
                      SizedBox(height: 12),
                      Text('Téléchargement en cours...'),
                    ],
                  ),
                ),
              )
            else ...[
              // Scanner button (recommended)
              _buildUploadOption(
                icon: Icons.document_scanner,
                title: 'Scanner le document',
                subtitle: 'Scan automatique (recommandé)',
                color: AppColors.success,
                onTap: _scanDocument,
              ),
              const SizedBox(height: 12),

              // Camera button
              _buildUploadOption(
                icon: Icons.camera_alt,
                title: 'Prendre une photo',
                subtitle: 'Photographier votre certificat',
                color: AppColors.middenblauw,
                onTap: _pickFromCamera,
              ),
              const SizedBox(height: 12),

              // Gallery button
              _buildUploadOption(
                icon: Icons.photo_library,
                title: 'Choisir une image',
                subtitle: 'Depuis votre galerie',
                color: AppColors.lichtblauw,
                onTap: _pickFromGallery,
              ),
              const SizedBox(height: 12),

              // PDF button
              _buildUploadOption(
                icon: Icons.picture_as_pdf,
                title: 'Importer un PDF',
                subtitle: 'Depuis vos documents',
                color: Colors.red[400]!,
                onTap: _pickPdf,
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildUploadOption({
    required IconData icon,
    required String title,
    required String subtitle,
    required Color color,
    required VoidCallback onTap,
  }) {
    return Material(
      color: color.withOpacity(0.1),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: color.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: color, size: 28),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: AppColors.donkerblauw,
                      ),
                    ),
                    Text(
                      subtitle,
                      style: TextStyle(
                        fontSize: 13,
                        color: Colors.grey[600],
                      ),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: Colors.grey[400]),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildInfoText() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.2),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withOpacity(0.3)),
      ),
      child: Row(
        children: [
          Icon(Icons.info_outline, color: Colors.white.withOpacity(0.9), size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              'Votre certificat sera validé par un responsable du club. '
              'Vous serez notifié une fois la validation effectuée.',
              style: TextStyle(
                fontSize: 13,
                color: Colors.white.withOpacity(0.9),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Compresse une image pour réduire sa taille
  Future<File?> _compressImage(File file) async {
    try {
      final dir = await getTemporaryDirectory();
      final targetPath = '${dir.path}/compressed_${DateTime.now().millisecondsSinceEpoch}.jpg';

      final result = await FlutterImageCompress.compressAndGetFile(
        file.absolute.path,
        targetPath,
        quality: 70,
        minWidth: 1200,
        minHeight: 1600,
      );

      if (result != null) {
        return File(result.path);
      }
      return file; // Retourne l'original si la compression échoue
    } catch (e) {
      debugPrint('Erreur compression: $e');
      return file; // Retourne l'original en cas d'erreur
    }
  }

  Future<void> _scanDocument() async {
    try {
      // cunning_document_scanner uses native iOS VisionKit / Android ML Kit
      debugPrint('🔍 Scanner: Starting document scan...');

      final List<String>? scannedPaths = await CunningDocumentScanner.getPictures(
        isGalleryImportAllowed: true,
      );

      debugPrint('🔍 Scanner: Result: $scannedPaths');

      if (scannedPaths != null && scannedPaths.isNotEmpty) {
        debugPrint('🔍 Scanner: Found ${scannedPaths.length} scanned pages');

        // Use only the first scanned page for medical certificate
        final path = scannedPaths.first;
        debugPrint('🔍 Scanner: Processing path: $path');
        final originalFile = File(path);

        if (await originalFile.exists()) {
          final compressedFile = await _compressImage(originalFile);
          if (compressedFile != null) {
            debugPrint('🔍 Scanner: Uploading compressed file: ${compressedFile.path}');
            await _uploadFile(compressedFile, 'image', 'certificat_scan.jpg');
          }
        } else {
          debugPrint('🔍 Scanner: File does not exist at path: $path');
          _showError('Erreur: fichier scanné introuvable');
        }
      } else {
        debugPrint('🔍 Scanner: No documents scanned (user cancelled or empty result)');
      }
    } catch (e, stackTrace) {
      debugPrint('🔍 Scanner: Error: $e');
      debugPrint('🔍 Scanner: Stack trace: $stackTrace');
      // Check if user cancelled
      final errorMsg = e.toString().toLowerCase();
      if (errorMsg.contains('cancel') || errorMsg.contains('user')) {
        // User cancelled - no error message needed
        return;
      }
      _showError('Erreur lors du scan: $e');
    }
  }

  Future<void> _pickFromCamera() async {
    try {
      final ImagePicker picker = ImagePicker();
      final XFile? image = await picker.pickImage(
        source: ImageSource.camera,
        imageQuality: 85,
        maxWidth: 2048,
        maxHeight: 2048,
      );

      if (image != null) {
        await _uploadFile(File(image.path), 'image', image.name);
      }
    } catch (e) {
      _showError('Erreur caméra: $e');
    }
  }

  Future<void> _pickFromGallery() async {
    try {
      final ImagePicker picker = ImagePicker();
      final XFile? image = await picker.pickImage(
        source: ImageSource.gallery,
        imageQuality: 85,
        maxWidth: 2048,
        maxHeight: 2048,
      );

      if (image != null) {
        await _uploadFile(File(image.path), 'image', image.name);
      }
    } catch (e) {
      _showError('Erreur galerie: $e');
    }
  }

  Future<void> _pickPdf() async {
    try {
      FilePickerResult? result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['pdf'],
      );

      if (result != null && result.files.single.path != null) {
        await _uploadFile(
          File(result.files.single.path!),
          'pdf',
          result.files.single.name,
        );
      }
    } catch (e) {
      _showError('Erreur sélection PDF: $e');
    }
  }

  Future<void> _uploadFile(File file, String type, String? fileName) async {
    // Validate file size
    final fileSize = await file.length();
    if (fileSize > _maxFileSizeBytes) {
      final sizeMB = (fileSize / (1024 * 1024)).toStringAsFixed(1);
      _showError('Fichier trop volumineux ($sizeMB MB). Maximum: 10 MB');
      return;
    }

    setState(() => _isUploading = true);

    try {
      final cert = await _certService.uploadCertification(
        clubId: _clubId,
        userId: widget.userId,
        file: file,
        documentType: type,
        fileName: fileName,
      );

      setState(() {
        _certification = cert;
        _isUploading = false;
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Certificat téléchargé avec succès'),
            backgroundColor: AppColors.success,
          ),
        );
      }
    } catch (e) {
      setState(() => _isUploading = false);
      _showError('Erreur de téléchargement: $e');
    }
  }

  void _presentCertificate() {
    if (_certification == null || !_certification!.canPresent) return;

    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => CertificatePresentationScreen(
          certification: _certification!,
          userId: widget.userId,
        ),
      ),
    );
  }

  void _showFullScreenImage(String url) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => Scaffold(
          backgroundColor: Colors.black,
          appBar: AppBar(
            backgroundColor: Colors.black,
            iconTheme: const IconThemeData(color: Colors.white),
            title: const Text('Certificat', style: TextStyle(color: Colors.white)),
          ),
          body: Center(
            child: InteractiveViewer(
              minScale: 0.5,
              maxScale: 4.0,
              child: Image.network(url, fit: BoxFit.contain),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _openPdf(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else {
      _showError('Impossible d\'ouvrir le PDF');
    }
  }

  void _showError(String message) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  String _formatDate(DateTime date) {
    return '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';
  }
}
