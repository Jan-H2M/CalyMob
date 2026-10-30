import 'package:calymob/screens/boutique/boutique_stock_session_screen.dart';
import 'package:calymob/services/boutique/boutique_access_service.dart';
import 'package:calymob/services/boutique/boutique_operations_service.dart';
import 'package:calymob/widgets/boutique/boutique_access_guard.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxdart/rxdart.dart';

class SelectionAccess extends BoutiqueAccessService {
  final states =
      BehaviorSubject<BoutiqueAccessState>.seeded(const BoutiqueAccessState(
          canAccess: true,
          visibility: {},
          member: {
            'member_status': 'active',
            'clubStatuten': ['RB']
          },
          qrEnabled: true));
  SelectionAccess() : super(firestore: FakeFirebaseFirestore());
  @override
  Stream<BoutiqueAccessState> watchBoutiqueAccess(
          {required String clubId, required String userId}) =>
      states.stream;
}

Map<String, dynamic> piece(String id) => {
      'id': id,
      'revision': 'qa-revision',
      'productName': 'Polo $id',
      'location': 'Jim',
      'saleStatus': 'not_ready',
      'finish': 'unembroidered',
    };
Map<String, dynamic> order(String id) => {
      'id': id,
      'orderNumber': 'QA-$id',
      'customerName': 'Membre fictif',
      'physicalCount': 2,
    };

void main() {
  late SelectionAccess access;
  late List<Map<String, dynamic>> requests;
  late BoutiqueOperationsService service;
  late int applies;
  bool ambiguous = false;
  Future<void> open(WidgetTester tester,
      {Size size = const Size(900, 1400)}) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(MaterialApp(
        home: BoutiqueAccessGuard(
            clubId: 'fixture',
            testUserIdOverride: 'qa-rb',
            accessService: access,
            requiredSection: 'gestion',
            builder: (_, __) => BoutiqueStockSessionScreen(
                clubId: 'fixture',
                location: 'Jim',
                assignees: const [],
                service: service))));
    await tester.pumpAndSettle();
  }

  Future<void> chooseOrder(WidgetTester tester, [String id = 'first']) async {
    await tester.ensureVisible(find.text('Sélectionner une commande complète'));
    await tester.tap(find.text('Sélectionner une commande complète'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('QA-$id'));
    await tester.pumpAndSettle();
  }

  Future<void> chooseAction(WidgetTester tester) async {
    await tester.ensureVisible(find.byType(DropdownButton<String>));
    await tester.tap(find.byType(DropdownButton<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Contrôler les articles sans broderie').last);
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
        find.text('Contrôle effectué · obligatoire'), 120,
        scrollable: find.byType(Scrollable).first);
    await tester.enterText(find.byType(TextField).last, 'Contrôle fictif');
  }

  setUp(() {
    access = SelectionAccess();
    requests = [];
    applies = 0;
    ambiguous = false;
    service = BoutiqueOperationsService(transport: (request) async {
      requests.add(Map.of(request));
      switch (request['action']) {
        case 'orders':
          return {
            'orders': [order(request['cursor'] == null ? 'first' : 'second')],
            'hasMore': request['cursor'] == null,
            'nextCursor': request['cursor'] == null ? 'qa-cursor' : null,
          };
        case 'orderSelection':
          return {
            'units': [piece('one'), piece('two')]
          };
        case 'lookup':
          return {'unit': piece(request['unitId'] as String)};
        default:
          if (request['preview'] != true) {
            applies++;
            if (ambiguous) {
              throw FirebaseFunctionsException(
                  code: 'unavailable', message: 'Réponse inconnue');
            }
          }
          return {
            'count': (request['units'] as List).length,
            'destination': 'Jim',
            'notificationCount': 0,
            'heldOrders': []
          };
      }
    });
  });
  tearDown(() => access.states.close());
  testWidgets(
      'selection comes first; whole order deduplicates, then all six actions remain explicit',
      (tester) async {
    await open(tester);
    expect(find.text('Action pour tout le lot'), findsNothing);
    expect(requests, isEmpty);
    await chooseOrder(tester);
    expect(find.text('Polo one'), findsOneWidget);
    expect(find.text('1 · Sélection · 2/50 pièce(s)'), findsOneWidget);
    expect(find.text('Choisir une action'), findsOneWidget);
    expect(applies, 0);
    await chooseOrder(tester);
    expect(find.text('1 · Sélection · 2/50 pièce(s)'), findsOneWidget);
    await tester.tap(find.byType(DropdownButton<String>));
    await tester.pumpAndSettle();
    expect(find.text('Changer de lieu'), findsOneWidget);
    expect(find.text('Préparer le départ chez Jim'), findsOneWidget);
    expect(find.text('Confirmer l’arrivée chez Jim'), findsOneWidget);
    expect(find.text('Broderie terminée chez Jim'), findsOneWidget);
    expect(find.text('Contrôler les articles sans broderie'), findsOneWidget);
    expect(
        find.text('Confier un transport / point d’enlèvement'), findsOneWidget);
    expect(
        requests
            .every((r) => ['orders', 'orderSelection'].contains(r['action'])),
        isTrue);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets(
      'preview cancellation never writes; explicit confirmation retains actor and revisions',
      (tester) async {
    await open(tester);
    await chooseOrder(tester);
    await chooseAction(tester);
    await tester.ensureVisible(find.text('Vérifier et confirmer le lot'));
    await tester.tap(find.text('Vérifier et confirmer le lot'));
    await tester.pumpAndSettle();
    expect(applies, 0);
    await tester.tap(find.text('Revoir'));
    await tester.pumpAndSettle();
    expect(applies, 0);
    await tester.tap(find.text('Vérifier et confirmer le lot'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Confirmer le lot'));
    await tester.pumpAndSettle();
    expect(applies, 1);
    final write = requests.last;
    expect(write['action'], 'reviewPlain');
    expect(write['expectedActorId'], 'qa-rb');
    expect(write['units'], [
      {'id': 'one', 'revision': 'qa-revision'},
      {'id': 'two', 'revision': 'qa-revision'}
    ]);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets(
      'unknown confirmation keeps selection locked and retries exact identity',
      (tester) async {
    ambiguous = true;
    await open(tester);
    await chooseOrder(tester);
    await chooseAction(tester);
    await tester.ensureVisible(find.text('Vérifier et confirmer le lot'));
    await tester.tap(find.text('Vérifier et confirmer le lot'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Confirmer le lot'));
    await tester.pumpAndSettle();
    final first = Map.of(requests.last);
    expect(
        tester
            .widget<OutlinedButton>(find.widgetWithText(
                OutlinedButton, 'Sélectionner une commande complète'))
            .onPressed,
        isNull);
    await tester
        .ensureVisible(find.text('Vérifier la confirmation en attente'));
    await tester.tap(find.text('Vérifier la confirmation en attente'));
    await tester.pumpAndSettle();
    expect(requests.last, first);
    expect(applies, 2);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets(
      'order pages remain reachable and RB withdrawal closes the guarded picker',
      (tester) async {
    await open(tester);
    await tester.tap(find.text('Sélectionner une commande complète'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Charger les commandes suivantes'));
    await tester.pumpAndSettle();
    expect(find.text('QA-first'), findsOneWidget);
    expect(find.text('QA-second'), findsOneWidget);
    expect(requests.last['cursor'], 'qa-cursor');
    access.states.add(const BoutiqueAccessState(
        canAccess: false,
        visibility: {},
        member: {'member_status': 'active', 'clubStatuten': []},
        qrEnabled: true));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('boutique-access-unavailable')), findsWidgets);
    expect(requests.where((r) => r['action'] == 'orderSelection'), isEmpty);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets(
      'changing selection clears the action rather than silently reusing it',
      (tester) async {
    await open(tester);
    await chooseOrder(tester);
    await chooseAction(tester);
    await tester.tap(find.byTooltip('Retirer du lot').first);
    await tester.pumpAndSettle();
    expect(find.text('Choisir une action'), findsOneWidget);
    expect(applies, 0);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets(
      '390px phone layout can select, choose an action and review without overflow',
      (tester) async {
    await open(tester, size: const Size(390, 844));
    await chooseOrder(tester);
    await chooseAction(tester);
    await tester.scrollUntilVisible(
        find.text('Vérifier et confirmer le lot'), 180,
        scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Vérifier et confirmer le lot'));
    await tester.pumpAndSettle();
    expect(find.text('Confirmer le lot'), findsOneWidget);
    expect(tester.takeException(), isNull);
    expect(applies, 0);
    await tester.tap(find.text('Revoir'));
    await tester.pumpAndSettle();
    await tester.pumpWidget(const SizedBox());
  });
}
