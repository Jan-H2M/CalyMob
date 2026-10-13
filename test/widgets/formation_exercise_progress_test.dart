import 'package:calymob/models/formation_snapshot_doc.dart';
import 'package:calymob/utils/requested_exercise_codes.dart';
import 'package:calymob/widgets/formation/formation_exercise_progress.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('resolves old document IDs while reporting unresolved wishes', () {
    final resolution = resolveRequestedExercises(
      ['opaque123', 'P2.DP', 'otherId', 'opaque123'],
      {'opaque123': 'P2.RA'},
    );
    expect(resolution.codes, ['P2.RA', 'P2.DP']);
    expect(resolution.unresolvedCount, 1);
    final failedLookup = resolveRequestedExercises(['opaque123'], const {});
    expect(failedLookup.codes, isEmpty);
    expect(failedLookup.unresolvedCount, 1);
  });

  testWidgets('uses the student card natural-modality total and statuses',
      (tester) async {
    final snapshot = FormationSnapshotDoc.fromMap('student', {
      'target_level': '2*',
      'exercises': {
        'validated': [
          {
            'code': 'P2.DP',
            'niveau': 'P2',
            'description': 'Direction de palanquée',
          },
        ],
        'pending_claims': [
          {'code': 'P2.DP', 'label': 'Direction de palanquée'},
        ],
        'remaining': [
          {
            'code': 'P2.EXT',
            'description': 'Examen théorique',
          },
        ],
      },
    });
    expect(snapshot.modalityProgress[FormationModality.career]!.total, 1);
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          child: FormationExerciseProgress(snapshot: snapshot),
        ),
      ),
    ));
    expect(find.text('Milieu naturel · 1/1'), findsOneWidget);
    await tester.tap(find.text('Milieu naturel · 1/1'));
    await tester.pumpAndSettle();
    expect(find.text('✓ Réalisés (1)'), findsOneWidget);
    expect(find.text('P2.DP · Direction de palanquée'), findsOneWidget);
    expect(find.text('⏳ En attente (0)'), findsOneWidget);
    expect(find.text('P2.EXT · Examen théorique'), findsNothing);
  });

  testWidgets('warns rather than silently hiding an unresolved wish',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(body: UnresolvedExerciseWarning(count: 2)),
    ));
    expect(find.textContaining('2 souhait(s) d’exercice non identifiés'),
        findsOneWidget);
  });
}
