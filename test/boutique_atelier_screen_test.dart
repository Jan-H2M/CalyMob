import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:calymob/screens/boutique/boutique_atelier_screen.dart';
import 'package:calymob/services/boutique/boutique_access_service.dart';
import 'package:calymob/services/boutique/boutique_operations_service.dart';
import 'package:calymob/widgets/boutique/boutique_access_guard.dart';

void main() {
  testWidgets('finishes selected workshop pieces with a preview',
      (tester) async {
    final calls = <Map<String, dynamic>>[];
    final service = BoutiqueOperationsService(transport: (r) async {
      calls.add(Map.of(r));
      if (r['action'] == 'atelierList')
        return {
          'units': [
            {
              'id': 'p1',
              'revision': 'r1',
              'productName': 'Bonnet',
              'variantLabel': 'OS',
              'location': 'Jim',
              'customerName': 'Alex',
              'finish': 'at_jim',
              'destination': 'customer_reserved',
              'saleStatus': 'not_ready',
              'workshopReady': false,
              'workshopDispatched': false
            }
          ],
          'hasMore': false
        };
      if (r['action'] == 'finishJim') return {'count': 1};
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
            home: BoutiqueAtelierScreen(clubId: 'demo', service: service))));
    await tester.pumpAndSettle();
    expect(find.text('À faire · 1'), findsOneWidget);
    await tester.tap(find.text('Tout sélectionner'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Broderie finie'));
    await tester.pumpAndSettle();
    final changes = calls.where((c) => c['action'] == 'finishJim').toList();
    expect(changes.length, 2);
    expect(changes.first['preview'], true);
    expect(changes.last['units'], [
      {'id': 'p1', 'revision': 'r1'}
    ]);
    expect(changes.first['idempotencyKey'], changes.last['idempotencyKey']);
  });
  testWidgets(
      'requires a comment and confirmation before recording embroidery damage',
      (tester) async {
    final calls = <Map<String, dynamic>>[];
    final service = BoutiqueOperationsService(transport: (r) async {
      calls.add(Map.of(r));
      if (r['action'] == 'atelierList')
        return {
          'units': [
            {
              'id': 'p1',
              'revision': 'r1',
              'productName': 'Bonnet',
              'variantLabel': 'OS',
              'location': 'Jim',
              'customerName': 'Alex',
              'customerOrderId': 'o1',
              'finish': 'at_jim',
              'destination': 'customer_reserved',
              'saleStatus': 'not_ready',
              'workshopReady': false,
              'workshopDispatched': false
            }
          ],
          'hasMore': false
        };
      if (r['action'] == 'damageJim')
        return {'count': 1, 'replacement': 'supplier'};
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
            home: BoutiqueAtelierScreen(clubId: 'demo', service: service))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Bonnet'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Déclarer une broderie ratée'));
    await tester.pumpAndSettle();
    expect(find.text('Ajoutez un commentaire pour expliquer la situation.'),
        findsOneWidget);
    expect(calls.where((r) => r['action'] == 'damageJim'), isEmpty);
    await tester.tap(find.text('Bonnet'));
    await tester.pumpAndSettle();
    await tester.enterText(
        find.widgetWithText(TextField, 'Commentaire atelier'), 'Fil cassé');
    await tester.ensureVisible(find.text('Déclarer une broderie ratée'));
    await tester.tap(find.text('Déclarer une broderie ratée'));
    await tester.pumpAndSettle();
    expect(find.text('Confirmer la broderie ratée ?'), findsOneWidget);
    expect(calls.where((r) => r['action'] == 'damageJim').length, 1);
    await tester.tap(find.text('Confirmer'));
    await tester.pumpAndSettle();
    final actions = calls.where((r) => r['action'] == 'damageJim').toList();
    expect(actions.length, 2);
    expect(actions.first['preview'], true);
    expect(actions.last['note'], 'Fil cassé');
  });
}
