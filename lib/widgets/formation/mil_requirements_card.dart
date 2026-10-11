import 'package:flutter/material.dart';

import '../../config/app_colors.dart';
import '../../models/formation_snapshot_doc.dart';
import '../../models/mil_experience_overview.dart';

class MilRequirementsCard extends StatefulWidget {
  final FormationSnapshotDoc? snapshot;
  final MilExperienceOverview? overview;
  final bool dark;

  const MilRequirementsCard({
    super.key,
    this.snapshot,
    this.overview,
    this.dark = false,
  }) : assert(snapshot != null || overview != null);

  @override
  State<MilRequirementsCard> createState() => _MilRequirementsCardState();
}

class _MilRequirementsCardState extends State<MilRequirementsCard> {
  String? _selectedBrevet;

  MilExperienceOverview get _overview =>
      widget.overview ?? MilExperienceOverview.fromSnapshot(widget.snapshot!);

  @override
  void initState() {
    super.initState();
    _selectedBrevet = _overview.initialBrevet;
  }

  @override
  void didUpdateWidget(covariant MilRequirementsCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!_overview.byBrevet.containsKey(_selectedBrevet)) {
      _selectedBrevet = _overview.initialBrevet;
    }
  }

  @override
  Widget build(BuildContext context) {
    final textColor = widget.dark ? Colors.white : AppColors.donkerblauw;
    final mutedColor = textColor.withValues(alpha: 0.68);
    final surfaceColor = widget.dark
        ? AppColors.donkerblauw.withValues(alpha: 0.62)
        : Colors.white.withValues(alpha: 0.96);
    final overview = _overview;
    final selectedCode = _selectedBrevet;
    final selected =
        selectedCode == null ? null : overview.byBrevet[selectedCode];
    final requirements = selected?.requirements.entries.toList() ?? const [];

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: surfaceColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: widget.dark
              ? Colors.white.withValues(alpha: 0.10)
              : AppColors.donkerblauw.withValues(alpha: 0.08),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            selected == null
                ? 'Expériences LIFRAS'
                : 'Expériences LIFRAS — ${milBrevetLabel(selected.brevetCode)}',
            style: TextStyle(
              color: textColor,
              fontSize: 15,
              fontWeight: FontWeight.w800,
            ),
          ),
          if (selected != null) ...[
            const SizedBox(height: 4),
            Text(
              overview.snapshotFallback
                  ? 'Cumul carrière • aperçu du brevet cible (snapshot)'
                  : 'Cumul carrière • module ${selected.modulePct} %'
                      '${overview.sourceVersion == null ? '' : ' • ${overview.sourceVersion}'}',
              style: TextStyle(color: mutedColor),
            ),
            if (overview.snapshotFallback) ...[
              const SizedBox(height: 3),
              Text(
                'La matrice complète est momentanément indisponible.',
                style: TextStyle(color: mutedColor, fontSize: 12),
              ),
            ],
          ],
          if (overview.byBrevet.length > 1) ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: overview.byBrevet.keys.map((code) {
                final isSelected = code == selectedCode;
                return ChoiceChip(
                  label: Text(milBrevetLabel(code)),
                  selected: isSelected,
                  onSelected: (_) => setState(() => _selectedBrevet = code),
                  selectedColor: widget.dark
                      ? AppColors.lichtblauw.withValues(alpha: 0.34)
                      : AppColors.middenblauw,
                  backgroundColor: textColor.withValues(alpha: 0.08),
                  side: BorderSide(
                    color:
                        textColor.withValues(alpha: isSelected ? 0.35 : 0.12),
                  ),
                  labelStyle: TextStyle(
                    color:
                        isSelected && !widget.dark ? Colors.white : textColor,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                );
              }).toList(),
            ),
          ],
          const SizedBox(height: 10),
          if (selected == null)
            Text(
              overview.isEmpty
                  ? "Les données d'expérience ne sont pas encore disponibles."
                  : 'Aucune exigence MIL pour le brevet cible. '
                      'Sélectionnez un brevet pour consulter sa matrice.',
              style: TextStyle(color: mutedColor),
            )
          else if (requirements.isEmpty)
            Text(
              "Aucune exigence d'expérience n'est configurée pour ce brevet.",
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
          Text(
            'Données manquantes • requis ${requirement.need}',
            style: TextStyle(color: mutedColor),
          ),
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
