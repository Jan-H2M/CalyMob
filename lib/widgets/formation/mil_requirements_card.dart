import 'package:flutter/material.dart';

import '../../config/app_colors.dart';
import '../../models/formation_snapshot_doc.dart';

class MilRequirementsCard extends StatelessWidget {
  final FormationSnapshotDoc snapshot;
  final bool dark;

  const MilRequirementsCard({
    super.key,
    required this.snapshot,
    this.dark = false,
  });

  @override
  Widget build(BuildContext context) {
    final textColor = dark ? Colors.white : AppColors.donkerblauw;
    final mutedColor = textColor.withValues(alpha: 0.68);
    final surfaceColor = dark
        ? AppColors.donkerblauw.withValues(alpha: 0.62)
        : Colors.white.withValues(alpha: 0.96);
    final requirements = snapshot.milPerRequirement.entries.toList();

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: surfaceColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: dark
              ? Colors.white.withValues(alpha: 0.10)
              : AppColors.donkerblauw.withValues(alpha: 0.08),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Expériences exigées pour '
            '${snapshot.targetLevel ?? 'le brevet'} '
            '(module ${snapshot.milPct} %)',
            style: TextStyle(
              color: textColor,
              fontSize: 15,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 10),
          if (requirements.isEmpty)
            Text(
              "Pas d'exigences d'expérience pour ce niveau.",
              style: TextStyle(color: mutedColor),
            )
          else
            for (var index = 0; index < requirements.length; index++) ...[
              if (index > 0)
                Divider(
                  color: textColor.withValues(alpha: 0.10),
                  height: 18,
                ),
              _RequirementRow(
                label: milExperienceLabelFr[requirements[index].key] ??
                    requirements[index].key,
                requirement: requirements[index].value,
                textColor: textColor,
                mutedColor: mutedColor,
              ),
            ],
        ],
      ),
    );
  }
}

class _RequirementRow extends StatelessWidget {
  final String label;
  final SnapshotMilRequirement requirement;
  final Color textColor;
  final Color mutedColor;

  const _RequirementRow({
    required this.label,
    required this.requirement,
    required this.textColor,
    required this.mutedColor,
  });

  @override
  Widget build(BuildContext context) {
    if (requirement.dataMissing) {
      return Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(color: textColor, fontWeight: FontWeight.w600),
            ),
          ),
          Text('Données manquantes', style: TextStyle(color: mutedColor)),
        ],
      );
    }

    final attained = requirement.have >= requirement.need;
    final status =
        attained ? 'Atteint' : 'Manque ${requirement.need - requirement.have}';
    final statusColor = attained ? Colors.green : Colors.orange.shade700;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  color: textColor,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '${requirement.have}/${requirement.need}',
                  style: TextStyle(
                    color: textColor,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                Text(
                  status,
                  style: TextStyle(
                    color: statusColor,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ],
        ),
        const SizedBox(height: 5),
        ClipRRect(
          borderRadius: BorderRadius.circular(5),
          child: LinearProgressIndicator(
            value: requirement.ratio,
            minHeight: 5,
            backgroundColor: textColor.withValues(alpha: 0.12),
            valueColor: AlwaysStoppedAnimation<Color>(statusColor),
          ),
        ),
      ],
    );
  }
}
