import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import '../models/palanquee.dart';

/// Service voor Palanquée Assignments
///
/// Firestore path: clubs/{clubId}/operations/{operationId}/palanquees/assignments
/// Eén document per operatie met alle palanquée-toewijzingen.
class PalanqueeService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  static const String _docId = 'assignments';

  DocumentReference _docRef(String clubId, String operationId) {
    return _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('operations')
        .doc(operationId)
        .collection('palanquees')
        .doc(_docId);
  }

  /// Haal palanquée assignments op voor een operatie.
  /// Geeft null terug als er nog geen toewijzingen bestaan.
  Future<PalanqueeAssignments?> getAssignments(
    String clubId,
    String operationId,
  ) async {
    try {
      final snapshot = await _docRef(clubId, operationId).get();

      if (!snapshot.exists) {
        return null;
      }

      final data = snapshot.data() as Map<String, dynamic>;
      return PalanqueeAssignments.fromFirestore(data);
    } catch (e) {
      debugPrint('❌ Fout bij ophalen palanquée assignments: $e');
      rethrow;
    }
  }

  /// Sla palanquée assignments op voor een operatie.
  /// Overschrijft het hele document.
  Future<void> saveAssignments(
    String clubId,
    String operationId,
    PalanqueeAssignments assignments,
    String userId,
  ) async {
    try {
      final data = {
        'palanquees': assignments.palanquees.map((p) => p.toMap()).toList(),
        'updated_at': FieldValue.serverTimestamp(),
        'updated_by': userId,
      };

      await _docRef(clubId, operationId).set(data);
      debugPrint('✅ Palanquée assignments opgeslagen voor operatie $operationId');
    } catch (e) {
      debugPrint('❌ Fout bij opslaan palanquée assignments: $e');
      rethrow;
    }
  }
}
