import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:calymob/models/material_loan.dart';
import 'package:calymob/services/material_loan_service.dart';

void main() {
  const clubId = 'club-test';
  late FakeFirebaseFirestore firestore;
  late MaterialLoanService service;

  setUp(() {
    firestore = FakeFirebaseFirestore();
    service = MaterialLoanService(firestore: firestore);
  });

  MaterialLoanItem item({
    required String id,
    required String code,
    String? variant,
  }) {
    return MaterialLoanItem(
      id: id,
      code: code,
      name: 'Gilet stabilisateur',
      brand: 'MARES',
      model: 'Vector Pro',
      serialNumber: 'SER-$code',
      variant: variant,
      status: 'disponible',
      typeId: 'gilet',
      typeName: 'Gilet stabilisateur',
    );
  }

  Future<void> seedItem(MaterialLoanItem item, {String status = 'disponible'}) {
    return firestore
        .collection('clubs')
        .doc(clubId)
        .collection('inventory_items')
        .doc(item.id)
        .set({
      'code': item.code,
      'nom': item.name,
      'fabricant': item.brand,
      'modele': item.model,
      'numero_serie': item.serialNumber,
      'typeId': item.typeId,
      'taille': item.variant,
      'statut': status,
    });
  }

  test('creates one atomic direct loan with the fixed EUR 100 caution',
      () async {
    final gilet = item(id: 'gilet-036', code: 'GILET-036', variant: 'XL');
    final computer = item(id: 'ord-006', code: 'ORD-006', variant: 'CRESSI');
    await seedItem(gilet);
    await seedItem(computer);

    final loanId = await service.createDirectLoan(
      clubId: clubId,
      member: const MaterialLoanMember(id: 'alice', name: 'Alice DUPONT'),
      items: [gilet, computer],
      expectedReturnDate: DateTime(2026, 8, 21),
      createdByUserId: 'encadrant-1',
      createdByName: 'Encadrant',
    );

    final loan = await firestore
        .collection('clubs')
        .doc(clubId)
        .collection('inventory_loans')
        .doc(loanId)
        .get();
    expect(loan.data()?['statut'], 'actif');
    expect(loan.data()?['caution_amount'], 100);
    expect(loan.data()?['caution_payment_status'], 'paid');
    expect(loan.data()?['itemIds'], ['gilet-036', 'ord-006']);
    expect((loan.data()?['items_snapshot'] as List).length, 2);

    final giletAfter = await firestore
        .collection('clubs')
        .doc(clubId)
        .collection('inventory_items')
        .doc('gilet-036')
        .get();
    expect(giletAfter.data()?['statut'], 'prete');
    expect(giletAfter.data()?['current_loan_id'], loanId);

    final audit = await firestore
        .collection('clubs')
        .doc(clubId)
        .collection('audit_logs')
        .get();
    expect(audit.docs, hasLength(1));
    expect(audit.docs.single.data()['event_type'], 'material_loan_created');
  });

  test('refuses a loan when an article was already reserved', () async {
    final gilet = item(id: 'gilet-036', code: 'GILET-036', variant: 'XL');
    await seedItem(gilet, status: 'prete');

    await expectLater(
      service.createDirectLoan(
        clubId: clubId,
        member: const MaterialLoanMember(id: 'alice', name: 'Alice DUPONT'),
        items: [gilet],
        expectedReturnDate: DateTime(2026, 8, 21),
        createdByUserId: 'encadrant-1',
        createdByName: 'Encadrant',
      ),
      throwsA(isA<StateError>()),
    );

    final loans = await firestore
        .collection('clubs')
        .doc(clubId)
        .collection('inventory_loans')
        .get();
    expect(loans.docs, isEmpty);
  });

  test('reserves material until an EPC QR caution is confirmed', () async {
    final gilet = item(id: 'gilet-036', code: 'GILET-036', variant: 'XL');
    await seedItem(gilet);

    final loanId = await service.createPendingQrLoan(
      clubId: clubId,
      member: const MaterialLoanMember(id: 'alice', name: 'Alice DUPONT'),
      items: [gilet],
      expectedReturnDate: DateTime(2026, 8, 21),
      createdByUserId: 'encadrant-1',
      createdByName: 'Encadrant',
      paymentMode: 'epc_qr_email',
    );

    var loan = await firestore
        .collection('clubs')
        .doc(clubId)
        .collection('inventory_loans')
        .doc(loanId)
        .get();
    expect(loan.data()?['statut'], 'attente_caution');
    expect(loan.data()?['caution_payment_status'], 'unpaid');
    expect(loan.data()?['handover_status'], 'blocked');

    var inventory = await firestore
        .collection('clubs')
        .doc(clubId)
        .collection('inventory_items')
        .doc(gilet.id)
        .get();
    expect(inventory.data()?['statut'], 'reserve');
    expect(inventory.data()?['current_loan_id'], loanId);

    await service.confirmPendingPaymentAndHandover(
      clubId: clubId,
      loanId: loanId,
      confirmedByUserId: 'encadrant-1',
      confirmedByName: 'Encadrant',
      paymentConfirmed: true,
    );

    loan = await loan.reference.get();
    inventory = await inventory.reference.get();
    expect(loan.data()?['statut'], 'actif');
    expect(loan.data()?['caution_payment_status'], 'paid');
    expect(inventory.data()?['statut'], 'prete');
  });
}
