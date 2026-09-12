import 'package:calymob/models/boutique/boutique_product.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const config = BoutiquePersonalizationConfig(
    enabled: true,
    baseType: 'polo',
    technique: BoutiqueCustomizationTechnique.embroidery,
    productionConstraints: BoutiqueProductionConstraints(
      minimumOrderQuantity: 1,
      setupCost: 0,
      groupOrderOnly: false,
    ),
    clubLogo: BoutiquePersonalizationOption(
      enabled: true,
      zones: ['chest_left'],
      surcharge: 2,
    ),
    name: BoutiqueNameOption(
      enabled: true,
      zones: ['chest_right'],
      surcharge: 1,
      pricingMode: BoutiqueNamePricingMode.fixed,
      pricePerCharacter: 0.5,
      fixedPrice: 4,
      maxLength: 12,
    ),
    certification: BoutiqueCertificationOption(
      enabled: true,
      zones: ['sleeve_left'],
      surcharge: 3,
      allowedValues: ['P1', 'P2'],
    ),
  );

  test('copyWith can completely clear name and certification values', () {
    const selection = BoutiquePersonalizationSelection(
      clubLogo: true,
      clubLogoZone: 'chest_left',
      nameEnabled: true,
      nameText: 'JAN',
      nameZone: 'chest_right',
      certificationEnabled: true,
      certification: 'P2',
      certificationZone: 'sleeve_left',
    );

    final cleared = selection.copyWith(
      nameEnabled: false,
      clearNameText: true,
      clearNameZone: true,
      certificationEnabled: false,
      clearCertification: true,
      clearCertificationZone: true,
    );

    expect(cleared.nameText, isNull);
    expect(cleared.nameZone, isNull);
    expect(cleared.certification, isNull);
    expect(cleared.certificationZone, isNull);
    expect(cleared.surcharge(config), 2);

    final payload = cleared.toOrderPayload(config);
    expect(payload['clubLogo'], {
      'enabled': true,
      'zone': 'chest_left',
      'surcharge': 2,
    });
    expect(payload, isNot(contains('name')));
    expect(payload, isNot(contains('certification')));
  });

  test('fixed name price is invariant for one or many letters', () {
    const one = BoutiquePersonalizationSelection(
      clubLogo: true,
      clubLogoZone: 'chest_left',
      nameEnabled: true,
      nameText: 'A',
      nameZone: 'chest_right',
    );
    const many = BoutiquePersonalizationSelection(
      clubLogo: true,
      clubLogoZone: 'chest_left',
      nameEnabled: true,
      nameText: 'ABCDEFGHIJK',
      nameZone: 'chest_right',
    );

    expect(one.surcharge(config), 7);
    expect(many.surcharge(config), 7);
    expect(one.toOrderPayload(config)['name']['pricingMode'], 'fixed');
    expect(one.toOrderPayload(config)['name']['fixedPrice'], 4);
  });

  test('legacy per-character name pricing remains length based', () {
    const legacyName = BoutiqueNameOption(
      enabled: true,
      zones: ['chest_right'],
      surcharge: 1,
      pricingMode: BoutiqueNamePricingMode.perCharacter,
      pricePerCharacter: 0.5,
      fixedPrice: 0,
    );

    expect(legacyName.priceForText('A'), 0.5);
    expect(legacyName.priceForText('ABCD'), 2);
  });
}
