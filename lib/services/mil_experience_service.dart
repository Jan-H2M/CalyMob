import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/formation_snapshot_doc.dart';
import '../models/mil_experience_overview.dart';
import '../utils/dive_depth.dart';

/// Leest de actuele, door de club gevalideerde MIL-matrix en berekent de
/// cumulatieve stand op basis van het volledige carnet.
///
/// Deze ene implementatie wordt gebruikt door Statistiques, Mes exercices en
/// de volledige moniteurfiche. Ze is een exacte Dart-tegenhanger van de pure
/// `computeExperienceCounts`-regels in de snapshot producer.
class MilExperienceService {
  final FirebaseFirestore _firestore;

  MilExperienceService({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  Future<MilExperienceOverview?> load({
    required String clubId,
    required String memberId,
    String? preferredBrevet,
  }) async {
    final results = await Future.wait([
      _firestore
          .collection('clubs')
          .doc(clubId)
          .collection('settings')
          .doc('mil_requirements')
          .get(),
      _firestore
          .collection('clubs')
          .doc(clubId)
          .collection('student_logbook_entries')
          .where('member_id', isEqualTo: memberId)
          .get(),
    ]);
    final settings = results[0] as DocumentSnapshot<Map<String, dynamic>>;
    final entries = results[1] as QuerySnapshot<Map<String, dynamic>>;
    final data = settings.data();
    if (!settings.exists || data == null) return null;
    return calculateMilExperienceOverview(
      entries: entries.docs.map((doc) => doc.data()),
      settings: data,
      preferredBrevet: preferredBrevet,
    );
  }

  Future<MilExperienceOverview?> loadForEntries({
    required String clubId,
    required Iterable<Map<String, dynamic>> entries,
    String? preferredBrevet,
  }) async {
    final settings = await _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('settings')
        .doc('mil_requirements')
        .get();
    final data = settings.data();
    if (!settings.exists || data == null) return null;
    return calculateMilExperienceOverview(
      entries: entries,
      settings: data,
      preferredBrevet: preferredBrevet,
    );
  }
}

MilExperienceOverview? calculateMilExperienceOverview({
  required Iterable<Map<String, dynamic>> entries,
  required Map<String, dynamic> settings,
  String? preferredBrevet,
}) {
  final table = _map(settings['experience_table']);
  final approvedBy = settings['approved_by']?.toString().trim() ?? '';
  if (table.isEmpty || approvedBy.isEmpty) return null;

  final counts = computeMilExperienceCounts(
    entries,
    _map(settings['counting_rules']),
  );
  final byBrevet = <String, MilBrevetExperience>{};

  for (final entry in table.entries) {
    if (entry.value is! Map) continue;
    final requirementsConfig = _map(entry.value);
    final requirements = <String, SnapshotMilRequirement>{};
    var sumNeed = 0;
    var sumHave = 0;
    for (final requirement in requirementsConfig.entries) {
      final need = _number(requirement.value)?.toInt();
      if (need == null || need <= 0) continue;
      final dataMissing = _dataMissingKeys.contains(requirement.key);
      final have = dataMissing ? 0 : (counts[requirement.key] ?? 0);
      requirements[requirement.key] = SnapshotMilRequirement(
        have: have,
        need: need,
        dataMissing: dataMissing,
      );
      if (!dataMissing) {
        sumNeed += need;
        sumHave += have < need ? have : need;
      }
    }
    final modulePct = sumNeed == 0 ? 0 : ((sumHave / sumNeed) * 100).round();
    final code = entry.key.trim().toUpperCase();
    byBrevet[code] = MilBrevetExperience(
      brevetCode: code,
      requirements: requirements,
      modulePct: modulePct,
    );
  }

  if (byBrevet.isEmpty) return null;
  return MilExperienceOverview(
    byBrevet: byBrevet,
    preferredBrevet: preferredBrevet?.trim().toUpperCase(),
    sourceVersion: settings['source_version']?.toString(),
  );
}

const _dataMissingKeys = {'encadrement', 'encadrement_mer'};

/// Pure cumulatieve teller. Dezelfde toleranties en Zélande-regels als de
/// server-side snapshotberekening; één duik mag meerdere drempels halen.
Map<String, int> computeMilExperienceCounts(
  Iterable<Map<String, dynamic>> entries,
  Map<String, dynamic> countingRules,
) {
  final tolerancePct = _number(countingRules['tolerance_pct']) ?? 10;
  final toleranceFactor = 1 - tolerancePct / 100;
  final zelandeRules = _map(countingRules['zelande']);
  final excludeDeco = zelandeRules['exclude_deco'] != false;
  final excludeBeyond40 = zelandeRules['exclude_beyond_40m'] != false;
  final zelandeTolerance = zelandeRules['tolerance_mer_max_40m'] != false;

  final counts = <String, int>{
    'total_milieu_naturel': 0,
    'prof_20m': 0,
    'prof_30m': 0,
    'prof_40m': 0,
    'encadrement': 0,
    'nuit': 0,
    'mer': 0,
    'mer_30m': 0,
    'mer_40m': 0,
    'mer_maree': 0,
    'encadrement_mer': 0,
    'dp_mer_deco': 0,
    'mer_45m': 0,
    'mer_50m': 0,
    'surveillance_ciel': 0,
  };

  void increment(String key) => counts[key] = (counts[key] ?? 0) + 1;

  for (final entry in entries) {
    if (entry['source']?.toString() == 'piscine') continue;
    final counters = _map(entry['counters']);
    final depth = parseDiveDepth(entry['depth_max_meters']);
    final isSea = counters['mer'] == true || entry['water_type'] == 'sea';
    final isZelande = entry['zone']?.toString() == 'zelande';
    final isDeco = counters['deco'] == true;

    increment('total_milieu_naturel');
    if (counters['nuit'] == true) increment('nuit');
    if (counters['surveillance'] == true) increment('surveillance_ciel');

    // MIL §7.4.2: general depth experience includes sea dives cumulatively.
    // « Nos Eaux » (including Zélande) only changes the allowed tolerance;
    // it is not an exclusion of open-sea dives from these general counters.
    if (depth != null) {
      final generalFactor = !isSea || isZelande ? toleranceFactor : 1;
      if (depth >= 20 * generalFactor) increment('prof_20m');
      if (depth >= 30 * generalFactor) increment('prof_30m');
      if (depth >= 40 * generalFactor) increment('prof_40m');
    }

    if (!isSea) continue;
    increment('mer');
    if (counters['maree'] == true) increment('mer_maree');

    if (isZelande) {
      final skip = (excludeDeco && isDeco) ||
          (excludeBeyond40 && depth != null && depth > 40);
      if (!skip && depth != null) {
        final factor = zelandeTolerance ? toleranceFactor : 1;
        if (depth >= 30 * factor) increment('mer_30m');
        if (depth >= 40 * factor) increment('mer_40m');
      }
    } else if (depth != null) {
      if (depth >= 30) increment('mer_30m');
      if (depth >= 40) increment('mer_40m');
      if (depth >= 45) increment('mer_45m');
      if (depth >= 50) increment('mer_50m');
    }

    if (isDeco && counters['dp'] == true && !isZelande) {
      increment('dp_mer_deco');
    }
  }
  return counts;
}

Map<String, dynamic> _map(dynamic value) => value is Map
    ? value.map((key, item) => MapEntry(key.toString(), item))
    : <String, dynamic>{};

double? _number(dynamic value) {
  if (value is num) {
    final parsed = value.toDouble();
    return parsed.isFinite ? parsed : null;
  }
  if (value is String) {
    final parsed = double.tryParse(value.replaceAll(',', '.'));
    return parsed != null && parsed.isFinite ? parsed : null;
  }
  return null;
}
