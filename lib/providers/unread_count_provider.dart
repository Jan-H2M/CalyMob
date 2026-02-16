import 'dart:async';
import 'package:flutter/foundation.dart';
import '../services/unread_count_service.dart';
import '../services/local_read_tracker.dart';

/// Provider die ongelezen tellingen berekent via lokale timestamps
/// + Firestore count() queries. Periodic refresh elke 60 seconden.
class UnreadCountProvider extends ChangeNotifier {
  final UnreadCountService _service = UnreadCountService();
  final LocalReadTracker _tracker = LocalReadTracker();

  int _announcements = 0;
  int _eventMessages = 0;
  int _teamMessages = 0;
  int _sessionMessages = 0;
  bool _isListening = false;
  bool _isRefreshing = false;

  Timer? _refreshTimer;
  String? _clubId;
  List<String> _roles = const [];

  // === Getters (zelfde API als voorheen) ===

  int get total =>
      _announcements + _eventMessages + _teamMessages + _sessionMessages;
  int get announcements => _announcements;
  int get eventMessages => _eventMessages;
  int get teamMessages => _teamMessages;
  int get sessionMessages => _sessionMessages;
  int get medicalCertificates => 0;
  bool get isListening => _isListening;

  /// Start periodic refresh voor alle berichttypes.
  /// [roles] zijn de clubStatuten van de user (bijv. ['accueil', 'encadrant']).
  void listen(String clubId, String userId,
      {List<String> roles = const []}) async {
    if (_isListening) {
      debugPrint('ℹ️ UnreadCountProvider: al actief');
      return;
    }

    debugPrint(
        '🔔 UnreadCountProvider: start periodic refresh (roles: $roles)');
    _clubId = clubId;
    _roles = roles;
    _isListening = true;

    // Initialiseer LocalReadTracker
    await _tracker.init();

    // Eerste refresh direct
    await refresh();

    // Periodic refresh elke 60 seconden
    _refreshTimer = Timer.periodic(const Duration(seconds: 60), (_) {
      refresh();
    });
  }

  /// Herbereken alle counts. Wordt aangeroepen:
  /// - Bij app start (via listen)
  /// - Elke 60 seconden (periodic timer)
  /// - Na markAsRead in een chat screen
  /// - Bij app resume
  Future<void> refresh() async {
    if (_clubId == null || _isRefreshing) return;

    _isRefreshing = true;
    try {
      final counts = await _service.refreshAllCounts(_clubId!, _roles);

      final newAnnouncements = counts['announcements'] ?? 0;
      final newEventMessages = counts['event_messages'] ?? 0;
      final newTeamMessages = counts['team_messages'] ?? 0;
      final newSessionMessages = counts['session_messages'] ?? 0;

      // Alleen notifyListeners als er iets veranderd is
      if (newAnnouncements != _announcements ||
          newEventMessages != _eventMessages ||
          newTeamMessages != _teamMessages ||
          newSessionMessages != _sessionMessages) {
        _announcements = newAnnouncements;
        _eventMessages = newEventMessages;
        _teamMessages = newTeamMessages;
        _sessionMessages = newSessionMessages;
        debugPrint(
            '📊 Unread counts: ann=$_announcements evt=$_eventMessages team=$_teamMessages sess=$_sessionMessages (total: $total)');
        notifyListeners();
      }
    } catch (e) {
      debugPrint('❌ UnreadCountProvider refresh error: $e');
    } finally {
      _isRefreshing = false;
    }
  }

  /// Stop periodic refresh
  void stopListening() {
    _refreshTimer?.cancel();
    _refreshTimer = null;
    _isListening = false;
    debugPrint('🔕 UnreadCountProvider: periodic refresh gestopt');
  }

  /// Reset alles (bij logout)
  void clear() {
    stopListening();
    _clubId = null;
    _roles = const [];
    _announcements = 0;
    _eventMessages = 0;
    _teamMessages = 0;
    _sessionMessages = 0;
    _tracker.resetAll();
    notifyListeners();
  }

  @override
  void dispose() {
    stopListening();
    super.dispose();
  }
}
