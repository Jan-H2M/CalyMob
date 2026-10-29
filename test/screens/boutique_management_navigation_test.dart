import 'dart:async';

import 'package:calymob/config/app_colors.dart';
import 'package:calymob/screens/boutique/boutique_management_screen.dart';
import 'package:calymob/services/boutique/boutique_access_service.dart';
import 'package:calymob/services/boutique/boutique_operations_service.dart';
import 'package:calymob/widgets/boutique/boutique_access_guard.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _Access extends BoutiqueAccessService {
  final Stream<BoutiqueAccessState>? states;
  _Access(this.states) : super(firestore: FakeFirebaseFirestore());
  @override
  Stream<BoutiqueAccessState> watchBoutiqueAccess(
          {required String clubId, required String userId}) =>
      states ?? Stream.value(_allowed);
}

const _allowed = BoutiqueAccessState(
    canAccess: true,
    visibility: {},
    member: {
      'member_status': 'active',
      'clubStatuten': ['RB']
    },
    qrEnabled: true);

void main() {
  late List<String> actions;
  late BoutiqueOperationsService operations;
  bool rejectOrders = false;
  bool showMission = false;
  final mission = {
    'id': 'fixture-mission',
    'destination': 'Piscine',
    'total': 1,
    'arrived': 1,
    'delivered': 0,
    'status': 'received',
    'pickupWindow': 'Créneau fictif',
    'assigneeNames': <String>[],
    'expiresAt': '2030-01-01T12:00:00Z',
    'allowPartial': false
  };
  final packet = {
    'orderNumber': 'FIXTURE-ORDER',
    'buyerName': 'Membre fictif',
    'buyerId': 'fixture-buyer',
    'ready': true,
    'remaining': 0,
    'units': [
      {
        'id': 'fixture-mission-piece',
        'productName': 'Polo fictif',
        'variantLabel': 'M · Bleu',
        'location': 'Piscine',
        'finish': 'returned_embroidered',
        'saleStatus': 'sale_ready'
      }
    ]
  };
  setUp(() {
    actions = [];
    rejectOrders = false;
    showMission = false;
    operations = BoutiqueOperationsService(transport: (request) async {
      actions.add(request['action'] as String);
      switch (request['action']) {
        case 'missions':
          return {
            'missions': [if (showMission) mission],
            'hasMore': false
          };
        case 'mission':
          return {
            'mission': mission,
            'units': packet['units'],
            'packets': [packet]
          };
        case 'list':
          return {
            'units': [
              {
                'id': 'fixture-piece',
                'location': 'Jim',
                'finish': 'at_jim',
                'saleStatus': 'not_ready'
              }
            ],
            'assignees': <Map<String, dynamic>>[],
            'hasMore': false
          };
        case 'orders':
          if (rejectOrders) {
            throw FirebaseFunctionsException(
                code: 'invalid-argument',
                message: 'Demande Boutique invalide.');
          }
          return {
            'orders': <Map<String, dynamic>>[],
            'hasMore': false,
            'nextCursor': null
          };
        default:
          fail('Unexpected operation while navigating: ${request['action']}');
      }
    });
  });

  Future<void> open(WidgetTester tester,
      {Stream<BoutiqueAccessState>? access,
      TargetPlatform platform = TargetPlatform.android}) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final service = _Access(access);
    await tester.pumpWidget(MaterialApp(
        theme: ThemeData(
            platform: platform,
            useMaterial3: true,
            appBarTheme: const AppBarTheme(
                foregroundColor: Colors.white,
                backgroundColor: Colors.transparent,
                iconTheme: IconThemeData(color: Colors.white))),
        home: Builder(
            builder: (context) => Scaffold(
                body: TextButton(
                    onPressed: () => Navigator.push(
                        context,
                        boutiqueAccessGuardedRoute<void>(
                            clubId: 'fixture',
                            testUserIdOverride: 'fixture-rb',
                            accessService: service,
                            requiredSection: 'gestion',
                            builder: (_) => BoutiqueManagementScreen(
                                manager: true, service: operations))),
                    child: const Text('Fixture home'))))));
    await tester.tap(find.text('Fixture home'));
    // Loading must remain navigable too: never settle an endless spinner.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
  }

  Future<void> openOrderPicker(WidgetTester tester) async {
    await tester.tap(find.text('Jim · 1'));
    await tester.pump();
    await tester.tap(find.text('Sélectionner un lot'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sélectionner une commande complète'));
    await tester.pumpAndSettle();
  }

  void expectVisibleNavigation(WidgetTester tester) {
    final bar = tester.widget<AppBar>(find.byType(AppBar));
    expect(bar.backgroundColor, AppColors.donkerblauw);
    expect(bar.foregroundColor, Colors.white);
    expect(bar.iconTheme?.color, Colors.white);
    expect(find.byType(BackButton), findsOneWidget);
    final contrast = (Colors.white.computeLuminance() + .05) /
        (AppColors.donkerblauw.computeLuminance() + .05);
    expect(contrast, greaterThan(4.5));
  }

  testWidgets('loading access keeps a visible back button and no data calls',
      (tester) async {
    final pending = StreamController<BoutiqueAccessState>();
    addTearDown(pending.close);
    await open(tester, access: pending.stream);
    expect(find.byKey(const Key('boutique-access-loading')), findsOneWidget);
    expectVisibleNavigation(tester);
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(find.text('Fixture home'), findsOneWidget);
    expect(actions, isEmpty);
  });

  testWidgets('access error fails closed but still allows returning',
      (tester) async {
    final pending = StreamController<BoutiqueAccessState>();
    addTearDown(pending.close);
    await open(tester, access: pending.stream);
    pending.addError(StateError('Fixture access failure'));
    await tester.pump();
    expect(
        find.byKey(const Key('boutique-access-unavailable')), findsOneWidget);
    expectVisibleNavigation(tester);
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(find.text('Fixture home'), findsOneWidget);
    expect(actions, isEmpty);
  });

  testWidgets(
      'management, session and empty order list return one level at a time',
      (tester) async {
    await open(tester);
    await tester.pumpAndSettle();
    expectVisibleNavigation(tester);
    expect(find.textContaining('leur lieu ou suivre leur finition'),
        findsOneWidget);
    await openOrderPicker(tester);
    expect(
        find.text('Aucune commande correspondante chargée.'), findsOneWidget);
    expectVisibleNavigation(tester);
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(find.text('Lieu et état du lot'), findsOneWidget);
    expect(find.textContaining('Le lieu et la finition sont distincts'),
        findsOneWidget);
    expectVisibleNavigation(tester);
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(find.text('Gestion Boutique'), findsOneWidget);
    expect(tester.widget<TextField>(find.byType(TextField)).controller?.text,
        'Jim');
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(find.text('Fixture home'), findsOneWidget);
    expect(actions.every((a) => ['missions', 'list', 'orders'].contains(a)),
        isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets('order-load failure is not an empty list and never traps back',
      (tester) async {
    rejectOrders = true;
    await open(tester);
    await tester.pumpAndSettle();
    await openOrderPicker(tester);
    expect(find.text('Demande Boutique invalide.'), findsOneWidget);
    expect(find.text('Aucune commande correspondante chargée.'), findsNothing);
    expectVisibleNavigation(tester);
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(find.text('1 · Sélection · 0/50 pièce(s)'), findsOneWidget);
    expect(actions.where((a) => a == 'orders').length, 1);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('Android system back unwinds a failed order picker and its parents',
      (tester) async {
    rejectOrders = true;
    await open(tester);
    await tester.pumpAndSettle();
    await openOrderPicker(tester);
    expect(find.text('Demande Boutique invalide.'), findsOneWidget);

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('Lieu et état du lot'), findsOneWidget);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('Gestion Boutique'), findsOneWidget);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('Fixture home'), findsOneWidget);
    expect(actions.every((a) => ['missions', 'list', 'orders'].contains(a)),
        isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets('iOS edge back unwinds a failed order picker without an operation',
      (tester) async {
    rejectOrders = true;
    await open(tester, platform: TargetPlatform.iOS);
    await tester.pumpAndSettle();
    await openOrderPicker(tester);
    expect(find.text('Demande Boutique invalide.'), findsOneWidget);

    Future<void> swipeBack() async {
      await tester.dragFrom(const Offset(1, 400), const Offset(350, 0));
      await tester.pumpAndSettle();
    }

    await swipeBack();
    expect(find.text('Lieu et état du lot'), findsOneWidget);
    await swipeBack();
    expect(find.text('Gestion Boutique'), findsOneWidget);
    await swipeBack();
    expect(find.text('Fixture home'), findsOneWidget);
    expect(actions.every((a) => ['missions', 'list', 'orders'].contains(a)),
        isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets('transport and handover retain app back without any operation',
      (tester) async {
    showMission = true;
    await open(tester);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Piscine · 1 pièce(s)'));
    await tester.tap(find.text('Piscine · 1 pièce(s)'));
    await tester.pumpAndSettle();
    expect(find.text('Transport et remises'), findsOneWidget);
    expectVisibleNavigation(tester);
    await tester.ensureVisible(find.text('Vérifier et remettre'));
    await tester.tap(find.text('Vérifier et remettre'));
    await tester.pumpAndSettle();
    expect(find.text('Remettre au membre'), findsOneWidget);
    expectVisibleNavigation(tester);
    expect(
        tester
            .widget<FilledButton>(
                find.widgetWithText(FilledButton, 'Confirmer la remise'))
            .onPressed,
        isNull);
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(find.text('Transport et remises'), findsOneWidget);
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(find.text('Gestion Boutique'), findsOneWidget);
    expect(actions.every((a) => ['missions', 'list', 'mission'].contains(a)),
        isTrue);
    await tester.pumpWidget(const SizedBox());
  });
}
