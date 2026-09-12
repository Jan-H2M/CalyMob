import 'package:flutter/material.dart';

import '../models/exercice_lifras.dart';
import '../utils/exercice_selection_policy.dart';

class ExerciceSelectionEditor extends StatelessWidget {
  const ExerciceSelectionEditor({
    super.key,
    required this.availableExercices,
    required this.selectedExercices,
    required this.initialSelectedExercices,
    required this.isCurrentSnapshotQueued,
    required this.onSelectionChanged,
    required this.onSave,
  });

  final List<ExerciceLIFRAS> availableExercices;
  final List<String> selectedExercices;
  final List<String> initialSelectedExercices;
  final bool isCurrentSnapshotQueued;
  final ValueChanged<List<String>> onSelectionChanged;
  final VoidCallback onSave;

  @override
  Widget build(BuildContext context) {
    final hasChanges = hasExerciceSelectionChanges(
      initial: initialSelectedExercices,
      selected: selectedExercices,
    );
    return Column(
      children: [
        ...availableExercices.map((exercice) {
          final isSelected = selectedExercices.contains(exercice.id);
          return CheckboxListTile(
            value: isSelected,
            onChanged: (value) {
              final next = List<String>.from(selectedExercices);
              if (value == true) {
                if (!next.contains(exercice.id)) next.add(exercice.id);
              } else {
                next.remove(exercice.id);
              }
              onSelectionChanged(next);
            },
            title: Text(
              exercice.code,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            subtitle: Text(
              exercice.description,
              style: TextStyle(fontSize: 13, color: Colors.grey[600]),
            ),
            controlAffinity: ListTileControlAffinity.leading,
            activeColor: Colors.blue,
            dense: true,
          );
        }),
        Padding(
          padding: const EdgeInsets.all(16),
          child: SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: hasChanges && !isCurrentSnapshotQueued ? onSave : null,
              icon: isCurrentSnapshotQueued
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Icon(
                      selectedExercices.isEmpty && hasChanges
                          ? Icons.delete_outline
                          : Icons.save,
                      size: 18,
                    ),
              label: Text(
                isCurrentSnapshotQueued
                    ? 'Enregistrement…'
                    : exerciceSelectionSaveLabel(
                        initial: initialSelectedExercices,
                        selected: selectedExercices,
                      ),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.blue,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
