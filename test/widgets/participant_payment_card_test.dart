import 'dart:async';
import 'package:calymob/widgets/participant_payment_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/widgets/epc_qr_code_widget.dart';
import 'package:calymob/widgets/payment_communication_copy_button.dart';

void main() {
  testWidgets(
    'member transfer copies exact QR values without confirming payment',
    (tester) async {
      tester.view.physicalSize = const Size(500, 1800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final copied = <String>[];
      var confirmations = 0;
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, (call) async {
            if (call.method == 'Clipboard.setData') {
              copied.add((call.arguments as Map)['text'] as String);
            }
            return null;
          });
      addTearDown(
        () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(SystemChannels.platform, null),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ParticipantPaymentCard(
              participantFirstName: 'Ada',
              participantLastName: 'FICTIVE',
              amount: 6.62,
              eventTitle: 'Sortie FICTIVE',
              eventId: 'fictional-event',
              eventNumber: 'EVT-FICTIF',
              installmentLabel: 'Tranche 2',
              clubIban: 'BE71 0961 2345 6769',
              beneficiaryName: 'CLUB FICTIF',
              showConfirmButton: false,
              onMarkAsPaid: () => confirmations++,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      final communication = tester
          .widget<PaymentCommunicationCopyButton>(
            find.byType(PaymentCommunicationCopyButton),
          )
          .communication;
      final qr = tester.widget<EpcQrCodeWidget>(find.byType(EpcQrCodeWidget));
      expect(qr.amount, 6.62);
      expect(qr.description, communication);
      expect(communication, contains('Tranche 2'));
      for (final label in [
        'Copier l’IBAN',
        'Copier le montant',
        'Copier la communication',
      ]) {
        await tester.ensureVisible(find.text(label));
        await tester.tap(find.text(label));
        await tester.pump();
      }
      expect(copied, ['BE71096123456769', '6.62', communication]);
      expect(confirmations, 0);
      expect(find.textContaining('Confirmer la réception'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  Future<void> open(
    WidgetTester tester,
    Future<void> Function() confirm,
  ) async {
    tester.view.physicalSize = const Size(1000, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () {
                showParticipantPaymentCard(
                  context: context,
                  participantFirstName: 'Test',
                  participantLastName: 'Member',
                  amount: 30,
                  eventTitle: 'Test event',
                  eventId: 'event-1',
                  clubIban: 'BE71096123456769',
                  beneficiaryName: 'CALYPSO',
                  onMarkAsPaid: confirm,
                );
              },
              child: const Text('Open'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
  }

  testWidgets('confirmation stays locked across rebuilds and rapid taps', (
    tester,
  ) async {
    final pending = Completer<void>();
    var calls = 0;
    await open(tester, () {
      calls++;
      return pending.future;
    });
    var card = tester.widget<ParticipantPaymentCard>(
      find.byType(ParticipantPaymentCard),
    );
    card.onMarkAsPaid();
    card.onMarkAsPaid();
    await tester.pump();
    card = tester.widget<ParticipantPaymentCard>(
      find.byType(ParticipantPaymentCard),
    );
    expect(card.isProcessing, isTrue);
    card.onMarkAsPaid();
    expect(calls, 1);
    pending.complete();
    await tester.pumpAndSettle();
    expect(find.byType(ParticipantPaymentCard), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('failure permits retry without reporting success', (
    tester,
  ) async {
    var calls = 0;
    await open(tester, () async {
      calls++;
      throw StateError('Server unavailable');
    });
    tester
        .widget<ParticipantPaymentCard>(find.byType(ParticipantPaymentCard))
        .onMarkAsPaid();
    await tester.pumpAndSettle();
    expect(find.byType(ParticipantPaymentCard), findsOneWidget);
    expect(
      tester
          .widget<ParticipantPaymentCard>(find.byType(ParticipantPaymentCard))
          .isProcessing,
      isFalse,
    );
    expect(find.textContaining('Server unavailable'), findsOneWidget);
    tester
        .widget<ParticipantPaymentCard>(find.byType(ParticipantPaymentCard))
        .onMarkAsPaid();
    await tester.pumpAndSettle();
    expect(calls, 2);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'late rejection after dismissal does not setState on disposed sheet',
    (tester) async {
      final pending = Completer<void>();
      await open(tester, () => pending.future);
      tester
          .widget<ParticipantPaymentCard>(find.byType(ParticipantPaymentCard))
          .onMarkAsPaid();
      await tester.pump();
      Navigator.of(tester.element(find.byType(ParticipantPaymentCard))).pop();
      await tester.pumpAndSettle();
      pending.completeError(StateError('Late failure'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    },
  );
}
