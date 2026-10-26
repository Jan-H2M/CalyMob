import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/models/operation.dart';
import 'package:calymob/models/participant_operation.dart';
import 'package:calymob/models/user_event_registration.dart';
import 'package:calymob/utils/operation_payment_presentation.dart';

void main() {
  Future<ParticipantOperation> readParticipant({
    required String id,
    required String firstName,
    required double amount,
    required Map<String, dynamic> paymentFields,
  }) async {
    final firestore = FakeFirebaseFirestore();
    final ref = firestore.doc(
      'clubs/calypso/operations/vodelee-8-nov/inscriptions/$id',
    );
    await ref.set({
      'operation_id': 'vodelee-8-nov',
      'membre_id': 'member-$id',
      'membre_prenom': firstName,
      'membre_nom': 'Vodelée',
      'prix': amount,
      'date_inscription': Timestamp.fromDate(DateTime(2026, 10, 1)),
      ...paymentFields,
    });
    return ParticipantOperation.fromFirestore(await ref.get());
  }

  group('Vodelée paid-signal parity', () {
    test(
      'Vodelee Sylvie €8 is paid when paye is the only paid signal',
      () async {
        final participant = await readParticipant(
          id: 'sylvie',
          firstName: 'Sylvie',
          amount: 8,
          paymentFields: {
            'paye': true,
            'payment_status': 'qr_email_sent',
            'transaction_matched': false,
          },
        );

        expect(participant.isPaymentSettled, isTrue);
        expect(participant.paymentDisplayStatus, 'Payé');
        expect(participant.paymentStatusCategory, 'paid');
      },
    );

    test('Vodelee Christ €4 is paid from canonical payment_status', () async {
      final participant = await readParticipant(
        id: 'christ',
        firstName: 'Christian',
        amount: 4,
        paymentFields: {
          'paye': false,
          'payment_status': 'paid',
          'transaction_matched': false,
        },
      );

      expect(participant.isPaymentSettled, isTrue);
      expect(participant.paymentDisplayStatus, 'Payé');
      expect(participant.paymentStatusCategory, 'paid');
    });

    test('Vodelee Myriam €8 is paid from transaction_matched', () async {
      final participant = await readParticipant(
        id: 'myriam',
        firstName: 'Myriam',
        amount: 8,
        paymentFields: {
          'paye': false,
          'payment_status': 'qr_email_sent',
          'transaction_matched': true,
          'transaction_id': 'bank-vodelee-myriam',
        },
      );

      expect(participant.isPaymentSettled, isTrue);
      expect(participant.paymentDisplayStatus, 'Payé');
      expect(participant.paymentStatusCategory, 'paid');
    });

    test('settled and paid payment-intent projections are paid', () async {
      final direct = await readParticipant(
        id: 'bertrand',
        firstName: 'Bertrand',
        amount: 8,
        paymentFields: {
          'paye': false,
          'payment_status': 'open',
          'payment_intent_status': 'settled',
        },
      );
      final nested = await readParticipant(
        id: 'carlos',
        firstName: 'Carlos',
        amount: 8,
        paymentFields: {
          'paye': false,
          'payment_status': 'open',
          'payment_intent': {'status': 'paid'},
        },
      );

      expect(direct.isPaymentSettled, isTrue);
      expect(nested.isPaymentSettled, isTrue);
      expect(direct.paymentStatusCategory, 'paid');
      expect(nested.paymentStatusCategory, 'paid');
    });

    test('settled payment_status alias is paid', () async {
      final participant = await readParticipant(
        id: 'settled-alias',
        firstName: 'Participant',
        amount: 8,
        paymentFields: {'paye': false, 'payment_status': ' SeTtLeD '},
      );

      expect(participant.isPaymentSettled, isTrue);
      expect(participant.paymentStatusCategory, 'paid');
    });
  });

  group('event-linked manual review', () {
    test(
      'participant-specific review outranks the previous QR wording',
      () async {
        final participant = await readParticipant(
          id: 'sylvie-review',
          firstName: 'Sylvie',
          amount: 8,
          paymentFields: {
            'paye': false,
            'payment_status': 'manual_review',
            'transaction_matched': false,
            'payment_review_transaction_id': 'bank-vodelee-sylvie',
            'payment_review_reason': 'event_name_amount_candidate',
          },
        );

        expect(participant.isPaymentSettled, isFalse);
        expect(participant.isPaymentInManualReview, isTrue);
        expect(participant.paymentDisplayStatus, 'Vérification bancaire');
        expect(participant.paymentStatusCategory, 'manual_review');
        expect(participant.paymentReviewTransactionId, 'bank-vodelee-sylvie');

        final registration = UserEventRegistration(
          operation: Operation(
            id: 'vodelee-8-nov',
            type: 'evenement',
            titre: 'Vodelée 8/11',
            montantPrevu: 0,
            statut: 'ouvert',
            createdAt: DateTime(2026, 9, 1),
            updatedAt: DateTime(2026, 10, 26),
          ),
          participant: participant,
        );
        expect(registration.isPaid, isFalse);
        expect(registration.isPaymentInManualReview, isTrue);
        expect(registration.statusLabel, 'Vérification bancaire');
        expect(registration.statusColor, 'deepOrange');
      },
    );

    test('manual review bypasses the payment-plan card and its QR action',
        () async {
      final participant = await readParticipant(
        id: 'plan-review',
        firstName: 'Participant',
        amount: 8,
        paymentFields: {
          'paye': false,
          'payment_status': 'manual_review',
          'transaction_matched': false,
          'payment_review_transaction_id': 'bank-vodelee-plan-review',
        },
      );

      expect(
        unpaidPaymentCardKind(
          inscription: participant,
          paymentPlanEnabled: true,
        ),
        UnpaidPaymentCardKind.manualReview,
      );
      expect(participant.paymentDisplayStatus, 'Vérification bancaire');
    });

    test('a linked transaction id alone is not proof of settlement', () async {
      final participant = await readParticipant(
        id: 'legacy-link',
        firstName: 'Participant',
        amount: 8,
        paymentFields: {
          'paye': false,
          'payment_status': 'qr_email_sent',
          'transaction_matched': false,
          'transaction_id': 'event-link-only',
        },
      );

      expect(participant.isPaymentSettled, isFalse);
      expect(participant.paymentDisplayStatus, 'QR code envoyé');
      expect(participant.paymentStatusCategory, 'qr_sent');
    });
  });
}
