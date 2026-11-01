import 'package:calymob/models/material_loan.dart';
import 'package:calymob/services/material_return_service.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const club = 'dev-fictional';
  const member = 'fictional-borrower';
  final start = DateTime(2027, 1, 1), end = DateTime(2027, 1, 3);
  const lines = [
    MaterialLoanRequestLine(category: 'gilet', attributes: {'option': 'M'})
  ];
  late FakeFirebaseFirestore db;
  late MaterialReturnService service;
  setUp(() {
    db = FakeFirebaseFirestore();
    service = MaterialReturnService(firestore: db);
  });

  Future<String> create({bool accepted = false}) =>
      service.submitLoanRequestLines(
        clubId: club,
        memberId: member,
        memberName: 'FICTIF',
        memberEmail: '',
        lines: lines,
        requestedStartDate: start,
        expectedReturnDate: end,
        liabilityAccepted: accepted,
        notes: 'Sortie FICTIVE',
      );

  test('normal service excludes declaration and evidence for both input values',
      () async {
    expect(service.liabilityDeclarationEnabled, isFalse);
    for (final accepted in [false, true]) {
      final id = await create(accepted: accepted);
      final raw =
          (await db.doc('clubs/$club/inventory_loan_requests/$id').get())
              .data()!;
      expect(raw.containsKey('liability_acceptance'), isFalse);
      expect(raw['notes'], 'Sortie FICTIVE');
      expect(raw['memberId'], member);
    }
  });

  test(
      'numbered-item request also needs no declaration and creates no evidence',
      () async {
    final id = await service.submitLoanRequest(
      clubId: club,
      memberId: member,
      memberName: 'FICTIF',
      memberEmail: '',
      items: const [
        MaterialLoanItem(
            id: 'fictional-item',
            code: 'G-001',
            name: 'Gilet',
            status: 'disponible')
      ],
      requestedStartDate: start,
      expectedReturnDate: end,
    );
    final raw =
        (await db.doc('clubs/$club/inventory_loan_requests/$id').get()).data()!;
    expect(raw.containsKey('liability_acceptance'), isFalse);
    expect(raw['itemIds'], ['fictional-item']);
  });

  test('normal amendment adds no agreement and preserves existing evidence',
      () async {
    for (final existingEvidence in [false, true]) {
      final id = await create();
      final ref = db.doc('clubs/$club/inventory_loan_requests/$id');
      final historic = {'historic': 'preserve FICTIVE evidence verbatim'};
      if (existingEvidence) {
        await ref.update({'liability_acceptance': historic});
      }
      await service.updateLoanRequestLines(
        clubId: club,
        requestId: id,
        memberId: member,
        lines: lines,
        requestedStartDate: start,
        expectedReturnDate: end,
        notes: 'Remarque FICTIVE modifiée',
      );
      final raw = (await ref.get()).data()!;
      expect(raw.containsKey('liability_acceptance'), existingEvidence);
      if (existingEvidence) expect(raw['liability_acceptance'], historic);
      expect(raw['notes'], 'Remarque FICTIVE modifiée');
    }
  });

  test('exclusion does not relax amendment ownership or handled-state checks',
      () async {
    final id = await create();
    Future<void> edit(String uid) => service.updateLoanRequestLines(
          clubId: club,
          requestId: id,
          memberId: uid,
          lines: lines,
          requestedStartDate: start,
          expectedReturnDate: end,
        );
    await expectLater(edit('other-fictional-member'), throwsStateError);
    await db
        .doc('clubs/$club/inventory_loan_requests/$id')
        .update({'status': 'approved'});
    await expectLater(edit(member), throwsStateError);
  });

  test('DEV opt-in is explicit and rejects a non-fictional club before writes',
      () async {
    final dev = MaterialReturnService.forDevLoanLiability(firestore: db);
    expect(dev.liabilityDeclarationEnabled, isTrue);
    await expectLater(
      dev.submitLoanRequestLines(
        clubId: 'calypso',
        memberId: member,
        memberName: 'FICTIF',
        memberEmail: '',
        lines: lines,
        requestedStartDate: start,
        expectedReturnDate: end,
        liabilityAccepted: true,
      ),
      throwsStateError,
    );
    expect(
        (await db.collection('clubs/calypso/inventory_loan_requests').get())
            .docs,
        isEmpty);
  });
}
