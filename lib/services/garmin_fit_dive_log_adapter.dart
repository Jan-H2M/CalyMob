import 'dart:typed_data';
import 'package:archive/archive.dart';
import 'package:crypto/crypto.dart';
import 'package:dart_fit_decoder/dart_fit_decoder.dart';
import '../models/dive_computer_import.dart';

/// MIT dependency `dart_fit_decoder` validates FIT headers/CRC and decodes the
/// binary message stream. Garmin dive profile-field mapping remains deliberately
/// conservative: unknown/developer fields are never treated as deco advice.
class GarminFitDiveLogAdapter {
  static const _maxZipEntries = 20;
  static const _maxZipEntryBytes = 20 * 1024 * 1024;
  static const _maxZipTotalBytes = 50 * 1024 * 1024;

  const GarminFitDiveLogAdapter();
  DiveComputerImportPreview parse(List<int> bytes, {bool zip = false}) {
    final fit = zip ? _fitFromZip(bytes) : Uint8List.fromList(bytes);
    // Decode first: do not accept a file merely because it has a .fit suffix.
    final file = FitDecoder(fit).decode();
    final session = file.getSessionMessages().isEmpty
        ? null
        : file.getSessionMessages().first;
    final started = session?.timestamp ??
        _readDate(session, ['start_time']) ??
        DateTime.fromMillisecondsSinceEpoch(0, isUtc: true);
    final seconds = _readNum(session, [
          'totalElapsedTime',
          'total_elapsed_time',
          'totalTimerTime'
        ])?.round() ??
        0;
    if (seconds < 1)
      throw const FormatException(
          'Le FIT Garmin ne contient pas de résumé de plongée exploitable.');
    return DiveComputerImportPreview(
      vendor: 'garmin',
      sourceHash: sha256.convert(fit).toString(),
      startedAt: started,
      startedAtSource: started.toIso8601String(),
      durationSeconds: seconds,
      maxDepthValue: _readNum(session, ['maxDepth', 'max_depth'])?.toDouble(),
      depthUnit: UnitProvenance.unknown,
      minTemperatureValue: null,
      maxTemperatureValue: null,
      temperatureUnit: UnitProvenance.unknown,
      tanks: const [],
      gasNumbers: const [],
      events: const [],
      locationHint: null,
      profile: const DiveComputerProfile(
          depth: [], temperature: [], pressureByGas: {}, events: []),
      warnings: const [
        'Les champs Garmin inconnus ne sont pas affichés comme données de décompression.'
      ],
    );
  }

  Uint8List _fitFromZip(List<int> bytes) {
    final entries = _readZipEntries(bytes);
    _ZipEntry? fit;
    var totalInflated = 0;
    for (final entry in entries) {
      final remaining = _maxZipTotalBytes - totalInflated;
      final inflated = _inflateZipEntry(
        bytes,
        entry,
        maximumOutputBytes: remaining < _maxZipEntryBytes
            ? remaining
            : _maxZipEntryBytes,
      );
      totalInflated += inflated.length;
      if (totalInflated > _maxZipTotalBytes) {
        throw const FormatException('L’archive ZIP dépasse 50 Mo décompressés.');
      }
      if (_isZipSignature(inflated) || entry.name.toLowerCase().endsWith('.zip')) {
        throw const FormatException('Les archives ZIP imbriquées ne sont pas prises en charge.');
      }
      if (entry.name.toLowerCase().endsWith('.fit')) {
        fit = _ZipEntry.withContent(entry, inflated);
      }
    }
    if (fit == null) {
      throw const FormatException('L’archive ne contient aucun fichier .fit.');
    }
    return fit.content!;
  }

  /// Parses only a conventional, single-disk ZIP central directory. We do not
  /// delegate untrusted input to ZipDecoder: it may materialise every archive
  /// member before an application-level limit can be checked.
  static List<_ZipEntry> _readZipEntries(List<int> bytes) {
    final eocd = _findEocd(bytes);
    if (_u16(bytes, eocd + 4) != 0 || _u16(bytes, eocd + 6) != 0) {
      throw const FormatException('Les archives ZIP multi-disques ne sont pas prises en charge.');
    }
    final diskEntries = _u16(bytes, eocd + 8);
    final entries = _u16(bytes, eocd + 10);
    final directorySize = _u32(bytes, eocd + 12);
    final directoryOffset = _u32(bytes, eocd + 16);
    if (diskEntries == 0xffff || entries == 0xffff ||
        directorySize == 0xffffffff || directoryOffset == 0xffffffff) {
      throw const FormatException('Les archives ZIP64 ne sont pas prises en charge.');
    }
    if (diskEntries != entries || entries > _maxZipEntries ||
        directoryOffset > bytes.length || directorySize > bytes.length - directoryOffset ||
        directoryOffset + directorySize > eocd) {
      throw const FormatException('Répertoire central ZIP invalide ou trop volumineux.');
    }
    final end = directoryOffset + directorySize;
    var offset = directoryOffset;
    var declaredTotal = 0;
    final result = <_ZipEntry>[];
    for (var index = 0; index < entries; index++) {
      if (offset + 46 > end || _u32(bytes, offset) != 0x02014b50) {
        throw const FormatException('Répertoire central ZIP malformé.');
      }
      final flags = _u16(bytes, offset + 8);
      final method = _u16(bytes, offset + 10);
      final compressed = _u32(bytes, offset + 20);
      final uncompressed = _u32(bytes, offset + 24);
      final nameLength = _u16(bytes, offset + 28);
      final extraLength = _u16(bytes, offset + 30);
      final commentLength = _u16(bytes, offset + 32);
      final localOffset = _u32(bytes, offset + 42);
      final next = offset + 46 + nameLength + extraLength + commentLength;
      if (next > end || compressed == 0xffffffff || uncompressed == 0xffffffff ||
          localOffset == 0xffffffff) {
        throw const FormatException('Archive ZIP64 ou malformée non prise en charge.');
      }
      if ((flags & 0x0001) != 0) {
        throw const FormatException('Les archives ZIP chiffrées ne sont pas prises en charge.');
      }
      if ((flags & 0x0008) != 0) {
        throw const FormatException('Les entrées ZIP avec descripteur de données ne sont pas prises en charge.');
      }
      if (method != 0 && method != 8) {
        throw const FormatException('Méthode de compression ZIP non prise en charge.');
      }
      final name = String.fromCharCodes(bytes.sublist(offset + 46, offset + 46 + nameLength));
      if (_unsafeZipName(name)) {
        throw const FormatException('Un chemin dangereux a été trouvé dans l’archive ZIP.');
      }
      if (uncompressed > _maxZipEntryBytes) {
        throw const FormatException('Un fichier de l’archive ZIP dépasse 20 Mo décompressés.');
      }
      declaredTotal += uncompressed;
      if (declaredTotal > _maxZipTotalBytes) {
        throw const FormatException('L’archive ZIP dépasse 50 Mo décompressés.');
      }
      result.add(_ZipEntry(
        name,
        flags,
        method,
        compressed,
        uncompressed,
        localOffset,
        directoryOffset,
      ));
      offset = next;
    }
    if (offset != end) throw const FormatException('Répertoire central ZIP malformé.');
    _validateLocalRanges(bytes, result);
    return result;
  }

  static int _findEocd(List<int> bytes) {
    final first = bytes.length - 22;
    for (var offset = first; offset >= 0 && offset >= bytes.length - 65557; offset--) {
      if (_u32(bytes, offset) == 0x06054b50 &&
          offset + 22 + _u16(bytes, offset + 20) == bytes.length) return offset;
    }
    throw const FormatException('Archive ZIP invalide : fin de répertoire introuvable.');
  }

  static Uint8List _inflateZipEntry(
    List<int> archive,
    _ZipEntry entry, {
    required int maximumOutputBytes,
  }) {
    final range = _localPayloadRange(archive, entry);
    final compressed = archive.sublist(range.start, range.end);
    final output = _LimitedOutput(maximumOutputBytes);
    try {
      if (entry.method == 0) {
        output.writeBytes(compressed);
      } else {
        ZLibDecoder().decodeStream(InputMemoryStream(compressed), output, raw: true);
      }
    } on _ZipLimitExceeded {
      throw const FormatException('L’archive ZIP dépasse la limite décompressée autorisée.');
    } catch (_) {
      throw const FormatException('Fichier compressé ZIP invalide.');
    }
    return output.getBytes();
  }

  static void _validateLocalRanges(List<int> archive, List<_ZipEntry> entries) {
    final ranges = entries.map((entry) => _localPayloadRange(archive, entry)).toList()
      ..sort((left, right) => left.headerStart.compareTo(right.headerStart));
    for (var index = 1; index < ranges.length; index++) {
      if (ranges[index - 1].end > ranges[index].headerStart) {
        throw const FormatException('Les entrées ZIP se chevauchent.');
      }
    }
  }

  static _ZipPayloadRange _localPayloadRange(List<int> archive, _ZipEntry entry) {
    final local = entry.localOffset;
    if (local + 30 > entry.directoryOffset || _u32(archive, local) != 0x04034b50) {
      throw const FormatException('Entrée locale ZIP manquante ou invalide.');
    }
    final flags = _u16(archive, local + 6);
    final method = _u16(archive, local + 8);
    final compressedSize = _u32(archive, local + 18);
    final uncompressedSize = _u32(archive, local + 22);
    final nameLength = _u16(archive, local + 26);
    final extraLength = _u16(archive, local + 28);
    final start = local + 30 + nameLength + extraLength;
    final end = start + entry.compressedSize;
    if (flags != entry.flags || (flags & 0x0008) != 0 ||
        method != entry.method || compressedSize != entry.compressedSize ||
        uncompressedSize != entry.uncompressedSize || start > entry.directoryOffset ||
        entry.compressedSize > entry.directoryOffset - start) {
      throw const FormatException('Entrée ZIP locale malformée ou chiffrée.');
    }
    final localName = String.fromCharCodes(archive.sublist(local + 30, local + 30 + nameLength));
    if (localName != entry.name) {
      throw const FormatException('Le nom local ZIP ne correspond pas au répertoire central.');
    }
    return _ZipPayloadRange(local, start, end);
  }

  static bool _unsafeZipName(String name) {
    final normalized = name.replaceAll('\\', '/');
    return normalized.isEmpty || normalized.startsWith('/') ||
        RegExp(r'^[a-zA-Z]:').hasMatch(normalized) ||
        normalized == '..' || normalized.startsWith('../') || normalized.contains('/../');
  }

  static bool _isZipSignature(List<int> bytes) => bytes.length >= 4 &&
      bytes[0] == 0x50 && bytes[1] == 0x4b &&
      (bytes[2] == 0x03 || bytes[2] == 0x05 || bytes[2] == 0x07) &&
      (bytes[3] == 0x04 || bytes[3] == 0x06 || bytes[3] == 0x08);

  static int _u16(List<int> bytes, int index) =>
      bytes[index] | (bytes[index + 1] << 8);

  static int _u32(List<int> bytes, int index) =>
      _u16(bytes, index) | (_u16(bytes, index + 2) << 16);

  num? _readNum(dynamic object, List<String> names) {
    for (final name in names) {
      try {
        final value = (object as dynamic).getField(name);
        if (value is num) return value;
      } catch (_) {}
    }
    return null;
  }

  DateTime? _readDate(dynamic object, List<String> names) {
    for (final name in names) {
      try {
        final value = (object as dynamic).getField(name);
        if (value is DateTime) return value;
      } catch (_) {}
    }
    return null;
  }
}

class _ZipEntry {
  final String name;
  final int flags;
  final int method;
  final int compressedSize;
  final int uncompressedSize;
  final int localOffset;
  final int directoryOffset;
  final Uint8List? content;
  const _ZipEntry(
    this.name,
    this.flags,
    this.method,
    this.compressedSize,
    this.uncompressedSize,
    this.localOffset,
    this.directoryOffset, [
    this.content,
  ]);
  _ZipEntry.withContent(_ZipEntry entry, Uint8List value)
      : this(
          entry.name,
          entry.flags,
          entry.method,
          entry.compressedSize,
          entry.uncompressedSize,
          entry.localOffset,
          entry.directoryOffset,
          value,
        );
}

class _ZipPayloadRange {
  final int headerStart;
  final int start;
  final int end;
  const _ZipPayloadRange(this.headerStart, this.start, this.end);
}

class _ZipLimitExceeded implements Exception {
  const _ZipLimitExceeded();
}

/// Limits bytes as the inflater writes them, rather than trusting ZIP headers.
class _LimitedOutput extends OutputMemoryStream {
  final int maximum;
  _LimitedOutput(this.maximum) : super(size: 1024);

  void _check(int count) {
    if (length + count > maximum) throw const _ZipLimitExceeded();
  }

  @override
  void writeByte(int value) {
    _check(1);
    super.writeByte(value);
  }

  @override
  void writeBytes(List<int> bytes, {int? length}) {
    _check(length ?? bytes.length);
    super.writeBytes(bytes, length: length);
  }

  @override
  void writeStream(InputStream stream) {
    _check(stream.length);
    super.writeStream(stream);
  }
}
