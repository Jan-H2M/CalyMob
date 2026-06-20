import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/activity_item.dart';
import '../services/activity_service.dart';

/// Provider voor gecombineerde activiteiten (operations + piscine sessions)
class ActivityProvider with ChangeNotifier {
  final ActivityService _activityService = ActivityService();

  // Stream subscription for memory management
  StreamSubscription<List<ActivityItem>>? _activitiesSubscription;

  List<ActivityItem> _activities = [];
  bool _isLoading = false;
  String? _errorMessage;
  // Inclure les activités terminées (fermées) pour pouvoir revenir sur une
  // ancienne activité et consulter ses données de paiement.
  bool _includePast = false;

  // Getters
  List<ActivityItem> get activities => _activities;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  bool get includePast => _includePast;

  /// Aantal activiteiten per categorie
  int get totalCount => _activities.length;
  int get piscineCount => _activities.where((a) => a.isPiscine).length;
  int get plongeeCount =>
      _activities.where((a) => a.categorie == 'plongee').length;
  int get sortieCount =>
      _activities.where((a) => a.categorie == 'sortie').length;

  @override
  void dispose() {
    _activitiesSubscription?.cancel();
    super.dispose();
  }

  /// Start luisteren naar activiteiten (operations + piscine)
  void listenToActivities(String clubId) {
    // Cancel any existing subscription to prevent memory leaks
    _activitiesSubscription?.cancel();

    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    _activitiesSubscription =
        _activityService
            .getAllActivitiesStream(clubId, includeClosed: _includePast)
            .listen(
      (activities) {
        _activities = activities;
        _isLoading = false;
        _errorMessage = null;
        notifyListeners();

        debugPrint(
            '📋 ActivityProvider: ${activities.length} activities loaded');
      },
      onError: (error) {
        _errorMessage = error.toString();
        _isLoading = false;
        notifyListeners();

        debugPrint('❌ ActivityProvider error: $error');
      },
    );
  }

  /// Filter activiteiten op categorie
  List<ActivityItem> getFilteredActivities(String filter) {
    if (filter == 'all') {
      return _activities;
    }
    return _activities.where((a) => a.categorie == filter).toList();
  }

  /// Zoek een activiteit op ID
  ActivityItem? getActivityById(String id) {
    try {
      return _activities.firstWhere((a) => a.id == id);
    } catch (e) {
      return null;
    }
  }

  /// Refresh door opnieuw te subscriben
  Future<void> refresh(String clubId) async {
    listenToActivities(clubId);
  }

  /// Activeer/deactiveer het tonen van afgelopen (gesloten) activiteiten
  /// en herabonneer met de juiste query.
  void setIncludePast(String clubId, bool value) {
    if (_includePast == value) return;
    _includePast = value;
    listenToActivities(clubId);
  }

  /// Clear error message
  void clearError() {
    _errorMessage = null;
    notifyListeners();
  }
}
