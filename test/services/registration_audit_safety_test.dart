import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:calymob/services/operation_service.dart';

void main() {
  const clubId = 'club-audit';
  const operationId = 'event-audit';
  const path = 'clubs/$clubId/operations/$operationId/inscriptions';

  late FakeFirebaseFirestore firestore;
  late OperationService service;

  setUp(() {
    firestore = FakeFirebaseFirestore();
    service = OperationService(firestore: firestore);
  });

  test('scanner undo preserves a walk-in as an attributed cancellation',
      () async {
    final reference = firestore.collection(path).doc('walk-in-1');
    await reference.set({
      'membre_id': 'member-1',
      'membre_prenom': 'René',
      'membre_nom': 'Hageman',
      'registration_status': 'confirmed',
      'walk_in': true,
      'paye': false,
      'prix': 10.0,
      'transaction_id': 'bank-transaction-kept',
      'present': true,
      'present_at': Timestamp.now(),
      'present_by': 'scanner-1',
      'present_by_name': 'Alice Scanner',
    });

    final result = await service.unmarkAsPresent(
      clubId: clubId,
      operationId: operationId,
      memberId: 'member-1',
    );

    final canceled = await reference.get();
    expect(result.deletedInscription, isTrue);
    expect(canceled.exists, isTrue);
    expect(canceled.data()?['registration_status'], 'canceled');
    expect(canceled.data()?['transaction_id'], 'bank-transaction-kept');
    expect(canceled.data()?['prix'], 10.0);
    expect(canceled.data()?['canceled_by'], 'scanner-1');
    expect(canceled.data()?['canceled_by_name'], 'Alice Scanner');
    expect(canceled.data()?['canceled_source'], 'calymob_scanner');
    expect(canceled.data()?['canceled_reason'], 'walk_in_scan_undo');
  });

  test('undo reactivates the same preserved walk-in document', () async {
    final reference = firestore.collection(path).doc('walk-in-2');
    final previousData = <String, dynamic>{
      'membre_id': 'member-2',
      'registration_status': 'confirmed',
      'walk_in': true,
      'paye': false,
      'present': true,
      'present_at': Timestamp.now(),
      'present_by': 'scanner-2',
      'present_by_name': 'Bob Scanner',
    };
    await reference.set({
      ...previousData,
      'registration_status': 'canceled',
      'canceled_by': 'scanner-2',
      'canceled_reason': 'walk_in_scan_undo',
    });

    await service.restoreFromUnmark(
      clubId: clubId,
      operationId: operationId,
      result: UnmarkPresentResult(
        deletedInscription: true,
        inscriptionId: reference.id,
        previousData: previousData,
      ),
    );

    final restored = (await reference.get()).data()!;
    expect(restored['registration_status'], 'confirmed');
    expect(restored['present'], isTrue);
    expect(restored['canceled_by'], isNull);
    expect(restored['canceled_reason'], isNull);
    expect(restored['last_action'], 're_registered');
  });

  test('removing a guest keeps payment fields and adds actor metadata',
      () async {
    final reference = firestore.collection(path).doc('guest-1');
    await reference.set({
      'membre_id': 'guest-1',
      'membre_prenom': 'Invité',
      'membre_nom': 'Test',
      'registration_status': 'confirmed',
      'is_guest': true,
      'added_by': 'member-parent',
      'added_by_name': 'Parent Member',
      'paye': true,
      'prix': 25.0,
      'transaction_id': 'tx-guest',
    });

    await service.removeOneGuest(
      clubId: clubId,
      operationId: operationId,
      guestInscriptionId: reference.id,
    );

    final canceled = (await reference.get()).data()!;
    expect(canceled['registration_status'], 'canceled');
    expect(canceled['paye'], isTrue);
    expect(canceled['transaction_id'], 'tx-guest');
    expect(canceled['canceled_by'], 'member-parent');
    expect(canceled['canceled_reason'], 'guest_removed');
  });

  test('removing an event cancels it and preserves every subcollection',
      () async {
    final operationRef = firestore
        .collection('clubs/$clubId/operations')
        .doc(operationId);
    final inscriptionRef = operationRef.collection('inscriptions').doc('member-1');
    final logRef = operationRef.collection('inscription_logs').doc('audit-1');
    final messageRef = operationRef.collection('messages').doc('message-1');
    await operationRef.set({'titre': 'Testduik', 'statut': 'ouvert'});
    await inscriptionRef.set({'membre_id': 'member-1', 'paye': true});
    await logRef.set({'event': 'registered'});
    await messageRef.set({'message': 'Welkom'});

    await service.deleteOperation(
      clubId: clubId,
      operationId: operationId,
      actorId: 'organizer-1',
      actorName: 'Alice Organizer',
    );

    final operation = (await operationRef.get()).data()!;
    expect(operation['statut'], 'annule');
    expect(operation['canceled_by'], 'organizer-1');
    expect(operation['canceled_by_name'], 'Alice Organizer');
    expect(operation['canceled_source'], 'calymob');
    expect((await inscriptionRef.get()).exists, isTrue);
    expect((await logRef.get()).exists, isTrue);
    expect((await messageRef.get()).exists, isTrue);
  });
}
