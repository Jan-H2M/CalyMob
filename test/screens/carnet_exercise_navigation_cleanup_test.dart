import 'dart:io';

import 'package:calymob/screens/training/mon_carnet_screen.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Mon carnet retains every dive source but excludes pool attendance', () {
    expect(isCarnetDiveSource('piscine'), isFalse);
    for (final source in [
      'manual',
      'sortie',
      'calypso',
      'import',
      'legacy',
      ''
    ]) {
      expect(isCarnetDiveSource(source), isTrue, reason: source);
    }
  });

  test('Mon carnet no longer offers a second pool history or mutation', () {
    final source =
        File('lib/screens/training/mon_carnet_screen.dart').readAsStringSync();
    expect(source, isNot(contains('_CarnetMode')));
    expect(source, isNot(contains('_poolBody')));
    expect(source, contains('isCarnetDiveSource(r.source)'));
    expect(source, isNot(contains('.delete(')));
    expect(source, isNot(contains('.update(')));
    expect(source, contains('if (!isLiveQaPreviewOrigin('));
    expect(source, contains('LogbookAddChoiceScreen'));
    expect(source, contains('LogbookEntryDetailScreen'));
  });

  test('specialties loses generic shortcuts, not existing results or protocols',
      () {
    final source = File('lib/screens/exercises/member_exercises_screen.dart')
        .readAsStringSync();
    expect(source, isNot(contains('_buildSelfActions')));
    expect(source, isNot(contains("Text('Demander une évaluation'")));
    expect(source, isNot(contains('Exercices sur papier')));
    expect(
        File('lib/screens/formation/student_360_screen.dart')
            .readAsStringSync(),
        contains('Spécialités (Tous niveaux)'));
    expect(source, contains('_showValidatedDetails'));
    expect(source, contains('exerciseAction: _openDossierExercise'));
    expect(source, contains('providedSpecialties: memberDossierSnapshot'));
    // A precise exercise can still use its existing evaluation workflow.
    expect(source, contains('_openEvaluationRequest(exercice)'));
  });
}
