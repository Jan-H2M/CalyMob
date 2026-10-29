import '../support/isolated_dev_app.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('DEV only accepts the explicit credentialless loopback target', () {
    validateDevOrigin(Uri.parse('http://127.0.0.1:7375'),
        enabled: true, isWeb: true);
    for (final url in [
      'https://caly.club',
      'http://localhost:7375',
      'http://127.0.0.1:7365',
      'https://127.0.0.1:7375'
    ]) {
      expect(
          () => validateDevOrigin(Uri.parse(url), enabled: true, isWeb: true),
          throwsStateError);
    }
    expect(
        () => validateDevOrigin(Uri.parse('http://127.0.0.1:7375'),
            enabled: false, isWeb: true),
        throwsStateError);
    expect(
        () => validateDevOrigin(Uri.parse('http://127.0.0.1:7375'),
            enabled: true, isWeb: false),
        throwsStateError);
    expect(Firebase.apps, isEmpty);
  });

  test('all aliases preserve canonical unpaid, review and paid states',
      () async {
    for (final state in paymentStates) {
      final baseline = await fictionalPayment(state, null);
      for (final alias in paymentAliases) {
        final injected = await fictionalPayment(state, alias);
        expect(injected.isPaid, baseline.isPaid);
        expect(injected.statusLabel, baseline.statusLabel);
      }
    }
    expect(Firebase.apps, isEmpty);
  });

  test('unknown payment fixture inputs fail closed and document data is copied',
      () async {
    await expectLater(
        fictionalPayment('production', null), throwsArgumentError);
    await expectLater(
        fictionalPayment('unpaid', 'unknown'), throwsArgumentError);
    final document = FictionalParticipantDocument({'prix': 8});
    final data = document.data();
    data['prix'] = 999;
    expect(document.data()['prix'], 8);
    expect(Firebase.apps, isEmpty);
  });

  Future<void> open(WidgetTester tester, {double width = 800}) async {
    tester.view.physicalSize = Size(width, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(const IsolatedDevApp());
    await tester.pumpAndSettle();
  }

  testWidgets(
      'actual priority list uses fictional loaders and filters without dossier navigation',
      (tester) async {
    await open(tester);
    expect(tester.getTopLeft(find.text('Bert FICTIF')).dy,
        lessThan(tester.getTopLeft(find.text('Aaron FICTIF')).dy));
    // Deliberately absorbed: the fixture lab must not open a dossier route.
    await tester.tap(find.text('Bert FICTIF'), warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(find.text('DEV isolé · Données fictives'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('Piscine uniquement'));
    await tester.pumpAndSettle();
    expect(tester.getTopLeft(find.text('Yves FICTIF')).dy,
        lessThan(tester.getTopLeft(find.text('Aaron FICTIF')).dy));
    await tester.enterText(
        find.byKey(const Key('dev-student-search')), 'Aaron');
    await tester.pumpAndSettle();
    expect(find.text('Aaron FICTIF'), findsOneWidget);
    expect(find.text('Yves FICTIF'), findsNothing);
    expect(Firebase.apps, isEmpty);
  });

  for (final width in [390.0, 1000.0]) {
    testWidgets('three fixture pages and reset work at $width px',
        (tester) async {
      await open(tester, width: width);
      await tester.tap(find.text('MOB-044 · Paiements'));
      await tester.pumpAndSettle();
      expect(find.text('À payer'), findsOneWidget);
      for (final alias in paymentAliases) {
        await tester.tap(find.text('$alias = paid'));
        await tester.pumpAndSettle();
        expect(find.text('À payer'), findsOneWidget);
      }
      await tester.tap(find.text('review'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('dev-payment-label')), findsOneWidget);
      expect(find.text('Vérification bancaire'), findsOneWidget);
      await tester.tap(find.text('COM-147 · Inscriptions'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('dev-simulate-error')));
      await tester.pumpAndSettle();
      expect(
          find.textContaining(
              'Les tarifs de cette activité doivent être corrigés'),
          findsOneWidget);
      expect(find.textContaining('MUST-NOT-BE-DISPLAYED'), findsNothing);
      await tester.tap(find.text('Connexion incertaine'));
      await tester.tap(find.byKey(const Key('dev-simulate-error')));
      await tester.pumpAndSettle();
      expect(
          find.textContaining('Vérifiez vos inscriptions avant de réessayer'),
          findsOneWidget);
      await tester.tap(find.byTooltip('Réinitialiser les scénarios'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('dev-student-search')), findsOneWidget);
      expect(Firebase.apps, isEmpty);
      expect(tester.takeException(), isNull);
    });
  }
}
