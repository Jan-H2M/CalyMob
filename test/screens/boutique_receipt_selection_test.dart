import 'package:rxdart/rxdart.dart';
import 'package:calymob/screens/boutique/boutique_receipt_selection_screen.dart';
import 'package:calymob/screens/boutique/boutique_management_screen.dart';
import 'package:calymob/services/boutique/boutique_access_service.dart';
import 'package:calymob/services/boutique/boutique_operations_service.dart';
import 'package:calymob/widgets/boutique/boutique_access_guard.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class ReceiptQaAccess extends BoutiqueAccessService {
  final states =
      BehaviorSubject<BoutiqueAccessState>.seeded(const BoutiqueAccessState(
          canAccess: true,
          visibility: {},
          member: {
            'member_status': 'active',
            'clubStatuten': ['RB']
          },
          qrEnabled: true));
  ReceiptQaAccess() : super(firestore: FakeFirebaseFirestore());
  @override
  Stream<BoutiqueAccessState> watchBoutiqueAccess(
          {required String clubId, required String userId}) =>
      states.stream;
}

Map<String, dynamic> piece(String id,
        {String location = 'Jan',
        String batch = 'batch',
        bool transit = false}) =>
    {
      'id': id,
      'revision': 'revision-$id',
      'supplierBatchId': batch,
      'supplierOrderReference': batch == 'batch' ? 'W-QA' : 'W-OTHER',
      'location': location,
      'productName': 'Polo $id',
      'variantLabel': 'M',
      'finish': 'unembroidered',
      'saleStatus': 'not_ready',
      if (transit) 'transportMissionId': 'task'
    };
Future<void> choose(WidgetTester tester) async {
  await tester.tap(find.byType(DropdownButtonFormField<String>));
  await tester.pumpAndSettle();
  await tester.tap(find.text('W-QA').last);
  await tester.pumpAndSettle();
}

void main() {
  Future<ReceiptQaAccess> mount(
      WidgetTester tester, BoutiqueOperationsService service) async {
    final access = ReceiptQaAccess();
    addTearDown(access.states.close);
    await tester.pumpWidget(MaterialApp(
        home: BoutiqueAccessGuard(
            accessService: access,
            clubId: 'fixture',
            testUserIdOverride: 'qa-rb',
            requiredSection: 'gestion',
            builder: (_, __) => BoutiqueReceiptSelectionScreen(
                clubId: 'fixture', location: 'Jan', service: service))));
    await tester.pumpAndSettle();
    return access;
  }

  testWidgets('manager can open receipt selection from Gestion Boutique at Jan',
      (tester) async {
    final access = ReceiptQaAccess();
    addTearDown(access.states.close);
    final service = BoutiqueOperationsService(
        transport: (r) async => r['action'] == 'missions'
            ? {'missions': [], 'hasMore': false}
            : {
                'units': [piece('one')],
                'hasMore': false,
                'assignees': []
              });
    await tester.pumpWidget(MaterialApp(
        home: BoutiqueAccessGuard(
            accessService: access,
            clubId: 'fixture',
            testUserIdOverride: 'qa-rb',
            requiredSection: 'gestion',
            builder: (_, __) =>
                BoutiqueManagementScreen(manager: true, service: service))));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Je suis à…'), 'Jan');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Choisir une réception · sans scanner'));
    await tester.pumpAndSettle();
    expect(find.text('Choisir une réception'), findsOneWidget);
    expect(find.text('Lieu actuel : Jan'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets(
      'complete receipt without scans, deselect one, preview and commit only the chosen IDs',
      (tester) async {
    final calls = <Map<String, dynamic>>[];
    final service = BoutiqueOperationsService(transport: (r) async {
      calls.add(r);
      if (r['action'] == 'list')
        return {
          'units': [
            piece('one'),
            piece('two'),
            piece('three'),
            piece('elsewhere', location: 'Jim'),
            piece('locked', transit: true),
            piece('other', batch: 'other')
          ],
          'hasMore': false
        };
      return {'count': 2, 'destination': 'Jim', 'notificationCount': 0};
    });
    await mount(tester, service);
    await choose(tester);
    expect(find.text('4 pièce(s) à Jan · 1 ailleurs'), findsOneWidget);
    await tester.tap(find.text('Tout sélectionner'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('receipt-piece-two')));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
        find.byKey(const ValueKey('receipt-piece-locked')), 180);
    final locked = tester.widget<CheckboxListTile>(
        find.byKey(const ValueKey('receipt-piece-locked')));
    expect(locked.value, false);
    expect(locked.onChanged, isNull);
    await tester.ensureVisible(find.text('Déplacer la sélection (2)'));
    await tester.tap(find.text('Déplacer la sélection (2)'));
    await tester.pumpAndSettle();
    expect(find.text('Scanner les fiches articles'), findsNothing);
    expect(find.text('Polo one'), findsOneWidget);
    expect(find.text('Polo two'), findsNothing);
    await tester.enterText(
        find.widgetWithText(TextField, 'Lieu de destination'), 'Jim');
    await tester.ensureVisible(find.text('Vérifier et confirmer le lot'));
    await tester.tap(find.text('Vérifier et confirmer le lot'));
    await tester.pumpAndSettle();
    final preview = calls.last;
    expect(preview['preview'], true);
    expect(preview['action'], 'move');
    expect(preview['units'], [
      {'id': 'one', 'revision': 'revision-one'},
      {'id': 'three', 'revision': 'revision-three'}
    ]);
    expect(preview['sourceLocation'], 'Jan');
    expect(preview['destination'], 'Jim');
    expect(preview['expectedActorId'], 'qa-rb');
    expect(calls.where((r) => r['action'] == 'move' && r['preview'] != true),
        isEmpty);
    await tester.tap(find.text('Confirmer le lot'));
    await tester.pumpAndSettle();
    final commit =
        calls.singleWhere((r) => r['action'] == 'move' && r['preview'] != true);
    expect(commit['units'], preview['units']);
    expect(commit['idempotencyKey'], preview['idempotencyKey']);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets(
      'none, individual selection, refresh and receipt switch clear previous selection',
      (tester) async {
    final service = BoutiqueOperationsService(
        transport: (_) async => {
              'units': [
                piece('one'),
                piece('two'),
                piece('other', batch: 'other')
              ],
              'hasMore': false
            });
    await mount(tester, service);
    await choose(tester);
    await tester.tap(find.text('Tout sélectionner'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Tout désélectionner'));
    await tester.pumpAndSettle();
    expect(find.text('0 pièce(s) sélectionnée(s)'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('receipt-piece-one')));
    await tester.pumpAndSettle();
    expect(find.text('1 pièce(s) sélectionnée(s)'), findsOneWidget);
    await tester.tap(find.byTooltip('Actualiser'));
    await tester.pumpAndSettle();
    expect(find.text('0 pièce(s) sélectionnée(s)'), findsOneWidget);
    await tester.tap(find.text('Tout sélectionner'));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(DropdownButtonFormField<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('W-OTHER').last);
    await tester.pumpAndSettle();
    expect(find.text('0 pièce(s) sélectionnée(s)'), findsOneWidget);
    await choose(tester);
    expect(find.text('0 pièce(s) sélectionnée(s)'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets('revocation removes selection route and cannot offer a move',
      (tester) async {
    final service = BoutiqueOperationsService(
        transport: (_) async => {
              'units': [piece('one')],
              'hasMore': false
            });
    final access = await mount(tester, service);
    await choose(tester);
    await tester.tap(find.text('Tout sélectionner'));
    await tester.pumpAndSettle();
    access.states.add(const BoutiqueAccessState(
        canAccess: false,
        visibility: {},
        member: {'member_status': 'active', 'clubStatuten': []},
        qrEnabled: false));
    await tester.pumpAndSettle();
    expect(find.text('Déplacer la sélection (1)'), findsNothing);
    expect(
        find.byKey(const Key('boutique-access-unavailable')), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });
}
