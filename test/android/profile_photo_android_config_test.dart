import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Android profile photo uses permissionless picker and uCrop theme', () {
    final manifest = File(
      'android/app/src/main/AndroidManifest.xml',
    ).readAsStringSync();
    final api35Theme = File(
      'android/app/src/main/res/values-v35/styles.xml',
    ).readAsStringSync();

    expect(manifest, contains('android:theme="@style/Ucrop.CropTheme"'));
    expect(
      manifest,
      contains(
        'android:name="android.permission.READ_MEDIA_IMAGES" tools:node="remove"',
      ),
    );
    expect(
      manifest,
      contains(
        'android:name="android.permission.READ_EXTERNAL_STORAGE"\n'
        '        android:maxSdkVersion="32"',
      ),
    );
    expect(
      api35Theme,
      contains('<item name="android:windowOptOutEdgeToEdgeEnforcement">true</item>'),
    );
  });
}
