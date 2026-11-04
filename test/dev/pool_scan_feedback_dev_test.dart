import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import '../support/pool_attendance_dev_scenario.dart';

void main() {
  testWidgets(
      'fictional scanner keeps index and callable feedback visible above the page',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(
        home: Scaffold(body: FictionalPoolScannerFeedback())));
    await tester.tap(find.text('Ouvrir le scanner fictif'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Simuler index absent'));
    await tester.pump();
    expect(find.byKey(const Key('scanner-action-error')).hitTestable(),
        findsOneWidget);
    expect(find.textContaining('index).'), findsOneWidget);
    await tester.tap(find.text('Simuler refus de séance'));
    await tester.pump();
    expect(find.text('Scan uniquement pour une séance piscine actuelle.'),
        findsOneWidget);
    expect(find.text('Présents : 0'), findsOneWidget);
    expect(find.text('Enregistré!'), findsNothing);
  });
}
