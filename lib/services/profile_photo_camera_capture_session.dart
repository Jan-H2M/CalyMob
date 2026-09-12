import 'profile_photo_media_source.dart';
import 'profile_photo_temp_cleanup.dart';

typedef ProfilePhotoPathCopier = Future<void> Function(
  String sourcePath,
  String destinationPath,
);

/// Owns both temporary files produced by the in-app camera flow:
///
/// 1. the cache file returned by `camera_android_camerax.takePicture()`;
/// 2. CalyMob's `profile_photo_*` preview copy.
///
/// A confirmed preview copy is transferred to [ProfilePhotoMediaService],
/// while retake/cancel/error clean both files best-effort. Gallery paths never
/// enter this session and therefore cannot accidentally be removed here.
class ProfilePhotoCameraCaptureSession {
  ProfilePhotoCameraCaptureSession({
    ProfileTemporaryPathCleaner deleteTemporaryPath =
        deleteProfilePhotoTemporaryPath,
  }) : _deleteTemporaryPath = deleteTemporaryPath;

  final ProfileTemporaryPathCleaner _deleteTemporaryPath;
  String? _cameraPluginPath;
  String? _previewCopyPath;

  String? get previewCopyPath => _previewCopyPath;

  Future<void> beginCapture(String cameraPluginPath) async {
    await discard();
    _cameraPluginPath = cameraPluginPath;
  }

  Future<void> createPreviewCopy(
    String destinationPath, {
    required ProfilePhotoPathCopier copyPath,
  }) async {
    final sourcePath = _cameraPluginPath;
    if (sourcePath == null) {
      throw StateError('Aucune capture caméra à copier.');
    }

    // Register the destination before copying: a failed copy may still have
    // created a partial file which must be removed.
    _previewCopyPath = destinationPath;
    try {
      await copyPath(sourcePath, destinationPath);
    } catch (_) {
      await discard();
      rethrow;
    }
  }

  Future<ProfilePhotoMediaSource> confirm() async {
    final previewPath = _previewCopyPath;
    if (previewPath == null) {
      throw StateError('Aucune photo caméra à confirmer.');
    }

    await _cleanBestEffort(_cameraPluginPath);
    _cameraPluginPath = null;
    _previewCopyPath = null;
    return ProfilePhotoMediaSource.cameraTemporary(previewPath);
  }

  Future<void> discard() async {
    final cameraPluginPath = _cameraPluginPath;
    final previewCopyPath = _previewCopyPath;
    _cameraPluginPath = null;
    _previewCopyPath = null;

    await _cleanBestEffort(cameraPluginPath);
    if (previewCopyPath != cameraPluginPath) {
      await _cleanBestEffort(previewCopyPath);
    }
  }

  Future<void> _cleanBestEffort(String? path) async {
    if (path == null || path.isEmpty) return;
    try {
      await _deleteTemporaryPath(path);
    } catch (_) {
      // Cleanup must never replace the camera/crop result or original error.
    }
  }
}
