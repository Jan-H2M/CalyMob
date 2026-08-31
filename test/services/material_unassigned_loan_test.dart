import 'package:calymob/models/material_loan.dart';
import 'package:calymob/services/material_loan_service.dart';
import 'package:calymob/services/material_return_service.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late FakeFirebaseFirestore db;
  late MaterialLoanService service;
  const line = MaterialLoanRequestedLine(
      typeId: 'gilet', typeName: 'Gilet', variant: 'XL');
  setUp(() {
    db = FakeFirebaseFirestore();
    service = MaterialLoanService(firestore: db);
  });
  Future<String> request(
          {List<MaterialLoanRequestedLine> lines = const [line]}) =>
      service.createPendingTypeLoan(
          clubId: 'club',
          member: const MaterialLoanMember(id: 'member', name: 'Membre'),
          requestedLines: lines,
          expectedReturnDate: DateTime(2026, 9, 10),
          createdByUserId: 'staff',
          createdByName: 'Staff',
          paymentMode: 'epc_qr_email');
  Future<void> seed(String id,
          {String status = 'disponible',
          String? owner,
          String variant = 'XL',
          String? typeId = 'gilet'}) =>
      db.doc('clubs/club/inventory_items/$id').set({
        'typeId': typeId,
        'nom': 'Gilet',
        'code': 'G-$id',
        'taille': variant,
        'numero_serie': 'SER-$id',
        'statut': status,
        if (owner != null) 'current_loan_id': owner
      });
  Future<void> handover(String id,
          {List<String> items = const ['item'], bool paid = true}) =>
      service.confirmPendingPaymentAndHandover(
          clubId: 'club',
          loanId: id,
          confirmedByUserId: 'staff',
          confirmedByName: 'Staff',
          selectedItemIds: items,
          paymentConfirmed: paid);

  test('requests do not reserve stock and multiple requests can coexist',
      () async {
    await seed('item');
    final first = await request();
    final second = await request();
    expect(first, isNot(second));
    final inventory =
        (await db.doc('clubs/club/inventory_items/item').get()).data()!;
    expect(inventory['statut'], 'disponible');
    expect(inventory.containsKey('current_loan_id'), false);
    final loan =
        (await db.doc('clubs/club/inventory_loans/$first').get()).data()!;
    expect(loan['itemIds'], isEmpty);
    expect(loan['items_snapshot'], isEmpty);
    expect(loan['requested_lines'], [line.toMap()]);
    expect(loan['caution_amount'], 100);
    expect(loan['reservation_policy'], 'none');
    expect(loan['caution_payment_status'], 'unpaid');
  });
  test('catalog includes lent items for requests without a stock guarantee',
      () async {
    await seed('lent', status: 'prete', owner: 'other');
    final catalog = await MaterialReturnService(firestore: db)
        .watchRequestCatalog('club')
        .first;
    expect(catalog.single.id, 'lent');
  });
  test(
      'handover assigns actual current item and serial after payment confirmation',
      () async {
    final id = await request();
    await seed('item');
    await handover(id);
    final loan = (await db.doc('clubs/club/inventory_loans/$id').get()).data()!;
    expect(loan['itemIds'], ['item']);
    expect(loan['items_snapshot'][0]['numero_serie'], 'SER-item');
    expect(loan['statut'], 'actif');
    expect(loan['caution_payment_status'], 'paid');
    expect(
        (await db.doc('clubs/club/inventory_items/item').get())
            .data()!['current_loan_id'],
        id);
    await expectLater(handover(id), throwsStateError);
  });
  test('missing payment confirmation leaves request and inventory untouched',
      () async {
    final id = await request();
    await seed('item');
    await expectLater(handover(id, paid: false), throwsStateError);
    expect(
        (await db.doc('clubs/club/inventory_items/item').get())
            .data()!['statut'],
        'disponible');
  });
  test('refuses a currently unavailable item', () async {
    final id = await request();
    await seed('item', status: 'prete');
    await expectLater(handover(id), throwsStateError);
  });
  test('refuses inconsistent ownership even if status says available',
      () async {
    final id = await request();
    await seed('item', owner: 'other');
    await expectLater(handover(id), throwsStateError);
  });
  test(
      'refuses current variant mismatch without any partial inventory assignment',
      () async {
    final id = await request();
    await seed('item', variant: 'M');
    await expectLater(handover(id), throwsStateError);
    expect(
        (await db.doc('clubs/club/inventory_items/item').get())
            .data()!['statut'],
        'disponible');
  });
  test('refuses current type mismatch', () async {
    final id = await request();
    await seed('item', typeId: 'bouteille');
    await expectLater(handover(id), throwsStateError);
  });
  test('refuses empty and duplicate selection', () async {
    final id = await request();
    await seed('item');
    await expectLater(handover(id, items: []), throwsStateError);
    await expectLater(handover(id, items: ['item', 'item']), throwsStateError);
  });
  test('another request cannot take an already handed-over item', () async {
    final first = await request();
    final second = await request();
    await seed('item');
    await handover(first);
    await expectLater(handover(second), throwsStateError);
    expect(
        (await db.doc('clubs/club/inventory_loans/$second').get())
            .data()!['itemIds'],
        isEmpty);
  });
  test('competing handovers cannot both own one item', () async {
    final first = await request();
    final second = await request();
    await seed('item');
    final results = await Future.wait([first, second].map((id) async {
      try {
        await handover(id);
        return true;
      } on StateError {
        return false;
      }
    }));
    expect(results.where((succeeded) => succeeded).length, 1);
  },
      skip:
          'Requires Firestore emulator: fake_cloud_firestore 4.0.1 uses a dummy transaction without conflict detection/retries.');

  test('legacy null type ID uses the current item label', () async {
    final id = await request(lines: [
      const MaterialLoanRequestedLine(typeName: 'Gilet', variant: 'XL')
    ]);
    await seed('item', typeId: null);
    await handover(id);
    expect(
        (await db.doc('clubs/club/inventory_loans/$id').get())
            .data()!['statut'],
        'actif');
  });
  test('rejects invalid quantities and duplicate requested types', () async {
    expect(() => request(lines: []), throwsArgumentError);
    expect(() => request(lines: [line, line]), throwsArgumentError);
    expect(
        () => request(lines: [
              const MaterialLoanRequestedLine(
                  typeName: 'Gilet', variant: 'XL', quantity: 0)
            ]),
        throwsArgumentError);
  });
}
