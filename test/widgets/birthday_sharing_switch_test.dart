import 'package:calymob/widgets/profile/birthday_sharing_switch.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets(
    'shows the shared birthday privacy explanation and current value',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: BirthdaySharingSwitch(value: false, onChanged: (_) {}),
          ),
        ),
      );

      expect(find.text('Partager mon anniversaire'), findsOneWidget);
      expect(find.textContaining('Seuls le jour et le mois'), findsOneWidget);
      expect(find.textContaining('vœux du club'), findsOneWidget);
      expect(tester.widget<Switch>(find.byType(Switch)).value, isFalse);
    },
  );

  testWidgets('forwards the updated preference to the owning profile screen', (
    tester,
  ) async {
    bool? updatedValue;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: BirthdaySharingSwitch(
            value: true,
            onChanged: (value) => updatedValue = value,
          ),
        ),
      ),
    );

    await tester.tap(find.byType(Switch));

    expect(updatedValue, isFalse);
  });
}
