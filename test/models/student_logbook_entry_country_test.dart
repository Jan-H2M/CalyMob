import 'package:calymob/models/student_logbook_entry.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  StudentLogbookEntry entry({String? country}) => StudentLogbookEntry(
        id: '',
        memberId: 'member-1',
        source: 'manual',
        date: DateTime(2026, 8, 3),
        locationName: 'Krk',
        country: country,
      );

  test('new records store only normalized ISO alpha-2', () {
    expect(entry(country: 'croatie').toMap()['country'], 'HR');
    expect(entry(country: 'pt').toMap()['country'], 'PT');
  });

  test('legacy records remain valid without a country', () {
    final map = entry().toMap();
    expect(map.containsKey('country'), isFalse);
    expect(map['location_name'], 'Krk');
  });

  test('invalid values are not silently persisted', () {
    expect(entry(country: 'Atlantide').toMap().containsKey('country'), isFalse);
  });
}
