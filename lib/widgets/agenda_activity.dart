import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../config/app_colors.dart';
import '../models/activity_item.dart';
import 'event_card_decoration.dart';
import 'event_card_heading.dart';

extension AgendaCategoryIcon on AgendaActivityCategory {
  IconData get agendaIcon => switch (this) {
        AgendaActivityCategory.plongee => Icons.scuba_diving,
        AgendaActivityCategory.piscine => Icons.pool,
        AgendaActivityCategory.sortie => Icons.directions_boat,
      };
}

/// Group activities by month
Map<String, List<ActivityItem>> groupAgendaActivitiesByMonth(
    List<ActivityItem> activities) {
  final Map<String, List<ActivityItem>> grouped = {};

  for (final item in activities) {
    final monthKey = DateFormat('MMMM yyyy', 'fr_FR').format(item.date);

    if (!grouped.containsKey(monthKey)) {
      grouped[monthKey] = [];
    }
    grouped[monthKey]!.add(item);
  }

  // Sort activities within each month by date
  for (final key in grouped.keys) {
    grouped[key]!.sort((a, b) => a.date.compareTo(b.date));
  }

  return grouped;
}

class AgendaMonthHeader extends StatelessWidget {
  const AgendaMonthHeader(this.monthName, {super.key});
  final String monthName;

  @override
  Widget build(BuildContext context) {
    // Capitalize first letter
    final capitalizedMonth =
        monthName[0].toUpperCase() + monthName.substring(1);

    return Container(
      margin: const EdgeInsets.only(top: 16, bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [AppColors.donkerblauw, AppColors.middenblauw],
        ),
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: AppColors.donkerblauw.withOpacity(0.3),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        children: [
          Icon(
            Icons.calendar_month,
            color: Colors.white.withOpacity(0.9),
            size: 20,
          ),
          const SizedBox(width: 10),
          Text(
            capitalizedMonth,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: Colors.white,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }
}

class AgendaActivityCard extends StatelessWidget {
  const AgendaActivityCard({
    super.key,
    required this.item,
    required this.clubId,
    required this.onTap,
    required this.trailing,
  });

  final ActivityItem item;
  final String clubId;
  final VoidCallback onTap;
  final Widget trailing;

  @override
  Widget build(BuildContext context) {
    final appearance = item.cardAppearance?.forTarget(
        clubId, item.isPiscine ? 'piscine_sessions' : 'operations', item.id);
    final accent = appearance?.accent;
    final dateTextColor = !item.isDraft &&
            !item.isCancelled &&
            accent != null &&
            accent.computeLuminance() > 0.18
        ? AppColors.donkerblauw
        : Colors.white;
    final dayName = DateFormat('EEEE', 'fr_FR').format(item.date);
    final dayNumber = DateFormat('d', 'fr_FR').format(item.date);

    // Tijd bepalen op basis van type
    String time;
    if (item.isPiscine && item.horaire != null) {
      time = item.horaire!;
    } else if (item.operation?.dateDebut != null) {
      time = DateFormat('HH:mm', 'fr_FR').format(item.operation!.dateDebut!);
    } else {
      time = '--:--';
    }

    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: item.isCancelled
              ? const Color(0xFFFFE4E6)
              : accent == null
                  ? Colors.white
                  : Color.alphaBlend(
                      accent.withValues(alpha: 0.10), Colors.white),
          borderRadius: BorderRadius.circular(16),
          border: item.isCancelled
              ? Border.all(color: const Color(0xFFDC2626), width: 3)
              : null,
          boxShadow: [
            BoxShadow(
              color: AppColors.donkerblauw.withOpacity(0.15),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: Stack(
            children: [
              IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Date badge on the left
                    Container(
                      width: 70,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: item.isDraft
                              ? const [Color(0xFFF59E0B), Color(0xFFB45309)]
                              : item.isCancelled
                                  ? const [Color(0xFFEF4444), Color(0xFF991B1B)]
                                  : accent != null
                                      ? [
                                          accent,
                                          Color.alphaBlend(
                                              Colors.black
                                                  .withValues(alpha: 0.12),
                                              accent)
                                        ]
                                      : item.isPiscine
                                          ? [
                                              AppColors
                                                  .piscineBlauwLight, // Piscine blauw
                                              AppColors.piscineBlauw,
                                            ]
                                          : [
                                              AppColors.middenblauw,
                                              AppColors.donkerblauw
                                            ],
                        ),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            dayNumber,
                            style: TextStyle(
                              fontSize: 28,
                              fontWeight: FontWeight.bold,
                              color: dateTextColor,
                              height: 1,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            dayName.substring(0, 3).toUpperCase(),
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: dateTextColor.withOpacity(0.9),
                              letterSpacing: 1,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.white.withOpacity(0.2),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              time,
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                                color: dateTextColor,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    // Title and every detail remain left of full-height artwork.
                    Expanded(
                      child: EventCardBody(
                        appearance: !item.isCancelled ? appearance : null,
                        children: [
                          EventCardHeading(
                            title: item.titre,
                            icon: item.agendaCategory.agendaIcon,
                            iconColor: item.isPiscine
                                ? AppColors.piscineBlauw
                                : AppColors.middenblauw,
                            appearance: !item.isCancelled ? appearance : null,
                          ),
                          if (item.lieu != null &&
                              item.lieu!.isNotEmpty &&
                              !item.isPiscine) ...[
                            const SizedBox(height: 8),
                            Row(children: [
                              Icon(Icons.location_on,
                                  size: 14, color: Colors.grey[600]),
                              const SizedBox(width: 4),
                              Expanded(
                                  child: Text(item.lieu!,
                                      style: TextStyle(
                                          fontSize: 13,
                                          color: Colors.grey[700]),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis)),
                            ]),
                          ],
                          const SizedBox(height: 8),
                          _buildActivityInfo(item,
                              stacked: !item.isCancelled &&
                                  appearance?.hasArtwork == true),
                        ],
                      ),
                    ),
                    // Unread badge + arrow indicator
                    trailing,
                  ],
                ),
              ),
              if (!item.isCancelled && appearance?.theme == 'christmas')
                Positioned.fill(
                  child: EventCardDecoration(
                    appearance: appearance!,
                    particlesOnly: true,
                  ),
                ),
              if (item.isCancelled)
                Positioned.fill(
                  child: IgnorePointer(
                    child: Center(
                      child: Transform.rotate(
                        angle: -0.22,
                        child: Text(
                          'ANNULÉ',
                          style: TextStyle(
                            color: const Color(0xFFB91C1C).withOpacity(0.72),
                            fontSize: 34,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 4,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildActivityInfo(ActivityItem item, {required bool stacked}) {
    final draft = item.isDraft
        ? Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
                color: const Color(0xFFFFF3C4),
                borderRadius: BorderRadius.circular(8)),
            child: Text(item.statusLabel!,
                style: const TextStyle(
                    color: Color(0xFF92400E),
                    fontSize: 12,
                    fontWeight: FontWeight.bold)),
          )
        : null;
    final count = item.isPiscine
        ? item.subtitle ?? ''
        : item.capaciteMax != null && item.capaciteMax! > 0
            ? 'Max ${item.capaciteMax}'
            : null;
    final people = count == null
        ? null
        : Row(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.group,
                  size: 14,
                  color: (item.isPiscine
                          ? AppColors.piscineBlauw
                          : AppColors.middenblauw)
                      .withOpacity(0.7)),
              const SizedBox(width: 4),
              Flexible(
                  child: Text(count,
                      style: TextStyle(fontSize: 13, color: Colors.grey[600]))),
            ],
          );
    final tbd = !item.isPiscine && item.operation?.priceTbd == true;
    final paid = !item.isPiscine && item.prix != null && item.prix! > 0;
    final price = !tbd && !paid
        ? null
        : Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
                color: tbd
                    ? Colors.orange.withOpacity(0.25)
                    : AppColors.lichtblauw.withOpacity(0.3),
                borderRadius: BorderRadius.circular(8)),
            child: Text(
                tbd ? 'Prix à confirmer' : '${item.prix!.toStringAsFixed(2)} €',
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color:
                        tbd ? const Color(0xFFB45309) : AppColors.donkerblauw)),
          );
    if (stacked) {
      final rows = [
        if (draft != null) draft,
        if (people != null) people,
        if (price != null) price
      ];
      return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        for (var i = 0; i < rows.length; i++) ...[
          if (i > 0) const SizedBox(height: 6),
          rows[i],
        ]
      ]);
    }
    return Row(children: [
      if (draft != null) ...[draft, const SizedBox(width: 8)],
      if (people != null) Expanded(child: people) else const Spacer(),
      if (price != null) price,
    ]);
  }
}
