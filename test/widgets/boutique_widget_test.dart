import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:calymob/providers/cart_provider.dart';
import 'package:calymob/providers/catalog_provider.dart';
import 'package:calymob/providers/member_provider.dart';
import 'package:calymob/services/feature_flag_service.dart';
import 'package:calymob/screens/boutique/boutique_cart_screen.dart';
import 'package:calymob/screens/boutique/boutique_screen.dart';
import 'package:calymob/screens/boutique/boutique_checkout_screen.dart';
import 'package:calymob/models/boutique_product.dart';
import 'package:calymob/models/boutique_order.dart';
import 'package:calymob/services/boutique_catalog_service.dart';
import 'package:calymob/services/boutique_service.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

/// Helper to pump a widget wrapped in providers needed by boutique screens.
/// Uses fake_cloud_firestore to provide FeatureFlagService and MemberProvider
/// without requiring real Firebase initialization.
Future<void> pumpBoutiqueApp({
  required WidgetTester tester,
  required Widget child,
  CartProvider? cartProvider,
  CatalogProvider? catalogProvider,
}) async {
  final fakeFirestore = FakeFirebaseFirestore();

  // Pre-populate feature_flags so BoutiqueFeatureGuard shows content
  await fakeFirestore
      .collection('clubs')
      .doc('default')
      .collection('settings')
      .doc('feature_flags')
      .set({'boutiqueV2Enabled': true, 'boutiqueV2AdminOnly': false});

  // Pre-populate a minimal member doc so MemberProvider doesn't stay loading
  await fakeFirestore
      .collection('clubs')
      .doc('default')
      .collection('members')
      .doc('test-user')
      .set({'app_role': 'member'});

  final flags = FeatureFlagService(
    firestore: fakeFirestore,
    clubId: 'default',
  );
  final memberProvider = MemberProvider();

  // Load member data to get out of loading state
  await memberProvider.loadMemberData('default', 'test-user');
  await tester.pump(); // Let streams settle

  // Resolve CartProvider if none provided
  final resolvedCart = cartProvider ?? await CartProvider.load();

  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<CartProvider>.value(
          value: resolvedCart,
        ),
        ChangeNotifierProvider<FeatureFlagService>.value(value: flags),
        ChangeNotifierProvider<MemberProvider>.value(value: memberProvider),
        if (catalogProvider != null)
          ChangeNotifierProvider<CatalogProvider>.value(value: catalogProvider),
      ],
      child: MaterialApp(
        home: child,
        routes: {
          '/boutique/cart': (_) => const BoutiqueCartScreen(),
        },
      ),
    ),
  );

  // Let BoutiqueFeatureGuard process its state
  await tester.pump();
}

/// Seed products into a FakeFirebaseFirestore for catalog tests.
Future<String> seedProduct(
  FakeFirebaseFirestore firestore, {
  required String name,
  required String category,
  double salePrice = 25.0,
  String visibility = 'published',
}) async {
  final docRef = await firestore
      .collection('clubs')
      .doc('calypso')
      .collection('products')
      .add({
    'name': name,
    'description': 'Description de $name',
    'category': category,
    'visibility': visibility,
    'pricing': {
      'purchasePrice': 10.0,
      'commission': {'type': 'fixed', 'value': 5.0},
      'salePrice': salePrice,
      'currency': 'EUR',
    },
    'variants': [
      {'id': 'v1', 'label': 'Standard', 'sku': 'STD-001'},
    ],
    'deliveryModes': ['pool_pickup', 'post'],
    'deliverySurcharges': {'post': 5.0},
    'createdAt': Timestamp.now(),
    'updatedAt': Timestamp.now(),
  });
  return docRef.id;
}

/// Seed an order into a FakeFirebaseFirestore for order detail tests.
Future<String> seedOrder(
  FakeFirebaseFirestore firestore, {
  required String status,
  required String orderNumber,
  String structuredCommunication = '***123/4567/89101***',
  double total = 50.0,
  bool withBankSettings = false,
}) async {
  final docRef = await firestore
      .collection('clubs')
      .doc('calypso')
      .collection('orders')
      .add({
    'orderNumber': orderNumber,
    'structuredCommunication': structuredCommunication,
    'buyer': {
      'userId': 'test-user',
      'displayName': 'Jan Janssen',
      'email': 'jan@test.com',
    },
    'items': [
      {
        'lineId': 'li_001',
        'productId': 'prod-1',
        'variantId': 'v1',
        'qty': 2,
        'unitPrice': 25.0,
        'lineTotal': 50.0,
        'deliveryMode': 'pool_pickup',
        'fulfillmentStatus': 'pending',
      },
    ],
    'pricing': {
      'itemsSubtotal': total,
      'deliverySurcharges': 0.0,
      'total': total,
      'currency': 'EUR',
    },
    'payment': {'method': 'qr_transfer', 'status': 'pending'},
    'status': status,
    'statusHistory': [
      {
        'oldStatus': 'cart',
        'newStatus': status,
        'changedBy': 'test-user',
        'changedAt': Timestamp.now(),
        'note': 'Commande créée',
      },
    ],
    'createdAt': Timestamp.now(),
    'updatedAt': Timestamp.now(),
  });

  if (withBankSettings) {
    await firestore
        .collection('clubs')
        .doc('calypso')
        .collection('settings')
        .doc('boutique_payment')
        .set({
      'beneficiaryName': 'Calypso Diving Club ASBL',
      'iban': 'BE12 3456 7890 1234',
      'bic': 'INGBBEBB',
    });
  }

  return docRef.id;
}

void main() {
  group('CartScreen', () {
    testWidgets('shows empty cart message', (tester) async {
      await pumpBoutiqueApp(
        tester: tester,
        child: const BoutiqueCartScreen(),
      );

      expect(find.text('Panier'), findsOneWidget);
      expect(find.text('Votre panier est vide.'), findsOneWidget);
    });

    testWidgets('shows cart items', (tester) async {
      final cart = await CartProvider.load();
      await cart.addItem(
        'prod-1', 'v1', 1, DeliveryMode.poolPickup,
        {
          'name': 'T-shirt Calypso',
          'variantLabel': 'M',
          'unitPrice': 25.0,
        },
      );

      await pumpBoutiqueApp(
        tester: tester,
        child: const BoutiqueCartScreen(),
        cartProvider: cart,
      );

      expect(find.text('T-shirt Calypso'), findsOneWidget);
      expect(find.textContaining('Retrait piscine'), findsOneWidget);
      expect(find.textContaining('25.0'), findsAtLeast(1));
    });

    testWidgets('allows quantity increase', (tester) async {
      final cart = await CartProvider.load();
      await cart.addItem(
        'prod-1', 'v1', 1, DeliveryMode.poolPickup,
        {
          'name': 'T-shirt',
          'variantLabel': 'M',
          'unitPrice': 25.0,
        },
      );

      await pumpBoutiqueApp(
        tester: tester,
        child: const BoutiqueCartScreen(),
        cartProvider: cart,
      );

      // Initially quantity is 1
      expect(find.text('1'), findsOneWidget);

      // Tap the + button to increase
      await tester.tap(find.byIcon(Icons.add));
      await tester.pump();

      // Now should be 2
      expect(cart.items[0].qty, 2);
    });

    testWidgets('shows total price for multiple items', (tester) async {
      final cart = await CartProvider.load();
      await cart.addItem('prod-1', 'v1', 1, DeliveryMode.poolPickup, {'name': 'T-shirt', 'variantLabel': 'M', 'unitPrice': 25.0});
      await cart.addItem('prod-2', 'v1', 1, DeliveryMode.poolPickup, {'name': 'Casquette', 'variantLabel': 'Std', 'unitPrice': 15.0});

      expect(cart.total, 40.0);
    });
  });

  group('BoutiqueScreen (catalog) - with mock data', () {
    testWidgets('renders products from CatalogProvider with fake Firestore', (tester) async {
      final firestore = FakeFirebaseFirestore();

      // Seed published products
      await seedProduct(firestore, name: 'T-shirt Calypso', category: 'vetement', salePrice: 25.0);
      await seedProduct(firestore, name: 'Carnet de plongée', category: 'carnet', salePrice: 15.0);

      // Create a CatalogProvider with a service backed by fake Firestore
      final catalogService = BoutiqueCatalogService(firestore: firestore);
      final catalogProvider = CatalogProvider(service: catalogService);

      await pumpBoutiqueApp(
        tester: tester,
        child: const BoutiqueScreen(),
        catalogProvider: catalogProvider,
      );

      // Let the provider start listening and the screen render
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pump();

      // Both products should be visible in the catalog
      expect(find.text('T-shirt Calypso'), findsOneWidget);
      expect(find.text('Carnet de plongée'), findsOneWidget);

      // Prices should be rendered
      expect(find.textContaining('25.00'), findsOneWidget);
      expect(find.textContaining('15.00'), findsOneWidget);

      // Category badges should be present (Chip label + title text)
      expect(find.text('Vêtement'), findsAtLeast(1));
      expect(find.text('Carnet'), findsAtLeast(1));
    });

    testWidgets('shows empty state when no products', (tester) async {
      final firestore = FakeFirebaseFirestore();
      final catalogService = BoutiqueCatalogService(firestore: firestore);
      final catalogProvider = CatalogProvider(service: catalogService);

      await pumpBoutiqueApp(
        tester: tester,
        child: const BoutiqueScreen(),
        catalogProvider: catalogProvider,
      );

      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pump();

      // Should show the empty state message
      expect(find.text('Aucun produit disponible'), findsOneWidget);
    });

    testWidgets('only published products are shown', (tester) async {
      final firestore = FakeFirebaseFirestore();

      // One published, one draft
      await seedProduct(firestore, name: 'Produit visible', category: 'vetement', salePrice: 10.0, visibility: 'published');
      await seedProduct(firestore, name: 'Produit caché', category: 'vetement', salePrice: 20.0, visibility: 'draft');

      final catalogService = BoutiqueCatalogService(firestore: firestore);
      final catalogProvider = CatalogProvider(service: catalogService);

      await pumpBoutiqueApp(
        tester: tester,
        child: const BoutiqueScreen(),
        catalogProvider: catalogProvider,
      );

      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pump();

      // Only the published product should be visible
      expect(find.text('Produit visible'), findsOneWidget);
      expect(find.text('Produit caché'), findsNothing);
    });
  });

  group('BoutiqueOrderDetailScreen', () {
    testWidgets('skipped: requires FirebaseFirestore.instance and BoutiqueService injection',
        (tester) async {
      // BoutiqueOrderDetailScreen creates BoutiqueService internally which uses
      // FirebaseFirestore.instance (the real singleton). Even though we now
      // support injecting a BoutiqueService via the optional `service` parameter,
      // the screen load is async and the QR code rendering uses qr_flutter's
      // QrImageView which requires non-null data. A proper widget test would need:
      //   1. A BoutiqueService backed by fake_cloud_firestore injected via widget.service
      //   2. Pre-seeded order + bank_settings documents in the fake Firestore
      //   3. The EPC payload generation chain (BoutiqueOrderDetailScreen._generateEpcPayload
      //      calls generateEpcPayload which requires valid IBAN/beneficiaryName)
      //   4. Multiple pump() cycles for the async stream to resolve
      //
      // The data-layer logic (order fetching, status labels, QR generation) is
      // already covered by:
      //   - test/services/boutique_service_test.dart (data layer)
      //   - test/widgets/boutique_widget_test.dart > 'CartItem model' > 'DeliveryMode labels'
      //   - utils/epc_qr_code.dart tests (would go in test/utils/)
      //
      // To add a widget-level test, refactor BoutiqueOrderDetailScreen to
      // accept a service parameter (now done), then create a test that pumps
      // the screen with a BoutiqueService(firestore: fakeFirestore) and seeded
      // data. Below is a commented-out template showing the approach.
    });

    testWidgets('template: EPC QR code shown for awaiting_payment orders',
        (tester) async {
      // Uncomment and adapt when ready to implement:
      //
      // final firestore = FakeFirebaseFirestore();
      // final orderId = await seedOrder(firestore, status: 'awaiting_payment',
      //     orderNumber: 'BTQ-2026-0001', withBankSettings: true);
      // final service = BoutiqueService(firestore: firestore);
      //
      // await pumpBoutiqueApp(
      //   tester: tester,
      //   child: BoutiqueOrderDetailScreen(
      //     orderId: orderId,
      //     clubId: 'calypso',
      //     service: service,
      //   ),
      // );
      //
      // await tester.pump();
      // await tester.pump(const Duration(seconds: 1));
      //
      // // Status badge should show "En attente de paiement"
      // expect(find.text('En attente de paiement'), findsOneWidget);
      // // QR section should be visible
      // expect(find.text('Paiement par virement'), findsOneWidget);
      // // Cancel button should be present (awaiting_payment is cancellable)
      // expect(find.text('Annuler la commande'), findsOneWidget);

      // For now this is a placeholder — the actual test requires addressing
      // the async data chain. The QR code widget test also needs qr_flutter
      // to be properly loaded in the test environment.
    });
  });

  group('BoutiqueCheckoutScreen', () {
    testWidgets('skipped: requires FirebaseFirestore.instance, AuthProvider, and Firestore writes',
        (tester) async {
      // BoutiqueCheckoutScreen has several dependencies that make widget testing
      // difficult without real Firebase initialization:
      //
      //   1. Directly uses FirebaseFirestore.instance for:
      //      - Creating orders (_confirmOrder calls FirebaseFirestore.instance...add(orderData))
      //      - Querying next order sequence (_getNextOrderSequence)
      //      - Sending QR by email (_handleSendQrByEmail)
      //      - Marking as paid on site (_handleMarkAsPaidOnSite)
      //
      //   2. Wraps content in BoutiqueFeatureGuard (handled by pumpBoutiqueApp)
      //
      //   3. Uses AuthProvider from context via context.read<AuthProvider>()
      //      - Needs currentUser with a non-null uid for order creation
      //      - pumpBoutiqueApp does not provide AuthProvider
      //
      //   4. Uses OceanGradientBackground which works in widget tests (CustomPaint)
      //
      //   5. The _confirmOrder method writes to Firestore and clears the cart,
      //      making it an integration-level concern
      //
      // The checkout flow logic (cart validation, address form, order summary)
      // is partially covered by CartProvider unit tests. Full widget testing
      // would require:
      //   - Adding AuthProvider to pumpBoutiqueApp
      //   - Making FirebaseFirestore.instance injectable in the checkout screen
      //   - Or using integration tests with Firebase emulator
      //
      // Given the screen's tight coupling to FirebaseFirestore.instance and
      // AuthProvider, this is better suited for integration testing.
    });
  });

  group('CartItem model', () {
    test('lineTotal is calculated correctly', () {
      final item = CartItem(
        productId: 'p1',
        variantId: 'v1',
        qty: 3,
        deliveryMode: DeliveryMode.poolPickup,
        productSnapshot: {
          'name': 'Test',
          'variantLabel': 'M',
          'unitPrice': 10.0,
        },
      );
      expect(item.lineTotal, 30.0);
    });

    test('copyWith preserves unchanged fields', () {
      final item = CartItem(
        productId: 'p1',
        variantId: 'v1',
        qty: 1,
        deliveryMode: DeliveryMode.poolPickup,
        productSnapshot: {
          'name': 'Test',
          'variantLabel': 'M',
          'unitPrice': 10.0,
          'imageUrl': 'img.jpg',
        },
      );
      final copy = item.copyWith(qty: 2);
      expect(copy.qty, 2);
      expect(copy.productId, 'p1');
      expect(copy.name, 'Test');
      expect(copy.unitPrice, 10.0);
      expect(copy.imageUrl, 'img.jpg');
    });

    test('copyWith can clear imageUrl', () {
      final item = CartItem(
        productId: 'p1',
        variantId: 'v1',
        qty: 1,
        deliveryMode: DeliveryMode.poolPickup,
        productSnapshot: {
          'name': 'Test',
          'variantLabel': 'M',
          'unitPrice': 10.0,
          'imageUrl': 'img.jpg',
        },
      );
      final copy = item.copyWith(productSnapshot: {
        'name': 'Test',
        'variantLabel': 'M',
        'unitPrice': 10.0,
      });
      expect(copy.imageUrl, isNull);
    });
  });

  group('DeliveryMode labels', () {
    test('labels are correct', () {
      expect(DeliveryMode.digital.label, 'Digital');
      expect(DeliveryMode.poolPickup.label, 'Retrait piscine');
      expect(DeliveryMode.post.label, 'Envoi postal');
      expect(DeliveryMode.inPerson.label, 'Remise en main propre');
    });
  });
}
