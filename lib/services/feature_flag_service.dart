import 'package:cloud_firestore/cloud_firestore.dart';

/// Service voor feature flags — bestuurt of Carnet de Formation zichtbaar is.
/// Luistert real-time naar clubs/{clubId}/settings/feature_flags.
class FeatureFlagService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  /// Stream die true/false geeft voor carnetFormationEnabled.
  Stream<bool> isCarnetFormationEnabled(String clubId) {
    return _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('settings')
        .doc('feature_flags')
        .snapshots()
        .map((doc) {
      if (!doc.exists) return false;
      final data = doc.data();
      return data?['carnetFormationEnabled'] == true;
    });
  }

  /// Stream die true/false geeft voor adminOnly modus.
  Stream<bool> isCarnetFormationAdminOnly(String clubId) {
    return _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('settings')
        .doc('feature_flags')        .snapshots()
        .map((doc) {
      if (!doc.exists) return true;
      final data = doc.data();
      return data?['carnetFormationAdminOnly'] ?? true;
    });
  }

  /// Eenmalige check (voor use-cases waar stream niet nodig is).
  Future<bool> checkCarnetFormationEnabled(String clubId) async {
    final doc = await _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('settings')
        .doc('feature_flags')
        .get();
    if (!doc.exists) return false;
    return doc.data()?['carnetFormationEnabled'] == true;
  }
}