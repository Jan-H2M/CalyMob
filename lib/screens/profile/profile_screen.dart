import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lottie/lottie.dart';
import '../../config/app_assets.dart';
import '../../config/app_colors.dart';
import '../../providers/auth_provider.dart';
import '../../providers/member_provider.dart';
import '../../models/member_profile.dart';
import '../../services/profile_service.dart';
import '../../services/member_service.dart';
import '../../services/medical_certification_service.dart';
import '../../services/camera_permission_service.dart';
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
import 'my_refunds_screen.dart';
import 'ma_cotisation_screen.dart';
import 'mes_recus_screen.dart';
import 'mes_abonnements_screen.dart';
import 'mes_prets_screen.dart';
import '../auth/login_screen.dart';
import '../exercises/member_exercises_screen.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

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
  // True als de gebruiker LIFRAS-validatie mag uitvoeren — admin OF
  // (Encadrant-functie + Moniteur-niveau MC/MF/MN). Mirrors
  // canValidateLifras() in firestore.rules + fieldMapper.ts.
  bool _canManageExercises = false;

  @override
  void initState() {
    super.initState();
    _checkPermissions();
  }

  @override
  void dispose() {
    super.dispose();
  }

  Future<void> _checkPermissions() async {
    final userId = context.read<AuthProvider>().currentUser?.uid ?? '';
    if (userId.isEmpty) return;

    final profile = await _profileService.getProfile(_clubId, userId);
    if (profile == null) return;

    final canValidate = PermissionHelper.canValidateLifras(
      clubStatuten: profile.clubStatuten,
      plongeurCode: profile.plongeurCode,
    );

    if (mounted) {
      setState(() => _canManageExercises = canValidate);
    }
  }

  Future<void> _addOrChangePhoto() async {
    try {
      // 1. Demander à l'utilisateur la source de la photo (caméra / galerie)
      final source = await _pickPhotoSource();
      if (source == null || !mounted) return;

      // 2. Récupérer un fichier image en fonction de la source choisie
      File? rawPhotoFile;
      if (source == _PhotoSource.camera) {
        // Vérifier/demander la permission caméra avant de lancer l'écran
        // (sinon la caméra échoue silencieusement sur Android 13+ / Samsung OneUI)
        final hasPermission =
            await CameraPermissionService.handlePermissionWithDialog(context);
        if (!hasPermission || !mounted) return;

        rawPhotoFile = await Navigator.push<File>(
          context,
          MaterialPageRoute(
            builder: (_) => const FaceCameraScreen(),
            fullscreenDialog: true,
          ),
        );
      } else {
        // Galerie : image_picker gère lui-même les permissions photothèque
        // (sur Android 13+ il utilise le Photo Picker système, sans permission).
        final picker = ImagePicker();
        final XFile? picked = await picker.pickImage(
          source: ImageSource.gallery,
          imageQuality: 90,
          maxWidth: 2048,
          maxHeight: 2048,
        );
        if (picked != null) {
          rawPhotoFile = File(picked.path);
        }
      }

      if (rawPhotoFile == null || !mounted) return;

      // 3. Recadrage 1:1 (cercle de prévisualisation) — utile surtout pour
      //    les photos importées depuis la galerie, mais aussi appliqué aux
      //    selfies pour homogénéiser le rendu.
      final photoFile = await _cropToProfileSquare(rawPhotoFile);
      if (photoFile == null || !mounted) {
        // Si l'utilisateur annule le recadrage, on nettoie le fichier source
        // (notamment celui copié par FaceCameraScreen dans le tempDir).
        try {
          await rawPhotoFile.delete();
        } catch (_) {/* best effort */}
        return;
      }

      // 4. Obtenir le profil actuel pour vérifier si c'est la première photo
      final userId = context.read<AuthProvider>().currentUser?.uid ?? '';
      final currentProfile = await _profileService.getProfile(_clubId, userId);
      final isFirstPhoto = currentProfile?.photoUrl == null;

      // 5. Demander les consentements
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
          // Nettoyer les fichiers temporaires (source brute + recadrée)
          try {
            await rawPhotoFile.delete();
          } catch (_) {/* best effort */}
          try {
            await photoFile.delete();
          } catch (_) {/* best effort */}
          return;
        }

        // 6. Uploader la photo
        setState(() => _isLoading = true);

        await _profileService.updateProfilePhoto(
          _clubId,
          userId,
          photoFile,
          consentInternalPhoto: consentResult.internalConsent,
          consentExternalPhoto: consentResult.externalConsent,
        );

        // Nettoyer les fichiers temporaires (source brute + recadrée)
        try {
          await rawPhotoFile.delete();
        } catch (_) {/* best effort */}
        try {
          await photoFile.delete();
        } catch (_) {/* best effort */}

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

  /// Affiche un bottom sheet pour choisir la source de la photo de profil :
  /// caméra (selfie via FaceCameraScreen) ou photothèque de l'appareil.
  /// Renvoie `null` si l'utilisateur annule.
  Future<_PhotoSource?> _pickPhotoSource() {
    return showModalBottomSheet<_PhotoSource>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Padding(
                padding: EdgeInsets.fromLTRB(20, 4, 20, 12),
                child: Text(
                  'Photo de profil',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              ListTile(
                leading: const Icon(
                  Icons.camera_alt_outlined,
                  color: AppColors.primary,
                ),
                title: const Text('Prendre une photo'),
                subtitle: const Text(
                  'Utiliser la caméra avec guidage du visage',
                ),
                onTap: () =>
                    Navigator.pop(sheetContext, _PhotoSource.camera),
              ),
              ListTile(
                leading: const Icon(
                  Icons.photo_library_outlined,
                  color: AppColors.primary,
                ),
                title: const Text('Choisir depuis la galerie'),
                subtitle: const Text(
                  'Importer une photo existante de votre appareil',
                ),
                onTap: () =>
                    Navigator.pop(sheetContext, _PhotoSource.gallery),
              ),
              const SizedBox(height: 4),
              TextButton(
                onPressed: () => Navigator.pop(sheetContext),
                child: const Text('Annuler'),
              ),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
  }

  /// Recadre l'image en 1:1 avec une prévisualisation circulaire,
  /// ratio verrouillé (idéal pour une photo de profil).
  /// Renvoie `null` si l'utilisateur annule.
  Future<File?> _cropToProfileSquare(File source) async {
    final cropped = await ImageCropper().cropImage(
      sourcePath: source.path,
      compressFormat: ImageCompressFormat.jpg,
      compressQuality: 90,
      aspectRatio: const CropAspectRatio(ratioX: 1, ratioY: 1),
      uiSettings: [
        AndroidUiSettings(
          toolbarTitle: 'Recadrer la photo',
          toolbarColor: AppColors.primary,
          toolbarWidgetColor: Colors.white,
          activeControlsWidgetColor: AppColors.primary,
          initAspectRatio: CropAspectRatioPreset.square,
          lockAspectRatio: true,
          hideBottomControls: false,
          // Note: UCrop (Android) ne supporte pas un cadre circulaire ;
          // l'aperçu reste carré mais l'avatar est rendu en cercle dans l'app.
        ),
        IOSUiSettings(
          title: 'Recadrer la photo',
          doneButtonTitle: 'Terminer',
          cancelButtonTitle: 'Annuler',
          aspectRatioLockEnabled: true,
          resetAspectRatioEnabled: false,
          rotateButtonsHidden: false,
          cropStyle: CropStyle.circle,
        ),
      ],
    );
    if (cropped == null) return null;
    return File(cropped.path);
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

    // Guard: don't render if user is not logged in (prevents Firestore empty path error)
    if (userId.isEmpty) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text('Mon Profil', style: TextStyle(color: Colors.white)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: OceanGradientBackground(
        creatures: CreatureSet.jellyfishAndBubbles,
        child: SafeArea(
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
            leading: const Icon(Icons.receipt, color: Colors.indigo),
            title: const Text('Mes remboursements'),
            subtitle: const Text('Suivi de vos demandes de remboursement'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => const MyRefundsScreen(),
              ),
            ),
          ),
          const Divider(height: 1),
          // Ma cotisation
          ListTile(
            leading: const Icon(Icons.card_membership, color: AppColors.middenblauw),
            title: const Text('Ma cotisation'),
            subtitle: const Text('Statut de votre cotisation annuelle'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const MaCotisationScreen()),
            ),
          ),
          const Divider(height: 1),
          // Mes reçus
          ListTile(
            leading: Icon(Icons.receipt_long, color: Colors.amber.shade700),
            title: const Text('Mes reçus'),
            subtitle: const Text('Historique de vos paiements'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const MesRecusScreen()),
            ),
          ),
          const Divider(height: 1),
          // Mes abonnements
          ListTile(
            leading: const Icon(Icons.subscriptions, color: Colors.deepPurple),
            title: const Text('Mes abonnements'),
            subtitle: const Text('Prochainement'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const MesAbonnementsScreen()),
            ),
          ),
          const Divider(height: 1),
          // Mes prêts
          ListTile(
            leading: const Icon(Icons.inventory_2, color: Colors.brown),
            title: const Text('Mes prêts'),
            subtitle: const Text('Matériel emprunté'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const MesPretsScreen()),
            ),
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

/// Source choisie par l'utilisateur pour la photo de profil.
enum _PhotoSource { camera, gallery }
