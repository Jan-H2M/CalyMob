import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import '../models/pool_student_history.dart';

class PoolGroupChoice {
  final String level, hour, courseId, theme;
  final int number;
  const PoolGroupChoice(
      this.level, this.hour, this.courseId, this.number, this.theme);
  String get label =>
      '${poolFormationLabel(level)} · Groupe $number · ${hour == '1ere_heure' ? '1re heure' : '2e heure'}'
      '${theme.isEmpty ? '' : ' · $theme'}';
}

List<PoolGroupChoice> poolGroupChoices(Map<String, dynamic> session) {
  const hours = ['1ere_heure', '2eme_heure'];
  final result = <PoolGroupChoice>[];
  for (final level in poolMap(session['niveaux']).entries) {
    final plan = poolMap(level.value);
    final raw = plan['courses_by_hour'] ?? plan['coursesByHour'];
    final byHour = poolMap(raw);
    for (final hour in hours) {
      if (raw != null) {
        final courses = byHour[hour] is List ? byHour[hour] as List : const [];
        for (var i = 0; i < courses.length; i++) {
          final course = poolMap(courses[i]);
          final id = course['id']?.toString() ?? '';
          if (id.isEmpty) continue;
          result.add(PoolGroupChoice(
              level.key,
              hour,
              id,
              course['order'] is int ? (course['order'] as int) + 1 : i + 1,
              course['theme']?.toString() ?? ''));
        }
      } else {
        final theme = (plan[hour == hours.first
                    ? 'theme_1ere_heure'
                    : 'theme_2eme_heure'] ??
                plan['theme'] ??
                '')
            .toString();
        final monitors =
            plan['encadrants'] is List ? plan['encadrants'] as List : const [];
        if (theme.isNotEmpty ||
            monitors.any((p) => poolMap(p)['heure'] == hour)) {
          result.add(PoolGroupChoice(
              level.key, hour, '${level.key}_legacy', 1, theme));
        }
      }
    }
  }
  return result;
}

const _assignmentFields = [
  'assignedLevel',
  'assignedCourseId',
  'assignedToMemberId',
  'groupAssignment',
  'hoursReport',
  'outcome',
  'sentToReserve'
];
dynamic _normalize(dynamic value) {
  if (value is Timestamp) return value.millisecondsSinceEpoch;
  if (value is List) return value.map(_normalize).toList();
  if (value is Map) {
    return value.map((key, item) => MapEntry(key.toString(), _normalize(item)));
  }
  return value;
}

Map<String, dynamic> poolAssignmentState(Map<String, dynamic> value) =>
    {for (final field in _assignmentFields) field: _normalize(value[field])};

class PoolGroupCorrectionDraft {
  final List<PoolGroupChoice> choices;
  final Map<String, dynamic> expectedState;
  final String operationId;
  const PoolGroupCorrectionDraft(
      this.choices, this.expectedState, this.operationId);
}

class PoolGroupCorrectionService {
  final FirebaseFirestore _db;
  final FirebaseFunctions? _injectedFunctions;
  FirebaseFunctions get _functions =>
      _injectedFunctions ??
      FirebaseFunctions.instanceFor(region: 'europe-west1');
  final Future<void> Function(String, Map<String, dynamic>)? invoke;
  PoolGroupCorrectionService(
      {FirebaseFirestore? firestore, FirebaseFunctions? functions, this.invoke})
      : _db = firestore ?? FirebaseFirestore.instance,
        _injectedFunctions = functions;

  Future<PoolGroupCorrectionDraft> load(
      String clubId, String sessionId, String memberId) async {
    final sessionRef = _db
        .collection('clubs')
        .doc(clubId)
        .collection('piscine_sessions')
        .doc(sessionId);
    final session = await sessionRef.get();
    final data = session.data();
    if (data == null ||
        data['date'] is! Timestamp ||
        data['type'] == 'theorie') {
      throw StateError('Séance piscine datée requise.');
    }
    final attendees = sessionRef.collection('attendees');
    final matches = await attendees
        .where(Filter.or(
            Filter('memberId', isEqualTo: memberId),
            Filter('membre_id', isEqualTo: memberId),
            Filter('member_id', isEqualTo: memberId)))
        .get();
    final records = {for (final doc in matches.docs) doc.id: doc.data()};
    final canonical = await attendees.doc(memberId).get();
    if (canonical.exists) records[canonical.id] = canonical.data()!;
    final apnee = await sessionRef.collection('apnee_lessons').get();
    return PoolGroupCorrectionDraft(
        poolGroupChoices(poolSessionWithApneeLessons(data,
            apnee.docs.map((row) => {...row.data(), 'id': row.id}).toList())),
        {
          for (final record in records.entries)
            record.key: poolAssignmentState(record.value)
        },
        sessionRef.collection('group_corrections').doc().id);
  }

  Future<void> save(String clubId, String sessionId, String memberId,
      PoolGroupCorrectionDraft draft, PoolGroupChoice choice) async {
    final apnee = choice.level.startsWith('apnee.');
    final name = apnee ? 'assignApneePoolCourse' : 'correctPoolStudentGroup';
    if (apnee && !draft.expectedState.containsKey(memberId)) {
      throw StateError('Présence QR canonique requise.');
    }
    final payload = <String, dynamic>{
      'clubId': clubId,
      'sessionId': sessionId,
      'memberId': memberId,
      'operationId': draft.operationId,
      'expectedState': draft.expectedState,
      if (apnee) 'lessonId': choice.courseId,
      if (!apnee) ...{
        'level': choice.level,
        'hour': choice.hour,
        'courseId': choice.courseId,
      },
    };
    if (invoke != null) {
      await invoke!(name, payload);
    } else {
      await _functions.httpsCallable(name).call(payload);
    }
  }
}
