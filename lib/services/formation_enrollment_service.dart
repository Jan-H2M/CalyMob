import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

/// Server-owned, revision-guarded enrollment across both disciplines.
/// No client role, actor identity, audit or direct member write is accepted.
class FormationEnrollmentService {
  final FirebaseFirestore db;
  final Future<void> Function(Map<String, dynamic>)? invoke;
  FormationEnrollmentService({FirebaseFirestore? firestore, this.invoke})
      : db = firestore ?? FirebaseFirestore.instance;

  Future<void> save(
    String clubId, {
    required String memberId,
    required String track,
    required bool active,
    required int expectedRevision,
    String? targetLevel,
  }) async {
    final payload = <String, dynamic>{
      'clubId': clubId,
      'memberId': memberId,
      'track': track,
      'active': active,
      'expectedRevision': expectedRevision,
      if (targetLevel != null) 'targetLevel': targetLevel,
      'operationId': db.collection('clubs').doc().id,
    };
    if (invoke != null) {
      await invoke!(payload);
    } else {
      await FirebaseFunctions.instanceFor(region: 'europe-west1')
          .httpsCallable('manageFormationEnrollment')
          .call(payload);
    }
  }
}
