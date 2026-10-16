import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/activity_item.dart';
import '../services/activity_service.dart';

/// Provider voor gecombineerde activiteiten (operations + piscine sessions)
class ActivityProvider with ChangeNotifier {
  final ActivityService _activityService = ActivityService();

  // Stream subscription for memory management
  StreamSubscription<List<ActivityItem>>? _activitiesSubscription;
  // Subscription voor afgesloten of geannuleerde events — lazy voor organisatoren
  StreamSubscription<List<ActivityItem>>? _closedActivitiesSubscription;
  Timer? _activitiesLoadTimer;
  Timer? _closedActivitiesLoadTimer;
  static const Duration loadTimeout = Duration(seconds: 8);

  List<ActivityItem> _activities = [];
  bool _isLoading = false;
  String? _errorMessage;
  bool _isLoadStalled = false;
  // Inclure les activités terminées (fermées) pour pouvoir revenir sur une
  // ancienne activité et consulter ses données de paiement.
  bool _includePast = false;

  List<ActivityItem> _closedActivities = [];
  bool _isLoadingClosed = false;
  bool _closedSubscribed = false;
  String? _currentUserId;
  String? _currentClubId;
  String? _closedClubId;
  bool _isClosedLoadStalled = false;

  // Getters
  List<ActivityItem> get activities => _activities;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  bool get isLoadStalled => _isLoadStalled;
  bool get includePast => _includePast;

  /// Afgesloten/geannuleerde events — gevuld na [listenToClosedActivities]
  List<ActivityItem> get closedActivities => _closedActivities;
  bool get isLoadingClosed => _isLoadingClosed;
  bool get isClosedLoadStalled => _isClosedLoadStalled;

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
    _activitiesLoadTimer?.cancel();
    _closedActivitiesLoadTimer?.cancel();
    super.dispose();
  }

  /// Lazy luisteren naar afgesloten/geannuleerde events.
  /// Enkel oproepen voor organisatoren/admins die voorbije events en hun
  /// discussies willen openen. Subscribet maar één keer.
  void listenToClosedActivities(String clubId) {
    if (_closedSubscribed) return;
    _closedSubscribed = true;
    _isLoadingClosed = true;
    _isClosedLoadStalled = false;
    _closedClubId = clubId;
    notifyListeners();
    _closedActivitiesLoadTimer?.cancel();
    _closedActivitiesLoadTimer = Timer(loadTimeout, () {
      if (!_isLoadingClosed) return;
      _isLoadingClosed = false;
      _isClosedLoadStalled = true;
      notifyListeners();
    });

    _closedActivitiesSubscription =
        _activityService.getClosedOperationsStream(clubId).listen(
      (activities) {
        _closedActivitiesLoadTimer?.cancel();
        _closedActivities = activities;
        _isLoadingClosed = false;
        _isClosedLoadStalled = false;
        notifyListeners();
        debugPrint(
          '📦 ActivityProvider: ${activities.length} closed events loaded',
        );
      },
      onError: (error) {
        _closedActivitiesLoadTimer?.cancel();
        _isLoadingClosed = false;
        _isClosedLoadStalled = false;
        notifyListeners();
        debugPrint('❌ ActivityProvider closed error: $error');
      },
    );
  }

  /// Start luisteren naar activiteiten (operations + piscine)
  void listenToActivities(String clubId, {String? currentUserId}) {
    _currentClubId = clubId;
    if (currentUserId != null) _currentUserId = currentUserId;
    // Cancel any existing subscription to prevent memory leaks
    _activitiesSubscription?.cancel();

    _isLoading = true;
    _isLoadStalled = false;
    _errorMessage = null;
    notifyListeners();
    _activitiesLoadTimer?.cancel();
    _activitiesLoadTimer = Timer(loadTimeout, () {
      if (!_isLoading) return;
      _isLoading = false;
      _isLoadStalled = true;
      notifyListeners();
    });

    _activitiesSubscription = _activityService
        .getAllActivitiesStream(
      clubId,
      includeClosed: _includePast,
      currentUserId: _currentUserId,
    )
        .listen(
      (activities) {
        _activitiesLoadTimer?.cancel();
        _activities = activities;
        _isLoading = false;
        _isLoadStalled = false;
        _errorMessage = null;
        notifyListeners();

        debugPrint(
          '📋 ActivityProvider: ${activities.length} activities loaded',
        );
      },
      onError: (error) {
        _activitiesLoadTimer?.cancel();
        _errorMessage = error.toString();
        _isLoading = false;
        _isLoadStalled = false;
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

  void retryActivities() {
    final clubId = _currentClubId;
    if (clubId != null) listenToActivities(clubId);
  }

  void retryClosedActivities() {
    final clubId = _closedClubId;
    if (clubId == null) return;
    _closedSubscribed = false;
    _closedActivitiesSubscription?.cancel();
    listenToClosedActivities(clubId);
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
