class DiveComputerImportPreview {
  final String vendor;
  final String sourceHash;
  final DateTime startedAt;
  final int durationSeconds;
  final double? maxDepthMeters;
  final UnitProvenance depthUnit;
  final double? minTemperatureCelsius;
  final double? maxTemperatureCelsius;
  final UnitProvenance temperatureUnit;
  final List<DiveTankSummary> tanks;
  final List<int> gasNumbers;
  final List<DiveDeviceEvent> events;
  final DiveComputerProfile profile;
  final DiveLocationHint? locationHint;
  final List<String> warnings;

  const DiveComputerImportPreview({
    required this.vendor,
    required this.sourceHash,
    required this.startedAt,
    required this.durationSeconds,
    required this.maxDepthMeters,
    required this.depthUnit,
    required this.minTemperatureCelsius,
    required this.maxTemperatureCelsius,
    required this.temperatureUnit,
    required this.tanks,
    required this.gasNumbers,
    required this.events,
    required this.profile,
    required this.locationHint,
    required this.warnings,
  });

  int get durationMinutes => (durationSeconds / 60).round();

  Map<String, dynamic> computerImportMetadata({
    required String importId,
    required String retention,
    bool routeOptIn = false,
  }) => {
    'id': importId,
    'vendor': vendor,
    'adapter_version': 1,
    'source_hash': sourceHash,
    'started_at': startedAt.toIso8601String(),
    'duration_seconds': durationSeconds,
    'depth_unit': depthUnit.name,
    'temperature_unit': temperatureUnit.name,
    'retention': retention,
    'route_opt_in': routeOptIn,
  };
}

enum UnitProvenance { declared, inferred, unknown }

class DiveTankSummary {
  final int gasNumber;
  final double? startPressureBar;
  final double? endPressureBar;
  final UnitProvenance pressureUnit;
  const DiveTankSummary({
    required this.gasNumber,
    this.startPressureBar,
    this.endPressureBar,
    required this.pressureUnit,
  });
  Map<String, dynamic> toMap() => {
    'gas_number': gasNumber,
    if (startPressureBar != null) 'start_pressure_bar': startPressureBar,
    if (endPressureBar != null) 'end_pressure_bar': endPressureBar,
    'pressure_unit': pressureUnit.name,
  };
}

class DiveDeviceEvent {
  final DateTime at;
  final String category;
  final String? type;
  final int? gasNumber;
  const DiveDeviceEvent({
    required this.at,
    required this.category,
    this.type,
    this.gasNumber,
  });
  Map<String, dynamic> toMap() => {
    'at': at.toIso8601String(),
    'category': category,
    if (type != null) 'type': type,
    if (gasNumber != null) 'gas_number': gasNumber,
  };
}

/// Kept in memory for a nearby-site lookup only. It is never serialised.
class DiveLocationHint {
  final double latitude;
  final double longitude;
  const DiveLocationHint(this.latitude, this.longitude);
}

/// Normalised profile deliberately excludes GPS, route, serial and personal data.
class DiveComputerProfile {
  final List<DiveProfilePoint> depth;
  final List<DiveProfilePoint> temperature;
  final Map<int, List<DiveProfilePoint>> pressureByGas;
  final List<DiveDeviceEvent> events;
  const DiveComputerProfile({
    required this.depth,
    required this.temperature,
    required this.pressureByGas,
    required this.events,
  });
  Map<String, dynamic> toStorageJson() => {
    'schema_version': 1,
    'recorded': {
      'depth': depth.map((p) => p.toMap()).toList(),
      'temperature': temperature.map((p) => p.toMap()).toList(),
      'pressure_by_gas': {
        for (final e in pressureByGas.entries)
          '${e.key}': e.value.map((p) => p.toMap()).toList(),
      },
      'events': events.map((event) => event.toMap()).toList(),
    },
  };
}

class DiveProfilePoint {
  final DateTime at;
  final double value;
  final UnitProvenance unit;
  const DiveProfilePoint({
    required this.at,
    required this.value,
    required this.unit,
  });
  Map<String, dynamic> toMap() => {
    'at': at.toIso8601String(),
    'value': value,
    'unit': unit.name,
  };
}
