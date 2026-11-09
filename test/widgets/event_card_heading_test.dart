import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/services.dart';
import 'package:calymob/widgets/event_card_heading.dart';
import 'package:calymob/models/activity_item.dart';
import 'package:calymob/models/piscine_session.dart';
import 'package:calymob/models/operation.dart';
import 'package:calymob/models/event_card_appearance.dart';
import 'package:calymob/providers/activity_provider.dart';
import 'package:calymob/providers/auth_provider.dart';
import 'package:calymob/providers/member_provider.dart';
import 'package:calymob/providers/unread_count_provider.dart';
import 'package:calymob/screens/operations/operations_list_screen.dart';
import 'package:firebase_auth/firebase_auth.dart' show User;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

class Activities extends ChangeNotifier implements ActivityProvider {
  final activities = [
    ActivityItem.fromPiscineSession(PiscineSession(
        id: 'synthetic-pool',
        operationId: 'synthetic-pool-op',
        date: DateTime(2026, 12, 8, 20, 30),
        lieu: 'Piscine',
        horaireDebut: '20:30',
        horaireFin: '22:30',
        accueil: [],
        baptemes: [],
        gonflage: {},
        niveaux: {},
        statut: 'publie',
        createdAt: DateTime(2026),
        updatedAt: DateTime(2026),
        createdBy: 'synthetic',
        cardAppearance: const EventCardAppearance(theme: 'sinterklaas'))),
    ActivityItem.fromOperation(Operation(
        id: 'synthetic-christmas',
        type: 'evenement',
        categorie: 'sortie',
        titre: 'Légendaire tartiflette du Calypso',
        montantPrevu: 0,
        statut: 'ouvert',
        dateDebut: DateTime(2026, 12, 17, 20),
        createdAt: DateTime(2026),
        updatedAt: DateTime(2026),
        cardAppearance: const EventCardAppearance(theme: 'christmas'))),
    ActivityItem.fromOperation(Operation(
        id: 'synthetic-party',
        type: 'evenement',
        categorie: 'sortie',
        titre: 'CALYFIESTA – SAVE THE DATE !',
        montantPrevu: 0,
        statut: 'ouvert',
        dateDebut: DateTime(2027, 3, 20, 20),
        createdAt: DateTime(2026),
        updatedAt: DateTime(2026),
        priceTbd: true,
        cardAppearance: const EventCardAppearance(theme: 'disco')))
  ];
  bool get includePast => false;
  bool get isLoading => false;
  bool get isLoadStalled => false;
  String? get errorMessage => null;
  void listenToActivities(String clubId, {String? currentUserId}) {}
  dynamic noSuchMethod(Invocation i) => super.noSuchMethod(i);
}

class Auth extends ChangeNotifier implements AuthProvider {
  User? get currentUser => null;
  dynamic noSuchMethod(Invocation i) => super.noSuchMethod(i);
}

class Member extends ChangeNotifier implements MemberProvider {
  bool get canCreateEvents => false;
  dynamic noSuchMethod(Invocation i) => super.noSuchMethod(i);
}

class Unread extends ChangeNotifier implements UnreadCountProvider {
  bool get usesCursorReadState => false;
  bool get isCursorReady => false;
  dynamic noSuchMethod(Invocation i) => super.noSuchMethod(i);
}

void main() {
  setUpAll(() async {
    var sdk = File(Platform.resolvedExecutable).parent;
    while (
        !File('${sdk.path}/bin/cache/artifacts/material_fonts/Roboto-Regular.ttf')
                .existsSync() &&
            sdk.parent.path != sdk.path) {
      sdk = sdk.parent;
    }
    final font = FontLoader('Roboto')
      ..addFont(File(
              '${sdk.path}/bin/cache/artifacts/material_fonts/Roboto-Regular.ttf')
          .readAsBytes()
          .then((bytes) => ByteData.sublistView(bytes)));
    await font.load();
  });
  for (final width in [375.0, 402.0, 430.0]) {
    for (final scale in [1.0, 1.3]) {
      testWidgets(
          'complete event cards at iPhone width $width and text scale $scale',
          (tester) async {
        await initializeDateFormatting('fr_FR');
        tester.view.physicalSize = Size(width, 874);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.pumpWidget(MultiProvider(
            providers: [
              ChangeNotifierProvider<ActivityProvider>(
                  create: (_) => Activities()),
              ChangeNotifierProvider<AuthProvider>(create: (_) => Auth()),
              ChangeNotifierProvider<MemberProvider>(create: (_) => Member()),
              ChangeNotifierProvider<UnreadCountProvider>(
                  create: (_) => Unread()),
            ],
            child: MaterialApp(
                theme: ThemeData(fontFamily: 'Roboto'),
                builder: (context, child) => MediaQuery(
                    data: MediaQuery.of(context)
                        .copyWith(textScaler: TextScaler.linear(scale)),
                    child: child!),
                home: const OperationsListScreen())));
        await tester.pump();
        final activities = tester
            .element(find.byType(OperationsListScreen))
            .read<ActivityProvider>()
            .activities;
        for (final item in activities) {
          final card = find.byKey(ValueKey('activity-card-${item.id}'));
          await tester.ensureVisible(card);
          await tester.pump();
          final clipped =
              find.descendant(of: card, matching: find.byType(ClipRRect)).first;
          final cardRect = tester.getRect(clipped);
          final art = find.descendant(
              of: card,
              matching: find.byKey(const ValueKey('full-height-event-art')));
          final artRect = tester.getRect(art);
          expect(artRect.top, closeTo(cardRect.top, .1));
          expect(artRect.bottom, closeTo(cardRect.bottom, .1));
          expect(artRect.height, greaterThanOrEqualTo(140));
          final title =
              find.descendant(of: card, matching: find.text(item.titre));
          expect(tester.renderObject<RenderParagraph>(title).didExceedMaxLines,
              isFalse);
          expect(tester.getRect(title).right, lessThanOrEqualTo(artRect.left));
          if (item.operation?.priceTbd == true) {
            final priceRect = tester.getRect(find.descendant(
                of: card, matching: find.text('Prix à confirmer')));
            expect(priceRect.right, lessThanOrEqualTo(artRect.left));
            expect(priceRect.bottom, lessThanOrEqualTo(cardRect.bottom));
          }
          if (item.cardAppearance?.theme == 'christmas') {
            final snow = find.descendant(
                of: card,
                matching: find.byKey(const ValueKey('full-card-snow')));
            expect(tester.getRect(snow), cardRect);
          }
        }
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox());
      });
    }
  }
  testWidgets('plain event cards retain their compact heading', (tester) async {
    await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
            body: SizedBox(
                width: 240,
                child: EventCardHeading(
                    title: 'Ordinary event',
                    icon: Icons.pool,
                    iconColor: Colors.blue)))));
    expect(tester.widget<Text>(find.text('Ordinary event')).maxLines, 2);
    expect(find.byKey(const ValueKey('full-height-event-art')), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
