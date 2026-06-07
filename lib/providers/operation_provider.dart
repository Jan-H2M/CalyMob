import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/operation.dart';
import '../models/member_profile.dart';
import '../models/participant_operation.dart';
import '../models/supplement.dart';
import '../models/tariff.dart';
import '../models/user_event_registration.dart';
import '../services/operation_service.dart';

/// Provider pour l'état des opérations
class OperationProvider with ChangeNotifier {
  final OperationService _operationService = OperationService();

  // Stream subscriptions for memory management
  StreamSubscription<List<Operation>>? _operationsSubscription;
  StreamSubscription<List<UserEventRegistration>>?
      _userRegistrationsSubscription;
  StreamSubscription<List<ParticipantOperation>>? _participantsSubscription;

  List<Operation> _operations = [];
  Operation? _selectedOperation;
  Map<String, int> _participantCounts = {}; // Cache compteur participants
  Map<String, bool> _userRegistrationStatus =
      {}; // Cache inscriptions utilisateur (per operation)
  List<ParticipantOperation> _selectedOperationParticipants =
      []; // Liste participants
  List<UserEventRegistration> _userRegistrations =
      []; // User's registrations across all operations
  bool _isLoading = false;
  String? _errorMessage;

  // Getters
  List<Operation> get operations => _operations;
  Operation? get selectedOperation => _selectedOperation;
  List<ParticipantOperation> get selectedOperationParticipants =>
      _selectedOperationParticipants;
  List<UserEventRegistration> get userRegistrations => _userRegistrations;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;

  /// Upcoming events (not yet passed)
  List<UserEventRegistration> get upcomingEvents =>
      _userRegistrations.where((r) => !r.isPast).toList();

  /// Past events (already passed)
  List<UserEventRegistration> get pastEvents =>
      _userRegistrations.where((r) => r.isPast).toList();

  @override
  void dispose() {
    _operationsSubscription?.cancel();
    _userRegistrationsSubscription?.cancel();
    _participantsSubscription?.cancel();
    super.dispose();
  }

  /// Obtenir le nombre de participants pour une opération
  int getParticipantCount(String operationId) {
    return _participantCounts[operationId] ?? 0;
  }

  /// Vérifier si l'utilisateur est inscrit à une opération spécifique
  bool isUserRegistered(String operationId) {
    return _userRegistrationStatus[operationId] ?? false;
  }

  /// Charger les événements ouverts (stream)
  void listenToOpenEvents(String clubId) {
    // Cancel any existing subscription to prevent memory leaks
    _operationsSubscription?.cancel();

    _operationsSubscription =
        _operationService.getOpenEventsStream(clubId).listen(
      (operations) {
        _operations = operations;
        _isLoading = false;
        notifyListeners();

        // Charger compteurs participants pour chaque opération
        // Use Future.wait to batch notifications
        _loadAllParticipantCounts(clubId, operations);
      },
      onError: (error) {
        _errorMessage = error.toString();
        _isLoading = false;
        notifyListeners();
      },
    );
  }

  /// Load participant counts for all operations (batched)
  Future<void> _loadAllParticipantCounts(
      String clubId, List<Operation> operations) async {
    for (var op in operations) {
      final count = await _operationService.countParticipants(clubId, op.id);
      _participantCounts[op.id] = count;
    }
    // Single notification after all counts loaded
    notifyListeners();
  }

  /// Charger le compteur de participants pour une opération
  Future<void> _loadParticipantCount(String clubId, String operationId) async {
    final count =
        await _operationService.countParticipants(clubId, operationId);
    _participantCounts[operationId] = count;
    notifyListeners();
  }

  /// Sélectionner une opération (pour détail)
  Future<void> selectOperation(
      String clubId, String operationId, String userId) async {
    try {
      _isLoading = true;
      // Use Future.microtask to delay notification until after the build phase
      await Future.microtask(() => notifyListeners());

      // Charger l'opération
      _selectedOperation =
          await _operationService.getOperationById(clubId, operationId);

      // Charger compteur participants
      if (_selectedOperation != null) {
        final count =
            await _operationService.countParticipants(clubId, operationId);
        _participantCounts[operationId] = count;

        // Écouter la liste des participants en temps réel (payment status updates)
        _listenToParticipants(clubId, operationId);

        // Vérifier si utilisateur inscrit
        final isRegistered = await _operationService.isUserRegistered(
          clubId,
          operationId,
          userId,
        );
        _userRegistrationStatus[operationId] = isRegistered;
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
    MemberProfile? memberProfile,
    Tariff? selectedTariff,
    List<SelectedSupplement>? selectedSupplements,
    double? supplementTotal,
  }) async {
    try {
      _isLoading = true;
      notifyListeners();

      final operation = _selectedOperation ??
          _operations.firstWhere((op) => op.id == operationId);

      await _operationService.registerToOperation(
        clubId: clubId,
        operationId: operationId,
        userId: userId,
        userName: userName,
        operation: operation,
        memberProfile: memberProfile,
        selectedTariff: selectedTariff,
        selectedSupplements: selectedSupplements,
        supplementTotal: supplementTotal,
      );

      // Mettre à jour cache
      _userRegistrationStatus[operationId] = true;
      _participantCounts[operationId] =
          (_participantCounts[operationId] ?? 0) + 1;

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
      _userRegistrationStatus[operationId] = false;
      _participantCounts[operationId] =
          (_participantCounts[operationId] ?? 1) - 1;

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

  /// Ajouter un invité (non-membre) à une opération
  Future<void> addGuestToOperation({
    required String clubId,
    required String operationId,
    required String operationTitle,
    required String guestPrenom,
    required String guestNom,
    required double prix,
    required String addedByUserId,
    required String addedByUserName,

    /// Inviting member's own inscription ID (member-driven flow only).
    String? parentInscriptionId,

    /// Selected guest tariff ID (when event has multiple guest tariffs).
    String? tariffId,

    /// Optional supplements selected by/for this guest.
    List<SelectedSupplement>? selectedSupplements,
    double? supplementTotal,
  }) async {
    try {
      _isLoading = true;
      notifyListeners();

      await _operationService.createGuestInscription(
        clubId: clubId,
        operationId: operationId,
        operationTitle: operationTitle,
        guestPrenom: guestPrenom,
        guestNom: guestNom,
        prix: prix,
        addedByUserId: addedByUserId,
        addedByUserName: addedByUserName,
        parentInscriptionId: parentInscriptionId,
        tariffId: tariffId,
        selectedSupplements: selectedSupplements,
        supplementTotal: supplementTotal,
      );

      // Mettre à jour cache
      _participantCounts[operationId] =
          (_participantCounts[operationId] ?? 0) + 1;

      // Recharger la liste des participants
      _selectedOperationParticipants = await _operationService.getParticipants(
        clubId,
        operationId,
      );

      _isLoading = false;
      notifyListeners();

      debugPrint('✅ Invité ajouté via provider');
    } catch (e) {
      _isLoading = false;
      _errorMessage = e.toString().replaceFirst('Exception: ', '');
      notifyListeners();

      debugPrint('❌ Erreur addGuestToOperation: $e');
      rethrow;
    }
  }

  /// Écouter les participants en temps réel (stream)
  /// Met à jour automatiquement quand le statut de paiement change dans Firestore
  void _listenToParticipants(String clubId, String operationId) {
    // Cancel any existing participants subscription
    _participantsSubscription?.cancel();

    _participantsSubscription =
        _operationService.getParticipantsStream(clubId, operationId).listen(
      (participants) {
        _selectedOperationParticipants = participants;
        _participantCounts[operationId] = participants.length;
        notifyListeners();
        debugPrint(
            '🔄 [Stream] Participants mis à jour: ${participants.length}');
      },
      onError: (e) {
        debugPrint('❌ Erreur stream participants: $e');
      },
    );
  }

  /// Recharger la liste des participants pour l'opération sélectionnée
  /// Note: With the stream listener active, this is mainly used as a fallback
  Future<void> reloadParticipants(String clubId, String operationId) async {
    try {
      _selectedOperationParticipants = await _operationService.getParticipants(
        clubId,
        operationId,
      );
      notifyListeners();
      debugPrint(
          '✅ Participants rechargés: ${_selectedOperationParticipants.length}');
    } catch (e) {
      debugPrint('❌ Erreur reloadParticipants: $e');
    }
  }

  /// Écouter les inscriptions de l'utilisateur (stream)
  /// Charge toutes les inscriptions de l'utilisateur avec les données d'opération associées
  void listenToUserRegistrations(String clubId, String userId) {
    // Cancel any existing subscription to prevent memory leaks
    _userRegistrationsSubscription?.cancel();

    _isLoading = true;
    notifyListeners();

    _userRegistrationsSubscription =
        _operationService.getUserRegistrationsStream(clubId, userId).listen(
      (registrations) {
        _userRegistrations = registrations;
        _isLoading = false;
        notifyListeners();

        debugPrint(
            '📋 ${registrations.length} inscriptions utilisateur chargées (${upcomingEvents.length} à venir, ${pastEvents.length} passées)');
      },
      onError: (error) {
        _errorMessage = error.toString();
        _isLoading = false;
        notifyListeners();

        debugPrint('❌ Erreur listenToUserRegistrations: $error');
      },
    );
  }

  /// Charger les inscriptions de l'utilisateur (one-time, pour refresh)
  Future<void> loadUserRegistrations(String clubId, String userId) async {
    _isLoading = true;
    notifyListeners();

    try {
      _userRegistrations =
          await _operationService.getUserRegistrations(clubId, userId);
      _isLoading = false;
      notifyListeners();

      debugPrint(
          '📋 ${_userRegistrations.length} inscriptions utilisateur rechargées');
    } catch (e) {
      _errorMessage = e.toString();
      _isLoading = false;
      notifyListeners();

      debugPrint('❌ Erreur loadUserRegistrations: $e');
    }
  }
}
