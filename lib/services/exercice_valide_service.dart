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

  /// Valider un exercice pour un membre (flow moniteur — status = validated)
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
    String? sessionId,
    String? themaId,
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
        status: ExerciceValideStatus.validated,
        declaredByMember: false,
        sessionId: sessionId,
        themaId: themaId,
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

  /// Self-declaration door een member (CalyMob "Je l'ai fait"-flow).
  ///
  /// Dwingt `status='pending'` en `declared_by_member=true` af. Moniteur
  /// velden blijven leeg en worden bij validatie door een encadrant
  /// aangevuld via [setStatus].
  ///
  /// Returns het ID van het nieuw aangemaakte document.
  Future<String> declareByMember({
    required String clubId,
    required String memberId,
    required ExerciceLIFRAS exercice,
    required DateTime dateDeclaration,
    String? sessionId,
    String? themaId,
    String? notes,
    String? lieu,
  }) async {
    try {
      debugPrint('📝 Self-declaration ${exercice.code} par membre $memberId');

      final declaration = ExerciceValide.selfDeclaration(
        exercice: exercice,
        dateDeclaration: dateDeclaration,
        memberId: memberId,
        sessionId: sessionId,
        themaId: themaId,
        notes: notes,
        lieu: lieu,
      );

      final docRef = await _firestore
          .collection('clubs/$clubId/members/$memberId/exercices_valides')
          .add(declaration.toFirestore());

      debugPrint('✅ Déclaration pending créée: ${docRef.id}');
      return docRef.id;
    } catch (e) {
      debugPrint('❌ Erreur self-declaration exercice: $e');
      rethrow;
    }
  }

  /// Transition van status door een moniteur (pending → validated / refused,
  /// of refused → validated voor her-validatie).
  ///
  /// Vult moniteur_nom + moniteur_id in. Bij [ExerciceValideStatus.refused]
  /// kan een optionele [refusedReason] meegegeven worden; bij een re-validation
  /// wordt refused_reason gewist.
  Future<void> setStatus({
    required String clubId,
    required String memberId,
    required String exerciceValideId,
    required ExerciceValideStatus newStatus,
    required String moniteurId,
    required String moniteurNom,
    String? refusedReason,
  }) async {
    try {
      debugPrint('🔄 setStatus $exerciceValideId → ${newStatus.code}');

      final updates = <String, dynamic>{
        'status': newStatus.code,
        'moniteur_id': moniteurId,
        'moniteur_nom': moniteurNom,
        'updated_at': FieldValue.serverTimestamp(),
      };

      if (newStatus == ExerciceValideStatus.refused) {
        if (refusedReason != null && refusedReason.isNotEmpty) {
          updates['refused_reason'] = refusedReason;
        }
      } else if (newStatus == ExerciceValideStatus.validated) {
        // Wis eventuele vorige refusal-reden bij re-validation
        updates['refused_reason'] = FieldValue.delete();
      }

      await _firestore
          .collection('clubs/$clubId/members/$memberId/exercices_valides')
          .doc(exerciceValideId)
          .update(updates);

      debugPrint('✅ Status transitie voltooid');
    } catch (e) {
      debugPrint('❌ Erreur setStatus: $e');
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

  /// Vérifier si un exercice est déjà validé (status = validated) pour un membre.
  ///
  /// Documents met status = 'pending' of 'refused' tellen **niet** mee. Voor
  /// een volledige check (inclusief pending/refused) kan je beter de provider
  /// state raadplegen.
  Future<bool> isExerciseValidated({
    required String clubId,
    required String memberId,
    required String exerciceId,
  }) async {
    try {
      final snapshot = await _firestore
          .collection('clubs/$clubId/members/$memberId/exercices_valides')
          .where('exercice_id', isEqualTo: exerciceId)
          .get();

      // Legacy docs zonder status veld gelden als 'validated' — daarom
      // kunnen we niet filteren op status in de query zelf (composite index
      // issue) en doen we een client-side filter.
      return snapshot.docs.any((doc) {
        final data = doc.data();
        final statusCode = data['status'] as String?;
        final status = ExerciceValideStatusExtension.fromCode(statusCode);
        return status == ExerciceValideStatus.validated;
      });
    } catch (e) {
      debugPrint('❌ Erreur vérification exercice validé: $e');
      return false;
    }
  }

  /// Zoekt een bestaand ExerciceValide-document voor dit exerciceId,
  /// ongeacht status. Handig om bij een nieuwe self-declaration te
  /// detecteren of er al een (refused) doc bestaat dat upgedate moet worden
  /// i.p.v. een nieuw doc aan te maken.
  Future<ExerciceValide?> findByExerciceId({
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
      if (snapshot.docs.isEmpty) return null;
      return ExerciceValide.fromFirestore(snapshot.docs.first);
    } catch (e) {
      debugPrint('❌ Erreur findByExerciceId: $e');
      return null;
    }
  }

  /// Obtenir les exercices validés groupés par niveau.
  ///
  /// Let op: dit groepeert **alle** statussen (pending/validated/refused)
  /// tenzij [onlyValidated] op true staat.
  Map<NiveauLIFRAS, List<ExerciceValide>> groupByNiveau(
    List<ExerciceValide> exercices, {
    bool onlyValidated = false,
  }) {
    final grouped = <NiveauLIFRAS, List<ExerciceValide>>{};

    // Initialize all niveaux in order
    for (final niveau in NiveauLIFRAS.values) {
      grouped[niveau] = [];
    }

    // Group exercises
    for (final exercice in exercices) {
      if (onlyValidated && !exercice.isValidated) continue;
      grouped[exercice.exerciceNiveau]!.add(exercice);
    }

    // Remove empty groups
    grouped.removeWhere((key, value) => value.isEmpty);

    return grouped;
  }

  /// Obtenir les statistiques des exercices.
  ///
  /// Returnt counts opgesplitst per status zodat de UI de progress bar
  /// correct kan opbouwen (validated telt mee, pending/refused niet).
  Map<String, dynamic> getStats(List<ExerciceValide> exercices) {
    final validated = exercices.where((e) => e.isValidated).toList();
    final pending = exercices.where((e) => e.isPending).toList();
    final refused = exercices.where((e) => e.isRefused).toList();
    final groupedValidated = groupByNiveau(validated);

    return {
      'total': exercices.length,
      'validatedCount': validated.length,
      'pendingCount': pending.length,
      'refusedCount': refused.length,
      'byNiveau': groupedValidated.map((key, value) => MapEntry(key.code, value.length)),
      'lastValidation': validated.isNotEmpty ? validated.first.dateValidation : null,
    };
  }
}
