import 'package:calymob/services/profile_photo_camera_capture_session.dart';
import 'package:calymob/services/profile_photo_media_source.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('confirm deletes plugin original and transfers preview ownership',
      () async {
    final files = _FakeTemporaryFileSystem(existing: {'camera.jpg'});
    final session = ProfilePhotoCameraCaptureSession(
      deleteTemporaryPath: files.delete,
    );

    await session.beginCapture('camera.jpg');
    await session.createPreviewCopy(
      'profile_photo.jpg',
      copyPath: files.copy,
    );
    final source = await session.confirm();

    expect(source.path, 'profile_photo.jpg');
    expect(source.provenance, ProfilePhotoSourceProvenance.cameraTemporary);
    expect(files.deleted, ['camera.jpg']);
    expect(files.existing, {'profile_photo.jpg'});
    expect(session.previewCopyPath, isNull);
  });

  test('retake deletes plugin original and preview copy', () async {
    final files = _FakeTemporaryFileSystem(existing: {'camera.jpg'});
    final session = ProfilePhotoCameraCaptureSession(
      deleteTemporaryPath: files.delete,
    );
    await session.beginCapture('camera.jpg');
    await session.createPreviewCopy(
      'profile_photo.jpg',
      copyPath: files.copy,
    );

    await session.discard();

    expect(files.deleted, ['camera.jpg', 'profile_photo.jpg']);
    expect(files.existing, isEmpty);
  });

  test('cancel/dispose discard is idempotent', () async {
    final files = _FakeTemporaryFileSystem(existing: {'camera.jpg'});
    final session = ProfilePhotoCameraCaptureSession(
      deleteTemporaryPath: files.delete,
    );
    await session.beginCapture('camera.jpg');
    await session.createPreviewCopy(
      'profile_photo.jpg',
      copyPath: files.copy,
    );

    await session.discard();
    await session.discard();

    expect(files.deleted, ['camera.jpg', 'profile_photo.jpg']);
    expect(files.existing, isEmpty);
  });

  test('copy failure deletes original and partially-created copy', () async {
    final files = _FakeTemporaryFileSystem(
      existing: {'camera.jpg'},
      failCopyAfterCreatingDestination: true,
    );
    final session = ProfilePhotoCameraCaptureSession(
      deleteTemporaryPath: files.delete,
    );
    await session.beginCapture('camera.jpg');

    await expectLater(
      session.createPreviewCopy('profile_photo.jpg', copyPath: files.copy),
      throwsStateError,
    );

    expect(files.deleted, ['camera.jpg', 'profile_photo.jpg']);
    expect(files.existing, isEmpty);
  });

  test('new capture discards all artifacts from previous capture', () async {
    final files = _FakeTemporaryFileSystem(
      existing: {'camera-1.jpg', 'camera-2.jpg'},
    );
    final session = ProfilePhotoCameraCaptureSession(
      deleteTemporaryPath: files.delete,
    );
    await session.beginCapture('camera-1.jpg');
    await session.createPreviewCopy(
      'profile-1.jpg',
      copyPath: files.copy,
    );

    await session.beginCapture('camera-2.jpg');

    expect(files.deleted, ['camera-1.jpg', 'profile-1.jpg']);
    expect(files.existing, {'camera-2.jpg'});
  });

  test('cleanup failures never hide a successful confirmation', () async {
    final session = ProfilePhotoCameraCaptureSession(
      deleteTemporaryPath: (_) async => throw StateError('delete failed'),
    );
    await session.beginCapture('camera.jpg');
    await session.createPreviewCopy(
      'profile_photo.jpg',
      copyPath: (_, __) async {},
    );

    final source = await session.confirm();

    expect(source.path, 'profile_photo.jpg');
    expect(source.isAppOwnedTemporary, isTrue);
  });

  test('gallery provenance is never accepted as camera-owned state', () {
    const gallery = ProfilePhotoMediaSource.gallerySelection(
      '/photos/original.jpg',
    );

    expect(gallery.isAppOwnedTemporary, isFalse);
  });
}

class _FakeTemporaryFileSystem {
  _FakeTemporaryFileSystem({
    Set<String>? existing,
    this.failCopyAfterCreatingDestination = false,
  }) : existing = {...?existing};

  final Set<String> existing;
  final bool failCopyAfterCreatingDestination;
  final List<String> deleted = [];

  Future<void> copy(String sourcePath, String destinationPath) async {
    if (!existing.contains(sourcePath)) {
      throw StateError('missing source');
    }
    existing.add(destinationPath);
    if (failCopyAfterCreatingDestination) {
      throw StateError('copy failed');
    }
  }

  Future<void> delete(String path) async {
    deleted.add(path);
    existing.remove(path);
  }
}
