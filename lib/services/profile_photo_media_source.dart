typedef ProfileTemporaryPathCleaner = Future<void> Function(String path);

/// Describes who owns a path crossing the picker/camera/cropper boundary.
///
/// Only [cameraTemporary] paths were created by CalyMob (or its camera plugin)
/// and may therefore be deleted by the app. A [gallerySelection] can point to
/// user-owned media or to a URI-backed system-picker export; its lifecycle
/// remains owned by the picker/platform.
enum ProfilePhotoSourceProvenance { cameraTemporary, gallerySelection }

class ProfilePhotoMediaSource {
  const ProfilePhotoMediaSource._(
      {required this.path, required this.provenance});

  const ProfilePhotoMediaSource.cameraTemporary(String path)
      : this._(
          path: path,
          provenance: ProfilePhotoSourceProvenance.cameraTemporary,
        );

  const ProfilePhotoMediaSource.gallerySelection(String path)
      : this._(
          path: path,
          provenance: ProfilePhotoSourceProvenance.gallerySelection,
        );

  final String path;
  final ProfilePhotoSourceProvenance provenance;

  bool get isAppOwnedTemporary =>
      provenance == ProfilePhotoSourceProvenance.cameraTemporary;
}
