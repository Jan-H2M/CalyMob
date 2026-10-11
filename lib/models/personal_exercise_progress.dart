import 'package:cloud_firestore/cloud_firestore.dart';

/// Personal tracking, never an official exam result or a brevet award.
class PersonalExerciseProgress {
  final String exerciseId;
  final bool done;
  final DateTime? date;
  final int revision;
  const PersonalExerciseProgress(
      {required this.exerciseId,
      required this.done,
      required this.revision,
      this.date});

  static PersonalExerciseProgress? fromMap(Map<String, dynamic> data) {
    if (data['server_verified'] != true ||
        data['validation_mode'] != 'personal_only' ||
        !['personal_done', 'personal_not_done'].contains(data['status'])) {
      return null;
    }
    final date = data['performed_date'];
    return PersonalExerciseProgress(
        exerciseId: data['exercise_id']?.toString() ?? '',
        done: data['status'] == 'personal_done',
        date: date is Timestamp ? date.toDate() : null,
        revision: data['revision'] is int ? data['revision'] as int : 0);
  }
}
