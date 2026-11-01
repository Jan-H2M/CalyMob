import 'dart:async';
import 'package:calymob/providers/auth_provider.dart';
import 'package:calymob/providers/member_provider.dart';
import 'package:calymob/providers/boutique_cart_provider.dart';
import 'package:calymob/screens/boutique/boutique_checkout_screen.dart';
import 'package:calymob/services/boutique/boutique_service.dart';
import 'package:calymob/services/boutique/boutique_access_service.dart';
import 'package:calymob/widgets/boutique/boutique_access_guard.dart';
import 'package:calymob/widgets/boutique/boutique_current_payment_panel.dart';
import 'package:calymob/widgets/payment_communication_copy_button.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart' show User;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _User extends Mock implements User {
  @override
  String get uid => 'fictional-buyer';
  @override
  String? get email => 'buyer@example.invalid';
}

class _Auth extends Mock with ChangeNotifier implements AuthProvider {
  @override
  User? get currentUser => _User();
  @override
  bool get isLoading => false;
}

class _Member extends Mock with ChangeNotifier implements MemberProvider {
  @override
  String get displayName => 'Acheteur FICTIF';
  @override
  String? get email => 'buyer@example.invalid';
  @override
  String? get phoneNumber => null;
}

const reference = '+++BTQ-2099-9001+++';
Map<String, dynamic> currentPayment() => {
      'orderNumber': 'BTQ-2099-9001',
      'orderTotal': 41.5,
      'receivedAmount': 0,
      'reportedAmount': 0,
      'amount': 41.5,
      'requestId': 'initial',
      'revision': 'legacy',
      'kind': 'initial',
      'iban': 'BE68539007547034',
      'beneficiary': 'Club FICTIF',
      'communication': reference,
      'epcPayload':
          'BCD\n002\n1\nSCT\n\nClub FICTIF\nBE68539007547034\nEUR41.50\n\n\n$reference',
    };
Map<String, dynamic> receipt() => {
      'success': true,
      'orderId': 'fictional-order',
      'orderNumber': 'BTQ-2099-9001',
      'total': 41.5,
      'ogm_display': reference,
      'payment': {
        'iban': 'BE68539007547034',
        'beneficiary': 'Club FICTIF',
        'amount': 41.5,
        'emailStatus': 'deferred'
      },
    };

Future<void> frames(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 80));
  }
}

Future<BoutiqueCartProvider> openCheckout(
  WidgetTester tester, {
  required Future<Map<String, dynamic>> Function(Map<String, dynamic>) create,
  Future<Map<String, dynamic>> Function()? load,
  void Function()? email,
}) async {
  SharedPreferences.setMockInitialValues({});
  final db = FakeFirebaseFirestore();
  await db.doc('clubs/calypso/settings/feature_flags').set({
    'boutiqueEnabled': true,
    'boutiqueMobileEnabled': true,
    'boutiqueAccess': 'tous'
  });
  await db
      .doc('clubs/calypso/members/fictional-buyer')
      .set({'member_status': 'active'});
  await db.doc('clubs/calypso/products/fictional-product').set({
    'name': 'Article FICTIF',
    'visibility': 'published',
    'supplierId': 'fictional-supplier',
    'inventoryMode': 'preorder',
    'pricing': {'salePrice': 41.5, 'currency': 'EUR'},
    'variants': [
      {
        'id': 'fictional-variant',
        'label': 'Unique',
        'attributes': {},
        'allowBackorder': true
      }
    ],
    'deliveryModes': ['pool_pickup'],
  });
  final cart =
      BoutiqueCartProvider(authStateChanges: const Stream<User?>.empty());
  for (var i = 0; !cart.loaded && i < 20; i++) {
    await tester.pump(const Duration(milliseconds: 1));
  }
  expect(cart.loaded, true);
  await cart.addItem(const BoutiqueCartItem(
      key: 'fictional-product|fictional-variant|pool_pickup|{}',
      productId: 'fictional-product',
      productName: 'Article FICTIF',
      supplierId: 'fictional-supplier',
      variantId: 'fictional-variant',
      variantLabel: 'Unique',
      deliveryMode: 'pool_pickup',
      deliveryLabel: 'Retrait piscine',
      qty: 1,
      unitPrice: 41.5,
      deliverySurcharge: 0,
      personalization: {}));
  addTearDown(cart.dispose);
  final auth = _Auth(), member = _Member();
  addTearDown(auth.dispose);
  addTearDown(member.dispose);
  final access = BoutiqueAccessService(
      firestore: db, authUserIds: () => Stream.value('fictional-buyer'));
  await tester.pumpWidget(MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthProvider>.value(value: auth),
        ChangeNotifierProvider<MemberProvider>.value(value: member),
        ChangeNotifierProvider<BoutiqueCartProvider>.value(value: cart),
      ],
      child: MaterialApp(
          home: BoutiqueAccessScope(
              accessService: access,
              clubId: 'calypso',
              userId: 'fictional-buyer',
              child: BoutiqueCheckoutScreen(
                boutiqueService: BoutiqueService(firestore: db),
                createOrder: create,
                paymentPanelBuilder: (id, showQr) =>
                    BoutiqueCurrentPaymentPanel(
                        orderId: id,
                        showQr: showQr,
                        loadPayment: load ?? () async => currentPayment(),
                        sendEmail: (_) async {
                          email?.call();
                        }),
              )))));
  await frames(tester);
  return cart;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
      'email choice stays explicit and never sends just by creating an order',
      (tester) async {
    var emails = 0;
    await openCheckout(tester,
        create: (_) async => receipt(), email: () => emails++);
    await tester.tap(find.text('Recevoir le QR code par e-mail'));
    await frames(tester);
    expect(find.text('Votre commande est bien enregistrée'), findsOneWidget);
    expect(find.byType(QrImageView), findsOneWidget);
    expect(emails, 0);
    await tester.drag(find.byType(ListView).first, const Offset(0, -500));
    await frames(tester);
    await tester.ensureVisible(find.text('Envoyer cette demande par e-mail'));
    await frames(tester);
    await tester.tap(find.text('Envoyer cette demande par e-mail'));
    await frames(tester);
    expect(emails, 1);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
      'incomplete creation response never clears cart or pretends an order was saved',
      (tester) async {
    final cart = await openCheckout(tester,
        create: (_) async => {
              ...receipt(),
              'orderId': null,
            });
    await tester.tap(find.text('Payer par virement bancaire'));
    await frames(tester);
    expect(cart.isEmpty, false);
    expect(find.byKey(const Key('boutique-order-saved')), findsNothing);
    expect(find.textContaining('Confirmation de commande incomplète'),
        findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
      'bank checkout persists the choice and shows QR and separate transfer copies',
      (tester) async {
    var calls = 0, emails = 0;
    Map<String, dynamic>? payload;
    final cart = await openCheckout(tester,
        create: (p) async {
          calls++;
          payload = p;
          return receipt();
        },
        email: () => emails++);
    await tester.tap(find.text('Payer par virement bancaire'));
    await frames(tester);
    expect(calls, 1);
    expect(cart.isEmpty, true);
    expect(emails, 0);
    expect(payload!.containsKey('deferPaymentEmail'), false);
    expect(payload!['paymentPresentation'], 'bank');
    expect(payload!['idempotencyKey'], isNotEmpty);
    expect(find.text('Votre commande est bien enregistrée'), findsOneWidget);
    expect(find.text('BTQ-2099-9001'), findsOneWidget);
    expect(find.textContaining('panier a été vidé'), findsOneWidget);
    expect(find.textContaining('automatiquement à la création'), findsOneWidget);
    expect(find.textContaining('Virement bancaire'), findsWidgets);
    await tester.drag(find.byType(ListView).first, const Offset(0, -400));
    await frames(tester);
    expect(find.textContaining('BE68539007547034'), findsOneWidget);
    expect(find.byType(PaymentCommunicationCopyButton), findsOneWidget);
    expect(find.byType(QrImageView), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
      'unavailable payment endpoint does not erase order confirmation or reuse historical instructions',
      (tester) async {
    var emails = 0;
    final cart = await openCheckout(tester,
        create: (_) async => receipt(),
        load: () async => throw StateError('fictional endpoint unavailable'),
        email: () => emails++);
    await tester.tap(find.text('Payer par virement bancaire'));
    await frames(tester);
    expect(cart.isEmpty, true);
    expect(emails, 0);
    expect(find.text('Votre commande est bien enregistrée'), findsOneWidget);
    expect(find.text('BTQ-2099-9001'), findsOneWidget);
    expect(find.textContaining('Ne repassez pas la commande'), findsOneWidget);
    expect(find.byType(QrImageView), findsNothing);
    expect(find.byType(PaymentCommunicationCopyButton), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('failed creation keeps cart and idempotency key for retry',
      (tester) async {
    final keys = <String>[];
    final cart = await openCheckout(tester, create: (p) async {
      keys.add(p['idempotencyKey'] as String);
      throw StateError('fictional offline');
    });
    await tester.tap(find.text('Payer par virement bancaire'));
    await frames(tester);
    expect(cart.isEmpty, false);
    expect(find.text('BTQ-2099-9001'), findsNothing);
    await tester.ensureVisible(find.text('Choisir le mode de paiement'));
    await tester.tap(find.text('Choisir le mode de paiement'));
    await frames(tester);
    await tester.tap(find.text('Payer par virement bancaire'));
    await frames(tester);
    expect(keys.length, 2);
    expect(keys[1], keys[0]);
    expect(cart.isEmpty, false);
    await tester.pumpWidget(const SizedBox());
  });
}
