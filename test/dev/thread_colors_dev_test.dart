import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import '../support/thread_colors_dev_scenario.dart';

void main() {
  testWidgets(
      'MOB-052 real product -> colour -> basket -> reopen keeps saved choice offline',
      (tester) async {
    tester.view.physicalSize = const Size(1100, 1300);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: FictionalThreadColors())));
    await tester.tap(find.text('Personnaliser le polo FICTIF'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));
    final toggle = find.descendant(
        of: find.byKey(const Key('boutique-name-toggle')),
        matching: find.byType(Switch));
    await tester.ensureVisible(toggle);
    await tester.tap(toggle);
    await tester.pump();
    final input = find.byKey(const Key('boutique-name-field'));
    await tester.ensureVisible(input);
    await tester.enterText(input, 'FICTIF');
    await tester.pump();
    final picker = find.descendant(
        of: find.byKey(const Key('boutique-name-color')),
        matching: find.byType(DropdownButtonFormField<String>));
    await tester.ensureVisible(picker);
    await tester.tap(picker);
    await tester.pump(const Duration(milliseconds: 350));
    await tester.tap(find.text('Bleu').last);
    await tester.pump(const Duration(milliseconds: 350));
    final add = find.textContaining('Ajouter au panier');
    await tester.ensureVisible(add);
    await tester.tap(add);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 900));
    await tester.pump(const Duration(milliseconds: 150));
    await tester.pump(const Duration(milliseconds: 350));
    expect(find.textContaining('couleur : Bleu'), findsOneWidget);
    expect(find.text('Total FICTIF : 29.00 €'), findsOneWidget);
    await tester.tap(find.text('Modifier la ligne FICTIVE'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));
    final reopened = find.byKey(const Key('boutique-name-color'));
    await tester.ensureVisible(reopened);
    await tester.pump();
    expect(find.descendant(of: reopened, matching: find.text('Bleu')),
        findsOneWidget);
    expect(Firebase.apps, isEmpty);
    expect(tester.takeException(), isNull);
  });
}
