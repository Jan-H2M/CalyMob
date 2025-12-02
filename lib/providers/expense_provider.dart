import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import '../models/expense_claim.dart';
import '../services/expense_service.dart';

/// Provider pour l'état des demandes de remboursement
class ExpenseProvider with ChangeNotifier {
  final ExpenseService _expenseService = ExpenseService();

  // Stream subscriptions for memory management
  StreamSubscription<List<ExpenseClaim>>? _userExpensesSubscription;
  StreamSubscription<List<ExpenseClaim>>? _pendingApprovalsSubscription;

  List<ExpenseClaim> _expenses = [];
  bool _isLoading = false;
  String? _errorMessage;

  // Getters
  List<ExpenseClaim> get expenses => _expenses;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;

  @override
  void dispose() {
    _userExpensesSubscription?.cancel();
    _pendingApprovalsSubscription?.cancel();
    super.dispose();
  }

  /// Écouter les demandes de l'utilisateur (stream)
  void listenToUserExpenses(String clubId, String userId) {
    // Cancel any existing subscription to prevent memory leaks
    _userExpensesSubscription?.cancel();

    debugPrint('🎧 Starting expense stream for user: $userId');
    _userExpensesSubscription = _expenseService.getUserExpensesStream(clubId, userId).listen(
      (expenses) {
        debugPrint('📦 Stream received ${expenses.length} expenses');
        if (expenses.isNotEmpty) {
          debugPrint('📦 First expense: ${expenses.first.description} (${expenses.first.montant}€)');
        }
        _expenses = expenses;
        _isLoading = false;
        notifyListeners();
        debugPrint('🔔 notifyListeners called, _expenses.length = ${_expenses.length}');
      },
      onError: (error) {
        debugPrint('❌ Stream error: $error');
        _errorMessage = error.toString();
        _isLoading = false;
        notifyListeners();
      },
    );
  }

  /// Écouter les demandes en attente d'approbation (stream)
  void listenToPendingApprovals(String clubId, String currentUserId) {
    // Cancel any existing subscription to prevent memory leaks
    _pendingApprovalsSubscription?.cancel();

    debugPrint('🎧 Starting pending approvals stream (excluding user: $currentUserId)');
    _pendingApprovalsSubscription = _expenseService.getPendingApprovalsStream(clubId, currentUserId).listen(
      (expenses) {
        debugPrint('📦 Stream received ${expenses.length} pending approvals');
        if (expenses.isNotEmpty) {
          debugPrint('📦 First expense: ${expenses.first.description} (${expenses.first.montant}€)');
        }
        _expenses = expenses;
        _isLoading = false;
        notifyListeners();
        debugPrint('🔔 notifyListeners called, _expenses.length = ${_expenses.length}');
      },
      onError: (error) {
        debugPrint('❌ Stream error: $error');
        _errorMessage = error.toString();
        _isLoading = false;
        notifyListeners();
      },
    );
  }

  /// Créer une nouvelle demande
  Future<String> createExpense({
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
      _isLoading = true;
      notifyListeners();

      final expenseId = await _expenseService.createExpenseClaim(
        clubId: clubId,
        userId: userId,
        userName: userName,
        montant: montant,
        description: description,
        dateDepense: dateDepense,
        operationId: operationId,
        photoFiles: photoFiles,
      );

      _isLoading = false;
      notifyListeners();

      debugPrint('✅ Demande créée via provider: $expenseId');
      return expenseId;
    } catch (e) {
      _isLoading = false;
      _errorMessage = e.toString().replaceFirst('Exception: ', '');
      notifyListeners();

      debugPrint('❌ Erreur createExpense: $e');
      rethrow;
    }
  }

  /// Supprimer une demande
  Future<void> deleteExpense({
    required String clubId,
    required String expenseId,
    required String userId,
  }) async {
    try {
      _isLoading = true;
      notifyListeners();

      await _expenseService.deleteExpenseClaim(clubId, expenseId, userId);

      _isLoading = false;
      notifyListeners();

      debugPrint('✅ Demande supprimée via provider');
    } catch (e) {
      _isLoading = false;
      _errorMessage = e.toString().replaceFirst('Exception: ', '');
      notifyListeners();

      debugPrint('❌ Erreur deleteExpense: $e');
      rethrow;
    }
  }

  /// Approuver une demande
  Future<void> approveExpense({
    required String clubId,
    required String expenseId,
  }) async {
    try {
      _isLoading = true;
      notifyListeners();

      await _expenseService.approveExpense(clubId, expenseId);

      _isLoading = false;
      notifyListeners();

      debugPrint('✅ Demande approuvée via provider');
    } catch (e) {
      _isLoading = false;
      _errorMessage = e.toString().replaceFirst('Exception: ', '');
      notifyListeners();

      debugPrint('❌ Erreur approveExpense: $e');
      rethrow;
    }
  }

  /// Refuser une demande
  Future<void> rejectExpense({
    required String clubId,
    required String expenseId,
    String? reason,
  }) async {
    try {
      _isLoading = true;
      notifyListeners();

      await _expenseService.rejectExpense(clubId, expenseId, reason: reason);

      _isLoading = false;
      notifyListeners();

      debugPrint('✅ Demande refusée via provider');
    } catch (e) {
      _isLoading = false;
      _errorMessage = e.toString().replaceFirst('Exception: ', '');
      notifyListeners();

      debugPrint('❌ Erreur rejectExpense: $e');
      rethrow;
    }
  }

  /// Mettre à jour une demande existante
  Future<void> updateExpense({
    required String clubId,
    required String expenseId,
    required String userId,
    required double montant,
    required String description,
    required DateTime dateDepense,
  }) async {
    try {
      _isLoading = true;
      notifyListeners();

      await _expenseService.updateExpenseClaim(
        clubId: clubId,
        expenseId: expenseId,
        userId: userId,
        montant: montant,
        description: description,
        dateDepense: dateDepense,
      );

      _isLoading = false;
      notifyListeners();

      debugPrint('✅ Demande mise à jour via provider');
    } catch (e) {
      _isLoading = false;
      _errorMessage = e.toString().replaceFirst('Exception: ', '');
      notifyListeners();

      debugPrint('❌ Erreur updateExpense: $e');
      rethrow;
    }
  }

  /// Filtrer demandes par statut
  List<ExpenseClaim> filterByStatus(String? status) {
    if (status == null || status == 'Tous') return _expenses;
    return _expenses.where((e) => e.statut == status).toList();
  }

  /// Obtenir statistiques
  /// Uses a local copy to prevent race conditions with stream updates
  Map<String, dynamic> getStats() {
    // Create a local copy to avoid race conditions during iteration
    final expensesCopy = List<ExpenseClaim>.from(_expenses);

    final total = expensesCopy.length;
    final enAttente = expensesCopy.where((e) => e.statut == 'soumis' || e.statut == 'en_attente_validation').length;
    final approuves = expensesCopy.where((e) => e.statut == 'approuve' || e.statut == 'rembourse').length;
    final refuses = expensesCopy.where((e) => e.statut == 'refuse').length;
    final montantTotal = expensesCopy.fold<double>(0, (sum, e) => sum + e.montant);

    return {
      'total': total,
      'enAttente': enAttente,
      'approuves': approuves,
      'refuses': refuses,
      'montantTotal': montantTotal,
    };
  }

  /// Effacer le message d'erreur
  void clearError() {
    _errorMessage = null;
    notifyListeners();
  }
}
