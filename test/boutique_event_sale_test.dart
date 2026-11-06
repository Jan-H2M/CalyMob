import 'dart:async';
import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:calymob/screens/boutique/boutique_event_sale_screen.dart';
import 'package:calymob/services/boutique/boutique_access_service.dart';
import 'package:calymob/services/boutique/boutique_operations_service.dart';
import 'package:calymob/widgets/boutique/boutique_access_guard.dart';

void main() {
  testWidgets(
      'sells a selected physical piece to a chosen member after displaying a QR and explicit confirmation',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final calls = <Map<String, dynamic>>[];
    final service = BoutiqueOperationsService(transport: (r) async {
      calls.add(Map.of(r));
      switch (r['action']) {
        case 'saleCatalog':
          return {
            'units': [
              {
                'id': 'piece',
                'revision': 'r1',
                'productName': 'Polo',
                'variantLabel': 'M',
                'location': 'Club',
                'price': 25
              }
            ],
            'hasMore': false
          };
        case 'saleMembers':
          return {
            'members': [
              {'id': 'buyer', 'name': 'Alex'},
              {'id': 'buyer2', 'name': 'Camille'}
            ],
            'hasMore': false
          };
        case 'salePending':
          return {'sales': [], 'hasMore': false};
        case 'saleEvents':
          return {'events': []};
        case 'saleLookup':
          return {
            'open': true,
            'orderId': 'o1',
            'buyerName': 'Alex',
            'buyerId': 'buyer',
            'ids': ['piece'],
            'total': 25,
            'communication': '+++BTQ-2026-1000+++',
            'epcPayload': 'BCD',
            'paymentStatus': 'pending'
          };
        case 'salePrepare':
          return {
            'total': 25,
            'orderId': 'o1',
            'communication': '+++BTQ-2026-1000+++',
            'epcPayload': 'BCD\n002\n1\nSCT'
          };
        case 'lookup':
          return {
            'unit': {'id': 'piece', 'revision': 'r2', 'productName': 'Polo'}
          };
        case 'saleComplete':
          return {'count': 1};
        default:
          throw StateError('unexpected ${r['action']}');
      }
    });
    final access = BoutiqueAccessService(
        firestore: FakeFirebaseFirestore(),
        authUserIds: () => Stream.value('rb'));
    await tester.pumpWidget(BoutiqueAccessScope(
        accessService: access,
        clubId: 'demo',
        userId: 'rb',
        child: MaterialApp(
            home: BoutiqueEventSaleScreen(clubId: 'demo', service: service))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Polo'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Continuer'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(ListTile, 'Alex'), findsOneWidget);
    expect(find.widgetWithText(ListTile, 'Camille'), findsOneWidget);
    await tester.enterText(
        find.widgetWithText(TextField, 'Rechercher un membre'), 'Alex');
    await tester.pumpAndSettle();
    expect(find.widgetWithText(ListTile, 'Camille'), findsNothing);
    await tester.tap(find.widgetWithText(ListTile, 'Alex'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Afficher le QR de paiement'));
    await tester.pumpAndSettle();
    expect(find.textContaining('+++BTQ-2026-1000+++'), findsOneWidget);
    expect(calls.where((v) => v['action'] == 'saleComplete'), isEmpty);
    await tester.tap(find.text('J’ai vérifié la confirmation chez l’acheteur'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Confirmer la remise'));
    await tester.tap(find.text('Confirmer la remise'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Remise enregistrée.'), findsOneWidget);
    final complete = calls.singleWhere((v) => v['action'] == 'saleComplete');
    expect(complete['confirmed'], true);
    expect(complete['recipientMemberId'], 'buyer');
  });

  testWidgets('saved sale opens even if catalog and events are unavailable',
      (tester) async {
    SharedPreferences.setMockInitialValues({
      'boutique_event_sale_demo_rb':
          '{"request":{"recipientMemberId":"buyer"},"buyerName":"Alex","ids":["piece"],"result":{"orderId":"o1","total":25,"communication":"BTQ-1","epcPayload":"BCD\\n002"}}'
    });
    final calls = <String>[];
    final service = BoutiqueOperationsService(transport: (r) async {
      calls.add(r['action'] as String);
      throw StateError('offline');
    });
    final access = BoutiqueAccessService(
        firestore: FakeFirebaseFirestore(),
        authUserIds: () => Stream.value('rb'));
    await tester.pumpWidget(BoutiqueAccessScope(
        accessService: access,
        clubId: 'demo',
        userId: 'rb',
        child: MaterialApp(
            home: BoutiqueEventSaleScreen(clubId: 'demo', service: service))));
    await tester.pumpAndSettle();
    expect(find.text('Alex'), findsOneWidget);
    expect(find.textContaining('BTQ-1'), findsOneWidget);
    expect(calls, ['saleLookup']);
  });

  testWidgets(
      'another responsible can resume an interrupted sale from the server',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final service = BoutiqueOperationsService(transport: (r) async {
      switch (r['action']) {
        case 'saleCatalog':
          return {'units': [], 'hasMore': false};
        case 'saleMembers':
          return {'members': [], 'hasMore': false};
        case 'saleEvents':
          return {'events': []};
        case 'saleLookup':
          return {
            'open': true,
            'orderId': 'o1',
            'buyerName': 'Alex',
            'buyerId': 'buyer',
            'ids': ['piece'],
            'total': 25,
            'communication': 'BTQ-1',
            'epcPayload': 'BCD',
            'paymentStatus': 'pending'
          };
        case 'salePending':
          return {
            'sales': [
              {
                'orderId': 'o1',
                'orderNumber': 'BTQ-1',
                'buyerId': 'buyer',
                'buyerName': 'Alex',
                'ids': ['piece'],
                'total': 25,
                'communication': 'BTQ-1',
                'epcPayload': 'BCD',
                'paymentStatus': 'pending'
              }
            ],
            'hasMore': false
          };
        default:
          throw StateError('unexpected');
      }
    });
    final access = BoutiqueAccessService(
        firestore: FakeFirebaseFirestore(),
        authUserIds: () => Stream.value('second'));
    await tester.pumpWidget(BoutiqueAccessScope(
        accessService: access,
        clubId: 'demo',
        userId: 'second',
        child: MaterialApp(
            home: BoutiqueEventSaleScreen(clubId: 'demo', service: service))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ventes à reprendre · 1'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('BTQ-1 · Alex'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Communication : BTQ-1'), findsOneWidget);
  });

  testWidgets('server recovery remains available when catalog loading fails',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final service = BoutiqueOperationsService(transport: (r) async {
      if (r['action'] == 'saleLookup')
        return {
          'open': true,
          'orderId': 'o2',
          'buyerName': 'Alex',
          'buyerId': 'buyer',
          'ids': ['piece'],
          'total': 25,
          'communication': 'BTQ-2',
          'epcPayload': 'BCD',
          'paymentStatus': 'pending'
        };
      if (r['action'] == 'salePending')
        return {
          'sales': [
            {
              'orderId': 'o2',
              'orderNumber': 'BTQ-2',
              'buyerId': 'buyer',
              'buyerName': 'Alex',
              'ids': ['piece'],
              'total': 25,
              'communication': 'BTQ-2',
              'epcPayload': 'BCD',
              'paymentStatus': 'pending'
            }
          ],
          'hasMore': false
        };
      throw StateError('catalog unavailable');
    });
    final access = BoutiqueAccessService(
        firestore: FakeFirebaseFirestore(),
        authUserIds: () => Stream.value('second'));
    await tester.pumpWidget(BoutiqueAccessScope(
        accessService: access,
        clubId: 'demo',
        userId: 'second',
        child: MaterialApp(
            home: BoutiqueEventSaleScreen(clubId: 'demo', service: service))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ventes à reprendre · 1'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('BTQ-2 · Alex'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Communication : BTQ-2'), findsOneWidget);
  });
  testWidgets(
      'stale saved preparation clears pending and reloads available items',
      (tester) async {
    SharedPreferences.setMockInitialValues({
      'boutique_event_sale_demo_rb':
          '{"request":{"recipientMemberId":"buyer"},"buyerName":"Alex","ids":["piece"]}'
    });
    final service = BoutiqueOperationsService(transport: (r) async {
      switch (r['action']) {
        case 'salePrepare':
          throw FirebaseFunctionsException(code: 'aborted', message: 'Changed');
        case 'salePending':
          return {'sales': [], 'hasMore': false};
        case 'saleCatalog':
          return {
            'units': [
              {
                'id': 'new',
                'revision': 'r2',
                'productName': 'Nouveau polo',
                'variantLabel': 'M',
                'location': 'Club',
                'price': 25
              }
            ],
            'hasMore': false
          };
        case 'saleMembers':
          return {'members': [], 'hasMore': false};
        case 'saleEvents':
          return {'events': []};
        default:
          throw StateError('unexpected');
      }
    });
    final access = BoutiqueAccessService(
        firestore: FakeFirebaseFirestore(),
        authUserIds: () => Stream.value('rb'));
    await tester.pumpWidget(BoutiqueAccessScope(
        accessService: access,
        clubId: 'demo',
        userId: 'rb',
        child: MaterialApp(
            home: BoutiqueEventSaleScreen(clubId: 'demo', service: service))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Retrouver la vente'));
    await tester.pumpAndSettle();
    expect(find.text('Nouveau polo'), findsOneWidget);
    expect(
        (await SharedPreferences.getInstance())
            .getString('boutique_event_sale_demo_rb'),
        isNull);
  });

  for (final payment in ['paid', 'closed']) {
    testWidgets('a $payment sale never displays a payment QR after recovery',
        (tester) async {
      SharedPreferences.setMockInitialValues({
        'boutique_event_sale_demo_rb':
            '{"request":{"recipientMemberId":"buyer"},"buyerName":"Alex","ids":["piece"],"result":{"orderId":"o1","total":25,"communication":"BTQ-1","epcPayload":"BCD"}}'
      });
      final service = BoutiqueOperationsService(
          transport: (r) async => payment == 'closed'
              ? {'open': false}
              : {
                  'open': true,
                  'orderId': 'o1',
                  'buyerName': 'Alex',
                  'buyerId': 'buyer',
                  'ids': ['piece'],
                  'total': 25,
                  'communication': 'BTQ-1',
                  'epcPayload': 'BCD',
                  'paymentStatus': 'paid'
                });
      final access = BoutiqueAccessService(
          firestore: FakeFirebaseFirestore(),
          authUserIds: () => Stream.value('rb'));
      await tester.pumpWidget(BoutiqueAccessScope(
          accessService: access,
          clubId: 'demo',
          userId: 'rb',
          child: MaterialApp(
              home:
                  BoutiqueEventSaleScreen(clubId: 'demo', service: service))));
      await tester.pumpAndSettle();
      expect(find.byType(QrImageView), findsNothing);
      if (payment == 'paid')
        expect(find.text('Paiement reçu par la banque.'), findsOneWidget);
    });
  }

  testWidgets(
      'hides payment QR during a delayed status refresh and prevents confirmation',
      (tester) async {
    SharedPreferences.setMockInitialValues({
      'boutique_event_sale_demo_rb':
          '{"request":{"recipientMemberId":"buyer"},"buyerName":"Alex","ids":["piece"],"result":{"orderId":"o1","total":25,"communication":"BTQ-1","epcPayload":"BCD"}}'
    });
    var count = 0;
    final delayed = Completer<Map<String, dynamic>>();
    final service = BoutiqueOperationsService(transport: (r) async {
      if (r['action'] == 'saleLookup') {
        count++;
        if (count == 1)
          return {
            'open': true,
            'orderId': 'o1',
            'buyerName': 'Alex',
            'buyerId': 'buyer',
            'ids': ['piece'],
            'total': 25,
            'communication': 'BTQ-1',
            'epcPayload': 'BCD',
            'paymentStatus': 'pending'
          };
        return delayed.future;
      }
      throw StateError('unexpected');
    });
    final access = BoutiqueAccessService(
        firestore: FakeFirebaseFirestore(),
        authUserIds: () => Stream.value('rb'));
    await tester.pumpWidget(BoutiqueAccessScope(
        accessService: access,
        clubId: 'demo',
        userId: 'rb',
        child: MaterialApp(
            home: BoutiqueEventSaleScreen(clubId: 'demo', service: service))));
    await tester.pumpAndSettle();
    expect(find.byType(QrImageView), findsOneWidget);
    await tester.pump(const Duration(seconds: 10));
    await tester.pump();
    expect(find.byType(QrImageView), findsNothing);
    final button = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Confirmer la remise'));
    expect(button.onPressed, isNull);
    delayed.complete({'open': false});
    await tester.pumpAndSettle();
    expect(find.byType(QrImageView), findsNothing);
  });
}
