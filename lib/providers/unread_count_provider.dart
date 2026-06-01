import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:app_badge_plus/app_badge_plus.dart';
import '../services/unread_count_service.dart';
import '../services/local_read_tracker.dart';

/// Provider die ongelezen tellingen berekent via lokale timestamps
/// + Firestore count() queries. Periodic refresh elke 60 seconden.
///
/// ANR-preventie:
/// - Cached counts worden direct getoond bij app start
/// - Firestore refresh gebeurt non-blocking na eerste frame
/// - Queries zijn gelimiteerd (max 10 operaties, max 5 sessies)
///
/// Na elke refresh worden de counts teruggeschreven naar het member document
/// zodat de Cloud Functions het correcte badge-aantal gebruiken bij push notifications.
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
  String? _userId;
  List<String> _roles = const [];
  bool _includeAllTeamChannels = false;
  String? _plongeurCode;
  String? _targetFormationLevel;

  // === Cache keys voor SharedPreferences ===
  static const _cachePrefix = 'unread_cache_';
  static const _cacheTimestampKey = '${_cachePrefix}timestamp';

  /// Cache geldigheid: 5 minuten
  static const Duration _cacheTTL = Duration(minutes: 5);

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
      {List<String> roles = const [],
      bool includeAllTeamChannels = false,
      String? plongeurCode,
      String? targetFormationLevel}) async {
    if (_isListening) {
      debugPrint('ℹ️ UnreadCountProvider: al actief');
      return;
    }

    debugPrint(
        '🔔 UnreadCountProvider: start periodic refresh (roles: $roles)');
    _clubId = clubId;
    _userId = userId;
    _roles = roles;
    _includeAllTeamChannels = includeAllTeamChannels;
    _plongeurCode = plongeurCode;
    _targetFormationLevel = targetFormationLevel;
    _isListening = true;

    // Initialiseer LocalReadTracker
    await _tracker.init();

    // Laad cached counts direct (geen netwerk nodig, instant)
    await _loadCachedCounts();

    // Refresh in achtergrond (niet blocking)
    unawaited(refresh());

    // Periodic refresh elke 60 seconden
    _refreshTimer = Timer.periodic(const Duration(seconds: 60), (_) {
      refresh();
    });
  }

  /// Laad cached counts uit SharedPreferences (instant, geen netwerk)
  Future<void> _loadCachedCounts() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final timestamp = prefs.getInt(_cacheTimestampKey) ?? 0;
      final cacheAge = DateTime.now().millisecondsSinceEpoch - timestamp;

      // Gebruik cache als die niet te oud is
      if (cacheAge < _cacheTTL.inMilliseconds) {
        _announcements = prefs.getInt('${_cachePrefix}announcements') ?? 0;
        _eventMessages = prefs.getInt('${_cachePrefix}event_messages') ?? 0;
        _teamMessages = prefs.getInt('${_cachePrefix}team_messages') ?? 0;
        _sessionMessages = prefs.getInt('${_cachePrefix}session_messages') ?? 0;
        debugPrint(
            '💾 Cached counts geladen: ann=$_announcements evt=$_eventMessages team=$_teamMessages sess=$_sessionMessages');
        notifyListeners();
      }
    } catch (e) {
      debugPrint('⚠️ Cache load error (niet erg): $e');
    }
  }

  /// Sla huidige counts op in SharedPreferences cache
  Future<void> _saveCachedCounts() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await Future.wait([
        prefs.setInt('${_cachePrefix}announcements', _announcements),
        prefs.setInt('${_cachePrefix}event_messages', _eventMessages),
        prefs.setInt('${_cachePrefix}team_messages', _teamMessages),
        prefs.setInt('${_cachePrefix}session_messages', _sessionMessages),
        prefs.setInt(_cacheTimestampKey, DateTime.now().millisecondsSinceEpoch),
      ]);
    } catch (e) {
      debugPrint('⚠️ Cache save error (niet erg): $e');
    }
  }

  /// Herbereken alle counts. Wordt aangeroepen:
  /// - Bij app start (via listen, non-blocking)
  /// - Elke 60 seconden (periodic timer)
  /// - Na markAsRead in een chat screen
  /// - Bij app resume
  /// Na berekening worden de counts naar Firestore geschreven (badge sync).
  Future<void> refresh() async {
    if (_clubId == null || _isRefreshing) return;

    _isRefreshing = true;
    try {
      final counts = await _service.refreshAllCounts(
        _clubId!,
        _roles,
        includeAllTeamChannels: _includeAllTeamChannels,
        plongeurCode: _plongeurCode,
        targetFormationLevel: _targetFormationLevel,
      );
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

        // Badge direct bijwerken (iOS/Android app icon)
        _updateBadge(total);

        // Cache bijwerken in achtergrond
        unawaited(_saveCachedCounts());
      }

      // Sync counts terug naar Firestore member document
      // zodat Cloud Functions het correcte badge-aantal gebruiken
      await _syncCountsToFirestore(
        newAnnouncements,
        newEventMessages,
        newTeamMessages,
        newSessionMessages,
      );
    } catch (e) {
      debugPrint('❌ UnreadCountProvider refresh error: $e');
    } finally {
      _isRefreshing = false;
    }
  }

  /// Schrijf de lokaal berekende counts terug naar het Firestore member document.
  /// Dit synchroniseert de server-side unread_counts (gebruikt door Cloud Functions
  /// voor APNs badge) met de client-side LocalReadTracker counts.
  ///
  /// BELANGRIJK (Fix #2): we gebruiken dot-notation per veld en schrijven
  /// `unread_counts.total` NIET vanuit de client. De Cloud Functions beheren
  /// `total` via `FieldValue.increment()`. Een volledige map-overwrite zou
  /// atomische increments die tussen onze read en write plaatsvonden wegvagen
  /// (race condition) en de badge laten terugspringen naar een stale waarde.
  Future<void> _syncCountsToFirestore(
    int announcements,
    int eventMessages,
    int teamMessages,
    int sessionMessages,
  ) async {
    if (_clubId == null || _userId == null) return;

    try {
      final memberRef = FirebaseFirestore.instance
          .collection('clubs')
          .doc(_clubId!)
          .collection('members')
          .doc(_userId!);

      await memberRef.update({
        'unread_counts.announcements': announcements,
        'unread_counts.event_messages': eventMessages,
        'unread_counts.team_messages': teamMessages,
        'unread_counts.session_messages': sessionMessages,
        'unread_counts.last_updated': FieldValue.serverTimestamp(),
      });
      debugPrint(
          '🔄 Badge sync: wrote unread_counts (ann=$announcements evt=$eventMessages team=$teamMessages sess=$sessionMessages) — total managed server-side');
    } catch (e) {
      debugPrint('⚠️ Badge sync failed: $e');
    }
  }

  /// Update iOS/Android app icon badge na de huidige UI frame.
  /// Deferred via addPostFrameCallback om de main thread niet te blokkeren
  /// tijdens zware Firestore refresh operaties (voorkomt ANR).
  void _updateBadge(int count) {
    // app_badge_plus has no web implementation — skip on web (fixes CALYMOB-F)
    if (kIsWeb) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      try {
        AppBadgePlus.updateBadge(count);
        debugPrint('🔴 Badge updated: $count');
      } catch (e) {
        debugPrint('⚠️ Badge update failed: $e');
      }
    });
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
    _userId = null;
    _roles = const [];
    _includeAllTeamChannels = false;
    _plongeurCode = null;
    _targetFormationLevel = null;
    _announcements = 0;
    _eventMessages = 0;
    _teamMessages = 0;
    _sessionMessages = 0;
    _tracker.resetAll();
    _clearCache();
    notifyListeners();
  }

  /// Wis de cached counts (bij logout)
  Future<void> _clearCache() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final keys = prefs.getKeys().where((k) => k.startsWith(_cachePrefix));
      for (final key in keys) {
        await prefs.remove(key);
      }
    } catch (e) {
      debugPrint('⚠️ Cache clear error: $e');
    }
  }

  @override
  void dispose() {
    stopListening();
    super.dispose();
  }
}
