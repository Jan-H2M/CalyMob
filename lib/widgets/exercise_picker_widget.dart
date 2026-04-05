import 'package:flutter/material.dart';
import '../config/app_colors.dart';

/// Gegevens van een LIFRAS exercice.
class LIFRASExercice {
  final String code;
  final String description;
  LIFRASExercice({required this.code, required this.description});
}

/// Widget voor het selecteren van een LIFRAS exercice, gefilterd op niveau.
/// Toont de exercices als doorzoekbare lijst.
class ExercisePickerWidget extends StatefulWidget {
  final String niveau;
  final Function(String code, String description) onSelected;

  const ExercisePickerWidget({
    super.key,
    required this.niveau,
    required this.onSelected,
  });

  @override
  State<ExercisePickerWidget> createState() => _ExercisePickerWidgetState();
}

class _ExercisePickerWidgetState extends State<ExercisePickerWidget> {
  String _search = '';
  late List<LIFRASExercice> _exercises;
  @override
  void initState() {
    super.initState();
    _exercises = _getExercisesForNiveau(widget.niveau);
  }

  List<LIFRASExercice> get _filtered {
    if (_search.isEmpty) return _exercises;
    final q = _search.toLowerCase();
    return _exercises.where((e) =>
      e.code.toLowerCase().contains(q) ||
      e.description.toLowerCase().contains(q)
    ).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          decoration: InputDecoration(
            hintText: 'Rechercher un exercice...',
            prefixIcon: const Icon(Icons.search, size: 20),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            isDense: true,
          ),
          onChanged: (v) => setState(() => _search = v),
        ),        const SizedBox(height: 8),
        ..._filtered.map((ex) => ListTile(
          dense: true,
          contentPadding: const EdgeInsets.symmetric(horizontal: 4),
          leading: Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: AppColors.primary.withOpacity(0.1),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              ex.code,
              style: TextStyle(
                fontFamily: 'monospace',
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: AppColors.primary,
              ),
            ),
          ),
          title: Text(ex.description, style: const TextStyle(fontSize: 14)),
          onTap: () => widget.onSelected(ex.code, ex.description),
        )),
        if (_filtered.isEmpty)
          const Padding(
            padding: EdgeInsets.all(16),
            child: Text('Aucun exercice trouvé.',
                style: TextStyle(color: Colors.grey)),
          ),
      ],
    );
  }
  /// Hardcoded LIFRAS exercice catalogus per niveau.
  /// Bron: CARNET_DE_FORMATION_TECH.md sectie 10.
  static List<LIFRASExercice> _getExercisesForNiveau(String niveau) {
    switch (niveau) {
      case '1*':
        return [
          LIFRASExercice(code: 'P1.NA', description: 'Nager 100 m sans équipement'),
          LIFRASExercice(code: 'P1.SU', description: 'Se maintenir en surface 10 min'),
          LIFRASExercice(code: 'P1.PA', description: 'Saut droit du bord et 100 m pmtc'),
          LIFRASExercice(code: 'P1.AD', description: 'Saut droit + parcours 10 m apnée'),
          LIFRASExercice(code: 'P1.AI', description: '20 secondes d\'apnée immobile'),
          LIFRASExercice(code: 'P1.REA', description: 'Notions de réanimation'),
          LIFRASExercice(code: 'P1.EQ', description: 'Montage système de stabilisation'),
          LIFRASExercice(code: 'P1.PE', description: 'Parcourir 50 m entre deux eaux'),
          LIFRASExercice(code: 'P1.ST', description: 'Épreuve du système de stabilisation'),
          LIFRASExercice(code: 'P1.CO', description: 'Épreuve du combiné'),
        ];
      case '2*':
        return [
          LIFRASExercice(code: 'P2.NA', description: 'Nager 200 m sans équipement'),
          LIFRASExercice(code: 'P2.SU', description: 'Se maintenir en surface 10 min'),
          LIFRASExercice(code: 'P2.AD', description: 'Saut droit + parcours 18 m apnée'),
          LIFRASExercice(code: 'P2.AI', description: '30 secondes d\'apnée immobile'),
          LIFRASExercice(code: 'P2.CV', description: 'Canard et deux vidages de masque'),
          LIFRASExercice(code: 'P2.CO', description: 'Épreuve du combiné'),          LIFRASExercice(code: 'P2.4P', description: 'Quatre parcours de 10 m apnée avec scaphandre'),
          LIFRASExercice(code: 'P2.PP', description: '30 m de parcours par paire'),
          LIFRASExercice(code: 'P2.REA', description: 'Réanimation d\'un plongeur'),
        ];
      default:
        return [];
    }
  }
}