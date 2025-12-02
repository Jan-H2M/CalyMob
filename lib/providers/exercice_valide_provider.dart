import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/exercice_valide.dart';
import '../models/exercice_lifras.dart';
import '../services/exercice_valide_service.dart';

/// Provider pour l'état des exercices validés
class ExerciceValideProvider with ChangeNotifier {
  final ExerciceValideService _service = ExerciceValideService();

  StreamSubscription<List<ExerciceValide>>? _subscription;

  List<ExerciceValide> _exercicesValides = [];
  bool _isLoading = false;
  String? _errorMessage;

  // Current context
  String? _currentClubId;
  String? _currentMemberId;

  // Getters
  List<ExerciceValide> get exercicesValides => _exercicesValides;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }

  /// Écouter les exercices validés d'un membre (stream)
  void listenToMemberExercices(String clubId, String memberId) {
    // Cancel existing subscription
    _subscription?.cancel();

    _currentClubId = clubId;
    _currentMemberId = memberId;
    _isLoading = true;
    notifyListeners();

    debugPrint('🎧 Démarrage stream exercices validés pour membre: $memberId');

    _subscription = _service
        .getMemberExercicesValidesStream(clubId, memberId)
        .listen(
      (exercices) {
        _exercicesValides = exercices;
        _isLoading = false;
        notifyListeners();
        debugPrint('📦 ${exercices.length} exercices validés reçus');
      },
      onError: (error) {
        _errorMessage = error.toString();
        _isLoading = false;
        notifyListeners();
        debugPrint('❌ Erreur stream exercices validés: $error');
      },
    );
  }

  /// Charger les exercices validés d'un membre (one-shot)
  Future<void> loadMemberExercices(String clubId, String memberId) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      _exercicesValides = await _service.getMemberExercicesValides(clubId, memberId);
      _currentClubId = clubId;
      _currentMemberId = memberId;
    } catch (e) {
      _errorMessage = e.toString();
      debugPrint('❌ Erreur chargement exercices validés: $e');
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Valider un exercice
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
  }) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final id = await _service.validateExercise(
        clubId: clubId,
        memberId: memberId,
        exercice: exercice,
        dateValidation: dateValidation,
        moniteurNom: moniteurNom,
        createdBy: createdBy,
        moniteurId: moniteurId,
        notes: notes,
        lieu: lieu,
      );

      debugPrint('✅ Exercice validé via provider: $id');
      return id;
    } catch (e) {
      _errorMessage = e.toString();
      debugPrint('❌ Erreur validation exercice: $e');
      rethrow;
    } finally {
      _isLoading = false;
      notifyListeners();
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
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      await _service.updateExerciceValide(
        clubId: clubId,
        memberId: memberId,
        exerciceValideId: exerciceValideId,
        dateValidation: dateValidation,
        moniteurNom: moniteurNom,
        moniteurId: moniteurId,
        notes: notes,
        lieu: lieu,
      );

      debugPrint('✅ Exercice validé mis à jour via provider');
    } catch (e) {
      _errorMessage = e.toString();
      debugPrint('❌ Erreur mise à jour exercice validé: $e');
      rethrow;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Supprimer un exercice validé
  Future<void> deleteExerciceValide({
    required String clubId,
    required String memberId,
    required String exerciceValideId,
  }) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      await _service.deleteExerciceValide(
        clubId: clubId,
        memberId: memberId,
        exerciceValideId: exerciceValideId,
      );

      debugPrint('✅ Exercice validé supprimé via provider');
    } catch (e) {
      _errorMessage = e.toString();
      debugPrint('❌ Erreur suppression exercice validé: $e');
      rethrow;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Obtenir les exercices groupés par niveau
  Map<NiveauLIFRAS, List<ExerciceValide>> get exercicesGroupedByNiveau {
    return _service.groupByNiveau(_exercicesValides);
  }

  /// Obtenir les statistiques
  Map<String, dynamic> get stats {
    return _service.getStats(_exercicesValides);
  }

  /// Filtrer par niveau
  List<ExerciceValide> filterByNiveau(NiveauLIFRAS niveau) {
    return _exercicesValides
        .where((e) => e.exerciceNiveau == niveau)
        .toList();
  }

  /// Rechercher par code ou description
  List<ExerciceValide> search(String query) {
    if (query.isEmpty) return _exercicesValides;

    final lowerQuery = query.toLowerCase();
    return _exercicesValides.where((e) {
      return e.exerciceCode.toLowerCase().contains(lowerQuery) ||
          e.exerciceDescription.toLowerCase().contains(lowerQuery) ||
          e.moniteurNom.toLowerCase().contains(lowerQuery);
    }).toList();
  }

  /// Effacer le message d'erreur
  void clearError() {
    _errorMessage = null;
    notifyListeners();
  }

  /// Nettoyer l'état
  void clear() {
    _subscription?.cancel();
    _exercicesValides = [];
    _currentClubId = null;
    _currentMemberId = null;
    _errorMessage = null;
    notifyListeners();
  }
}
