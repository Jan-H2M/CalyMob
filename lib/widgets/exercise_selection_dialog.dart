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

  /// Get the NEXT niveau (the one the member is training for)
  NiveauLIFRAS? _getNextNiveau(NiveauLIFRAS? currentNiveau) {
    if (currentNiveau == null) return null;

    // Progression order: NB -> P2 -> P3 -> P4 -> AM -> MC -> MF -> MN
    final progression = [
      NiveauLIFRAS.nb,
      NiveauLIFRAS.p2,
      NiveauLIFRAS.p3,
      NiveauLIFRAS.p4,
      NiveauLIFRAS.am,
      NiveauLIFRAS.mc,
      NiveauLIFRAS.mf,
      NiveauLIFRAS.mn,
    ];

    final currentIndex = progression.indexOf(currentNiveau);
    if (currentIndex == -1 || currentIndex >= progression.length - 1) {
      return null; // MN is highest, no next level
    }
    return progression[currentIndex + 1];
  }

  /// Group exercises: First NEXT niveau exercises (what member is training for), then TN exercises
  List<Widget> _buildExerciseList() {
    final widgets = <Widget>[];

    // Separate TN exercises from others
    final tnExercises = widget.exercises.where((e) => e.niveau == NiveauLIFRAS.tn).toList();
    final otherExercises = widget.exercises.where((e) => e.niveau != NiveauLIFRAS.tn).toList();

    // Get the NEXT niveau (what the member is training for)
    final nextNiveau = _getNextNiveau(widget.memberNiveau);

    // FIRST: Add NEXT niveau exercises (what member is currently training for)
    if (otherExercises.isNotEmpty) {
      // Show next niveau exercises first (this is what they're training for)
      if (nextNiveau != null) {
        final nextNiveauExercises = otherExercises
            .where((e) => e.niveau == nextNiveau)
            .toList();

        if (nextNiveauExercises.isNotEmpty) {
          widgets.add(_buildSectionHeader(
            'Exercices ${nextNiveau.label}',
            _getNiveauColor(nextNiveau),
            subtitle: 'Votre prochaine formation',
          ));
          for (final exercise in nextNiveauExercises) {
            widgets.add(_buildExerciseTile(exercise));
          }
        }
      }

      // Then add other niveau exercises (excluding next niveau if shown)
      final niveauOrder = [
        NiveauLIFRAS.nb,
        NiveauLIFRAS.p2,
        NiveauLIFRAS.p3,
        NiveauLIFRAS.p4,
        NiveauLIFRAS.am,
        NiveauLIFRAS.mc,
        NiveauLIFRAS.mf,
        NiveauLIFRAS.mn,
      ];

      for (final niveau in niveauOrder) {
        // Skip next niveau if already shown above
        if (niveau == nextNiveau) continue;

        final niveauExercises = otherExercises.where((e) => e.niveau == niveau).toList();
        if (niveauExercises.isNotEmpty) {
          widgets.add(_buildSectionHeader(niveau.label, _getNiveauColor(niveau)));
          for (final exercise in niveauExercises) {
            widgets.add(_buildExerciseTile(exercise));
          }
        }
      }
    }

    // DIVIDER between niveau exercises and TN exercises
    // Always show divider if there are TN exercises
    if (tnExercises.isNotEmpty) {
      widgets.add(_buildDivider());
    }

    // SECOND: Add TN exercises grouped by specialite
    if (tnExercises.isNotEmpty) {
      widgets.add(_buildSectionHeader(
        'Spécialités (Tous Niveaux)',
        Colors.teal,
        subtitle: 'Exercices libres accessibles à tous',
      ));

      // Group by specialite
      final specialites = <String, List<ExerciceLIFRAS>>{};
      for (final exercise in tnExercises) {
        final key = exercise.specialite ?? 'Autre';
        specialites.putIfAbsent(key, () => []).add(exercise);
      }

      // Sort specialites alphabetically
      final sortedKeys = specialites.keys.toList()..sort();

      for (final specialite in sortedKeys) {
        widgets.add(_buildSpecialiteHeader(specialite));
        for (final exercise in specialites[specialite]!) {
          widgets.add(_buildExerciseTile(exercise));
        }
      }
    }

    return widgets;
  }

  Widget _buildDivider() {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 16),
      child: Row(
        children: [
          Expanded(child: Divider(color: Colors.grey[400], thickness: 1)),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Text(
              'SPÉCIALITÉS',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color: Colors.grey[600],
                letterSpacing: 1.2,
              ),
            ),
          ),
          Expanded(child: Divider(color: Colors.grey[400], thickness: 1)),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title, Color color, {String? subtitle}) {
    return Container(
      margin: const EdgeInsets.only(top: 16, bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  title,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    fontSize: 12,
                  ),
                ),
              ),
            ],
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 4),
            Text(
              subtitle,
              style: TextStyle(
                fontSize: 12,
                color: color.withOpacity(0.8),
                fontStyle: FontStyle.italic,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildSpecialiteHeader(String specialite) {
    return Padding(
      padding: const EdgeInsets.only(left: 16, top: 8, bottom: 4),
      child: Text(
        specialite,
        style: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w600,
          color: Colors.teal[700],
        ),
      ),
    );
  }

  Widget _buildExerciseTile(ExerciceLIFRAS exercise) {
    final isSelected = _selectedExerciseIds.contains(exercise.id);

    // Compact single-line format: "CODE - Description"
    return CheckboxListTile(
      title: Text(
        '${exercise.code} - ${exercise.description}',
        style: const TextStyle(fontSize: 14),
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
      ),
      value: isSelected,
      onChanged: (bool? value) {
        _toggleExercise(exercise.id);
      },
      dense: true,
      controlAffinity: ListTileControlAffinity.leading,
      contentPadding: const EdgeInsets.symmetric(horizontal: 8),
      secondary: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: 6,
          vertical: 2,
        ),
        decoration: BoxDecoration(
          color: _getNiveauColor(exercise.niveau),
          borderRadius: BorderRadius.circular(4),
        ),
        child: Text(
          exercise.niveau.code,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 10,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
    );
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
            : ListView(
                shrinkWrap: true,
                children: _buildExerciseList(),
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
      case NiveauLIFRAS.tn:
        return Colors.teal;
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
      case NiveauLIFRAS.mf:
        return Colors.red.shade800;
      case NiveauLIFRAS.mn:
        return Colors.brown.shade800;
    }
  }
}
