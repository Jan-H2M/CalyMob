import 'package:calymob/widgets/event_payment_options_dialog.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Future<void> open(
    WidgetTester tester,
    List<String> methods, {
    void Function(String?)? chosen,
    String? installment,
    double textScale = 1,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: TextScaler.linear(textScale),
          ),
          child: child!,
        ),
        home: Scaffold(
          body: Builder(
            builder: (context) {
              return TextButton(
                onPressed: () async {
                  final value = await showDialog<String>(
                    context: context,
                    barrierDismissible: false,
                    builder: (_) => EventPaymentOptionsDialog(
                      amount: 6.62,
                      allowedPaymentMethods: methods,
                      installmentLabel: installment,
                    ),
                  );
                  chosen?.call(value);
                },
                child: const Text('Open'),
              );
            },
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
  }

  testWidgets('email-only transfer also offers manual banking details', (
    tester,
  ) async {
    await open(tester, ['qr_email']);
    expect(find.text('Virement dans mon app bancaire'), findsOneWidget);
    expect(find.text('Recevoir le QR par email'), findsOneWidget);
    expect(find.text('Afficher le QR de paiement'), findsNothing);
    expect(find.text('Payer sur place'), findsNothing);
    expect(find.textContaining('6.62'), findsOneWidget);
    expect(find.textContaining('Ouvrez ensuite vous-même'), findsOneWidget);
  });

  testWidgets('on-site-only does not invent a bank-transfer permission', (
    tester,
  ) async {
    await open(tester, ['on_site']);
    expect(find.text('Payer sur place'), findsOneWidget);
    expect(find.text('Virement dans mon app bancaire'), findsNothing);
    expect(find.text('Recevoir le QR par email'), findsNothing);
  });

  testWidgets('both QR options share one manual-transfer choice', (
    tester,
  ) async {
    await open(tester, ['qr_email', 'qr_immediate', 'on_site']);
    expect(find.text('Virement dans mon app bancaire'), findsOneWidget);
    expect(find.text('Afficher le QR de paiement'), findsOneWidget);
    expect(find.text('Recevoir le QR par email'), findsOneWidget);
  });

  testWidgets('manual banking returns a choice, not a payment confirmation', (
    tester,
  ) async {
    String? choice;
    await open(tester, ['qr_email'], chosen: (value) => choice = value);
    await tester.tap(find.text('Virement dans mon app bancaire'));
    await tester.pumpAndSettle();
    expect(choice, 'bank_transfer');
    expect(find.byType(EventPaymentOptionsDialog), findsNothing);
  });

  testWidgets('close leaves the existing registration and method untouched', (
    tester,
  ) async {
    var completed = false;
    String? choice = 'unchanged';
    await open(
      tester,
      ['qr_email'],
      chosen: (value) {
        completed = true;
        choice = value;
      },
    );
    await tester.tap(find.text('Fermer'));
    await tester.pumpAndSettle();
    expect(completed, isTrue);
    expect(choice, isNull);
  });

  testWidgets('missing methods fail closed with a contact remedy', (
    tester,
  ) async {
    await open(tester, []);
    expect(
      find.textContaining('Aucun mode de paiement disponible'),
      findsOneWidget,
    );
    expect(find.text('Virement dans mon app bancaire'), findsNothing);
    expect(find.text('Fermer'), findsOneWidget);
  });

  testWidgets('installment keeps its exact outstanding amount and label', (
    tester,
  ) async {
    await open(tester, ['qr_email'], installment: 'Tranche 2');
    expect(find.text('Tranche 2 : 6.62 €'), findsOneWidget);
  });

  testWidgets('all options remain usable on a narrow large-text screen', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await open(tester, ['qr_email', 'qr_immediate', 'on_site'], textScale: 1.8);
    await tester.ensureVisible(find.text('Payer sur place'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('Fermer'));
    await tester.pumpAndSettle();
    expect(find.byType(EventPaymentOptionsDialog), findsNothing);
  });
}
