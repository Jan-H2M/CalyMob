import 'dart:async';
import 'package:calymob/widgets/participant_payment_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Future<void> open(
      WidgetTester tester, Future<void> Function() confirm) async {
    tester.view.physicalSize = const Size(1000, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(MaterialApp(
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
                onMarkAsPaid: confirm);
          },
          child: const Text('Open')),
    ))));
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
  }

  testWidgets('confirmation stays locked across rebuilds and rapid taps',
      (tester) async {
    final pending = Completer<void>();
    var calls = 0;
    await open(tester, () {
      calls++;
      return pending.future;
    });
    var card = tester
        .widget<ParticipantPaymentCard>(find.byType(ParticipantPaymentCard));
    card.onMarkAsPaid();
    card.onMarkAsPaid();
    await tester.pump();
    card = tester
        .widget<ParticipantPaymentCard>(find.byType(ParticipantPaymentCard));
    expect(card.isProcessing, isTrue);
    card.onMarkAsPaid();
    expect(calls, 1);
    pending.complete();
    await tester.pumpAndSettle();
    expect(find.byType(ParticipantPaymentCard), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('failure permits retry without reporting success',
      (tester) async {
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
        isFalse);
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
  });
}
