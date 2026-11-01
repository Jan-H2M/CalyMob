import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:calymob/screens/stock/material_returns_screen.dart';
import 'package:calymob/services/material_return_service.dart';
import 'package:calymob/models/material_loan.dart';

void main() {
  for (final editing in [false, true]) {
    testWidgets(
        'normal ${editing ? 'amendment' : 'request'} excludes declaration and saves without agreement',
        (t) async {
      t.view.physicalSize = const Size(600, 1100);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.resetPhysicalSize);
      addTearDown(t.view.resetDevicePixelRatio);
      final db = FakeFirebaseFirestore();
      MaterialLoanRequest? request;
      if (editing) {
        final ref = db.doc('clubs/dev-fictional/inventory_loan_requests/old');
        await ref.set({
          'memberId': 'dev-borrower',
          'memberName': 'FICTIF',
          'status': 'submitted',
          'lines': [
            const MaterialLoanRequestLine(
                category: 'gilet', attributes: {'option': 'M'}).toMap()
          ],
        });
        request = MaterialLoanRequest.fromFirestore(await ref.get());
      }
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
                          memberEmail: '',
                          request: request),
                      child: const Text('Open normal'))))));
      await t.tap(find.text('Open normal'));
      await t.pumpAndSettle();
      if (!editing) {
        await t.tap(find.byType(Switch).first);
        await t.pumpAndSettle();
      }
      final submit = find.byWidgetPredicate((w) => w is ElevatedButton);
      await t.ensureVisible(submit);
      await t.pumpAndSettle();
      expect(find.byKey(const Key('loan-liability-checkbox')), findsNothing);
      expect(t.widget<ElevatedButton>(submit).onPressed, isNotNull);
      await t.tap(submit);
      await t.pumpAndSettle();
      final docs = (await db
              .collection('clubs/dev-fictional/inventory_loan_requests')
              .get())
          .docs;
      expect(docs, hasLength(1));
      expect(docs.single.data().containsKey('liability_acceptance'), isFalse);
      expect(t.takeException(), isNull);
    });
  }

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
                        service: MaterialReturnService.forDevLoanLiability(
                            firestore: db),
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
        scrollable: find
            .descendant(
                of: find.byKey(const Key('loan-request-form-scroll')),
                matching: find.byType(Scrollable))
            .first);
    await t.ensureVisible(checkbox);
    await t.pumpAndSettle();
    await t.tap(checkbox);
    await t.pump();
    await t.ensureVisible(find.text('Envoyer la demande (1)'));
    await t.pumpAndSettle();
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
  for (final keyboard in [0.0, 280.0]) {
    testWidgets('small request form remains usable with keyboard $keyboard',
        (t) async {
      t.view.physicalSize = const Size(360, 640);
      t.view.devicePixelRatio = 1;
      t.view.viewInsets = FakeViewPadding(bottom: keyboard);
      addTearDown(t.view.resetPhysicalSize);
      addTearDown(t.view.resetDevicePixelRatio);
      addTearDown(t.view.resetViewInsets);
      final db = FakeFirebaseFirestore();
      await t.pumpWidget(MaterialApp(
          home: Scaffold(
              body: Builder(
                  builder: (context) => TextButton(
                      onPressed: () => showMaterialLoanRequestForm(
                          context: context,
                          service: MaterialReturnService.forDevLoanLiability(
                              firestore: db),
                          clubId: 'fictional',
                          memberId: 'fictional-borrower',
                          memberName: 'FICTIF',
                          memberEmail: ''),
                      child: const Text('Open'))))));
      await t.tap(find.text('Open'));
      await t.pumpAndSettle();
      expect(t.takeException(), isNull);
      final checkbox = find.byKey(const Key('loan-liability-checkbox'));
      final scroll = find
          .descendant(
              of: find.byKey(const Key('loan-request-form-scroll')),
              matching: find.byType(Scrollable))
          .first;
      await t.scrollUntilVisible(checkbox, 250, scrollable: scroll);
      await t.ensureVisible(checkbox);
      await t.pumpAndSettle();
      expect(t.widget<CheckboxListTile>(checkbox).value, isFalse);
      await t.tap(checkbox);
      await t.pumpAndSettle();
      final submit = find.byWidgetPredicate((w) => w is ElevatedButton);
      await t.ensureVisible(submit);
      await t.pumpAndSettle();
      expect(t.widget<ElevatedButton>(submit).onPressed, isNotNull);
      expect(t.takeException(), isNull);
      expect(
          (await db.collection('clubs/fictional/inventory_loan_requests').get())
              .docs,
          isEmpty);
    });
  }
}
