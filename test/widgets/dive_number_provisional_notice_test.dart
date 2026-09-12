import 'package:calymob/utils/dive_number_policy.dart';
import 'package:calymob/widgets/dive_number_provisional_notice.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('automatic number stays visibly provisional until server save',
      (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: DiveNumberProvisionalNotice(visible: true),
        ),
      ),
    );

    expect(find.byKey(const ValueKey('dive-number-provisional-notice')),
        findsOneWidget);
    expect(find.text(automaticDiveNumberNotice), findsOneWidget);
    expect(automaticDiveNumberNotice, contains('numéro définitif'));
    expect(automaticDiveNumberNotice, contains('après l’enregistrement'));
  });

  testWidgets('no provisional notice is shown for a definitive/manual number',
      (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: DiveNumberProvisionalNotice(visible: false),
        ),
      ),
    );

    expect(find.text(automaticDiveNumberNotice), findsNothing);
  });
}
