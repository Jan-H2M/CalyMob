import 'package:calymob/models/member_profile.dart';
import 'package:calymob/screens/formation/student_exercise_comparison_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('comparison refuses normal builds without loading Firebase',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: StudentExerciseComparisonScreen(
            clubId: 'calypso',
            member: MemberProfile(
                id: 'synthetic-student',
                prenom: 'Alice',
                nom: 'Test',
                email: 'alice@example.invalid'))));
    expect(find.text('Comparaison élève'), findsOneWidget);
    expect(
        find.text('Comparaison disponible uniquement dans la preview locale.'),
        findsOneWidget);
    expect(find.text('Mes exercices'), findsNothing);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    expect(tester.takeException(), isNull);
  });
}
