import 'package:cloud_firestore/cloud_firestore.dart';

/// WP-11 — Objectifs de l'élève (« Mes objectifs »).
/// Doc `members/{id}/formation_goals/current`. Saisie self-service par le
/// membre lui-même ; lecture seule pour le moniteur (D7). Les codes validés
/// sont auto-nettoyés par la CF `rebuildFormationSnapshot` (WP-09/D7).
class FormationGoalsAvailability {
  final bool profonde;
  final bool nuit;
  final bool dp;
  final bool sf;
  final bool mer;
  final bool eauDouce;
  final String? horizon;

  const FormationGoalsAvailability({
    this.profonde = false,
    this.nuit = false,
    this.dp = false,
    this.sf = false,
    this.mer = false,
    this.eauDouce = false,
    this.horizon,
  });

  factory FormationGoalsAvailability.fromMap(Map<String, dynamic> m) =>
      FormationGoalsAvailability(
        profonde: m['profonde'] == true,
        nuit: m['nuit'] == true,
        dp: m['dp'] == true,
        sf: m['sf'] == true,
        mer: m['mer'] == true,
        eauDouce: m['eau_douce'] == true,
        horizon: m['horizon']?.toString(),
      );

  Map<String, dynamic> toMap() => {
        'profonde': profonde,
        'nuit': nuit,
        'dp': dp,
        'sf': sf,
        'mer': mer,
        'eau_douce': eauDouce,
        if (horizon != null && horizon!.isNotEmpty) 'horizon': horizon,
      };

  FormationGoalsAvailability copyWith({
    bool? profonde,
    bool? nuit,
    bool? dp,
    bool? sf,
    bool? mer,
    bool? eauDouce,
    String? horizon,
  }) =>
      FormationGoalsAvailability(
        profonde: profonde ?? this.profonde,
        nuit: nuit ?? this.nuit,
        dp: dp ?? this.dp,
        sf: sf ?? this.sf,
        mer: mer ?? this.mer,
        eauDouce: eauDouce ?? this.eauDouce,
        horizon: horizon ?? this.horizon,
      );
}

class FormationGoals {
  final List<String> codes;
  final List<String> difficultCodes;
  final List<String> redoCodes;
  final String note;
  final FormationGoalsAvailability availability;

  const FormationGoals({
    this.codes = const [],
    this.difficultCodes = const [],
    this.redoCodes = const [],
    this.note = '',
    this.availability = const FormationGoalsAvailability(),
  });

  factory FormationGoals.fromMap(Map<String, dynamic> m) {
    List<String> arr(dynamic v) =>
        (v as List?)?.map((e) => e.toString()).toList() ?? const [];
    return FormationGoals(
      codes: arr(m['codes']),
      difficultCodes: arr(m['difficult_codes']),
      redoCodes: arr(m['redo_codes']),
      note: m['note']?.toString() ?? '',
      availability: FormationGoalsAvailability.fromMap(
        (m['availability'] as Map?)?.cast<String, dynamic>() ?? const {},
      ),
    );
  }

  Map<String, dynamic> toMap() => {
        'codes': codes,
        'difficult_codes': difficultCodes,
        'redo_codes': redoCodes,
        'note': note,
        'availability': availability.toMap(),
        'updated_at': FieldValue.serverTimestamp(),
      };

  bool hasGoal(String code) => codes.contains(code);
  bool isDifficult(String code) => difficultCodes.contains(code);
  bool isRedo(String code) => redoCodes.contains(code);
}

class FormationGoalsService {
  final FirebaseFirestore _firestore;
  FormationGoalsService({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  DocumentReference<Map<String, dynamic>> _ref(String clubId, String memberId) =>
      _firestore
          .collection('clubs')
          .doc(clubId)
          .collection('members')
          .doc(memberId)
          .collection('formation_goals')
          .doc('current');

  Future<FormationGoals> getGoals(String clubId, String memberId) async {
    final doc = await _ref(clubId, memberId).get();
    final data = doc.data();
    if (!doc.exists || data == null) return const FormationGoals();
    return FormationGoals.fromMap(data);
  }

  Stream<FormationGoals> watchGoals(String clubId, String memberId) =>
      _ref(clubId, memberId).snapshots().map((doc) {
        final data = doc.data();
        if (!doc.exists || data == null) return const FormationGoals();
        return FormationGoals.fromMap(data);
      });

  Future<void> saveGoals(
    String clubId,
    String memberId,
    FormationGoals goals,
  ) async {
    await _ref(clubId, memberId).set(goals.toMap(), SetOptions(merge: true));
  }
}
