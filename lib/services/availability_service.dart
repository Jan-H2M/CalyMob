import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import '../models/availability.dart';

/// Service de gestion des disponibilités pour les séances piscine
/// Les membres Accueil et Encadrants peuvent indiquer leurs disponibilités
class AvailabilityService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  /// Collection path pour les disponibilités
  String _collectionPath(String clubId) => 'clubs/$clubId/availabilities';

  /// Stream des disponibilités d'un utilisateur pour un mois donné
  /// Filtré par rôle (accueil ou encadrant)
  Stream<List<Availability>> getUserAvailabilitiesStream({
    required String clubId,
    required String userId,
    required int year,
    required int month,
    String? role,
  }) {
    // Premier jour du mois à 00:00
    final startOfMonth = DateTime(year, month, 1);
    // Premier jour du mois suivant à 00:00
    final endOfMonth = DateTime(year, month + 1, 1);

    Query<Map<String, dynamic>> query = _firestore
        .collection(_collectionPath(clubId))
        .where('membre_id', isEqualTo: userId)
        .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(startOfMonth))
        .where('date', isLessThan: Timestamp.fromDate(endOfMonth));

    // Filter by role if provided
    if (role != null) {
      query = query.where('role', isEqualTo: role);
    }

    return query.orderBy('date').snapshots().map((snapshot) {
      return snapshot.docs
          .map((doc) => Availability.fromFirestore(doc))
          .toList();
    });
  }

  /// Récupérer les disponibilités d'un utilisateur pour un mois
  Future<List<Availability>> getUserAvailabilities({
    required String clubId,
    required String userId,
    required int year,
    required int month,
  }) async {
    try {
      final startOfMonth = DateTime(year, month, 1);
      final endOfMonth = DateTime(year, month + 1, 1);

      final snapshot = await _firestore
          .collection(_collectionPath(clubId))
          .where('membre_id', isEqualTo: userId)
          .where('date',
              isGreaterThanOrEqualTo: Timestamp.fromDate(startOfMonth))
          .where('date', isLessThan: Timestamp.fromDate(endOfMonth))
          .orderBy('date')
          .get();

      final availabilities = snapshot.docs
          .map((doc) => Availability.fromFirestore(doc))
          .toList();

      debugPrint(
          '✅ ${availabilities.length} disponibilités chargées pour $userId ($month/$year)');
      return availabilities;
    } catch (e) {
      debugPrint('❌ Erreur chargement disponibilités: $e');
      return [];
    }
  }

  /// Récupérer toutes les disponibilités pour une date spécifique
  /// Utilisé par les admins pour voir qui est disponible
  Future<List<Availability>> getAvailabilitiesForDate({
    required String clubId,
    required DateTime date,
  }) async {
    try {
      // Normaliser la date au début du jour
      final startOfDay = DateTime(date.year, date.month, date.day);
      final endOfDay = startOfDay.add(const Duration(days: 1));

      final snapshot = await _firestore
          .collection(_collectionPath(clubId))
          .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(startOfDay))
          .where('date', isLessThan: Timestamp.fromDate(endOfDay))
          .get();

      final availabilities = snapshot.docs
          .map((doc) => Availability.fromFirestore(doc))
          .toList();

      debugPrint(
          '✅ ${availabilities.length} disponibilités pour ${date.day}/${date.month}/${date.year}');
      return availabilities;
    } catch (e) {
      debugPrint('❌ Erreur chargement disponibilités par date: $e');
      return [];
    }
  }

  /// Récupérer toutes les disponibilités pour un mois (admin view)
  Future<List<Availability>> getAllAvailabilitiesForMonth({
    required String clubId,
    required int year,
    required int month,
  }) async {
    try {
      final startOfMonth = DateTime(year, month, 1);
      final endOfMonth = DateTime(year, month + 1, 1);

      final snapshot = await _firestore
          .collection(_collectionPath(clubId))
          .where('date',
              isGreaterThanOrEqualTo: Timestamp.fromDate(startOfMonth))
          .where('date', isLessThan: Timestamp.fromDate(endOfMonth))
          .orderBy('date')
          .get();

      final availabilities = snapshot.docs
          .map((doc) => Availability.fromFirestore(doc))
          .toList();

      debugPrint(
          '✅ ${availabilities.length} disponibilités totales pour $month/$year');
      return availabilities;
    } catch (e) {
      debugPrint('❌ Erreur chargement toutes disponibilités: $e');
      return [];
    }
  }

  /// Basculer la disponibilité pour une date
  /// Si une entrée existe, on la met à jour. Sinon, on la crée.
  Future<void> toggleAvailability({
    required String clubId,
    required String userId,
    required String userNom,
    required String userPrenom,
    required DateTime date,
    required String role,
    required bool available,
  }) async {
    try {
      // Normaliser la date au début du jour
      final normalizedDate = DateTime(date.year, date.month, date.day);

      // Chercher une entrée existante pour cette date, utilisateur et rôle
      final startOfDay = normalizedDate;
      final endOfDay = normalizedDate.add(const Duration(days: 1));

      final snapshot = await _firestore
          .collection(_collectionPath(clubId))
          .where('membre_id', isEqualTo: userId)
          .where('role', isEqualTo: role)
          .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(startOfDay))
          .where('date', isLessThan: Timestamp.fromDate(endOfDay))
          .get();

      if (snapshot.docs.isNotEmpty) {
        // Mettre à jour l'entrée existante
        await snapshot.docs.first.reference.update({
          'available': available,
          'updated_at': Timestamp.now(),
        });
        debugPrint('✅ Disponibilité mise à jour: $available pour $normalizedDate');
      } else {
        // Créer une nouvelle entrée
        final availability = Availability(
          id: '',
          membreId: userId,
          membreNom: userNom,
          membrePrenom: userPrenom,
          date: normalizedDate,
          role: role,
          available: available,
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        );

        await _firestore
            .collection(_collectionPath(clubId))
            .add(availability.toFirestore());

        debugPrint('✅ Nouvelle disponibilité créée: $available pour $normalizedDate');
      }
    } catch (e) {
      debugPrint('❌ Erreur toggle disponibilité: $e');
      rethrow;
    }
  }

  /// Supprimer une disponibilité
  Future<void> deleteAvailability({
    required String clubId,
    required String availabilityId,
  }) async {
    try {
      await _firestore
          .collection(_collectionPath(clubId))
          .doc(availabilityId)
          .delete();

      debugPrint('✅ Disponibilité supprimée: $availabilityId');
    } catch (e) {
      debugPrint('❌ Erreur suppression disponibilité: $e');
      rethrow;
    }
  }

  /// Supprimer une disponibilité pour une date spécifique
  /// Utilisé pour revenir à l'état "pas encore indiqué"
  Future<void> deleteAvailabilityForDate({
    required String clubId,
    required String userId,
    required DateTime date,
    required String role,
  }) async {
    try {
      final normalizedDate = DateTime(date.year, date.month, date.day);
      final startOfDay = normalizedDate;
      final endOfDay = normalizedDate.add(const Duration(days: 1));

      final snapshot = await _firestore
          .collection(_collectionPath(clubId))
          .where('membre_id', isEqualTo: userId)
          .where('role', isEqualTo: role)
          .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(startOfDay))
          .where('date', isLessThan: Timestamp.fromDate(endOfDay))
          .get();

      if (snapshot.docs.isNotEmpty) {
        await snapshot.docs.first.reference.delete();
        debugPrint('✅ Disponibilité supprimée pour $normalizedDate');
      }
    } catch (e) {
      debugPrint('❌ Erreur suppression disponibilité par date: $e');
      rethrow;
    }
  }

  /// Obtenir tous les mardis d'un mois donné
  static List<DateTime> getTuesdaysOfMonth(int year, int month) {
    final tuesdays = <DateTime>[];
    final firstDay = DateTime(year, month, 1);
    final lastDay = DateTime(year, month + 1, 0); // Dernier jour du mois

    // Trouver le premier mardi
    var current = firstDay;
    while (current.weekday != DateTime.tuesday) {
      current = current.add(const Duration(days: 1));
    }

    // Ajouter tous les mardis du mois
    while (current.isBefore(lastDay) || current.isAtSameMomentAs(lastDay)) {
      tuesdays.add(current);
      current = current.add(const Duration(days: 7));
    }

    return tuesdays;
  }
}
