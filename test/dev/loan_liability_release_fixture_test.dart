import 'package:calymob/models/material_loan.dart';
import 'package:calymob/services/material_return_service.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_test/flutter_test.dart';
import '../support/loan_liability_dev_scenario.dart';

void main() {
  test(
      'release-safe sink accepts only the bound fictitious path and real service payload',
      () async {
    final store = FictionalLoanRequestStore();
    expect(() => store.collection('production'), throwsUnsupportedError);
    expect(
        () => store.collection('clubs').doc('other'), throwsUnsupportedError);
    final service = MaterialReturnService.forDevLoanLiability(firestore: store);
    await service.submitLoanRequestLines(
      clubId: 'dev-fictional',
      memberId: 'dev-borrower',
      memberName: 'FICTIF',
      memberEmail: '',
      lines: const [
        MaterialLoanRequestLine(
            category: 'bouteille', attributes: {'label': 'Bouteille'})
      ],
      requestedStartDate: DateTime(2026, 10, 31),
      expectedReturnDate: DateTime(2026, 11, 7),
      notes: 'Sortie FICTIVE',
      liabilityAccepted: true,
    );
    expect(store.saved?['notes'], 'Sortie FICTIVE');
    expect(store.saved?['liability_acceptance']['accepted_by_uid'],
        'dev-borrower');
    expect(Firebase.apps, isEmpty);
  });
  test('release-safe sink does not silently accept omitted borrower agreement',
      () async {
    final store = FictionalLoanRequestStore();
    await expectLater(
        MaterialReturnService.forDevLoanLiability(firestore: store)
            .submitLoanRequestLines(
          clubId: 'dev-fictional',
          memberId: 'dev-borrower',
          memberName: 'FICTIF',
          memberEmail: '',
          lines: const [
            MaterialLoanRequestLine(category: 'bouteille', attributes: {})
          ],
          requestedStartDate: DateTime(2026, 10, 31),
          expectedReturnDate: DateTime(2026, 11, 7),
        ),
        throwsStateError);
    expect(store.saved, isNull);
    expect(Firebase.apps, isEmpty);
  });
}
