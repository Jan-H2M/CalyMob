import 'dart:io';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';
import '../models/expense_claim.dart';

/// Service de gestion des demandes de remboursement
class ExpenseService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseStorage _storage = FirebaseStorage.instance;

  /// Stream des demandes de l'utilisateur
  Stream<List<ExpenseClaim>> getUserExpensesStream(String clubId, String userId) {
    return _firestore
        .collection('clubs/$clubId/demandes_remboursement')
        .where('demandeur_id', isEqualTo: userId)
        // Removed orderBy to avoid composite index requirement - sort in-memory instead
        .snapshots()
        .map((snapshot) {
      final expenses = snapshot.docs
          .map((doc) => ExpenseClaim.fromFirestore(doc))
          .toList();

      // Sort in-memory by dateDemande (most recent first)
      expenses.sort((a, b) => b.dateDemande.compareTo(a.dateDemande));

      debugPrint('💸 ${expenses.length} demandes chargées pour user $userId');
      return expenses;
    });
  }

  /// Stream des demandes en attente d'approbation (sauf celles de l'utilisateur)
  Stream<List<ExpenseClaim>> getPendingApprovalsStream(String clubId, String currentUserId) {
    return _firestore
        .collection('clubs/$clubId/demandes_remboursement')
        .where('statut', isEqualTo: 'soumis')
        .snapshots()
        .map((snapshot) {
      // Filter out current user's expenses (can't approve own expenses)
      final expenses = snapshot.docs
          .map((doc) => ExpenseClaim.fromFirestore(doc))
          .where((expense) => expense.demandeurId != currentUserId)
          .toList();

      // Sort in-memory by dateDemande (most recent first)
      expenses.sort((a, b) => b.dateDemande.compareTo(a.dateDemande));

      debugPrint('✅ ${expenses.length} demandes en attente d\'approbation (excluant user $currentUserId)');
      return expenses;
    });
  }

  /// Créer une nouvelle demande de remboursement
  Future<String> createExpenseClaim({
    required String clubId,
    required String userId,
    required String userName,
    required double montant,
    required String description,
    required DateTime dateDepense,
    String? operationId,
    List<File>? photoFiles,
  }) async {
    try {
      debugPrint('💸 Création demande: $description ($montant €)');

      // 1. Créer le document sans les URLs photos d'abord
      // Extract year from date_depense to determine fiscal_year_id
      final fiscalYearId = 'FY${dateDepense.year}';

      final expenseRef = await _firestore
          .collection('clubs/$clubId/demandes_remboursement')
          .add({
        'club_id': clubId,
        'demandeur_id': userId,
        'demandeur_nom': userName,
        'montant': montant,
        'description': description,
        'statut': 'soumis',
        'date_depense': Timestamp.fromDate(dateDepense),
        'date_demande': Timestamp.now(),
        'operation_id': operationId,
        'fiscal_year_id': fiscalYearId, // Required for web app filtering
        'source': 'mobile', // Identifies this was created from CalyMob app
        'urls_justificatifs': [],
        'created_at': FieldValue.serverTimestamp(),
        'updated_at': FieldValue.serverTimestamp(),
      });

      final expenseId = expenseRef.id;
      debugPrint('✅ Demande créée: $expenseId');

      // 2. Upload photos si présentes
      if (photoFiles != null && photoFiles.isNotEmpty) {
        final photoUrls = await _uploadPhotos(
          clubId: clubId,
          expenseId: expenseId,
          photoFiles: photoFiles,
        );

        // 3. Mettre à jour avec URLs photos
        await expenseRef.update({
          'urls_justificatifs': photoUrls,
          'updated_at': FieldValue.serverTimestamp(),
        });

        debugPrint('✅ ${photoUrls.length} photos uploadées');
      }

      return expenseId;
    } catch (e) {
      debugPrint('❌ Erreur création demande: $e');
      rethrow;
    }
  }

  /// Upload de photos vers Firebase Storage
  Future<List<String>> _uploadPhotos({
    required String clubId,
    required String expenseId,
    required List<File> photoFiles,
  }) async {
    // Skip photo upload on web (File API not supported)
    if (kIsWeb) {
      debugPrint('⚠️ Photo upload skipped on web platform');
      return [];
    }

    final List<String> photoUrls = [];

    for (int i = 0; i < photoFiles.length; i++) {
      try {
        final file = photoFiles[i];
        final fileName = 'photo_${i + 1}_${DateTime.now().millisecondsSinceEpoch}.jpg';

        // Path Firebase Storage
        final storageRef = _storage
            .ref()
            .child('clubs/$clubId/demandes/$expenseId/$fileName');

        debugPrint('📤 Upload photo ${i + 1}/${photoFiles.length}: $fileName');

        // Upload file
        await storageRef.putFile(file);

        // Obtenir URL téléchargement
        final downloadUrl = await storageRef.getDownloadURL();
        photoUrls.add(downloadUrl);

        debugPrint('✅ Photo ${i + 1} uploadée: ${downloadUrl.substring(0, 50)}...');
      } catch (e) {
        debugPrint('❌ Erreur upload photo ${i + 1}: $e');
        // Continue avec les autres photos même si une échoue
      }
    }

    return photoUrls;
  }

  /// Supprimer une demande (seulement si statut = soumis)
  Future<void> deleteExpenseClaim(String clubId, String expenseId, String userId) async {
    try {
      // Vérifier que c'est bien le demandeur
      final doc = await _firestore
          .collection('clubs/$clubId/demandes_remboursement')
          .doc(expenseId)
          .get();

      if (!doc.exists) {
        throw Exception('Demande non trouvée');
      }

      final data = doc.data()!;
      if (data['demandeur_id'] != userId) {
        throw Exception('Vous ne pouvez supprimer que vos propres demandes');
      }

      if (data['statut'] != 'soumis') {
        throw Exception('Impossible de supprimer une demande déjà validée');
      }

      // Supprimer
      await doc.reference.delete();
      debugPrint('✅ Demande supprimée: $expenseId');
    } catch (e) {
      debugPrint('❌ Erreur suppression demande: $e');
      rethrow;
    }
  }

  /// Obtenir les catégories disponibles
  static List<String> getCategories() {
    return [
      'Transport',
      'Matériel',
      'Restauration',
      'Hébergement',
      'Formation',
      'Autre',
    ];
  }

  /// Approuver une demande de remboursement
  Future<void> approveExpense(
    String clubId,
    String demandeId, {
    required String approverId,
    required String approverName,
  }) async {
    await _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('demandes_remboursement')
        .doc(demandeId)
        .update({
      'statut': 'approuve',
      'approuve_par': approverId,
      'approuve_par_nom': approverName,
      'date_approbation': FieldValue.serverTimestamp(),
      'updated_at': FieldValue.serverTimestamp(),
    });
  }

  /// Refuser une demande de remboursement
  Future<void> rejectExpense(String clubId, String demandeId, {String? reason}) async {
    final updates = {
      'statut': 'refuse',
      'updated_at': FieldValue.serverTimestamp(),
    };
    if (reason != null && reason.isNotEmpty) {
      updates['raison_refus'] = reason;
    }

    await _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('demandes_remboursement')
        .doc(demandeId)
        .update(updates);
  }

  /// Mettre à jour une demande de remboursement existante
  Future<void> updateExpenseClaim({
    required String clubId,
    required String expenseId,
    required String userId,
    required double montant,
    required String description,
    required DateTime dateDepense,
  }) async {
    try {
      debugPrint('💸 Mise à jour demande: $expenseId');

      // Vérifier que la demande existe et appartient à l'utilisateur
      final doc = await _firestore
          .collection('clubs/$clubId/demandes_remboursement')
          .doc(expenseId)
          .get();

      if (!doc.exists) {
        throw Exception('Demande introuvable');
      }

      final data = doc.data()!;
      if (data['demandeur_id'] != userId) {
        throw Exception('Vous ne pouvez modifier que vos propres demandes');
      }

      if (data['statut'] != 'soumis') {
        throw Exception('Impossible de modifier une demande déjà validée');
      }

      // Extract year from date_depense to determine fiscal_year_id
      final fiscalYearId = 'FY${dateDepense.year}';

      // Mettre à jour les champs
      await doc.reference.update({
        'montant': montant,
        'description': description,
        'date_depense': Timestamp.fromDate(dateDepense),
        'fiscal_year_id': fiscalYearId,
        'updated_at': FieldValue.serverTimestamp(),
      });

      debugPrint('✅ Demande mise à jour: $expenseId');
    } catch (e) {
      debugPrint('❌ Erreur mise à jour demande: $e');
      rethrow;
    }
  }
}
