import 'dart:convert';
import 'package:crypto/crypto.dart';
import '../models/dive_computer_import.dart';

/// Pure, channel-aware parser for Suunto DeviceLog JSON. It has no Firebase,
/// disk or UI dependency, and deliberately drops direct identifiers and route.
class SuuntoDiveLogAdapter {
  const SuuntoDiveLogAdapter();

  DiveComputerImportPreview parse(List<int> bytes) {
    final root = jsonDecode(utf8.decode(bytes));
    if (root is! Map || root['DeviceLog'] is! Map) {
      throw const FormatException(
        'Ce fichier n’est pas un export Suunto DeviceLog.',
      );
    }
    final log = _map(root['DeviceLog']);
    final header = _map(log['Header']);
    final samples = (log['Samples'] as List? ?? const [])
        .whereType<Map>()
        .map(_map)
        .toList();
    if (samples.isEmpty)
      throw const FormatException(
        'L’export Suunto ne contient aucun échantillon.',
      );
    final start = _date(header['DateTime']) ?? _firstTime(samples);
    final duration = _number(header['DiveTime'])?.round();
    if (start == null || duration == null || duration < 1) {
      throw const FormatException('Date ou durée de plongée Suunto invalide.');
    }
    final depth = _points(samples, 'Depth', (v) => v);
    // Do not convert temperature: the DeviceLog fixture has no declared unit.
    // `value` is the original recorded number and the provenance is inferred.
    final temperature = _points(samples, 'Temperature', (value) => value);
    final pressure = <int, List<DiveProfilePoint>>{};
    final firstPressure = <int, double>{};
    final lastPressure = <int, double>{};
    final gases = <int>{};
    final events = <DiveDeviceEvent>[];
    DiveLocationHint? locationHint;
    for (final sample in samples) {
      final at = _date(sample['TimeISO8601']);
      if (at == null) continue;
      for (final raw in sample['Cylinders'] as List? ?? const []) {
        final tank = _map(raw);
        final gas = _number(tank['GasNumber'])?.toInt();
        final rawPressure = _number(tank['Pressure']);
        if (gas == null || rawPressure == null || rawPressure < 0) continue;
        gases.add(gas);
        final bar = rawPressure.toDouble(); // Source has no declared unit.
        firstPressure.putIfAbsent(gas, () => bar);
        lastPressure[gas] = bar;
        (pressure[gas] ??= []).add(
          DiveProfilePoint(at: at, value: bar, unit: UnitProvenance.inferred),
        );
      }
      for (final entry in _map(sample['DiveEvents']).entries) {
        final value = _map(entry.value);
        if (value.isEmpty) continue;
        final gas = _number(value['GasNumber'])?.toInt();
        if (gas != null) gases.add(gas);
        events.add(
          DiveDeviceEvent(
            at: at,
            category: entry.key,
            type: value['Type'] is String ? value['Type'] as String : null,
            gasNumber: gas,
          ),
        );
      }
      // Local hint only. It never reaches the preview serialisation/storage.
      if (locationHint == null) {
        final origin = _map(sample['DiveRouteOrigin']);
        final lat = _number(origin['Latitude']);
        final lon = _number(origin['Longitude']);
        if (lat != null && lon != null)
          locationHint = DiveLocationHint(lat, lon);
      }
    }
    _sort(depth);
    _sort(temperature);
    for (final points in pressure.values) _sort(points);
    events.sort((a, b) => a.at.compareTo(b.at));
    final tanks =
        gases
            .map(
              (gas) => DiveTankSummary(
                gasNumber: gas,
                startPressureValue: firstPressure[gas],
                endPressureValue: lastPressure[gas],
                pressureUnit: UnitProvenance.inferred,
              ),
            )
            .toList()
          ..sort((a, b) => a.gasNumber.compareTo(b.gasNumber));
    final headerDepth = _number(_map(header['Depth'])['Max']);
    return DiveComputerImportPreview(
      vendor: 'suunto',
      sourceHash: sha256.convert(bytes).toString(),
      startedAt: start,
      durationSeconds: duration,
      maxDepthValue: headerDepth ?? _max(depth),
      depthUnit: UnitProvenance.inferred,
      minTemperatureValue: _min(temperature),
      maxTemperatureValue: _max(temperature),
      temperatureUnit: UnitProvenance.inferred,
      tanks: tanks,
      gasNumbers: tanks.map((tank) => tank.gasNumber).toList(),
      events: events,
      profile: DiveComputerProfile(
        depth: depth,
        temperature: temperature,
        pressureByGas: pressure,
        events: events,
      ),
      locationHint: locationHint,
      warnings: [
        if (depth.isEmpty) 'Aucun profil de profondeur lisible.',
        if (temperature.isEmpty) 'Aucun profil de température lisible.',
      ],
    );
  }

  List<DiveProfilePoint> _points(
    List<Map<String, dynamic>> rows,
    String field,
    double Function(double) convert,
  ) => [
    for (final row in rows)
      if (_date(row['TimeISO8601']) case final at?)
        if (_number(row[field]) case final value?)
          DiveProfilePoint(
            at: at,
            value: convert(value),
            unit: UnitProvenance.inferred,
          ),
  ];
  Map<String, dynamic> _map(dynamic value) =>
      value is Map ? Map<String, dynamic>.from(value) : const {};
  double? _number(dynamic value) => value is num ? value.toDouble() : null;
  DateTime? _date(dynamic value) =>
      value is String ? DateTime.tryParse(value) : null;
  DateTime? _firstTime(List<Map<String, dynamic>> rows) {
    for (final row in rows) {
      final time = _date(row['TimeISO8601']);
      if (time != null) return time;
    }
    return null;
  }

  void _sort(List<DiveProfilePoint> points) =>
      points.sort((a, b) => a.at.compareTo(b.at));
  double? _min(List<DiveProfilePoint> points) => points.isEmpty
      ? null
      : points.map((p) => p.value).reduce((a, b) => a < b ? a : b);
  double? _max(List<DiveProfilePoint> points) => points.isEmpty
      ? null
      : points.map((p) => p.value).reduce((a, b) => a > b ? a : b);
}
