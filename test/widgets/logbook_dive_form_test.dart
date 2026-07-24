import 'package:calymob/widgets/logbook_dive_form.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Widget form({Widget? assistance}) {
    const fields = [
      Text('DATE & HEURES'),
      Text('LIEU'),
      Text('PROFONDEUR · DURÉE'),
      Text('COMPTEUR'),
      Text('ZONE'),
      Text('ÉQUIPEMENT'),
      Text('BINÔMES'),
      Text('NOTES'),
    ];
    return MaterialApp(
      home: Scaffold(
        body: ListView(
          children: [
            if (assistance != null) assistance,
            const LogbookDiveForm(
              key: ValueKey('canonical-logbook-dive-form'),
              children: fields,
            ),
          ],
        ),
      ),
    );
  }

  testWidgets('manual renders the canonical historical form without a banner',
      (tester) async {
    await tester.pumpWidget(form());

    expect(find.byKey(const ValueKey('canonical-logbook-dive-form')),
        findsOneWidget);
    expect(find.text('SAISIE PAR DICTÉE'), findsNothing);
    expect(find.text('DATE & HEURES'), findsOneWidget);
    expect(find.text('NOTES'), findsOneWidget);
  });

  testWidgets('dictation only adds assistance above the same canonical form',
      (tester) async {
    await tester.pumpWidget(
      form(assistance: const Text('SAISIE PAR DICTÉE')),
    );

    final banner = tester.getTopLeft(find.text('SAISIE PAR DICTÉE'));
    final canonical = tester
        .getTopLeft(find.byKey(const ValueKey('canonical-logbook-dive-form')));

    expect(find.byType(LogbookDiveForm), findsOneWidget);
    expect(banner.dy, lessThan(canonical.dy));
    expect(find.text('COMPTEUR'), findsOneWidget);
  });
}
