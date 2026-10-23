import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/services/dive_log_import_registry.dart';

void main() {
  test('recognises only FIT and ZIP binary signatures for their extensions',
      () {
    const registry = DiveLogImportRegistry();
    expect(DiveLogImportRegistry.supportedExtensions,
        containsAll(['fit', 'zip', 'uddf', 'ssrf']));
    // A renamed JSON must not be passed to the FIT decoder.
    expect(
        () => registry.parse(
            filename: 'renamed.fit',
            bytes:
                Uint8List.fromList([0, 0, 0, 0, 0, 0, 0, 0, 46, 70, 73, 84])),
        throwsFormatException);
  });
}
