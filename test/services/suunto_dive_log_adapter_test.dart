import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/services/suunto_dive_log_adapter.dart';
import 'package:calymob/models/dive_computer_import.dart';

void main() {
  const adapter = SuuntoDiveLogAdapter();
  test(
    'parses a sanitised multi-channel DeviceLog without retaining route',
    () {
      final preview = adapter.parse(utf8.encode(jsonEncode(_fixture())));
      expect(preview.vendor, 'suunto');
      expect(preview.startedAtSource, contains('+02:00'));
      expect(preview.durationSeconds, 4016);
      expect(preview.maxDepthValue, 61.3);
      expect(preview.minTemperatureValue, 17.0);
      expect(preview.tanks.single.startPressureValue, 210);
      expect(preview.tanks.single.endPressureValue, 150);
      expect(preview.depthUnit, UnitProvenance.declared);
      expect(preview.temperatureUnit, UnitProvenance.declared);
      expect(preview.gasNumbers, [1]);
      expect(
        preview.events.map((e) => e.category),
        containsAll(['Warning', 'GasSwitch']),
      );
      expect(
        preview.profile.toStorageJson().toString(),
        isNot(contains('Latitude')),
      );
      expect(
        preview.profile.toStorageJson().toString(),
        isNot(contains('DiveRoute')),
      );
      expect(preview.locationHint, isNotNull); // local-only lookup hint
    },
  );

  test('rejects a non DeviceLog JSON file', () {
    expect(() => adapter.parse(utf8.encode('{}')), throwsFormatException);
  });

  test('keeps zero-indexed primary tank and converts Kelvin and Pascals', () {
    final json = _fixture();
    final samples = json['DeviceLog']!['Samples'] as List;
    for (final sample in samples) {
      sample['Temperature'] = sample == samples.first ? 290.3 : 298.5;
      sample['Cylinders'] = [{'GasNumber': 0, 'Pressure': sample == samples.first ? 22448438 : 3332812}];
    }
    final preview = adapter.parse(utf8.encode(jsonEncode(json)));
    final tank = preview.tanks.firstWhere((tank) => tank.gasNumber == 0);
    expect(tank.startPressureValue, 224.5);
    expect(tank.endPressureValue, 33.3);
    expect(preview.minTemperatureValue, 17.2);
    expect(preview.maxTemperatureValue, 25.4);
  });

  test('sorts each channel even when the full stream is out of order', () {
    final json = _fixture();
    (json['DeviceLog']!['Samples'] as List).insert(0, {
      'TimeISO8601': '2026-10-22T10:38:50+02:00',
      'Depth': 1,
    });
    final points = adapter.parse(utf8.encode(jsonEncode(json))).profile.depth;
    expect(points.first.at.isBefore(points.last.at), isTrue);
  });
}

/// Hand-written fixture: no real name, serial number or coordinates.
Map<String, dynamic> _fixture() => {
      'DeviceLog': {
        'Header': {
          'DateTime': '2026-10-22T10:38:51.210+02:00',
          'DiveTime': 4016.5,
          'Depth': {'Max': 61.3},
        },
        'Samples': [
          {
            'TimeISO8601': '2026-10-22T10:38:51.210+02:00',
            'Depth': 0,
            'Temperature': 290.15,
            'Cylinders': [
              {'GasNumber': 1, 'Pressure': 210},
            ],
            'DiveRouteOrigin': {'Latitude': 50.0, 'Longitude': 4.0},
          },
          {
            'TimeISO8601': '2026-10-22T10:39:01.210+02:00',
            'Depth': 61.0,
            'Temperature': 292.15,
            'Cylinders': [
              {'GasNumber': 1, 'Pressure': 150},
            ],
            'DiveEvents': {
              'Warning': {'Type': 'sample-warning', 'Active': true},
              'GasSwitch': {'GasNumber': 1},
            },
          },
        ],
      },
    };
