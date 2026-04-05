import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/member_observation.dart';

/// Service voor het beheren van member observations in CalyMob.
/// Collection: clubs/{clubId}/member_observations
class MemberObservationService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  CollectionReference<Map<String, dynamic>> _collection(String clubId) {
    return _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('member_observations');
  }

  /// Observations voor een specifiek lid (gesorteerd op datum, nieuwste eerst).
  Stream<List<MemberObservation>> getObservationsForMember(
    String clubId,
    String memberId,
  ) {
    return _collection(clubId)
        .where('memberId', isEqualTo: memberId)
        .orderBy('contextDate', descending: true)
        .snapshots()
        .map((snap) => snap.docs
            .map((d) => MemberObservation.fromFirestore(d))
            .toList());
  }
  /// Observations voor een sessie (gesorteerd op naam).
  Stream<List<MemberObservation>> getObservationsForSession(
    String clubId,
    String sessionId,
  ) {
    return _collection(clubId)
        .where('contextId', isEqualTo: sessionId)
        .orderBy('memberName')
        .snapshots()
        .map((snap) => snap.docs
            .map((d) => MemberObservation.fromFirestore(d))
            .toList());
  }

  /// Nieuwe observation aanmaken.
  Future<String> addObservation(
    String clubId,
    MemberObservation observation,
  ) async {
    final docRef = await _collection(clubId).add(observation.toMap());
    return docRef.id;
  }

  /// Meerdere observations in batch (mode examen).
  Future<void> addBulkObservations(
    String clubId,
    List<MemberObservation> observations,
  ) async {
    final batch = _firestore.batch();
    for (final obs in observations) {
      final ref = _collection(clubId).doc();
      batch.set(ref, obs.toMap());
    }
    await batch.commit();
  }
}