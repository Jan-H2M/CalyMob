import 'package:flutter/material.dart';

/// Shared discipline and brevet navigation for both learner and instructor.
class FormationDisciplineSelector extends StatelessWidget {
  final bool apnee;
  final ValueChanged<bool> onChanged;
  const FormationDisciplineSelector({
    super.key,
    required this.apnee,
    required this.onChanged,
  });
  @override
  Widget build(BuildContext context) => FormationLevelSelector(
        label: 'Discipline de formation',
        selected: apnee ? 'apnee' : 'scuba',
        levels: const {'scuba': 'Plongée', 'apnee': 'Apnée'},
        onChanged: (value) => onChanged(value == 'apnee'),
      );
}

class FormationLevelSelector extends StatelessWidget {
  final String label;
  final String selected;
  final Map<String, String> levels;
  final ValueChanged<String> onChanged;
  final bool enabled;
  const FormationLevelSelector({
    super.key,
    this.label = 'Brevet visé',
    required this.selected,
    required this.levels,
    required this.onChanged,
    this.enabled = true,
  });
  @override
  Widget build(BuildContext context) => Semantics(
        label: label,
        child: Container(
          width: double.infinity,
          color: const Color(0xB3173853),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final level in levels.entries)
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: ChoiceChip(
                      label: Text(level.value),
                      selected: selected == level.key,
                      onSelected: enabled ? (_) => onChanged(level.key) : null,
                    ),
                  ),
              ],
            ),
          ),
        ),
      );
}

const apneeFormationLevels = {
  'apnee.a1': '1★ apnée · A1 / Discovery',
  'apnee.a2': '2★ apnée · A2',
};
const scubaFormationLevels = {
  '1*': '1★',
  '2*': '2★',
  '3*': '3★',
  '4*': '4★',
  'AM': 'AM',
  'MC': 'MC',
};

String normalizedFormationLevel(String? value) {
  final code = (value ?? '')
      .toUpperCase()
      .replaceAll('P', '')
      .replaceAll('★', '')
      .replaceAll('*', '');
  return const ['1', '2', '3', '4'].contains(code) ? '$code*' : code;
}
