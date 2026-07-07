import 'package:cloud_firestore/cloud_firestore.dart';

/// WP-10 — Lecture typée du document matérialisé
/// `members/{id}/formation_snapshot/current` (produit par la CF WP-09).
///
/// Contrairement au `FormationSnapshot` historique (utilisé par
/// monitor_planning), ce modèle expose TOUT l'agrégat : points d'attention,
/// expérience MIL, objectifs, per_code — nécessaires à la liste Formation et
/// à la fiche 360°.
class FormationSnapshotDoc {
  final String memberId;
  final String? targetLevel; // libellé « étoile » : '2*', 'AM', …
  final String currentCode;

  final List<SnapshotExercise> validated;
  final List<SnapshotExercise> pending;
  final List<SnapshotClaim> pendingClaims;
  final List<SnapshotExercise> remaining;
  final Map<String, SnapshotPerCode> perCode;
  final List<String> attentionPoints;

  final SnapshotDiveStats diveStats;
  final Map<String, SnapshotMilRequirement> milPerRequirement;
  final int? milModulePct;

  final Map<String, int> brevetPct;
  final int formationPct;

  final List<String> goalCodes;
  final String goalNote;

  final List<SnapshotRecentDive> recentDives;

  const FormationSnapshotDoc({
    required this.memberId,
    required this.targetLevel,
    required this.currentCode,
    required this.validated,
    required this.pending,
    required this.pendingClaims,
    required this.remaining,
    required this.perCode,
    required this.attentionPoints,
    required this.diveStats,
    required this.milPerRequirement,
    required this.milModulePct,
    required this.brevetPct,
    required this.formationPct,
    required this.goalCodes,
    required this.goalNote,
    required this.recentDives,
  });

  // ---- Badges (D14) --------------------------------------------------------
  int get attentionCount => attentionPoints.length;
  int get pendingCount => pendingClaims.length;
  int get goalCount => goalCodes.length;

  int get exercisePct => formationPct;
  int get milPct => milModulePct ?? 0;
  bool get hasMil => milModulePct != null;

  DateTime? get lastActivityDate => diveStats.lastDiveDate;

  int get daysSinceLastActivity {
    final d = lastActivityDate;
    if (d == null) return 9999;
    return DateTime.now().difference(d).inDays;
  }

  /// Tri « attention d'abord » (WP-10) :
  /// score = 2×⚠ + ⏳ + (jours depuis dernière activité > 30 ? 1 : 0).
  int get attentionScore =>
      2 * attentionCount + pendingCount + (daysSinceLastActivity > 30 ? 1 : 0);

  /// Ligne pédagogique : 1er point d'attention, sinon 1er objectif, sinon
  /// 1re exigence MIL manquante, sinon 1er exercice restant.
  String get pedagogicalLine {
    if (attentionPoints.isNotEmpty) {
      final code = attentionPoints.first;
      return '⚠ ${_describe(code)}';
    }
    if (goalCodes.isNotEmpty) {
      return '🎯 ${_describe(goalCodes.first)}';
    }
    final missing = _firstMissingMilLabel();
    if (missing != null) return '📊 $missing';
    if (remaining.isNotEmpty) {
      final ex = remaining.first;
      return ex.description.isNotEmpty ? '○ ${ex.description}' : '○ ${ex.code}';
    }
    return 'À jour';
  }

  String _describe(String code) {
    for (final ex in [...remaining, ...pending, ...validated]) {
      if (ex.code == code && ex.description.isNotEmpty) {
        return '$code — ${ex.description}';
      }
    }
    return code;
  }

  String? _firstMissingMilLabel() {
    for (final entry in milPerRequirement.entries) {
      final r = entry.value;
      if (r.dataMissing) continue;
      if (r.have < r.need) {
        final label = milExperienceLabelFr[entry.key] ?? entry.key;
        return '$label (${r.have}/${r.need})';
      }
    }
    return null;
  }

  factory FormationSnapshotDoc.fromMap(String memberId, Map<String, dynamic> data) {
    final exercises = _asMap(data['exercises']);
    final diveStats = _asMap(data['dive_stats']);
    final mil = _asMap(data['mil_experience']);
    final goals = _asMap(data['goals']);

    List<Map<String, dynamic>> listOf(dynamic v) => (v as List?)
            ?.whereType<Map>()
            .map((e) => e.cast<String, dynamic>())
            .toList() ??
        <Map<String, dynamic>>[];

    final perCode = <String, SnapshotPerCode>{};
    _asMap(exercises['per_code']).forEach((code, v) {
      final m = _asMap(v);
      perCode[code] = SnapshotPerCode(
        attempts: _int(m['attempts']),
        lastResult: m['last_result']?.toString(),
        lastDate: _date(m['last_date']),
      );
    });

    final milReqs = <String, SnapshotMilRequirement>{};
    _asMap(mil['per_requirement']).forEach((key, v) {
      final m = _asMap(v);
      milReqs[key] = SnapshotMilRequirement(
        have: _int(m['have']),
        need: _int(m['need']),
        dataMissing: m['data_missing'] == true,
      );
    });

    final brevet = <String, int>{};
    _asMap(data['brevet_pct']).forEach((k, v) => brevet[k] = _int(v));

    return FormationSnapshotDoc(
      memberId: memberId,
      targetLevel: data['target_level']?.toString(),
      currentCode: data['current_code']?.toString() ?? '',
      validated: listOf(exercises['validated']).map(SnapshotExercise.fromMap).toList(),
      pending: listOf(exercises['pending']).map(SnapshotExercise.fromMap).toList(),
      pendingClaims: listOf(exercises['pending_claims']).map(SnapshotClaim.fromMap).toList(),
      remaining: listOf(exercises['remaining']).map(SnapshotExercise.fromMap).toList(),
      perCode: perCode,
      attentionPoints:
          (data['attention_points'] as List?)?.map((e) => e.toString()).toList() ?? const [],
      diveStats: SnapshotDiveStats.fromMap(diveStats),
      milPerRequirement: milReqs,
      milModulePct: mil.isEmpty ? null : _intOrNull(mil['module_pct']),
      brevetPct: brevet,
      formationPct: _int(data['formation_pct']),
      goalCodes: (goals['codes'] as List?)?.map((e) => e.toString()).toList() ?? const [],
      goalNote: goals['note']?.toString() ?? '',
      recentDives: listOf(data['recent_dives']).map(SnapshotRecentDive.fromMap).toList(),
    );
  }
}

class SnapshotExercise {
  final String code;
  final String description;
  final DateTime? date;
  const SnapshotExercise({required this.code, required this.description, this.date});
  factory SnapshotExercise.fromMap(Map<String, dynamic> m) => SnapshotExercise(
        code: m['code']?.toString() ?? '',
        description: m['description']?.toString() ?? '',
        date: _date(m['date']),
      );
}

class SnapshotClaim {
  final String code;
  final String label;
  final String status;
  const SnapshotClaim({required this.code, required this.label, required this.status});
  factory SnapshotClaim.fromMap(Map<String, dynamic> m) => SnapshotClaim(
        code: m['code']?.toString() ?? '',
        label: m['label']?.toString() ?? '',
        status: m['status']?.toString() ?? '',
      );
}

class SnapshotPerCode {
  final int attempts;
  final String? lastResult;
  final DateTime? lastDate;
  const SnapshotPerCode({required this.attempts, this.lastResult, this.lastDate});
}

class SnapshotMilRequirement {
  final int have;
  final int need;
  final bool dataMissing;
  const SnapshotMilRequirement({required this.have, required this.need, required this.dataMissing});
  double get ratio => need > 0 ? (have / need).clamp(0.0, 1.0) : 0.0;
}

class SnapshotRecentDive {
  final DateTime? date;
  final String locationName;
  final double? depthMaxMeters;
  final int? durationMinutes;
  const SnapshotRecentDive({
    this.date,
    required this.locationName,
    this.depthMaxMeters,
    this.durationMinutes,
  });
  factory SnapshotRecentDive.fromMap(Map<String, dynamic> m) => SnapshotRecentDive(
        date: _date(m['date']),
        locationName: m['location_name']?.toString() ?? 'Lieu inconnu',
        depthMaxMeters: _double(m['depth_max_meters']),
        durationMinutes: _intOrNull(m['duration_minutes']),
      );
}

class SnapshotDiveStats {
  final int total;
  final int mer;
  final int nuit;
  final int dp;
  final int sf;
  final int deco;
  final int nitrox;
  final int exo;
  final int maree;
  final int surveillance;
  final double? maxDepthMeters;
  final int totalMinutes;
  final DateTime? lastDiveDate;
  final Map<String, int> zones;
  final Map<String, int> thresholdsCum;

  const SnapshotDiveStats({
    required this.total,
    required this.mer,
    required this.nuit,
    required this.dp,
    required this.sf,
    required this.deco,
    required this.nitrox,
    required this.exo,
    required this.maree,
    required this.surveillance,
    required this.maxDepthMeters,
    required this.totalMinutes,
    required this.lastDiveDate,
    required this.zones,
    required this.thresholdsCum,
  });

  factory SnapshotDiveStats.fromMap(Map<String, dynamic> m) {
    Map<String, int> intMap(dynamic v) {
      final out = <String, int>{};
      _asMap(v).forEach((k, val) => out[k] = _int(val));
      return out;
    }

    return SnapshotDiveStats(
      total: _int(m['total']),
      mer: _int(m['mer']),
      nuit: _int(m['nuit']),
      dp: _int(m['dp']),
      sf: _int(m['sf']),
      deco: _int(m['deco']),
      nitrox: _int(m['nitrox']),
      exo: _int(m['exo']),
      maree: _int(m['maree']),
      surveillance: _int(m['surveillance']),
      maxDepthMeters: _double(m['max_depth_meters']),
      totalMinutes: _int(m['total_minutes']),
      lastDiveDate: _date(m['last_dive_date']),
      zones: intMap(m['zones']),
      thresholdsCum: intMap(m['thresholds_cum']),
    );
  }
}

/// Libellés FR des lignes MIL (miroir de `MIL_EXPERIENCE_LABELS` côté web).
const Map<String, String> milExperienceLabelFr = {
  'total_milieu_naturel': 'Total en milieu naturel',
  'prof_20m': 'À 20 m',
  'prof_30m': 'À 30 m',
  'prof_40m': 'À 40 m',
  'encadrement': 'Encadrement',
  'nuit': 'Nuit',
  'mer': 'En mer',
  'mer_30m': 'En mer à 30 m',
  'mer_40m': 'En mer à 40 m',
  'mer_maree': 'En mer à marée',
  'encadrement_mer': 'Encadrement en mer',
  'dp_mer_deco': 'DP en mer avec déco',
  'mer_45m': 'En mer à 45 m',
  'mer_50m': 'En mer à 50 m',
  'surveillance_ciel': "Surveillance d'exercices (CIEL)",
};

// ---- helpers de coercition ------------------------------------------------

Map<String, dynamic> _asMap(dynamic v) =>
    (v is Map) ? v.cast<String, dynamic>() : <String, dynamic>{};

int _int(dynamic v) => _intOrNull(v) ?? 0;

int? _intOrNull(dynamic v) {
  if (v is int) return v;
  if (v is num) return v.toInt();
  if (v is String) return int.tryParse(v);
  return null;
}

double? _double(dynamic v) {
  if (v is double) return v;
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v.replaceAll(',', '.'));
  return null;
}

DateTime? _date(dynamic v) {
  if (v == null) return null;
  if (v is Timestamp) return v.toDate();
  if (v is DateTime) return v;
  if (v is String) return DateTime.tryParse(v);
  if (v is int) return DateTime.fromMillisecondsSinceEpoch(v);
  return null;
}
