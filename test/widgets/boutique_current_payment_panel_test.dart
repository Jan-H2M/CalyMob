import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:calymob/widgets/boutique/boutique_current_payment_panel.dart';

Map<String, dynamic> payment(
        {double amount = 6.62, String revision = 'qa-r1'}) =>
    {
      'orderTotal': 78.62,
      'receivedAmount': 0,
      'reportedAmount': 72,
      'amount': amount,
      'requestId': 'supplement-qa',
      'kind': 'supplement',
      'revision': revision,
      'communication': '+++BTQ-2026-9001+++',
      'iban': 'BE68539007547034',
      'beneficiary': 'Club QA',
      'epcPayload':
          'BCD\n002\n1\nSCT\n\nClub QA\nBE68539007547034\nEUR${amount.toStringAsFixed(2)}\n\n\n+++BTQ-2026-9001+++',
      'oldInstructionsObsolete': true,
    };

Widget panel(Future<Map<String, dynamic>> Function() load,
        {String id = 'qa-order',
        Future<void> Function(Map<String, dynamic>)? email}) =>
    MaterialApp(
        home: Scaffold(
            body: SingleChildScrollView(
                child: BoutiqueCurrentPaymentPanel(
                    orderId: id, loadPayment: load, sendEmail: email))));

void main() {
  testWidgets('new QR and copied amount are only 6.62, never 78.62',
      (tester) async {
    await tester.pumpWidget(panel(() async => payment()));
    await tester.pumpAndSettle();
    expect(find.textContaining('Complément uniquement'), findsOneWidget);
    final qr = tester.widget<QrImageView>(find.byType(QrImageView));
    expect((qr.key as ValueKey<String>).value.split('\n')[7], 'EUR6.62');
    expect(find.textContaining('Ne payez pas de nouveau le total'),
        findsOneWidget);
    expect(find.textContaining('Déclaré en cours, non reçu'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets('unavailable current request never falls back to a historical QR',
      (tester) async {
    await tester.pumpWidget(panel(() async => throw StateError('offline')));
    await tester.pumpAndSettle();
    expect(find.byType(QrImageView), findsNothing);
    expect(find.textContaining('Aucun ancien QR'), findsOneWidget);
  });
  testWidgets(
      'after supplement receipt wait for bank, do not request the total or supplement again',
      (tester) async {
    await tester.pumpWidget(panel(() async => {
          ...payment(),
          'requestId': null,
          'amount': 0,
          'epcPayload': null,
          'receivedAmount': 6.62,
        }));
    await tester.pumpAndSettle();
    expect(find.byType(QrImageView), findsNothing);
    expect(find.textContaining('Aucun nouveau virement'), findsOneWidget);
  });
  testWidgets('complete payment and refund are shown distinctly',
      (tester) async {
    await tester.pumpWidget(panel(() async => {
          ...payment(),
          'requestId': null,
          'amount': 0,
          'epcPayload': null,
          'receivedAmount': 80,
          'fullyPaid': true,
          'refundAmount': 1.38,
        }));
    await tester.pumpAndSettle();
    expect(find.textContaining('Paiement complet'), findsOneWidget);
    expect(
        find.textContaining('rembourser ou porter en crédit'), findsOneWidget);
    expect(find.byType(QrImageView), findsNothing);
  });
  testWidgets(
      'email refresh rejects a stale request instead of sending a full or superseded QR',
      (tester) async {
    int calls = 0;
    int sent = 0;
    await tester.pumpWidget(panel(
        () async => payment(
            amount: calls++ == 0 ? 6.62 : 12,
            revision: calls == 1 ? 'old' : 'new'),
        email: (_) async => sent++));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Envoyer cette demande par e-mail'));
    await tester.tap(find.text('Envoyer cette demande par e-mail'));
    await tester.pumpAndSettle();
    expect(sent, 0);
    expect(find.textContaining('demande modifiée'), findsOneWidget);
    final qr = tester.widget<QrImageView>(find.byType(QrImageView));
    expect((qr.key as ValueKey<String>).value.split('\n')[7], 'EUR12.00');
  });
  testWidgets(
      'reusing the widget for another order removes the old QR immediately',
      (tester) async {
    await tester.pumpWidget(panel(() async => payment(), id: 'old-order'));
    await tester.pumpAndSettle();
    final pending = Completer<Map<String, dynamic>>();
    await tester.pumpWidget(panel(() => pending.future, id: 'new-order'));
    await tester.pump();
    expect(find.byType(QrImageView), findsNothing);
    pending.complete(payment(amount: 12));
    await tester.pumpAndSettle();
    expect(
        (tester.widget<QrImageView>(find.byType(QrImageView)).key
                as ValueKey<String>)
            .value
            .split('\n')[7],
        'EUR12.00');
  });
}
