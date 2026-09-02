import 'dart:async';

import 'package:calymob/widgets/payment_communication_copy_button.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('copies the exact communication and confirms what to do next', (
    tester,
  ) async {
    MethodCall? clipboardCall;
    var callbackCount = 0;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') clipboardCall = call;
      return null;
    });

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: PaymentCommunicationCopyButton(
            communication: '+++123/4567/89012+++',
            onCopied: () => callbackCount++,
          ),
        ),
      ),
    );

    await tester.tap(find.text('Copier la communication'));
    await tester.pump();

    expect(clipboardCall?.arguments, {'text': '+++123/4567/89012+++'});
    expect(callbackCount, 1);
    expect(
      find.textContaining('Collez-la dans le champ communication'),
      findsOneWidget,
    );
  });

  testWidgets('is disabled when no communication is available', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: PaymentCommunicationCopyButton(communication: '   '),
        ),
      ),
    );

    final button = tester.widget<OutlinedButton>(find.byType(OutlinedButton));
    expect(button.onPressed, isNull);
  });

  testWidgets('does not call back after disposal while clipboard is pending', (
    tester,
  ) async {
    final clipboardCompleter = Completer<void>();
    var callbackCount = 0;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') {
        await clipboardCompleter.future;
      }
      return null;
    });

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: PaymentCommunicationCopyButton(
            communication: '+++123/4567/89012+++',
            onCopied: () => callbackCount++,
          ),
        ),
      ),
    );

    await tester.tap(find.text('Copier la communication'));
    await tester.pumpWidget(const MaterialApp(home: SizedBox.shrink()));
    clipboardCompleter.complete();
    await tester.pump();

    expect(callbackCount, 0);
    expect(find.byType(SnackBar), findsNothing);
  });
}
