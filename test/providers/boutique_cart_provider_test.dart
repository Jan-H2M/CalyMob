import 'dart:convert';

import 'package:calymob/models/boutique/boutique_product.dart';
import 'package:calymob/providers/boutique_cart_provider.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test(
    'revalidate upgrades and persists a legacy mandatory-logo line',
    () async {
      final legacy = _cartJson(
        key: 'legacy-key',
        unitPrice: 25.5,
        personalization: {
          'name': {'text': 'A', 'zone': 'chest_right'},
        },
      );
      SharedPreferences.setMockInitialValues({
        'boutique_cart_items_v1': jsonEncode([legacy]),
      });
      final cart = BoutiqueCartProvider(
        authStateChanges: const Stream<User?>.empty(),
      );
      await _waitUntilLoaded(cart);

      final result = await cart.revalidate([_product()]);

      expect(result, (removed: 0, repriced: 1));
      expect(cart.items, hasLength(1));
      final item = cart.items.single;
      expect(item.personalization['clubLogo'], {
        'enabled': true,
        'zone': 'chest_left',
        'surcharge': 2.0,
      });
      expect(item.personalization['name']['pricingMode'], 'fixed');
      expect(item.personalization['name']['fixedPrice'], 4.0);
      expect(item.unitPrice, 32);
      expect(item.key, isNot('legacy-key'));

      final prefs = await SharedPreferences.getInstance();
      final persisted = jsonDecode(prefs.getString('boutique_cart_items_v1')!)
          as List<dynamic>;
      expect(persisted.single['key'], item.key);
      expect(persisted.single['unitPrice'], 32);
      expect(
        persisted.single['personalization']['clubLogo']['enabled'],
        isTrue,
      );
    },
  );

  test(
    'missing, disabled and stale logo all canonicalize to current default',
    () {
      final product = _product();
      for (final raw in <Map<String, dynamic>>[
        const {},
        const {
          'clubLogo': {'enabled': false},
        },
        const {
          'clubLogo': {'enabled': true, 'zone': 'old_zone', 'surcharge': 0},
        },
      ]) {
        final normalized = normalizeBoutiqueCartPersonalization(product, raw);
        expect(normalized['clubLogo'], {
          'enabled': true,
          'zone': 'chest_left',
          'surcharge': 2.0,
        });
        expect(normalized['surcharge'], 2.0);
      }
    },
  );

  test(
    'legacy per-character pricing remains supported during revalidation',
    () {
      final product = _product(
        pricingMode: BoutiqueNamePricingMode.perCharacter,
      );
      final one = normalizeBoutiqueCartPersonalization(product, const {
        'name': {'text': 'A', 'zone': 'chest_right'},
      });
      final many = normalizeBoutiqueCartPersonalization(product, const {
        'name': {'text': 'ABCD', 'zone': 'chest_right'},
      });

      expect(one['name']['pricingMode'], 'per_character');
      expect(one['name']['surcharge'], 1.5);
      expect(many['name']['surcharge'], 3.0);
    },
  );

  test('cart normalization keeps fixed price equal for one and many letters', () {
    final product = _product();
    final one = normalizeBoutiqueCartPersonalization(product, const {
      'name': {'text': 'A', 'zone': 'chest_right'},
    });
    final many = normalizeBoutiqueCartPersonalization(product, const {
      'name': {'text': 'ABCDEFGHIJK', 'zone': 'chest_right'},
    });

    expect(one['surcharge'], 7.0);
    expect(many['surcharge'], 7.0);
    expect(one['name']['surcharge'], many['name']['surcharge']);
  });

  test('canonical cart key ignores map insertion order', () {
    final left = boutiqueCartKey(
      productId: 'polo',
      variantId: 'm',
      deliveryMode: 'pool_pickup',
      personalization: const {
        'surcharge': 2,
        'clubLogo': {'zone': 'chest_left', 'enabled': true},
      },
    );
    final right = boutiqueCartKey(
      productId: 'polo',
      variantId: 'm',
      deliveryMode: 'pool_pickup',
      personalization: const {
        'clubLogo': {'enabled': true, 'zone': 'chest_left'},
        'surcharge': 2,
      },
    );

    expect(left, right);
  });

  test('revalidate merges legacy lines that normalize to the same key',
      () async {
    SharedPreferences.setMockInitialValues({
      'boutique_cart_items_v1': jsonEncode([
        _cartJson(
            key: 'missing-logo', unitPrice: 25, personalization: const {}),
        {
          ..._cartJson(
            key: 'disabled-logo',
            unitPrice: 25,
            personalization: const {
              'clubLogo': {'enabled': false},
            },
          ),
          'qty': 2,
        },
      ]),
    });
    final cart = BoutiqueCartProvider(
      authStateChanges: const Stream<User?>.empty(),
    );
    await _waitUntilLoaded(cart);

    await cart.revalidate([_product()]);

    expect(cart.items, hasLength(1));
    expect(cart.items.single.qty, 3);
    expect(cart.items.single.unitPrice, 27);
  });
}

Future<void> _waitUntilLoaded(BoutiqueCartProvider cart) async {
  for (var attempt = 0; attempt < 20 && !cart.loaded; attempt += 1) {
    await Future<void>.delayed(Duration.zero);
  }
  expect(cart.loaded, isTrue);
}

Map<String, dynamic> _cartJson({
  required String key,
  required double unitPrice,
  required Map<String, dynamic> personalization,
}) {
  return {
    'key': key,
    'productId': 'polo',
    'productName': 'Ancien polo',
    'supplierId': 'supplier',
    'variantId': 'm',
    'variantLabel': 'M',
    'deliveryMode': 'pool_pickup',
    'deliveryLabel': 'Retrait piscine',
    'qty': 1,
    'unitPrice': unitPrice,
    'deliverySurcharge': 0,
    'personalization': personalization,
  };
}

BoutiqueProduct _product({
  BoutiqueNamePricingMode pricingMode = BoutiqueNamePricingMode.fixed,
}) {
  return BoutiqueProduct(
    id: 'polo',
    name: 'Polo Calypso',
    description: '',
    category: BoutiqueProductCategory.vetements,
    supplierId: 'supplier',
    images: const [],
    pricing: const BoutiquePrice(salePrice: 25, currency: 'EUR'),
    inventoryMode: BoutiqueInventoryMode.tracked,
    variants: const [
      BoutiqueVariant(
        id: 'm',
        label: 'M',
        attributes: {},
        stockCount: 10,
        allowBackorder: false,
      ),
    ],
    deliveryModes: const [BoutiqueDeliveryMode.poolPickup],
    deliverySurcharges: const {},
    visibility: 'published',
    personalization: BoutiquePersonalizationConfig(
      enabled: true,
      baseType: 'polo',
      technique: BoutiqueCustomizationTechnique.embroidery,
      productionConstraints: const BoutiqueProductionConstraints(
        minimumOrderQuantity: 1,
        setupCost: 0,
        groupOrderOnly: false,
      ),
      clubLogo: const BoutiquePersonalizationOption(
        enabled: true,
        zones: ['chest_left', 'back'],
        surcharge: 2,
      ),
      name: BoutiqueNameOption(
        enabled: true,
        zones: const ['chest_right'],
        surcharge: 1,
        pricingMode: pricingMode,
        pricePerCharacter: 0.5,
        fixedPrice: 4,
        maxLength: 12,
      ),
      certification: const BoutiqueCertificationOption(
        enabled: true,
        zones: ['sleeve_left'],
        surcharge: 3,
        allowedValues: ['P1', 'P2'],
      ),
    ),
  );
}
