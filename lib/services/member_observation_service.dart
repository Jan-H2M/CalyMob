import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/member_observation.dart';

/// Service voor het beheren van member observations in CalyMob.
/// Collection: clubs/{clubId}/member_observations
class MemberObservationService {
  MemberObservationService({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _firestore;

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
        .map((snap) =>
            snap.docs.map((d) => MemberObservation.fromFirestore(d)).toList());
  }

  /// All observations for a session, for full formation readers only.
  ///
  /// Callers must mirror `canReadFullFormation` from Firestore rules before
  /// starting this operation-wide listener.
  Stream<List<MemberObservation>> watchFullSessionObservations(
    String clubId,
    String sessionId,
  ) {
    return _collection(clubId)
        .where('contextId', isEqualTo: sessionId)
        .orderBy('memberName')
        .snapshots()
        .map((snap) =>
            snap.docs.map((d) => MemberObservation.fromFirestore(d)).toList());
  }

  /// The signed-in member's own observations for one session.
  ///
  /// Reading the already-authorized personal stream and filtering locally
  /// avoids a new compound index while keeping the Firestore query constrained
  /// to `memberId == request.auth.uid`, as required by the rules.
  Stream<List<MemberObservation>> watchOwnSessionObservations(
    String clubId,
    String memberId,
    String sessionId,
  ) {
    return getObservationsForMember(clubId, memberId).map(
      (observations) => observations
          .where((observation) => observation.contextId == sessionId)
          .toList(),
    );
  }

  /// Nieuwe observation aanmaken.
  Future<String> addObservation(
    String clubId,
    MemberObservation observation,
  ) async {
    final docRef = await _collection(clubId).add(observation.toMap());
    return docRef.id;
  }

  /// Adds an auditable free-text pool remark without exercise/result fields.
  /// Firestore resolves all audit dates to the same trusted request time.
  Future<String> addPoolFormationRemark({
    required String clubId,
    required String memberId,
    required String memberName,
    required String memberNiveau,
    required String note,
    required String observerId,
  }) async {
    final serverTime = FieldValue.serverTimestamp();
    final docRef = await _collection(clubId).add({
      'memberId': memberId,
      'memberName': memberName,
      'memberNiveau': memberNiveau,
      'contextType': 'piscine',
      'contextId': 'formation_overview',
      'contextDate': serverTime,
      'contextTitle': 'Suivi formation piscine',
      'category': 'general',
      'note': note,
      'observerId': observerId,
      'createdAt': serverTime,
      'updatedAt': serverTime,
    });
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

  /// Bestaande observation updaten.
  Future<void> updateObservation(
    String clubId,
    String observationId,
    Map<String, dynamic> data,
  ) async {
    data['updatedAt'] = Timestamp.now();
    await _collection(clubId).doc(observationId).update(data);
  }
}
