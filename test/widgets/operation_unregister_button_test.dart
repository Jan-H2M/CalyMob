import 'package:calymob/widgets/operation_unregister_button.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Widget subject({
    required bool deadlinePassed,
    String? inscriptionId = 'visible-inscription',
    required ValueChanged<String> onPressed,
    VoidCallback? onMissingInscription,
  }) {
    return MaterialApp(
      home: Scaffold(
        body: OperationUnregisterButton(
          deadlinePassed: deadlinePassed,
          inscriptionId: inscriptionId,
          onPressed: onPressed,
          onMissingInscription: onMissingInscription ?? () {},
        ),
      ),
    );
  }

  testWidgets('open registration exposes the withdrawal action',
      (tester) async {
    var calls = 0;
    await tester.pumpWidget(subject(
      deadlinePassed: false,
      onPressed: (_) => calls++,
    ));

    expect(find.text('Annuler'), findsOneWidget);
    await tester.tap(find.text('Annuler'));
    expect(calls, 1);
  });

  testWidgets('passed deadline disables the withdrawal action', (tester) async {
    var calls = 0;
    await tester.pumpWidget(subject(
      deadlinePassed: true,
      onPressed: (_) => calls++,
    ));

    expect(find.text('Annuler'), findsOneWidget);
    await tester.tap(find.text('Annuler'));
    expect(calls, 0);
  });

  testWidgets('forwards the loaded inscription id exactly once',
      (tester) async {
    final receivedIds = <String>[];
    const loadedInscriptionId = 'active-visible-inscription';
    await tester.pumpWidget(subject(
      deadlinePassed: false,
      inscriptionId: loadedInscriptionId,
      onPressed: receivedIds.add,
    ));

    await tester.tap(find.text('Annuler'));

    expect(receivedIds, [loadedInscriptionId]);
  });

  testWidgets('missing loaded inscription fails closed before the action',
      (tester) async {
    var actionCalls = 0;
    var missingCalls = 0;
    await tester.pumpWidget(subject(
      deadlinePassed: false,
      inscriptionId: '   ',
      onPressed: (_) => actionCalls++,
      onMissingInscription: () => missingCalls++,
    ));

    await tester.tap(find.text('Annuler'));

    expect(actionCalls, 0);
    expect(missingCalls, 1);
  });
}
