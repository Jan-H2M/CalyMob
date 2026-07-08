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
      _firestore
          .collection('clubs')
          .doc(clubId)
          .collection('student_logbook_entries');

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
    String? editedBy,
  }) async {
    final payload = <String, dynamic>{
      ...entry.toMap(),
      'updated_at': FieldValue.serverTimestamp(),
      // WP-19 (D5) — piste d'audit d'édition.
      'edited_at': FieldValue.serverTimestamp(),
      if (editedBy != null) 'edited_by': editedBy,
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

  Stream<List<Map<String, dynamic>>> streamUserEntries(
    String clubId,
    String userId, {
    int? year,
  }) {
    final q = _collection(clubId).where('member_id', isEqualTo: userId);
    return q.snapshots().map((snap) {
      final rows = snap.docs.map((d) => {
            'id': d.id,
            // WP-23 — écriture hors ligne pas encore synchronisée.
            '_pending': d.metadata.hasPendingWrites,
            ...d.data(),
          }).where((row) {
        if (year == null) return true;
        final ts = row['date'];
        return ts is Timestamp && ts.toDate().year == year;
      }).toList();
      rows.sort((a, b) {
        final aNumber = a['dive_number'];
        final bNumber = b['dive_number'];
        if (aNumber is num && bNumber is num && aNumber != bNumber) {
          return bNumber.compareTo(aNumber);
        }
        if (aNumber is num && bNumber is! num) return -1;
        if (aNumber is! num && bNumber is num) return 1;
        final aDate = a['date'];
        final bDate = b['date'];
        if (aDate is Timestamp && bDate is Timestamp) {
          return bDate.compareTo(aDate);
        }
        if (aDate is Timestamp) return -1;
        if (bDate is Timestamp) return 1;
        return 0;
      });
      return rows;
    });
  }
}
