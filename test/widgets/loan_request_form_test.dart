import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:calymob/screens/stock/material_returns_screen.dart';
import 'package:calymob/services/material_return_service.dart';

void main() {
  testWidgets(
      'actual request form stays disabled until borrower explicitly accepts and saves note atomically',
      (t) async {
    t.view.physicalSize = const Size(600, 1100);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    final db = FakeFirebaseFirestore();
    await t.pumpWidget(MaterialApp(
        home: Scaffold(
            body: Builder(
                builder: (context) => TextButton(
                    onPressed: () => showMaterialLoanRequestForm(
                        context: context,
                        service: MaterialReturnService(firestore: db),
                        clubId: 'dev-fictional',
                        memberId: 'dev-borrower',
                        memberName: 'FICTIF',
                        memberEmail: ''),
                    child: const Text('Ouvrir'))))));
    await t.tap(find.text('Ouvrir'));
    await t.pumpAndSettle();
    expect(
        t
            .widget<ElevatedButton>(
                find.byWidgetPredicate((w) => w is ElevatedButton))
            .onPressed,
        isNull);
    await t.enterText(
        find.widgetWithText(TextField, 'Remarque'), 'Sortie FICTIVE');
    await t.tap(find.byType(Switch).first);
    await t.pumpAndSettle();
    final checkbox = find.byKey(const Key('loan-liability-checkbox'));
    await t.scrollUntilVisible(checkbox, 300,
        scrollable: find.descendant(of: find.byType(ListView), matching: find.byType(Scrollable)).first);
    await t.ensureVisible(checkbox);
    await t.pumpAndSettle();
    await t.tap(checkbox);
    await t.pump();
    await t.tap(find.text('Envoyer la demande (1)'));
    await t.pumpAndSettle();
    final docs = (await db
            .collection('clubs/dev-fictional/inventory_loan_requests')
            .get())
        .docs;
    expect(docs, hasLength(1));
    expect(docs.single.data()['notes'], 'Sortie FICTIVE');
    expect(docs.single.data()['liability_acceptance']['accepted_by_uid'],
        'dev-borrower');
    expect(t.takeException(), isNull);
  });
}
