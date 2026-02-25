import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import '../models/dive_location.dart';

/// Service pour les lieux de plongée
/// Firestore collection: clubs/{clubId}/dive_locations
class DiveLocationService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  /// Récupérer tous les lieux de plongée (ordonnés par nom)
  Future<List<DiveLocation>> getAllLocations(String clubId) async {
    try {
      final snapshot = await _firestore
          .collection('clubs/$clubId/dive_locations')
          .orderBy('name', descending: false)
          .get();

      final locations = snapshot.docs
          .map((doc) => DiveLocation.fromFirestore(doc))
          .toList();

      debugPrint('📍 ${locations.length} lieux de plongée chargés');
      return locations;
    } catch (e) {
      debugPrint('❌ Erreur chargement lieux: $e');
      return [];
    }
  }

  /// Récupérer un lieu par ID
  Future<DiveLocation?> getLocationById(String clubId, String locationId) async {
    try {
      final doc = await _firestore
          .collection('clubs/$clubId/dive_locations')
          .doc(locationId)
          .get();

      if (!doc.exists) return null;
      return DiveLocation.fromFirestore(doc);
    } catch (e) {
      debugPrint('❌ Erreur chargement lieu: $e');
      return null;
    }
  }
}
