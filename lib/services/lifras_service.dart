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

      // Strategy: load all exercises and filter client-side.
      // This avoids composite index requirements (niveau + code)
      // and handles both 'P3' and '3' formats stored in Firestore.
      final allExercices = await getAllExercices(clubId);

      if (allExercices.isEmpty) {
        debugPrint('⚠️ Aucun exercice LIFRAS trouvé dans le club $clubId');
        return [];
      }

      final exercices = <ExerciceLIFRAS>[];

      // 1. Get TN (Tous Niveaux) exercises - accessible to everyone
      final tnExercices = allExercices.where((ex) => ex.niveau == NiveauLIFRAS.tn).toList();
      exercices.addAll(tnExercices);
      debugPrint('📚 ${tnExercices.length} exercices TN (Tous Niveaux) trouvés');

      // 2. Get exercises for the specific niveau (if not TN)
      if (niveau != NiveauLIFRAS.tn) {
        final niveauExercices = allExercices.where((ex) => ex.niveau == niveau).toList();
        exercices.addAll(niveauExercices);
        debugPrint('📚 ${niveauExercices.length} exercices pour niveau ${niveau.label}');
      }

      // Sort by code for consistent display
      exercices.sort((a, b) => a.code.compareTo(b.code));

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
