import 'package:flutter_test/flutter_test.dart';

import 'package:calymob/utils/exercice_selection_policy.dart';

void main() {
  test('empty unchanged selection asks the user to select exercises', () {
    expect(
      hasExerciceSelectionChanges(initial: const [], selected: const []),
      isFalse,
    );
    expect(
      exerciceSelectionSaveLabel(initial: const [], selected: const []),
      'Sélectionnez des exercices',
    );
  });

  test('clearing the last saved exercise is a valid change', () {
    expect(
      hasExerciceSelectionChanges(initial: const ['p2-1'], selected: const []),
      isTrue,
    );
    expect(
      exerciceSelectionSaveLabel(initial: const ['p2-1'], selected: const []),
      'Supprimer les exercices souhaités',
    );
  });

  test('selection order does not create a false dirty state', () {
    expect(
      hasExerciceSelectionChanges(
        initial: const ['p2-1', 'p2-2'],
        selected: const ['p2-2', 'p2-1'],
      ),
      isFalse,
    );
  });

  test('adding or changing exercises enables save', () {
    expect(
      hasExerciceSelectionChanges(initial: const [], selected: const ['p2-1']),
      isTrue,
    );
    expect(
      exerciceSelectionSaveLabel(initial: const [], selected: const ['p2-1']),
      'Enregistrer (1)',
    );
    expect(
      hasExerciceSelectionChanges(
        initial: const ['p2-1'],
        selected: const ['p2-2'],
      ),
      isTrue,
    );
  });
}
