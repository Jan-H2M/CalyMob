import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import '../models/exercice_lifras.dart';

/// Service de gestion des exercices LIFRAS
class LifrasService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  /// Récupérer tous les exercices d'un club
  Future<List<ExerciceLIFRAS>> getAllExercices(String clubId) async {
    try {
      final snapshot = await _firestore
          .collection('clubs/$clubId/exercices_lifras')
          .orderBy('code')
          .get();

      final exercices = snapshot.docs
          .map((doc) => ExerciceLIFRAS.fromFirestore(doc))
          .toList();

      debugPrint('📚 ${exercices.length} exercices LIFRAS chargés');
      return exercices;
    } catch (e) {
      debugPrint('❌ Erreur chargement exercices LIFRAS: $e');
      return [];
    }
  }

  /// Récupérer les exercices d'un niveau spécifique + exercices "Tous Niveaux" (TN)
  /// Règle: exercices au niveau exact du membre + tous les exercices TN
  Future<List<ExerciceLIFRAS>> getExercicesByNiveau(
    String clubId,
    NiveauLIFRAS niveau,
  ) async {
    try {
      debugPrint('🔍 Recherche exercices pour niveau: ${niveau.code} (${niveau.label})');

      final exercices = <ExerciceLIFRAS>[];

      // 1. Get TN (Tous Niveaux) exercises - accessible to everyone
      final tnSnapshot = await _firestore
          .collection('clubs/$clubId/exercices_lifras')
          .where('niveau', isEqualTo: 'TN')
          .orderBy('code')
          .get();

      exercices.addAll(
        tnSnapshot.docs.map((doc) => ExerciceLIFRAS.fromFirestore(doc)),
      );
      debugPrint('📚 ${tnSnapshot.docs.length} exercices TN (Tous Niveaux) trouvés');

      // 2. Get exercises for the specific niveau (if not TN)
      if (niveau != NiveauLIFRAS.tn) {
        // First try with standard code (P4)
        var snapshot = await _firestore
            .collection('clubs/$clubId/exercices_lifras')
            .where('niveau', isEqualTo: niveau.code)
            .orderBy('code')
            .get();

        // If no results, try with just the number (e.g., "4" instead of "P4")
        if (snapshot.docs.isEmpty) {
          final numericCode = niveau.code.replaceAll(RegExp(r'[^0-9]'), '');
          if (numericCode.isNotEmpty) {
            debugPrint('🔍 Essai avec code numérique: $numericCode');
            snapshot = await _firestore
                .collection('clubs/$clubId/exercices_lifras')
                .where('niveau', isEqualTo: numericCode)
                .orderBy('code')
                .get();
          }
        }

        exercices.addAll(
          snapshot.docs.map((doc) => ExerciceLIFRAS.fromFirestore(doc)),
        );
      }

      debugPrint('📚 ${exercices.length} exercices LIFRAS total pour niveau ${niveau.label}');
      return exercices;
    } catch (e) {
      debugPrint('❌ Erreur chargement exercices par niveau: $e');
      return [];
    }
  }

  /// Récupérer un exercice par son ID
  Future<ExerciceLIFRAS?> getExerciceById(String clubId, String exerciceId) async {
    try {
      final doc = await _firestore
          .collection('clubs/$clubId/exercices_lifras')
          .doc(exerciceId)
          .get();

      if (!doc.exists) {
        debugPrint('❌ Exercice $exerciceId non trouvé');
        return null;
      }

      return ExerciceLIFRAS.fromFirestore(doc);
    } catch (e) {
      debugPrint('❌ Erreur récupération exercice: $e');
      return null;
    }
  }

  /// Récupérer plusieurs exercices par leurs IDs
  Future<List<ExerciceLIFRAS>> getExercicesByIds(
    String clubId,
    List<String> exerciceIds,
  ) async {
    if (exerciceIds.isEmpty) return [];

    try {
      final exercices = <ExerciceLIFRAS>[];

      // Firestore 'in' queries are limited to 10 items, so we batch
      const batchSize = 10;
      for (var i = 0; i < exerciceIds.length; i += batchSize) {
        final batch = exerciceIds.skip(i).take(batchSize).toList();

        final snapshot = await _firestore
            .collection('clubs/$clubId/exercices_lifras')
            .where(FieldPath.documentId, whereIn: batch)
            .get();

        exercices.addAll(
          snapshot.docs.map((doc) => ExerciceLIFRAS.fromFirestore(doc)),
        );
      }

      debugPrint('📚 ${exercices.length}/${exerciceIds.length} exercices LIFRAS récupérés');
      return exercices;
    } catch (e) {
      debugPrint('❌ Erreur récupération exercices par IDs: $e');
      return [];
    }
  }
}
