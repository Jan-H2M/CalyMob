import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/models/dive_location.dart';

void main() {
  group('DiveLocation activity availability', () {
    DiveLocation location({bool availableForEvents = true}) => DiveLocation(
          id: 'location-1',
          name: 'Test location',
          country: 'BE',
          availableForEvents: availableForEvents,
          createdAt: DateTime(2026),
          updatedAt: DateTime(2026),
        );

    test('legacy locations remain available by default', () {
      expect(location().availableForEvents, isTrue);
    });

    test('locations disabled in CalyCompta are unavailable', () {
      expect(location(availableForEvents: false).availableForEvents, isFalse);
    });
  });
}
