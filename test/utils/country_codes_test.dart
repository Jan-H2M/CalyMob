import 'package:calymob/utils/country_codes.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('country code contract', () {
    test('normalizes ISO codes and legacy FR/NL/EN names', () {
      expect(normalizeCountryCode(' hr '), 'HR');
      expect(normalizeCountryCode('Croatie'), 'HR');
      expect(normalizeCountryCode('Kroatië'), 'HR');
      expect(normalizeCountryCode('Croatia'), 'HR');
      expect(normalizeCountryCode('Atlantide'), isNull);
      expect(normalizeCountryCode(null), isNull);
    });

    test('localizes country names in French, Dutch and English', () {
      expect(countryDisplayName('HR', languageCode: 'fr'), 'Croatie');
      expect(countryDisplayName('HR', languageCode: 'nl'), 'Kroatië');
      expect(countryDisplayName('HR', languageCode: 'en'), 'Croatia');
      expect(
        countryDisplayName('EG', languageCode: 'fr', includeCode: true),
        'Égypte · EG',
      );
    });

    test('orders recent values before common local defaults', () {
      expect(
        countryFavorites(['PT', 'HR', 'pt']),
        ['PT', 'HR', 'BE', 'NL', 'FR'],
      );
    });
  });
}
