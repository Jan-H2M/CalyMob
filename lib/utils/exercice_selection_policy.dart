bool sameStringSet(List<String> left, List<String> right) {
  if (left.length != right.length) return false;
  return Set<String>.from(left).containsAll(right) &&
      Set<String>.from(right).containsAll(left);
}

bool hasExerciceSelectionChanges({
  required List<String> initial,
  required List<String> selected,
}) =>
    !sameStringSet(initial, selected);

String exerciceSelectionSaveLabel({
  required List<String> initial,
  required List<String> selected,
}) {
  if (selected.isEmpty) {
    return hasExerciceSelectionChanges(initial: initial, selected: selected)
        ? 'Supprimer les exercices souhaités'
        : 'Sélectionnez des exercices';
  }
  return 'Enregistrer (${selected.length})';
}

String exerciceSelectionSavedMessage(List<String> saved) {
  if (saved.isEmpty) return 'Exercices souhaités supprimés';
  if (saved.length == 1) return '1 exercice souhaité enregistré';
  return '${saved.length} exercices souhaités enregistrés';
}

class ExerciceSelectionReadResolution {
  const ExerciceSelectionReadResolution({
    required this.initial,
    required this.selected,
  });

  final List<String> initial;
  final List<String> selected;
}

/// Reconciles an asynchronous Firestore read with newer local user actions.
///
/// A save that completed after the read began makes the complete response
/// stale. A local edit only protects the editable selection: the remote value
/// may still become the baseline against which that edit is compared.
ExerciceSelectionReadResolution resolveExerciceSelectionRead({
  required List<String> remote,
  required List<String> currentInitial,
  required List<String> currentSelected,
  required int capturedSelectionVersion,
  required int currentSelectionVersion,
  required int capturedPersistedRevision,
  required int currentPersistedRevision,
  required bool hasPendingSave,
}) {
  if (hasPendingSave || capturedPersistedRevision != currentPersistedRevision) {
    return ExerciceSelectionReadResolution(
      initial: List<String>.from(currentInitial),
      selected: List<String>.from(currentSelected),
    );
  }

  return ExerciceSelectionReadResolution(
    initial: List<String>.from(remote),
    selected: capturedSelectionVersion == currentSelectionVersion
        ? List<String>.from(remote)
        : List<String>.from(currentSelected),
  );
}

typedef ExerciceSnapshotWriter = Future<void> Function(List<String> snapshot);

class ExerciceSelectionSaveTask {
  const ExerciceSelectionSaveTask({
    required this.snapshot,
    required this.completion,
  });

  final List<String> snapshot;
  final Future<void> completion;
}

/// Serializes exercise writes in the order in which the user requests them.
///
/// A second, changed selection can be queued while an earlier save is still
/// running. Identical double taps are coalesced, so an old request can never
/// finish after a newer one and overwrite it in Firestore.
class ExerciceSelectionSaveQueue {
  Future<void> _tail = Future<void>.value();
  int _pendingCount = 0;
  List<String>? _lastQueuedSnapshot;

  bool get isSaving => _pendingCount > 0;
  bool get isIdle => _pendingCount == 0;
  List<String>? get lastQueuedSnapshot => _lastQueuedSnapshot == null
      ? null
      : List<String>.unmodifiable(_lastQueuedSnapshot!);

  ExerciceSelectionSaveTask? enqueue({
    required List<String> selected,
    required ExerciceSnapshotWriter writer,
  }) {
    final snapshot = List<String>.unmodifiable(selected);
    if (isSaving &&
        _lastQueuedSnapshot != null &&
        sameStringSet(_lastQueuedSnapshot!, snapshot)) {
      return null;
    }

    _pendingCount++;
    _lastQueuedSnapshot = snapshot;
    final previous = _tail.then<void>((_) {}, onError: (_, __) {});
    final write = previous.then<void>((_) => writer(snapshot));
    late final Future<void> completion;
    completion = write.whenComplete(() {
      _pendingCount--;
      if (_pendingCount == 0) _lastQueuedSnapshot = null;
    });
    _tail = completion.then<void>((_) {}, onError: (_, __) {});
    return ExerciceSelectionSaveTask(
      snapshot: snapshot,
      completion: completion,
    );
  }
}
