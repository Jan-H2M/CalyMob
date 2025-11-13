import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import '../models/operation.dart';
import '../models/participant_operation.dart';

/// Service de gestion des opérations (événements)
class OperationService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  /// Stream des événements ouverts
  Stream<List<Operation>> getOpenEventsStream(String clubId) {
    return _firestore
        .collection('clubs/$clubId/operations')
        .where('type', isEqualTo: 'evenement')
        .where('statut', isEqualTo: 'ouvert')
        .orderBy('date_debut', descending: false)
        .snapshots()
        .map((snapshot) {
      final operations = snapshot.docs
          .map((doc) => Operation.fromFirestore(doc))
          .toList();

      debugPrint('📅 ${operations.length} événements ouverts chargés');
      return operations;
    });
  }

  /// Obtenir une opération par ID
  Future<Operation?> getOperationById(String clubId, String operationId) async {
    try {
      final doc = await _firestore
          .collection('clubs/$clubId/operations')
          .doc(operationId)
          .get();

      if (!doc.exists) {
        debugPrint('⚠️ Opération non trouvée: $operationId');
        return null;
      }

      return Operation.fromFirestore(doc);
    } catch (e) {
      debugPrint('❌ Erreur chargement opération: $e');
      return null;
    }
  }

  /// Compter le nombre de participants à une opération
  Future<int> countParticipants(String clubId, String operationId) async {
    try {
      final snapshot = await _firestore
          .collection('clubs/$clubId/operation_participants')
          .where('operation_id', isEqualTo: operationId)
          .get();

      debugPrint('👥 ${snapshot.size} participants pour opération $operationId');
      return snapshot.size;
    } catch (e) {
      debugPrint('❌ Erreur comptage participants: $e');
      return 0;
    }
  }

  /// Vérifier si l'utilisateur est déjà inscrit
  Future<bool> isUserRegistered(
    String clubId,
    String operationId,
    String userId,
  ) async {
    try {
      final snapshot = await _firestore
          .collection('clubs/$clubId/operation_participants')
          .where('operation_id', isEqualTo: operationId)
          .where('membre_id', isEqualTo: userId)
          .get();

      final isRegistered = snapshot.docs.isNotEmpty;
      debugPrint(isRegistered
          ? '✅ Utilisateur $userId déjà inscrit à $operationId'
          : '❌ Utilisateur $userId NON inscrit à $operationId');

      return isRegistered;
    } catch (e) {
      debugPrint('❌ Erreur vérification inscription: $e');
      return false;
    }
  }

  /// S'inscrire à une opération
  Future<void> registerToOperation({
    required String clubId,
    required String operationId,
    required String userId,
    required String userName,
    required Operation operation,
  }) async {
    try {
      // Vérifier si déjà inscrit
      final alreadyRegistered = await isUserRegistered(clubId, operationId, userId);
      if (alreadyRegistered) {
        throw Exception('Vous êtes déjà inscrit à cet événement');
      }

      // Vérifier capacité
      final currentCount = await countParticipants(clubId, operationId);
      if (operation.capaciteMax != null && currentCount >= operation.capaciteMax!) {
        throw Exception('Événement complet (${operation.capaciteMax} places)');
      }

      // Créer participant
      final participant = ParticipantOperation(
        id: '', // Firestore génère l'ID
        operationId: operationId,
        operationTitre: operation.titre,
        membreId: userId,
        membreNom: userName,
        prix: operation.prixMembre ?? 0.0,
        paye: false,
        dateInscription: DateTime.now(),
      );

      // Sauvegarder dans Firestore
      await _firestore
          .collection('clubs/$clubId/operation_participants')
          .add(participant.toFirestore());

      debugPrint('✅ Inscription réussie: $userName → ${operation.titre}');
    } catch (e) {
      debugPrint('❌ Erreur inscription: $e');
      rethrow;
    }
  }

  /// Se désinscrire d'une opération
  Future<void> unregisterFromOperation({
    required String clubId,
    required String operationId,
    required String userId,
  }) async {
    try {
      // Trouver le participant
      final snapshot = await _firestore
          .collection('clubs/$clubId/operation_participants')
          .where('operation_id', isEqualTo: operationId)
          .where('membre_id', isEqualTo: userId)
          .get();

      if (snapshot.docs.isEmpty) {
        throw Exception('Inscription non trouvée');
      }

      // Supprimer l'inscription
      await snapshot.docs.first.reference.delete();

      debugPrint('✅ Désinscription réussie: user $userId');
    } catch (e) {
      debugPrint('❌ Erreur désinscription: $e');
      rethrow;
    }
  }

  /// Obtenir les participants d'une opération
  Future<List<ParticipantOperation>> getParticipants(
    String clubId,
    String operationId,
  ) async {
    try {
      final snapshot = await _firestore
          .collection('clubs/$clubId/operation_participants')
          .where('operation_id', isEqualTo: operationId)
          .orderBy('date_inscription', descending: false)
          .get();

      final participants = snapshot.docs
          .map((doc) => ParticipantOperation.fromFirestore(doc))
          .toList();

      debugPrint('👥 ${participants.length} participants chargés');
      return participants;
    } catch (e) {
      debugPrint('❌ Erreur chargement participants: $e');
      return [];
    }
  }
}
