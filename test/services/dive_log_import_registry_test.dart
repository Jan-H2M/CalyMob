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

  test('routes a shared file by content when its original extension is absent', () {
    const json =
        '{"DeviceLog":{"Header":{"DateTime":"2026-10-22T10:00:00+02:00","DiveTime":60},"Samples":[{"TimeISO8601":"2026-10-22T10:00:00+02:00","Depth":0}]}}';
    final result = const DiveLogImportRegistry().parse(
      filename: 'shared-file', bytes: Uint8List.fromList(utf8.encode(json)));
    expect(result.vendor, 'suunto');
  });

  test('returns an actionable format error for an unsupported shared file', () {
    expect(
      () => const DiveLogImportRegistry().parse(
          filename: 'unknown.bin', bytes: Uint8List.fromList([1, 2, 3])),
      throwsFormatException,
    );
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

  test('rejects ZIP64, malformed central directory and encrypted entries', () {
    final zip64 = _zipWithSyntheticFit();
    final eocd = _findEocd(zip64);
    _writeU16(zip64, eocd + 10, 0xffff);
    expect(() => _parseZip(zip64), throwsFormatException);

    final malformed = _zipWithSyntheticFit();
    final malformedEocd = _findEocd(malformed);
    _writeU32(malformed, malformedEocd + 12, 0x7fffffff);
    expect(() => _parseZip(malformed), throwsFormatException);

    final encrypted = _zipWithSyntheticFit();
    final central = _findCentralDirectory(encrypted);
    _writeU16(encrypted, central + 8, 1);
    expect(() => _parseZip(encrypted), throwsFormatException);
  });

  test('rejects nested ZIPs and path traversal entries', () {
    final nested = Archive()
      ..addFile(ArchiveFile('nested.zip', 4, [0x50, 0x4b, 0x05, 0x06]))
      ..addFile(ArchiveFile('synthetic.fit', _fit.length, _fit));
    expect(() => _parseZip(ZipEncoder().encode(nested)!), throwsFormatException);

    final traversal = Archive()
      ..addFile(ArchiveFile('../outside.fit', _fit.length, _fit));
    expect(() => _parseZip(ZipEncoder().encode(traversal)!), throwsFormatException);
  });

  test('counts actual inflated bytes instead of trusting ZIP size headers', () {
    final oversized = List<int>.filled(20 * 1024 * 1024 + 1, 0);
    final archive = Archive()
      ..addFile(ArchiveFile('large.bin', oversized.length, oversized))
      ..addFile(ArchiveFile('synthetic.fit', _fit.length, _fit));
    final zip = ZipEncoder().encode(archive)!;
    final central = _findCentralDirectory(zip);
    _writeU32(zip, central + 24, 1); // lie about the first member's size
    _writeU32(zip, _localOffset(zip, central) + 22, 1);
    expect(() => _parseZip(zip), throwsFormatException);
  });

  test('enforces the total limit during forged multi-entry inflation', () {
    final repeated = List<int>.filled(18 * 1024 * 1024, 0);
    final archive = Archive();
    for (var index = 0; index < 3; index++) {
      archive.addFile(ArchiveFile('large-$index.bin', repeated.length, repeated));
    }
    archive.addFile(ArchiveFile('synthetic.fit', _fit.length, _fit));
    final zip = ZipEncoder().encode(archive)!;
    for (final central in _centralDirectories(zip).take(3)) {
      _writeU32(zip, central + 24, 1);
      _writeU32(zip, _localOffset(zip, central) + 22, 1);
    }
    expect(() => _parseZip(zip), throwsFormatException);
  });

  test('binds each local header name to its central-directory record', () {
    final zip = _zipWithSyntheticFit();
    final central = _findCentralDirectory(zip);
    final local = _localOffset(zip, central);
    final nameStart = local + 30;
    zip[nameStart] = 'x'.codeUnitAt(0);
    expect(() => _parseZip(zip), throwsFormatException);
  });

  test('rejects overlapping local payloads referenced by central records', () {
    final archive = Archive()
      ..addFile(ArchiveFile('one.fit', _fit.length, _fit))
      ..addFile(ArchiveFile('two.fit', _fit.length, _fit));
    final zip = ZipEncoder().encode(archive)!;
    final centrals = _centralDirectories(zip);
    // Make the second central entry agree with the first local header's name,
    // then point it at that header: local binding passes and overlap must fail.
    _writeAscii(zip, centrals[1] + 46, 'one.fit');
    _writeU32(zip, centrals[1] + 42, _localOffset(zip, centrals[0]));
    expect(() => _parseZip(zip), throwsFormatException);
  });
}

final _fit = base64Decode('DhAAABUAAAAuRklUorZAAAASAAL9BIYHBIYAgHY8RUB3GwDbKA==');

List<int> _zipWithSyntheticFit() {
  final archive = Archive()..addFile(ArchiveFile('synthetic.fit', _fit.length, _fit));
  return ZipEncoder().encode(archive)!;
}

void _parseZip(List<int> bytes) => const DiveLogImportRegistry().parse(
    filename: 'synthetic.zip', bytes: Uint8List.fromList(bytes));

int _findCentralDirectory(List<int> bytes) {
  for (var index = 0; index + 4 <= bytes.length; index++) {
    if (bytes[index] == 0x50 && bytes[index + 1] == 0x4b &&
        bytes[index + 2] == 0x01 && bytes[index + 3] == 0x02) {
      return index;
    }
  }
  throw StateError('Synthetic ZIP has no central directory.');
}

List<int> _centralDirectories(List<int> bytes) => [
      for (var index = 0; index + 4 <= bytes.length; index++)
        if (bytes[index] == 0x50 &&
            bytes[index + 1] == 0x4b &&
            bytes[index + 2] == 0x01 &&
            bytes[index + 3] == 0x02)
          index,
    ];

int _localOffset(List<int> bytes, int central) =>
    bytes[central + 42] |
    (bytes[central + 43] << 8) |
    (bytes[central + 44] << 16) |
    (bytes[central + 45] << 24);

int _findEocd(List<int> bytes) {
  for (var index = bytes.length - 22; index >= 0; index--) {
    if (bytes[index] == 0x50 && bytes[index + 1] == 0x4b &&
        bytes[index + 2] == 0x05 && bytes[index + 3] == 0x06) return index;
  }
  throw StateError('Synthetic ZIP has no EOCD.');
}

void _writeU16(List<int> bytes, int index, int value) {
  bytes[index] = value & 0xff;
  bytes[index + 1] = (value >> 8) & 0xff;
}

void _writeU32(List<int> bytes, int index, int value) {
  bytes[index] = value & 0xff;
  bytes[index + 1] = (value >> 8) & 0xff;
  bytes[index + 2] = (value >> 16) & 0xff;
  bytes[index + 3] = (value >> 24) & 0xff;
}

void _writeAscii(List<int> bytes, int index, String value) {
  for (var offset = 0; offset < value.length; offset++) {
    bytes[index + offset] = value.codeUnitAt(offset);
  }
}
