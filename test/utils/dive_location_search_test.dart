import 'package:calymob/utils/dive_location_search.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const location = DiveLocationSearchCandidate(
    name: 'Carrière de Vodelée',
    countryCode: 'BE',
    countryLabel: 'Belgique',
    region: 'Namur',
    zone: 'Wallonie',
    type: 'Carrière',
    aliases: ['Vodelee'],
  );

  test('normalizes accents and applies deterministic shared ranking', () {
    expect(normalizeDiveLocationSearch('Vodelée'), 'vodelee');
    expect(scoreDiveLocation(location, 'Carrière de Vodelée'), 0);
    expect(scoreDiveLocation(location, 'Car'), 1);
    expect(scoreDiveLocation(location, 'Vodelee'), 2);
    expect(scoreDiveLocation(location, 'Belgique'), 4);
    expect(scoreDiveLocation(location, 'BE'), 4);
    expect(scoreDiveLocation(location, 'Namur'), 4);
    expect(scoreDiveLocation(location, 'introuvable'), 999);
  });
}
