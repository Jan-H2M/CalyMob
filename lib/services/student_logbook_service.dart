/// Carnet de Formation — Logbook entries service.
///
/// Read + write the student's own dive log. Members can CRUD their own
/// entries; admins/encadrants can read for support but not edit.
///
/// See `CARNET_DE_FORMATION_TECH.md` v2.1 §6.3 + §10.3.

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import '../models/student_logbook_entry.dart';
import '../utils/logbook_sync.dart';

class StudentLogbookService {
  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  StudentLogbookService({
    FirebaseFirestore? firestore,
    FirebaseFunctions? functions,
  })  : _firestore = firestore ?? FirebaseFirestore.instance,
        _functions =
            functions ?? FirebaseFunctions.instanceFor(region: 'europe-west1');

  CollectionReference<Map<String, dynamic>> _collection(String clubId) =>
      _firestore
          .collection('clubs')
          .doc(clubId)
          .collection('student_logbook_entries');

  Future<Map<String, dynamic>> _withReferenceGps({
    required String clubId,
    required String locationName,
    Map<String, dynamic>? extras,
  }) async {
    final payload = <String, dynamic>{...?extras};
    // Never overwrite coordinates that a caller already resolved explicitly.
    if (payload['latitude'] is num && payload['longitude'] is num) {
      return payload;
    }
    if (locationName.trim().isEmpty) return payload;
    try {
      final response = await _functions
          .httpsCallable('resolveReferenceDiveSiteLocation')
          .call(<String, dynamic>{
        'clubId': clubId,
        'locationName': locationName.trim(),
      });
      final data = Map<String, dynamic>.from(response.data as Map);
      if (data['found'] == true &&
          data['latitude'] is num &&
          data['longitude'] is num) {
        payload['latitude'] = (data['latitude'] as num).toDouble();
        payload['longitude'] = (data['longitude'] as num).toDouble();
        payload['gps_reference_source'] = 'private_reference_exact_name';
      }
    } on FirebaseFunctionsException {
      // Non-fatal: entries must remain saveable while the separate reference
      // project is not configured or an exact match is unavailable.
    } catch (_) {
      // Network/offline failures are non-fatal for manual carnet entries.
    }
    return payload;
  }

  Future<String> create({
    required String clubId,
    required StudentLogbookEntry entry,
    Map<String, dynamic>? extras,
  }) async {
    final resolvedExtras = await _withReferenceGps(
      clubId: clubId,
      locationName: entry.locationName,
      extras: extras,
    );
    final payload = <String, dynamic>{
      ...entry.toMap(),
      'created_at': FieldValue.serverTimestamp(),
      'updated_at': FieldValue.serverTimestamp(),
    };
    payload.addAll(resolvedExtras);
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
    final resolvedExtras = await _withReferenceGps(
      clubId: clubId,
      locationName: entry.locationName,
      extras: extras,
    );
    final payload = <String, dynamic>{
      ...entry.toMap(),
      'updated_at': FieldValue.serverTimestamp(),
      // WP-19 (D5) — piste d'audit d'édition.
      'edited_at': FieldValue.serverTimestamp(),
      if (editedBy != null) 'edited_by': editedBy,
    };
    payload.addAll(resolvedExtras);
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
      final rows = snap.docs
          .map((d) => logbookRowWithSyncState(
                id: d.id,
                data: d.data(),
                // WP-23 — écriture hors ligne pas encore synchronisée.
                hasPendingWrites: d.metadata.hasPendingWrites,
              ))
          .where((row) {
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
