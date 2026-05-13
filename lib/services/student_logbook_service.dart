/// Carnet de Formation — Logbook entries service.
///
/// Read + write the student's own dive log. Members can CRUD their own
/// entries; admins/encadrants can read for support but not edit.
///
/// See `CARNET_DE_FORMATION_TECH.md` v2.1 §6.3 + §10.3.

import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/student_logbook_entry.dart';

class StudentLogbookService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  CollectionReference<Map<String, dynamic>> _collection(String clubId) =>
      _firestore.collection('clubs').doc(clubId).collection('student_logbook_entries');

  Future<String> create({
    required String clubId,
    required StudentLogbookEntry entry,
    Map<String, dynamic>? extras,
  }) async {
    final payload = <String, dynamic>{
      ...entry.toMap(),
      'created_at': FieldValue.serverTimestamp(),
      'updated_at': FieldValue.serverTimestamp(),
    };
    if (extras != null) {
      payload.addAll(extras);
    }
    final docRef = await _collection(clubId).add(payload);
    return docRef.id;
  }

  Future<void> update({
    required String clubId,
    required String entryId,
    required StudentLogbookEntry entry,
    Map<String, dynamic>? extras,
  }) async {
    final payload = <String, dynamic>{
      ...entry.toMap(),
      'updated_at': FieldValue.serverTimestamp(),
    };
    if (extras != null) {
      payload.addAll(extras);
    }
    await _collection(clubId).doc(entryId).update(payload);
  }

  Future<void> delete({
    required String clubId,
    required String entryId,
  }) async {
    await _collection(clubId).doc(entryId).delete();
  }

  Stream<List<Map<String, dynamic>>> streamUserEntries(String clubId, String userId, {int? year}) {
    Query<Map<String, dynamic>> q = _collection(clubId)
        .where('member_id', isEqualTo: userId)
        .orderBy('date', descending: true);

    if (year != null) {
      final start = Timestamp.fromDate(DateTime(year, 1, 1));
      final end = Timestamp.fromDate(DateTime(year + 1, 1, 1));
      q = q.where('date', isGreaterThanOrEqualTo: start).where('date', isLessThan: end);
    }
    return q.snapshots().map((snap) => snap.docs.map((d) => {'id': d.id, ...d.data()}).toList());
  }
}
