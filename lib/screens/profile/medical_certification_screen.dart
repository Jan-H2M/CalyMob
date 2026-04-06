import 'dart:io';
import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:cunning_document_scanner/cunning_document_scanner.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:path_provider/path_provider.dart';
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

              // Import file button (images or PDF)
              _buildUploadOption(
                icon: Icons.folder_open,
                title: 'Importer un fichier',
                subtitle: 'Image ou PDF depuis vos fichiers',
                color: AppColors.middenblauw,
                onTap: _pickFile,
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
            // Use current year for the certificate name (matching CalyCompta convention)
            final year = DateTime.now().year;
            await _uploadFile(compressedFile, 'image', 'Certificat médical $year');
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

  Future<void> _pickFile() async {
    try {
      FilePickerResult? result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['jpg', 'jpeg', 'png', 'pdf'],
      );

      if (result != null && result.files.single.path != null) {
        final file = File(result.files.single.path!);
        final extension = result.files.single.extension?.toLowerCase();
        final isPdf = extension == 'pdf';
        final year = DateTime.now().year;

        await _uploadFile(
          file,
          isPdf ? 'pdf' : 'image',
          'Certificat médical $year',
        );
      }
    } catch (e) {
      _showError('Erreur sélection fichier: $e');
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
