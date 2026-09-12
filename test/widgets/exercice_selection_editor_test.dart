import 'package:calymob/models/exercice_lifras.dart';
import 'package:calymob/widgets/exercice_selection_editor.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('last selected exercise can be cleared and saved', (
    tester,
  ) async {
    final exercise = ExerciceLIFRAS(
      id: 'p2-1',
      code: 'P2.1',
      niveau: NiveauLIFRAS.p2,
      description: 'Exercice test',
    );
    var selected = <String>[exercise.id];
    List<String>? saved;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, setState) => ExerciceSelectionEditor(
              availableExercices: [exercise],
              selectedExercices: selected,
              initialSelectedExercices: const ['p2-1'],
              isCurrentSnapshotQueued: false,
              onSelectionChanged: (next) => setState(() => selected = next),
              onSave: () => saved = List<String>.from(selected),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.byType(Checkbox));
    await tester.pump();

    expect(selected, isEmpty);
    expect(find.text('Supprimer les exercices souhaités'), findsOneWidget);

    await tester.tap(find.text('Supprimer les exercices souhaités'));
    expect(saved, isEmpty);
  });

  testWidgets('the currently queued snapshot shows deterministic progress', (
    tester,
  ) async {
    final exercise = ExerciceLIFRAS(
      id: 'p2-1',
      code: 'P2.1',
      niveau: NiveauLIFRAS.p2,
      description: 'Exercice test',
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ExerciceSelectionEditor(
            availableExercices: [exercise],
            selectedExercices: const ['p2-1'],
            initialSelectedExercices: const [],
            isCurrentSnapshotQueued: true,
            onSelectionChanged: (_) {},
            onSave: () {},
          ),
        ),
      ),
    );

    expect(find.text('Enregistrement…'), findsOneWidget);
    final button = tester.widget<ElevatedButton>(
      find.byWidgetPredicate((widget) => widget is ElevatedButton),
    );
    expect(button.onPressed, isNull);
  });
}
