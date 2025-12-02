import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import '../models/exercice_valide.dart';
import '../models/exercice_lifras.dart';

/// Service de gestion des exercices validés
class ExerciceValideService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  /// Récupérer tous les exercices validés d'un membre
  Future<List<ExerciceValide>> getMemberExercicesValides(
    String clubId,
    String memberId,
  ) async {
    try {
      final snapshot = await _firestore
          .collection('clubs/$clubId/members/$memberId/exercices_valides')
          .orderBy('date_validation', descending: true)
          .get();

      final exercices = snapshot.docs
          .map((doc) => ExerciceValide.fromFirestore(doc))
          .toList();

      debugPrint('✅ ${exercices.length} exercices validés chargés pour membre $memberId');
      return exercices;
    } catch (e) {
      debugPrint('❌ Erreur chargement exercices validés: $e');
      return [];
    }
  }

  /// Stream des exercices validés d'un membre
  Stream<List<ExerciceValide>> getMemberExercicesValidesStream(
    String clubId,
    String memberId,
  ) {
    return _firestore
        .collection('clubs/$clubId/members/$memberId/exercices_valides')
        .orderBy('date_validation', descending: true)
        .snapshots()
        .map((snapshot) {
      final exercices = snapshot.docs
          .map((doc) => ExerciceValide.fromFirestore(doc))
          .toList();
      debugPrint('📡 Stream: ${exercices.length} exercices validés pour membre $memberId');
      return exercices;
    });
  }

  /// Valider un exercice pour un membre
  Future<String> validateExercise({
    required String clubId,
    required String memberId,
    required ExerciceLIFRAS exercice,
    required DateTime dateValidation,
    required String moniteurNom,
    required String createdBy,
    String? moniteurId,
    String? notes,
    String? lieu,
  }) async {
    try {
      debugPrint('✏️ Validation exercice ${exercice.code} pour membre $memberId');

      final exerciceValide = ExerciceValide.fromExercice(
        exercice: exercice,
        dateValidation: dateValidation,
        moniteurNom: moniteurNom,
        createdBy: createdBy,
        moniteurId: moniteurId,
        notes: notes,
        lieu: lieu,
      );

      final docRef = await _firestore
          .collection('clubs/$clubId/members/$memberId/exercices_valides')
          .add(exerciceValide.toFirestore());

      debugPrint('✅ Exercice validé créé: ${docRef.id}');
      return docRef.id;
    } catch (e) {
      debugPrint('❌ Erreur validation exercice: $e');
      rethrow;
    }
  }

  /// Mettre à jour un exercice validé
  Future<void> updateExerciceValide({
    required String clubId,
    required String memberId,
    required String exerciceValideId,
    DateTime? dateValidation,
    String? moniteurNom,
    String? moniteurId,
    String? notes,
    String? lieu,
  }) async {
    try {
      debugPrint('✏️ Mise à jour exercice validé $exerciceValideId');

      final updates = <String, dynamic>{
        'updated_at': FieldValue.serverTimestamp(),
      };

      if (dateValidation != null) {
        updates['date_validation'] = Timestamp.fromDate(dateValidation);
      }
      if (moniteurNom != null) {
        updates['moniteur_nom'] = moniteurNom;
      }
      if (moniteurId != null) {
        updates['moniteur_id'] = moniteurId;
      }
      if (notes != null) {
        updates['notes'] = notes;
      }
      if (lieu != null) {
        updates['lieu'] = lieu;
      }

      await _firestore
          .collection('clubs/$clubId/members/$memberId/exercices_valides')
          .doc(exerciceValideId)
          .update(updates);

      debugPrint('✅ Exercice validé mis à jour');
    } catch (e) {
      debugPrint('❌ Erreur mise à jour exercice validé: $e');
      rethrow;
    }
  }

  /// Supprimer un exercice validé
  Future<void> deleteExerciceValide({
    required String clubId,
    required String memberId,
    required String exerciceValideId,
  }) async {
    try {
      debugPrint('🗑️ Suppression exercice validé $exerciceValideId');

      await _firestore
          .collection('clubs/$clubId/members/$memberId/exercices_valides')
          .doc(exerciceValideId)
          .delete();

      debugPrint('✅ Exercice validé supprimé');
    } catch (e) {
      debugPrint('❌ Erreur suppression exercice validé: $e');
      rethrow;
    }
  }

  /// Vérifier si un exercice est déjà validé pour un membre
  Future<bool> isExerciseValidated({
    required String clubId,
    required String memberId,
    required String exerciceId,
  }) async {
    try {
      final snapshot = await _firestore
          .collection('clubs/$clubId/members/$memberId/exercices_valides')
          .where('exercice_id', isEqualTo: exerciceId)
          .limit(1)
          .get();

      return snapshot.docs.isNotEmpty;
    } catch (e) {
      debugPrint('❌ Erreur vérification exercice validé: $e');
      return false;
    }
  }

  /// Obtenir les exercices validés groupés par niveau
  Map<NiveauLIFRAS, List<ExerciceValide>> groupByNiveau(
    List<ExerciceValide> exercices,
  ) {
    final grouped = <NiveauLIFRAS, List<ExerciceValide>>{};

    // Initialize all niveaux in order
    for (final niveau in NiveauLIFRAS.values) {
      grouped[niveau] = [];
    }

    // Group exercises
    for (final exercice in exercices) {
      grouped[exercice.exerciceNiveau]!.add(exercice);
    }

    // Remove empty groups
    grouped.removeWhere((key, value) => value.isEmpty);

    return grouped;
  }

  /// Obtenir les statistiques des exercices validés
  Map<String, dynamic> getStats(List<ExerciceValide> exercices) {
    final grouped = groupByNiveau(exercices);

    return {
      'total': exercices.length,
      'byNiveau': grouped.map((key, value) => MapEntry(key.code, value.length)),
      'lastValidation': exercices.isNotEmpty ? exercices.first.dateValidation : null,
    };
  }
}
