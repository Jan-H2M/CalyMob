import 'dart:io';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';
import '../models/expense_claim.dart';

/// Service de gestion des demandes de remboursement.
///
/// Stap 6 van de legacy-migratie: de app gebruikt nu de CANONICAL-collectie
/// `expense_claims` (Engelse veldnamen) i.p.v. de legacy `demandes_remboursement`.
/// De server-side reverse-mirror houdt de oude map synchroon voor leden die nog
/// een oudere app-versie draaien. De app schrijft GEEN `_sync` (server-eigendom);
/// `source: 'mobile'` blijft wél meegegeven zodat de bevestigingsmail werkt.
class ExpenseService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseStorage _storage = FirebaseStorage.instance;

  static const String _collection = 'expense_claims';

  /// Stream des demandes de l'utilisateur
  Stream<List<ExpenseClaim>> getUserExpensesStream(String clubId, String userId) {
    return _firestore
        .collection('clubs/$clubId/$_collection')
        .where('requester_id', isEqualTo: userId)
        .snapshots()
        .map((snapshot) {
      final expenses = snapshot.docs
          .map((doc) => ExpenseClaim.fromFirestore(doc))
          .toList();
      expenses.sort((a, b) => b.dateDemande.compareTo(a.dateDemande));
      debugPrint('💸 ${expenses.length} demandes chargées pour user $userId');
      return expenses;
    });
  }

  /// Stream des demandes en attente d'approbation (statuts canonical)
  Stream<List<ExpenseClaim>> getPendingApprovalsStream(String clubId, String currentUserId) {
    return _firestore
        .collection('clubs/$clubId/$_collection')
        .where('status', whereIn: ['submitted', 'pending_approval'])
        .snapshots()
        .map((snapshot) {
      final expenses = snapshot.docs
          .map((doc) => ExpenseClaim.fromFirestore(doc))
          .toList();
      expenses.sort((a, b) => b.dateDemande.compareTo(a.dateDemande));
      debugPrint('✅ ${expenses.length} demandes en attente d\'approbation');
      return expenses;
    });
  }

  /// Créer une nouvelle demande de remboursement (canonical)
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
      final fiscalYearId = 'FY${dateDepense.year}';

      final expenseRef = await _firestore
          .collection('clubs/$clubId/$_collection')
          .add({
        'club_id': clubId,
        'requester_id': userId,
        'requester_name': userName,
        'amount': montant,
        'description': description,
        'status': 'submitted',
        'expense_date': Timestamp.fromDate(dateDepense),
        'requested_at': Timestamp.now(),
        'operation_id': operationId,
        'fiscal_year_id': fiscalYearId, // Required for web app filtering
        'source': 'mobile', // Identifies CalyMob submission (drives confirmation email)
        'supporting_document_urls': <String>[],
        'created_at': FieldValue.serverTimestamp(),
        'updated_at': FieldValue.serverTimestamp(),
      });

      final expenseId = expenseRef.id;
      debugPrint('✅ Demande créée: $expenseId');

      if (photoFiles != null && photoFiles.isNotEmpty) {
        final photoUrls = await _uploadPhotos(
          clubId: clubId,
          expenseId: expenseId,
          photoFiles: photoFiles,
        );
        await expenseRef.update({
          'supporting_document_urls': photoUrls,
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

  /// Upload de photos vers Firebase Storage (contentType verplicht — MIME-rule)
  Future<List<String>> _uploadPhotos({
    required String clubId,
    required String expenseId,
    required List<File> photoFiles,
  }) async {
    if (kIsWeb) {
      debugPrint('⚠️ Photo upload skipped on web platform');
      return [];
    }
    final List<String> photoUrls = [];
    for (int i = 0; i < photoFiles.length; i++) {
      try {
        final file = photoFiles[i];
        final fileName = 'photo_${i + 1}_${DateTime.now().millisecondsSinceEpoch}.jpg';
        final storageRef = _storage
            .ref()
            .child('clubs/$clubId/demandes/$expenseId/$fileName');
        debugPrint('📤 Upload photo ${i + 1}/${photoFiles.length}: $fileName');
        await storageRef.putFile(file, SettableMetadata(contentType: 'image/jpeg'));
        final downloadUrl = await storageRef.getDownloadURL();
        photoUrls.add(downloadUrl);
        debugPrint('✅ Photo ${i + 1} uploadée');
      } catch (e) {
        debugPrint('❌ Erreur upload photo ${i + 1}: $e');
      }
    }
    return photoUrls;
  }

  /// Supprimer une demande (seulement si statut soumis/submitted)
  Future<void> deleteExpenseClaim(String clubId, String expenseId, String userId) async {
    try {
      final docRef = _firestore.collection('clubs/$clubId/$_collection').doc(expenseId);
      final doc = await docRef.get();
      if (!doc.exists) {
        throw Exception('Demande non trouvée');
      }
      final data = doc.data()!;
      final requesterId = data['requester_id'] ?? data['demandeur_id'];
      if (requesterId != userId) {
        throw Exception('Vous ne pouvez supprimer que vos propres demandes');
      }
      final status = (data['status'] ?? data['statut'])?.toString();
      if (status != 'submitted' && status != 'soumis') {
        throw Exception('Impossible de supprimer une demande déjà validée');
      }
      await docRef.delete();
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

  /// Approuver une demande de remboursement (canonical)
  Future<void> approveExpense(
    String clubId,
    String demandeId, {
    required String approverId,
    required String approverName,
  }) async {
    await _firestore
        .collection('clubs/$clubId/$_collection')
        .doc(demandeId)
        .update({
      'status': 'approved',
      'approved_by': approverId,
      'approved_by_name': approverName,
      'approved_at': FieldValue.serverTimestamp(),
      'updated_at': FieldValue.serverTimestamp(),
    });
  }

  /// Refuser une demande de remboursement (canonical)
  Future<void> rejectExpense(String clubId, String demandeId, {String? reason}) async {
    final updates = <String, dynamic>{
      'status': 'rejected',
      'updated_at': FieldValue.serverTimestamp(),
    };
    if (reason != null && reason.isNotEmpty) {
      updates['rejection_reason'] = reason;
    }
    await _firestore
        .collection('clubs/$clubId/$_collection')
        .doc(demandeId)
        .update(updates);
  }

  /// Mettre à jour une demande de remboursement existante (canonical)
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
      final docRef = _firestore.collection('clubs/$clubId/$_collection').doc(expenseId);
      final doc = await docRef.get();
      if (!doc.exists) {
        throw Exception('Demande introuvable');
      }
      final data = doc.data()!;
      final requesterId = data['requester_id'] ?? data['demandeur_id'];
      if (requesterId != userId) {
        throw Exception('Vous ne pouvez modifier que vos propres demandes');
      }
      final status = (data['status'] ?? data['statut'])?.toString();
      if (status != 'submitted' && status != 'soumis') {
        throw Exception('Impossible de modifier une demande déjà validée');
      }
      final fiscalYearId = 'FY${dateDepense.year}';
      await docRef.update({
        'amount': montant,
        'description': description,
        'expense_date': Timestamp.fromDate(dateDepense),
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
