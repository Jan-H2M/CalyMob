import 'dart:async';

import 'package:calymob/models/participant_operation.dart';
import 'package:calymob/services/operation_service.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const clubId = 'synthetic-club';
  const operationId = 'synthetic-event';
  const participantId = 'synthetic-member-aged-13';

  Map<String, Object?> fictitiousInscription({
    required bool paid,
    String? paymentStatus,
    bool transactionMatched = false,
    String? transactionId,
  }) {
    return {
      'operation_id': operationId,
      'membre_id': participantId,
      'membre_prenom': 'Membre',
      'membre_nom': 'FICTIF-13-ANS',
      'prix': 25.0,
      'paye': paid,
      'payment_status': paymentStatus,
      'transaction_matched': transactionMatched,
      'transaction_id': transactionId,
      'mode_paiement': 'bank',
    };
  }

  test(
    'an EPC QR communication alone never becomes proof of settlement',
    () async {
      final firestore = FakeFirebaseFirestore();
      final ref = firestore.doc(
        'clubs/$clubId/operations/$operationId/inscriptions/$participantId',
      );
      await ref.set(
        fictitiousInscription(paid: false, paymentStatus: 'qr_on_site'),
      );

      final participant = ParticipantOperation.fromFirestore(await ref.get());

      expect(participant.paymentDisplayStatus, 'Paiement sur place');
      expect(participant.paymentStatusCategory, 'on_site');
      expect(participant.isPaidAwaitingBank, isFalse);
      expect(participant.isFullyPaid, isFalse);
    },
  );

  test(
    'bank reconciliation moves the fictitious minor from pending to paid',
    () async {
      final firestore = FakeFirebaseFirestore();
      final service = OperationService(firestore: firestore);
      final ref = firestore.doc(
        'clubs/$clubId/operations/$operationId/inscriptions/$participantId',
      );
      await ref.set(fictitiousInscription(paid: true, paymentStatus: 'paid'));

      final updates = StreamIterator(
        service.getParticipantsStream(clubId, operationId),
      );
      addTearDown(updates.cancel);

      expect(await updates.moveNext(), isTrue);
      final awaitingBank = updates.current.single;
      expect(awaitingBank.paymentStatusCategory, 'pending_bank');
      expect(awaitingBank.isPaidAwaitingBank, isTrue);
      expect(awaitingBank.isFullyPaid, isFalse);

      await ref.update({
        'transaction_matched': true,
        'transaction_id': 'synthetic-bank-receipt',
      });

      expect(await updates.moveNext(), isTrue);
      final reconciled = updates.current.single;
      expect(reconciled.paymentDisplayStatus, 'Payé');
      expect(reconciled.paymentStatusCategory, 'paid');
      expect(reconciled.isPaidAwaitingBank, isFalse);
      expect(reconciled.isFullyPaid, isTrue);
    },
  );

  test(
    'a linked bank receipt is the defensive legacy reconciliation proof',
    () async {
      final firestore = FakeFirebaseFirestore();
      final ref = firestore.doc(
        'clubs/$clubId/operations/$operationId/inscriptions/$participantId',
      );
      await ref.set(
        fictitiousInscription(
          paid: true,
          paymentStatus: 'paid',
          transactionId: 'synthetic-legacy-bank-receipt',
        ),
      );

      final participant = ParticipantOperation.fromFirestore(await ref.get());

      expect(participant.transactionMatched, isFalse);
      expect(participant.paymentDisplayStatus, 'Payé');
      expect(participant.paymentStatusCategory, 'paid');
      expect(participant.isPaidAwaitingBank, isFalse);
      expect(participant.isFullyPaid, isTrue);
    },
  );
}
