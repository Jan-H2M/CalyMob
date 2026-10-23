import 'dart:typed_data';
import 'dart:convert';
import 'package:archive/archive.dart';
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

  test('maps a valid synthetic FIT and ZIP-FIT session at runtime', () {
    const registry = DiveLogImportRegistry();
    final fit =
        base64Decode('DhAAABUAAAAuRklUorZAAAASAAL9BIYHBIYAgHY8RUB3GwDbKA==');
    final direct = registry.parse(
        filename: 'synthetic.fit', bytes: Uint8List.fromList(fit));
    expect(direct.vendor, 'garmin');
    expect(direct.durationSeconds, 1800);
    final archive = Archive()
      ..addFile(ArchiveFile('synthetic.fit', fit.length, fit));
    final zipped = ZipEncoder().encode(archive)!;
    final fromZip = registry.parse(
        filename: 'synthetic.zip', bytes: Uint8List.fromList(zipped));
    expect(fromZip.durationSeconds, 1800);
  });
}
