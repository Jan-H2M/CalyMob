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
import '../../providers/auth_provider.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

class StatsScreen extends StatefulWidget {
  const StatsScreen({super.key});

  @override
  State<StatsScreen> createState() => _StatsScreenState();
}

class _StatsScreenState extends State<StatsScreen> {
  int? _year; // null = 'Tout'
  List<Map<String, dynamic>> _entries = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _year = DateTime.now().year;
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      const clubId = FirebaseConfig.defaultClubId;
      final userId = context.read<AuthProvider>().currentUser?.uid;
      if (userId == null) return;

      Query<Map<String, dynamic>> q = FirebaseFirestore.instance
          .collection('clubs')
          .doc(clubId)
          .collection('student_logbook_entries')
          .where('member_id', isEqualTo: userId);

      if (_year != null) {
        q = q
            .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(DateTime(_year!, 1, 1)))
            .where('date', isLessThan: Timestamp.fromDate(DateTime(_year! + 1, 1, 1)));
      }

      final snap = await q.get();
      setState(() {
        _entries = snap.docs.map((d) => {'id': d.id, ...d.data()}).toList();
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final stats = _computeStats(_entries);

    return Scaffold(
      body: OceanGradientBackground(
        creatures: CreatureSet.jellyfishAndBubbles,
        child: SafeArea(
          child: Column(
            children: [
              _header(),
              Expanded(
                child: _loading
                    ? const Center(child: CircularProgressIndicator(color: Colors.white))
                    : ListView(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                        children: [
                          _yearPills(),
                          const SizedBox(height: 12),
                          _kpiGrid(stats),
                          const SizedBox(height: 12),
                          _depthHistogramCard(stats),
                          const SizedBox(height: 12),
                          _monthsCard(stats),
                          const SizedBox(height: 12),
                          _countersCard(stats),
                          const SizedBox(height: 12),
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
              'Mon carnet',
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

  Widget _yearPills() {
    final years = <int?>[DateTime.now().year, DateTime.now().year - 1, DateTime.now().year - 2, null];
    return Wrap(
      spacing: 6,
      children: years.map((y) {
        final isOn = y == _year;
        return ChoiceChip(
          label: Text(y == null ? 'Tout' : '$y'),
          selected: isOn,
          onSelected: (_) {
            setState(() => _year = y);
            _load();
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

  Widget _kpiGrid(_Stats s) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      childAspectRatio: 2.2,
      crossAxisSpacing: 8,
      mainAxisSpacing: 8,
      children: [
        _kpi('${s.totalDives}', 'plongées'),
        _kpi('${s.totalHours} h', 'temps total'),
        _kpi('${s.seaDives}', 'en mer', highlight: true),
        _kpi('${s.maxDepth.toStringAsFixed(0)} m', 'profondeur max'),
      ],
    );
  }

  Widget _kpi(String value, String label, {bool highlight = false}) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        gradient: highlight
            ? LinearGradient(
                colors: [
                  const Color(0xFF6BCBE8).withValues(alpha: 0.95),
                  const Color(0xFF0083B0).withValues(alpha: 0.85),
                ],
              )
            : null,
        color: highlight ? null : Colors.white.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            value,
            style: TextStyle(
              color: highlight ? Colors.white : AppColors.middenblauw,
              fontSize: 22,
              fontWeight: FontWeight.w800,
            ),
          ),
          Text(
            label,
            style: TextStyle(
              color: highlight
                  ? Colors.white.withValues(alpha: 0.95)
                  : AppColors.donkerblauw.withValues(alpha: 0.7),
              fontSize: 11,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
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
            height: 80,
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
                                  colors: [Color(0xFF6BCBE8), AppColors.middenblauw],
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
          Row(
            children: const [
              Expanded(child: Center(child: Text('5',  style: _axisStyle))),
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
            height: 70,
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
                                  colors: [Color(0xFF6BCBE8), AppColors.middenblauw],
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
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
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
                            color: AppColors.donkerblauw.withValues(alpha: 0.85),
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
                      valueColor: const AlwaysStoppedAnimation<Color>(AppColors.middenblauw),
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
    required this.depthHistogram,
    required this.months,
    required this.topLocations,
  });
}

_Stats _computeStats(List<Map<String, dynamic>> entries) {
  int totalMinutes = 0;
  double maxDepth = 0;
  int sea = 0, nitrox = 0, deco = 0, night = 0, dp = 0, sf = 0, exo = 0;
  final histogram = List<int>.filled(8, 0);
  final months = List<int>.filled(12, 0);
  final locationCounts = <String, Map<String, dynamic>>{};

  for (final e in entries) {
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

    final locId = e['location_id'] as String?;
    final locName = e['location_name'] as String? ?? locId ?? '—';
    if (locId != null) {
      final existing = locationCounts[locId];
      if (existing == null) {
        locationCounts[locId] = {'id': locId, 'name': locName, 'count': 1};
      } else {
        existing['count'] = (existing['count'] as int) + 1;
      }
    }
  }

  final top = locationCounts.values.toList()
    ..sort((a, b) => (b['count'] as int).compareTo(a['count'] as int));

  return _Stats(
    totalDives: entries.length,
    totalHours: (totalMinutes / 60).round(),
    maxDepth: maxDepth,
    seaDives: sea,
    nitroxDives: nitrox,
    decoDives: deco,
    nightDives: night,
    dpDives: dp,
    sfDives: sf,
    exerciseDives: exo,
    depthHistogram: histogram,
    months: months,
    topLocations: top,
  );
}
