import 'package:calymob/models/personal_exercise_progress.dart';
import 'package:calymob/services/personal_exercise_progress_service.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('only server personal tracking is shown, not pending or another member',
      () async {
    final db = FakeFirebaseFirestore();
    final rows = db.collection('clubs/synthetic/exercise_claims');
    await rows.doc('done').set({
      'member_id': 'student',
      'exercise_id': 'RA',
      'server_verified': true,
      'validation_mode': 'personal_only',
      'status': 'personal_done',
      'performed_date': Timestamp.fromDate(DateTime(2026, 10, 1)),
      'revision': 2
    });
    await rows.doc('pending').set(
        {'member_id': 'student', 'exercise_id': 'RT', 'status': 'submitted'});
    await rows.doc('forged').set({
      'member_id': 'student',
      'exercise_id': 'XX',
      'validation_mode': 'personal_only',
      'status': 'personal_done'
    });
    await rows.doc('other').set({
      'member_id': 'other',
      'exercise_id': 'RA',
      'server_verified': true,
      'validation_mode': 'personal_only',
      'status': 'personal_done'
    });
    final list = await PersonalExerciseProgressService(firestore: db)
        .watch('synthetic', 'student')
        .first;
    expect(list.length, 1);
    expect(list.single.exerciseId, 'RA');
    expect(list.single.revision, 2);
    expect(list.single.date, DateTime(2026, 10, 1));
    expect(
        PersonalExerciseProgress.fromMap(
            {'validation_mode': 'personal_only', 'status': 'personal_done'}),
        isNull);
  });
  test(
      'save uses server callable with expected revision and date; zero direct writes',
      () async {
    final db = FakeFirebaseFirestore();
    final requests = <Map<String, dynamic>>[];
    final service = PersonalExerciseProgressService(
        firestore: db, invoke: (request) async => requests.add(request));
    await service.save(
        clubId: 'synthetic',
        memberId: 'student',
        exerciseId: 'RA',
        done: true,
        date: DateTime(2026, 1, 5),
        revision: 2);
    expect(requests.single, containsPair('date', '2026-01-05'));
    expect(requests.single, containsPair('expectedRevision', 2));
    expect(requests.single['operationId'], isNotEmpty);
    expect((await db.collection('clubs/synthetic/exercise_claims').get()).docs,
        isEmpty);
  });
}
