import 'package:flutter/material.dart';
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
              {'id': 'buyer', 'name': 'Alex'}
            ],
            'hasMore': false
          };
        case 'saleEvents':
          return {'events': []};
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
    await tester.enterText(
        find.widgetWithText(TextField, 'Rechercher un membre'), 'Alex');
    await tester.pumpAndSettle();
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
    expect(find.text('Opération enregistrée.'), findsOneWidget);
    final complete = calls.singleWhere((v) => v['action'] == 'saleComplete');
    expect(complete['confirmed'], true);
    expect(complete['recipientMemberId'], 'buyer');
  });
}
