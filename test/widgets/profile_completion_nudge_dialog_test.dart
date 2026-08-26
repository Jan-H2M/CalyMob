import 'package:calymob/widgets/profile/profile_completion_nudge_dialog.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('shows both missing profile actions and a three day reminder',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: ProfileCompletionNudgeDialog(
          needsPhoto: true,
          needsEmergencyContact: true,
          onAddPhoto: () {},
          onAddEmergencyContact: () {},
          onRemindLater: () {},
        ),
      ),
    ));

    expect(find.text('Ajouter ma photo'), findsOneWidget);
    expect(find.text('Ajouter mon contact'), findsOneWidget);
    expect(find.text('Me le rappeler dans 3 jours'), findsOneWidget);
  });

  testWidgets('does not mention emergency contact after an opt-out',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: ProfileCompletionNudgeDialog(
          needsPhoto: true,
          needsEmergencyContact: false,
          onAddPhoto: () {},
          onAddEmergencyContact: () {},
          onRemindLater: () {},
        ),
      ),
    ));

    expect(find.text('Ajouter ma photo'), findsOneWidget);
    expect(find.text('Ajouter mon contact'), findsNothing);
  });
}
