import 'dart:typed_data';

import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform, kIsWeb;
import 'package:flutter/material.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker/image_picker.dart';
import 'package:image_picker_android/image_picker_android.dart';
import 'package:image_picker_platform_interface/image_picker_platform_interface.dart';

import '../config/app_colors.dart';
import 'profile_photo_media_source.dart';
import 'profile_photo_temp_cleanup.dart';

typedef ProfileGalleryPathPicker = Future<ProfilePhotoMediaSource?> Function();
typedef ProfileSquareCropper = Future<ProfilePhotoCropResult?> Function(
  BuildContext context,
  String sourcePath,
);

class ProfilePhotoCropResult {
  const ProfilePhotoCropResult({required this.path, required this.readAsBytes});

  /// image_cropper output is an app-cache artifact and is always cleaned after
  /// its bytes have been read.
  final String path;
  final Future<Uint8List> Function() readAsBytes;
}

/// Enables AndroidX's Photo Picker contract. On Android 13+ that opens the
/// permissionless system picker; AndroidX supplies the supported picker or
/// document-provider fallback on older Android versions.
bool enableAndroidSystemPhotoPicker({
  TargetPlatform? platform,
  ImagePickerPlatform? implementation,
  bool isWeb = kIsWeb,
}) {
  final effectivePlatform = platform ?? defaultTargetPlatform;
  final effectiveImplementation =
      implementation ?? ImagePickerPlatform.instance;
  if (!isWeb &&
      effectivePlatform == TargetPlatform.android &&
      effectiveImplementation is ImagePickerAndroid) {
    effectiveImplementation.useAndroidPhotoPicker = true;
    return true;
  }
  return false;
}

List<PlatformUiSettings> profilePhotoCropperSettings(BuildContext context) {
  return [
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
    WebUiSettings(
      context: context,
      presentStyle: WebPresentStyle.page,
      translations: const WebTranslations(
        title: 'Recadrer la photo',
        rotateLeftTooltip: 'Tourner à gauche',
        rotateRightTooltip: 'Tourner à droite',
        cancelButton: 'Annuler',
        cropButton: 'Terminer',
      ),
    ),
  ];
}

/// Owns the picker/cropper boundary so cancellation and plugin errors always
/// clean app-owned artifacts while preserving external gallery selections.
class ProfilePhotoMediaService {
  ProfilePhotoMediaService({
    required ProfileGalleryPathPicker pickGalleryPath,
    required ProfileSquareCropper cropSquare,
    ProfileTemporaryPathCleaner deleteTemporaryPath =
        deleteProfilePhotoTemporaryPath,
  })  : _pickGalleryPath = pickGalleryPath,
        _cropSquare = cropSquare,
        _deleteTemporaryPath = deleteTemporaryPath;

  factory ProfilePhotoMediaService.system() {
    enableAndroidSystemPhotoPicker();
    final picker = ImagePicker();
    final cropper = ImageCropper();
    return ProfilePhotoMediaService(
      pickGalleryPath: () async {
        final picked = await picker.pickImage(
          source: ImageSource.gallery,
          imageQuality: 90,
          maxWidth: 2048,
          maxHeight: 2048,
          requestFullMetadata: false,
        );
        if (picked == null) return null;
        return ProfilePhotoMediaSource.gallerySelection(picked.path);
      },
      cropSquare: (context, sourcePath) async {
        final cropped = await cropper.cropImage(
          sourcePath: sourcePath,
          maxWidth: 2048,
          maxHeight: 2048,
          compressFormat: ImageCompressFormat.jpg,
          compressQuality: 90,
          aspectRatio: const CropAspectRatio(ratioX: 1, ratioY: 1),
          uiSettings: profilePhotoCropperSettings(context),
        );
        if (cropped == null) return null;
        return ProfilePhotoCropResult(
          path: cropped.path,
          readAsBytes: cropped.readAsBytes,
        );
      },
    );
  }

  final ProfileGalleryPathPicker _pickGalleryPath;
  final ProfileSquareCropper _cropSquare;
  final ProfileTemporaryPathCleaner _deleteTemporaryPath;

  Future<Uint8List?> pickAndCropGallery(BuildContext context) async {
    final source = await _pickGalleryPath();
    if (source == null) return null;
    if (!context.mounted) {
      await discardSource(source);
      return null;
    }
    return cropPathToBytes(context, source);
  }

  Future<Uint8List?> cropPathToBytes(
    BuildContext context,
    ProfilePhotoMediaSource source,
  ) async {
    String? croppedPath;
    try {
      final cropped = await _cropSquare(context, source.path);
      if (cropped == null) return null;
      croppedPath = cropped.path;
      final bytes = await cropped.readAsBytes();
      if (bytes.isEmpty) {
        throw StateError('La photo recadrée est vide.');
      }
      return bytes;
    } finally {
      await discardSource(source);
      if (croppedPath != null && croppedPath != source.path) {
        await _cleanBestEffort(croppedPath);
      }
    }
  }

  /// Deletes a source only when its provenance proves that CalyMob owns it.
  Future<void> discardSource(ProfilePhotoMediaSource source) async {
    if (source.isAppOwnedTemporary) {
      await _cleanBestEffort(source.path);
    }
  }

  Future<void> _cleanBestEffort(String path) async {
    try {
      await _deleteTemporaryPath(path);
    } catch (_) {
      // Cache cleanup must never hide the picker/cropper result or error.
    }
  }
}
