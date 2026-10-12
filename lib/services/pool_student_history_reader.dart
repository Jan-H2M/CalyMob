import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/pool_student_history.dart';
import '../utils/member_name.dart';

/// Reads the student's actual attendance under the requested club only.
/// No date cutoff, new collection-group index, logbook or formation backfill.
class PoolStudentHistoryReader {
  final FirebaseFirestore _firestore;
  PoolStudentHistoryReader({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  Future<List<PoolStudentSession>> load(String clubId, String memberId,
      {String? automaticLevel}) async {
    final sessions = await _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('piscine_sessions')
        .get();
    final result = <PoolStudentSession>[];
    // Bounded concurrency; query only this member, not all other attendees.
    for (var start = 0; start < sessions.docs.length; start += 12) {
      final end = (start + 12).clamp(0, sessions.docs.length);
      final rows = await Future.wait(
        sessions.docs.sublist(start, end).map((session) async {
          final data = session.data();
          if (data['type'] == 'theorie') return null;
          final attendees = session.reference.collection('attendees');
          final matches = await attendees
              .where(
                Filter.or(
                  Filter('memberId', isEqualTo: memberId),
                  Filter('membre_id', isEqualTo: memberId),
                  Filter('member_id', isEqualTo: memberId),
                ),
              )
              .get();
          final records = {for (final doc in matches.docs) doc.id: doc.data()};
          // Older canonical documents may carry the member ID only in doc.id.
          if (!records.containsKey(memberId)) {
            final canonical = await attendees.doc(memberId).get();
            final value = canonical.data();
            final identity = value?['memberId'] ??
                value?['membre_id'] ??
                value?['member_id'] ??
                memberId;
            if (value != null && identity == memberId) {
              records[canonical.id] = value;
            }
          }
          if (records.isEmpty ||
              !records.values.any((row) =>
                  row['scannedAt'] != null ||
                  row['checkinCompletedAt'] != null)) {
            return null;
          }
          final hasApnee = records.values.any((row) =>
              '${row['assignedLevel']}'.startsWith('apnee.') ||
              '${poolMap(row['groupAssignment'])['level']}'
                  .startsWith('apnee.') ||
              poolMap(row['hoursReport']).values.any((report) =>
                  '${poolMap(poolMap(report)['group'])['level']}'
                      .startsWith('apnee.')));
          final resolved = hasApnee
              ? poolSessionWithApneeLessons(
                  data,
                  (await session.reference.collection('apnee_lessons').get())
                      .docs
                      .map((row) => {...row.data(), 'id': row.id})
                      .toList())
              : data;
          return PoolStudentSession.fromRecords(
            session.id,
            resolved,
            records.values.toList(),
            automaticLevel: automaticLevel,
          );
        }),
      );
      result.addAll(rows.whereType<PoolStudentSession>());
    }
    result.sort(
      (a, b) => (b.date?.millisecondsSinceEpoch ?? 0).compareTo(
        a.date?.millisecondsSinceEpoch ?? 0,
      ),
    );
    final ids = result
        .expand((session) => session.lessons)
        .expand((lesson) => lesson.monitorIds)
        .toSet()
        .toList();
    final names = <String, String>{};
    final directory = _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('member_directory');
    for (var start = 0; start < ids.length; start += 12) {
      await Future.wait(
          ids.sublist(start, (start + 12).clamp(0, ids.length)).map((id) async {
        final doc = await directory.doc(id).get();
        if (doc.data() != null) {
          names[id] = memberDisplayName(doc.data()!, fallback: 'Encadrant');
        }
      }));
    }
    return List.unmodifiable(result.map((session) => PoolStudentSession(
          id: session.id,
          date: session.date,
          location: session.location,
          participation: session.participation,
          personalNotes: session.personalNotes,
          instructorRemark: session.instructorRemark,
          hasLessonDate: session.hasLessonDate,
          hasQrScan: session.hasQrScan,
          lessons: session.lessons
              .map((lesson) => PoolStudentLesson(
                    level: lesson.level,
                    group: lesson.group,
                    hour: lesson.hour,
                    theme: lesson.theme,
                    monitorIds: lesson.monitorIds,
                    sourceLabel: lesson.sourceLabel,
                    isPlanned: lesson.isPlanned,
                    participationReported: lesson.participationReported,
                    monitorNames: lesson.monitorNames.isNotEmpty
                        ? lesson.monitorNames
                        : lesson.monitorIds
                            .map((id) => names[id])
                            .whereType<String>()
                            .toList(),
                  ))
              .toList(),
        )));
  }
}
