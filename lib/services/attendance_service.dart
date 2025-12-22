import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import '../models/attendance_record.dart';

/// Service for managing attendance check-ins
class AttendanceService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  /// Record a new attendance check-in
  Future<String> recordAttendance(
      String clubId, AttendanceRecord record) async {
    try {
      final docRef = await _firestore
          .collection('clubs/$clubId/attendance')
          .add(record.toFirestore());

      debugPrint(
          '✅ Présence enregistrée: ${record.fullName} (${record.membreId})');
      return docRef.id;
    } catch (e) {
      debugPrint('❌ Erreur enregistrement présence: $e');
      rethrow;
    }
  }

  /// Get recent attendance records as a stream
  Stream<List<AttendanceRecord>> getRecentAttendance(String clubId,
      {int limit = 50}) {
    return _firestore
        .collection('clubs/$clubId/attendance')
        .orderBy('checked_in_at', descending: true)
        .limit(limit)
        .snapshots()
        .map((snapshot) => snapshot.docs
            .map((doc) => AttendanceRecord.fromFirestore(doc))
            .toList());
  }

  /// Check if a member has already checked in today
  Future<AttendanceRecord?> getTodayCheckIn(
      String clubId, String memberId) async {
    try {
      final now = DateTime.now();
      final startOfDay = DateTime(now.year, now.month, now.day);
      final endOfDay = startOfDay.add(const Duration(days: 1));

      final snapshot = await _firestore
          .collection('clubs/$clubId/attendance')
          .where('membre_id', isEqualTo: memberId)
          .where('checked_in_at',
              isGreaterThanOrEqualTo: Timestamp.fromDate(startOfDay))
          .where('checked_in_at', isLessThan: Timestamp.fromDate(endOfDay))
          .limit(1)
          .get();

      if (snapshot.docs.isEmpty) {
        return null;
      }

      return AttendanceRecord.fromFirestore(snapshot.docs.first);
    } catch (e) {
      debugPrint('❌ Erreur vérification présence: $e');
      return null;
    }
  }

  /// Get attendance records for a specific date
  Future<List<AttendanceRecord>> getAttendanceForDate(
      String clubId, DateTime date) async {
    try {
      final startOfDay = DateTime(date.year, date.month, date.day);
      final endOfDay = startOfDay.add(const Duration(days: 1));

      final snapshot = await _firestore
          .collection('clubs/$clubId/attendance')
          .where('checked_in_at',
              isGreaterThanOrEqualTo: Timestamp.fromDate(startOfDay))
          .where('checked_in_at', isLessThan: Timestamp.fromDate(endOfDay))
          .orderBy('checked_in_at', descending: true)
          .get();

      return snapshot.docs
          .map((doc) => AttendanceRecord.fromFirestore(doc))
          .toList();
    } catch (e) {
      debugPrint('❌ Erreur récupération présences: $e');
      return [];
    }
  }
}
