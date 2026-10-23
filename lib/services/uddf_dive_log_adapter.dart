import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:xml/xml.dart';
import '../models/dive_computer_import.dart';

/// Tolerant UDDF reader for common vendor dialects. It accepts element names
/// rather than binding to one exporter schema and keeps units unknown unless
/// the document explicitly labels them.
class UddfDiveLogAdapter {
  const UddfDiveLogAdapter();
  DiveComputerImportPreview parse(List<int> bytes) {
    final doc = XmlDocument.parse(utf8.decode(bytes));
    final dives = doc.descendants
        .whereType<XmlElement>()
        .where((e) => e.name.local.toLowerCase().contains('dive'))
        .toList();
    final dive = dives.firstWhere(
        (e) => e.descendants
            .whereType<XmlElement>()
            .any((x) => x.name.local.toLowerCase().contains('depth')),
        orElse: () =>
            throw const FormatException('Aucune plongée UDDF lisible.'));
    final startSource =
        _text(dive, ['datetime', 'date_time', 'starttime', 'start_time']);
    final start = _date(startSource);
    if (start == null) throw const FormatException('Date UDDF absente.');
    final duration =
        _number(dive, ['divetime', 'duration', 'duration_seconds'])?.round() ??
            0;
    if (duration < 1) throw const FormatException('Durée UDDF absente.');
    final depth = _points(dive, ['depth', 'depthvalue']);
    final temperature = _points(dive, ['temperature', 'temp']);
    return DiveComputerImportPreview(
      vendor: 'uddf',
      sourceHash: sha256.convert(bytes).toString(),
      startedAt: start,
      startedAtSource: startSource!,
      durationSeconds: duration,
      maxDepthValue: _number(dive, ['maximumdepth', 'maxdepth']) ?? _max(depth),
      depthUnit: UnitProvenance.unknown,
      minTemperatureValue: _min(temperature),
      maxTemperatureValue: _max(temperature),
      temperatureUnit: UnitProvenance.unknown,
      tanks: const [],
      gasNumbers: const [],
      events: const [],
      locationHint: null,
      profile: DiveComputerProfile(
          depth: depth,
          temperature: temperature,
          pressureByGas: const {},
          events: const []),
      warnings: const [],
    );
  }

  List<DiveProfilePoint> _points(XmlElement dive, List<String> names) => [
        for (final element in dive.descendants.whereType<XmlElement>())
          if (names.contains(element.name.local.toLowerCase()))
            if (double.tryParse(element.innerText.trim()) case final value?)
              DiveProfilePoint(
                  at: DateTime.fromMillisecondsSinceEpoch(0),
                  value: value,
                  unit: UnitProvenance.unknown),
      ];
  String? _text(XmlElement root, List<String> names) {
    for (final e in root.descendants.whereType<XmlElement>()) {
      if (names.contains(e.name.local.toLowerCase())) return e.innerText.trim();
    }
    return null;
  }

  double? _number(XmlElement root, List<String> names) =>
      _text(root, names).flatMap(double.tryParse);
  DateTime? _date(String? value) =>
      value == null ? null : DateTime.tryParse(value);
  double? _min(List<DiveProfilePoint> values) => values.isEmpty
      ? null
      : values.map((x) => x.value).reduce((a, b) => a < b ? a : b);
  double? _max(List<DiveProfilePoint> values) => values.isEmpty
      ? null
      : values.map((x) => x.value).reduce((a, b) => a > b ? a : b);
}

extension _NullableString on String? {
  T? flatMap<T>(T? Function(String) fn) => this == null ? null : fn(this!);
}
