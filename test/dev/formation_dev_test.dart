import '../support/formation_dev_scenarios.dart';
import '../support/isolated_dev_app.dart';
import 'package:calymob/models/formation_snapshot_doc.dart';
import 'package:calymob/screens/profile/who_is_who_screen.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('MOB-033 goals never become validated exercise or brevet data', () {
    final before = devFormationSnapshots().first;
    final after = devFormationSnapshots(extraGoal: true).first;
    for (final modality in FormationModality.values) {
      expect(after.modalityProgress[modality]!.validated,
          before.modalityProgress[modality]!.validated);
      expect(after.modalityProgress[modality]!.pending,
          before.modalityProgress[modality]!.pending);
      expect(after.modalityProgress[modality]!.total, 2);
    }
    expect(after.currentCode, 'P1');
    expect(after.goalCount, 1);
    expect(Firebase.apps, isEmpty);
  });

  for (final width in [390.0, 1000.0]) {
    testWidgets(
        'MOB-033 actual progress, retry and restricted DTO at $width px',
        (tester) async {
      tester.view.physicalSize = Size(width, 1200);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(const IsolatedDevApp(initialPage: 5));
      await tester.pumpAndSettle();
      expect(find.text('Ada FICTIVE'), findsOneWidget);
      final rosterScroll = find.descendant(of: find.byType(FormationListView), matching: find.byType(Scrollable));
      await tester.scrollUntilVisible(find.text('Boris FICTIF'), 200, scrollable: rosterScroll);
      expect(find.text('Boris FICTIF'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('Ada FICTIVE'), -200, scrollable: rosterScroll);
      expect(find.text('Carrière 1/2'), findsOneWidget);
      expect(find.text('Piscine 1/2'), findsOneWidget);
      expect(find.text('Théorie 0/2 · 1⏳'), findsOneWidget);
      await tester.tap(find.text('Ada FICTIVE'));
      await tester.pumpAndSettle();
      expect(find.text('DEV isolé · Données fictives'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.tap(find.text('Souhait supplémentaire non validé'));
      await tester.pumpAndSettle();
      expect(find.text('Carrière 1/2'), findsOneWidget);
      expect(find.text('Piscine 1/2'), findsOneWidget);
      await tester.tap(find.text('Simuler une erreur de lecture'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('formation-load-error')), findsOneWidget);
      await tester.tap(find.byKey(const Key('formation-load-retry')));
      await tester.pumpAndSettle();
      expect(find.text('Ada FICTIVE'), findsOneWidget);
      await tester.tap(find.text('Portée piscine uniquement'));
      await tester.pumpAndSettle();
      expect(find.text('Piscine 1/3 · 1⏳'), findsNWidgets(2));
      expect(find.textContaining('Carrière '), findsNothing);
      expect(find.textContaining('Théorie '), findsNothing);
      await tester.enterText(
          find.byKey(const Key('dev-formation-search')), 'Boris');
      await tester.pumpAndSettle();
      expect(find.text('Ada FICTIVE'), findsNothing);
      expect(find.text('Boris FICTIF'), findsOneWidget);
      expect(Firebase.apps, isEmpty);
      expect(tester.takeException(), isNull);
    });
  }
}
