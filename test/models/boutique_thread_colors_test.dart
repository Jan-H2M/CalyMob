import 'package:calymob/models/boutique/boutique_product.dart';
import 'package:calymob/providers/boutique_cart_provider.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'MOB-052 reproduction: catalogue fixed and selectable thread colours survive parsing',
    () {
      final option = BoutiqueNameOption.fromMap({
        'enabled': true,
        'zones': ['back'],
        'color': 'Rouge',
        'allowedColors': ['Rouge', 'Bleu'],
        'fixedPrice': 4,
      });
      expect(option.threadColors.choices, ['Rouge', 'Bleu']);
      expect(option.threadColors.resolve(null), 'Rouge');
      expect(option.threadColors.resolve('bleu'), 'Bleu');
    },
  );
  test('old clients get configured default without a colour surcharge', () {
    final config = BoutiquePersonalizationConfig.fromMap({
      'enabled': true,
      'name': {
        'enabled': true,
        'zones': ['back'],
        'pricingMode': 'fixed',
        'fixedPrice': 4,
        'color': 'Rouge',
        'allowedColors': ['Rouge', 'Bleu'],
      },
    })!;
    const selection = BoutiquePersonalizationSelection(
      nameEnabled: true,
      nameText: 'FICTIF',
      nameZone: 'back',
    );
    expect(selection.toOrderPayload(config)['name']['color'], 'Rouge');
    expect(
      selection
          .copyWith(nameColor: 'Bleu')
          .toOrderPayload(config)['name']['color'],
      'Bleu',
    );
    expect(
      selection.surcharge(config),
      selection.copyWith(nameColor: 'Bleu').surcharge(config),
    );
    expect(
      () => selection.copyWith(nameColor: 'Vert').toOrderPayload(config),
      throwsArgumentError,
    );
  });
  test(
    'fixed legacy colour and absent palette remain backwards compatible',
    () {
      expect(
        BoutiqueThreadColors.fromMap({'color': 'Blanc'}).resolve(null),
        'Blanc',
      );
      expect(BoutiqueThreadColors.fromMap({}).resolve(null), isNull);
      expect(
        BoutiqueThreadColors.fromMap({
          'allowedColors': ['Bleu'],
          'color': 'Vert',
        }).defaultColor,
        'Bleu',
      );
    },
  );
  for (final raw in [
    null,
    'Rouge',
    [''],
    [3],
    ['<img>'],
    ['A' * 41],
    List.generate(17, (i) => '$i'),
  ]) {
    test('malformed palette $raw fails closed', () {
      final colors = BoutiqueThreadColors.fromMap({'allowedColors': raw});
      expect(colors.valid, isFalse);
      expect(colors.accepts(null), isFalse);
    });
  }
  test(
    'saved colours distinguish cart lines and remain readable in order history',
    () {
      final red = {
        'name': {'text': 'FICTIF', 'zone': 'back', 'color': 'Rouge'},
      };
      final blue = {
        'name': {'text': 'FICTIF', 'zone': 'back', 'color': 'Bleu'},
      };
      String key(Map<String, dynamic> data) => boutiqueCartKey(
        productId: 'dev-polo',
        variantId: 'm',
        deliveryMode: 'pool_pickup',
        personalization: data,
      );
      expect(key(red), isNot(key(blue)));
      expect(
        boutiquePersonalizationLines(red).single,
        contains('couleur : Rouge'),
      );
    },
  );
  test('clearing a personalization clears its colour too', () {
    final cleared = const BoutiquePersonalizationSelection(
      nameColor: 'Rouge',
      certificationColor: 'Blanc',
    ).copyWith(clearNameColor: true, clearCertificationColor: true);
    expect(cleared.nameColor, isNull);
    expect(cleared.certificationColor, isNull);
  });
}
