import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import '../models/dive_location.dart';
import 'dive_location_sync_contract.dart';

/// Service pour les lieux de plongée
/// Firestore collection: clubs/{clubId}/dive_locations
class DiveLocationService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  /// Récupérer tous les lieux de plongée (ordonnés par nom)
  Future<List<DiveLocation>> getAllLocations(String clubId) async {
    final result = await getAllLocationsWithState(clubId);
    return result.items;
  }

  /// Charge le catalogue en distinguant données fraîches, cache, hors-ligne,
  /// erreur et catalogue réellement vide.
  Future<DiveLocationLoadResult<DiveLocation>> getAllLocationsWithState(
    String clubId,
  ) async {
    try {
      final snapshot = await _firestore
          .collection('clubs/$clubId/dive_locations')
          .orderBy('name', descending: false)
          .get();

      final locations = snapshot.docs
          .map((doc) => DiveLocation.fromFirestore(doc))
          .where((location) => location.mergedIntoLocationId == null)
          .toList();

      debugPrint('📍 ${locations.length} lieux de plongée chargés');
      return DiveLocationLoadResult(
        items: locations,
        state: stateForSnapshot(snapshot, locations.length),
      );
    } catch (error) {
      debugPrint('❌ Erreur chargement lieux: $error');
      try {
        final cachedSnapshot = await _firestore
            .collection('clubs/$clubId/dive_locations')
            .orderBy('name', descending: false)
            .get(const GetOptions(source: Source.cache));
        final cached = cachedSnapshot.docs
            .map((doc) => DiveLocation.fromFirestore(doc))
            .where((location) => location.mergedIntoLocationId == null)
            .toList();
        return DiveLocationLoadResult(
          items: cached,
          state: isTransientFirestoreError(error)
              ? DiveLocationLoadState.offline
              : (cached.isEmpty
                    ? DiveLocationLoadState.empty
                    : DiveLocationLoadState.cached),
          error: error,
        );
      } catch (_) {
        return DiveLocationLoadResult(
          items: const [],
          state: isTransientFirestoreError(error)
              ? DiveLocationLoadState.offline
              : DiveLocationLoadState.error,
          error: error,
        );
      }
    }
  }

  /// Récupérer uniquement les lieux proposés dans
  /// CalyCompta > Paramètres > Sites de plongée > Pour les activités.
  Future<List<DiveLocation>> getEventLocations(String clubId) async {
    final result = await getEventLocationsWithState(clubId);
    return result.items;
  }

  Future<DiveLocationLoadResult<DiveLocation>> getEventLocationsWithState(
    String clubId,
  ) async {
    final result = await getAllLocationsWithState(clubId);
    return DiveLocationLoadResult(
      items: result.items
          .where((location) => location.availableForEvents)
          .toList(),
      state: result.state,
      error: result.error,
    );
  }

  /// Récupérer un lieu par ID
  Future<DiveLocation?> getLocationById(
    String clubId,
    String locationId,
  ) async {
    var currentId = locationId;
    final visited = <String>{};
    for (var hop = 0; hop < 10 && !visited.contains(currentId); hop++) {
      visited.add(currentId);
      try {
        final doc = await _firestore
            .collection('clubs/$clubId/dive_locations')
            .doc(currentId)
            .get();
        if (!doc.exists) return null;
        final location = DiveLocation.fromFirestore(doc);
        final redirect = location.mergedIntoLocationId?.trim();
        if (redirect != null && redirect.isNotEmpty) {
          currentId = redirect;
          continue;
        }
        return location;
      } catch (error) {
        debugPrint('❌ Erreur chargement lieu: $error');
        return null;
      }
    }
    return null;
  }
}
