import 'package:calymob/widgets/scanner_error_banner.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeScannerSheet extends StatefulWidget {
  const _FakeScannerSheet();

  @override
  State<_FakeScannerSheet> createState() => _FakeScannerSheetState();
}

class _FakeScannerSheetState extends State<_FakeScannerSheet> {
  String? _refusal;

  @override
  Widget build(BuildContext context) => Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      const Text('Scanner Présence'),
      if (_refusal != null) ScannerErrorBanner(message: _refusal!),
      TextButton(
        onPressed: () => setState(() {
          _refusal = 'Scan uniquement pour une séance piscine actuelle.';
        }),
        child: const Text('Simuler un refus'),
      ),
      const Text('Présents : 0'),
    ],
  );
}

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
                builder: (_) => const _FakeScannerSheet(),
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
