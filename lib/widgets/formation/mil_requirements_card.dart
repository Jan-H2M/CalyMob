import 'package:flutter/material.dart';

import '../../config/app_colors.dart';
import '../../models/formation_snapshot_doc.dart';
import '../../models/mil_experience_overview.dart';

class MilRequirementsCard extends StatefulWidget {
  final FormationSnapshotDoc? snapshot;
  final MilExperienceOverview? overview;
  final bool dark;

  /// Shows every requirement of the preferred target brevet in place,
  /// without exposing the selector or requirements from other brevet levels.
  final bool inlineExpanded;
  final bool compactRows;

  const MilRequirementsCard({
    super.key,
    this.snapshot,
    this.overview,
    this.dark = false,
    this.inlineExpanded = false,
    this.compactRows = false,
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
    final oldOverview = oldWidget.overview ??
        MilExperienceOverview.fromSnapshot(oldWidget.snapshot!);
    if (oldOverview.preferredBrevet != _overview.preferredBrevet ||
        !_overview.byBrevet.containsKey(_selectedBrevet)) {
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
    final selectedCode =
        widget.inlineExpanded ? overview.preferredBrevet : _selectedBrevet;
    final selected =
        selectedCode == null ? null : overview.byBrevet[selectedCode];

    return Container(
      padding: EdgeInsets.all(widget.compactRows ? 12 : 14),
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
              _sourceLabel(overview),
              style: TextStyle(color: mutedColor),
            ),
          ],
          const SizedBox(height: 10),
          if (selected == null)
            Text(
              overview.isEmpty
                  ? "Les données d'expérience ne sont pas encore disponibles."
                  : widget.inlineExpanded
                      ? 'Aucune exigence MIL disponible pour le brevet cible.'
                      : 'Aucune exigence MIL pour le brevet cible. '
                          'Sélectionnez un brevet pour consulter sa matrice.',
              style: TextStyle(color: mutedColor),
            )
          else if (selected.requirements.isEmpty)
            Text(
              "Aucune exigence d'expérience n'est configurée pour ce brevet.",
              style: TextStyle(color: mutedColor),
            )
          else if (widget.inlineExpanded)
            _MilRequirementsList(
              experience: selected,
              textColor: textColor,
              mutedColor: mutedColor,
              compact: widget.compactRows,
            )
          else
            _CompactMilSummary(
              experience: selected,
              textColor: textColor,
              mutedColor: mutedColor,
            ),
          if (!overview.isEmpty && !widget.inlineExpanded) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                key: const Key('mil-show-details'),
                onPressed: () => _showDetails(context),
                icon: const Icon(Icons.list_alt_outlined, size: 18),
                label: const Text('Voir les détails LIFRAS'),
                style: OutlinedButton.styleFrom(
                  foregroundColor:
                      widget.dark ? Colors.white : AppColors.middenblauw,
                  side: BorderSide(
                    color: textColor.withValues(alpha: 0.28),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _sourceLabel(MilExperienceOverview overview) {
    if (overview.snapshotFallback) {
      return 'Dernier bilan disponible • cumul carrière';
    }
    final version = overview.sourceVersion;
    return 'Cumul carrière${version == null ? '' : ' • $version'}';
  }

  Future<void> _showDetails(BuildContext context) async {
    var selectedCode = _selectedBrevet;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) {
          final overview = _overview;
          final selected =
              selectedCode == null ? null : overview.byBrevet[selectedCode];
          return FractionallySizedBox(
            heightFactor: 0.9,
            child: Material(
              key: const Key('mil-details-sheet'),
              color: Colors.white,
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(24),
              ),
              clipBehavior: Clip.antiAlias,
              child: SafeArea(
                top: false,
                child: Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(18, 14, 8, 8),
                      child: Row(
                        children: [
                          const Expanded(
                            child: Text(
                              'Détails des expériences LIFRAS',
                              style: TextStyle(
                                color: AppColors.donkerblauw,
                                fontSize: 18,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                          IconButton(
                            key: const Key('mil-close-details'),
                            tooltip: 'Fermer',
                            onPressed: () => Navigator.of(sheetContext).pop(),
                            icon: const Icon(Icons.close),
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.fromLTRB(18, 4, 18, 24),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _sourceLabel(overview),
                              style: TextStyle(
                                color: AppColors.donkerblauw.withValues(
                                  alpha: 0.68,
                                ),
                              ),
                            ),
                            const SizedBox(height: 12),
                            Wrap(
                              spacing: 6,
                              runSpacing: 6,
                              children: overview.byBrevet.keys.map((code) {
                                final isSelected = code == selectedCode;
                                return ChoiceChip(
                                  key: Key('mil-brevet-$code'),
                                  label: Text(milBrevetLabel(code)),
                                  selected: isSelected,
                                  onSelected: (_) {
                                    setSheetState(() => selectedCode = code);
                                    setState(() => _selectedBrevet = code);
                                  },
                                  selectedColor: AppColors.middenblauw,
                                  labelStyle: TextStyle(
                                    color: isSelected
                                        ? Colors.white
                                        : AppColors.donkerblauw,
                                    fontWeight: FontWeight.w700,
                                  ),
                                );
                              }).toList(),
                            ),
                            const SizedBox(height: 18),
                            if (selected == null)
                              const Text(
                                'Sélectionnez un brevet pour consulter '
                                'toutes ses exigences.',
                                style: TextStyle(color: AppColors.donkerblauw),
                              )
                            else ...[
                              Text(
                                milBrevetLabel(selected.brevetCode),
                                style: const TextStyle(
                                  color: AppColors.donkerblauw,
                                  fontSize: 16,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Progression des données disponibles : '
                                '${selected.modulePct} %',
                                style: TextStyle(
                                  color: AppColors.donkerblauw.withValues(
                                    alpha: 0.68,
                                  ),
                                ),
                              ),
                              const SizedBox(height: 14),
                              if (selected.requirements.isEmpty)
                                const Text(
                                  "Aucune exigence d'expérience configurée.",
                                )
                              else
                                _MilRequirementsList(
                                  experience: selected,
                                  textColor: AppColors.donkerblauw,
                                  mutedColor: AppColors.donkerblauw.withValues(
                                    alpha: 0.68,
                                  ),
                                ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _MilRequirementsList extends StatelessWidget {
  final MilBrevetExperience experience;
  final Color textColor;
  final Color mutedColor;
  final bool compact;

  const _MilRequirementsList({
    required this.experience,
    required this.textColor,
    required this.mutedColor,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    final requirements = experience.requirements.entries.toList();
    return Column(
      children: [
        for (var index = 0; index < requirements.length; index++) ...[
          if (index > 0)
            Divider(
              color: textColor.withValues(alpha: 0.10),
              height: compact ? 12 : 20,
            ),
          _RequirementRow(
            label: milExperienceLabelFr[requirements[index].key] ??
                requirements[index].key,
            requirement: requirements[index].value,
            textColor: textColor,
            mutedColor: mutedColor,
            compact: compact,
          ),
        ],
      ],
    );
  }
}

class _CompactMilSummary extends StatelessWidget {
  final MilBrevetExperience experience;
  final Color textColor;
  final Color mutedColor;

  const _CompactMilSummary({
    required this.experience,
    required this.textColor,
    required this.mutedColor,
  });

  @override
  Widget build(BuildContext context) {
    final entries = experience.requirements.entries.toList();
    final known = entries.where((entry) => !entry.value.dataMissing).toList();
    final unknownCount = entries.length - known.length;
    final attainedCount =
        known.where((entry) => entry.value.have >= entry.value.need).length;
    final missingCount = known.length - attainedCount;
    final primary = experience.requirements['total_milieu_naturel'] ??
        (known.isEmpty ? null : known.first.value);
    final primaryLabel =
        experience.requirements.containsKey('total_milieu_naturel')
            ? 'Total en milieu naturel'
            : (known.isEmpty
                ? null
                : milExperienceLabelFr[known.first.key] ?? known.first.key);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (primary != null && primaryLabel != null)
          _RequirementRow(
            label: primaryLabel,
            requirement: primary,
            textColor: textColor,
            mutedColor: mutedColor,
          ),
        if (primary != null) const SizedBox(height: 10),
        Text(
          '$attainedCount exigence${attainedCount == 1 ? '' : 's'} atteinte${attainedCount == 1 ? '' : 's'}'
          ' • $missingCount à compléter',
          style: TextStyle(
            color: textColor,
            fontSize: 12,
            fontWeight: FontWeight.w700,
          ),
        ),
        if (unknownCount > 0) ...[
          const SizedBox(height: 3),
          Text(
            '$unknownCount exigence${unknownCount == 1 ? '' : 's'} '
            'à vérifier faute de données',
            style: TextStyle(color: mutedColor, fontSize: 12),
          ),
        ],
        const SizedBox(height: 3),
        Text(
          'Progression des données disponibles : ${experience.modulePct} %',
          style: TextStyle(color: mutedColor, fontSize: 12),
        ),
      ],
    );
  }
}

class _RequirementRow extends StatelessWidget {
  final String label;
  final SnapshotMilRequirement requirement;
  final Color textColor;
  final Color mutedColor;
  final bool compact;

  const _RequirementRow({
    required this.label,
    required this.requirement,
    required this.textColor,
    required this.mutedColor,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    if (compact) {
      final known = !requirement.dataMissing;
      final attained = known && requirement.have >= requirement.need;
      final statusColor = !known
          ? mutedColor
          : attained
              ? Colors.green
              : Colors.orange.shade700;
      return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
              child: Text(label,
                  style: TextStyle(
                      color: textColor,
                      fontSize: 13,
                      fontWeight: FontWeight.w600))),
          const SizedBox(width: 8),
          Text(
              known
                  ? '${requirement.have}/${requirement.need}'
                  : '—/${requirement.need}',
              style: TextStyle(
                  color: textColor, fontSize: 13, fontWeight: FontWeight.w800)),
          const SizedBox(width: 6),
          Tooltip(
              message: !known
                  ? 'Données manquantes'
                  : attained
                      ? 'Atteint'
                      : 'Manque ${requirement.need - requirement.have}',
              child: Icon(
                  !known
                      ? Icons.help_outline
                      : attained
                          ? Icons.check_circle_outline
                          : Icons.remove_circle_outline,
                  color: statusColor,
                  size: 17)),
        ]),
        if (!attained)
          Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                  !known
                      ? 'Données manquantes'
                      : 'Manque ${requirement.need - requirement.have}',
                  style: TextStyle(color: statusColor, fontSize: 11))),
        const SizedBox(height: 4),
        LinearProgressIndicator(
            value: known ? requirement.ratio : 0,
            minHeight: 3,
            backgroundColor: textColor.withValues(alpha: 0.12),
            valueColor: AlwaysStoppedAnimation<Color>(statusColor)),
      ]);
    }
    if (requirement.dataMissing) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(color: textColor, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 3),
          Text(
            'Données manquantes • requis ${requirement.need}',
            style: TextStyle(color: mutedColor, fontSize: 12),
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
