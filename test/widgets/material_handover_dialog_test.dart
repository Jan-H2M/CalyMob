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
    List<String>? result;
    await tester.pumpWidget(MaterialApp(
        home: Builder(
            builder: (context) => Scaffold(
                  body: TextButton(
                      onPressed: () async {
                        result = await showDialog<List<String>>(
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
        find.textContaining('Aucun article n’a été réservé'), findsOneWidget);
    await tester.tap(find.byType(DropdownButtonFormField<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('G-001 · SER-001').last);
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
    expect(result, ['real-id']);
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
