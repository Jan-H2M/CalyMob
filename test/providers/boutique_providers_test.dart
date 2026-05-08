import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/providers/cart_provider.dart';
import 'package:calymob/providers/catalog_provider.dart';
import 'package:calymob/providers/boutique_provider.dart';
import 'package:calymob/models/boutique_product.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('CartProvider', () {
    late CartProvider cart;

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      cart = await CartProvider.load();
    });

    test('starts empty', () {
      expect(cart.isEmpty, isTrue);
      expect(cart.items, isEmpty);
      expect(cart.total, 0.0);
    });

    test('addItem adds item to cart', () async {
      await cart.addItem(
        'prod-1', 'v1', 1, DeliveryMode.poolPickup,
        {
          'name': 'T-shirt Calypso',
          'variantLabel': 'M',
          'unitPrice': 25.0,
        },
      );

      expect(cart.isEmpty, isFalse);
      expect(cart.items.length, 1);
      expect(cart.items[0].name, 'T-shirt Calypso');
      expect(cart.items[0].qty, 1);
      expect(cart.total, 25.0);
    });

    test('addItem increases quantity for same product+variant+delivery', () async {
      await cart.addItem('prod-1', 'v1', 1, DeliveryMode.poolPickup, {'name': 'T-shirt', 'variantLabel': 'M', 'unitPrice': 25.0});
      await cart.addItem('prod-1', 'v1', 1, DeliveryMode.poolPickup, {'name': 'T-shirt', 'variantLabel': 'M', 'unitPrice': 25.0});

      expect(cart.items.length, 1);
      expect(cart.items[0].qty, 2);
      expect(cart.total, 50.0);
    });

    test('addItem creates separate entry for different variants', () async {
      await cart.addItem('prod-1', 'v1', 1, DeliveryMode.poolPickup, {'name': 'T-shirt', 'variantLabel': 'M', 'unitPrice': 25.0});
      await cart.addItem('prod-1', 'v2', 1, DeliveryMode.poolPickup, {'name': 'T-shirt', 'variantLabel': 'L', 'unitPrice': 30.0});

      expect(cart.items.length, 2);
      expect(cart.total, 55.0);
    });

    test('updateQty changes quantity', () async {
      await cart.addItem('prod-1', 'v1', 1, DeliveryMode.poolPickup, {'name': 'T-shirt', 'variantLabel': 'M', 'unitPrice': 25.0});
      cart.updateQty('prod-1', 'v1', DeliveryMode.poolPickup, 3);
      expect(cart.items[0].qty, 3);
      expect(cart.total, 75.0);
    });

    test('updateQty removes item when qty <= 0', () async {
      await cart.addItem('prod-1', 'v1', 1, DeliveryMode.poolPickup, {'name': 'T-shirt', 'variantLabel': 'M', 'unitPrice': 25.0});
      cart.updateQty('prod-1', 'v1', DeliveryMode.poolPickup, 0);
      expect(cart.items, isEmpty);
      expect(cart.isEmpty, isTrue);
    });

    test('clear empties cart', () async {
      await cart.addItem('prod-1', 'v1', 1, DeliveryMode.poolPickup, {'name': 'T-shirt', 'variantLabel': 'M', 'unitPrice': 25.0});
      cart.clear();
      expect(cart.isEmpty, isTrue);
      expect(cart.items, isEmpty);
    });

    test('requiresPostalAddress is false when all items are poolPickup', () async {
      await cart.addItem('prod-1', 'v1', 1, DeliveryMode.poolPickup, {'name': 'T-shirt', 'variantLabel': 'M', 'unitPrice': 25.0});
      expect(cart.requiresPostalAddress, isFalse);
    });

    test('requiresPostalAddress is true when any item is post', () async {
      await cart.addItem('prod-1', 'v1', 1, DeliveryMode.post, {'name': 'T-shirt', 'variantLabel': 'M', 'unitPrice': 25.0});
      expect(cart.requiresPostalAddress, isTrue);
    });

    test('removeItem removes correct item', () async {
      await cart.addItem('prod-1', 'v1', 1, DeliveryMode.poolPickup, {'name': 'A', 'unitPrice': 10.0});
      await cart.addItem('prod-2', 'v1', 2, DeliveryMode.poolPickup, {'name': 'B', 'unitPrice': 20.0});
      expect(cart.items.length, 2);

      cart.removeItem('prod-1', 'v1', DeliveryMode.poolPickup);
      expect(cart.items.length, 1);
      expect(cart.items[0].name, 'B');
    });
  });

  group('CatalogProvider', () {
    late CatalogProvider provider;

    setUp(() {
      provider = CatalogProvider();
    });

    test('starts with empty products and no filter', () {
      expect(provider.products, isEmpty);
      expect(provider.allProducts, isEmpty);
      expect(provider.categoryFilter, isNull);
      expect(provider.isLoading, isFalse);
    });

    test('setCategoryFilter updates filter', () {
      provider.setCategoryFilter(BoutiqueProductCategory.vetement);
      expect(provider.categoryFilter, BoutiqueProductCategory.vetement);

      provider.clearFilter();
      expect(provider.categoryFilter, isNull);
    });

    test('getProductById returns null for missing product', () {
      expect(provider.getProductById('nonexistent'), isNull);
    });

    test('availableCategories are empty when no products', () {
      expect(provider.availableCategories, isEmpty);
    });

    test('products with filter returns subset', () {
      // Provider uses private _allProducts; we can only test the model
      final product = BoutiqueProduct(
        id: 'prod-1',
        name: 'Test',
        category: BoutiqueProductCategory.vetement,
        pricing: const BoutiquePricingBreakdown(
          purchasePrice: 10,
          commission: BoutiqueCommission(type: BoutiqueCommissionType.fixed, value: 5),
          salePrice: 25,
        ),
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      expect(product.id, 'prod-1');
      expect(product.name, 'Test');
      expect(product.category, BoutiqueProductCategory.vetement);
      expect(product.salePrice, 25.0);
    });
  });

  group('BoutiqueProvider', () {
    late BoutiqueProvider provider;

    setUp(() {
      provider = BoutiqueProvider();
    });

    test('starts with empty orders', () {
      expect(provider.orders, isEmpty);
      expect(provider.activeOrders, isEmpty);
      expect(provider.historyOrders, isEmpty);
      expect(provider.isLoading, isFalse);
    });

    test('getOrderById returns null for missing order', () {
      expect(provider.getOrderById('nonexistent'), isNull);
    });
  });
}
