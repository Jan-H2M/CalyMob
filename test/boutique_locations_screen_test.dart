import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:calymob/screens/boutique/boutique_locations_screen.dart';
import 'package:calymob/services/boutique/boutique_access_service.dart';
import 'package:calymob/services/boutique/boutique_operations_service.dart';
import 'package:calymob/widgets/boutique/boutique_access_guard.dart';

void main() {
  testWidgets(
      'moves only selected pieces from the chosen location with a server preview',
      (tester) async {
    final requests = <Map<String, dynamic>>[];
    final units = <Map<String, dynamic>>[
      {
        'id': 'a',
        'revision': 'r1',
        'productName': 'Polo',
        'variantLabel': 'M',
        'customerName': 'Camille',
        'location': 'Jan',
        'saleStatus': 'not_ready',
        'finish': 'unembroidered'
      },
      {
        'id': 'b',
        'revision': 'r2',
        'productName': 'Bonnet',
        'variantLabel': 'OS',
        'customerName': 'Alex',
        'location': 'Jan',
        'saleStatus': 'not_ready',
        'finish': 'unembroidered'
      },
      {
        'id': 'c',
        'revision': 'r3',
        'productName': 'Sweat',
        'variantLabel': 'L',
        'customerName': 'Noa',
        'location': 'Jim',
        'saleStatus': 'not_ready',
        'finish': 'at_jim'
      },
    ];
    final service = BoutiqueOperationsService(transport: (request) async {
      requests.add(Map.of(request));
      if (request['action'] == 'list')
        return {'units': units, 'hasMore': false};
      if (request['action'] == 'move') {
        if (request['preview'] != true) {
          for (final u in units.where((u) =>
              (request['units'] as List).any((s) => s['id'] == u['id']))) {
            u['location'] = request['destination'];
          }
        }
        return {'count': (request['units'] as List).length};
      }
      throw StateError('unexpected');
    });
    final access = BoutiqueAccessService(
        firestore: FakeFirebaseFirestore(),
        authUserIds: () => Stream.value('rb1'));
    await tester.pumpWidget(MaterialApp(
        home: BoutiqueAccessScope(
            accessService: access,
            clubId: 'calypso',
            userId: 'rb1',
            child:
                BoutiqueLocationsScreen(clubId: 'calypso', service: service))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Jan'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Polo'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, 'Jim');
    tester.testTextInput.hide();
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Déplacer les pièces'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Déplacer les pièces'));
    await tester.pumpAndSettle();
    final moves = requests.where((r) => r['action'] == 'move').toList();
    expect(moves.length, 2);
    expect(moves.first['preview'], true);
    expect(moves.last['sourceLocation'], 'Jan');
    expect(moves.last['destination'], 'Jim');
    expect(moves.last['units'], [
      {'id': 'a', 'revision': 'r1'}
    ]);
    expect(moves.first['idempotencyKey'], moves.last['idempotencyKey']);
    expect(units[0]['location'], 'Jim');
    expect(units[1]['location'], 'Jan');
  });
}
