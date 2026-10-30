import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import '../models/personal_exercise_progress.dart';

class PersonalExerciseProgressService {
  final FirebaseFirestore db;
  final Future<void> Function(Map<String, dynamic>)? invoke;
  PersonalExerciseProgressService({FirebaseFirestore? firestore, this.invoke})
      : db = firestore ?? FirebaseFirestore.instance;

  Stream<List<PersonalExerciseProgress>> watch(
          String clubId, String memberId) =>
      db
          .collection('clubs')
          .doc(clubId)
          .collection('exercise_claims')
          .where('member_id', isEqualTo: memberId)
          .snapshots()
          .map((snapshot) => snapshot.docs
              .map((doc) => PersonalExerciseProgress.fromMap(doc.data()))
              .whereType<PersonalExerciseProgress>()
              .toList());

  Future<void> save(
      {required String clubId,
      required String memberId,
      required String exerciseId,
      required bool done,
      required DateTime date,
      required int revision}) async {
    final request = <String, dynamic>{
      'clubId': clubId,
      'memberId': memberId,
      'exerciseId': exerciseId,
      'done': done,
      'expectedRevision': revision,
      'date':
          '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}',
      'operationId': db.collection('clubs').doc().id
    };
    if (invoke != null) {
      await invoke!(request);
      return;
    }
    await FirebaseFunctions.instanceFor(region: 'europe-west1')
        .httpsCallable('setPersonalExerciseProgress')
        .call(request);
  }
}
