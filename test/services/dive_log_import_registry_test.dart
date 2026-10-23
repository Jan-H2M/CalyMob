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

  test('rejects ZIP archives with too many entries before extraction', () {
    final archive = Archive();
    for (var index = 0; index < 21; index++) {
      archive.addFile(ArchiveFile('entry-$index.txt', 1, [0]));
    }
    final zipped = ZipEncoder().encode(archive)!;
    expect(
      () => const DiveLogImportRegistry().parse(
          filename: 'too-many.zip', bytes: Uint8List.fromList(zipped)),
      throwsFormatException,
    );
  });

  test('rejects ZIP entries whose declared uncompressed size is too large', () {
    final archive = Archive()
      ..addFile(ArchiveFile('synthetic.fit', 1, [0]));
    final zipped = ZipEncoder().encode(archive)!;
    final central = _findCentralDirectory(zipped);
    _writeU32(zipped, central + 24, 20 * 1024 * 1024 + 1);
    expect(
      () => const DiveLogImportRegistry().parse(
          filename: 'oversized.zip', bytes: Uint8List.fromList(zipped)),
      throwsFormatException,
    );
  });
}

int _findCentralDirectory(List<int> bytes) {
  for (var index = 0; index + 4 <= bytes.length; index++) {
    if (bytes[index] == 0x50 && bytes[index + 1] == 0x4b &&
        bytes[index + 2] == 0x01 && bytes[index + 3] == 0x02) {
      return index;
    }
  }
  throw StateError('Synthetic ZIP has no central directory.');
}

void _writeU32(List<int> bytes, int index, int value) {
  bytes[index] = value & 0xff;
  bytes[index + 1] = (value >> 8) & 0xff;
  bytes[index + 2] = (value >> 16) & 0xff;
  bytes[index + 3] = (value >> 24) & 0xff;
}
