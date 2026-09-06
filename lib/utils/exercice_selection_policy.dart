bool sameStringSet(List<String> left, List<String> right) {
  if (left.length != right.length) return false;
  return Set<String>.from(left).containsAll(right) &&
      Set<String>.from(right).containsAll(left);
}

bool hasExerciceSelectionChanges({
  required List<String> initial,
  required List<String> selected,
}) => !sameStringSet(initial, selected);

String exerciceSelectionSaveLabel({
  required List<String> initial,
  required List<String> selected,
}) {
  final hasChanges = hasExerciceSelectionChanges(
    initial: initial,
    selected: selected,
  );
  if (selected.isEmpty) {
    return hasChanges
        ? 'Supprimer les exercices souhaités'
        : 'Sélectionnez des exercices';
  }
  return 'Enregistrer (${selected.length})';
}
