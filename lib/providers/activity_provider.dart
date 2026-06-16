import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/activity_item.dart';
import '../services/activity_service.dart';

/// Provider voor gecombineerde activiteiten (operations + piscine sessions)
class ActivityProvider with ChangeNotifier {
  final ActivityService _activityService = ActivityService();

  // Stream subscription for memory management
  StreamSubscription<List<ActivityItem>>? _activitiesSubscription;
  // Subscription voor afgesloten (ferme) events — lazy, enkel voor organisatoren
  StreamSubscription<List<ActivityItem>>? _closedActivitiesSubscription;

  List<ActivityItem> _activities = [];
  bool _isLoading = false;
  String? _errorMessage;

  List<ActivityItem> _closedActivities = [];
  bool _isLoadingClosed = false;
  bool _closedSubscribed = false;

  // Getters
  List<ActivityItem> get activities => _activities;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;

  /// Afgesloten (ferme) events — gevuld na [listenToClosedActivities]
  List<ActivityItem> get closedActivities => _closedActivities;
  bool get isLoadingClosed => _isLoadingClosed;

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
    _closedActivitiesSubscription?.cancel();
    super.dispose();
  }

  /// Lazy luisteren naar afgesloten (ferme) events.
  /// Enkel oproepen voor organisatoren/admins die voorbije events willen
  /// openen om betalingen te initiëren. Subscribet maar één keer.
  void listenToClosedActivities(String clubId) {
    if (_closedSubscribed) return;
    _closedSubscribed = true;
    _isLoadingClosed = true;
    notifyListeners();

    _closedActivitiesSubscription =
        _activityService.getClosedOperationsStream(clubId).listen(
      (activities) {
        _closedActivities = activities;
        _isLoadingClosed = false;
        notifyListeners();
        debugPrint(
            '📦 ActivityProvider: ${activities.length} closed events loaded');
      },
      onError: (error) {
        _isLoadingClosed = false;
        notifyListeners();
        debugPrint('❌ ActivityProvider closed error: $error');
      },
    );
  }

  /// Start luisteren naar activiteiten (operations + piscine)
  void listenToActivities(String clubId) {
    // Cancel any existing subscription to prevent memory leaks
    _activitiesSubscription?.cancel();

    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    _activitiesSubscription =
        _activityService.getAllActivitiesStream(clubId).listen(
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

  /// Clear error message
  void clearError() {
    _errorMessage = null;
    notifyListeners();
  }
}
