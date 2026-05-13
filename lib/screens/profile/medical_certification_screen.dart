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
    // C.5 polish — state-aware banner per _carnet_plan §3.1.10.
    final cert = _certification;
    final _BannerStyle style = _resolveBannerStyle(cert);

    return Container(
      decoration: BoxDecoration(
        color: style.bg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: style.borderColor, width: 1.5),
        boxShadow: [
          BoxShadow(
            color: style.borderColor.withValues(alpha: 0.30),
            blurRadius: 14,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          Icon(style.icon, size: 44, color: style.fg),
          const SizedBox(height: 10),
          Text(
            style.heading,
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.bold,
              color: style.fg,
              letterSpacing: 0.4,
            ),
          ),
          if (style.subheading != null) ...[
            const SizedBox(height: 4),
            Text(
              style.subheading!,
              style: TextStyle(
                fontSize: 14,
                color: style.fg.withValues(alpha: 0.85),
              ),
              textAlign: TextAlign.center,
            ),
          ],
          const SizedBox(height: 12),
          CertificationStatusBadge(certification: cert),
          if (cert != null) ...[
            const SizedBox(height: 10),
            Text(
              'Téléchargé le ${_formatDate(cert.uploadedAt)}',
              style: TextStyle(
                fontSize: 12.5,
                color: style.fg.withValues(alpha: 0.75),
              ),
            ),
          ],
        ],
      ),
    );
  }

  _BannerStyle _resolveBannerStyle(MedicalCertification? cert) {
    if (cert == null) {
      return _BannerStyle(
        heading: 'AUCUN CERTIFICAT',
        subheading:
            'Télécharge ton certificat pour pouvoir t\'inscrire aux sorties.',
        icon: Icons.error_outline,
        fg: const Color(0xFFB91C1C), // red-700
        bg: const Color(0xFFFEE2E2), // red-100
        borderColor: const Color(0xFFFCA5A5),
      );
    }
    if (cert.status == CertificateStatus.pending) {
      return _BannerStyle(
        heading: 'EN ATTENTE',
        subheading:
            'Ton certificat est en cours d\'examen par l\'administration.',
        icon: Icons.hourglass_top,
        fg: const Color(0xFFB45309), // amber-700
        bg: const Color(0xFFFEF3C7), // amber-100
        borderColor: const Color(0xFFFCD34D),
      );
    }
    if (cert.status == CertificateStatus.rejected) {
      return _BannerStyle(
        heading: 'REFUSÉ',
        subheading: cert.rejectionReason != null && cert.rejectionReason!.isNotEmpty
            ? 'Motif : ${cert.rejectionReason!}'
            : 'Merci de téléverser un nouveau certificat.',
        icon: Icons.cancel_outlined,
        fg: const Color(0xFFB91C1C),
        bg: const Color(0xFFFEE2E2),
        borderColor: const Color(0xFFFCA5A5),
      );
    }
    if (cert.isExpired) {
      return _BannerStyle(
        heading: 'EXPIRÉ',
        subheading:
            'Ton certificat n\'est plus valable — téléverse-en un nouveau pour réinscrire.',
        icon: Icons.warning_amber_outlined,
        fg: const Color(0xFFB91C1C),
        bg: const Color(0xFFFEE2E2),
        borderColor: const Color(0xFFFCA5A5),
      );
    }
    if (cert.isExpiringSoon) {
      final days = cert.daysUntilExpiry ?? 0;
      return _BannerStyle(
        heading: 'BIENTÔT EXPIRÉ',
        subheading: days <= 1
            ? 'Plus que quelques heures avant l\'expiration.'
            : 'Encore $days jour${days > 1 ? 's' : ''} — pense à renouveler.',
        icon: Icons.timelapse,
        fg: const Color(0xFFC2410C), // orange-700
        bg: const Color(0xFFFFEDD5), // orange-100
        borderColor: const Color(0xFFFDBA74),
      );
    }
    // Valide
    final days = cert.daysUntilExpiry ?? 0;
    return _BannerStyle(
      heading: 'VALIDE',
      subheading: days > 0 ? 'Encore $days jours.' : null,
      icon: Icons.verified_outlined,
      fg: const Color(0xFF15803D), // green-700
      bg: const Color(0xFFDCFCE7), // green-100
      borderColor: const Color(0xFF86EFAC),
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

/// Visual style for the C.5 banner header — one struct per status
/// (valide / bientôt expiré / expiré / en attente / refusé / aucun).
class _BannerStyle {
  final String heading;
  final String? subheading;
  final IconData icon;
  final Color fg;
  final Color bg;
  final Color borderColor;

  const _BannerStyle({
    required this.heading,
    required this.icon,
    required this.fg,
    required this.bg,
    required this.borderColor,
    this.subheading,
  });
}
