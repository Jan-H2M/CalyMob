import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/services/dive_computer_import_service.dart';

void main() {
  test('privacy filtered source removes identifiers and route unless opted in',
      () {
    final input = Uint8List.fromList(utf8.encode(jsonEncode({
      'DeviceLog': {
        'Device': {'Name': 'private', 'SerialNumber': 'private'},
        'Header': {
          'Personal': {'Name': 'private'}
        },
        'Samples': [
          {
            'Latitude': 1,
            'Longitude': 2,
            'DiveRoute': {'X': 1},
            'Depth': 3
          }
        ]
      }
    })));
    final decoded = jsonDecode(utf8.decode(
        DiveComputerImportService.privacyFilteredSource(input,
            allowRoute: false))) as Map;
    final text = jsonEncode(decoded);
    expect(text, isNot(contains('Latitude')));
    expect(text, isNot(contains('SerialNumber')));
    expect(text, isNot(contains('Personal')));
    expect(text, contains('Depth'));
  });
}
