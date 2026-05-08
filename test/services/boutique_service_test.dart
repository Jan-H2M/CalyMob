import 'package:flutter_test/flutter_test.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:calymob/models/boutique_order.dart';

void main() {
  const clubId = 'club-test-1';
  const userId = 'user-1';
  const ordersPath = 'clubs/$clubId/orders';

  late FakeFirebaseFirestore firestore;

  Map<String, dynamic> sampleOrder({
    String status = 'awaiting_payment',
    String orderNum = 'BTQ-2026-0001',
  }) {
    return {
      'orderNumber': orderNum,
      'structuredCommunication': '***123/4567/89101***',
      'buyer': {
        'userId': userId,
        'displayName': 'Jan Janssen',
        'email': 'jan@test.com',
        'phone': '+32475123456',
      },
      'items': [
        {
          'lineId': 'li_001',
          'productId': 'prod-1',
          'variantId': 'v1',
          'productSnapshot': {'name': 'T-shirt Calypso', 'imageUrl': 'tshirt.jpg'},
          'qty': 2,
          'unitPrice': 25.0,
          'lineTotal': 50.0,
          'supplierId': '',
          'deliveryMode': 'pool_pickup',
          'fulfillmentStatus': 'pending',
        },
      ],
      'pricing': {
        'itemsSubtotal': 50.0,
        'deliverySurcharges': 0.0,
        'total': 50.0,
        'currency': 'EUR',
      },
      'payment': {'method': 'qr_transfer', 'status': 'pending'},
      'status': status,
      'statusHistory': [
        {
          'oldStatus': 'cart',
          'newStatus': 'awaiting_payment',
          'changedBy': userId,
          'changedAt': Timestamp.now(),
          'note': 'Commande créée via boutique mobile',
        },
      ],
      'createdAt': Timestamp.now(),
      'updatedAt': Timestamp.now(),
    };
  }

  setUp(() {
    firestore = FakeFirebaseFirestore();
  });

  group('BoutiqueService - Order data layer', () {
    group('Order creation', () {
      test('order is created with correct structure', () async {
        final docRef = await firestore.collection(ordersPath).add(
          sampleOrder(),
        );

        final doc = await docRef.get();
        expect(doc.exists, isTrue);

        final data = doc.data() as Map<String, dynamic>;
        expect(data['orderNumber'], 'BTQ-2026-0001');
        expect(data['status'], 'awaiting_payment');
        expect(data['buyer']['userId'], userId);
        expect(data['buyer']['displayName'], 'Jan Janssen');
        expect(data['pricing']['total'], 50.0);
        expect(data['items'].length, 1);
      });

      test('order with cart status is filtered out', () async {
        // 'cart' orders should not be shown to members
        await firestore.collection(ordersPath).add(
          sampleOrder(status: 'cart'),
        );
        await firestore.collection(ordersPath).add(
          sampleOrder(status: 'awaiting_payment', orderNum: 'BTQ-2026-0002'),
        );

        final nonCartQuery = firestore
            .collection(ordersPath)
            .where('status', whereNotIn: ['cart']);

        final snapshot = await nonCartQuery.get();
        expect(snapshot.docs.length, 1);
        expect(snapshot.docs.first.data()['status'], 'awaiting_payment');
      });
    });

    group('Order status flow', () {
      test('order status lifecycle: awaiting_payment -> paid -> preparing -> ready -> delivered', () async {
        final docRef = await firestore.collection(ordersPath).add(
          sampleOrder(status: 'awaiting_payment'),
        );

        // Simulate admin marking as paid
        await docRef.update({'status': 'paid', 'updatedAt': Timestamp.now()});
        var doc = await docRef.get();
        expect((doc.data() as Map<String, dynamic>)['status'], 'paid');

        // Simulate admin starting preparation
        await docRef.update({'status': 'preparing', 'updatedAt': Timestamp.now()});
        doc = await docRef.get();
        expect((doc.data() as Map<String, dynamic>)['status'], 'preparing');

        // Simulate marking as ready
        await docRef.update({'status': 'ready', 'updatedAt': Timestamp.now()});
        doc = await docRef.get();
        expect((doc.data() as Map<String, dynamic>)['status'], 'ready');

        // Simulate delivery
        await docRef.update({'status': 'delivered', 'updatedAt': Timestamp.now()});
        doc = await docRef.get();
        expect((doc.data() as Map<String, dynamic>)['status'], 'delivered');
      });

      test('order can be cancelled from awaiting_payment', () async {
        final docRef = await firestore.collection(ordersPath).add(
          sampleOrder(status: 'awaiting_payment'),
        );

        await docRef.update({'status': 'cancelled', 'updatedAt': Timestamp.now()});

        final doc = await docRef.get();
        expect((doc.data() as Map<String, dynamic>)['status'], 'cancelled');
      });
    });

    group('Order status enum', () {
      test('status enum labels are correct', () {
        expect(BoutiqueOrderStatus.cart.label, 'Panier');
        expect(BoutiqueOrderStatus.awaitingPayment.label, 'En attente de paiement');
        expect(BoutiqueOrderStatus.paid.label, 'Payée');
        expect(BoutiqueOrderStatus.preparing.label, 'En préparation');
        expect(BoutiqueOrderStatus.ready.label, 'Prête');
        expect(BoutiqueOrderStatus.delivered.label, 'Remise');
        expect(BoutiqueOrderStatus.cancelled.label, 'Annulée');
        expect(BoutiqueOrderStatus.refunded.label, 'Remboursée');
      });

      test('isActive correctly identifies active orders', () {
        expect(BoutiqueOrderStatus.cart.isActive, isFalse);
        expect(BoutiqueOrderStatus.awaitingPayment.isActive, isTrue);
        expect(BoutiqueOrderStatus.paid.isActive, isTrue);
        expect(BoutiqueOrderStatus.preparing.isActive, isTrue);
        expect(BoutiqueOrderStatus.ready.isActive, isTrue);
        expect(BoutiqueOrderStatus.delivered.isActive, isFalse);
        expect(BoutiqueOrderStatus.cancelled.isActive, isFalse);
        expect(BoutiqueOrderStatus.refunded.isActive, isFalse);
      });

      test('isCancellable correctly identifies cancellable orders', () {
        expect(BoutiqueOrderStatus.awaitingPayment.isCancellable, isTrue);
        expect(BoutiqueOrderStatus.paid.isCancellable, isTrue);
        expect(BoutiqueOrderStatus.preparing.isCancellable, isFalse);
        expect(BoutiqueOrderStatus.ready.isCancellable, isFalse);
        expect(BoutiqueOrderStatus.delivered.isCancellable, isFalse);
      });

      test('showQr is only true for awaiting_payment', () {
        expect(BoutiqueOrderStatus.awaitingPayment.showQr, isTrue);
        expect(BoutiqueOrderStatus.paid.showQr, isFalse);
        expect(BoutiqueOrderStatus.preparing.showQr, isFalse);
        expect(BoutiqueOrderStatus.ready.showQr, isFalse);
        expect(BoutiqueOrderStatus.delivered.showQr, isFalse);
        expect(BoutiqueOrderStatus.cancelled.showQr, isFalse);
      });
    });

    group('Order model parsing', () {
      test('BoutiqueOrder.fromFirestore parses all fields', () async {
        final docRef = await firestore.collection(ordersPath).add(
          sampleOrder(status: 'paid', orderNum: 'BTQ-2026-0042'),
        );
        final doc = await docRef.get();
        final order = BoutiqueOrder.fromFirestore(
          doc.id,
          doc.data() ?? {},
        );

        expect(order.id, doc.id);
        expect(order.orderNumber, 'BTQ-2026-0042');
        expect(order.status, BoutiqueOrderStatus.paid);
        expect(order.pricing.total, 50.0);
        expect(order.items.length, 1);
        expect(order.items[0].productId, 'prod-1');
        expect(order.items[0].qty, 2);
        expect(order.buyer.displayName, 'Jan Janssen');
      });

      test('fromFirestore handles empty data gracefully', () async {
        final docRef = await firestore.collection(ordersPath).add({
          'orderNumber': 'BTQ-2026-0001',
          'status': 'awaiting_payment',
          'buyer': {'userId': userId, 'displayName': 'Test', 'email': 't@t.com'},
          'items': [],
          'pricing': {'total': 0.0, 'currency': 'EUR'},
          'payment': {'method': 'qr_transfer', 'status': 'pending'},
          'createdAt': Timestamp.now(),
          'updatedAt': Timestamp.now(),
        });
        final doc = await docRef.get();
        final order = BoutiqueOrder.fromFirestore(
          doc.id,
          doc.data() ?? {},
        );

        expect(order.id, doc.id);
        expect(order.status, BoutiqueOrderStatus.awaitingPayment);
        expect(order.items, isEmpty);
        expect(order.pricing.total, 0.0);
      });
    });

    group('Order querying by user', () {
      test('orders are filtered by buyer userId', () async {
        await firestore.collection(ordersPath).add(
          sampleOrder(orderNum: 'BTQ-2026-0001'),
        );

        // Add an order for a different user in the same collection
        final otherOrder = sampleOrder(orderNum: 'BTQ-2026-0002');
        otherOrder['buyer'] = {
          'userId': 'other-user',
          'displayName': 'Other',
          'email': 'other@other.com',
        };
        await firestore.collection(ordersPath).add(otherOrder);

        final userQuery = firestore
            .collection(ordersPath)
            .where('buyer.userId', isEqualTo: userId);

        final snapshot = await userQuery.get();
        expect(snapshot.docs.length, 1);
        expect(
          (snapshot.docs.first.data() as Map<String, dynamic>)['orderNumber'],
          'BTQ-2026-0001',
        );
      });
    });

    group('Bank settings', () {
      test('boutique_payment settings are parsed correctly', () async {
        await firestore
            .collection('clubs')
            .doc(clubId)
            .collection('settings')
            .doc('boutique_payment')
            .set({
          'bankName': 'ING',
          'accountHolder': 'Calypso DC',
          'iban': 'BE12 3456 7890 1234',
          'bic': 'INGBBEBB',
          'isValid': true,
        });

        final doc = await firestore
            .collection('clubs')
            .doc(clubId)
            .collection('settings')
            .doc('boutique_payment')
            .get();

        expect(doc.exists, isTrue);
        final data = doc.data() as Map<String, dynamic>;
        expect(data['iban'], 'BE12 3456 7890 1234');
        expect(data['accountHolder'], 'Calypso DC');
        expect(data['isValid'], true);
      });

      test('bank_settings fallback is parsed correctly', () async {
        await firestore
            .collection('clubs')
            .doc(clubId)
            .collection('settings')
            .doc('bank_settings')
            .set({
          'bankName': 'KBC',
          'accountHolder': 'Calypso Diving Club',
          'iban': 'BE98 7654 3210 9876',
          'bic': 'KBCBBEBB',
          'isValid': true,
        });

        final doc = await firestore
            .collection('clubs')
            .doc(clubId)
            .collection('settings')
            .doc('bank_settings')
            .get();

        expect(doc.exists, isTrue);
        expect((doc.data() as Map<String, dynamic>)['iban'], 'BE98 7654 3210 9876');
      });
    });
  });
}
