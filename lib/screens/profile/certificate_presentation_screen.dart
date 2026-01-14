import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lottie/lottie.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../config/app_assets.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/medical_certification.dart';
import '../../services/medical_certification_service.dart';
import '../../services/profile_service.dart';
import '../../models/member_profile.dart';

/// Écran de présentation du certificat médical (mode plein écran)
/// Affiche le certificat valide avec des éléments de sécurité visuels
class CertificatePresentationScreen extends StatefulWidget {
  final MedicalCertification certification;
  final String userId;

  const CertificatePresentationScreen({
    super.key,
    required this.certification,
    required this.userId,
  });

  @override
  State<CertificatePresentationScreen> createState() => _CertificatePresentationScreenState();
}

class _CertificatePresentationScreenState extends State<CertificatePresentationScreen>
    with TickerProviderStateMixin {
  final MedicalCertificationService _certService = MedicalCertificationService();
  final ProfileService _profileService = ProfileService();
  final String _clubId = FirebaseConfig.defaultClubId;

  MemberProfile? _memberProfile;
  MedicalCertification? _currentCert;
  bool _isLoading = true;
  bool _isValid = false;
  String? _invalidReason;
  DateTime _verificationTime = DateTime.now();

  late AnimationController _pulseController;
  late AnimationController _shimmerController;
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();

    // Keep portrait orientation for presentation mode
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
      DeviceOrientation.portraitDown,
    ]);

    // Pulse animation for the valid badge
    _pulseController = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat(reverse: true);

    // Shimmer animation for security effect
    _shimmerController = AnimationController(
      duration: const Duration(seconds: 3),
      vsync: this,
    )..repeat();

    _loadData();

    // Refresh data every 30 seconds to show it's live
    _refreshTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      _refreshVerification();
    });
  }

  @override
  void dispose() {
    _pulseController.dispose();
    _shimmerController.dispose();
    _refreshTimer?.cancel();
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
      DeviceOrientation.portraitDown,
    ]);
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);

    try {
      // Fetch fresh data from server
      final cert = await _certService.getCurrentCertification(_clubId, widget.userId);
      final profile = await _profileService.getProfile(_clubId, widget.userId);

      setState(() {
        _currentCert = cert;
        _memberProfile = profile;
        _verificationTime = DateTime.now();
        _isLoading = false;
      });

      _validateCertificate();
    } catch (e) {
      setState(() {
        _isLoading = false;
        _isValid = false;
        _invalidReason = 'Erreur de vérification';
      });
    }
  }

  void _refreshVerification() {
    setState(() {
      _verificationTime = DateTime.now();
    });
    _validateCertificate();
  }

  void _validateCertificate() {
    final cert = _currentCert;

    if (cert == null) {
      setState(() {
        _isValid = false;
        _invalidReason = 'Aucun certificat téléchargé';
      });
      return;
    }

    switch (cert.status) {
      case CertificateStatus.pending:
        setState(() {
          _isValid = false;
          _invalidReason = 'En attente de validation';
        });
        break;

      case CertificateStatus.rejected:
        setState(() {
          _isValid = false;
          _invalidReason = cert.rejectionReason ?? 'Certificat refusé';
        });
        break;

      case CertificateStatus.approved:
        if (cert.validUntil == null) {
          setState(() {
            _isValid = false;
            _invalidReason = 'Date de validité non définie';
          });
        } else if (cert.validUntil!.isBefore(DateTime.now())) {
          setState(() {
            _isValid = false;
            _invalidReason = 'Expiré le ${_formatDate(cert.validUntil!)}';
          });
        } else {
          setState(() {
            _isValid = true;
            _invalidReason = null;
          });
        }
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.donkerblauw,
      body: Stack(
        children: [
          // Animated background
          _buildAnimatedBackground(),

          // Content
          SafeArea(
            child: _isLoading
                ? const Center(
                    child: CircularProgressIndicator(color: Colors.white),
                  )
                : _isValid
                    ? _buildValidCertificate()
                    : _buildInvalidCertificate(),
          ),

          // Close button
          Positioned(
            top: MediaQuery.of(context).padding.top + 8,
            right: 16,
            child: IconButton(
              onPressed: () => Navigator.of(context).pop(),
              icon: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.3),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.close, color: Colors.white, size: 24),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAnimatedBackground() {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: _isValid
              ? [
                  AppColors.donkerblauw,
                  AppColors.middenblauw,
                  AppColors.lichtblauw.withOpacity(0.8),
                ]
              : [
                  Colors.grey[800]!,
                  Colors.grey[700]!,
                  Colors.grey[600]!,
                ],
        ),
      ),
      child: Stack(
        children: [
          // Bubbles animation (only if valid)
          if (_isValid)
            Positioned.fill(
              child: Opacity(
                opacity: 0.3,
                child: Lottie.asset(
                  'assets/animations/bubbles.json',
                  fit: BoxFit.cover,
                ),
              ),
            ),

          // Shimmer effect overlay
          AnimatedBuilder(
            animation: _shimmerController,
            builder: (context, child) {
              return Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment(-1 + 2 * _shimmerController.value, -0.5),
                    end: Alignment(-0.5 + 2 * _shimmerController.value, 0.5),
                    colors: [
                      Colors.transparent,
                      Colors.white.withOpacity(0.05),
                      Colors.transparent,
                    ],
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildValidCertificate() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          const SizedBox(height: 40),

          // Club logo
          Image.asset(
            AppAssets.logoNoBackground,
            height: 80,
          ),
          const SizedBox(height: 8),
          const Text(
            'CALYPSO',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: Colors.white,
              letterSpacing: 4,
            ),
          ),
          const Text(
            'Club de Plongée',
            style: TextStyle(
              fontSize: 14,
              color: Colors.white70,
              letterSpacing: 2,
            ),
          ),

          const SizedBox(height: 32),

          // Certificate card
          _buildCertificateCard(),

          const SizedBox(height: 24),

          // Valid badge with pulse animation
          AnimatedBuilder(
            animation: _pulseController,
            builder: (context, child) {
              return Transform.scale(
                scale: 1.0 + (_pulseController.value * 0.05),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
                  decoration: BoxDecoration(
                    color: AppColors.success,
                    borderRadius: BorderRadius.circular(50),
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.success.withOpacity(0.4 + _pulseController.value * 0.2),
                        blurRadius: 20,
                        spreadRadius: 2,
                      ),
                    ],
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.verified, color: Colors.white, size: 28),
                      const SizedBox(width: 12),
                      const Text(
                        'CERTIFICAT VALIDE',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                          letterSpacing: 1,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),

          const SizedBox(height: 16),

          // Validity date
          if (_currentCert?.validUntil != null)
            Text(
              'Valide jusqu\'au ${_formatDate(_currentCert!.validUntil!)}',
              style: const TextStyle(
                fontSize: 16,
                color: Colors.white,
                fontWeight: FontWeight.w500,
              ),
            ),

          const SizedBox(height: 32),

          // Verification timestamp
          _buildVerificationTimestamp(),
        ],
      ),
    );
  }

  Widget _buildCertificateCard() {
    final cert = _currentCert!;
    final isImage = cert.documentType == 'image';

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.3),
            blurRadius: 20,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        children: [
          // Member info header
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: AppColors.donkerblauw,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
            ),
            child: Row(
              children: [
                // Member photo or placeholder
                Container(
                  width: 60,
                  height: 60,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 2),
                  ),
                  child: ClipOval(
                    child: _memberProfile?.photoUrl != null
                        ? Image.network(
                            _memberProfile!.photoUrl!,
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => const Icon(
                              Icons.person,
                              size: 40,
                              color: AppColors.donkerblauw,
                            ),
                          )
                        : const Icon(
                            Icons.person,
                            size: 40,
                            color: AppColors.donkerblauw,
                          ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _memberProfile?.fullName ?? 'Membre',
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                      if (_memberProfile?.plongeurCode != null)
                        Text(
                          'Niveau ${_memberProfile!.plongeurCode}',
                          style: const TextStyle(
                            fontSize: 14,
                            color: Colors.white70,
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // Document preview
          if (isImage)
            GestureDetector(
              onTap: () => _showFullScreenDocument(),
              child: Container(
                height: 200,
                width: double.infinity,
                child: Image.network(
                  cert.documentUrl,
                  fit: BoxFit.cover,
                  loadingBuilder: (context, child, progress) {
                    if (progress == null) return child;
                    return const Center(child: CircularProgressIndicator());
                  },
                  errorBuilder: (_, __, ___) => Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.image, size: 48, color: Colors.grey[400]),
                        const SizedBox(height: 8),
                        Text('Appuyez pour voir', style: TextStyle(color: Colors.grey[600])),
                      ],
                    ),
                  ),
                ),
              ),
            )
          else
            GestureDetector(
              onTap: () => _showFullScreenDocument(),
              child: Container(
                height: 120,
                padding: const EdgeInsets.all(24),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.picture_as_pdf, size: 48, color: Colors.red[700]),
                    const SizedBox(width: 16),
                    Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Certificat médical',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                            color: AppColors.donkerblauw,
                          ),
                        ),
                        Text(
                          'Appuyez pour voir le document',
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
            ),

          // Footer with medical icon
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.grey[50],
              borderRadius: const BorderRadius.vertical(bottom: Radius.circular(20)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.medical_services, color: AppColors.middenblauw, size: 20),
                const SizedBox(width: 8),
                Text(
                  'Certificat médical de non contre-indication',
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey[700],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInvalidCertificate() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Club logo (dimmed)
            Opacity(
              opacity: 0.5,
              child: Image.asset(
                AppAssets.logoNoBackground,
                height: 60,
              ),
            ),
            const SizedBox(height: 32),

            // Warning icon
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: Colors.red.withOpacity(0.2),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.warning_amber_rounded,
                size: 64,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 24),

            // Title
            const Text(
              'CERTIFICAT NON VALIDE',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.bold,
                color: Colors.white,
                letterSpacing: 1,
              ),
            ),
            const SizedBox(height: 24),

            // Reason card
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.1),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Colors.white.withOpacity(0.2)),
              ),
              child: Column(
                children: [
                  Text(
                    'Votre certificat médical n\'est pas disponible.',
                    style: TextStyle(
                      fontSize: 16,
                      color: Colors.white.withOpacity(0.9),
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    decoration: BoxDecoration(
                      color: Colors.red.withOpacity(0.3),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      'Raison: $_invalidReason',
                      style: const TextStyle(
                        fontSize: 14,
                        color: Colors.white,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    'Veuillez télécharger un nouveau certificat.',
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.white.withOpacity(0.7),
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),

            const SizedBox(height: 32),

            // Back button
            ElevatedButton.icon(
              onPressed: () => Navigator.of(context).pop(),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: AppColors.donkerblauw,
                padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(30),
                ),
              ),
              icon: const Icon(Icons.arrow_back),
              label: const Text(
                'Retour au profil',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildVerificationTimestamp() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.2),
        borderRadius: BorderRadius.circular(30),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.access_time, color: Colors.white70, size: 18),
          const SizedBox(width: 8),
          Text(
            'Vérifié le ${_formatDateTime(_verificationTime)}',
            style: const TextStyle(
              fontSize: 13,
              color: Colors.white70,
            ),
          ),
        ],
      ),
    );
  }

  void _showFullScreenDocument() {
    if (_currentCert == null) return;

    final cert = _currentCert!;
    final isImage = cert.documentType == 'image';

    if (isImage) {
      // Show image in full screen with zoom
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
                child: Image.network(
                  cert.documentUrl,
                  fit: BoxFit.contain,
                ),
              ),
            ),
          ),
        ),
      );
    } else {
      // Open PDF in external application
      _openPdf(cert.documentUrl);
    }
  }

  Future<void> _openPdf(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Impossible d\'ouvrir le PDF'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  String _formatDate(DateTime date) {
    return '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';
  }

  String _formatDateTime(DateTime date) {
    return '${_formatDate(date)} ${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
  }
}
