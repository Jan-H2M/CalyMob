import '../support/isolated_dev_app.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  for (final width in [390.0, 1000.0]) {
    testWidgets(
        'MOB-036 planned roster, retry, changed IDs and empty/error at $width px',
        (tester) async {
      tester.view.physicalSize = Size(width, 1200);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(const IsolatedDevApp(initialPage: 6));
      await tester.pumpAndSettle();
      expect(find.text('1★ apnée · A1 / Discovery · 20h15'), findsOneWidget);
      expect(find.text('2★ apnée · A2 · 21h15'), findsOneWidget);
      expect(find.text('Élèves : Ada FICTIVE'), findsOneWidget);
      expect(find.text('Roster du cours · présence à vérifier séparément'),
          findsNWidgets(2));
      await tester.tap(find.text('Simuler un échec des noms'));
      await tester.pumpAndSettle();
      expect(find.text('Noms des participants indisponibles.'), findsOneWidget);
      await tester.tap(find.text('Réessayer'));
      await tester.pumpAndSettle();
      expect(find.text('Élèves : Ada FICTIVE'), findsOneWidget);
      await tester.tap(find.text('Changer les élèves fictifs'));
      await tester.pumpAndSettle();
      expect(find.text('Élèves : Ada FICTIVE'), findsNothing);
      expect(find.text('Élèves : Boris FICTIF'), findsOneWidget);
      await tester.tap(find.text('Planning fictif vide'));
      await tester.pumpAndSettle();
      expect(find.text('Apnée'), findsNothing);
      expect(find.textContaining('aucune présence ou absence'), findsOneWidget);
      await tester.tap(find.text('Simuler une erreur de planning'));
      await tester.pumpAndSettle();
      expect(find.text('Planning apnée indisponible.'), findsOneWidget);
      await tester.tap(find.text('Recharger le planning fictif'));
      await tester.pumpAndSettle();
      expect(find.text('Élèves : Boris FICTIF'), findsOneWidget);
      expect(Firebase.apps, isEmpty);
      expect(tester.takeException(), isNull);
    });
  }
}
