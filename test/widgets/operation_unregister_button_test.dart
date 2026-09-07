import 'package:calymob/widgets/operation_unregister_button.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Widget subject({
    required bool deadlinePassed,
    required VoidCallback onPressed,
  }) {
    return MaterialApp(
      home: Scaffold(
        body: OperationUnregisterButton(
          deadlinePassed: deadlinePassed,
          onPressed: onPressed,
        ),
      ),
    );
  }

  testWidgets('open registration exposes the withdrawal action',
      (tester) async {
    var calls = 0;
    await tester.pumpWidget(subject(
      deadlinePassed: false,
      onPressed: () => calls++,
    ));

    expect(find.text('Annuler'), findsOneWidget);
    await tester.tap(find.text('Annuler'));
    expect(calls, 1);
  });

  testWidgets('passed deadline disables the withdrawal action', (tester) async {
    var calls = 0;
    await tester.pumpWidget(subject(
      deadlinePassed: true,
      onPressed: () => calls++,
    ));

    expect(find.text('Annuler'), findsOneWidget);
    await tester.tap(find.text('Annuler'));
    expect(calls, 0);
  });
}
