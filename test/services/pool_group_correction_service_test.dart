import 'package:calymob/services/pool_group_correction_service.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:calymob/models/pool_student_history.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('dated apnee courses use the shared selector and guarded callable',
      () async {
    final db = FakeFirebaseFirestore();
    final session = db.doc('clubs/club/piscine_sessions/day');
    await session.set({'date': Timestamp.fromDate(DateTime(2026, 10, 6))});
    await session.collection('attendees').doc('student').set({
      'memberId': 'student',
      'scannedAt': Timestamp.fromDate(DateTime(2026, 10, 6)),
      'assignedLevel': 'apnee.a1',
      'assignedCourseId': 'course',
    });
    await session.collection('apnee_lessons').doc('course').set({
      'track': 'apnee.a1',
      'hour': '2eme_heure',
      'theme': 'Synthetic protocol',
      'instructor_ids': ['teacher'],
    });
    String? called;
    Map<String, dynamic>? payload;
    final service = PoolGroupCorrectionService(
        firestore: db,
        invoke: (name, data) async {
          called = name;
          payload = data;
        });
    final draft = await service.load('club', 'day', 'student');
    final choice = draft.choices.single;
    expect(choice.level, 'apnee.a1');
    expect(choice.hour, '2eme_heure');
    expect(choice.label, contains('1★ apnée · A1 / Discovery'));
    await service.save('club', 'day', 'student', draft, choice);
    expect(called, 'assignApneePoolCourse');
    expect(payload!['lessonId'], 'course');
    expect(
        payload!['expectedState']['student'], draft.expectedState['student']);
    expect(payload!.containsKey('level'), false);
    expect(poolFormationLabel('APNEE.A1'), '1★ apnée · A1 / Discovery');
  });
  test('choices are exact level group course and hour tuples', () {
    final choices = poolGroupChoices({
      'niveaux': {
        '3*': {
          'courses_by_hour': {
            '2eme_heure': [
              {'id': 'first', 'order': 0, 'theme': 'Première'},
              {'id': 'second', 'order': 1, 'theme': 'Deuxième'},
            ]
          }
        },
        '2*': {'theme_2eme_heure': 'Ancien groupe'},
      }
    });
    expect(choices.length, 3);
    expect(choices[1].number, 2);
    expect(choices[1].courseId, 'second');
    expect(choices[1].label, '3★ · Groupe 2 · 2e heure · Deuxième');
    expect(choices.last.courseId, '2*_legacy');
  });
  test('expected state preserves assignment data and normalizes timestamps',
      () {
    final state = poolAssignmentState({
      'assignedLevel': '2*',
      'remarks': 'private unrelated note',
      'hoursReport': {
        '2eme_heure': {'at': Timestamp.fromMillisecondsSinceEpoch(1000)}
      }
    });
    expect(state['assignedLevel'], '2*');
    expect(state.containsKey('remarks'), false);
    expect(state['assignedCourseId'], null);
    expect(state['hoursReport']['2eme_heure']['at'], 1000);
  });
}
