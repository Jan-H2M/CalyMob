import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:calymob/models/material_loan.dart';
import 'package:calymob/services/material_return_service.dart';

void main() {
  const clubId = 'club-test';

  test('creates a treasurer refund request instead of paying directly',
      () async {
    final firestore = FakeFirebaseFirestore();
    final service = MaterialReturnService(firestore: firestore);
    const itemId = 'gilet-036';
    const loanId = 'loan-001';

    await firestore
        .collection('clubs')
        .doc(clubId)
        .collection('inventory_items')
        .doc(itemId)
        .set({'statut': 'prete', 'current_loan_id': loanId});
    await firestore
        .collection('clubs')
        .doc(clubId)
        .collection('inventory_loans')
        .doc(loanId)
        .set({'statut': 'actif'});

    const loan = MaterialLoan(
      id: loanId,
      loanNumber: 'PRET-2026-0001',
      memberId: 'alice',
      memberName: 'Alice DUPONT',
      itemIds: [itemId],
      cautionAmount: 100,
      cautionStatus: 'paid',
      status: 'actif',
      items: [],
    );

    final result = await service.validateReturn(
      clubId: clubId,
      loan: loan,
      decision: MaterialReturnDecision.fullRefund,
      refundAmount: 100,
      validatedByUserId: 'encadrant-1',
      validatedByName: 'Encadrant',
      notes: 'Matériel complet.',
    );

    expect(result.refundRequestId, 'loan_caution_refund_loan-001');
    final refundRequest = await firestore
        .collection('clubs')
        .doc(clubId)
        .collection('material_refund_requests')
        .doc(result.refundRequestId)
        .get();
    expect(refundRequest.data()?['status'], 'pending_treasurer');
    expect(refundRequest.data()?['amount'], 100);

    final item = await firestore
        .collection('clubs')
        .doc(clubId)
        .collection('inventory_items')
        .doc(itemId)
        .get();
    expect(item.data()?['statut'], 'disponible');
    expect(item.data()?['current_loan_id'], isNull);

    final legacyClaims = await firestore
        .collection('clubs')
        .doc(clubId)
        .collection('demandes_remboursement')
        .get();
    final canonicalClaims = await firestore
        .collection('clubs')
        .doc(clubId)
        .collection('expense_claims')
        .get();
    expect(legacyClaims.docs, isEmpty);
    expect(canonicalClaims.docs, isEmpty);
  });
}
