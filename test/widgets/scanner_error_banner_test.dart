import 'package:calymob/widgets/scanner_error_banner.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
      'keeps the actual callable rejection, including the existing session-date explanation',
      () {
    const reason = 'Scan uniquement pour une séance piscine actuelle.';
    expect(
        scannerActionErrorMessage(FirebaseFunctionsException(
            code: 'failed-precondition', message: reason)),
        reason);
  });

  test('index failures do not expose a console link or claim success', () {
    final text = scannerActionErrorMessage(FirebaseException(
        plugin: 'cloud_firestore',
        code: 'failed-precondition',
        message:
            'The query requires a COLLECTION_ASC index: https://console.firebase.google.com/private'));
    expect(text, contains('index'));
    expect(text, contains('Aucune modification'));
    expect(text, isNot(contains('https://')));
  });

  test('ambiguous callable transport failure asks to check the list', () {
    final text = scannerActionErrorMessage(
        FirebaseFunctionsException(code: 'internal', message: 'INTERNAL'));
    expect(text, contains('Vérifiez la liste'));
    expect(text, isNot(contains('INTERNAL')));
  });

  testWidgets(
      'rejection stays in front of the underlying page, inside the scanner sheet',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: Builder(
                builder: (context) => TextButton(
                    onPressed: () => showModalBottomSheet<void>(
                        context: context,
                        builder: (_) => const Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text('Scanner Présence'),
                                  ScannerErrorBanner(
                                      message:
                                          'Scan uniquement pour une séance piscine actuelle.'),
                                  Text('Présents : 0'),
                                ])),
                    child: const Text('Scanner'))))));
    await tester.tap(find.text('Scanner'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('scanner-action-error')).hitTestable(),
        findsOneWidget);
    expect(find.text('Scan uniquement pour une séance piscine actuelle.'),
        findsOneWidget);
    expect(find.text('Présents : 0'), findsOneWidget);
    expect(find.text('Enregistré!'), findsNothing);
  });
}
