import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/models/material_loan.dart';
import 'package:calymob/models/loan_liability_acceptance.dart';
import 'package:calymob/services/material_return_service.dart';

void main() {
  late FakeFirebaseFirestore db;
  late MaterialReturnService service;
  final start = DateTime(2027, 1, 1), end = DateTime(2027, 1, 3);
  const lines = [
    MaterialLoanRequestLine(
        category: 'gilet', quantity: 1, attributes: {'option': 'M'})
  ];
  setUp(() {
    db = FakeFirebaseFirestore();
    service = MaterialReturnService(firestore: db);
  });
  Future<String> create(
          {bool accepted = false, String note = 'Sortie FICTIVE'}) =>
      service.submitLoanRequestLines(
          clubId: 'dev-fictional',
          memberId: 'dev-member',
          memberName: 'FICTIF',
          memberEmail: '',
          lines: lines,
          requestedStartDate: start,
          expectedReturnDate: end,
          notes: note,
          liabilityAccepted: accepted);
  test('missing acceptance and oversized note write nothing', () async {
    await expectLater(create(), throwsStateError);
    await expectLater(
        create(accepted: true, note: 'x' * 501), throwsArgumentError);
    expect(
        (await db
                .collection('clubs/dev-fictional/inventory_loan_requests')
                .get())
            .docs,
        isEmpty);
  });
  test(
      'accepted submission saves note, uid, terms and server timestamp together',
      () async {
    final id = await create(accepted: true);
    final ref = db.doc('clubs/dev-fictional/inventory_loan_requests/$id');
    final raw = (await ref.get()).data()!;
    expect(raw['notes'], 'Sortie FICTIVE');
    expect(raw['liability_acceptance']['accepted_by_uid'], 'dev-member');
    expect(raw['liability_acceptance']['accepted_at'], isA<Timestamp>());
    expect(raw['liability_acceptance']['terms_text'], loanLiabilityTermsText);
    final request = MaterialLoanRequest.fromFirestore(await ref.get());
    expect(request.liabilityAcceptance?.acceptedByUid, 'dev-member');
    expect(
        request.liabilityAcceptance?.termsVersion, loanLiabilityTermsVersion);
    expect(
        (await db.collection('clubs/dev-fictional/inventory_items').get()).docs,
        isEmpty);
  });
  test(
      'amendment needs new explicit checkbox but never replaces original evidence',
      () async {
    final id = await create(accepted: true);
    final ref = db.doc('clubs/dev-fictional/inventory_loan_requests/$id');
    final before = (await ref.get()).data()!['liability_acceptance'];
    Future<void> edit(String member, bool accepted) =>
        service.updateLoanRequestLines(
            clubId: 'dev-fictional',
            requestId: id,
            memberId: member,
            liabilityAccepted: accepted,
            lines: lines,
            requestedStartDate: start,
            expectedReturnDate: end,
            notes: 'Nouvelle remarque');
    await expectLater(edit('dev-member', false), throwsStateError);
    await expectLater(edit('another-member', true), throwsStateError);
    await edit('dev-member', true);
    expect((await ref.get()).data()!['liability_acceptance'], before);
    expect((await ref.get()).data()!['notes'], 'Nouvelle remarque');
    await ref.update({'status': 'approved'});
    await expectLater(edit('dev-member', true), throwsStateError);
  });
  test('legacy remains visibly unaccepted until a real new acknowledgement',
      () async {
    final ref = db.doc('clubs/dev-fictional/inventory_loan_requests/old');
    await ref.set({
      'memberId': 'dev-member',
      'memberName': 'FICTIF',
      'status': 'submitted'
    });
    expect(
        MaterialLoanRequest.fromFirestore(await ref.get()).liabilityAcceptance,
        isNull);
    await service.updateLoanRequestLines(
        clubId: 'dev-fictional',
        requestId: 'old',
        memberId: 'dev-member',
        liabilityAccepted: true,
        lines: lines,
        requestedStartDate: start,
        expectedReturnDate: end);
    expect(
        MaterialLoanRequest.fromFirestore(await ref.get()).liabilityAcceptance,
        isNotNull);
  });
}
