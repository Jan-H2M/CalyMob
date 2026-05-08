import 'package:flutter_test/flutter_test.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:calymob/models/boutique_product.dart' as bp;
import 'package:calymob/models/boutique_order.dart' as bo;

void main() {
  group('BoutiqueProduct enum fromString', () {
    test('BoutiqueProductCategory fromString', () {
      expect(bp.BoutiqueProductCategory.fromString('carnet'), bp.BoutiqueProductCategory.carnet);
      expect(bp.BoutiqueProductCategory.fromString('formation'), bp.BoutiqueProductCategory.formation);
      expect(bp.BoutiqueProductCategory.fromString('vetement'), bp.BoutiqueProductCategory.vetement);
      expect(bp.BoutiqueProductCategory.fromString('abonnement'), bp.BoutiqueProductCategory.abonnement);
      expect(bp.BoutiqueProductCategory.fromString('unknown'), bp.BoutiqueProductCategory.autre);
    });

    test('BoutiqueProductVisibility fromString', () {
      expect(bp.BoutiqueProductVisibility.fromString('draft'), bp.BoutiqueProductVisibility.draft);
      expect(bp.BoutiqueProductVisibility.fromString('published'), bp.BoutiqueProductVisibility.published);
      expect(bp.BoutiqueProductVisibility.fromString('archived'), bp.BoutiqueProductVisibility.archived);
      expect(bp.BoutiqueProductVisibility.fromString('unknown'), bp.BoutiqueProductVisibility.draft);
    });

    test('BoutiqueInventoryMode fromString', () {
      expect(bp.BoutiqueInventoryMode.fromString('tracked'), bp.BoutiqueInventoryMode.tracked);
      expect(bp.BoutiqueInventoryMode.fromString('preorder'), bp.BoutiqueInventoryMode.preorder);
      expect(bp.BoutiqueInventoryMode.fromString('unknown'), bp.BoutiqueInventoryMode.preorder);
    });

    test('BoutiqueDeliveryMode fromString', () {
      expect(bp.BoutiqueDeliveryMode.fromString('digital'), bp.BoutiqueDeliveryMode.digital);
      expect(bp.BoutiqueDeliveryMode.fromString('pool_pickup'), bp.BoutiqueDeliveryMode.poolPickup);
      expect(bp.BoutiqueDeliveryMode.fromString('post'), bp.BoutiqueDeliveryMode.post);
      expect(bp.BoutiqueDeliveryMode.fromString('in_person'), bp.BoutiqueDeliveryMode.inPerson);
      expect(bp.BoutiqueDeliveryMode.fromString('unknown'), bp.BoutiqueDeliveryMode.poolPickup);
    });

    test('BoutiqueCommissionType fromString', () {
      expect(bp.BoutiqueCommissionType.fromString('fixed'), bp.BoutiqueCommissionType.fixed);
      expect(bp.BoutiqueCommissionType.fromString('percentage'), bp.BoutiqueCommissionType.percentage);
      expect(bp.BoutiqueCommissionType.fromString('unknown'), bp.BoutiqueCommissionType.percentage);
    });
  });

  group('BoutiqueProduct fromFirestore', () {
    test('parses full product correctly', () {
      final data = <String, dynamic>{
        'name': 'Full Test Product',
        'description': 'A comprehensive test product',
        'category': 'vetement',
        'visibility': 'published',
        'supplierId': 'sup-1',
        'inventoryMode': 'tracked',
        'images': ['img1.jpg', 'img2.jpg'],
        'pricing': {
          'purchasePrice': 15.0,
          'commission': {'type': 'fixed', 'value': 5.0},
          'extraCosts': 2.5,
          'salePrice': 35.0,
          'salePriceOverride': 30.0,
          'currency': 'EUR',
        },
        'variants': [
          {'id': 'v1', 'label': 'S', 'sku': 'SKU-S', 'stockCount': 5, 'stockMin': 1},
          {'id': 'v2', 'label': 'M', 'sku': 'SKU-M', 'stockCount': 8, 'stockMin': 2},
        ],
        'deliveryModes': ['pool_pickup', 'post', 'digital'],
        'deliverySurcharges': {'post': 5.0, 'digital': 0.0},
        'accountingCode': '700010',
        'publishedAt': Timestamp.fromDate(DateTime(2026, 1, 15)),
        'createdAt': Timestamp.fromDate(DateTime(2026, 1, 1)),
        'updatedAt': Timestamp.fromDate(DateTime(2026, 1, 15)),
      };

      final product = bp.BoutiqueProduct.fromFirestore('test-id', data);

      expect(product.id, 'test-id');
      expect(product.name, 'Full Test Product');
      expect(product.description, 'A comprehensive test product');
      expect(product.category, bp.BoutiqueProductCategory.vetement);
      expect(product.visibility, bp.BoutiqueProductVisibility.published);
      expect(product.isPublished, isTrue);
      expect(product.supplierId, 'sup-1');
      expect(product.inventoryMode, bp.BoutiqueInventoryMode.tracked);
      expect(product.images.length, 2);
      expect(product.pricing.purchasePrice, 15.0);
      expect(product.pricing.salePrice, 35.0);
      expect(product.pricing.salePriceOverride, 30.0);
      expect(product.pricing.effectiveSalePrice, 30.0);
      expect(product.pricing.extraCosts, 2.5);
      expect(product.pricing.currency, 'EUR');
      expect(product.pricing.commission.type, bp.BoutiqueCommissionType.fixed);
      expect(product.pricing.commission.value, 5.0);
      expect(product.salePrice, 30.0);
      expect(product.variants.length, 2);
      expect(product.variants[0].sku, 'SKU-S');
      expect(product.variants[1].stockCount, 8);
      expect(product.deliveryModes.length, 3);
      expect(product.deliverySurcharges, {'post': 5.0, 'digital': 0.0});
      expect(product.accountingCode, '700010');
      expect(product.categoryLabel, 'Vêtement');
    });

    test('parses draft product correctly', () {
      final data = <String, dynamic>{
        'name': 'Draft Item',
        'category': 'carnet',
        'visibility': 'draft',
        'pricing': {
          'purchasePrice': 0,
          'commission': {'type': 'fixed', 'value': 0},
          'salePrice': 10.0,
        },
        'createdAt': Timestamp.now(),
        'updatedAt': Timestamp.now(),
      };

      final product = bp.BoutiqueProduct.fromFirestore('draft-id', data);
      expect(product.isPublished, isFalse);
      expect(product.visibility, bp.BoutiqueProductVisibility.draft);
    });
  });

  group('BoutiqueOrder fromFirestore', () {
    test('parses full order correctly', () {
      final data = <String, dynamic>{
        'orderNumber': 'BTQ-2026-0042',
        'structuredCommunication': '***001/2345/67890***',
        'buyer': {
          'userId': 'user-1',
          'displayName': 'Jan Janssen',
          'email': 'jan@test.com',
          'phone': '+32475123456',
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
          'itemsSubtotal': 50.0,
          'deliverySurcharges': 5.0,
          'total': 55.0,
        },
        'payment': {
          'method': 'qr_transfer',
          'status': 'paid',
          'paidAt': Timestamp.fromDate(DateTime(2026, 5, 1)),
        },
        'status': 'paid',
        'createdAt': Timestamp.fromDate(DateTime(2026, 5, 1)),
        'updatedAt': Timestamp.fromDate(DateTime(2026, 5, 2)),
        'expiresAt': Timestamp.fromDate(DateTime(2026, 6, 1)),
      };

      final order = bo.BoutiqueOrder.fromFirestore('order-id', data);

      expect(order.id, 'order-id');
      expect(order.orderNumber, 'BTQ-2026-0042');
      expect(order.status, bo.BoutiqueOrderStatus.paid);
      expect(order.pricing.total, 55.0);
      expect(order.pricing.itemsSubtotal, 50.0);
      expect(order.pricing.deliverySurcharges, 5.0);
      expect(order.buyer.displayName, 'Jan Janssen');
      expect(order.buyer.email, 'jan@test.com');
      expect(order.buyer.phone, '+32475123456');
      expect(order.items.length, 1);
      expect(order.items[0].productId, 'prod-1');
      expect(order.items[0].qty, 2);
      expect(order.items[0].lineTotal, 50.0);
      expect(order.items[0].deliveryMode, 'pool_pickup');
      expect(order.payment.method, 'qr_transfer');
      expect(order.payment.status, bo.BoutiqueOrderPaymentStatus.paid);
      expect(order.itemCount, 2);
    });

    test('handles minimal order data', () {
      final data = <String, dynamic>{
        'orderNumber': 'BTQ-2026-0001',
        'buyer': {'userId': 'u1', 'displayName': 'Test', 'email': 't@t.com'},
        'items': [],
        'pricing': {'total': 0.0},
        'payment': {'method': 'qr_transfer', 'status': 'pending'},
        'status': 'awaiting_payment',
        'createdAt': Timestamp.now(),
        'updatedAt': Timestamp.now(),
        'expiresAt': Timestamp.now(),
      };

      final order = bo.BoutiqueOrder.fromFirestore('min-id', data);
      expect(order.id, 'min-id');
      expect(order.status, bo.BoutiqueOrderStatus.awaitingPayment);
      expect(order.items, isEmpty);
      expect(order.buyer.email, 't@t.com');
    });

    test('handles cancelled order', () {
      final data = <String, dynamic>{
        'orderNumber': 'BTQ-2026-0002',
        'buyer': {'userId': 'u1', 'displayName': 'Test', 'email': 't@t.com'},
        'items': [],
        'pricing': {'total': 25.0},
        'payment': {'method': 'qr_transfer', 'status': 'refunded'},
        'status': 'cancelled',
        'createdAt': Timestamp.now(),
        'updatedAt': Timestamp.now(),
        'expiresAt': Timestamp.now(),
      };

      final order = bo.BoutiqueOrder.fromFirestore('cancelled-id', data);
      expect(order.status, bo.BoutiqueOrderStatus.cancelled);
      expect(order.payment.status, bo.BoutiqueOrderPaymentStatus.refunded);
    });
  });

  group('BoutiqueBankSettings fromFirestore', () {
    test('parses valid bank settings', () {
      final data = <String, dynamic>{
        'beneficiaryName': 'Calypso DC',
        'iban': 'BE12 3456 7890 1234',
        'bic': 'INGBBEBB',
      };

      final settings = bo.BoutiqueBankSettings.fromFirestore(data);
      expect(settings.beneficiaryName, 'Calypso DC');
      expect(settings.iban, 'BE12 3456 7890 1234');
      expect(settings.bic, 'INGBBEBB');
      expect(settings.isValid, isTrue);
    });

    test('parses settings missing validity field', () {
      final data = <String, dynamic>{
        'iban': 'BE98 7654 3210 9876',
        'beneficiaryName': 'Club',
      };

      final settings = bo.BoutiqueBankSettings.fromFirestore(data);
      expect(settings.iban, 'BE98 7654 3210 9876');
      expect(settings.beneficiaryName, 'Club');
      expect(settings.isValid, isTrue);
    });

    test('detects invalid settings (empty fields)', () {
      final settings = bo.BoutiqueBankSettings.fromFirestore({});
      expect(settings.isValid, isFalse);
    });
  });
}
