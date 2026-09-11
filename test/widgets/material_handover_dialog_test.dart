import 'package:calymob/models/material_loan.dart';
import 'package:calymob/widgets/material_handover_dialog.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const line = MaterialLoanRequestedLine(
      typeId: 'gilet', typeName: 'Gilet', variant: 'XL');
  const item = MaterialLoanItem(
      id: 'real-id',
      code: 'G-001',
      name: 'Gilet',
      typeId: 'gilet',
      variant: 'XL',
      status: 'disponible',
      serialNumber: 'SER-001');

  testWidgets(
      'requires physical selection and payment before returning handover IDs',
      (tester) async {
    MaterialHandoverResult? result;
    await tester.pumpWidget(MaterialApp(
        home: Builder(
            builder: (context) => Scaffold(
                  body: TextButton(
                      onPressed: () async {
                        result = await showDialog<MaterialHandoverResult>(
                            context: context,
                            builder: (_) => MaterialHandoverDialog(
                                lines: const [line],
                                availableItems: Stream.value([item]),
                                cautionAmount: 100));
                      },
                      child: const Text('Open')),
                ))));
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    expect(
        tester
            .widget<FilledButton>(
                find.widgetWithText(FilledButton, 'Confirmer la remise'))
            .onPressed,
        isNull);
    expect(
        find.textContaining('Saisissez ou scannez le NR. CDC'), findsOneWidget);
    await tester.enterText(find.byType(TextFormField).first, 'G-001');
    await tester.pumpAndSettle();
    expect(
        tester
            .widget<FilledButton>(
                find.widgetWithText(FilledButton, 'Confirmer la remise'))
            .onPressed,
        isNull);
    await tester.tap(find.byType(CheckboxListTile));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Confirmer la remise'));
    await tester.pumpAndSettle();
    expect(result?.itemIds, ['real-id']);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'no stock keeps confirmation disabled even when payment is checked',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: MaterialHandoverDialog(
            lines: const [line],
            availableItems: Stream.value([]),
            cautionAmount: 100)));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(CheckboxListTile));
    await tester.pumpAndSettle();
    expect(
        tester
            .widget<FilledButton>(
                find.widgetWithText(FilledButton, 'Confirmer la remise'))
            .onPressed,
        isNull);
    expect(tester.takeException(), isNull);
  });
}
