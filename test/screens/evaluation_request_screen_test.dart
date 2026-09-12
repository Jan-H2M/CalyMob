import 'package:calymob/screens/training/evaluation_request_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
      'client monitor contract matches MC/MF/MN plus Encadrant and excludes self',
      () {
    for (final code in const ['MC', 'MF', 'MN']) {
      expect(
        isEligibleEvaluationMonitor({
          'id': 'monitor-$code',
          'plongeur_code': code,
          'clubStatuten': ['Encadrants'],
        }, studentId: 'student'),
        isTrue,
      );
    }
    expect(
      isEligibleEvaluationMonitor({
        'id': 'admin',
        'app_role': 'admin',
        'plongeur_code': 'P3',
        'clubStatuten': const [],
      }, studentId: 'student'),
      isFalse,
    );
    expect(
      isEligibleEvaluationMonitor({
        'id': 'monitor',
        'plongeur_code': 'MC',
        'clubStatuten': ['Membres'],
      }, studentId: 'student'),
      isFalse,
    );
    expect(
      isEligibleEvaluationMonitor({
        'id': 'student',
        'plongeur_code': 'MN',
        'clubStatuten': ['Encadrants'],
      }, studentId: 'student'),
      isFalse,
    );
  });

  testWidgets('student chooses exercise, own context and monitor before submit',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    var submitted = false;

    await tester.pumpWidget(MaterialApp(
      home: EvaluationRequestScreen(
        exercises: const [
          EvaluationExerciseOption(
            id: 'exercise-1',
            code: 'P2.DP',
            label: 'Direction de palanquée',
          ),
        ],
        previewPoolSessions: [
          EvaluationReferenceOption(
            id: 'pool-entry-1',
            label: 'Piscine · 08/09/2026',
            date: DateTime(2026, 9, 8),
          ),
        ],
        previewDives: [
          EvaluationReferenceOption(
            id: 'dive-entry-1',
            label: 'Zélande · 05/09/2026',
            date: DateTime(2026, 9, 5),
          ),
        ],
        previewMonitors: const [
          EvaluationMonitorOption(id: 'monitor-1', name: 'Marie Moniteur'),
        ],
        onPreviewSubmit: () async => submitted = true,
      ),
    ));
    await tester.pump();

    expect(find.text('P2.DP — Direction de palanquée'), findsOneWidget);
    expect(find.text('Piscine · 08/09/2026'), findsNothing);
    expect(find.text('Envoyer la demande'), findsOneWidget);

    await tester.tap(find.byType(DropdownButtonFormField<String>).at(1));
    await tester.pump();
    await tester.tap(find.text('Piscine · 08/09/2026').last);
    await tester.pump();
    await tester.tap(find.byType(DropdownButtonFormField<String>).at(2));
    await tester.pump();
    await tester.tap(find.text('Marie Moniteur').last);
    await tester.pump();

    await tester.tap(find.text('Envoyer la demande'));
    await tester.pump();
    expect(submitted, isTrue);
    expect(find.text('Demande envoyée au moniteur ✓'), findsOneWidget);
  });
}
