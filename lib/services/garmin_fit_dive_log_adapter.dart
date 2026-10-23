import 'dart:typed_data';
import 'package:archive/archive.dart';
import 'package:crypto/crypto.dart';
import 'package:dart_fit_decoder/dart_fit_decoder.dart';
import '../models/dive_computer_import.dart';

/// MIT dependency `dart_fit_decoder` validates FIT headers/CRC and decodes the
/// binary message stream. Garmin dive profile-field mapping remains deliberately
/// conservative: unknown/developer fields are never treated as deco advice.
class GarminFitDiveLogAdapter {
  const GarminFitDiveLogAdapter();
  DiveComputerImportPreview parse(List<int> bytes, {bool zip = false}) {
    final fit = zip ? _fitFromZip(bytes) : Uint8List.fromList(bytes);
    // Decode first: do not accept a file merely because it has a .fit suffix.
    final decoded = FitDecoder(fit).decode();
    final dynamic file = decoded;
    final messages = _messages(file);
    final session = messages.cast<dynamic?>().firstWhere(
        (m) => '${m?.name ?? m?.type ?? ''}'.toLowerCase().contains('session'),
        orElse: () => null);
    final started = _readDate(session, ['startTime', 'start_time']) ??
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
      maxDepthValue: _readNum(session, ['maxDepth', 'max_depth']),
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

  List _messages(dynamic decoded) {
    try {
      final value = decoded.messages;
      return value is List ? value : const [];
    } catch (_) {
      return const [];
    }
  }

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
