/// Phase C polish (2026-05-13) — Identité detail screen.
///
/// Ported from the inline Informations + Consentements + Photo sections
/// of the old monolithic `profile_screen.dart` per §3.1.10 mockup.
///
/// Read-only fields: email, full name, niveau LIFRAS, member id, membership
/// date. Editable: phone, profile photo (camera/gallery + cropper + consent),
/// consentements photo.

import 'dart:async';
import 'dart:io';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../../config/app_colors.dart';
import '../../models/member_profile.dart';
import '../../providers/auth_provider.dart';
import '../../services/camera_permission_service.dart';
import '../../services/profile_service.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import '../../widgets/photo_consent_dialog.dart';
import 'face_camera_screen.dart' if (dart.library.html) 'face_camera_screen_stub.dart';
import 'mes_brevets_screen.dart';

enum _PhotoSource { camera, gallery }

class IdentiteScreen extends StatefulWidget {
  const IdentiteScreen({super.key});

  @override
  State<IdentiteScreen> createState() => _IdentiteScreenState();
}

class _IdentiteScreenState extends State<IdentiteScreen> {
  final String _clubId = 'calypso';
  final ProfileService _profileService = ProfileService();
  bool _isLoading = false;

  @override
  Widget build(BuildContext context) {
    final userId = context.watch<AuthProvider>().currentUser?.uid ?? '';
    if (userId.isEmpty) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title:
            const Text('Identité', style: TextStyle(color: Colors.white)),
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
                return const Center(
                  child: CircularProgressIndicator(color: Colors.white),
                );
              }
              if (!snapshot.hasData || snapshot.data == null) {
                return const Center(
                  child: Text(
                    'Erreur de chargement',
                    style: TextStyle(color: Colors.white),
                  ),
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
                        _photoCard(profile),
                        const SizedBox(height: 16),
                        _infoCard(profile),
                        const SizedBox(height: 16),
                        _mesBrevetsCard(),
                        const SizedBox(height: 16),
                        if (profile.hasPhoto) _consentCard(profile),
                      ],
                    ),
                  ),
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

  // ---------- Mes brevets (WP-08) ----------
  Widget _mesBrevetsCard() {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      child: ListTile(
        leading: const Icon(Icons.workspace_premium, color: AppColors.middenblauw),
        title: const Text('Mes brevets'),
        subtitle: const Text('Historique et dates d\'homologation'),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const MesBrevetsScreen()),
        ),
      ),
    );
  }

  // ---------- Photo ----------
  Widget _photoCard(MemberProfile profile) {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
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
                              placeholder: (_, __) => const Center(
                                child: CircularProgressIndicator(),
                              ),
                              errorWidget: (_, __, ___) => Icon(
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
                  Positioned(
                    bottom: 0,
                    right: 0,
                    child: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: const BoxDecoration(
                        color: AppColors.middenblauw,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.camera_alt,
                          color: Colors.white, size: 20),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            TextButton.icon(
              onPressed: _addOrChangePhoto,
              icon: Icon(profile.hasPhoto ? Icons.edit : Icons.add_a_photo),
              label: Text(profile.hasPhoto
                  ? 'Changer la photo'
                  : 'Ajouter une photo'),
            ),
          ],
        ),
      ),
    );
  }

  // ---------- Info ----------
  Widget _infoCard(MemberProfile profile) {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.info_outline, color: Colors.grey.shade700),
                const SizedBox(width: 12),
                const Text(
                  'Informations',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
              ],
            ),
            const Divider(height: 24),
            _row(
              icon: Icons.email_outlined,
              color: Colors.blue,
              label: 'Email',
              value: profile.email,
              hint: '(modifiable par un admin uniquement)',
            ),
            const SizedBox(height: 8),
            _row(
              icon: Icons.person_outline,
              color: Colors.green,
              label: 'Nom complet',
              value: profile.fullName,
            ),
            const SizedBox(height: 8),
            _row(
              icon: Icons.phone_outlined,
              color: Colors.purple,
              label: 'Téléphone',
              value: profile.phoneNumber ?? 'Non renseigné',
              valueIsMuted: profile.phoneNumber == null,
              trailing: IconButton(
                icon: const Icon(Icons.edit, size: 20),
                onPressed: () => _editPhoneNumber(profile),
                tooltip: 'Modifier le téléphone',
              ),
            ),
            const SizedBox(height: 8),
            _row(
              icon: Icons.workspace_premium_outlined,
              color: Colors.orange,
              label: 'Niveau LIFRAS',
              value: profile.plongeurNiveau ?? '—',
              hint: 'Modifiable par l\'administration',
            ),
          ],
        ),
      ),
    );
  }

  Widget _row({
    required IconData icon,
    required Color color,
    required String label,
    required String value,
    String? hint,
    bool valueIsMuted = false,
    Widget? trailing,
  }) {
    return Row(
      children: [
        Icon(icon, color: color),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label,
                  style:
                      const TextStyle(fontSize: 12, color: Colors.grey)),
              const SizedBox(height: 2),
              Text(
                value,
                style: TextStyle(
                  fontSize: 16,
                  fontStyle:
                      valueIsMuted ? FontStyle.italic : FontStyle.normal,
                  color: valueIsMuted ? Colors.grey : null,
                ),
              ),
              if (hint != null) ...[
                const SizedBox(height: 2),
                Text(hint,
                    style: TextStyle(
                        fontSize: 11, color: Colors.grey.shade500)),
              ],
            ],
          ),
        ),
        if (trailing != null) trailing,
      ],
    );
  }

  // ---------- Consents ----------
  Widget _consentCard(MemberProfile profile) {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.privacy_tip_outlined, color: Colors.grey.shade700),
                const SizedBox(width: 12),
                const Text(
                  'Consentements photo',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                const Spacer(),
                IconButton(
                  onPressed: () => _editConsents(profile),
                  icon: const Icon(Icons.edit,
                      size: 20, color: AppColors.middenblauw),
                  tooltip: 'Modifier',
                ),
              ],
            ),
            const Divider(height: 24),
            _consentLine(
              label: 'Usage interne',
              sub: 'Visible par les membres du club',
              on: profile.consentInternalPhoto,
            ),
            const SizedBox(height: 8),
            _consentLine(
              label: 'Usage externe',
              sub: 'Réseaux sociaux, site web public',
              on: profile.consentExternalPhoto,
            ),
          ],
        ),
      ),
    );
  }

  Widget _consentLine({
    required String label,
    required String sub,
    required bool on,
  }) {
    return Row(
      children: [
        Icon(on ? Icons.check_circle : Icons.cancel,
            color: on ? Colors.green : Colors.red),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label,
                  style: const TextStyle(
                      fontSize: 15, fontWeight: FontWeight.w600)),
              Text(sub,
                  style:
                      TextStyle(fontSize: 12, color: Colors.grey.shade600)),
            ],
          ),
        ),
      ],
    );
  }

  // ---------- Actions ----------
  Future<void> _editPhoneNumber(MemberProfile profile) async {
    final controller = TextEditingController(text: profile.phoneNumber ?? '');
    final result = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
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
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Annuler'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, controller.text.trim()),
            child: const Text('Enregistrer'),
          ),
        ],
      ),
    );
    if (result == null || !mounted) return;
    try {
      setState(() => _isLoading = true);
      final userId = context.read<AuthProvider>().currentUser?.uid ?? '';
      await _profileService.updatePhoneNumber(
          _clubId, userId, result.isEmpty ? null : result);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('✅ Numéro de téléphone mis à jour'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text('❌ Erreur: $e'),
              backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _editConsents(MemberProfile profile) async {
    final result = await showDialog<PhotoConsentResult>(
      context: context,
      builder: (ctx) => EditConsentDialog(
        currentInternalConsent: profile.consentInternalPhoto,
        currentExternalConsent: profile.consentExternalPhoto,
      ),
    );
    if (result == null || !mounted) return;
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
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('✅ Consentements mis à jour'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text('❌ Erreur: $e'),
              backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _addOrChangePhoto() async {
    try {
      final source = await _pickPhotoSource();
      if (source == null || !mounted) return;

      File? rawPhotoFile;
      if (source == _PhotoSource.camera) {
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
        final picker = ImagePicker();
        final picked = await picker.pickImage(
          source: ImageSource.gallery,
          imageQuality: 90,
          maxWidth: 2048,
          maxHeight: 2048,
        );
        if (picked != null) rawPhotoFile = File(picked.path);
      }
      if (rawPhotoFile == null || !mounted) return;

      final photoFile = await _cropToProfileSquare(rawPhotoFile);
      if (photoFile == null || !mounted) {
        try {
          await rawPhotoFile.delete();
        } catch (_) {}
        return;
      }

      final userId = context.read<AuthProvider>().currentUser?.uid ?? '';
      final currentProfile = await _profileService.getProfile(_clubId, userId);
      final isFirstPhoto = currentProfile?.photoUrl == null;

      if (!mounted) return;
      final consentResult = await showDialog<PhotoConsentResult>(
        context: context,
        barrierDismissible: false,
        builder: (ctx) => PhotoConsentDialog(
          initialInternalConsent:
              currentProfile?.consentInternalPhoto ?? false,
          initialExternalConsent:
              currentProfile?.consentExternalPhoto ?? false,
          isFirstPhoto: isFirstPhoto,
        ),
      );

      if (consentResult == null || !mounted) {
        try {
          await rawPhotoFile.delete();
        } catch (_) {}
        try {
          await photoFile.delete();
        } catch (_) {}
        return;
      }

      setState(() => _isLoading = true);
      await _profileService.updateProfilePhoto(
        _clubId,
        userId,
        photoFile,
        consentInternalPhoto: consentResult.internalConsent,
        consentExternalPhoto: consentResult.externalConsent,
      );
      try {
        await rawPhotoFile.delete();
      } catch (_) {}
      try {
        await photoFile.delete();
      } catch (_) {}

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('✅ Photo de profil mise à jour'),
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
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<_PhotoSource?> _pickPhotoSource() {
    return showModalBottomSheet<_PhotoSource>(
      context: context,
      showDragHandle: true,
      builder: (ctx) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Padding(
                padding: EdgeInsets.fromLTRB(20, 4, 20, 12),
                child: Text(
                  'Photo de profil',
                  style:
                      TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
              ),
              ListTile(
                leading: const Icon(Icons.camera_alt_outlined,
                    color: AppColors.primary),
                title: const Text('Prendre une photo'),
                subtitle:
                    const Text('Utiliser la caméra avec guidage du visage'),
                onTap: () => Navigator.pop(ctx, _PhotoSource.camera),
              ),
              ListTile(
                leading: const Icon(Icons.photo_library_outlined,
                    color: AppColors.primary),
                title: const Text('Choisir depuis la galerie'),
                subtitle: const Text('Importer une photo existante'),
                onTap: () => Navigator.pop(ctx, _PhotoSource.gallery),
              ),
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Annuler'),
              ),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
  }

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
}
