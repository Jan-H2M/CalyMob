import 'dart:math';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import '../models/operation.dart';
import '../models/member_profile.dart';
import '../models/participant_operation.dart';
import '../models/supplement.dart';
import '../models/tariff.dart';
import '../models/user_event_registration.dart';
import '../utils/tariff_utils.dart';
import 'refund_service.dart';

/// Service de gestion des opérations (événements)
class OperationService {
  final FirebaseFirestore _firestore;

  OperationService({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  /// Remove diacritics for locale-aware sorting (é→e, è→e, ü→u, etc.)
  static String _removeDiacritics(String str) {
    const diacritics =
        'ÀÁÂÃÄÅàáâãäåÒÓÔÕÖØòóôõöøÈÉÊËèéêëÇçÌÍÎÏìíîïÙÚÛÜùúûüÿÑñŠšŽžÐðÝýÞþ';
    const replacements =
        'AAAAAAaaaaaaOOOOOOooooooEEEEeeeeCcIIIIiiiiUUUUuuuuyNnSsZzDdYyTt';
    for (int i = 0; i < diacritics.length; i++) {
      str = str.replaceAll(diacritics[i], replacements[i]);
    }
    return str;
  }

  /// Sort participants by first name (prénom), then last name as tiebreaker
  /// Uses diacritics-insensitive comparison for proper French name sorting
  static void sortParticipantsByName(List<ParticipantOperation> participants) {
    participants.sort((a, b) {
      final aPrenom = _removeDiacritics((a.membrePrenom ?? '').toLowerCase());
      final bPrenom = _removeDiacritics((b.membrePrenom ?? '').toLowerCase());
      final firstNameCompare = aPrenom.compareTo(bPrenom);
      if (firstNameCompare != 0) return firstNameCompare;
      final aNom = _removeDiacritics((a.membreNom ?? '').toLowerCase());
      final bNom = _removeDiacritics((b.membreNom ?? '').toLowerCase());
      return aNom.compareTo(bNom);
    });
  }

  /// Stream des événements ouverts
  Stream<List<Operation>> getOpenEventsStream(String clubId) {
    return _firestore
        .collection('clubs/$clubId/operations')
        .where('type', isEqualTo: 'evenement')
        .where('statut', isEqualTo: 'ouvert')
        .orderBy('date_debut', descending: false)
        .snapshots()
        .map((snapshot) {
      final operations =
          snapshot.docs.map((doc) => Operation.fromFirestore(doc)).toList();

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

      debugPrint(
          '👥 ${snapshot.size} participants pour opération $operationId');
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
    Tariff? selectedTariff,
    List<SelectedSupplement>? selectedSupplements,
    double? supplementTotal,
  }) async {
    try {
      // Vérifier si déjà inscrit
      final alreadyRegistered =
          await isUserRegistered(clubId, operationId, userId);
      if (alreadyRegistered) {
        throw Exception('Vous êtes déjà inscrit à cet événement');
      }

      // Vérifier capacité
      final currentCount = await countParticipants(clubId, operationId);
      if (operation.capaciteMax != null &&
          currentCount >= operation.capaciteMax!) {
        throw Exception('Événement complet (${operation.capaciteMax} places)');
      }

      // Calculer le prix basé sur la fonction du membre
      double prix;
      Tariff? appliedTariff = selectedTariff;
      if (appliedTariff != null) {
        prix = appliedTariff.price;
      } else if (memberProfile != null) {
        prix = TariffUtils.computeRegistrationPrice(
          operation: operation,
          profile: memberProfile,
        );
        appliedTariff = _findTariffByPrice(operation, prix);
        debugPrint(
            '💰 Prix calculé: $prix€ pour fonction ${TariffUtils.getFunctionLabel(memberProfile)}');
      } else {
        // Fallback si pas de profil
        prix = operation.prixMembre ?? 0.0;
        appliedTariff = _findTariffByPrice(operation, prix);
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
        tariffId: appliedTariff?.id,
        tariffLabel: appliedTariff?.label,
        tariffSelectedBy: selectedTariff != null ? 'member' : null,
        tariffValidationStatus: selectedTariff?.requiresAdminValidation == true
            ? 'pending'
            : 'accepted',
        installmentPayments: _buildInstallmentPayments(
          operation,
          appliedTariff,
          extraAmountOnFirstOpenInstallment: supplementTotal ?? 0,
        ),
      );

      // Sauvegarder dans Firestore (subcollection under operation)
      await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .add(participant.toFirestore());

      final totalPrix = prix + (supplementTotal ?? 0);
      debugPrint(
          '✅ Inscription réussie: $userName → ${operation.titre} (total: $totalPrix€)');
    } catch (e) {
      debugPrint('❌ Erreur inscription: $e');
      rethrow;
    }
  }

  Tariff? _findTariffByPrice(Operation operation, double price) {
    if (operation.eventTariffs.isEmpty) return null;
    return operation.eventTariffs.cast<Tariff?>().firstWhere(
          (t) =>
              t != null && !t.isGuestTariff && (t.price - price).abs() < 0.01,
          orElse: () => null,
        );
  }

  Map<String, InstallmentPayment> _buildInstallmentPayments(
    Operation operation,
    Tariff? tariff, {
    double extraAmountOnFirstOpenInstallment = 0,
  }) {
    if (!operation.paymentPlanEnabled ||
        operation.paymentInstallments.isEmpty) {
      return const {};
    }

    final result = <String, InstallmentPayment>{};
    var extraAmountApplied = extraAmountOnFirstOpenInstallment <= 0;
    for (final installment in operation.paymentInstallments) {
      var amount = tariff?.installmentAmounts[installment.id] ?? 0.0;
      if (!extraAmountApplied && amount > 0) {
        amount += extraAmountOnFirstOpenInstallment;
        extraAmountApplied = true;
      }
      result[installment.id] = InstallmentPayment(
        status: amount > 0 ? 'unpaid' : 'waived',
        amountDue: amount,
      );
    }
    if (!extraAmountApplied && result.isNotEmpty) {
      final firstId = operation.paymentInstallments.first.id;
      final current = result[firstId];
      result[firstId] = InstallmentPayment(
        status: 'unpaid',
        amountDue:
            (current?.amountDue ?? 0) + extraAmountOnFirstOpenInstallment,
      );
    }
    return result;
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

  /// Supprime tous les invités liés à une inscription parente.
  /// Utilisé quand un membre se désinscrit et veut emmener ses invités.
  Future<int> deleteGuestsForParentInscription({
    required String clubId,
    required String operationId,
    required String parentInscriptionId,
  }) async {
    try {
      final snapshot = await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .where('parent_inscription_id', isEqualTo: parentInscriptionId)
          .get();

      final batch = _firestore.batch();
      for (final doc in snapshot.docs) {
        batch.delete(doc.reference);
      }
      await batch.commit();
      debugPrint('✅ ${snapshot.docs.length} invité(s) supprimé(s)');
      return snapshot.docs.length;
    } catch (e) {
      debugPrint('❌ Erreur deleteGuestsForParentInscription: $e');
      rethrow;
    }
  }

  /// Transfère les invités liés à une inscription parente vers
  /// l'organisateur de l'événement. Utilisé quand un membre se
  /// désinscrit mais veut que ses invités restent inscrits.
  /// Le nouveau parent reçoit la facture groupée.
  ///
  /// Si [organisateurInscriptionId] est null, les invités deviennent
  /// orphelins (parent_inscription_id mis à null) — ils restent dans
  /// la liste mais le paiement doit être géré séparément.
  Future<int> transferGuestsToParent({
    required String clubId,
    required String operationId,
    required String oldParentInscriptionId,
    required String? newParentInscriptionId,
    required String? newParentUserId,
    required String? newParentDisplayName,
  }) async {
    try {
      final snapshot = await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .where('parent_inscription_id', isEqualTo: oldParentInscriptionId)
          .get();

      final batch = _firestore.batch();
      for (final doc in snapshot.docs) {
        batch.update(doc.reference, {
          'parent_inscription_id': newParentInscriptionId,
          if (newParentUserId != null) 'added_by': newParentUserId,
          if (newParentDisplayName != null)
            'added_by_name': newParentDisplayName,
        });
      }
      await batch.commit();
      debugPrint(
          '✅ ${snapshot.docs.length} invité(s) transféré(s) vers $newParentInscriptionId');
      return snapshot.docs.length;
    } catch (e) {
      debugPrint('❌ Erreur transferGuestsToParent: $e');
      rethrow;
    }
  }

  /// Trouve l'inscription d'un utilisateur (membre) à un événement.
  /// Utile pour récupérer l'inscription de l'organisateur lors d'un
  /// transfert d'invités.
  Future<ParticipantOperation?> findInscriptionForUser({
    required String clubId,
    required String operationId,
    required String userId,
  }) async {
    try {
      final snapshot = await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .where('membre_id', isEqualTo: userId)
          .limit(1)
          .get();
      if (snapshot.docs.isEmpty) return null;
      return ParticipantOperation.fromFirestore(snapshot.docs.first);
    } catch (e) {
      debugPrint('❌ Erreur findInscriptionForUser: $e');
      return null;
    }
  }

  /// Update supplements on an existing inscription (F3.6 edit inscription)
  Future<void> updateInscriptionSupplements({
    required String clubId,
    required String operationId,
    required String inscriptionDocId,
    required List<SelectedSupplement> selectedSupplements,
    required double supplementTotal,
  }) async {
    await _firestore
        .collection('clubs/$clubId/operations/$operationId/inscriptions')
        .doc(inscriptionDocId)
        .update({
      'selected_supplements':
          selectedSupplements.map((s) => s.toMap()).toList(),
      'supplement_total': supplementTotal,
      'updated_at': FieldValue.serverTimestamp(),
    });
  }

  /// Obtenir les participants d'une opération (one-time read)
  /// Uses subcollection: clubs/{clubId}/operations/{operationId}/inscriptions
  Future<List<ParticipantOperation>> getParticipants(
    String clubId,
    String operationId,
  ) async {
    try {
      debugPrint(
          '🔍 Recherche participants dans subcollection inscriptions pour operation_id: $operationId');

      final snapshot = await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .get();

      final participants = snapshot.docs
          .map((doc) => ParticipantOperation.fromFirestore(doc))
          .toList();

      // Sort by first name (prénom), then last name — diacritics-insensitive
      sortParticipantsByName(participants);

      debugPrint(
          '👥 ${participants.length} participants chargés pour $operationId');
      return participants;
    } catch (e) {
      debugPrint('❌ Erreur chargement participants: $e');
      return [];
    }
  }

  /// Stream des participants d'une opération (real-time updates)
  /// Listens to changes in inscriptions subcollection for live payment status updates
  Stream<List<ParticipantOperation>> getParticipantsStream(
    String clubId,
    String operationId,
  ) {
    return _firestore
        .collection('clubs/$clubId/operations/$operationId/inscriptions')
        .snapshots()
        .map((snapshot) {
      final participants = snapshot.docs
          .map((doc) => ParticipantOperation.fromFirestore(doc))
          .toList();

      // Sort by first name (prénom), then last name — diacritics-insensitive
      sortParticipantsByName(participants);

      debugPrint(
          '👥 [Stream] ${participants.length} participants mis à jour pour $operationId');
      return participants;
    });
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

      debugPrint(
          '✅ Membre $memberId marqué présent pour opération $operationId');
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
      // Load the operation to compute the correct tariff for this member.
      // Falling back to 0 silently leaves treasurer cleanup work — better
      // to write the proper price upfront whenever we can.
      double prix = 0.0;
      try {
        final opSnap = await _firestore
            .collection('clubs/$clubId/operations')
            .doc(operationId)
            .get();
        if (opSnap.exists) {
          final operation = Operation.fromFirestore(opSnap);
          prix = TariffUtils.computeRegistrationPrice(
            operation: operation,
            profile: member,
          );
          debugPrint('💰 Walk-in prix calculé: $prix€ pour ${member.fullName}');
        } else {
          debugPrint('⚠️ Walk-in: opération $operationId introuvable, prix=0');
        }
      } catch (e) {
        // Don't block the walk-in if tariff lookup fails — better to have
        // the inscription saved with prix=0 than to refuse the scan.
        debugPrint('⚠️ Walk-in: échec calcul tarif ($e), prix=0');
      }

      // Create inscription with present=true
      final inscriptionData = {
        'operation_id': operationId,
        'operation_titre': operationTitle,
        'membre_id': member.id,
        'membre_nom': member.nom,
        'membre_prenom': member.prenom,
        'prix': prix,
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

      debugPrint(
          '✅ Inscription walk-in créée: ${member.fullName} → $operationTitle ($prix€)');
    } catch (e) {
      debugPrint('❌ Erreur création inscription walk-in: $e');
      rethrow;
    }
  }

  /// Désinscrire un membre après un scan (correction d'erreur).
  ///
  /// Stratégie :
  /// - Si l'inscription est un walk-in créé par le scanner ET non payée → on
  ///   supprime complètement l'inscription (elle n'existait que parce qu'on
  ///   a scanné le membre).
  /// - Sinon (inscription pré-existante ou déjà payée) → on réinitialise
  ///   uniquement les champs de présence (`present`, `present_at`,
  ///   `present_by`, `present_by_name`). L'inscription elle-même reste.
  ///
  /// Retourne un [UnmarkPresentResult] qui permet de restaurer l'état
  /// précédent (undo) pendant ~5 secondes côté UI.
  Future<UnmarkPresentResult> unmarkAsPresent({
    required String clubId,
    required String operationId,
    required String memberId,
  }) async {
    try {
      final snapshot = await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .where('membre_id', isEqualTo: memberId)
          .get();

      if (snapshot.docs.isEmpty) {
        throw Exception('Inscription non trouvée');
      }

      final doc = snapshot.docs.first;
      final data = doc.data();
      final isWalkIn = data['walk_in'] == true;
      final isPaid = data['paye'] == true;

      if (isWalkIn && !isPaid) {
        // Safe to delete - inscription only existed because of the scan
        await doc.reference.delete();
        debugPrint('✅ Walk-in inscription supprimée: member $memberId');
        return UnmarkPresentResult(
          deletedInscription: true,
          inscriptionId: doc.id,
          previousData: Map<String, dynamic>.from(data),
        );
      }

      // Keep inscription, just reset present fields
      final previousPresent = data['present'];
      final previousPresentAt = data['present_at'];
      final previousPresentBy = data['present_by'];
      final previousPresentByName = data['present_by_name'];

      await doc.reference.update({
        'present': false,
        'present_at': FieldValue.delete(),
        'present_by': FieldValue.delete(),
        'present_by_name': FieldValue.delete(),
        'updated_at': FieldValue.serverTimestamp(),
      });

      debugPrint(
          '✅ Présence annulée pour member $memberId (inscription conservée)');
      return UnmarkPresentResult(
        deletedInscription: false,
        inscriptionId: doc.id,
        previousData: {
          'present': previousPresent,
          'present_at': previousPresentAt,
          'present_by': previousPresentBy,
          'present_by_name': previousPresentByName,
        },
      );
    } catch (e) {
      debugPrint('❌ Erreur annulation présence: $e');
      rethrow;
    }
  }

  /// Restaure l'état précédent après un [unmarkAsPresent] — utilisé pour
  /// l'action "Annuler" dans le snackbar après désinscription.
  Future<void> restoreFromUnmark({
    required String clubId,
    required String operationId,
    required UnmarkPresentResult result,
  }) async {
    try {
      final inscriptionsRef = _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions');

      if (result.deletedInscription) {
        // Re-create the deleted walk-in document with the same ID
        await inscriptionsRef
            .doc(result.inscriptionId)
            .set(result.previousData);
        debugPrint('↩️ Walk-in inscription restaurée: ${result.inscriptionId}');
      } else {
        // Restore the present fields on the existing inscription
        final update = <String, dynamic>{
          'present': result.previousData['present'] ?? true,
          'updated_at': FieldValue.serverTimestamp(),
        };
        if (result.previousData['present_at'] != null) {
          update['present_at'] = result.previousData['present_at'];
        }
        if (result.previousData['present_by'] != null) {
          update['present_by'] = result.previousData['present_by'];
        }
        if (result.previousData['present_by_name'] != null) {
          update['present_by_name'] = result.previousData['present_by_name'];
        }
        await inscriptionsRef.doc(result.inscriptionId).update(update);
        debugPrint(
            '↩️ Présence restaurée pour inscription ${result.inscriptionId}');
      }
    } catch (e) {
      debugPrint('❌ Erreur restauration: $e');
      rethrow;
    }
  }

  /// Mark a participant's payment as received (by organizer on site)
  /// Sets paye=true with timestamp, updates payment_status for data consistency
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
        'payment_status':
            'paid', // Sync payment_status with paye for data consistency
        'date_paiement': FieldValue.serverTimestamp(),
        'updated_at': FieldValue.serverTimestamp(),
      });

      debugPrint('✅ Participant $participantId marked as paid');
    } catch (e) {
      debugPrint('❌ Error marking participant as paid: $e');
      rethrow;
    }
  }

  /// Marque UNE tranche comme payée (encaissement sur place par
  /// l'organisateur). Installment-bewust alternatief voor
  /// [markParticipantAsPaid]: zet `paye` pas op true als ALLE tranches
  /// gesloten zijn (paid/waived), zodat een QR voor Acompte 2 nooit het
  /// Solde mee afsluit (cf. over-afsluit-bug 2026-06-24).
  Future<void> markInstallmentAsPaid({
    required String clubId,
    required String operationId,
    required String participantId,
    required String installmentId,
  }) async {
    final ref = _firestore
        .collection('clubs/$clubId/operations/$operationId/inscriptions')
        .doc(participantId);

    await _firestore.runTransaction((tx) async {
      final snap = await tx.get(ref);
      if (!snap.exists) {
        throw Exception('Inscription introuvable');
      }
      final data = snap.data() as Map<String, dynamic>;
      final payments = Map<String, dynamic>.from(
          (data['installment_payments'] as Map<String, dynamic>?) ?? {});
      final cur =
          Map<String, dynamic>.from(payments[installmentId] as Map? ?? {});
      if (cur['status'] == 'paid' || cur['status'] == 'waived') {
        return; // déjà réglée — idempotent
      }

      cur['status'] = 'paid';
      cur['amount_paid'] = (cur['amount_due'] as num?) ?? 0;
      cur['paid_at'] = Timestamp.now();
      payments[installmentId] = cur;

      final allClosed = payments.isNotEmpty &&
          payments.values.every((p) =>
              p is Map && (p['status'] == 'paid' || p['status'] == 'waived'));

      tx.update(ref, {
        'installment_payments.$installmentId.status': 'paid',
        'installment_payments.$installmentId.amount_paid':
            (cur['amount_due'] as num?) ?? 0,
        'installment_payments.$installmentId.paid_at':
            FieldValue.serverTimestamp(),
        if (allClosed) ...{
          'paye': true,
          'paye_at': FieldValue.serverTimestamp(),
          'paye_method': 'epc_qr_onsite',
          'payment_status': 'paid',
          'date_paiement': FieldValue.serverTimestamp(),
        },
        'updated_at': FieldValue.serverTimestamp(),
      });
    });

    debugPrint(
        '✅ Tranche $installmentId payée pour $participantId (installment-aware)');
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

      debugPrint(
          '✅ Payment status updated to $status for participant $participantId');
    } catch (e) {
      debugPrint('❌ Error updating payment status: $e');
      rethrow;
    }
  }

  /// Créer une inscription pour un invité (non-membre)
  ///
  /// Used by:
  ///  - admins/encadrants from the legacy flow (no parent — guest stands alone)
  ///  - members from the new "allow_guests" flow (parentInscriptionId set —
  ///    guest is linked to the inviting member's own inscription so payment
  ///    can be aggregated into a single QR)
  Future<void> createGuestInscription({
    required String clubId,
    required String operationId,
    required String operationTitle,
    required String guestPrenom,
    required String guestNom,
    required double prix,
    required String addedByUserId,
    required String addedByUserName,

    /// When set, links this guest to the inviting member's own inscription.
    /// Used by the member-driven flow in CalyMob (allow_guests=true events).
    String? parentInscriptionId,

    /// ID of the Tariff entry from operation.event_tariffs[] used to compute
    /// this guest's price ("Invité adulte" / "Invité enfant" / etc.).
    String? tariffId,

    /// Optional supplements selected for this guest (same supplements list
    /// the inviting member sees). Stored exactly like a member's supplements
    /// so totalPrix = prix + supplement_total works automatically and the
    /// parent's aggregated QR includes them.
    List<SelectedSupplement>? selectedSupplements,
    double? supplementTotal,
  }) async {
    try {
      // Generate unique guest ID (timestamp + random suffix to avoid collisions)
      final random =
          (DateTime.now().microsecond * 1000 + DateTime.now().millisecond)
              .toString()
              .padLeft(6, '0');
      final guestId = 'guest_${DateTime.now().millisecondsSinceEpoch}_$random';

      // Plan de paiement: un invité DOIT avoir ses installment_payments,
      // sinon il est invisible pour les QR de tranche et ne sera jamais
      // facturé (cas Louis Longrée, Gozo). Si le tarif invité est connu on
      // reprend ses montants; sinon tout le prix va sur la 1re tranche.
      Map<String, InstallmentPayment> installments = const {};
      final opSnap = await _firestore
          .collection('clubs/$clubId/operations')
          .doc(operationId)
          .get();
      if (opSnap.exists) {
        final operation = Operation.fromFirestore(opSnap);
        if (operation.paymentPlanEnabled &&
            operation.paymentInstallments.isNotEmpty) {
          Tariff? guestTariff;
          if (tariffId != null) {
            guestTariff = operation.eventTariffs
                .cast<Tariff?>()
                .firstWhere((t) => t?.id == tariffId, orElse: () => null);
          }
          final tariffSum = guestTariff?.installmentAmounts.values
                  .fold<double>(0, (s, v) => s + v) ??
              0;
          if (guestTariff != null && (tariffSum - prix).abs() < 0.01) {
            installments = _buildInstallmentPayments(
              operation,
              guestTariff,
              extraAmountOnFirstOpenInstallment: supplementTotal ?? 0,
            );
          } else {
            // Prix custom (pas de tarif ou montant divergent): tout sur la
            // première tranche, les autres 'waived' à 0.
            final total = prix + (supplementTotal ?? 0);
            installments = {
              for (var i = 0; i < operation.paymentInstallments.length; i++)
                operation.paymentInstallments[i].id: InstallmentPayment(
                  status: i == 0 ? 'unpaid' : 'waived',
                  amountDue: i == 0 ? total : 0,
                ),
            };
          }
        }
      }

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
        if (parentInscriptionId != null)
          'parent_inscription_id': parentInscriptionId,
        if (tariffId != null) 'tariff_id': tariffId,
        // Guest-level supplements (optional). Mirrors member's schema.
        // IMPORTANT: must be `selected_supplements` (with underscore prefix) —
        // that's the canonical field name read by ParticipantOperation,
        // CalyCompta's OperationDetailView, and the edit/update paths in
        // updateMyInscription / updateGuestInscription. Writing plain
        // `supplements` here would make the choice invisible everywhere.
        if (selectedSupplements != null && selectedSupplements.isNotEmpty)
          'selected_supplements': selectedSupplements
              .map((s) => {
                    'id': s.id,
                    'name': s.name,
                    'price': s.price,
                  })
              .toList(),
        if (supplementTotal != null && supplementTotal > 0)
          'supplement_total': supplementTotal,
        if (installments.isNotEmpty)
          'installment_payments': installments.map(
            (key, value) => MapEntry(key, value.toMap()),
          ),
        'created_at': FieldValue.serverTimestamp(),
        'updated_at': FieldValue.serverTimestamp(),
      };

      await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .add(inscriptionData);

      debugPrint(
          '✅ Inscription invité créée: $guestPrenom $guestNom → $operationTitle (parent=$parentInscriptionId, tariff=$tariffId, supps=${selectedSupplements?.length ?? 0})');
    } catch (e) {
      debugPrint('❌ Erreur création inscription invité: $e');
      rethrow;
    }
  }

  /// Stream van alle inscriptions van een gebruiker met bijbehorende Operation data
  /// Uses collectionGroup query to find all inscriptions across all operations
  Stream<List<UserEventRegistration>> getUserRegistrationsStream(
      String clubId, String userId) {
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

      debugPrint(
          '📋 ${registrations.length} inscriptions chargées pour user $userId');
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

  // ============================================================
  // EVENT CREATION & UPDATE
  // ============================================================

  /// Mettre à jour une opération/événement dans Firestore
  Future<void> updateOperation({
    required String clubId,
    required String operationId,
    required Map<String, dynamic> data,
  }) async {
    try {
      await _firestore
          .collection('clubs/$clubId/operations')
          .doc(operationId)
          .update({
        ...data,
        'updated_at': FieldValue.serverTimestamp(),
      });
      debugPrint('✅ Opération mise à jour: $operationId');
    } catch (e) {
      debugPrint('❌ Erreur mise à jour opération: $e');
      rethrow;
    }
  }

  /// Supprimer une opération et ses sous-collections connues.
  ///
  /// Firestore ne supprime pas automatiquement les sous-collections quand le
  /// document parent est supprimé; on nettoie donc les données liées avant de
  /// retirer l'événement lui-même.
  Future<void> deleteOperation({
    required String clubId,
    required String operationId,
  }) async {
    try {
      final operationRef =
          _firestore.collection('clubs/$clubId/operations').doc(operationId);

      for (final subcollection in const [
        'inscriptions',
        'messages',
        'palanquees',
      ]) {
        await _deleteCollection(operationRef.collection(subcollection));
      }

      await operationRef.delete();
      debugPrint('✅ Opération supprimée: $operationId');
    } catch (e) {
      debugPrint('❌ Erreur suppression opération: $e');
      rethrow;
    }
  }

  Future<void> _deleteCollection(CollectionReference collection) async {
    const batchSize = 450;

    while (true) {
      final snapshot = await collection.limit(batchSize).get();
      if (snapshot.docs.isEmpty) return;

      final batch = _firestore.batch();
      for (final doc in snapshot.docs) {
        batch.delete(doc.reference);
      }
      await batch.commit();
    }
  }

  /// Créer une opération/événement dans Firestore
  /// Returns the document ID of the created operation
  Future<String> createOperation({
    required String clubId,
    required Map<String, dynamic> data,
  }) async {
    try {
      final docRef =
          await _firestore.collection('clubs/$clubId/operations').add({
        ...data,
        'created_at': FieldValue.serverTimestamp(),
        'updated_at': FieldValue.serverTimestamp(),
      });

      debugPrint('✅ Opération créée: ${docRef.id} - ${data['titre']}');
      return docRef.id;
    } catch (e) {
      debugPrint('❌ Erreur création opération: $e');
      rethrow;
    }
  }

  /// Generate a unique event number for bank reconciliation
  /// Format: PXXXX for dive events (plongee), SXXXX for other events (sortie)
  /// Uses base-26 letter encoding (A-Z, 4 digits)
  /// Examples: PAAAB (dive #1), PAAAG (dive #6), SAAAE (sortie #4)
  Future<String> generateEventNumber(String clubId, bool isDiveEvent) async {
    final prefix = isDiveEvent ? 'P' : 'S';

    try {
      // Query all operations with event_number in this prefix range
      final snapshot = await _firestore
          .collection('clubs/$clubId/operations')
          .where('event_number', isGreaterThanOrEqualTo: '${prefix}AAAA')
          .where('event_number', isLessThanOrEqualTo: '${prefix}ZZZZ')
          .orderBy('event_number', descending: true)
          .limit(1)
          .get();

      if (snapshot.docs.isEmpty) {
        // First event of this type - start at 1 (AAAB)
        return prefix + _numberToLetterCode(1);
      }

      // Get the highest event_number and increment
      final lastNumber = snapshot.docs.first.data()['event_number'] as String;
      final lastCode = lastNumber.substring(1); // Remove prefix
      final nextNumber = _letterCodeToNumber(lastCode) + 1;

      return prefix + _numberToLetterCode(nextNumber);
    } catch (e) {
      debugPrint('⚠️ Error generating event number, using fallback: $e');
      // Fallback: timestamp-based
      final ts =
          DateTime.now().millisecondsSinceEpoch % 456976; // max for 4 letters
      return prefix + _numberToLetterCode(ts);
    }
  }

  /// Convert number to 4-letter base-26 code (AAAA = 0, AAAB = 1, etc.)
  static String _numberToLetterCode(int number) {
    final d = number % 26;
    final c = (number ~/ 26) % 26;
    final b = (number ~/ (26 * 26)) % 26;
    final a = (number ~/ (26 * 26 * 26)) % 26;

    return String.fromCharCodes([
      65 + a, // A=65
      65 + b,
      65 + c,
      65 + d,
    ]);
  }

  /// Convert 4-letter base-26 code back to number
  static int _letterCodeToNumber(String code) {
    if (code.length != 4) return 0;
    return (code.codeUnitAt(0) - 65) * 26 * 26 * 26 +
        (code.codeUnitAt(1) - 65) * 26 * 26 +
        (code.codeUnitAt(2) - 65) * 26 +
        (code.codeUnitAt(3) - 65);
  }

  /// Copy tariffs from a location with new unique IDs
  static List<Map<String, dynamic>> copyTariffsFromLocation(
      List<Tariff> locationTariffs) {
    final ts = DateTime.now().millisecondsSinceEpoch;
    return locationTariffs.asMap().entries.map((entry) {
      final index = entry.key;
      final tariff = entry.value;
      return {
        'id': 'tariff_${ts}_$index',
        'label': tariff.label,
        'category': tariff.category,
        'price': tariff.price,
        'is_default': tariff.isDefault,
        'display_order': tariff.displayOrder,
      };
    }).toList();
  }

  /// Compute budget prévisionnel from tariffs and capacity
  static double computeBudgetPrevu(List<Tariff> tariffs, int? capaciteMax) {
    if (tariffs.isEmpty || capaciteMax == null || capaciteMax <= 0) return 0;
    final totalPrice = tariffs.fold<double>(0, (total, t) => total + t.price);
    final avgPrice = totalPrice / tariffs.length;
    return (avgPrice * capaciteMax * 100).roundToDouble() / 100;
  }

  /// Async variant voor refresh (one-time load)
  Future<List<UserEventRegistration>> getUserRegistrations(
      String clubId, String userId) async {
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

      debugPrint(
          '📋 ${registrations.length} inscriptions chargées pour user $userId');
      return registrations;
    } catch (e) {
      debugPrint('❌ Erreur chargement inscriptions utilisateur: $e');
      return [];
    }
  }

  /// Récupère les opérations (évènements) auxquelles ce membre a été marqué
  /// présent dans les [days] derniers jours, triées par date descendante.
  ///
  /// Utilisé par le picker de self-declaration (CalyMob "Je l'ai fait"-flow).
  /// Filtre sur `present == true` pour ne garder que les évènements où le
  /// membre était effectivement présent (pas seulement inscrit).
  Future<List<Operation>> getRecentAttendedOperations({
    required String clubId,
    required String memberId,
    int days = 30,
  }) async {
    try {
      final now = DateTime.now();
      final cutoff = now.subtract(Duration(days: days));

      // 1. Load all events starting in the last N days
      final snapshot = await _firestore
          .collection('clubs/$clubId/operations')
          .where('type', isEqualTo: 'evenement')
          .where('date_debut',
              isGreaterThanOrEqualTo: Timestamp.fromDate(cutoff))
          .where('date_debut', isLessThanOrEqualTo: Timestamp.fromDate(now))
          .orderBy('date_debut', descending: true)
          .get();

      final operations =
          snapshot.docs.map((doc) => Operation.fromFirestore(doc)).toList();

      if (operations.isEmpty) {
        debugPrint('📅 Aucun évènement dans les $days derniers jours');
        return [];
      }

      // 2. For each operation check presence in parallel
      final checks = await Future.wait(
        operations.map((op) async {
          try {
            final inscriptionSnap = await _firestore
                .collection('clubs/$clubId/operations/${op.id}/inscriptions')
                .where('membre_id', isEqualTo: memberId)
                .where('present', isEqualTo: true)
                .limit(1)
                .get();
            return inscriptionSnap.docs.isNotEmpty ? op : null;
          } catch (_) {
            // Fallback if composite index missing: filter client-side
            final all = await _firestore
                .collection('clubs/$clubId/operations/${op.id}/inscriptions')
                .where('membre_id', isEqualTo: memberId)
                .limit(1)
                .get();
            if (all.docs.isEmpty) return null;
            return all.docs.first.data()['present'] == true ? op : null;
          }
        }),
      );

      final attended = checks.whereType<Operation>().toList();
      debugPrint(
          '📅 ${attended.length}/${operations.length} évènements attendus par $memberId');
      return attended;
    } catch (e) {
      debugPrint('❌ Erreur getRecentAttendedOperations: $e');
      return [];
    }
  }

  // ============================================================
  // INSCRIPTION EDITING — updateMyInscription, updateGuestInscription, removeOneGuest
  // ============================================================

  /// Update the user's own inscription (supplements, guests, delivery address).
  ///
  /// Uses a Firestore batch for atomic writes:
  /// 1. Update parent inscription doc (supplements, total, delivery address)
  /// 2. Upsert new guest inscriptions (GuestUpdate without inscriptionId)
  /// 3. Update existing guest inscriptions (GuestUpdate with inscriptionId)
  /// 4. Delete guest inscriptions (guestIdsToRemove)
  /// 5. Write edit_history entries
  ///
  /// If the price decreases AND the inscription was paid, calls
  /// [RefundService.createInscriptionRefund] after batch commit with an
  /// idempotency key to prevent duplicate refund requests.
  ///
  /// Returns the delta (oldTotal - newTotal). Positive means price decreased
  /// (refund may be needed), negative means price increased.
  /// [forceRefundClaim]: when true, a refund demande is created even if
  /// the parent inscription is not yet marked as paid (`paye=false`).
  /// Used for the "déjà payé, paiement pas encore importé" scenario
  /// where the member has actually paid via bank transfer but the
  /// transaction hasn't been imported/matched yet. The resulting demande
  /// is created with status `a_verifier_paiement` so the admin validates
  /// it against the bank statement. When false (default), the legacy
  /// behaviour applies: refund only when paye=true.
  Future<double> updateMyInscription({
    required String clubId,
    required String operationId,
    required String inscriptionId,
    required List<SelectedSupplement> selectedSupplements,
    required double supplementTotal,
    List<GuestUpdate>? guests,
    List<String>? guestIdsToRemove,
    String? deliveryAddress,
    bool forceRefundClaim = false,
  }) async {
    // Read operation to check deadline
    final operationRef =
        _firestore.collection('clubs/$clubId/operations').doc(operationId);
    final operationSnap = await operationRef.get();
    if (!operationSnap.exists) {
      throw Exception('Opération introuvable');
    }
    final operation = Operation.fromFirestore(operationSnap);
    if (operation.effectiveDeadline != null &&
        DateTime.now().isAfter(operation.effectiveDeadline!)) {
      throw Exception('Le délai de modification est dépassé');
    }

    // Read existing guests BEFORE batch writes
    final existingGuestsSnap = await _firestore
        .collection('clubs/$clubId/operations/$operationId/inscriptions')
        .where('parent_inscription_id', isEqualTo: inscriptionId)
        .get();
    double oldGuestsTotal = 0;
    for (final guestDoc in existingGuestsSnap.docs) {
      final g = guestDoc.data();
      oldGuestsTotal +=
          (g['prix'] ?? 0).toDouble() + (g['supplement_total'] ?? 0).toDouble();
    }

    double newGuestsTotal = 0;
    if (guests != null) {
      for (final guest in guests) {
        newGuestsTotal += guest.prix + guest.supplementTotal;
      }
    }

    final batch = _firestore.batch();

    try {
      // 1. Read existing inscription
      final inscriptionRef = _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .doc(inscriptionId);
      final inscriptionSnap = await inscriptionRef.get();

      if (!inscriptionSnap.exists) {
        throw Exception('Inscription non trouvée');
      }

      final existingData = inscriptionSnap.data()!;
      final existingSupplements = existingData['selected_supplements'] ?? [];
      final existingSupplementTotal =
          (existingData['supplement_total'] ?? 0.0).toDouble();
      final oldTotal = (existingData['prix'] ?? 0.0).toDouble() +
          existingSupplementTotal +
          oldGuestsTotal;
      final newTotal = (existingData['prix'] ?? 0.0).toDouble() +
          supplementTotal +
          newGuestsTotal;
      final isPaid = existingData['paye'] ?? false;

      // 2. Update parent inscription
      final updateData = <String, dynamic>{
        'selected_supplements':
            selectedSupplements.map((s) => s.toMap()).toList(),
        'supplement_total': supplementTotal,
        'updated_at': FieldValue.serverTimestamp(),
      };
      if (deliveryAddress != null) {
        updateData['delivery_address'] = deliveryAddress;
      }
      batch.update(inscriptionRef, updateData);

      // 3. Handle guest updates (upsert new + update existing)
      final addedGuestIds = <String>[];
      if (guests != null && guests.isNotEmpty) {
        final inscriptionsRef = _firestore
            .collection('clubs/$clubId/operations/$operationId/inscriptions');

        for (final guest in guests) {
          final now = DateTime.now();
          final guestId = guest.inscriptionId ??
              'guest_${now.millisecondsSinceEpoch}_${Random().nextInt(99999).toString().padLeft(5, '0')}';

          if (guest.inscriptionId == null) {
            // New guest — create document
            final guestData = {
              'operation_id': operationId,
              'membre_id': guestId,
              'membre_nom': guest.nom,
              'membre_prenom': guest.prenom,
              'prix': guest.prix,
              'paye': false,
              'date_inscription': FieldValue.serverTimestamp(),
              'is_guest': true,
              'selected_supplements':
                  guest.selectedSupplements.map((s) => s.toMap()).toList(),
              'supplement_total': guest.supplementTotal,
              'parent_inscription_id': inscriptionId,
              'added_by': existingData['membre_id'],
              'added_by_name':
                  '${existingData['membre_prenom'] ?? ''} ${existingData['membre_nom'] ?? ''}'
                      .trim(),
              if (guest.tariffId != null) 'tariff_id': guest.tariffId,
              'created_at': FieldValue.serverTimestamp(),
              'updated_at': FieldValue.serverTimestamp(),
            };
            final newGuestRef = inscriptionsRef.doc(guestId);
            batch.set(newGuestRef, guestData);
            addedGuestIds.add(guestId);
          } else {
            // Existing guest — update
            batch.update(inscriptionsRef.doc(guest.inscriptionId!), {
              'membre_nom': guest.nom,
              'membre_prenom': guest.prenom,
              'prix': guest.prix,
              'selected_supplements':
                  guest.selectedSupplements.map((s) => s.toMap()).toList(),
              'supplement_total': guest.supplementTotal,
              if (guest.tariffId != null) 'tariff_id': guest.tariffId,
              'updated_at': FieldValue.serverTimestamp(),
            });
          }
        }
      }

      // 4. Handle guest removals
      if (guestIdsToRemove != null && guestIdsToRemove.isNotEmpty) {
        final inscriptionsRef = _firestore
            .collection('clubs/$clubId/operations/$operationId/inscriptions');
        for (final guestId in guestIdsToRemove) {
          batch.delete(inscriptionsRef.doc(guestId));
        }
      }

      // 5. Write edit_history entry
      final editHistoryRef = inscriptionRef.collection('edit_history').doc();
      batch.set(editHistoryRef, {
        'action': 'inscription_updated',
        'inscription_id': inscriptionId,
        'timestamp': FieldValue.serverTimestamp(),
        'previous_supplements': existingSupplements,
        'new_supplements': selectedSupplements.map((s) => s.toMap()).toList(),
        'previous_total': existingSupplementTotal,
        'new_total': supplementTotal,
        'guests_added': addedGuestIds,
        'guests_removed': guestIdsToRemove ?? [],
      });

      // Commit batch
      await batch.commit();

      // 6. Handle refund if price decreased.
      //    Trigger condition: delta > 0 AND (parent already paid OR the
      //    user explicitly claimed an already-paid-but-not-yet-imported
      //    payment via [forceRefundClaim]). In the latter case the CF
      //    sets statut='a_verifier_paiement' so the admin can validate.
      final delta = oldTotal - newTotal;
      final unverifiedPayment = !isPaid && forceRefundClaim;
      if (delta > 0 && (isPaid || forceRefundClaim)) {
        // Fire-and-forget: log but don't block the UI on refund creation
        try {
          final refundService = RefundService();
          final editSessionId = 'edit_${inscriptionId}_$newTotal';
          // The Cloud Function REQUIRES description + eventTitre — without
          // them the call is rejected with `invalid-argument` and the
          // refund demande is silently dropped.
          final descriptionPrefix = unverifiedPayment
              ? 'Modification inscription (paiement déclaré, en attente de validation) — '
              : 'Modification inscription — ';
          await refundService.createInscriptionRefund(
            clubId: clubId,
            operationId: operationId,
            inscriptionId: inscriptionId,
            oldAmount: oldTotal,
            newAmount: newTotal,
            editSessionId: editSessionId,
            eventTitre: operation.titre,
            description: '${descriptionPrefix}diminution de '
                '${delta.toStringAsFixed(2)} € '
                '(de ${oldTotal.toStringAsFixed(2)} € à '
                '${newTotal.toStringAsFixed(2)} €).',
            unverifiedPayment: unverifiedPayment,
          );
          debugPrint('✅ Refund requested for inscription $inscriptionId '
              '(delta=$delta, unverified=$unverifiedPayment)');
        } catch (refundError) {
          // Log refund failure — the inscription update already succeeded
          debugPrint('⚠️ Refund creation failed (non-blocking): $refundError');
        }
      }

      debugPrint('✅ Inscription $inscriptionId updated (delta=$delta)');
      return delta;
    } catch (e) {
      debugPrint('❌ Erreur updateMyInscription: $e');
      rethrow;
    }
  }

  /// Update supplement selection for a guest inscription.
  Future<void> updateGuestInscription({
    required String clubId,
    required String operationId,
    required String guestInscriptionId,
    required List<SelectedSupplement> selectedSupplements,
    required double supplementTotal,
  }) async {
    try {
      final batch = _firestore.batch();
      final inscriptionRef = _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .doc(guestInscriptionId);

      batch.update(inscriptionRef, {
        'selected_supplements':
            selectedSupplements.map((s) => s.toMap()).toList(),
        'supplement_total': supplementTotal,
        'updated_at': FieldValue.serverTimestamp(),
      });

      // Write edit_history entry
      final editHistoryRef = inscriptionRef.collection('edit_history').doc();
      batch.set(editHistoryRef, {
        'action': 'guest_inscription_updated',
        'inscription_id': guestInscriptionId,
        'timestamp': FieldValue.serverTimestamp(),
        'new_supplements': selectedSupplements.map((s) => s.toMap()).toList(),
        'new_total': supplementTotal,
      });

      await batch.commit();
      debugPrint('✅ Guest inscription $guestInscriptionId updated');
    } catch (e) {
      debugPrint('❌ Erreur updateGuestInscription: $e');
      rethrow;
    }
  }

  /// Remove exactly 1 guest inscription — NO cascade.
  ///
  /// Deletes the specified guest inscription document without affecting
  /// other guests or the parent member's inscription.
  Future<void> removeOneGuest({
    required String clubId,
    required String operationId,
    required String guestInscriptionId,
  }) async {
    try {
      final batch = _firestore.batch();
      final inscriptionRef = _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .doc(guestInscriptionId);

      batch.delete(inscriptionRef);

      // Write edit_history entry on the guest doc before deletion
      final editHistoryRef = inscriptionRef.collection('edit_history').doc();
      batch.set(editHistoryRef, {
        'action': 'guest_removed',
        'inscription_id': guestInscriptionId,
        'timestamp': FieldValue.serverTimestamp(),
      });

      await batch.commit();
      debugPrint('✅ Guest inscription $guestInscriptionId removed');
    } catch (e) {
      debugPrint('❌ Erreur removeOneGuest: $e');
      rethrow;
    }
  }
}

/// Parameters for adding or updating a guest inscription during
/// [OperationService.updateMyInscription].
///
/// - When [inscriptionId] is null, a new guest inscription is created.
/// - When [inscriptionId] is non-null, the existing guest inscription is updated.
class GuestUpdate {
  /// Null for new guests, non-null for existing guests.
  final String? inscriptionId;
  final String prenom;
  final String nom;
  final double prix;
  final String? tariffId;
  final List<SelectedSupplement> selectedSupplements;
  final double supplementTotal;

  GuestUpdate({
    this.inscriptionId,
    required this.prenom,
    required this.nom,
    required this.prix,
    this.tariffId,
    this.selectedSupplements = const [],
    this.supplementTotal = 0,
  });
}

/// Résultat d'un [OperationService.unmarkAsPresent] utilisé pour l'undo.
///
/// - `deletedInscription == true`  → l'inscription a été supprimée (walk-in
///   non payée). `previousData` contient toutes les données du document
///   pour le recréer à l'identique via [OperationService.restoreFromUnmark].
/// - `deletedInscription == false` → seuls les champs `present*` ont été
///   réinitialisés. `previousData` contient uniquement ces champs.
class UnmarkPresentResult {
  final bool deletedInscription;
  final String inscriptionId;
  final Map<String, dynamic> previousData;

  UnmarkPresentResult({
    required this.deletedInscription,
    required this.inscriptionId,
    required this.previousData,
  });
}
