import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:lottie/lottie.dart';
import '../../config/app_assets.dart';
import '../../config/app_colors.dart';
import '../../providers/auth_provider.dart';
import '../../providers/member_provider.dart';
import '../../models/member_profile.dart';
import '../../services/profile_service.dart';
import '../../services/member_service.dart';
import '../../services/medical_certification_service.dart';
import '../../models/medical_certification.dart';
import '../../widgets/certification_status_badge.dart';
import 'medical_certification_screen.dart';
import '../../utils/permission_helper.dart';
import '../../widgets/photo_consent_dialog.dart';
import '../../widgets/user_qr_card.dart';
// Conditional import for camera screen
import 'face_camera_screen.dart' if (dart.library.html) 'face_camera_screen_stub.dart';
import 'settings_screen.dart';
import 'calendar_feed_screen.dart';
import '../auth/login_screen.dart';
import '../exercises/member_exercises_screen.dart';

/// Écran du profil utilisateur
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> with TickerProviderStateMixin {
  final String _clubId = 'calypso';
  final ProfileService _profileService = ProfileService();
  final MemberService _memberService = MemberService();
  final MedicalCertificationService _certService = MedicalCertificationService();

  bool _isLoading = false;
  bool _canManageExercises = false; // Monitor, admin, or super admin

  // Splash animation controllers
  late AnimationController _leftSplashController;
  late AnimationController _rightSplashController;
  Timer? _splashTimer;
  bool _isLeftSplashTurn = true;

  @override
  void initState() {
    super.initState();
    _checkPermissions();
    _initSplashAnimations();
  }

  void _initSplashAnimations() {
    // Initialize animation controllers
    _leftSplashController = AnimationController(vsync: this);
    _rightSplashController = AnimationController(vsync: this);

    // Start left splash after 4 seconds
    Future.delayed(const Duration(seconds: 4), () {
      if (mounted) {
        _leftSplashController.forward(from: 0);
      }
    });

    // Start right splash after 5 seconds
    Future.delayed(const Duration(seconds: 5), () {
      if (mounted) {
        _rightSplashController.forward(from: 0);
      }
    });

    // Continue alternating every 10 seconds
    _splashTimer = Timer.periodic(const Duration(seconds: 10), (timer) {
      if (mounted) {
        if (_isLeftSplashTurn) {
          _leftSplashController.forward(from: 0);
        } else {
          _rightSplashController.forward(from: 0);
        }
        _isLeftSplashTurn = !_isLeftSplashTurn;
      }
    });
  }

  @override
  void dispose() {
    _leftSplashController.dispose();
    _rightSplashController.dispose();
    _splashTimer?.cancel();
    super.dispose();
  }

  Future<void> _checkPermissions() async {
    final userId = context.read<AuthProvider>().currentUser?.uid ?? '';
    if (userId.isNotEmpty) {
      // Check if user is a monitor
      final isMonitor = await _memberService.isMonitor(_clubId, userId);

      // Check if user is admin based on clubStatuten
      final profile = await _profileService.getProfile(_clubId, userId);
      final isAdmin = profile != null && PermissionHelper.isAdmin(profile.clubStatuten);

      if (mounted) {
        setState(() => _canManageExercises = isMonitor || isAdmin);
      }
    }
  }

  Future<void> _addOrChangePhoto() async {
    try {
      // 1. Lancer la caméra avec détection de visage
      final photoFile = await Navigator.push<File>(
        context,
        MaterialPageRoute(
          builder: (_) => const FaceCameraScreen(),
          fullscreenDialog: true,
        ),
      );

      if (photoFile == null || !mounted) return;

      // 2. Obtenir le profil actuel pour vérifier si c'est la première photo
      final userId = context.read<AuthProvider>().currentUser?.uid ?? '';
      final currentProfile = await _profileService.getProfile(_clubId, userId);
      final isFirstPhoto = currentProfile?.photoUrl == null;

      // 3. Demander les consentements
      if (mounted) {
        final consentResult = await showDialog<PhotoConsentResult>(
          context: context,
          barrierDismissible: false,
          builder: (context) => PhotoConsentDialog(
            initialInternalConsent: currentProfile?.consentInternalPhoto ?? false,
            initialExternalConsent: currentProfile?.consentExternalPhoto ?? false,
            isFirstPhoto: isFirstPhoto,
          ),
        );

        if (consentResult == null || !mounted) {
          // Supprimer le fichier temporaire
          await photoFile.delete();
          return;
        }

        // 4. Uploader la photo
        setState(() => _isLoading = true);

        await _profileService.updateProfilePhoto(
          _clubId,
          userId,
          photoFile,
          consentInternalPhoto: consentResult.internalConsent,
          consentExternalPhoto: consentResult.externalConsent,
        );

        // Supprimer le fichier temporaire
        await photoFile.delete();

        if (mounted) {
          setState(() => _isLoading = false);
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('✅ Photo de profil mise à jour'),
              backgroundColor: Colors.green,
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('❌ Erreur: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _editConsents(MemberProfile profile) async {
    final result = await showDialog<PhotoConsentResult>(
      context: context,
      builder: (context) => EditConsentDialog(
        currentInternalConsent: profile.consentInternalPhoto,
        currentExternalConsent: profile.consentExternalPhoto,
      ),
    );

    if (result != null && mounted) {
      try {
        setState(() => _isLoading = true);

        final userId = context.read<AuthProvider>().currentUser?.uid ?? '';
        await _profileService.updatePhotoConsents(
          _clubId,
          userId,
          consentInternal: result.internalConsent,
          consentExternal: result.externalConsent,
        );

        if (mounted) {
          setState(() => _isLoading = false);
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('✅ Consentements mis à jour'),
              backgroundColor: Colors.green,
            ),
          );
        }
      } catch (e) {
        if (mounted) {
          setState(() => _isLoading = false);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('❌ Erreur: $e'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    }
  }

  Future<void> _handlePasswordReset() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Réinitialiser le mot de passe'),
        content: const Text(
          'Un email de réinitialisation sera envoyé à votre adresse email.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Annuler'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Envoyer'),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      try {
        await context.read<AuthProvider>().sendPasswordResetEmail();

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('✅ Email de réinitialisation envoyé'),
              backgroundColor: Colors.green,
            ),
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('❌ Erreur: $e'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    }
  }

  Future<void> _handleLogout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Déconnexion'),
        content: const Text('Voulez-vous vous déconnecter ?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Annuler'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Déconnecter', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      await context.read<AuthProvider>().logout();
      context.read<MemberProvider>().clear();

      if (mounted) {
        Navigator.of(context).pushAndRemoveUntil(
          MaterialPageRoute(builder: (_) => const LoginScreen()),
          (route) => false,
        );
      }
    }
  }

  Future<void> _editPhoneNumber(MemberProfile profile) async {
    final controller = TextEditingController(text: profile.phoneNumber ?? '');

    final result = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Numéro de téléphone'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(
            hintText: '+32 XXX XX XX XX',
            prefixIcon: Icon(Icons.phone),
            border: OutlineInputBorder(),
          ),
          keyboardType: TextInputType.phone,
          autofocus: true,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Annuler'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: const Text('Enregistrer'),
          ),
        ],
      ),
    );

    if (result != null && mounted) {
      try {
        setState(() => _isLoading = true);

        final userId = context.read<AuthProvider>().currentUser?.uid ?? '';
        await _profileService.updatePhoneNumber(
          _clubId,
          userId,
          result.isEmpty ? null : result,
        );

        if (mounted) {
          setState(() => _isLoading = false);
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('✅ Numéro de téléphone mis à jour'),
              backgroundColor: Colors.green,
            ),
          );
        }
      } catch (e) {
        if (mounted) {
          setState(() => _isLoading = false);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('❌ Erreur: $e'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final userId = context.watch<AuthProvider>().currentUser?.uid ?? '';

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text('Mon Profil', style: TextStyle(color: Colors.white)),
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
          // Content
          SafeArea(
            child: StreamBuilder<MemberProfile?>(
              stream: _profileService.watchProfile(_clubId, userId),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator(color: Colors.white));
                }

                if (!snapshot.hasData || snapshot.data == null) {
                  return const Center(
                    child: Text('Erreur de chargement du profil', style: TextStyle(color: Colors.white)),
                  );
                }

                final profile = snapshot.data!;

                return Stack(
                  children: [
                    SingleChildScrollView(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          // Photo de profil
                          _buildPhotoSection(profile),

                          const SizedBox(height: 24),

                          // QR Code
                          UserQRCard(profile: profile),

                          const SizedBox(height: 24),

                          // Informations personnelles
                          _buildInfoSection(profile),

                          const SizedBox(height: 24),

                          // Consentements photo
                          if (profile.hasPhoto) ...[
                            _buildConsentSection(profile),
                            const SizedBox(height: 24),
                          ],

                          // Actions
                          _buildActionsSection(),
                        ],
                      ),
                    ),

                    // Loading overlay
                    if (_isLoading)
                      Container(
                        color: Colors.black54,
                        child: const Center(
                          child: CircularProgressIndicator(color: Colors.white),
                        ),
                      ),
                  ],
                );
              },
            ),
          ),
          // Left splash animation - top left, throwing water to the right (IN FRONT)
          Positioned(
            top: 20,
            left: -80,
            child: IgnorePointer(
              child: Lottie.asset(
                'assets/animations/splash.json',
                width: 350,
                height: 350,
                controller: _leftSplashController,
                onLoaded: (composition) {
                  _leftSplashController.duration = composition.duration;
                },
              ),
            ),
          ),
          // Right splash animation - top right, mirrored (throwing water to the left) (IN FRONT)
          Positioned(
            top: 20,
            right: -80,
            child: IgnorePointer(
              child: Transform.flip(
                flipX: true,
                child: Lottie.asset(
                  'assets/animations/splash.json',
                  width: 350,
                  height: 350,
                  controller: _rightSplashController,
                  onLoaded: (composition) {
                    _rightSplashController.duration = composition.duration;
                  },
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPhotoSection(MemberProfile profile) {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            // Photo
            GestureDetector(
              onTap: _addOrChangePhoto,
              child: Stack(
                children: [
                  Container(
                    width: 120,
                    height: 120,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.grey.shade200,
                      border: Border.all(
                        color: AppColors.middenblauw,
                        width: 3,
                      ),
                    ),
                    child: ClipOval(
                      child: profile.hasPhoto
                          ? CachedNetworkImage(
                              imageUrl: profile.photoUrl!,
                              fit: BoxFit.cover,
                              placeholder: (context, url) => const Center(
                                child: CircularProgressIndicator(),
                              ),
                              errorWidget: (context, url, error) => Icon(
                                Icons.person,
                                size: 60,
                                color: Colors.grey.shade400,
                              ),
                            )
                          : Icon(
                              Icons.person,
                              size: 60,
                              color: Colors.grey.shade400,
                            ),
                    ),
                  ),
                  // Badge caméra
                  Positioned(
                    bottom: 0,
                    right: 0,
                    child: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: const BoxDecoration(
                        color: AppColors.middenblauw,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.camera_alt,
                        color: Colors.white,
                        size: 20,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // Nom complet
            Text(
              profile.fullName,
              style: const TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
              ),
              textAlign: TextAlign.center,
            ),

            if (profile.plongeurNiveau != null) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: _getNiveauColor(profile.plongeurCode),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Text(
                  profile.plongeurNiveau!,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],

            const SizedBox(height: 12),

            // Bouton changer photo
            TextButton.icon(
              onPressed: _addOrChangePhoto,
              icon: Icon(profile.hasPhoto ? Icons.edit : Icons.add_a_photo),
              label: Text(profile.hasPhoto ? 'Changer la photo' : 'Ajouter une photo'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInfoSection(MemberProfile profile) {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.info, color: Colors.grey.shade700),
                const SizedBox(width: 12),
                const Text(
                  'Informations',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),

            const Divider(height: 24),

            // Email (lecture seule)
            ListTile(
              leading: const Icon(Icons.email, color: Colors.blue),
              title: const Text('Email', style: TextStyle(fontSize: 12, color: Colors.grey)),
              subtitle: Text(profile.email, style: const TextStyle(fontSize: 16)),
              dense: true,
              contentPadding: EdgeInsets.zero,
            ),

            const SizedBox(height: 8),

            // Nom (lecture seule)
            ListTile(
              leading: const Icon(Icons.person, color: Colors.green),
              title: const Text('Nom complet', style: TextStyle(fontSize: 12, color: Colors.grey)),
              subtitle: Text(profile.fullName, style: const TextStyle(fontSize: 16)),
              dense: true,
              contentPadding: EdgeInsets.zero,
            ),

            if (profile.role != null) ...[
              const SizedBox(height: 8),
              ListTile(
                leading: const Icon(Icons.badge, color: Colors.orange),
                title: const Text('Rôle', style: TextStyle(fontSize: 12, color: Colors.grey)),
                subtitle: Text(profile.role!, style: const TextStyle(fontSize: 16)),
                dense: true,
                contentPadding: EdgeInsets.zero,
              ),
            ],

            const SizedBox(height: 8),

            // Téléphone (éditable)
            ListTile(
              leading: const Icon(Icons.phone, color: Colors.purple),
              title: const Text('Téléphone', style: TextStyle(fontSize: 12, color: Colors.grey)),
              subtitle: Text(
                profile.phoneNumber ?? 'Non renseigné',
                style: TextStyle(
                  fontSize: 16,
                  fontStyle: profile.phoneNumber == null ? FontStyle.italic : FontStyle.normal,
                  color: profile.phoneNumber == null ? Colors.grey : null,
                ),
              ),
              trailing: IconButton(
                icon: const Icon(Icons.edit, size: 20),
                onPressed: () => _editPhoneNumber(profile),
                tooltip: 'Modifier le téléphone',
              ),
              dense: true,
              contentPadding: EdgeInsets.zero,
              onTap: () => _editPhoneNumber(profile),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildConsentSection(MemberProfile profile) {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.privacy_tip, color: Colors.grey.shade700),
                const SizedBox(width: 12),
                const Text(
                  'Consentements photo',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const Spacer(),
                IconButton(
                  onPressed: () => _editConsents(profile),
                  icon: Icon(Icons.edit, size: 20, color: AppColors.middenblauw),
                  tooltip: 'Modifier les consentements',
                ),
              ],
            ),

            const Divider(height: 24),

            // Consentement interne
            ListTile(
              leading: Icon(
                profile.consentInternalPhoto ? Icons.check_circle : Icons.cancel,
                color: profile.consentInternalPhoto ? Colors.green : Colors.red,
              ),
              title: const Text('Usage interne'),
              subtitle: const Text('Visible par les membres du club'),
              dense: true,
              contentPadding: EdgeInsets.zero,
            ),

            const SizedBox(height: 8),

            // Consentement externe
            ListTile(
              leading: Icon(
                profile.consentExternalPhoto ? Icons.check_circle : Icons.cancel,
                color: profile.consentExternalPhoto ? Colors.green : Colors.grey,
              ),
              title: const Text('Usage externe'),
              subtitle: const Text('Réseaux sociaux, site web public'),
              dense: true,
              contentPadding: EdgeInsets.zero,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildActionsSection() {
    final userId = context.watch<AuthProvider>().currentUser?.uid ?? '';

    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Column(
        children: [
          // Certificat médical
          StreamBuilder<MedicalCertification?>(
            stream: _certService.watchCurrentCertification(_clubId, userId),
            builder: (context, snapshot) {
              final cert = snapshot.data;
              return ListTile(
                leading: const Icon(Icons.medical_services, color: AppColors.middenblauw),
                title: const Text('Certificat médical'),
                subtitle: Row(
                  children: [
                    Flexible(
                      child: CertificationStatusBadge(
                        certification: cert,
                        compact: true,
                      ),
                    ),
                  ],
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => MedicalCertificationScreen(userId: userId),
                  ),
                ),
              );
            },
          ),
          const Divider(height: 1),
          // Mes exercices validés
          ListTile(
            leading: const Icon(Icons.assignment_turned_in, color: Colors.teal),
            title: const Text('Mes exercices validés'),
            subtitle: const Text('Formation LIFRAS'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () async {
              final profile = await _profileService.getProfile(_clubId, userId);
              if (mounted && profile != null) {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => MemberExercisesScreen(
                      memberId: userId,
                      memberName: profile.fullName,
                      isMonitor: _canManageExercises,
                      isOwnProfile: true,
                    ),
                  ),
                );
              }
            },
          ),
          const Divider(height: 1),
          ListTile(
            leading: Icon(Icons.calendar_month, color: Colors.teal.shade700),
            title: const Text('Synchronisation calendrier'),
            subtitle: const Text('Ajouter les événements à votre agenda'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const CalendarFeedScreen()),
            ),
          ),
          const Divider(height: 1),
          ListTile(
            leading: Icon(Icons.settings, color: AppColors.middenblauw),
            title: const Text('Paramètres'),
            subtitle: const Text('Notifications et vie privée'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const SettingsScreen()),
            ),
          ),
          const Divider(height: 1),
          ListTile(
            leading: const Icon(Icons.lock, color: Colors.blue),
            title: const Text('Changer le mot de passe'),
            trailing: const Icon(Icons.chevron_right),
            onTap: _handlePasswordReset,
          ),
          const Divider(height: 1),
          ListTile(
            leading: const Icon(Icons.logout, color: Colors.red),
            title: const Text('Déconnexion', style: TextStyle(color: Colors.red)),
            trailing: const Icon(Icons.chevron_right, color: Colors.red),
            onTap: _handleLogout,
          ),
        ],
      ),
    );
  }

  Color _getNiveauColor(String? code) {
    if (code == null) return Colors.grey;

    switch (code.toUpperCase()) {
      case '1':
      case 'NB':
        return Colors.grey;
      case '2':
      case 'P2':
        return Colors.blue;
      case '3':
      case 'P3':
        return Colors.green;
      case '4':
      case 'P4':
        return Colors.orange;
      case 'AM':
        return Colors.purple;
      case 'MC':
      case 'MF':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }
}
