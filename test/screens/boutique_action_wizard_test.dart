import 'dart:async';
import 'dart:convert';
import 'package:calymob/models/boutique/boutique_physical_unit.dart';
import 'package:calymob/models/boutique/boutique_unit_qr.dart';
import 'package:calymob/services/boutique/boutique_operations_service.dart';
import 'package:calymob/screens/boutique/boutique_action_wizard_screen.dart';
import 'package:calymob/services/boutique/boutique_access_service.dart';
import 'package:calymob/widgets/boutique/boutique_access_guard.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rxdart/rxdart.dart';
import '../qa/boutique_action_first_preview.dart';

class Access extends WizardQaAccess {
  final states =
      BehaviorSubject<BoutiqueAccessState>.seeded(const BoutiqueAccessState(
          canAccess: true,
          visibility: {},
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
  late Access access;
  BoutiqueOperationsService? customService;
  Widget Function(Future<String> Function(String))? scanner;
  setUp(() {
    store = LocalBoutiqueWizardStore();
    access = Access();
    customService = null;
    scanner = null;
  });
  tearDown(() => access.states.close());
  Future<void> open(WidgetTester tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(MaterialApp(
        home: Builder(
            builder: (context) => Scaffold(
                body: TextButton(
                    onPressed: () => Navigator.push(
                        context,
                        MaterialPageRoute<void>(
                            builder: (_) => BoutiqueAccessGuard(
                                clubId: 'synthetic-boutique',
                                testUserIdOverride: 'demo-rb',
                                accessService: access,
                                requiredSection: 'gestion',
                                builder: (_, __) => BoutiqueActionWizardScreen(
                                    clubId: 'synthetic-boutique',
                                    service: customService ?? store.service,
                                    scannerBuilder: (scan) =>
                                        scanner?.call(scan) ??
                                        SyntheticQrEntry(scan))))),
                    child: const Text('QA home'))))));
    await tester.tap(find.text('QA home'));
    await tester.pumpAndSettle();
  }

  Future<void> tap(WidgetTester tester, Finder finder) async {
    await tester.ensureVisible(finder);
    await tester.pumpAndSettle();
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  Future<void> select(WidgetTester tester, String label, String value) async {
    await tap(
        tester, find.widgetWithText(DropdownButtonFormField<String>, label));
    await tap(tester, find.text(value).last);
  }

  Future<void> startMove(WidgetTester tester) async {
    await tap(tester, find.text('Déplacer'));
    await select(tester, 'Lieu actuel des pièces', 'Jim');
    await tester.enterText(
        find.byKey(const Key('wizard-destination')), 'Piscine');
    await tap(tester, find.byKey(const Key('wizard-next')));
  }

  Future<void> selectAll(WidgetTester tester) =>
      tap(tester, find.text('Tout sélectionner · liste affichée'));
  Future<void> review(WidgetTester tester) =>
      tap(tester, find.byKey(const Key('wizard-next')));

  void seedPieces(int count) {
    final template = Map<String, dynamic>.of(store.units['polo-a']!);
    store.units.clear();
    for (var i = 0; i < count; i++) {
      store.units['demo-$i'] = {...template, 'id': 'demo-$i'};
    }
  }

  testWidgets('preserves the deployed 100-piece move-only limit',
      (tester) async {
    seedPieces(100);
    await open(tester);
    await startMove(tester);
    await selectAll(tester);
    expect(find.textContaining('100 pièce(s) sélectionnée(s)'), findsOneWidget);
    await review(tester);
    expect(find.text('Vérifiez avant de confirmer'), findsOneWidget);
    await tap(tester, find.byKey(const Key('wizard-next')));
    expect(find.text('Lot enregistré'), findsOneWidget);
    expect(store.applied, 1);
    expect(store.units.values.every((u) => u['location'] == 'Piscine'), isTrue);
  });
  testWidgets('over-limit selection is rejected atomically, never truncated',
      (tester) async {
    seedPieces(101);
    await open(tester);
    await startMove(tester);
    await selectAll(tester);
    expect(find.textContaining('100 pièces maximum par lot'), findsOneWidget);
    expect(find.textContaining('0 pièce(s) sélectionnée(s)'), findsOneWidget);
    expect(store.applied, 0);
    expect(store.requests.any((r) => r['preview'] == true), isFalse);
  });

  testWidgets(
      'action then values then packages; preview never applies; move preserves finish and customer',
      (tester) async {
    await open(tester);
    expect(find.text('Que voulez-vous faire ?'), findsOneWidget);
    expect(find.text('Lieu actuel des pièces'), findsNothing);
    expect(store.requests.every((r) => r['action'] == 'list'), isTrue);
    await startMove(tester);
    await selectAll(tester);
    expect(find.textContaining('3 pièce(s) sélectionnée(s)'), findsOneWidget);
    await review(tester);
    expect(find.text('Vérifiez avant de confirmer'), findsOneWidget);
    expect(find.text('Inchangée pour chaque pièce'), findsOneWidget);
    expect(store.applied, 0);
    final oldFinish = store.units['polo-a']!['finish'];
    final oldCustomer = store.units['polo-a']!['customerOrderId'];
    await tap(tester, find.byKey(const Key('wizard-next')));
    expect(find.text('Lot enregistré'), findsOneWidget);
    expect(store.applied, 1);
    expect(store.units['polo-a']!['location'], 'Piscine');
    expect(store.units['polo-a']!['finish'], oldFinish);
    expect(store.units['polo-a']!['customerOrderId'], oldCustomer);
    expect(tester.takeException(), isNull);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('QA home'), findsOneWidget);
  });
  testWidgets(
      'back retains values and selection; system back unwinds all four steps',
      (tester) async {
    await open(tester);
    await startMove(tester);
    await selectAll(tester);
    await tap(tester, find.widgetWithText(OutlinedButton, 'Retour'));
    expect(find.text('Précisez votre action'), findsOneWidget);
    expect(
        tester
            .widget<TextField>(find.byKey(const Key('wizard-destination')))
            .controller!
            .text,
        'Piscine');
    await tap(tester, find.byKey(const Key('wizard-next')));
    expect(find.textContaining('3 pièce(s) sélectionnée(s)'), findsOneWidget);
    await review(tester);
    for (final title in [
      'Choisissez les paquets',
      'Précisez votre action',
      'Que voulez-vous faire ?',
      'QA home'
    ]) {
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.text(title), findsOneWidget);
    }
    expect(store.applied, 0);
  });
  testWidgets(
      'finishing requires a control note; incompatible pieces remain excluded; no move',
      (tester) async {
    await open(tester);
    await tap(tester, find.text('Statut / finition'));
    await select(tester, 'Action', 'Broderie terminée chez Jim');
    await select(tester, 'Lieu actuel des pièces', 'Jim');
    await tap(tester, find.byKey(const Key('wizard-next')));
    expect(find.byKey(const Key('wizard-error')), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('wizard-note')));
    await tester.enterText(find.byKey(const Key('wizard-note')),
        'Broderie contrôlée en démonstration');
    await tap(tester, find.byKey(const Key('wizard-next')));
    await selectAll(tester);
    expect(find.textContaining('2 pièce(s) sélectionnée(s)'), findsOneWidget);
    await review(tester);
    expect(find.text('Jim · inchangé'), findsOneWidget);
    await tap(tester, find.byKey(const Key('wizard-next')));
    expect(store.applied, 1);
    expect(store.units['polo-a']!['workshopReady'], isTrue);
    expect(store.units['polo-a']!['location'], 'Jim');
    expect(store.units['polo-a']!['finish'], 'at_jim');
    expect(store.units['transit-b']!['workshopReady'], isFalse);
  });
  testWidgets(
      'unknown response locks values and retries exactly the same identity once',
      (tester) async {
    store = LocalBoutiqueWizardStore(ambiguous: true);
    await open(tester);
    await startMove(tester);
    await selectAll(tester);
    await review(tester);
    await tap(tester, find.byKey(const Key('wizard-next')));
    expect(store.applied, 1);
    expect(find.textContaining('Réponse encore inconnue'), findsOneWidget);
    expect(
        tester
            .widget<OutlinedButton>(
                find.widgetWithText(OutlinedButton, 'Retour'))
            .onPressed,
        isNull);
    await tap(tester, find.byKey(const Key('wizard-next')));
    expect(store.applied, 1);
    expect(find.text('Lot enregistré'), findsOneWidget);
    final calls = store.requests
        .where((r) => r['action'] == 'move' && r['preview'] != true)
        .toList();
    expect(calls, hasLength(2));
    expect(jsonEncode(calls[0]), jsonEncode(calls[1]));
  });
  testWidgets(
      'supplier receipt returns a subset to the same action before review',
      (tester) async {
    for (final unit in store.units.values) {
      unit['supplierBatchId'] = 'synthetic-receipt';
      unit['supplierOrderReference'] = 'Réception fictive';
    }
    await open(tester);
    await startMove(tester);
    await tap(tester, find.text('Ajouter une réception fournisseur'));
    await select(tester, 'Réception fournisseur', 'Réception fictive');
    await tap(tester, find.text('Tout sélectionner'));
    await tap(tester, find.text('Ajouter la sélection (3)'));
    expect(find.text('Choisissez les paquets'), findsOneWidget);
    expect(find.textContaining('3 pièce(s) sélectionnée(s)'), findsOneWidget);
    expect(store.applied, 0);
    await review(tester);
    expect(find.text('Vérifiez avant de confirmer'), findsOneWidget);
    expect(store.applied, 0);
    await tap(tester, find.byKey(const Key('wizard-next')));
    expect(store.applied, 1);
    expect(store.units['polo-a']!['location'], 'Piscine');
    expect(store.units['polo-a']!['finish'], 'at_jim');
    expect(store.units['transit-b']!['location'], 'Jim');
  });
  testWidgets('a changed physical unit is rejected on review, without an apply',
      (tester) async {
    await open(tester);
    await startMove(tester);
    await selectAll(tester);
    store.units['polo-a']!['location'] = 'Réserve';
    await review(tester);
    expect(find.text('Choisissez les paquets'), findsOneWidget);
    expect(find.byKey(const Key('wizard-error')), findsOneWidget);
    expect(store.applied, 0);
  });
  testWidgets('a late scan cannot erase a pending confirmation or its retry',
      (tester) async {
    store = LocalBoutiqueWizardStore(ambiguous: true);
    final lookup = Completer<Map<String, dynamic>>();
    customService = BoutiqueOperationsService(transport: (request) {
      if (request['action'] == 'lookup' && request['unitId'] == 'bonnet-b') {
        return lookup.future;
      }
      return store.call(request);
    });
    Future<String> Function(String)? scan;
    scanner = (callback) {
      scan = callback;
      return const Scaffold(body: Text('Delayed scanner'));
    };
    await open(tester);
    await startMove(tester);
    await tap(tester, find.byType(Checkbox).first);
    expect(find.textContaining('2 pièce(s) sélectionnée(s)'), findsOneWidget);
    await tap(tester, find.text('Scanner des pièces · facultatif'));
    final pendingScan = scan!(
        const BoutiqueUnitQr(clubId: 'synthetic-boutique', unitId: 'bonnet-b')
            .url);
    final rejected = expectLater(pendingScan, throwsA(isA<FormatException>()));
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    await review(tester);
    await tap(tester, find.byKey(const Key('wizard-next')));
    expect(store.applied, 1);
    expect(find.textContaining('Réponse encore inconnue'), findsOneWidget);
    lookup.complete({'unit': Map.of(store.units['bonnet-b']!)});
    await rejected;
    await tester.pumpAndSettle();
    expect(find.textContaining('2 pièce(s) sélectionnée(s)'), findsOneWidget);
    await tap(tester, find.byKey(const Key('wizard-next')));
    expect(find.text('Lot enregistré'), findsOneWidget);
    expect(store.applied, 1);
    final calls = store.requests
        .where((r) => r['action'] == 'move' && r['preview'] != true)
        .toList();
    expect(calls, hasLength(2));
    expect(jsonEncode(calls[0]), jsonEncode(calls[1]));
    expect(store.units['bonnet-b']!['location'], 'Jim');
  });
  testWidgets('rapid duplicate review callbacks start only one preview',
      (tester) async {
    final lookup = Completer<Map<String, dynamic>>();
    var lookupStarts = 0;
    customService = BoutiqueOperationsService(transport: (request) {
      if (request['action'] == 'lookup' && request['unitId'] == 'polo-a') {
        lookupStarts++;
        return lookup.future;
      }
      return store.call(request);
    });
    await open(tester);
    await startMove(tester);
    await selectAll(tester);
    final reviewCallback = tester
        .widget<FilledButton>(find.byKey(const Key('wizard-next')))
        .onPressed!;
    reviewCallback();
    reviewCallback();
    expect(lookupStarts, 1);
    lookup.complete({'unit': Map.of(store.units['polo-a']!)});
    await tester.pumpAndSettle();
    expect(find.text('Vérifiez avant de confirmer'), findsOneWidget);
    expect(store.requests.where((r) => r['preview'] == true), hasLength(1));
    expect(store.applied, 0);
  });
  testWidgets('reopening the same category preserves its specific action',
      (tester) async {
    await open(tester);
    await tap(tester, find.text('Statut / finition'));
    await select(tester, 'Action', 'Broderie terminée chez Jim');
    await select(tester, 'Lieu actuel des pièces', 'Jim');
    await tester.enterText(find.byKey(const Key('wizard-note')), 'Contrôlé');
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    await tap(tester, find.text('Statut / finition'));
    expect(find.text('Broderie terminée chez Jim'), findsWidgets);
    expect(
        tester
            .widget<TextField>(find.byKey(const Key('wizard-note')))
            .controller!
            .text,
        'Contrôlé');
    expect(store.applied, 0);
  });
  testWidgets(
      'permission withdrawal removes a prepared confirmation before an apply',
      (tester) async {
    await open(tester);
    await startMove(tester);
    await selectAll(tester);
    await review(tester);
    access.states.add(const BoutiqueAccessState(
        canAccess: false,
        visibility: {},
        member: {'member_status': 'inactive'},
        qrEnabled: false));
    await tester.pumpAndSettle();
    expect(
        find.byKey(const Key('boutique-access-unavailable')), findsOneWidget);
    expect(find.byKey(const Key('wizard-next')), findsNothing);
    expect(store.applied, 0);
  });
  testWidgets(
      'optional synthetic QR uses the real contract and rejects duplicate pieces',
      (tester) async {
    await open(tester);
    await startMove(tester);
    await tap(tester, find.text('Scanner des pièces · facultatif'));
    await tap(tester, find.text('QR · polo-a'));
    expect(find.text('1 pièce(s) sélectionnée(s)'), findsOneWidget);
    await tap(tester, find.text('QR · polo-a'));
    expect(find.text('Cette pièce est déjà sélectionnée.'), findsOneWidget);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.textContaining('1 pièce(s) sélectionnée(s)'), findsOneWidget);
    expect(store.applied, 0);
  });
  test(
      'a required or unknown embroidery requirement cannot bypass plain review',
      () {
    for (final value in [true, null]) {
      final unit = BoutiquePhysicalUnit({
        'id': 'x',
        'revision': '1',
        'location': 'Réserve',
        'finish': 'unembroidered',
        'requiresEmbroidery': value
      });
      expect(boutiqueBatchBlockedReason(unit, 'reviewPlain', 'Réserve'),
          isNotNull);
    }
  });
}
