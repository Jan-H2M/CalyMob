import 'package:calymob/screens/operations/event_waitlist_defaults.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('new event waitlist default', () {
    test('is enabled only for dives with a positive finite capacity', () {
      expect(
        EventWaitlistDefaults.effectiveValue(
          eventCategory: 'plongee',
          capacityText: '12',
        ),
        isTrue,
      );

      for (final capacity in ['', '0', '-1', 'illimité']) {
        expect(
          EventWaitlistDefaults.effectiveValue(
            eventCategory: 'plongee',
            capacityText: capacity,
          ),
          isFalse,
          reason: 'capacity "$capacity" is not a positive finite quota',
        );
      }
      expect(
        EventWaitlistDefaults.effectiveValue(
          eventCategory: 'sortie',
          capacityText: '12',
        ),
        isFalse,
      );
    });

    test('an explicit create-form choice is preserved', () {
      expect(
        EventWaitlistDefaults.effectiveValue(
          eventCategory: 'plongee',
          capacityText: '12',
          explicitChoice: false,
        ),
        isFalse,
      );
      expect(
        EventWaitlistDefaults.effectiveValue(
          eventCategory: 'sortie',
          capacityText: '',
          explicitChoice: true,
        ),
        isTrue,
      );
    });
  });
}
