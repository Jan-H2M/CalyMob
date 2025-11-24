import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import '../models/operation.dart';
import '../models/participant_operation.dart';
import '../utils/pricing_calculator.dart';

/// Service de gestion des opérations (événements)
class OperationService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  /// Stream des événements ouverts
  Stream<List<Operation>> getOpenEventsStream(String clubId) {
    final path = 'clubs/$clubId/operations';
    debugPrint('🔍 Requête Firestore: $path avec type=evenement et statut=ouvert');

    return _firestore
        .collection(path)
        .where('type', isEqualTo: 'evenement')
        .where('statut', isEqualTo: 'ouvert')
        .orderBy('date_debut', descending: false)
        .snapshots()
        .map((snapshot) {
      debugPrint('📦 Snapshot reçu: ${snapshot.docs.length} documents');
      final operations = snapshot.docs
          .map((doc) {
            debugPrint('  - Document ${doc.id}: type=${doc.data()['type']}, statut=${doc.data()['statut']}');
            return Operation.fromFirestore(doc);
          })
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
      // ✅ UNIFIED: Read from subcollection (single source of truth)
      final snapshot = await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
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
      // ✅ UNIFIED: Check in subcollection (single source of truth)
      final snapshot = await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
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
    List<String>? exercicesLifras,
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

      // Charger infos membre pour calculer le prix
      final memberInfo = await getMemberInfo(clubId, userId);
      final clubStatuten = memberInfo['clubStatuten'] as List<dynamic>?;
      final clubStatutenStrings = clubStatuten?.cast<String>();

      // Construire le nom complet du membre
      final prenom = memberInfo['prenom'] as String? ?? '';
      final nom = memberInfo['nom'] as String? ?? '';
      final membreNomComplet = '$prenom $nom'.trim().isNotEmpty
          ? '$prenom $nom'.trim()
          : userName;

      // Déterminer la fonction du membre
      final memberFunction = PricingCalculator.determineMemberFunction(clubStatutenStrings);

      // Calculer le prix selon la fonction
      final prix = PricingCalculator.calculatePrice(operation, memberFunction);

      debugPrint('💰 Prix calculé pour $membreNomComplet (fonction: $memberFunction): $prix€');

      // Créer participant
      final participant = ParticipantOperation(
        id: '', // Firestore génère l'ID
        operationId: operationId,
        operationTitre: operation.titre,
        membreId: userId,
        membreNom: nom,
        membrePrenom: prenom,
        prix: prix,
        paye: false,
        dateInscription: DateTime.now(),
        exercicesLifras: exercicesLifras,
      );

      // ✅ UNIFIED: Write to subcollection ONLY (single source of truth)
      final docRef = await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .add(participant.toFirestore());

      debugPrint('✅ Inscription réussie: ${docRef.id} → ${operation.titre}');
      if (exercicesLifras != null && exercicesLifras.isNotEmpty) {
        debugPrint('📚 Avec ${exercicesLifras.length} exercice(s) LIFRAS');
      }
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
      // ✅ UNIFIED: Delete from subcollection ONLY (single source of truth)
      final snapshot = await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .where('membre_id', isEqualTo: userId)
          .get();

      if (snapshot.docs.isEmpty) {
        throw Exception('Inscription non trouvée');
      }

      // Delete inscription
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
      // STRATÉGIE: Lire depuis la subcollection (comme le web app)
      // Chemin: clubs/{clubId}/operations/{operationId}/inscriptions
      final snapshot = await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .orderBy('date_inscription', descending: false)
          .get();

      final participants = snapshot.docs
          .map((doc) => ParticipantOperation.fromFirestore(doc))
          .toList();

      debugPrint('👥 ${participants.length} participants chargés depuis subcollection inscriptions');
      return participants;
    } catch (e) {
      debugPrint('❌ Erreur chargement participants: $e');
      return [];
    }
  }

  /// Stream des inscriptions d'un utilisateur
  Stream<List<ParticipantOperation>> getUserRegistrationsStream(
    String clubId,
    String userId,
  ) {
    return _firestore
        .collection('clubs/$clubId/operation_participants')
        .where('membre_id', isEqualTo: userId)
        .orderBy('date_inscription', descending: true)
        .snapshots()
        .map((snapshot) {
      final registrations = snapshot.docs
          .map((doc) => ParticipantOperation.fromFirestore(doc))
          .toList();

      debugPrint('📝 ${registrations.length} inscriptions pour utilisateur $userId');
      return registrations;
    });
  }

  /// Obtenir les inscriptions d'un utilisateur (non-stream)
  Future<List<ParticipantOperation>> getUserRegistrations(
    String clubId,
    String userId,
  ) async {
    try {
      final snapshot = await _firestore
          .collection('clubs/$clubId/operation_participants')
          .where('membre_id', isEqualTo: userId)
          .orderBy('date_inscription', descending: true)
          .get();

      final registrations = snapshot.docs
          .map((doc) => ParticipantOperation.fromFirestore(doc))
          .toList();

      debugPrint('📝 ${registrations.length} inscriptions pour utilisateur $userId');
      return registrations;
    } catch (e) {
      debugPrint('❌ Erreur chargement inscriptions utilisateur: $e');
      return [];
    }
  }

  /// Obtenir les informations d'un membre (pour calcul tarif)
  Future<Map<String, dynamic>> getMemberInfo(String clubId, String userId) async {
    try {
      final doc = await _firestore
          .collection('clubs')
          .doc(clubId)
          .collection('members')
          .doc(userId)
          .get();

      if (!doc.exists) {
        debugPrint('⚠️ Membre non trouvé: $userId');
        return {
          'clubStatuten': null,
          'nom': '',
          'prenom': '',
        };
      }

      final data = doc.data()!;
      debugPrint('👤 Infos membre chargées: ${data['prenom']} ${data['nom']}');

      return {
        'clubStatuten': data['clubStatuten'] as List<dynamic>?,
        'nom': data['nom'] ?? '',
        'prenom': data['prenom'] ?? '',
      };
    } catch (e) {
      debugPrint('❌ Erreur chargement infos membre: $e');
      return {
        'clubStatuten': null,
        'nom': '',
        'prenom': '',
      };
    }
  }

  /// Obtenir l'inscription d'un utilisateur pour un événement
  Future<ParticipantOperation?> getUserParticipation(
    String clubId,
    String operationId,
    String userId,
  ) async {
    try {
      final snapshot = await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .where('membre_id', isEqualTo: userId)
          .limit(1)
          .get();

      if (snapshot.docs.isEmpty) {
        return null;
      }

      return ParticipantOperation.fromFirestore(snapshot.docs.first);
    } catch (e) {
      debugPrint('❌ Erreur chargement participation: $e');
      return null;
    }
  }

  /// Mettre à jour le statut de paiement d'une inscription
  Future<void> updateParticipantPaymentStatus({
    required String clubId,
    required String participantId,
    required bool paye,
    DateTime? datePaiement,
    String? paymentId,
    String? paymentStatus,
  }) async {
    try {
      final updates = <String, dynamic>{
        'paye': paye,
        'updated_at': FieldValue.serverTimestamp(),
      };

      if (datePaiement != null) {
        updates['date_paiement'] = Timestamp.fromDate(datePaiement);
      }

      if (paymentId != null) {
        updates['payment_id'] = paymentId;
      }

      if (paymentStatus != null) {
        updates['payment_status'] = paymentStatus;
      }

      await _firestore
          .collection('clubs/$clubId/operation_participants')
          .doc(participantId)
          .update(updates);

      debugPrint('✅ Statut paiement mis à jour pour participant $participantId');
    } catch (e) {
      debugPrint('❌ Erreur mise à jour statut paiement: $e');
      rethrow;
    }
  }
}
