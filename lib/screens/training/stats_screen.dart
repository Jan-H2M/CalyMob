/// Carnet de Formation — Personal stats & map screen.
///
/// Spec : `CARNET_DE_FORMATION_TECH.md` v2.1 §9 + mockup 10.
///
/// Mandatory elements per Jan's feedback :
///   - Year filter pills (current, previous, ..., 'Tout')
///   - Depth histogram in 5 m buckets (0-5, ..., 35+)
///   - Monthly seasonality bars (high season Apr-Sep blue, low season orange)
///   - 'Plongées en mer' KPI highlighted
///
/// Computes everything client-side from `student_logbook_entries`.

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/formation_snapshot_doc.dart';
import '../../models/mil_experience_overview.dart';
import '../../providers/auth_provider.dart';
import '../../services/formation_snapshot_reader.dart';
import '../../services/mil_experience_service.dart';
import '../../widgets/formation/mil_requirements_card.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

@visibleForTesting
class StatsMilExperienceSection extends StatelessWidget {
  final MilExperienceOverview? overview;
  final bool loading;
  final VoidCallback? onRetry;
  final bool hasActiveTraining;

  const StatsMilExperienceSection({
    super.key,
    required this.overview,
    required this.loading,
    this.onRetry,
    this.hasActiveTraining = true,
  });

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Center(
          child: CircularProgressIndicator(color: Colors.white));
    }
    if (!hasActiveTraining && (overview == null || overview!.isEmpty)) {
      return const Text('Aucun brevet plongée en préparation.',
          style: TextStyle(color: Colors.white, fontSize: 12));
    }
    final data = overview;
    if (data != null && !data.isEmpty) {
      return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (!hasActiveTraining)
          const Padding(
              padding: EdgeInsets.only(bottom: 6),
              child: Text('Brevet plongée acquis · référence informative',
                  style: TextStyle(color: Colors.white, fontSize: 12))),
        MilRequirementsCard(
            overview: data, inlineExpanded: true, compactRows: true),
      ]);
    }
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          const Expanded(
            child: Text(
              "Les exigences LIFRAS ne sont pas disponibles pour l'instant.",
              style: TextStyle(color: AppColors.donkerblauw),
            ),
          ),
          if (onRetry != null)
            TextButton(onPressed: onRetry, child: const Text('Réessayer')),
        ],
      ),
    );
  }
}

/// Uses the same live goal priority as the pupil fiche. A stored snapshot
/// cannot silently re-enable a closed SCUBA training (e.g. apnée-only).
/// Without active SCUBA, the acquired brevet is an explicitly labelled
/// informative reference, never an inferred future training goal.
@visibleForTesting
String? statsTargetBrevet(
        {required bool formationActive,
        String? targetFormationLevel,
        String? currentCode,
        String? snapshotTargetLevel}) =>
    formationActive
        ? resolvePreferredMilBrevet(
            targetFormationLevel: targetFormationLevel,
            currentCode: currentCode,
            snapshotTargetLevel: snapshotTargetLevel)
        : currentCode?.trim().toUpperCase() == 'NB'
            ? null
            : milBrevetCodeForTarget(currentCode);

class StatsTrainingGoal {
  final bool active;
  final String? brevet;
  const StatsTrainingGoal({required this.active, this.brevet});

  /// MemberProvider is a login cache, not authoritative after an enrollment
  /// change. Read the same safe live directory as the pupil fiche on each load.
  static Future<StatsTrainingGoal> load(
      FirebaseFirestore db, String clubId, String memberId,
      {String? snapshotTargetLevel}) async {
    final doc = await db.doc('clubs/$clubId/member_directory/$memberId').get();
    // Hidden technical accounts deliberately have no directory projection.
    // Stats is self-scoped: their own current member document remains readable
    // under the existing Firestore rules. Never substitute another identity.
    final data = doc.data() ??
        (await db.doc('clubs/$clubId/members/$memberId').get()).data();
    if (data == null) throw StateError('Formation actuelle indisponible');
    final active = data['formation_active'] == true;
    return StatsTrainingGoal(
        active: active,
        brevet: statsTargetBrevet(
            formationActive: active,
            targetFormationLevel: data['target_formation_level'] as String?,
            currentCode: data['plongeur_code'] as String?,
            snapshotTargetLevel: snapshotTargetLevel));
  }
}

/// All year-filtered dive KPIs share one small surface instead of large tiles.
class StatsSummary extends StatelessWidget {
  final List<Map<String, dynamic>> entries;
  const StatsSummary({super.key, required this.entries});
  @override
  Widget build(BuildContext context) {
    final s = _computeStats(entries);
    final items = [
      ('${s.totalDives}', 'plongées'),
      ('${s.totalHours} h', 'temps total'),
      ('${s.seaDives}', 'en mer'),
      ('${s.maxDepth.toStringAsFixed(0)} m', 'prof. max')
    ];
    return Container(
      key: const Key('stats-compact-summary'),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.96),
          borderRadius: BorderRadius.circular(12)),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Row(children: [
          for (final item in items)
            Expanded(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
              FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text(item.$1,
                      style: const TextStyle(
                          color: AppColors.middenblauw,
                          fontWeight: FontWeight.w800,
                          fontSize: 19))),
              Text(item.$2,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      color: AppColors.donkerblauw, fontSize: 11)),
            ]))
        ]),
        if (s.poolSessions > 0)
          Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                  '${s.poolSessions} séance${s.poolSessions == 1 ? '' : 's'} piscine',
                  style: const TextStyle(
                      color: AppColors.donkerblauw, fontSize: 11))),
      ]),
    );
  }
}

class StatsScreen extends StatefulWidget {
  const StatsScreen({super.key});

  @override
  State<StatsScreen> createState() => _StatsScreenState();
}

class _StatsScreenState extends State<StatsScreen> {
  final FormationSnapshotReader _formationReader = FormationSnapshotReader();
  final MilExperienceService _milExperienceService = MilExperienceService();
  int? _year; // null = 'Tout'
  List<Map<String, dynamic>> _entries = [];
  MilExperienceOverview? _milOverview;
  bool _loading = true;
  bool _hasActiveTraining = false;
  String? _loadError;

  @override
  void initState() {
    super.initState();
    _year = DateTime.now().year;
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      const clubId = FirebaseConfig.defaultClubId;
      final userId = context.read<AuthProvider>().currentUser?.uid;
      if (userId == null) {
        setState(() {
          _entries = [];
          _loading = false;
        });
        return;
      }

      // Always fetch the full member-scoped collection — year filtering is
      // applied client-side in `_computeStats`. The combo (member_id ==,
      // date range) used to be applied here directly, but it silently
      // returned zero entries when the underlying composite index wasn't
      // a perfect match for the implicit `orderBy date ASC` that Firestore
      // injects for range filters. Symptom Jan reported 2026-05-14: "totaal
      // aantal duiken totaal en per jaar is hetzelfde". Solution: a single
      // index-friendly query per member (typical member <1000 entries), and
      // year filtering in memory.
      final q = FirebaseFirestore.instance
          .collection('clubs')
          .doc(clubId)
          .collection('student_logbook_entries')
          .where('member_id', isEqualTo: userId);

      final results = await Future.wait([
        q.get(),
        _formationReader.getSnapshot(clubId, userId),
      ]);
      final snap = results[0] as QuerySnapshot<Map<String, dynamic>>;
      final formationSnapshot = results[1] as FormationSnapshotDoc?;
      final entries = snap.docs
          .map((d) => <String, dynamic>{'id': d.id, ...d.data()})
          .toList();
      final goal = await StatsTrainingGoal.load(
        FirebaseFirestore.instance,
        clubId,
        userId,
        snapshotTargetLevel: formationSnapshot?.targetLevel,
      );
      final preferredBrevet = goal.brevet;
      MilExperienceOverview? overview;
      try {
        overview = await _milExperienceService.loadForEntries(
          clubId: clubId,
          entries: entries,
          preferredBrevet: preferredBrevet,
        );
      } catch (error, stackTrace) {
        debugPrint('[stats_screen] lecture MIL impossible: '
            '$error\n$stackTrace');
      }
      overview ??= formationSnapshot == null
          ? null
          : MilExperienceOverview.fromSnapshot(formationSnapshot);
      // Rebind the historical fallback to the live goal; never relabel its
      // counts as another brevet, nor pick the first configured matrix.
      if (overview != null) {
        overview = MilExperienceOverview(
            byBrevet: overview.byBrevet,
            preferredBrevet: preferredBrevet ?? 'UNKNOWN',
            sourceVersion: overview.sourceVersion,
            snapshotFallback: overview.snapshotFallback);
      }
      if (!mounted) return;
      setState(() {
        _entries = entries;
        _milOverview = overview;
        _hasActiveTraining = goal.active;
        _loading = false;
      });
    } catch (err, st) {
      // Never silently swallow — Jan needs to see this if Firestore rules or
      // an index ever break the query.
      debugPrint('[stats_screen] load failed: $err\n$st');
      if (!mounted) return;
      setState(() {
        _entries = [];
        _milOverview = null;
        _loadError = 'Impossible de charger les statistiques. Réessayez.';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    // Client-side year filter — kept in build() so year-pill toggles are
    // instantaneous (no second Firestore round trip).
    final filtered = _year == null
        ? _entries
        : _entries.where((e) {
            final ts = e['date'];
            if (ts is! Timestamp) return false;
            final y = ts.toDate().year;
            return y == _year;
          }).toList();
    final stats = _computeStats(filtered);

    return Scaffold(
      body: OceanGradientBackground(
        creatures: CreatureSet.jellyfishAndBubbles,
        child: SafeArea(
          child: Column(
            children: [
              _header(),
              Expanded(
                child: _loading
                    ? const Center(
                        child: CircularProgressIndicator(color: Colors.white))
                    : _loadError != null
                        ? Center(
                            child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                Text(_loadError!,
                                    style:
                                        const TextStyle(color: Colors.white)),
                                TextButton(
                                    onPressed: _load,
                                    child: const Text('Réessayer')),
                              ]))
                        : ListView(
                            padding: const EdgeInsets.fromLTRB(12, 0, 12, 20),
                            children: [
                              _yearPills(),
                              const SizedBox(height: 8),
                              StatsSummary(entries: filtered),
                              const SizedBox(height: 8),
                              _countersCard(stats),
                              const SizedBox(height: 8),
                              StatsMilExperienceSection(
                                overview: _milOverview,
                                loading: false,
                                onRetry: _load,
                                hasActiveTraining: _hasActiveTraining,
                              ),
                              const SizedBox(height: 8),
                              _depthHistogramCard(stats),
                              const SizedBox(height: 8),
                              _monthsCard(stats),
                              const SizedBox(height: 8),
                              _locationsCard(stats),
                            ],
                          ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _header() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 12, 8, 12),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.white, size: 26),
            onPressed: () => Navigator.pop(context),
          ),
          const Expanded(
            child: Text(
              'Statistiques',
              style: TextStyle(
                color: Colors.white,
                fontSize: 22,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Years present in `_entries`, sorted newest-first, plus a final `null`
  /// representing "Tout". When the carnet is empty (or still loading) we
  /// surface the current year as a stable default.
  List<int?> _availableYears() {
    final years = <int>{};
    for (final e in _entries) {
      final ts = e['date'];
      if (ts is Timestamp) years.add(ts.toDate().year);
    }
    final sorted = years.toList()..sort((a, b) => b.compareTo(a));
    if (sorted.isEmpty) sorted.add(DateTime.now().year);
    return <int?>[...sorted, null];
  }

  Widget _yearPills() {
    // Derive the visible year set from the actual data — historical divers
    // typically span 10+ years and the hard-coded "last 3" list was hiding
    // most of their carnet. Fall back to the current year when empty so the
    // pills never collapse to a single "Tout".
    final years = _availableYears();
    return Wrap(
      spacing: 6,
      children: years.map((y) {
        final isOn = y == _year;
        return ChoiceChip(
          label: Text(y == null ? 'Tout' : '$y'),
          selected: isOn,
          onSelected: (_) {
            // Year filter applied client-side now — no need to re-query.
            setState(() => _year = y);
          },
          labelStyle: TextStyle(
            color: isOn ? Colors.white : AppColors.donkerblauw,
            fontWeight: FontWeight.w700,
            fontSize: 12,
          ),
          selectedColor: AppColors.middenblauw,
          backgroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
        );
      }).toList(),
    );
  }

  Widget _depthHistogramCard(_Stats s) {
    final maxVal = s.depthHistogram.fold<int>(0, (a, b) => b > a ? b : a);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'PROFONDEURS — TRANCHES DE 5 m',
            style: TextStyle(
              color: AppColors.donkerblauw.withValues(alpha: 0.7),
              fontSize: 11,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.1,
            ),
          ),
          const SizedBox(height: 12),
          // Numbers row
          Row(
            children: List.generate(8, (i) {
              final v = s.depthHistogram[i];
              return Expanded(
                child: Center(
                  child: Text(
                    '$v',
                    style: TextStyle(
                      color: i == 7 ? AppColors.oranje : AppColors.donkerblauw,
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              );
            }),
          ),
          const SizedBox(height: 4),
          // Bars row
          SizedBox(
            height: 44,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: List.generate(8, (i) {
                final v = s.depthHistogram[i];
                final h = maxVal == 0 ? 0.0 : (v / maxVal);
                return Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 2),
                    child: FractionallySizedBox(
                      heightFactor: h,
                      child: Container(
                        decoration: BoxDecoration(
                          gradient: i == 7
                              ? const LinearGradient(
                                  colors: [Color(0xFFFCD9A6), AppColors.oranje],
                                  begin: Alignment.topCenter,
                                  end: Alignment.bottomCenter,
                                )
                              : const LinearGradient(
                                  colors: [
                                    Color(0xFF6BCBE8),
                                    AppColors.middenblauw
                                  ],
                                  begin: Alignment.topCenter,
                                  end: Alignment.bottomCenter,
                                ),
                          borderRadius: const BorderRadius.vertical(
                            top: Radius.circular(4),
                          ),
                        ),
                      ),
                    ),
                  ),
                );
              }),
            ),
          ),
          const SizedBox(height: 4),
          const Row(
            children: [
              Expanded(child: Center(child: Text('5', style: _axisStyle))),
              Expanded(child: Center(child: Text('10', style: _axisStyle))),
              Expanded(child: Center(child: Text('15', style: _axisStyle))),
              Expanded(child: Center(child: Text('20', style: _axisStyle))),
              Expanded(child: Center(child: Text('25', style: _axisStyle))),
              Expanded(child: Center(child: Text('30', style: _axisStyle))),
              Expanded(child: Center(child: Text('35', style: _axisStyle))),
              Expanded(child: Center(child: Text('40+', style: _axisStyle))),
            ],
          ),
        ],
      ),
    );
  }

  Widget _monthsCard(_Stats s) {
    final maxVal = s.months.fold<int>(0, (a, b) => b > a ? b : a);
    const labels = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'PLONGÉES PAR MOIS — SAISONNALITÉ',
            style: TextStyle(
              color: AppColors.donkerblauw.withValues(alpha: 0.7),
              fontSize: 11,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.1,
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 44,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: List.generate(12, (i) {
                final v = s.months[i];
                final h = maxVal == 0 ? 0.0 : (v / maxVal);
                final isHighSeason = i >= 3 && i <= 8; // Apr (3) ... Sep (8)
                return Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 1.5),
                    child: FractionallySizedBox(
                      heightFactor: h,
                      child: Container(
                        decoration: BoxDecoration(
                          gradient: isHighSeason
                              ? const LinearGradient(
                                  colors: [
                                    Color(0xFF6BCBE8),
                                    AppColors.middenblauw
                                  ],
                                  begin: Alignment.topCenter,
                                  end: Alignment.bottomCenter,
                                )
                              : const LinearGradient(
                                  colors: [Color(0xFFFCD9A6), AppColors.oranje],
                                  begin: Alignment.topCenter,
                                  end: Alignment.bottomCenter,
                                ),
                          borderRadius: const BorderRadius.vertical(
                            top: Radius.circular(3),
                          ),
                        ),
                      ),
                    ),
                  ),
                );
              }),
            ),
          ),
          const SizedBox(height: 4),
          Row(
            children: labels
                .map((l) => Expanded(
                      child: Center(
                        child: Text(l, style: _axisStyle),
                      ),
                    ))
                .toList(),
          ),
        ],
      ),
    );
  }

  Widget _countersCard(_Stats s) {
    final chips = <Map<String, dynamic>>[
      {'label': 'DP', 'value': s.dpDives},
      {'label': 'SF', 'value': s.sfDives},
      {'label': 'Exo', 'value': s.exerciseDives},
      {'label': 'Nitrox', 'value': s.nitroxDives},
      {'label': 'Déco', 'value': s.decoDives},
      {'label': 'Nuit', 'value': s.nightDives},
    ];
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'COMPTEURS',
            style: TextStyle(
              color: AppColors.donkerblauw.withValues(alpha: 0.7),
              fontSize: 11,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.1,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: chips
                .map((c) => Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: const Color(0xFFEEF4F9),
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: Text(
                        '${c['label']} ${c['value']}',
                        style: const TextStyle(
                          color: AppColors.middenblauw,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ))
                .toList(),
          ),
        ],
      ),
    );
  }

  Widget _locationsCard(_Stats s) {
    if (s.topLocations.isEmpty) return const SizedBox.shrink();
    final maxCount = s.topLocations.first['count'] as int;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'TOP LIEUX',
            style: TextStyle(
              color: AppColors.donkerblauw.withValues(alpha: 0.7),
              fontSize: 11,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.1,
            ),
          ),
          const SizedBox(height: 8),
          ...s.topLocations.take(5).map((loc) {
            final count = loc['count'] as int;
            final ratio = maxCount == 0 ? 0.0 : count / maxCount;
            return Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          loc['name'],
                          style: TextStyle(
                            color:
                                AppColors.donkerblauw.withValues(alpha: 0.85),
                            fontSize: 12.5,
                          ),
                        ),
                      ),
                      Text(
                        '$count',
                        style: const TextStyle(
                          color: AppColors.donkerblauw,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 3),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: LinearProgressIndicator(
                      value: ratio,
                      minHeight: 6,
                      backgroundColor: const Color(0xFFE2EBF3),
                      valueColor: const AlwaysStoppedAnimation<Color>(
                          AppColors.middenblauw),
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }
}

const _axisStyle = TextStyle(
  color: Color(0xFF94A3B8),
  fontSize: 10,
);

// ---------------------------------------------------------------------------
// Stats computation
// ---------------------------------------------------------------------------

class _Stats {
  final int totalDives;
  final int totalHours;
  final double maxDepth;
  final int seaDives;
  final int nitroxDives;
  final int decoDives;
  final int nightDives;
  final int dpDives;
  final int sfDives;
  final int exerciseDives;
  final int poolSessions;
  final List<int> depthHistogram;
  final List<int> months;
  final List<Map<String, dynamic>> topLocations;

  const _Stats({
    required this.totalDives,
    required this.totalHours,
    required this.maxDepth,
    required this.seaDives,
    required this.nitroxDives,
    required this.decoDives,
    required this.nightDives,
    required this.dpDives,
    required this.sfDives,
    required this.exerciseDives,
    required this.poolSessions,
    required this.depthHistogram,
    required this.months,
    required this.topLocations,
  });
}

_Stats _computeStats(List<Map<String, dynamic>> entries) {
  int totalMinutes = 0;
  double maxDepth = 0;
  int sea = 0, nitrox = 0, deco = 0, night = 0, dp = 0, sf = 0, exo = 0;
  int totalDives = 0;
  int poolSessions = 0;
  final histogram = List<int>.filled(8, 0);
  final months = List<int>.filled(12, 0);
  final locationCounts = <String, Map<String, dynamic>>{};

  for (final e in entries) {
    // Pool sessions (source=piscine) are counted separately from dives
    // and excluded from every dive-oriented metric.
    if (e['source'] == 'piscine') {
      poolSessions += 1;
      continue;
    }
    totalDives += 1;
    final dur = e['duration_minutes'];
    if (dur is num) totalMinutes += dur.toInt();
    final depth = e['depth_max_meters'];
    if (depth is num) {
      if (depth > maxDepth) maxDepth = depth.toDouble();
      final bucket = (depth / 5).floor().clamp(0, 7);
      histogram[bucket] += 1;
    }
    final ts = e['date'];
    if (ts is Timestamp) {
      months[ts.toDate().month - 1] += 1;
    }
    final c = (e['counters'] as Map?) ?? {};
    if (c['mer'] == true) sea += 1;
    if (c['nitrox'] == true) nitrox += 1;
    if (c['deco'] == true) deco += 1;
    if (c['nuit'] == true) night += 1;
    if (c['dp'] == true) dp += 1;
    if (c['sf'] == true) sf += 1;
    if (c['exo'] == true) exo += 1;

    // Bucket Top Lieux by location_id when present, otherwise by a normalised
    // location_name. This is critical for Excel-imported and OCR-imported
    // entries, which rarely carry a `location_id` (no picker involved). Without
    // this fallback, hundreds of historical entries silently disappear from
    // the Top Lieux ranking.
    final locId = e['location_id'] as String?;
    final rawName = (e['location_name'] as String?)?.trim();
    if ((locId != null && locId.isNotEmpty) ||
        (rawName != null && rawName.isNotEmpty)) {
      final key = (locId != null && locId.isNotEmpty)
          ? 'id:$locId'
          : 'name:${rawName!.toLowerCase()}';
      final displayName = rawName ?? locId ?? '—';
      final existing = locationCounts[key];
      if (existing == null) {
        locationCounts[key] = {
          'id': locId ?? '',
          'name': displayName,
          'count': 1,
        };
      } else {
        existing['count'] = (existing['count'] as int) + 1;
      }
    }
  }

  final top = locationCounts.values.toList()
    ..sort((a, b) => (b['count'] as int).compareTo(a['count'] as int));

  return _Stats(
    totalDives: totalDives,
    totalHours: (totalMinutes / 60).round(),
    maxDepth: maxDepth,
    seaDives: sea,
    nitroxDives: nitrox,
    decoDives: deco,
    nightDives: night,
    dpDives: dp,
    sfDives: sf,
    exerciseDives: exo,
    poolSessions: poolSessions,
    depthHistogram: histogram,
    months: months,
    topLocations: top,
  );
}
