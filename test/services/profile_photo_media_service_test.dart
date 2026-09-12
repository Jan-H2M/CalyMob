import 'dart:async';
import 'dart:typed_data';

import 'package:calymob/services/profile_photo_media_service.dart';
import 'package:calymob/services/profile_photo_media_source.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker_android/image_picker_android.dart';

void main() {
  test('enables Android system Photo Picker only for Android', () {
    final androidPicker = ImagePickerAndroid();

    expect(
      enableAndroidSystemPhotoPicker(
        platform: TargetPlatform.android,
        implementation: androidPicker,
        isWeb: false,
      ),
      isTrue,
    );
    expect(androidPicker.useAndroidPhotoPicker, isTrue);

    final iosPicker = ImagePickerAndroid();
    expect(
      enableAndroidSystemPhotoPicker(
        platform: TargetPlatform.iOS,
        implementation: iosPicker,
        isWeb: false,
      ),
      isFalse,
    );
    expect(iosPicker.useAndroidPhotoPicker, isFalse);
  });

  testWidgets('builds locked Android, iOS and web cropper settings', (
    tester,
  ) async {
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));
    final settings = profilePhotoCropperSettings(
      tester.element(find.byType(SizedBox)),
    );

    expect(settings, hasLength(3));
    expect(
      settings.whereType<AndroidUiSettings>().single.toMap(),
      containsPair('android.lock_aspect_ratio', true),
    );
    expect(
      settings.whereType<IOSUiSettings>().single.toMap(),
      containsPair('ios.crop_style', 'circle'),
    );
    expect(
      settings.whereType<WebUiSettings>().single.presentStyle,
      WebPresentStyle.page,
    );
    expect(
      settings.whereType<WebUiSettings>().single.translations!.cropButton,
      'Terminer',
    );
  });

  testWidgets('gallery cancellation stops before crop and cleanup', (
    tester,
  ) async {
    var cropCalls = 0;
    final cleaned = <String>[];
    final service = ProfilePhotoMediaService(
      pickGalleryPath: () async => null,
      cropSquare: (_, __) async {
        cropCalls++;
        return null;
      },
      deleteTemporaryPath: (path) async => cleaned.add(path),
    );
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));

    final result = await service.pickAndCropGallery(
      tester.element(find.byType(SizedBox)),
    );

    expect(result, isNull);
    expect(cropCalls, 0);
    expect(cleaned, isEmpty);
  });

  testWidgets('crop cancellation does not delete the gallery source', (
    tester,
  ) async {
    final cleaned = <String>[];
    final service = ProfilePhotoMediaService(
      pickGalleryPath: () async =>
          const ProfilePhotoMediaSource.gallerySelection('raw.jpg'),
      cropSquare: (_, __) async => null,
      deleteTemporaryPath: (path) async => cleaned.add(path),
    );
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));

    final result = await service.pickAndCropGallery(
      tester.element(find.byType(SizedBox)),
    );

    expect(result, isNull);
    expect(cleaned, isEmpty);
  });

  testWidgets('late gallery selection is preserved without cropping', (
    tester,
  ) async {
    final pickedPath = Completer<String?>();
    final cleaned = <String>[];
    var cropCalls = 0;
    final service = ProfilePhotoMediaService(
      pickGalleryPath: () async {
        final path = await pickedPath.future;
        return path == null
            ? null
            : ProfilePhotoMediaSource.gallerySelection(path);
      },
      cropSquare: (_, __) async {
        cropCalls++;
        return null;
      },
      deleteTemporaryPath: (path) async => cleaned.add(path),
    );
    await tester.pumpWidget(const MaterialApp(home: Text('old')));
    final oldContext = tester.element(find.text('old'));
    final selection = service.pickAndCropGallery(oldContext);

    await tester.pumpWidget(const MaterialApp(home: Icon(Icons.close)));
    pickedPath.complete('late.jpg');

    expect(await selection, isNull);
    expect(cropCalls, 0);
    expect(cleaned, isEmpty);
  });

  testWidgets('returns cropped bytes and only cleans the crop output', (
    tester,
  ) async {
    final cleaned = <String>[];
    final service = ProfilePhotoMediaService(
      pickGalleryPath: () async =>
          const ProfilePhotoMediaSource.gallerySelection('raw.jpg'),
      cropSquare: (_, sourcePath) async {
        expect(sourcePath, 'raw.jpg');
        return ProfilePhotoCropResult(
          path: 'cropped.jpg',
          readAsBytes: () async => Uint8List.fromList([1, 2, 3]),
        );
      },
      deleteTemporaryPath: (path) async => cleaned.add(path),
    );
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));

    final result = await service.pickAndCropGallery(
      tester.element(find.byType(SizedBox)),
    );

    expect(result, Uint8List.fromList([1, 2, 3]));
    expect(cleaned, ['cropped.jpg']);
  });

  testWidgets('desktop gallery never deletes the user-selected original', (
    tester,
  ) async {
    final cleaned = <String>[];
    final service = ProfilePhotoMediaService(
      pickGalleryPath: () async =>
          const ProfilePhotoMediaSource.gallerySelection(
        '/photos/original.jpg',
      ),
      cropSquare: (_, __) async => ProfilePhotoCropResult(
        path: '/cache/cropped.jpg',
        readAsBytes: () async => Uint8List.fromList([1]),
      ),
      deleteTemporaryPath: (path) async => cleaned.add(path),
    );
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));

    final result = await service.pickAndCropGallery(
      tester.element(find.byType(SizedBox)),
    );

    expect(result, Uint8List.fromList([1]));
    expect(cleaned, ['/cache/cropped.jpg']);
  });

  testWidgets('propagates gallery crop errors without deleting source', (
    tester,
  ) async {
    final cleaned = <String>[];
    final service = ProfilePhotoMediaService(
      pickGalleryPath: () async =>
          const ProfilePhotoMediaSource.gallerySelection('raw.jpg'),
      cropSquare: (_, __) async => throw StateError('crop failed'),
      deleteTemporaryPath: (path) async => cleaned.add(path),
    );
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));

    await expectLater(
      service.pickAndCropGallery(tester.element(find.byType(SizedBox))),
      throwsStateError,
    );
    expect(cleaned, isEmpty);
  });

  testWidgets('camera source and crop output are both cleaned', (tester) async {
    final cleaned = <String>[];
    final service = ProfilePhotoMediaService(
      pickGalleryPath: () async => null,
      cropSquare: (_, sourcePath) async {
        expect(sourcePath, '/cache/profile_photo.jpg');
        return ProfilePhotoCropResult(
          path: '/cache/cropped.jpg',
          readAsBytes: () async => Uint8List.fromList([4, 5, 6]),
        );
      },
      deleteTemporaryPath: (path) async => cleaned.add(path),
    );
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));

    final result = await service.cropPathToBytes(
      tester.element(find.byType(SizedBox)),
      const ProfilePhotoMediaSource.cameraTemporary(
        '/cache/profile_photo.jpg',
      ),
    );

    expect(result, Uint8List.fromList([4, 5, 6]));
    expect(cleaned, ['/cache/profile_photo.jpg', '/cache/cropped.jpg']);
  });

  testWidgets('camera source is cleaned after crop cancellation', (
    tester,
  ) async {
    final cleaned = <String>[];
    final service = ProfilePhotoMediaService(
      pickGalleryPath: () async => null,
      cropSquare: (_, __) async => null,
      deleteTemporaryPath: (path) async => cleaned.add(path),
    );
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));

    final result = await service.cropPathToBytes(
      tester.element(find.byType(SizedBox)),
      const ProfilePhotoMediaSource.cameraTemporary('/cache/camera.jpg'),
    );

    expect(result, isNull);
    expect(cleaned, ['/cache/camera.jpg']);
  });

  testWidgets('camera source is cleaned when cropper fails', (tester) async {
    final cleaned = <String>[];
    final service = ProfilePhotoMediaService(
      pickGalleryPath: () async => null,
      cropSquare: (_, __) async => throw StateError('crop failed'),
      deleteTemporaryPath: (path) async => cleaned.add(path),
    );
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));

    await expectLater(
      service.cropPathToBytes(
        tester.element(find.byType(SizedBox)),
        const ProfilePhotoMediaSource.cameraTemporary('/cache/camera.jpg'),
      ),
      throwsStateError,
    );
    expect(cleaned, ['/cache/camera.jpg']);
  });

  testWidgets('gallery source survives crop cancellation and errors', (
    tester,
  ) async {
    final cleaned = <String>[];
    var shouldThrow = false;
    final service = ProfilePhotoMediaService(
      pickGalleryPath: () async => null,
      cropSquare: (_, __) async {
        if (shouldThrow) throw StateError('crop failed');
        return null;
      },
      deleteTemporaryPath: (path) async => cleaned.add(path),
    );
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));
    const gallery = ProfilePhotoMediaSource.gallerySelection(
      '/photos/original.jpg',
    );

    expect(
      await service.cropPathToBytes(
        tester.element(find.byType(SizedBox)),
        gallery,
      ),
      isNull,
    );
    shouldThrow = true;
    await expectLater(
      service.cropPathToBytes(
        tester.element(find.byType(SizedBox)),
        gallery,
      ),
      throwsStateError,
    );

    expect(cleaned, isEmpty);
  });
}
