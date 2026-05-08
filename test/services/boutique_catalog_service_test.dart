import 'package:flutter_test/flutter_test.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:calymob/models/boutique_product.dart';

void main() {
  const clubId = 'club-test-1';
  const productsPath = 'clubs/$clubId/products';

  group('BoutiqueCatalogService - Data Layer', () {
    late FakeFirebaseFirestore firestore;

    setUp(() {
      firestore = FakeFirebaseFirestore();
    });

    Map<String, dynamic> sampleProduct({String visibility = 'published', String category = 'vetement'}) {
      return {
        'name': 'T-shirt Calypso',
        'description': 'T-shirt en coton bio',
        'category': category,
        'visibility': visibility,
        'supplierId': 'supplier-1',
        'images': ['tshirt.jpg'],
        'inventoryMode': 'preorder',
        'pricing': {
          'purchasePrice': 10.0,
          'commission': {'type': 'fixed', 'value': 5.0},
          'extraCosts': 0.0,
          'salePrice': 25.0,
          'currency': 'EUR',
        },
        'variants': [
          {'id': 'v1', 'label': 'S', 'sku': 'TS-S', 'stockCount': 10, 'stockMin': 2},
          {'id': 'v2', 'label': 'M', 'sku': 'TS-M', 'stockCount': 15, 'stockMin': 2},
        ],
        'deliveryModes': ['pool_pickup', 'post'],
        'deliverySurcharges': {'post': 5.0},
        'createdAt': Timestamp.now(),
        'updatedAt': Timestamp.now(),
      };
    }

    group('Product visibility filter', () {
      test('only published products are visible to members', () async {
        // Add published product
        await firestore.collection(productsPath).add(
          sampleProduct(visibility: 'published'),
        );
        // Add draft product (should NOT appear)
        await firestore.collection(productsPath).add(
          sampleProduct(visibility: 'draft', category: 'carnet'),
        );
        // Add archived product (should NOT appear)
        await firestore.collection(productsPath).add(
          sampleProduct(visibility: 'archived', category: 'formation'),
        );

        final publishedQuery = firestore
            .collection(productsPath)
            .where('visibility', isEqualTo: 'published');

        final snapshot = await publishedQuery.get();
        expect(snapshot.docs.length, 1);
        expect(snapshot.docs.first.data()['name'], 'T-shirt Calypso');
      });

      test('no products returned when none are published', () async {
        await firestore.collection(productsPath).add(
          sampleProduct(visibility: 'draft'),
        );
        await firestore.collection(productsPath).add(
          sampleProduct(visibility: 'archived'),
        );

        final publishedQuery = firestore
            .collection(productsPath)
            .where('visibility', isEqualTo: 'published');

        final snapshot = await publishedQuery.get();
        expect(snapshot.docs.length, 0);
      });
    });

    group('Product model parsing', () {
      test('fromFirestore parses all fields correctly', () async {
        final docRef = await firestore.collection(productsPath).add(
          sampleProduct(),
        );
        final doc = await docRef.get();
        final product = BoutiqueProduct.fromFirestore(
          doc.id,
          doc.data() as Map<String, dynamic>,
        );

        expect(product.name, 'T-shirt Calypso');
        expect(product.description, 'T-shirt en coton bio');
        expect(product.category, BoutiqueProductCategory.vetement);
        expect(product.visibility, BoutiqueProductVisibility.published);
        expect(product.inventoryMode, BoutiqueInventoryMode.preorder);
        expect(product.pricing.salePrice, 25.0);
        expect(product.pricing.purchasePrice, 10.0);
        expect(product.variants.length, 2);
        expect(product.variants[0].label, 'S');
        expect(product.variants[1].label, 'M');
        expect(product.deliveryModes.length, 2);
        expect(product.deliveryModes, contains(BoutiqueDeliveryMode.poolPickup));
        expect(product.deliverySurcharges, containsPair('post', 5.0));
        expect(product.images, contains('tshirt.jpg'));
      });

      test('fromFirestore handles missing optional fields', () async {
        final docRef = await firestore.collection(productsPath).add({
          'name': 'Minimal Product',
          'category': 'autre',
          'visibility': 'published',
          'pricing': {
            'purchasePrice': 5.0,
            'commission': {'type': 'fixed', 'value': 2.0},
            'salePrice': 15.0,
          },
          'createdAt': Timestamp.now(),
          'updatedAt': Timestamp.now(),
        });
        final doc = await docRef.get();
        final product = BoutiqueProduct.fromFirestore(
          doc.id,
          doc.data() as Map<String, dynamic>,
        );

        expect(product.name, 'Minimal Product');
        expect(product.description, '');
        expect(product.category, BoutiqueProductCategory.autre);
        expect(product.images, isEmpty);
        expect(product.variants, isEmpty);
        expect(product.deliveryModes, [BoutiqueDeliveryMode.poolPickup]);
        expect(product.deliverySurcharges, isEmpty);
        expect(product.supplierId, '');
      });
    });

    group('Category filtering', () {
      test('only products of the selected category are returned', () async {
        await firestore.collection(productsPath).add(
          sampleProduct(category: 'vetement', visibility: 'published'),
        );
        await firestore.collection(productsPath).add(
          sampleProduct(category: 'carnet', visibility: 'published'),
        );

        final categoryQuery = firestore
            .collection(productsPath)
            .where('visibility', isEqualTo: 'published')
            .where('category', isEqualTo: 'carnet');

        final snapshot = await categoryQuery.get();
        expect(snapshot.docs.length, 1);
        expect(snapshot.docs.first.data()['category'], 'carnet');
      });

      test('all categories are populates correctly', () async {
        for (final cat in ['carnet', 'formation', 'vetement', 'abonnement', 'autre']) {
          await firestore.collection(productsPath).add(
            sampleProduct(category: cat, visibility: 'published'),
          );
        }

        final snapshot = await firestore.collection(productsPath).get();
        expect(snapshot.docs.length, 5);

        final categories = snapshot.docs.map((d) => d.data()['category'] as String).toSet();
        expect(categories, containsAll(['carnet', 'formation', 'vetement', 'abonnement', 'autre']));
      });
    });

    group('Product pricing', () {
      test('effectiveSalePrice uses override when present', () async {
        final docRef = await firestore.collection(productsPath).add({
          'name': 'Sale Product',
          'category': 'vetement',
          'visibility': 'published',
          'pricing': {
            'purchasePrice': 10.0,
            'commission': {'type': 'fixed', 'value': 5.0},
            'salePrice': 30.0,
            'salePriceOverride': 25.0,
            'currency': 'EUR',
          },
          'createdAt': Timestamp.now(),
          'updatedAt': Timestamp.now(),
        });
        final doc = await docRef.get();
        final product = BoutiqueProduct.fromFirestore(
          doc.id,
          doc.data() as Map<String, dynamic>,
        );

        expect(product.salePrice, 25.0);
        expect(product.pricing.salePriceOverride, 25.0);
        expect(product.pricing.effectiveSalePrice, 25.0);
      });

      test('effectiveSalePrice uses salePrice when no override', () async {
        final docRef = await firestore.collection(productsPath).add({
          'name': 'Regular Product',
          'category': 'formation',
          'visibility': 'published',
          'pricing': {
            'purchasePrice': 20.0,
            'commission': {'type': 'percentage', 'value': 10.0},
            'salePrice': 50.0,
            'currency': 'EUR',
          },
          'createdAt': Timestamp.now(),
          'updatedAt': Timestamp.now(),
        });
        final doc = await docRef.get();
        final product = BoutiqueProduct.fromFirestore(
          doc.id,
          doc.data() as Map<String, dynamic>,
        );

        expect(product.salePrice, 50.0);
        expect(product.pricing.salePriceOverride, isNull);
        expect(product.pricing.effectiveSalePrice, 50.0);
      });

      test('salePriceOverride per variant is parsed correctly', () async {
        final docRef = await firestore.collection(productsPath).add({
          'name': 'Multi-variant',
          'category': 'vetement',
          'visibility': 'published',
          'pricing': {
            'purchasePrice': 10.0,
            'commission': {'type': 'fixed', 'value': 5.0},
            'salePrice': 25.0,
            'currency': 'EUR',
          },
          'variants': [
            {'id': 'v1', 'label': 'S', 'salePriceOverride': 20.0},
            {'id': 'v2', 'label': 'M'},
            {'id': 'v3', 'label': 'L', 'salePriceOverride': 30.0},
          ],
          'createdAt': Timestamp.now(),
          'updatedAt': Timestamp.now(),
        });
        final doc = await docRef.get();
        final product = BoutiqueProduct.fromFirestore(
          doc.id,
          doc.data() as Map<String, dynamic>,
        );

        expect(product.variants[0].salePriceOverride, 20.0);
        expect(product.variants[1].salePriceOverride, isNull);
        expect(product.variants[2].salePriceOverride, 30.0);
      });
    });

    group('Product sorting', () {
      test('products are ordered by name', () async {
        await firestore.collection(productsPath).add(
          sampleProduct(visibility: 'published')..['name'] = 'Z-Tshirt',
        );
        await firestore.collection(productsPath).add(
          sampleProduct(visibility: 'published')..['name'] = 'A-Tshirt',
        );

        final query = firestore
            .collection(productsPath)
            .where('visibility', isEqualTo: 'published')
            .orderBy('name');

        final snapshot = await query.get();
        expect(snapshot.docs[0].data()['name'], 'A-Tshirt');
        expect(snapshot.docs[1].data()['name'], 'Z-Tshirt');
      });
    });
  });
}
