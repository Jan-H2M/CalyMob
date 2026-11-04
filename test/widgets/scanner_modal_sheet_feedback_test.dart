import 'package:calymob/widgets/scanner_modal_sheet.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('a refusal is visible inside the scanner bottom sheet', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () => showModalBottomSheet<void>(
                context: context,
                isScrollControlled: true,
                builder: (_) => ScannerModalSheet(
                  clubId: 'calypso',
                  operationId: 'session-test',
                  operationTitle: 'Session test',
                  isPiscine: true,
                  scanForTesting: () async {
                    throw FirebaseFunctionsException(
                      code: 'failed-precondition',
                      message:
                          'Scan uniquement pour une séance piscine actuelle.',
                    );
                  },
                ),
              ),
              child: const Text('Ouvrir le scanner'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Ouvrir le scanner'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Simuler un refus'));
    await tester.pump();

    expect(
      find.byKey(const Key('scanner-action-error')).hitTestable(),
      findsOneWidget,
    );
    expect(
      find.text('Scan uniquement pour une séance piscine actuelle.'),
      findsOneWidget,
    );
    expect(find.text('Présents : 0'), findsOneWidget);
    expect(find.text('Enregistré!'), findsNothing);
  });
}
