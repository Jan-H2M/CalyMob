import 'package:calymob/widgets/logbook_fields_grid.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('boolean fields toggle directly without opening an editor',
      (tester) async {
    var dp = false;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, setState) {
              return LogbookFieldsGrid(
                fields: [
                  LogbookGridField(
                    id: 'dp',
                    label: 'DP',
                    selected: dp,
                    onToggle: (value) => setState(() => dp = value),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );

    expect(find.text('désactivé'), findsNothing);
    expect(find.byType(TextField), findsNothing);

    await tester.tap(find.text('DP'));
    await tester.pump();

    expect(dp, isTrue);
    expect(find.text('Oui'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);

    await tester.tap(find.text('DP'));
    await tester.pump();

    expect(dp, isFalse);
    expect(find.text('Oui'), findsNothing);
  });

  testWidgets('value cards delegate to their typed editor callback',
      (tester) async {
    var taps = 0;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: LogbookFieldsGrid(
            fields: [
              LogbookGridField(
                id: 'date',
                label: 'Date',
                value: '24/07/2026',
                onTap: () => taps++,
              ),
            ],
          ),
        ),
      ),
    );

    await tester.tap(find.text('Date'));
    await tester.pump();

    expect(taps, 1);
  });
}
