import 'package:calymob/widgets/scanner_modal_sheet.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Widget fixture({required bool accessible, required VoidCallback onUndo}) {
    return MaterialApp(
        home: MediaQuery(
      data: MediaQueryData(accessibleNavigation: accessible),
      child: ScaffoldMessenger(
          child: Scaffold(
              body: Builder(
                  builder: (context) => TextButton(
                        onPressed: () => ScaffoldMessenger.of(context)
                            .showSnackBar(poolRemovalSnackBar('Membre', onUndo,
                                accessibleNavigation:
                                    MediaQuery.accessibleNavigationOf(
                                        context))),
                        child: const Text('Retirer'),
                      )))),
    ));
  }

  testWidgets('confirmation expires with accessible navigation enabled',
      (tester) async {
    await tester.pumpWidget(fixture(accessible: true, onUndo: () {}));
    await tester.tap(find.text('Retirer'));
    await tester.pumpAndSettle();
    expect(find.text('Membre désinscrit'), findsOneWidget);
    expect(find.text('Annuler'), findsOneWidget);
    await tester.pump(const Duration(seconds: 11));
    await tester.pumpAndSettle();
    expect(find.text('Membre désinscrit'), findsNothing);
  });

  testWidgets('undo remains available and the confirmation closes',
      (tester) async {
    var undone = false;
    await tester.pumpWidget(fixture(
        accessible: false,
        onUndo: () {
          undone = true;
        }));
    await tester.tap(find.text('Retirer'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Annuler'));
    await tester.pumpAndSettle();
    expect(undone, isTrue);
    expect(find.text('Membre désinscrit'), findsNothing);
  });

  testWidgets('confirmation expires normally without accessibility mode',
      (tester) async {
    await tester.pumpWidget(fixture(accessible: false, onUndo: () {}));
    await tester.tap(find.text('Retirer'));
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 6));
    await tester.pumpAndSettle();
    expect(find.text('Membre désinscrit'), findsNothing);
  });

  testWidgets('rapid consecutive removals do not leave a confirmation behind',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
          body: Builder(
              builder: (context) => TextButton(
                    onPressed: () {
                      final messenger = ScaffoldMessenger.of(context);
                      messenger.hideCurrentSnackBar();
                      messenger.showSnackBar(poolRemovalSnackBar(
                          'Membre', () {},
                          accessibleNavigation: false));
                    },
                    child: const Text('Retirer'),
                  ))),
    ));
    await tester.tap(find.text('Retirer'));
    await tester.pump();
    await tester.tap(find.text('Retirer'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 6));
    await tester.pumpAndSettle();
    expect(find.text('Membre désinscrit'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
