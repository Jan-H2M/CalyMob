import 'package:flutter/material.dart';
import '../models/exercice_lifras.dart';

/// Dialog pour sélectionner les exercices LIFRAS
class ExerciseSelectionDialog extends StatefulWidget {
  final List<ExerciceLIFRAS> exercises;
  final NiveauLIFRAS? memberNiveau;
  final List<String> initialSelection;

  const ExerciseSelectionDialog({
    super.key,
    required this.exercises,
    required this.memberNiveau,
    this.initialSelection = const [],
  });

  @override
  State<ExerciseSelectionDialog> createState() => _ExerciseSelectionDialogState();
}

class _ExerciseSelectionDialogState extends State<ExerciseSelectionDialog> {
  late Set<String> _selectedExerciseIds;

  @override
  void initState() {
    super.initState();
    _selectedExerciseIds = Set.from(widget.initialSelection);
  }

  void _toggleExercise(String exerciseId) {
    setState(() {
      if (_selectedExerciseIds.contains(exerciseId)) {
        _selectedExerciseIds.remove(exerciseId);
      } else {
        _selectedExerciseIds.add(exerciseId);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('Sélectionner vos exercices'),
          const SizedBox(height: 8),
          if (widget.memberNiveau != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: _getNiveauColor(widget.memberNiveau!),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Text(
                'Votre niveau: ${widget.memberNiveau!.label}',
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.normal,
                  color: Colors.white,
                ),
              ),
            ),
        ],
      ),
      content: SizedBox(
        width: double.maxFinite,
        child: widget.exercises.isEmpty
            ? const Center(
                child: Padding(
                  padding: EdgeInsets.all(20.0),
                  child: Text(
                    'Aucun exercice disponible pour votre niveau.\n\nContactez un administrateur pour ajouter des exercices LIFRAS.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.grey),
                  ),
                ),
              )
            : ListView.builder(
                shrinkWrap: true,
                itemCount: widget.exercises.length,
                itemBuilder: (context, index) {
                  final exercise = widget.exercises[index];
                  final isSelected = _selectedExerciseIds.contains(exercise.id);

                  return CheckboxListTile(
                    title: Text(
                      exercise.code,
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    subtitle: Text(exercise.description),
                    value: isSelected,
                    onChanged: (bool? value) {
                      _toggleExercise(exercise.id);
                    },
                    secondary: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: _getNiveauColor(exercise.niveau),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        exercise.niveau.code,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    controlAffinity: ListTileControlAffinity.leading,
                  );
                },
              ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Annuler'),
        ),
        ElevatedButton(
          onPressed: () {
            Navigator.pop(context, _selectedExerciseIds.toList());
          },
          child: Text(
            _selectedExerciseIds.isEmpty
                ? 'Continuer sans exercices'
                : 'Valider (${_selectedExerciseIds.length})',
          ),
        ),
      ],
    );
  }

  Color _getNiveauColor(NiveauLIFRAS niveau) {
    switch (niveau) {
      case NiveauLIFRAS.nb:
        return Colors.grey;
      case NiveauLIFRAS.p2:
        return Colors.blue;
      case NiveauLIFRAS.p3:
        return Colors.green;
      case NiveauLIFRAS.p4:
        return Colors.orange;
      case NiveauLIFRAS.am:
        return Colors.purple;
      case NiveauLIFRAS.mc:
        return Colors.red;
    }
  }
}
