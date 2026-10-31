import 'package:calymob/screens/boutique/member_missions_screen.dart';
import 'package:calymob/services/boutique/member_missions_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final row = {
    'id': 'piece-1',
    'batchId': 'batch-1',
    'article': 'Bonnet DEV',
    'size': 'M',
    'recipient': 'Membre DEV',
    'orderedAt': '2026-10-31T05:38:00Z',
    'status': 'ordered',
    'allowedNext': ['in_progress', 'handed_over']
  };
  testWidgets(
      'per-piece task, cancellation does not write, successful handoff refreshes',
      (tester) async {
    var complete = false;
    final writes = <Map<String, dynamic>>[];
    final service = MemberMissionsService(transport: (request) async {
      if (request['action'] == 'update') {
        writes.add(request);
        complete = true;
      }
      return {
        'version': 1,
        'eligible': true,
        'missions': complete ? [] : [row]
      };
    });
    await tester
        .pumpWidget(MaterialApp(home: MemberMissionsScreen(service: service)));
    await tester.pumpAndSettle();
    expect(find.text('1 × Bonnet DEV · M'), findsOneWidget);
    expect(find.text('Pour : Membre DEV'), findsOneWidget);
    await tester.tap(find.text('Remis / Afgeleverd'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Annuler'));
    await tester.pumpAndSettle();
    expect(writes, isEmpty);
    await tester.tap(find.text('Remis / Afgeleverd'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Piscine DEV');
    await tester.tap(find.text('Confirmer Remis'));
    await tester.pumpAndSettle();
    expect(writes.single['location'], 'Piscine DEV');
    expect(writes.single['expectedStatus'], 'ordered');
    expect(find.textContaining('Aucune mission ouverte'), findsOneWidget);
  });
  testWidgets(
      'failed check-off never shows completion and clears stale actions',
      (tester) async {
    final service = MemberMissionsService(transport: (request) async {
      if (request['action'] == 'update')
        throw const MemberMissionsException('own_assignment_required');
      return {
        'version': 1,
        'eligible': true,
        'missions': [row]
      };
    });
    await tester
        .pumpWidget(MaterialApp(home: MemberMissionsScreen(service: service)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('En cours'));
    await tester.pumpAndSettle();
    expect(
        find.text('Cette mission ne vous est plus attribuée.'), findsOneWidget);
    expect(find.text('Remis / Afgeleverd'), findsNothing);
    expect(find.text('Actualiser'), findsOneWidget);
  });
}
