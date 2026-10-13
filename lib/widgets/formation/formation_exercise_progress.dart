import 'package:flutter/material.dart';

import '../../config/app_colors.dart';
import '../../models/formation_snapshot_doc.dart';

class UnresolvedExerciseWarning extends StatelessWidget {
  final int count;

  const UnresolvedExerciseWarning({super.key, required this.count});

  @override
  Widget build(BuildContext context) => count == 0
      ? const SizedBox.shrink()
      : Text(
          '$count souhait(s) d’exercice non identifiés. Vérifiez le catalogue avant de planifier.',
          style: const TextStyle(
            color: Color(0xFF9A5700),
            fontSize: 11,
            fontWeight: FontWeight.w600,
          ),
        );
}

/// Read-only progress from the same formation snapshot as the student's card.
/// Planning choices below this panel remain separate, unvalidated intentions.
class FormationExerciseProgress extends StatelessWidget {
  final FormationSnapshotDoc snapshot;

  const FormationExerciseProgress({super.key, required this.snapshot});

  @override
  Widget build(BuildContext context) {
    final natural = snapshot.modalityProgress[FormationModality.career]!;
    final total = natural.total;
    final validated = natural.validated;
    bool inNatural(String code, String description) =>
        formationModalityForExercise(code, description) ==
        FormationModality.career;
    final seen = <String>{};
    bool first(String code) => seen.add(code.trim().toUpperCase());
    // One code appears in at most one section, in the same precedence as
    // FormationSnapshotDoc.modalityProgress (validated > pending > remaining).
    final done = snapshot.validated
        .where((row) => inNatural(row.code, row.description) && first(row.code))
        .toList();
    final pending = snapshot.pending
        .where((row) => inNatural(row.code, row.description) && first(row.code))
        .toList();
    final claims = snapshot.pendingClaims
        .where((row) => inNatural(row.code, row.label) && first(row.code))
        .toList();
    final remaining = snapshot.remaining
        .where((row) => inNatural(row.code, row.description) && first(row.code))
        .toList();
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFFEAF7FD),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFCDEDFB)),
      ),
      child: ExpansionTile(
        tilePadding: const EdgeInsets.symmetric(horizontal: 10),
        childrenPadding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
        title: Text(
          'Milieu naturel · ${total == 0 ? '—' : '$validated/$total'}',
          style: const TextStyle(
            color: AppColors.donkerblauw,
            fontSize: 12,
            fontWeight: FontWeight.w800,
          ),
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 5),
          child: LinearProgressIndicator(
            value: total == 0 ? 0 : validated / total,
            minHeight: 5,
            borderRadius: BorderRadius.circular(5),
            backgroundColor: Colors.white,
            color: Colors.green,
          ),
        ),
        children: [
          _section(
            '✓ Réalisés (${done.length})',
            done
                .map(
                  (exercise) => _row(
                    exercise.code,
                    exercise.description,
                    Colors.green,
                  ),
                )
                .toList(),
          ),
          _section(
            '⏳ En attente (${pending.length + claims.length})',
            [
              ...pending.map(
                (exercise) => _row(
                  exercise.code,
                  exercise.description,
                  Colors.orange,
                ),
              ),
              ...claims.map(
                (claim) => _row(
                  claim.code,
                  claim.label,
                  Colors.orange,
                ),
              ),
            ],
          ),
          _section(
            '○ Restants (${remaining.length})',
            remaining
                .map(
                  (exercise) => _row(
                    exercise.code,
                    exercise.description,
                    Colors.blueGrey,
                  ),
                )
                .toList(),
          ),
        ],
      ),
    );
  }

  Widget _section(String title, List<Widget> rows) => Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: const TextStyle(
                color: AppColors.donkerblauw,
                fontSize: 11,
                fontWeight: FontWeight.bold,
              ),
            ),
            if (rows.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 3),
                child: Text(
                  'Aucun exercice',
                  style: TextStyle(color: Colors.black54, fontSize: 11),
                ),
              )
            else
              ...rows,
          ],
        ),
      );

  Widget _row(String code, String description, Color color) => Padding(
        padding: const EdgeInsets.only(top: 5),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.circle, size: 7, color: color),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                description.isEmpty ? code : '$code · $description',
                style: const TextStyle(fontSize: 11.5),
              ),
            ),
          ],
        ),
      );
}
