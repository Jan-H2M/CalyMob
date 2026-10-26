import 'package:calymob/models/dive_location.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('DiveEnvironment.fromFirestore', () {
    test('keeps Mer, Carrière and Lac as distinct CalyCompta categories', () {
      expect(
        DiveEnvironment.fromFirestore({'location_type': 'Mer'}),
        DiveEnvironment.sea,
      );
      expect(
        DiveEnvironment.fromFirestore({'location_type': 'Carrière'}),
        DiveEnvironment.career,
      );
      expect(
        DiveEnvironment.fromFirestore({'location_type': 'Lac'}),
        DiveEnvironment.lake,
      );
    });

    test(
      'retains broad legacy water types without inventing a quarry or lake',
      () {
        expect(
          DiveEnvironment.fromFirestore({'water_type': 'sea'}),
          DiveEnvironment.sea,
        );
        expect(
          DiveEnvironment.fromFirestore({'water_type': 'fresh'}),
          DiveEnvironment.freshWater,
        );
        expect(DiveEnvironment.fromFirestore({}), DiveEnvironment.other);
      },
    );

    test('writes only canonical CalyCompta operation types', () {
      expect(DiveEnvironment.career.operationLieuType, 'Carrière');
      expect(DiveEnvironment.lake.operationLieuType, 'Lac');
      expect(DiveEnvironment.sea.operationLieuType, 'Mer');
      // A legacy broad fresh-water record must not be silently recategorised.
      expect(DiveEnvironment.freshWater.operationLieuType, isNull);
    });

    test(
        'groups event-picker locations into separate Mer, Carrière and Lac sections',
        () {
      DiveLocation location(String id, DiveEnvironment environment) =>
          DiveLocation(
            id: id,
            name: id,
            country: 'BE',
            createdAt: DateTime(2026),
            updatedAt: DateTime(2026),
            environment: environment,
          );

      final groups = groupDiveLocationsByEnvironment([
        location('The sea', DiveEnvironment.sea),
        location('The quarry', DiveEnvironment.career),
        location('The lake', DiveEnvironment.lake),
        location('Legacy fresh water', DiveEnvironment.freshWater),
      ]);

      expect(groups[DiveEnvironment.sea]!.single.name, 'The sea');
      expect(groups[DiveEnvironment.career]!.single.name, 'The quarry');
      expect(groups[DiveEnvironment.lake]!.single.name, 'The lake');
      expect(groups[DiveEnvironment.freshWater]!.single.name,
          'Legacy fresh water');
    });
  });
}
