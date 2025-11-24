import 'package:flutter/foundation.dart';
import '../models/operation.dart';
import '../models/user_event_registration.dart';
import '../services/operation_service.dart';

/// Provider pour l'état des opérations
class OperationProvider with ChangeNotifier {
  final OperationService _operationService = OperationService();

  List<Operation> _operations = [];
  Operation? _selectedOperation;
  Map<String, int> _participantCounts = {}; // Cache compteur participants
  Map<String, bool> _userRegistrations = {}; // Cache inscriptions utilisateur
  List<UserEventRegistration> _userEventRegistrations = []; // Mes événements
  bool _isLoading = false;
  String? _errorMessage;

  // Getters
  List<Operation> get operations => _operations;
  Operation? get selectedOperation => _selectedOperation;
  List<UserEventRegistration> get userEventRegistrations => _userEventRegistrations;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;

  /// Obtenir les événements à venir de l'utilisateur
  List<UserEventRegistration> get upcomingEvents {
    return _userEventRegistrations.where((reg) => !reg.isPast).toList();
  }

  /// Obtenir les événements passés de l'utilisateur
  List<UserEventRegistration> get pastEvents {
    return _userEventRegistrations.where((reg) => reg.isPast).toList();
  }

  /// Obtenir le nombre de participants pour une opération
  int getParticipantCount(String operationId) {
    return _participantCounts[operationId] ?? 0;
  }

  /// Vérifier si l'utilisateur est inscrit
  bool isUserRegistered(String operationId) {
    return _userRegistrations[operationId] ?? false;
  }

  /// Charger les événements ouverts (stream)
  void listenToOpenEvents(String clubId) {
    debugPrint('🎧 Début écoute événements pour club: $clubId');
    _operationService.getOpenEventsStream(clubId).listen(
      (operations) {
        debugPrint('📥 Stream événements reçu: ${operations.length} événements');
        _operations = operations;
        _isLoading = false;
        notifyListeners();

        // Charger compteurs participants pour chaque opération
        for (var op in operations) {
          _loadParticipantCount(clubId, op.id);
        }
      },
      onError: (error) {
        debugPrint('❌ Erreur stream événements: $error');
        _errorMessage = error.toString();
        _isLoading = false;
        notifyListeners();
      },
    );
  }

  /// Charger le compteur de participants pour une opération
  Future<void> _loadParticipantCount(String clubId, String operationId) async {
    final count = await _operationService.countParticipants(clubId, operationId);
    _participantCounts[operationId] = count;
    notifyListeners();
  }

  /// Sélectionner une opération (pour détail)
  Future<void> selectOperation(String clubId, String operationId, String userId) async {
    try {
      _isLoading = true;
      notifyListeners();

      // Charger l'opération
      _selectedOperation = await _operationService.getOperationById(clubId, operationId);

      // Charger compteur participants
      if (_selectedOperation != null) {
        final count = await _operationService.countParticipants(clubId, operationId);
        _participantCounts[operationId] = count;

        // Vérifier si utilisateur inscrit
        final isRegistered = await _operationService.isUserRegistered(
          clubId,
          operationId,
          userId,
        );
        _userRegistrations[operationId] = isRegistered;
      }

      _isLoading = false;
      notifyListeners();
    } catch (e) {
      _isLoading = false;
      _errorMessage = e.toString();
      notifyListeners();

      debugPrint('❌ Erreur selectOperation: $e');
    }
  }

  /// S'inscrire à une opération
  Future<void> registerToOperation({
    required String clubId,
    required String operationId,
    required String userId,
    required String userName,
    List<String>? exercicesLifras,
  }) async {
    try {
      _isLoading = true;
      notifyListeners();

      final operation = _selectedOperation ?? _operations.firstWhere((op) => op.id == operationId);

      await _operationService.registerToOperation(
        clubId: clubId,
        operationId: operationId,
        userId: userId,
        userName: userName,
        operation: operation,
        exercicesLifras: exercicesLifras,
      );

      // Mettre à jour cache
      _userRegistrations[operationId] = true;
      _participantCounts[operationId] = (_participantCounts[operationId] ?? 0) + 1;

      _isLoading = false;
      notifyListeners();

      debugPrint('✅ Inscription OK via provider');
    } catch (e) {
      _isLoading = false;
      _errorMessage = e.toString().replaceFirst('Exception: ', '');
      notifyListeners();

      debugPrint('❌ Erreur registerToOperation: $e');
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
      _isLoading = true;
      notifyListeners();

      await _operationService.unregisterFromOperation(
        clubId: clubId,
        operationId: operationId,
        userId: userId,
      );

      // Mettre à jour cache
      _userRegistrations[operationId] = false;
      _participantCounts[operationId] = (_participantCounts[operationId] ?? 1) - 1;

      _isLoading = false;
      notifyListeners();

      debugPrint('✅ Désinscription OK via provider');
    } catch (e) {
      _isLoading = false;
      _errorMessage = e.toString().replaceFirst('Exception: ', '');
      notifyListeners();

      debugPrint('❌ Erreur unregisterFromOperation: $e');
      rethrow;
    }
  }

  /// Effacer le message d'erreur
  void clearError() {
    _errorMessage = null;
    notifyListeners();
  }

  /// Rafraîchir les opérations
  Future<void> refresh(String clubId) async {
    _isLoading = true;
    notifyListeners();

    // Le stream se rafraîchit automatiquement
    // On force juste un reload du compteur
    for (var op in _operations) {
      await _loadParticipantCount(clubId, op.id);
    }

    _isLoading = false;
    notifyListeners();
  }

  /// Écouter les inscriptions de l'utilisateur (stream)
  void listenToUserRegistrations(String clubId, String userId) {
    _operationService.getUserRegistrationsStream(clubId, userId).listen(
      (participants) async {
        // Pour chaque inscription, charger l'opération correspondante
        final registrations = <UserEventRegistration>[];

        for (var participant in participants) {
          final operation = await _operationService.getOperationById(
            clubId,
            participant.operationId,
          );

          if (operation != null) {
            registrations.add(UserEventRegistration(
              operation: operation,
              participant: participant,
            ));
          }
        }

        _userEventRegistrations = registrations;
        notifyListeners();

        debugPrint('📅 ${registrations.length} inscriptions utilisateur chargées');
      },
      onError: (error) {
        _errorMessage = error.toString();
        notifyListeners();
        debugPrint('❌ Erreur stream inscriptions utilisateur: $error');
      },
    );
  }

  /// Charger les inscriptions de l'utilisateur (non-stream)
  Future<void> loadUserRegistrations(String clubId, String userId) async {
    try {
      _isLoading = true;
      notifyListeners();

      final participants = await _operationService.getUserRegistrations(clubId, userId);
      final registrations = <UserEventRegistration>[];

      for (var participant in participants) {
        final operation = await _operationService.getOperationById(
          clubId,
          participant.operationId,
        );

        if (operation != null) {
          registrations.add(UserEventRegistration(
            operation: operation,
            participant: participant,
          ));
        }
      }

      _userEventRegistrations = registrations;
      _isLoading = false;
      notifyListeners();

      debugPrint('✅ ${registrations.length} inscriptions utilisateur chargées');
    } catch (e) {
      _isLoading = false;
      _errorMessage = e.toString();
      notifyListeners();
      debugPrint('❌ Erreur chargement inscriptions utilisateur: $e');
    }
  }
}
