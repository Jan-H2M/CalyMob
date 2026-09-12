import 'dart:async';
import 'dart:typed_data';

import 'package:calymob/services/profile_photo_media_service.dart';
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

  testWidgets('crop cancellation cleans the selected temporary source', (
    tester,
  ) async {
    final cleaned = <String>[];
    final service = ProfilePhotoMediaService(
      pickGalleryPath: () async => 'raw.jpg',
      cropSquare: (_, __) async => null,
      deleteTemporaryPath: (path) async => cleaned.add(path),
    );
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));

    final result = await service.pickAndCropGallery(
      tester.element(find.byType(SizedBox)),
    );

    expect(result, isNull);
    expect(cleaned, ['raw.jpg']);
  });

  testWidgets('selection finishing after navigation cleans without cropping', (
    tester,
  ) async {
    final pickedPath = Completer<String?>();
    final cleaned = <String>[];
    var cropCalls = 0;
    final service = ProfilePhotoMediaService(
      pickGalleryPath: () => pickedPath.future,
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
    expect(cleaned, ['late.jpg']);
  });

  testWidgets('returns cropped bytes and cleans both temporary paths', (
    tester,
  ) async {
    final cleaned = <String>[];
    final service = ProfilePhotoMediaService(
      pickGalleryPath: () async => 'raw.jpg',
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
    expect(cleaned, ['raw.jpg', 'cropped.jpg']);
  });

  testWidgets('desktop gallery never deletes the user-selected original', (
    tester,
  ) async {
    final cleaned = <String>[];
    final service = ProfilePhotoMediaService(
      pickGalleryPath: () async => '/photos/original.jpg',
      cropSquare: (_, __) async => ProfilePhotoCropResult(
        path: '/cache/cropped.jpg',
        readAsBytes: () async => Uint8List.fromList([1]),
      ),
      deleteTemporaryPath: (path) async => cleaned.add(path),
      deletePickedGallerySource: false,
    );
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));

    final result = await service.pickAndCropGallery(
      tester.element(find.byType(SizedBox)),
    );

    expect(result, Uint8List.fromList([1]));
    expect(cleaned, ['/cache/cropped.jpg']);
  });

  testWidgets('propagates crop errors after best-effort cleanup', (
    tester,
  ) async {
    final cleaned = <String>[];
    final service = ProfilePhotoMediaService(
      pickGalleryPath: () async => 'raw.jpg',
      cropSquare: (_, __) async => throw StateError('crop failed'),
      deleteTemporaryPath: (path) async => cleaned.add(path),
    );
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));

    await expectLater(
      service.pickAndCropGallery(tester.element(find.byType(SizedBox))),
      throwsStateError,
    );
    expect(cleaned, ['raw.jpg']);
  });
}
