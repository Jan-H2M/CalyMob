import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:calymob/widgets/boutique/boutique_current_payment_panel.dart';
import 'package:calymob/widgets/payment_communication_copy_button.dart';

const supplementReference = '+++BTQ-2026-9001-SABCDEF0123456789ABCDEF01+++';

Map<String, dynamic> payment(
        {double amount = 6.62,
        String revision = 'qa-r1',
        String communication = supplementReference}) =>
    {
      'orderTotal': 78.62,
      'receivedAmount': 0,
      'reportedAmount': 72,
      'amount': amount,
      'requestId': 'supplement-qa',
      'kind': 'supplement',
      'revision': revision,
      'communication': communication,
      'iban': 'BE68539007547034',
      'beneficiary': 'Club QA',
      'epcPayload':
          'BCD\n002\n1\nSCT\n\nClub QA\nBE68539007547034\nEUR${amount.toStringAsFixed(2)}\n\n\n$communication',
      'oldInstructionsObsolete': true,
    };

Widget panel(Future<Map<String, dynamic>> Function() load,
        {String id = 'qa-order',
        Future<void> Function(Map<String, dynamic>)? email,
        Stream<DocumentSnapshot<Map<String, dynamic>>> Function(String)?
            watchOrder,
        Stream<String?> Function()? authUserIds}) =>
    MaterialApp(
        home: Scaffold(
            body: SingleChildScrollView(
                child: BoutiqueCurrentPaymentPanel(
                    orderId: id,
                    loadPayment: load,
                    sendEmail: email,
                    watchOrder: watchOrder,
                    authUserIds: authUserIds))));

void main() {
  testWidgets('fresh own-order details work immediately while the callable never completes', (tester) async {
    final db = FakeFirebaseFirestore();
    final doc = db.doc('clubs/calypso/orders/qa');
    await doc.set({
      'orderNumber': 'BTQ-2099-9001', 'status': 'awaiting_payment',
      'structuredCommunication': '+++BTQ-2099-9001+++',
      'pricing': {'total': 41.5},
      'payment': {'status': 'pending', 'iban': 'BE68539007547034',
        'beneficiary': 'Club QA', 'epcPayload': 'OBSOLETE QR',
        'presentation': 'bank', 'email_status': 'sent'},
    });
    final slow = Completer<Map<String, dynamic>>();
    await tester.pumpWidget(panel(() => slow.future,
        watchOrder: (_) => doc.snapshots(), authUserIds: () => Stream.value('owner')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Mode choisi : virement bancaire'), findsOneWidget);
    expect(find.textContaining('E-mail de paiement envoyé'), findsOneWidget);
    expect((tester.widget<QrImageView>(find.byType(QrImageView)).key as ValueKey<String>).value.split('\n')[7], 'EUR41.50');
    final copies = <String>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') copies.add((call.arguments as Map)['text'] as String);
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
    for (final key in ['copy-payment-iban', 'copy-payment-amount', 'copy-payment-communication']) {
      await tester.ensureVisible(find.byKey(Key(key)));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(Key(key)));
      await tester.pumpAndSettle();
    }
    expect(copies, ['BE68539007547034', '41.50', '+++BTQ-2099-9001+++']);
    await tester.ensureVisible(find.text('Ouvrir le QR en grand'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ouvrir le QR en grand'));
    await tester.pumpAndSettle();
    expect(tester.widgetList<QrImageView>(find.byType(QrImageView)).any((qr) => qr.size == 300), true);
    // A receipt removes all QR/copy actions, including the expanded QR, without
    // waiting for the still-pending callable. Its late stale reply is ignored.
    await doc.update({'status': 'paid', 'payment.status': 'paid', 'payment.bankRef': 'qa-receipt'});
    await tester.pumpAndSettle();
    slow.complete(payment());
    await tester.pumpAndSettle();
    expect(find.byType(QrImageView), findsNothing);
    expect(find.byKey(const Key('copy-payment-amount')), findsNothing);
    expect(find.textContaining('Paiement complet'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('fresh document remains payable when current-payment callable fails', (tester) async {
    final db = FakeFirebaseFirestore();
    final doc = db.doc('clubs/calypso/orders/qa');
    await doc.set({'orderNumber': 'BTQ-2099-9001', 'status': 'awaiting_payment',
      'structuredCommunication': '+++BTQ-2099-9001+++', 'pricing': {'total': 6.62},
      'payment': {'status': 'pending', 'iban': 'BE68539007547034', 'beneficiary': 'Club QA'}});
    await tester.pumpWidget(panel(() async => throw StateError('404'),
        watchOrder: (_) => doc.snapshots(), authUserIds: () => Stream.value('owner')));
    await tester.pumpAndSettle();
    expect(find.byType(QrImageView), findsOneWidget);
    expect(find.byKey(const Key('copy-payment-amount')), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets('document permission error hides QR without an unobserved Future',
      (tester) async {
    final orders = StreamController<DocumentSnapshot<Map<String, dynamic>>>(
        onCancel: () {});
    addTearDown(orders.close);
    await tester.pumpWidget(panel(() async => payment(),
        watchOrder: (_) => orders.stream,
        authUserIds: () => Stream.value('owner')));
    await tester.pumpAndSettle();
    expect(find.byType(QrImageView), findsOneWidget);
    orders.addError(FirebaseException(
        plugin: 'cloud_firestore', code: 'permission-denied'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.byType(QrImageView), findsNothing);
    expect(find.textContaining('Aucun ancien QR'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
    expect(orders.hasListener, isFalse);
  });

  testWidgets('failed reload between frames is observed before FutureBuilder',
      (tester) async {
    final db = FakeFirebaseFirestore();
    final doc = db.doc('clubs/club/orders/order');
    await doc.set({'status': 'pending'});
    final orders = StreamController<DocumentSnapshot<Map<String, dynamic>>>(
        onCancel: () {});
    addTearDown(orders.close);
    var calls = 0;
    await tester.pumpWidget(panel(() async {
      if (calls++ > 0) throw StateError('reload unavailable');
      return payment();
    },
        watchOrder: (_) => orders.stream,
        authUserIds: () => Stream.value('owner')));
    await tester.pumpAndSettle();
    orders.add(await doc.get());
    await tester.pumpAndSettle();
    await doc.update({'status': 'changed'});
    orders.add(await doc.get());
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.byType(QrImageView), findsNothing);
    expect(find.textContaining('Aucun ancien QR'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
  });

  testWidgets('logout cancels the document and removes an already visible QR',
      (tester) async {
    final auth = StreamController<String?>();
    addTearDown(auth.close);
    final orders = StreamController<DocumentSnapshot<Map<String, dynamic>>>(
        onCancel: () {});
    addTearDown(orders.close);
    await tester.pumpWidget(panel(() async => payment(),
        watchOrder: (_) => orders.stream, authUserIds: () => auth.stream));
    auth.add('owner');
    await tester.pumpAndSettle();
    expect(orders.hasListener, isTrue);
    expect(find.byType(QrImageView), findsOneWidget);
    // switchMap awaits native-listener cancellation before delivering auth loss.
    await tester.runAsync(() async {
      auth.add(null);
      await Future<void>.delayed(Duration.zero);
    });
    await tester.pumpAndSettle();
    expect(orders.hasListener, isFalse);
    expect(find.byType(QrImageView), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
    expect(auth.hasListener, isFalse);
  });

  testWidgets('new QR and copied amount are only 6.62, never 78.62',
      (tester) async {
    await tester.pumpWidget(panel(() async => payment()));
    await tester.pumpAndSettle();
    expect(find.textContaining('Complément uniquement'), findsOneWidget);
    final qr = tester.widget<QrImageView>(find.byType(QrImageView));
    expect((qr.key as ValueKey<String>).value.split('\n')[7], 'EUR6.62');
    expect((qr.key as ValueKey<String>).value.split('\n')[10],
        supplementReference);
    expect(
        tester
            .widget<PaymentCommunicationCopyButton>(
                find.byType(PaymentCommunicationCopyButton))
            .communication,
        supplementReference);
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
  testWidgets(
      'a same-amount reference change blocks stale email and updates QR and copy together',
      (tester) async {
    int calls = 0;
    int sent = 0;
    const changed = '+++BTQ-2026-9001-S0123456789ABCDEF01234567+++';
    await tester.pumpWidget(panel(
        () async => payment(
            communication: calls++ == 0 ? supplementReference : changed),
        email: (_) async => sent++));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Envoyer cette demande par e-mail'));
    await tester.tap(find.text('Envoyer cette demande par e-mail'));
    await tester.pumpAndSettle();
    expect(sent, 0);
    expect(find.textContaining('demande modifiée'), findsOneWidget);
    expect(
        (tester.widget<QrImageView>(find.byType(QrImageView)).key
                as ValueKey<String>)
            .value
            .split('\n')[10],
        changed);
    expect(
        tester
            .widget<PaymentCommunicationCopyButton>(
                find.byType(PaymentCommunicationCopyButton))
            .communication,
        changed);
  });
  testWidgets(
      'a QR for a different reference never becomes the current payable action',
      (tester) async {
    await tester.pumpWidget(panel(() async => {
          ...payment(),
          'epcPayload':
              payment(communication: '+++BTQ-2026-9001+++')['epcPayload']
        }));
    await tester.pumpAndSettle();
    expect(find.byType(QrImageView), findsNothing);
    expect(find.byType(PaymentCommunicationCopyButton), findsNothing);
  });
}
