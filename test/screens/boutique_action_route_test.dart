import 'package:calymob/screens/boutique/boutique_screen.dart';
import 'package:calymob/services/boutique/boutique_access_service.dart';
import 'package:calymob/services/boutique/boutique_operations_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxdart/rxdart.dart';
import '../qa/boutique_action_first_preview.dart';

class _Access extends WizardQaAccess {
  final states =
      BehaviorSubject<BoutiqueAccessState>.seeded(const BoutiqueAccessState(
          canAccess: true,
          visibility: {
            'produits': 'masque',
            'panier': 'masque',
            'commandes': 'masque',
            'cotisation': 'masque',
            'pretsMateriel': 'masque'
          },
          member: {
            'member_status': 'active',
            'clubStatuten': ['RB']
          },
          qrEnabled: true));
  @override
  Stream<BoutiqueAccessState> watchBoutiqueAccess(
          {required String clubId, required String userId}) =>
      states.stream;
}

void main() {
  late LocalBoutiqueWizardStore store;
  late _Access access;
  late List<String> calls;
  setUp(() {
    store = LocalBoutiqueWizardStore();
    access = _Access();
    calls = [];
  });
  tearDown(() => access.states.close());
  Future<void> open(WidgetTester tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(MaterialApp(
        home: BoutiqueScreen(
      clubId: 'synthetic-boutique',
      testUserIdOverride: 'demo-rb',
      accessService: access,
      operationsService: BoutiqueOperationsService(transport: (request) {
        calls.add(request['action'] as String);
        if (request['action'] == 'missions') {
          return Future.value(
              {'missions': <Map<String, dynamic>>[], 'hasMore': false});
        }
        return store.call(request);
      }),
    )));
    // The Boutique hub deliberately runs a continuous ocean animation.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.text('Gestion Boutique'));
    await tester.pumpAndSettle();
  }

  Future<void> tap(WidgetTester tester, Finder finder) async {
    await tester.ensureVisible(finder);
    await tester.pumpAndSettle();
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  testWidgets(
      'the actual Boutique entry opens action before values or packages',
      (tester) async {
    await open(tester);
    expect(find.text('Que voulez-vous faire ?'), findsOneWidget);
    expect(find.text('Lieu actuel des pièces'), findsNothing);
    expect(find.text('Je suis à…'), findsNothing);
    expect(calls, ['list']);
    await tap(tester, find.text('Déplacer'));
    await tap(
        tester,
        find.widgetWithText(
            DropdownButtonFormField<String>, 'Lieu actuel des pièces'));
    await tap(tester, find.text('Jim').last);
    await tester.enterText(
        find.byKey(const Key('wizard-destination')), 'Piscine');
    await tap(tester, find.byKey(const Key('wizard-next')));
    expect(find.text('Choisissez les paquets'), findsOneWidget);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('Précisez votre action'), findsOneWidget);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('Que voulez-vous faire ?'), findsOneWidget);
    await tester.binding.handlePopRoute();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Boutique'), findsOneWidget);
    expect(store.applied, 0);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
      'shared missions remain reachable with the same service and guarded scope',
      (tester) async {
    await open(tester);
    await tap(tester, find.text('Transports et remises partagés'));
    expect(find.text('Aucune mission en cours.'), findsOneWidget);
    expect(find.text('Sélectionner un lot'), findsNothing);
    expect(calls, ['list', 'missions']);
    await tap(tester, find.byType(BackButton));
    expect(find.text('Que voulez-vous faire ?'), findsOneWidget);
    expect(store.applied, 0);
  });
  testWidgets(
      'revoking RB access disposes the real entry and its mission route',
      (tester) async {
    await open(tester);
    await tap(tester, find.text('Transports et remises partagés'));
    access.states.add(const BoutiqueAccessState(
        canAccess: false,
        visibility: {},
        member: {'member_status': 'inactive'},
        qrEnabled: false));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('boutique-access-unavailable')), findsWidgets);
    expect(find.text('Aucune mission en cours.'), findsNothing);
    expect(find.text('Que voulez-vous faire ?'), findsNothing);
    expect(calls.every((a) => ['list', 'missions'].contains(a)), isTrue);
    expect(store.applied, 0);
  });
}
