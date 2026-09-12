import 'dart:async';

import 'package:calymob/utils/exercice_selection_policy.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('clearing the last saved exercise is a valid change', () {
    expect(
      hasExerciceSelectionChanges(initial: const ['p2-1'], selected: const []),
      isTrue,
    );
    expect(
      exerciceSelectionSaveLabel(initial: const ['p2-1'], selected: const []),
      'Supprimer les exercices souhaités',
    );
    expect(
      exerciceSelectionSavedMessage(const []),
      'Exercices souhaités supprimés',
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

  test('late read preserves a newer local edit but updates its baseline', () {
    final resolution = resolveExerciceSelectionRead(
      remote: const ['p2-1'],
      currentInitial: const [],
      currentSelected: const [],
      capturedSelectionVersion: 3,
      currentSelectionVersion: 4,
      capturedPersistedRevision: 0,
      currentPersistedRevision: 0,
      wasDirtyAtReadStart: false,
      hasPendingSave: false,
    );

    expect(resolution.initial, ['p2-1']);
    expect(resolution.selected, isEmpty);
  });

  test('read started before a save cannot restore stale remote state', () {
    final resolution = resolveExerciceSelectionRead(
      remote: const ['old'],
      currentInitial: const ['new'],
      currentSelected: const ['newer-local-edit'],
      capturedSelectionVersion: 3,
      currentSelectionVersion: 3,
      capturedPersistedRevision: 1,
      currentPersistedRevision: 2,
      wasDirtyAtReadStart: false,
      hasPendingSave: false,
    );

    expect(resolution.initial, ['new']);
    expect(resolution.selected, ['newer-local-edit']);
  });

  test('read cannot overwrite selection while its save is pending', () {
    final resolution = resolveExerciceSelectionRead(
      remote: const ['old'],
      currentInitial: const ['old'],
      currentSelected: const ['queued'],
      capturedSelectionVersion: 4,
      currentSelectionVersion: 4,
      capturedPersistedRevision: 1,
      currentPersistedRevision: 1,
      wasDirtyAtReadStart: true,
      hasPendingSave: true,
    );

    expect(resolution.initial, ['old']);
    expect(resolution.selected, ['queued']);
  });

  test('read preserves a selection that was already dirty when it began', () {
    final resolution = resolveExerciceSelectionRead(
      remote: const ['remote'],
      currentInitial: const ['old-baseline'],
      currentSelected: const ['local-edit'],
      capturedSelectionVersion: 4,
      currentSelectionVersion: 4,
      capturedPersistedRevision: 1,
      currentPersistedRevision: 1,
      wasDirtyAtReadStart: true,
      hasPendingSave: false,
    );

    expect(resolution.initial, ['remote']);
    expect(resolution.selected, ['local-edit']);
  });

  test('failed final save never authorizes a refresh', () async {
    final queue = ExerciceSelectionSaveQueue();
    final task = queue.enqueue(
      selected: const ['local-edit'],
      writer: (_) async => throw StateError('network error'),
    )!;
    var saveSucceeded = false;

    try {
      await task.completion;
      saveSucceeded = true;
    } on StateError {
      // Mirrors the screen: show the error and keep the local dirty state.
    }

    expect(queue.isIdle, isTrue);
    expect(
      shouldRefreshExerciceSelectionAfterSave(
        saveSucceeded: saveSucceeded,
        isQueueIdle: queue.isIdle,
      ),
      isFalse,
    );
  });

  test('edit during pending save stays dirty without a second enqueue',
      () async {
    final queue = ExerciceSelectionSaveQueue();
    final write = Completer<void>();
    final task = queue.enqueue(
      selected: const ['queued'],
      writer: (_) => write.future,
    )!;

    await Future<void>.delayed(Duration.zero);
    final resolution = resolveExerciceSelectionRead(
      remote: const ['remote-old'],
      currentInitial: const ['baseline'],
      currentSelected: const ['edited-after-enqueue'],
      capturedSelectionVersion: 5,
      currentSelectionVersion: 6,
      capturedPersistedRevision: 2,
      currentPersistedRevision: 2,
      wasDirtyAtReadStart: true,
      hasPendingSave: queue.isSaving,
    );

    expect(task.snapshot, ['queued']);
    expect(resolution.initial, ['baseline']);
    expect(resolution.selected, ['edited-after-enqueue']);

    write.complete();
    await task.completion;
    expect(
      hasExerciceSelectionChanges(
        initial: task.snapshot,
        selected: resolution.selected,
      ),
      isTrue,
    );
  });

  test('save queue serializes changed snapshots in request order', () async {
    final queue = ExerciceSelectionSaveQueue();
    final firstWrite = Completer<void>();
    final secondWrite = Completer<void>();
    final started = <List<String>>[];

    Future<void> writer(List<String> snapshot) {
      started.add(List<String>.from(snapshot));
      return started.length == 1 ? firstWrite.future : secondWrite.future;
    }

    final first = queue.enqueue(selected: const ['p2-1'], writer: writer)!;
    await Future<void>.delayed(Duration.zero);
    final second = queue.enqueue(selected: const [], writer: writer)!;
    await Future<void>.delayed(Duration.zero);

    expect(started, [
      ['p2-1'],
    ]);
    expect(queue.lastQueuedSnapshot, isEmpty);

    firstWrite.complete();
    await first.completion;
    await Future<void>.delayed(Duration.zero);
    expect(started, [
      ['p2-1'],
      <String>[],
    ]);

    secondWrite.complete();
    await second.completion;
    expect(queue.isIdle, isTrue);
  });

  test('save queue coalesces an identical pending snapshot', () async {
    final queue = ExerciceSelectionSaveQueue();
    final write = Completer<void>();
    final first = queue.enqueue(
      selected: const ['p2-1'],
      writer: (_) => write.future,
    )!;
    await Future<void>.delayed(Duration.zero);

    expect(
      queue.enqueue(selected: const ['p2-1'], writer: (_) async {}),
      isNull,
    );

    write.complete();
    await first.completion;
  });

  test('a failed save does not block the next queued snapshot', () async {
    final queue = ExerciceSelectionSaveQueue();
    final attempted = <List<String>>[];

    Future<void> writer(List<String> snapshot) async {
      attempted.add(List<String>.from(snapshot));
      if (attempted.length == 1) throw StateError('network error');
    }

    final first = queue.enqueue(selected: const ['old'], writer: writer)!;
    final second = queue.enqueue(selected: const ['new'], writer: writer)!;

    await expectLater(first.completion, throwsStateError);
    await second.completion;

    expect(attempted, [
      ['old'],
      ['new'],
    ]);
    expect(queue.isIdle, isTrue);
  });
}
