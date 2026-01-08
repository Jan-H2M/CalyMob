import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/availability.dart';
import '../services/availability_service.dart';

/// Provider pour la gestion des disponibilités piscine
class AvailabilityProvider with ChangeNotifier {
  final AvailabilityService _availabilityService = AvailabilityService();

  // État
  List<Availability> _userAvailabilities = [];
  List<Availability> _allAvailabilities = []; // Pour les admins
  bool _isLoading = false;
  String? _error;
  int _currentYear = DateTime.now().year;
  int _currentMonth = DateTime.now().month;
  String? _currentUserId;
  String? _currentClubId;
  String? _userRole; // 'accueil' ou 'encadrant'

  // Stream subscription
  StreamSubscription<List<Availability>>? _availabilitySubscription;

  // Getters
  List<Availability> get userAvailabilities => _userAvailabilities;
  List<Availability> get allAvailabilities => _allAvailabilities;
  bool get isLoading => _isLoading;
  String? get error => _error;
  int get currentYear => _currentYear;
  int get currentMonth => _currentMonth;
  String? get userRole => _userRole;

  /// Obtenir les mardis du mois actuel
  List<DateTime> get currentMonthTuesdays =>
      AvailabilityService.getTuesdaysOfMonth(_currentYear, _currentMonth);

  /// Vérifier si l'utilisateur est disponible pour une date donnée
  bool isAvailableOn(DateTime date) {
    final normalizedDate = DateTime(date.year, date.month, date.day);
    return _userAvailabilities.any((a) =>
        a.date.year == normalizedDate.year &&
        a.date.month == normalizedDate.month &&
        a.date.day == normalizedDate.day &&
        a.available);
  }

  /// Obtenir la disponibilité pour une date donnée (peut être null si pas encore indiquée)
  Availability? getAvailabilityForDate(DateTime date) {
    final normalizedDate = DateTime(date.year, date.month, date.day);
    try {
      return _userAvailabilities.firstWhere((a) =>
          a.date.year == normalizedDate.year &&
          a.date.month == normalizedDate.month &&
          a.date.day == normalizedDate.day);
    } catch (_) {
      return null;
    }
  }

  /// Obtenir les dates où l'utilisateur est disponible
  List<DateTime> get availableDates => _userAvailabilities
      .where((a) => a.available)
      .map((a) => a.date)
      .toList();

  /// Initialiser le provider avec les données utilisateur
  void initialize({
    required String clubId,
    required String userId,
    required String role,
  }) {
    _currentClubId = clubId;
    _currentUserId = userId;
    _userRole = role.toLowerCase(); // Normaliser en minuscules
    _loadUserAvailabilities();
  }

  /// Charger les disponibilités de l'utilisateur pour le mois actuel
  Future<void> _loadUserAvailabilities() async {
    if (_currentClubId == null || _currentUserId == null) return;

    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      // Annuler l'ancienne subscription si elle existe
      await _availabilitySubscription?.cancel();

      // Écouter les disponibilités en temps réel, filtré par rôle
      _availabilitySubscription = _availabilityService
          .getUserAvailabilitiesStream(
        clubId: _currentClubId!,
        userId: _currentUserId!,
        year: _currentYear,
        month: _currentMonth,
        role: _userRole,
      )
          .listen(
        (availabilities) {
          _userAvailabilities = availabilities;
          _isLoading = false;
          _error = null;
          notifyListeners();
        },
        onError: (e) {
          _error = e.toString();
          _isLoading = false;
          notifyListeners();
          debugPrint('❌ Erreur stream disponibilités: $e');
        },
      );
    } catch (e) {
      _error = e.toString();
      _isLoading = false;
      notifyListeners();
      debugPrint('❌ Erreur chargement disponibilités: $e');
    }
  }

  /// Charger toutes les disponibilités pour le mois (vue admin)
  Future<void> loadAllAvailabilities() async {
    if (_currentClubId == null) return;

    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      _allAvailabilities = await _availabilityService.getAllAvailabilitiesForMonth(
        clubId: _currentClubId!,
        year: _currentYear,
        month: _currentMonth,
      );
      _isLoading = false;
      notifyListeners();
    } catch (e) {
      _error = e.toString();
      _isLoading = false;
      notifyListeners();
      debugPrint('❌ Erreur chargement toutes disponibilités: $e');
    }
  }

  /// Basculer la disponibilité pour une date
  /// Cycle: null (pas indiqué) → true (disponible) → false (non disponible) → null
  Future<void> toggleAvailability({
    required DateTime date,
    required String userNom,
    required String userPrenom,
  }) async {
    if (_currentClubId == null || _currentUserId == null || _userRole == null) {
      return;
    }

    try {
      // Trouver l'état actuel
      final currentAvailability = getAvailabilityForDate(date);

      if (currentAvailability == null) {
        // null → true (disponible)
        await _availabilityService.toggleAvailability(
          clubId: _currentClubId!,
          userId: _currentUserId!,
          userNom: userNom,
          userPrenom: userPrenom,
          date: date,
          role: _userRole!,
          available: true,
        );
        debugPrint('✅ Disponibilité: pas indiqué → disponible pour $date');
      } else if (currentAvailability.available) {
        // true → false (non disponible)
        await _availabilityService.toggleAvailability(
          clubId: _currentClubId!,
          userId: _currentUserId!,
          userNom: userNom,
          userPrenom: userPrenom,
          date: date,
          role: _userRole!,
          available: false,
        );
        debugPrint('✅ Disponibilité: disponible → non disponible pour $date');
      } else {
        // false → null (supprimer pour revenir à "pas encore indiqué")
        await _availabilityService.deleteAvailabilityForDate(
          clubId: _currentClubId!,
          userId: _currentUserId!,
          date: date,
          role: _userRole!,
        );
        debugPrint('✅ Disponibilité: non disponible → pas indiqué pour $date');
      }

      // Le stream mettra à jour automatiquement
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      debugPrint('❌ Erreur toggle disponibilité: $e');
      rethrow;
    }
  }

  /// Naviguer vers le mois précédent
  void previousMonth() {
    if (_currentMonth == 1) {
      _currentMonth = 12;
      _currentYear--;
    } else {
      _currentMonth--;
    }
    _loadUserAvailabilities();
  }

  /// Naviguer vers le mois suivant
  void nextMonth() {
    if (_currentMonth == 12) {
      _currentMonth = 1;
      _currentYear++;
    } else {
      _currentMonth++;
    }
    _loadUserAvailabilities();
  }

  /// Aller au mois actuel
  void goToCurrentMonth() {
    final now = DateTime.now();
    _currentYear = now.year;
    _currentMonth = now.month;
    _loadUserAvailabilities();
  }

  /// Nom du mois en français
  String get currentMonthName {
    const months = [
      'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];
    return '${months[_currentMonth - 1]} $_currentYear';
  }

  /// Effacer l'erreur
  void clearError() {
    _error = null;
    notifyListeners();
  }

  /// Rafraîchir les données
  Future<void> refresh() async {
    await _loadUserAvailabilities();
  }

  @override
  void dispose() {
    _availabilitySubscription?.cancel();
    super.dispose();
  }
}
