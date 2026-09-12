import 'package:calymob/models/boutique/boutique_product.dart';
import 'package:calymob/providers/boutique_cart_provider.dart';
import 'package:calymob/screens/boutique/boutique_product_detail_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:provider/provider.dart';

class _RecordingBoutiqueCartProvider extends Mock
    implements BoutiqueCartProvider {
  final List<BoutiqueCartItem> addedItems = [];
  final List<String> replacedKeys = [];
  final List<BoutiqueCartItem> replacementItems = [];

  @override
  Future<void> addItem(BoutiqueCartItem item) async {
    addedItems.add(item);
  }

  @override
  Future<void> replaceItem(
    String originalKey,
    BoutiqueCartItem replacement,
  ) async {
    replacedKeys.add(originalKey);
    replacementItems.add(replacement);
  }
}

void main() {
  late _RecordingBoutiqueCartProvider cart;

  setUp(() {
    cart = _RecordingBoutiqueCartProvider();
  });

  testWidgets(
    'personalization card keeps logo mandatory and separates toggles, count and price',
    (tester) async {
      await _pumpProduct(tester, cart: cart, product: _product());

      final logo = find.byKey(const Key('boutique-club-logo-required'));
      expect(logo, findsOneWidget);
      expect(
        find.descendant(of: logo, matching: find.byType(Switch)),
        findsNothing,
      );

      final nameToggle = find.byKey(const Key('boutique-name-toggle'));
      final certificationToggle = find.byKey(
        const Key('boutique-certification-toggle'),
      );
      expect(
        find.descendant(of: nameToggle, matching: find.byType(Switch)),
        findsOneWidget,
      );
      expect(
        find.descendant(of: certificationToggle, matching: find.byType(Switch)),
        findsOneWidget,
      );

      final nameSwitch = find.descendant(
        of: nameToggle,
        matching: find.byType(Switch),
      );
      await tester.ensureVisible(nameSwitch);
      await tester.pump();
      await tester.tap(nameSwitch);
      await tester.pump();
      final nameField = find.byKey(const Key('boutique-name-field'));
      await tester.ensureVisible(nameField);
      await tester.enterText(nameField, 'JAN');
      await tester.pump();

      final letterCount = find.byKey(const Key('boutique-name-letter-count'));
      final namePrice = find.byKey(const Key('boutique-name-price'));
      expect(letterCount, findsOneWidget);
      expect(namePrice, findsOneWidget);
      expect(find.text('3/12 lettres'), findsOneWidget);

      final countRow = find.ancestor(
        of: letterCount,
        matching: find.byType(Row),
      );
      final priceRow = find.ancestor(of: namePrice, matching: find.byType(Row));
      expect(countRow, findsOneWidget);
      expect(priceRow, findsOneWidget);
      expect(countRow.evaluate().single, isNot(priceRow.evaluate().single));
    },
  );

  testWidgets(
    'legacy cart edit forces logo and hydrates then clears the name',
    (tester) async {
      const editingItem = BoutiqueCartItem(
        key: 'legacy-line',
        productId: 'polo',
        productName: 'Polo Calypso',
        supplierId: 'supplier',
        variantId: 'm',
        variantLabel: 'M',
        deliveryMode: 'pool_pickup',
        deliveryLabel: 'Retrait piscine',
        qty: 1,
        unitPrice: 25,
        deliverySurcharge: 0,
        personalization: {
          'clubLogo': {'enabled': false},
          'name': {'text': 'ANNE', 'zone': 'chest_right'},
        },
      );
      await _pumpHost(
        tester,
        cart: cart,
        product: _product(),
        editingItem: editingItem,
      );
      await tester.tap(find.text('Ouvrir le produit'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 350));

      final nameField = find.byKey(const Key('boutique-name-field'));
      expect(nameField, findsOneWidget);
      expect(tester.widget<TextField>(nameField).controller?.text, 'ANNE');

      final nameSwitch = find.descendant(
        of: find.byKey(const Key('boutique-name-toggle')),
        matching: find.byType(Switch),
      );
      await tester.ensureVisible(nameSwitch);
      await tester.pump();
      await tester.tap(nameSwitch);
      await tester.pump();
      expect(nameField, findsNothing);
      await tester.tap(nameSwitch);
      await tester.pump();
      expect(tester.widget<TextField>(nameField).controller?.text, isEmpty);

      final save = find.textContaining('Mettre à jour le panier');
      await tester.ensureVisible(save);
      await tester.drag(find.byType(ListView), const Offset(0, -160));
      await tester.pump();
      await tester.tap(save);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 350));

      expect(cart.replacedKeys, ['legacy-line']);
      final captured = cart.replacementItems.single;
      expect(captured.personalization['clubLogo'], {
        'enabled': true,
        'zone': 'chest_left',
        'surcharge': 2,
      });
      expect(captured.personalization, isNot(contains('name')));
      expect(find.text('Article modifié dans le panier.'), findsOneWidget);
    },
  );

  testWidgets('fixed name price shown in the card ignores letter count', (
    tester,
  ) async {
    await _pumpProduct(tester, cart: cart, product: _product());
    final nameSwitch = find.descendant(
      of: find.byKey(const Key('boutique-name-toggle')),
      matching: find.byType(Switch),
    );
    await tester.ensureVisible(nameSwitch);
    await tester.pump();
    await tester.tap(nameSwitch);
    await tester.pump();
    final nameField = find.byKey(const Key('boutique-name-field'));
    await tester.enterText(nameField, 'A');
    await tester.pump();
    final priceFinder = find.byKey(const Key('boutique-name-price'));
    final oneLetterPrice = tester.widget<Text>(priceFinder).data;

    await tester.enterText(nameField, 'ABCDEFGHIJK');
    await tester.pump();

    expect(tester.widget<Text>(priceFinder).data, oneLetterPrice);
    expect(find.text('11/12 lettres'), findsOneWidget);
  });

  for (final width in [320.0, 375.0]) {
    testWidgets('personalization card has no overflow at ${width.toInt()}px', (
      tester,
    ) async {
      await tester.binding.setSurfaceSize(Size(width, 800));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await _pumpProduct(tester, cart: cart, product: _product());
      final nameSwitch = find.descendant(
        of: find.byKey(const Key('boutique-name-toggle')),
        matching: find.byType(Switch),
      );
      await tester.ensureVisible(nameSwitch);
      await tester.pump();
      await tester.tap(nameSwitch);
      await tester.pump();
      await tester.enterText(
        find.byKey(const Key('boutique-name-field')),
        'ABCDEFGHIJK',
      );
      await tester.pump();

      expect(tester.takeException(), isNull);
    });
  }

  testWidgets(
    'add flow returns without SnackBar and leaves host action clickable',
    (tester) async {
      final hostKey = GlobalKey<_ProductHostState>();
      await _pumpHost(
        tester,
        cart: cart,
        product: _product(personalization: false),
        hostKey: hostKey,
      );
      await tester.tap(find.text('Ouvrir le produit'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 350));

      final add = find.textContaining('Ajouter au panier');
      await tester.ensureVisible(add);
      await tester.drag(find.byType(ListView), const Offset(0, -160));
      await tester.pump();
      await tester.tap(add);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 900));
      await tester.pump(const Duration(milliseconds: 150));
      await tester.pump(const Duration(milliseconds: 350));

      expect(cart.addedItems, hasLength(1));
      expect(find.text('Article ajouté au panier.'), findsNothing);
      expect(find.text('Paiement'), findsOneWidget);
      await tester.tap(find.text('Paiement'));
      await tester.pump();
      expect(hostKey.currentState?.paymentTaps, 1);
    },
  );
}

Future<void> _pumpProduct(
  WidgetTester tester, {
  required BoutiqueCartProvider cart,
  required BoutiqueProduct product,
}) {
  return tester.pumpWidget(
    ChangeNotifierProvider<BoutiqueCartProvider>.value(
      value: cart,
      child: MaterialApp(home: BoutiqueProductDetailScreen(product: product)),
    ),
  );
}

Future<void> _pumpHost(
  WidgetTester tester, {
  required BoutiqueCartProvider cart,
  required BoutiqueProduct product,
  BoutiqueCartItem? editingItem,
  GlobalKey<_ProductHostState>? hostKey,
}) {
  return tester.pumpWidget(
    ChangeNotifierProvider<BoutiqueCartProvider>.value(
      value: cart,
      child: MaterialApp(
        home: _ProductHost(
          key: hostKey,
          product: product,
          editingItem: editingItem,
        ),
      ),
    ),
  );
}

class _ProductHost extends StatefulWidget {
  final BoutiqueProduct product;
  final BoutiqueCartItem? editingItem;

  const _ProductHost({super.key, required this.product, this.editingItem});

  @override
  State<_ProductHost> createState() => _ProductHostState();
}

class _ProductHostState extends State<_ProductHost> {
  int paymentTaps = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          FilledButton(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => BoutiqueProductDetailScreen(
                    product: widget.product,
                    editingItem: widget.editingItem,
                  ),
                ),
              );
            },
            child: const Text('Ouvrir le produit'),
          ),
          FilledButton(
            onPressed: () => setState(() => paymentTaps += 1),
            child: const Text('Paiement'),
          ),
        ],
      ),
    );
  }
}

BoutiqueProduct _product({bool personalization = true}) {
  return BoutiqueProduct(
    id: 'polo',
    name: 'Polo Calypso',
    description: 'Polo du club',
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
    personalization: personalization
        ? const BoutiquePersonalizationConfig(
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
          )
        : null,
  );
}
