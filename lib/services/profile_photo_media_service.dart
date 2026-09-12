import 'dart:typed_data';

import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform, kIsWeb;
import 'package:flutter/material.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker/image_picker.dart';
import 'package:image_picker_android/image_picker_android.dart';
import 'package:image_picker_platform_interface/image_picker_platform_interface.dart';

import '../config/app_colors.dart';
import 'profile_photo_temp_cleanup.dart';

typedef ProfileGalleryPathPicker = Future<String?> Function();
typedef ProfileSquareCropper = Future<ProfilePhotoCropResult?> Function(
  BuildContext context,
  String sourcePath,
);
typedef ProfileTemporaryPathCleaner = Future<void> Function(String path);

class ProfilePhotoCropResult {
  const ProfilePhotoCropResult({required this.path, required this.readAsBytes});

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

/// Owns the picker/cropper boundary so cancellation, plugin errors and
/// temporary-file cleanup behave identically for gallery and camera input.
class ProfilePhotoMediaService {
  ProfilePhotoMediaService({
    required ProfileGalleryPathPicker pickGalleryPath,
    required ProfileSquareCropper cropSquare,
    ProfileTemporaryPathCleaner deleteTemporaryPath =
        deleteProfilePhotoTemporaryPath,
    bool deletePickedGallerySource = true,
  })  : _pickGalleryPath = pickGalleryPath,
        _cropSquare = cropSquare,
        _deleteTemporaryPath = deleteTemporaryPath,
        _deletePickedGallerySource = deletePickedGallerySource;

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
        return picked?.path;
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
      // Mobile image_picker returns an app-cache copy. Desktop file selectors
      // may return the user's original path, which must never be deleted.
      deletePickedGallerySource: !kIsWeb &&
          (defaultTargetPlatform == TargetPlatform.android ||
              defaultTargetPlatform == TargetPlatform.iOS),
    );
  }

  final ProfileGalleryPathPicker _pickGalleryPath;
  final ProfileSquareCropper _cropSquare;
  final ProfileTemporaryPathCleaner _deleteTemporaryPath;
  final bool _deletePickedGallerySource;

  Future<Uint8List?> pickAndCropGallery(BuildContext context) async {
    final sourcePath = await _pickGalleryPath();
    if (sourcePath == null) return null;
    if (!context.mounted) {
      if (_deletePickedGallerySource) await _cleanBestEffort(sourcePath);
      return null;
    }
    return cropPathToBytes(
      context,
      sourcePath,
      deleteSource: _deletePickedGallerySource,
    );
  }

  Future<Uint8List?> cropPathToBytes(
    BuildContext context,
    String sourcePath, {
    bool deleteSource = true,
  }) async {
    String? croppedPath;
    try {
      final cropped = await _cropSquare(context, sourcePath);
      if (cropped == null) return null;
      croppedPath = cropped.path;
      final bytes = await cropped.readAsBytes();
      if (bytes.isEmpty) {
        throw StateError('La photo recadrée est vide.');
      }
      return bytes;
    } finally {
      if (deleteSource) await _cleanBestEffort(sourcePath);
      if (croppedPath != null && croppedPath != sourcePath) {
        await _cleanBestEffort(croppedPath);
      }
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
