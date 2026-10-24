import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/models/dive_computer_import.dart';
import 'package:calymob/services/dive_site_source.dart';

void main() {
  test(
    'nearby sites are sorted by distance and expose only a display distance',
    () async {
      final source = CoordinateDiveSiteSource(
        () async => const [
          DiveSite(id: 'far', name: 'Far', latitude: 51, longitude: 4),
          DiveSite(id: 'near', name: 'Near', latitude: 50.01, longitude: 4),
        ],
      );
      final results = await source.nearby(const DiveLocationHint(50, 4));
      expect(results.map((site) => site.id), ['near']);
      expect(results.first.distanceKm, isNotNull);
    },
  );
}
