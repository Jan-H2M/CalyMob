import 'package:cloud_firestore/cloud_firestore.dart';

/// Read-only history of actual QR attendance, not a LIFRAS validation.
class PoolStudentSession {
  final String id;
  final DateTime? date;
  final String location;
  final List<PoolStudentLesson> lessons;
  final String participation;
  final String personalNotes;
  final String instructorRemark;
  final bool hasLessonDate;

  const PoolStudentSession({
    required this.id,
    required this.date,
    required this.location,
    required this.lessons,
    required this.participation,
    this.personalNotes = '',
    this.instructorRemark = '',
    this.hasLessonDate = true,
  });

  bool get trainingReported => participation == 'training';

  factory PoolStudentSession.fromRecords(String id,
      Map<String, dynamic> session, List<Map<String, dynamic>> attendance,
      {String? automaticLevel}) {
    // Duplicate QR documents count once. Prefer the completed report, while
    // retaining legacy assignments when the canonical record lacks them.
    attendance = [...attendance]
      ..sort((a, b) => _score(a).compareTo(_score(b)));
    final merged = <String, dynamic>{};
    for (final row in attendance) {
      for (final field in row.entries) {
        if (field.value != null && field.value != '') {
          merged[field.key] = field.value;
        }
      }
    }
    final lessons = <PoolStudentLesson>[];
    final hours = poolMap(merged['hoursReport']);
    for (final hour in hours.entries) {
      final report = poolMap(hour.value);
      if (report['role'] != 'eleve') continue;
      final group = poolMap(report['group'] ?? report['eleveGroup']);
      lessons.add(_lesson(session, group, hour.key));
    }
    final group = poolMap(merged['groupAssignment']);
    if (lessons.isEmpty && group.isNotEmpty) {
      lessons.add(_lesson(session, group, ''));
    }
    if (lessons.isEmpty &&
        (merged['assignedCourseId']?.toString().isNotEmpty ?? false)) {
      lessons.add(
        _lesson(
            session,
            {
              'level': merged['assignedLevel'],
              'course_id': merged['assignedCourseId'],
              'validatorId': merged['assignedToMemberId'],
            },
            ''),
      );
    }
    final rawOutcome = merged['outcome']?.toString() ?? '';
    if (lessons.isEmpty &&
        rawOutcome.isEmpty &&
        hours.isEmpty &&
        merged['sentToReserve'] != true &&
        merged['isGuest'] != true) {
      final assignedLevel = merged['assignedLevel']?.toString();
      final level =
          assignedLevel?.isNotEmpty == true ? assignedLevel : automaticLevel;
      if (level != null && level.isNotEmpty) {
        lessons.add(_scheduledLesson(
            session, level, merged['assignedToMemberId']?.toString(),
            inferred: assignedLevel?.isNotEmpty != true));
      }
    }
    final training = rawOutcome == 'training' ||
        (rawOutcome.isEmpty &&
            hours.values.any((value) => poolMap(value)['role'] == 'eleve'));
    return PoolStudentSession(
      id: id,
      date: poolDate(session['date']) ?? poolDate(merged['scannedAt']),
      location:
          (session['lieu'] ?? session['location_name'] ?? 'Piscine').toString(),
      lessons: lessons,
      participation: training ? 'training' : rawOutcome,
      personalNotes: (merged['personalNotes'] ?? '').toString(),
      instructorRemark: (merged['remarks'] ?? '').toString(),
      hasLessonDate: poolDate(session['date']) != null,
    );
  }
}

class PoolStudentLesson {
  final String level;
  final String group;
  final String hour;
  final String theme;
  final List<String> monitorNames;
  final List<String> monitorIds;
  final String sourceLabel;
  final bool isPlanned;
  const PoolStudentLesson({
    required this.level,
    required this.group,
    required this.hour,
    required this.theme,
    this.monitorNames = const [],
    this.monitorIds = const [],
    this.sourceLabel = '',
    this.isPlanned = false,
  });
}

/// Mirrors CalyCompta getPiscineAutoAssignedLevel, not historical validation.
String? poolAutomaticFormationLevel(String? code, bool active) {
  if (!active) return null;
  final normalized =
      code?.trim().toUpperCase().replaceAll('★', '').replaceAll('*', '');
  return const {
    'NB': '1*',
    '1': '2*',
    'P1': '2*',
    '2': '3*',
    'P2': '3*',
    '3': '4*',
    'P3': '4*',
    '4': 'AM',
    'P4': 'AM',
    'AM': 'MC',
    'MC': 'MC'
  }[normalized];
}

PoolStudentLesson _scheduledLesson(
    Map<String, dynamic> session, String level, String? parentId,
    {required bool inferred}) {
  final hour = level == '1*' ? '1ere_heure' : '2eme_heure';
  final assignment = poolMap(poolMap(session['niveaux'])[level]);
  final byHour =
      poolMap(assignment['courses_by_hour'] ?? assignment['coursesByHour']);
  final raw = byHour[hour];
  final courses =
      raw is List ? raw.map(poolMap).toList() : <Map<String, dynamic>>[];
  Map<String, dynamic> selected = const {};
  if (courses.length == 1) {
    selected = courses.single;
  } else if (courses.length > 1 && parentId != null && parentId.isNotEmpty) {
    final candidates = courses
        .where((course) =>
            course['encadrants'] is List &&
            (course['encadrants'] as List)
                .any((person) => poolMap(person)['membre_id'] == parentId))
        .toList();
    if (candidates.length == 1) selected = candidates.single;
  } else if (byHour.isEmpty && assignment.isNotEmpty) {
    selected = {
      'theme': assignment['theme_$hour'] ?? assignment['theme'],
      'encadrants': assignment['encadrants'] is List
          ? (assignment['encadrants'] as List)
              .where((person) =>
                  (poolMap(person)['heure'] ?? '1ere_heure') == hour)
              .toList()
          : [],
      'order': 0
    };
  }
  final people = selected['encadrants'] is List
      ? (selected['encadrants'] as List).map(poolMap).toList()
      : <Map<String, dynamic>>[];
  return PoolStudentLesson(
      level: level,
      group: courses.length > 1 && selected['order'] is num
          ? '${(selected['order'] as num).toInt() + 1}'
          : '',
      hour: hour,
      theme: (selected['theme'] ?? '').toString(),
      monitorNames: people
          .map((person) =>
              '${person['membre_prenom'] ?? ''} ${person['membre_nom'] ?? ''}'
                  .trim())
          .where((name) => name.isNotEmpty)
          .toList(),
      monitorIds: people
          .map((person) => (person['membre_id'] ?? '').toString())
          .where((id) => id.isNotEmpty)
          .toList(),
      sourceLabel: inferred
          ? 'Affectation automatique selon le profil actuel · contenu du planning'
          : 'Affectation de la séance · contenu du planning',
      isPlanned: true);
}

/// Training visits by level, not exercise validations or QR attendance totals.
/// Each dated visit counts once per level, even with two hours or QR duplicates.
class PoolLevelVisits {
  final String level;
  final int reported, toConfirm;
  const PoolLevelVisits(this.level, this.reported, this.toConfirm);
}

List<PoolLevelVisits> poolTrainingVisits(List<PoolStudentSession> sessions) {
  final reported = <String, Set<String>>{};
  final planned = <String, Set<String>>{};
  for (final session in sessions) {
    if (!session.hasLessonDate || session.date == null) continue;
    if (session.participation.isNotEmpty && !session.trainingReported) continue;
    final date = session.date!;
    final day = '${date.year}-${date.month}-${date.day}';
    for (final lesson in session.lessons) {
      final level = lesson.level.trim().toUpperCase().replaceAll('★', '*');
      if (level.isEmpty) continue;
      final destination =
          session.trainingReported && !lesson.isPlanned ? reported : planned;
      (destination[level] ??= {}).add(day);
    }
  }
  final levels = {...reported.keys, ...planned.keys}.toList()..sort();
  return levels
      .map((level) => PoolLevelVisits(level, reported[level]?.length ?? 0,
          (planned[level] ?? {}).difference(reported[level] ?? {}).length))
      .toList();
}

PoolStudentLesson _lesson(
  Map<String, dynamic> session,
  Map<String, dynamic> group,
  String hour,
) {
  final level = (group['level'] ?? group['niveau'] ?? '').toString();
  final savedGroupNumber = group['groupNumber'] ?? group['group_number'];
  final savedHour = hour.isNotEmpty
      ? hour
      : (group['hourKey'] ?? group['heure'] ?? '').toString();
  final courseId = (group['course_id'] ?? group['courseId'] ?? '').toString();
  Map<String, dynamic> matched = const {};
  String matchedLevel = level;
  String matchedHour = savedHour;
  final levels = poolMap(session['niveaux']);
  for (final entry in levels.entries) {
    final courses = poolMap(
      poolMap(entry.value)['courses_by_hour'] ??
          poolMap(entry.value)['coursesByHour'],
    );
    for (final slot in courses.entries) {
      final values = slot.value is List ? slot.value as List : const [];
      for (var index = 0; index < values.length; index++) {
        final course = values[index];
        final candidate = poolMap(course);
        final number = candidate['order'] is num
            ? (candidate['order'] as num).toInt() + 1
            : index + 1;
        final contractMatches = (level.isEmpty || level == entry.key) &&
            (savedHour.isEmpty || savedHour == slot.key) &&
            (savedGroupNumber == null ||
                savedGroupNumber.toString() == number.toString());
        if ((courseId.isNotEmpty &&
                candidate['id']?.toString() == courseId &&
                contractMatches) ||
            (courseId.isEmpty &&
                level == entry.key &&
                savedHour == slot.key &&
                savedGroupNumber?.toString() == number.toString())) {
          matched = candidate;
          matchedLevel = entry.key;
          matchedHour = slot.key;
        }
      }
    }
    // Old sessions have a single direct-level course, never parallel groups.
    final direct = poolMap(entry.value);
    if (matched.isEmpty &&
        courses.isEmpty &&
        level == entry.key &&
        (savedGroupNumber == null || savedGroupNumber.toString() == '1') &&
        (savedGroupNumber?.toString() == '1' ||
            courseId == '${entry.key}_legacy') &&
        (courseId.isEmpty || courseId == '${entry.key}_legacy')) {
      matched = {
        'order': 0,
        'theme': direct[savedHour == '2eme_heure'
                ? 'theme_2eme_heure'
                : 'theme_1ere_heure'] ??
            direct['theme'],
        'encadrants': direct['encadrants'],
      };
    }
  }
  final names = <String>[];
  final ids = <String>[];
  final rawIds = group['moniteurIds'] ?? group['monitorIds'];
  if (rawIds is List) {
    ids.addAll(
        rawIds.map((value) => value.toString()).where((id) => id.isNotEmpty));
  }
  final hasSavedIds = ids.isNotEmpty;
  final rawNames = group['moniteurNames'];
  if (rawNames is List) {
    names.addAll(rawNames.map((v) => v.toString()).where((s) => s.isNotEmpty));
  }
  if (names.isEmpty && !hasSavedIds) {
    final encadrants = matched['encadrants'];
    if (encadrants is List) {
      for (final value in encadrants) {
        final person = poolMap(value);
        if (!hasSavedIds && person['membre_id'] != null) {
          ids.add(person['membre_id'].toString());
        }
        final name =
            '${person['membre_prenom'] ?? ''} ${person['membre_nom'] ?? ''}'
                .trim();
        if (name.isNotEmpty) names.add(name);
      }
    }
  }
  // A course ID or a saved group report identifies one lesson. Never guess a
  // parallel course from level alone or treat its planned theme as validated.
  final groupNumber = savedGroupNumber ??
      (matched['order'] is num ? (matched['order'] as num).toInt() + 1 : null);
  return PoolStudentLesson(
    level: matchedLevel,
    group: groupNumber == null ? '' : groupNumber.toString(),
    hour: matchedHour,
    theme: (group['themeSnapshot'] ?? matched['theme'] ?? '').toString(),
    monitorNames: names.toSet().toList(),
    monitorIds: ids.toSet().toList(),
  );
}

int _score(Map<String, dynamic> row) =>
    (row['checkinCompletedAt'] == null ? 0 : 100) +
    (row['hoursReport'] == null ? 0 : 20) +
    (row['groupAssignment'] == null ? 0 : 10) +
    (row['remarks'] == null ? 0 : 1);

Map<String, dynamic> poolMap(dynamic value) => value is Map
    ? value.map((key, value) => MapEntry(key.toString(), value))
    : const {};

DateTime? poolDate(dynamic value) => value is Timestamp
    ? value.toDate()
    : value is DateTime
        ? value
        : value is String
            ? DateTime.tryParse(value)
            : null;
