import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import '../models/operation.dart';
import '../models/member_profile.dart';
import '../models/participant_operation.dart';
import '../models/supplement.dart';
import '../models/user_event_registration.dart';
import '../utils/tariff_utils.dart';

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
  /// Uses subcollection: clubs/{clubId}/operations/{operationId}/inscriptions
  Future<int> countParticipants(String clubId, String operationId) async {
    try {
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
  /// Uses subcollection: clubs/{clubId}/operations/{operationId}/inscriptions
  Future<bool> isUserRegistered(
    String clubId,
    String operationId,
    String userId,
  ) async {
    try {
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
  /// Uses subcollection: clubs/{clubId}/operations/{operationId}/inscriptions
  Future<void> registerToOperation({
    required String clubId,
    required String operationId,
    required String userId,
    required String userName,
    required Operation operation,
    MemberProfile? memberProfile,
    List<SelectedSupplement>? selectedSupplements,
    double? supplementTotal,
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

      // Calculer le prix basé sur la fonction du membre
      double prix;
      if (memberProfile != null) {
        prix = TariffUtils.computeRegistrationPrice(
          operation: operation,
          profile: memberProfile,
        );
        debugPrint('💰 Prix calculé: $prix€ pour fonction ${TariffUtils.getFunctionLabel(memberProfile)}');
      } else {
        // Fallback si pas de profil
        prix = operation.prixMembre ?? 0.0;
      }

      // Créer participant - utiliser les champs du profil si disponibles
      final participant = ParticipantOperation(
        id: '', // Firestore génère l'ID
        operationId: operationId,
        operationTitre: operation.titre,
        membreId: userId,
        membreNom: memberProfile?.nom ?? userName,
        membrePrenom: memberProfile?.prenom,
        prix: prix,
        paye: false,
        dateInscription: DateTime.now(),
        selectedSupplements: selectedSupplements ?? [],
        supplementTotal: supplementTotal ?? 0,
      );

      // Sauvegarder dans Firestore (subcollection under operation)
      await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .add(participant.toFirestore());

      final totalPrix = prix + (supplementTotal ?? 0);
      debugPrint('✅ Inscription réussie: $userName → ${operation.titre} (total: $totalPrix€)');
    } catch (e) {
      debugPrint('❌ Erreur inscription: $e');
      rethrow;
    }
  }

  /// Se désinscrire d'une opération
  /// Uses subcollection: clubs/{clubId}/operations/{operationId}/inscriptions
  Future<void> unregisterFromOperation({
    required String clubId,
    required String operationId,
    required String userId,
  }) async {
    try {
      // Trouver le participant
      final snapshot = await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
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
  /// Uses subcollection: clubs/{clubId}/operations/{operationId}/inscriptions
  Future<List<ParticipantOperation>> getParticipants(
    String clubId,
    String operationId,
  ) async {
    try {
      debugPrint('🔍 Recherche participants dans subcollection inscriptions pour operation_id: $operationId');

      final snapshot = await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .get();

      final participants = snapshot.docs
          .map((doc) => ParticipantOperation.fromFirestore(doc))
          .toList();

      // Sort by date locally instead of in query (avoids needing composite index)
      participants.sort((a, b) => a.dateInscription.compareTo(b.dateInscription));

      debugPrint('👥 ${participants.length} participants chargés pour $operationId');
      return participants;
    } catch (e) {
      debugPrint('❌ Erreur chargement participants: $e');
      return [];
    }
  }

  /// Mettre à jour les exercices sélectionnés pour une inscription
  Future<void> updateExercices({
    required String clubId,
    required String operationId,
    required String userId,
    required List<String> exercices,
  }) async {
    try {
      // Trouver l'inscription
      final snapshot = await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .where('membre_id', isEqualTo: userId)
          .get();

      if (snapshot.docs.isEmpty) {
        throw Exception('Inscription non trouvée');
      }

      // Mettre à jour les exercices
      await snapshot.docs.first.reference.update({
        'exercices': exercices,
        'updated_at': FieldValue.serverTimestamp(),
      });

      debugPrint('✅ Exercices mis à jour: ${exercices.length} exercices');
    } catch (e) {
      debugPrint('❌ Erreur mise à jour exercices: $e');
      rethrow;
    }
  }

  /// Obtenir l'inscription d'un utilisateur
  Future<ParticipantOperation?> getUserInscription({
    required String clubId,
    required String operationId,
    required String userId,
  }) async {
    try {
      final snapshot = await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .where('membre_id', isEqualTo: userId)
          .get();

      if (snapshot.docs.isEmpty) {
        return null;
      }

      return ParticipantOperation.fromFirestore(snapshot.docs.first);
    } catch (e) {
      debugPrint('❌ Erreur récupération inscription: $e');
      return null;
    }
  }

  /// Marquer une inscription comme présent
  /// Sets present=true with timestamp and user info
  Future<void> markAsPresent({
    required String clubId,
    required String operationId,
    required String memberId,
    required String markedByUserId,
    required String markedByUserName,
  }) async {
    try {
      // Find the inscription
      final snapshot = await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .where('membre_id', isEqualTo: memberId)
          .get();

      if (snapshot.docs.isEmpty) {
        throw Exception('Inscription non trouvée');
      }

      // Update the inscription with present info
      await snapshot.docs.first.reference.update({
        'present': true,
        'present_at': FieldValue.serverTimestamp(),
        'present_by': markedByUserId,
        'present_by_name': markedByUserName,
        'updated_at': FieldValue.serverTimestamp(),
      });

      debugPrint('✅ Membre $memberId marqué présent pour opération $operationId');
    } catch (e) {
      debugPrint('❌ Erreur marquage présent: $e');
      rethrow;
    }
  }

  /// Créer une inscription "walk-in" (sur place) avec présence déjà marquée
  /// Used when scanning a member who wasn't pre-registered
  Future<void> createWalkInInscription({
    required String clubId,
    required String operationId,
    required String operationTitle,
    required MemberProfile member,
    required String markedByUserId,
    required String markedByUserName,
  }) async {
    try {
      // Create inscription with present=true
      final inscriptionData = {
        'operation_id': operationId,
        'operation_titre': operationTitle,
        'membre_id': member.id,
        'membre_nom': member.nom,
        'membre_prenom': member.prenom,
        'prix': 0.0, // Walk-in, prix à déterminer si nécessaire
        'paye': false,
        'date_inscription': FieldValue.serverTimestamp(),
        // Already present (scanned)
        'present': true,
        'present_at': FieldValue.serverTimestamp(),
        'present_by': markedByUserId,
        'present_by_name': markedByUserName,
        // Walk-in marker
        'walk_in': true,
        'created_at': FieldValue.serverTimestamp(),
        'updated_at': FieldValue.serverTimestamp(),
      };

      await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .add(inscriptionData);

      debugPrint('✅ Inscription walk-in créée: ${member.fullName} → $operationTitle');
    } catch (e) {
      debugPrint('❌ Erreur création inscription walk-in: $e');
      rethrow;
    }
  }

  /// Mark a participant's payment as received (by organizer on site)
  /// Sets paye=true with timestamp and user info
  Future<void> markParticipantAsPaid({
    required String clubId,
    required String operationId,
    required String participantId,
  }) async {
    try {
      await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .doc(participantId)
          .update({
        'paye': true,
        'paye_at': FieldValue.serverTimestamp(),
        'paye_method': 'epc_qr_onsite', // Payment collected on site via EPC QR
        'updated_at': FieldValue.serverTimestamp(),
      });

      debugPrint('✅ Participant $participantId marked as paid');
    } catch (e) {
      debugPrint('❌ Error marking participant as paid: $e');
      rethrow;
    }
  }

  /// Update payment status for a participant
  /// Used to track payment flow: qr_email_sent, qr_on_site, paid, etc.
  Future<void> updatePaymentStatus({
    required String clubId,
    required String operationId,
    required String participantId,
    required String status,
  }) async {
    try {
      await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .doc(participantId)
          .update({
        'payment_status': status,
        'payment_status_at': FieldValue.serverTimestamp(),
        'updated_at': FieldValue.serverTimestamp(),
      });

      debugPrint('✅ Payment status updated to $status for participant $participantId');
    } catch (e) {
      debugPrint('❌ Error updating payment status: $e');
      rethrow;
    }
  }

  /// Créer une inscription pour un invité (non-membre)
  /// Used by admins/encadrants to add guests to an operation
  Future<void> createGuestInscription({
    required String clubId,
    required String operationId,
    required String operationTitle,
    required String guestPrenom,
    required String guestNom,
    required double prix,
    required String addedByUserId,
    required String addedByUserName,
  }) async {
    try {
      // Generate unique guest ID
      final guestId = 'guest_${DateTime.now().millisecondsSinceEpoch}';

      final inscriptionData = {
        'operation_id': operationId,
        'operation_titre': operationTitle,
        'membre_id': guestId,
        'membre_nom': guestNom,
        'membre_prenom': guestPrenom,
        'prix': prix,
        'paye': false,
        'date_inscription': FieldValue.serverTimestamp(),
        // Guest marker
        'is_guest': true,
        'added_by': addedByUserId,
        'added_by_name': addedByUserName,
        'created_at': FieldValue.serverTimestamp(),
        'updated_at': FieldValue.serverTimestamp(),
      };

      await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .add(inscriptionData);

      debugPrint('✅ Inscription invité créée: $guestPrenom $guestNom → $operationTitle');
    } catch (e) {
      debugPrint('❌ Erreur création inscription invité: $e');
      rethrow;
    }
  }

  /// Stream van alle inscriptions van een gebruiker met bijbehorende Operation data
  /// Uses collectionGroup query to find all inscriptions across all operations
  Stream<List<UserEventRegistration>> getUserRegistrationsStream(String clubId, String userId) {
    return _firestore
        .collectionGroup('inscriptions')
        .where('membre_id', isEqualTo: userId)
        .snapshots()
        .asyncMap((snapshot) async {
          final registrations = <UserEventRegistration>[];

          for (var doc in snapshot.docs) {
            try {
              // Verify this inscription belongs to the correct club
              final path = doc.reference.path;
              if (!path.startsWith('clubs/$clubId/')) continue;

              final participant = ParticipantOperation.fromFirestore(doc);

              // Get parent operation document
              final operationRef = doc.reference.parent.parent;
              if (operationRef == null) continue;

              final operationDoc = await operationRef.get();
              if (!operationDoc.exists) continue;

              final operation = Operation.fromFirestore(operationDoc);

              registrations.add(UserEventRegistration(
                operation: operation,
                participant: participant,
              ));
            } catch (e) {
              debugPrint('⚠️ Erreur parsing registration: $e');
              // Continue with next registration
            }
          }

          // Sort by date (upcoming first)
          registrations.sort((a, b) {
            final dateA = a.operation.dateDebut ?? DateTime(2100);
            final dateB = b.operation.dateDebut ?? DateTime(2100);
            return dateA.compareTo(dateB);
          });

          debugPrint('📋 ${registrations.length} inscriptions chargées pour user $userId');
          return registrations;
        });
  }

  /// Stream van deelnemers die present zijn (voor live scanner lijst)
  /// Returns participants ordered by presentAt descending (newest first)
  Stream<List<ParticipantOperation>> getPresentParticipantsStream(
    String clubId,
    String operationId,
  ) {
    return _firestore
        .collection('clubs/$clubId/operations/$operationId/inscriptions')
        .where('present', isEqualTo: true)
        .snapshots()
        .map((snapshot) {
      final participants = snapshot.docs
          .map((doc) => ParticipantOperation.fromFirestore(doc))
          .toList();
      
      // Sort by presentAt descending (newest first)
      participants.sort((a, b) {
        final aTime = a.presentAt ?? DateTime(2000);
        final bTime = b.presentAt ?? DateTime(2000);
        return bTime.compareTo(aTime);
      });
      
      return participants;
    });
  }

  /// Async variant voor refresh (one-time load)
  Future<List<UserEventRegistration>> getUserRegistrations(String clubId, String userId) async {
    try {
      final snapshot = await _firestore
          .collectionGroup('inscriptions')
          .where('membre_id', isEqualTo: userId)
          .get();

      final registrations = <UserEventRegistration>[];

      for (var doc in snapshot.docs) {
        try {
          // Verify this inscription belongs to the correct club
          final path = doc.reference.path;
          if (!path.startsWith('clubs/$clubId/')) continue;

          final participant = ParticipantOperation.fromFirestore(doc);

          // Get parent operation document
          final operationRef = doc.reference.parent.parent;
          if (operationRef == null) continue;

          final operationDoc = await operationRef.get();
          if (!operationDoc.exists) continue;

          final operation = Operation.fromFirestore(operationDoc);

          registrations.add(UserEventRegistration(
            operation: operation,
            participant: participant,
          ));
        } catch (e) {
          debugPrint('⚠️ Erreur parsing registration: $e');
          // Continue with next registration
        }
      }

      // Sort by date (upcoming first)
      registrations.sort((a, b) {
        final dateA = a.operation.dateDebut ?? DateTime(2100);
        final dateB = b.operation.dateDebut ?? DateTime(2100);
        return dateA.compareTo(dateB);
      });

      debugPrint('📋 ${registrations.length} inscriptions chargées pour user $userId');
      return registrations;
    } catch (e) {
      debugPrint('❌ Erreur chargement inscriptions utilisateur: $e');
      return [];
    }
  }
}
