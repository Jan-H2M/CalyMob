import 'package:calymob/models/operation.dart';
import 'package:calymob/models/participant_operation.dart';
import 'package:calymob/models/user_event_registration.dart';
import 'package:calymob/utils/operation_payment_presentation.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  // These inscription aliases are not protected accounting fields in the
  // canonical CalyCompta rules. An arbitrary value must not become evidence of
  // settlement or suppress a real payment/review action. No live data is used.
  final aliases = <String, Map<String, dynamic> Function(String)>{
    'payment_intent_status': (status) => {'payment_intent_status': status},
    'event_payment_intent_status': (status) =>
        {'event_payment_intent_status': status},
    'payment_intent.status': (status) => {
          'payment_intent': {'status': status}
        },
  };
  final canonicalStates = <String, Map<String, dynamic>>{
    'unpaid': {'payment_status': 'qr_email_sent'},
    'review': {'payment_status': 'manual_review'},
    'partial': {
      'payment_status': 'open',
      'installment_payments': {
        'deposit': {'status': 'paid', 'amount_due': 2},
      },
    },
    'paid': {'paye': true, 'payment_status': 'paid'},
  };

  Future<ParticipantOperation> read(
      Map<String, dynamic> canonical, Map<String, dynamic> extra) async {
    final db = FakeFirebaseFirestore();
    final ref = db.doc('clubs/synthetic/operations/event/inscriptions/member');
    await ref.set({
      'operation_id': 'event',
      'membre_id': 'synthetic-member',
      'prix': 8,
      'paye': false,
      'transaction_matched': false,
      'date_inscription': Timestamp.fromDate(DateTime(2026, 10, 1)),
      ...canonical,
      ...extra,
    });
    return ParticipantOperation.fromFirestore(await ref.get());
  }

  Map<String, Object?> presentation(ParticipantOperation participant) {
    final registration = UserEventRegistration(
      operation: Operation(
        id: 'event',
        type: 'evenement',
        titre: 'Synthetic event',
        montantPrevu: 0,
        statut: 'ouvert',
        createdAt: DateTime(2026, 10, 1),
        updatedAt: DateTime(2026, 10, 1),
      ),
      participant: participant,
    );
    return {
      'settled': participant.isPaymentSettled,
      'fullyPaid': participant.isFullyPaid,
      'review': participant.isPaymentInManualReview,
      'partial': participant.hasPartialPayment,
      'display': participant.paymentDisplayStatus,
      'category': participant.paymentStatusCategory,
      'registrationPaid': registration.isPaid,
      'registrationLabel': registration.statusLabel,
      'registrationColor': registration.statusColor,
      'paymentCard': unpaidPaymentCardKind(
        inscription: participant,
        paymentPlanEnabled: true,
      ),
    };
  }

  for (final alias in aliases.entries) {
    for (final state in canonicalStates.entries) {
      for (final value in ['paid', 'settled', ' PaId ', 'manual_review']) {
        test('${alias.key}=$value cannot alter ${state.key} presentation',
            () async {
          final baseline = await read(state.value, {});
          final injected = await read(state.value, alias.value(value));
          expect(presentation(injected), presentation(baseline));
          expect(presentation(injected.copyWith(notes: 'local draft')),
              presentation(baseline));
          expect(
              injected.toFirestore(), isNot(contains('payment_intent_status')));
          expect(injected.toFirestore(),
              isNot(contains('event_payment_intent_status')));
          expect(injected.toFirestore(), isNot(contains('payment_intent')));
        });
      }
    }
  }

  test('conflicting aliases cannot override canonical manual review', () async {
    final participant = await read(canonicalStates['review']!, {
      'payment_intent_status': 'paid',
      'event_payment_intent_status': 'settled',
      'payment_intent': {'status': 'paid'},
    });
    expect(participant.isPaymentSettled, isFalse);
    expect(participant.paymentDisplayStatus, 'Vérification bancaire');
    expect(
      unpaidPaymentCardKind(
        inscription: participant,
        paymentPlanEnabled: true,
      ),
      UnpaidPaymentCardKind.manualReview,
    );
  });
}
