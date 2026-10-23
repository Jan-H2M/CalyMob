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
    _validateZipCentralDirectory(bytes);
    final archive = ZipDecoder().decodeBytes(bytes);
    final entry = archive.files.firstWhere(
        (file) => file.isFile && file.name.toLowerCase().endsWith('.fit'),
        orElse: () => throw const FormatException(
            'L’archive ne contient aucun fichier .fit.'));
    final content = entry.content;
    if (content is! List<int>)
      throw const FormatException('Fichier FIT illisible dans l’archive.');
    return Uint8List.fromList(content);
  }

  /// Rejects archive bombs from central-directory metadata before Archive
  /// materialises any entry content. ZIP64 declared sizes are intentionally
  /// unsupported for mobile imports rather than being guessed.
  static void _validateZipCentralDirectory(List<int> bytes) {
    var entries = 0;
    var total = 0;
    var foundCentralDirectory = false;
    for (var index = 0; index + 46 <= bytes.length; index++) {
      if (_u32(bytes, index) != 0x02014b50) continue;
      foundCentralDirectory = true;
      entries++;
      if (entries > _maxZipEntries) {
        throw const FormatException('L’archive ZIP contient trop de fichiers (maximum 20).');
      }
      final compressed = _u32(bytes, index + 20);
      final uncompressed = _u32(bytes, index + 24);
      if (compressed == 0xffffffff || uncompressed == 0xffffffff) {
        throw const FormatException('Les archives ZIP64 ne sont pas prises en charge.');
      }
      if (uncompressed > _maxZipEntryBytes) {
        throw const FormatException('Un fichier de l’archive ZIP dépasse 20 Mo décompressés.');
      }
      total += uncompressed;
      if (total > _maxZipTotalBytes) {
        throw const FormatException('L’archive ZIP dépasse 50 Mo décompressés.');
      }
      final nameLength = _u16(bytes, index + 28);
      final extraLength = _u16(bytes, index + 30);
      final commentLength = _u16(bytes, index + 32);
      index += 45 + nameLength + extraLength + commentLength;
    }
    if (!foundCentralDirectory) {
      throw const FormatException('Archive ZIP invalide ou sans répertoire central.');
    }
  }

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
