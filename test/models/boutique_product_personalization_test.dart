import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/models/boutique/boutique_product.dart';

void main() {
  BoutiquePersonalizationConfig config({
    bool logoDefaultSelected = true,
    List<String> logoZones = const ['chest_left'],
  }) {
    return BoutiquePersonalizationConfig(
      enabled: true,
      baseType: 'polo',
      technique: BoutiqueCustomizationTechnique.embroidery,
      productionConstraints: const BoutiqueProductionConstraints(
        minimumOrderQuantity: 1,
        setupCost: 0,
        groupOrderOnly: false,
      ),
      clubLogo: BoutiquePersonalizationOption(
        enabled: true,
        zones: logoZones,
        surcharge: 2,
        defaultSelected: logoDefaultSelected,
      ),
      name: const BoutiqueNameOption(
        enabled: false,
        zones: [],
        surcharge: 0,
        pricePerCharacter: 0,
      ),
      certification: const BoutiqueCertificationOption(
        enabled: false,
        zones: [],
        surcharge: 0,
        allowedValues: [],
      ),
    );
  }

  group('Boutique club logo default selection', () {
    test('legacy logo-enabled products default to selected', () {
      final parsed = BoutiquePersonalizationConfig.fromMap({
        'enabled': true,
        'baseType': 'polo',
        'clubLogo': {
          'enabled': true,
          'zones': ['chest_left'],
          'surcharge': 2,
        },
        'name': {'enabled': false},
        'certification': {'enabled': false},
      })!;

      expect(parsed.clubLogo.defaultSelected, isTrue);
      final selection = BoutiquePersonalizationSelection.initial(parsed);
      expect(selection.clubLogo, isTrue);
      expect(selection.clubLogoZone, 'chest_left');
    });

    test('admin opt-out keeps the logo unchecked', () {
      final parsed = BoutiquePersonalizationConfig.fromMap({
        'enabled': true,
        'baseType': 'polo',
        'clubLogo': {
          'enabled': true,
          'zones': ['chest_left'],
          'surcharge': 2,
          'defaultSelected': false,
        },
        'name': {'enabled': false},
        'certification': {'enabled': false},
      })!;

      expect(parsed.clubLogo.defaultSelected, isFalse);
      final selection = BoutiquePersonalizationSelection.initial(parsed);
      expect(selection.clubLogo, isFalse);
      expect(selection.clubLogoZone, isNull);
    });

    test('multiple logo zones stay selected but require a position', () {
      final selection = BoutiquePersonalizationSelection.initial(
        config(logoZones: const ['chest_left', 'sleeve_left']),
      );

      expect(selection.clubLogo, isTrue);
      expect(selection.clubLogoZone, isNull);
      expect(selection.surcharge(config()), 0);
    });

    test('single-zone default logo is included in the order payload', () {
      final productConfig = config();
      final selection = BoutiquePersonalizationSelection.initial(productConfig);
      final payload = selection.toOrderPayload(productConfig);

      expect(payload['surcharge'], 2);
      expect(payload['clubLogo'], {
        'enabled': true,
        'zone': 'chest_left',
        'surcharge': 2,
      });
    });
  });
}
