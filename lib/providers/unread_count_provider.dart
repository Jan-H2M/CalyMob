import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:app_badge_plus/app_badge_plus.dart';
import '../services/unread_count_service.dart';
import '../services/local_read_tracker.dart';
import '../services/cursor_unread_count_service.dart';
import '../services/read_state_service.dart';
import '../services/feature_flag_service.dart';
import '../models/unread_cursor_feature_flag.dart';
import '../models/read_state.dart';

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
  UnreadCountProvider({
    UnreadCountService? service,
    LocalReadTracker? tracker,
    ReadStateService? readState,
    CursorUnreadCountService? cursorService,
    FeatureFlagService? featureFlags,
    Future<Map<String, int>> Function()? legacyRefresh,
    Future<CursorUnreadBreakdown> Function()? cursorRefresh,
    Future<void> Function()? cursorBootstrap,
    Future<void> Function(int, int, int, int)? legacySync,
    void Function(int)? badgeUpdater,
    Stream<UnreadCursorFeatureFlag> Function(String clubId)? flagStream,
    Future<SharedPreferences> Function()? preferencesLoader,
    @visibleForTesting
    Future<void> Function(String clubId, String userId, String token)?
    cacheBeforeCommit,
  }) : _service =
           service ?? (legacyRefresh == null ? UnreadCountService() : null),
       _tracker = tracker ?? LocalReadTracker(),
       _readState =
           readState ?? (cursorRefresh == null ? ReadStateService() : null),
       _cursorService =
           cursorService ??
           (cursorRefresh == null ? CursorUnreadCountService() : null),
       _featureFlags =
           featureFlags ?? (flagStream == null ? FeatureFlagService() : null),
       _legacyRefresh = legacyRefresh,
       _cursorRefresh = cursorRefresh,
       _cursorBootstrap = cursorBootstrap,
       _legacySync = legacySync,
       _badgeUpdater = badgeUpdater,
       _flagStream = flagStream,
       _preferencesLoader =
           preferencesLoader ?? SharedPreferences.getInstance,
       _cacheBeforeCommit = cacheBeforeCommit;

  final UnreadCountService? _service;
  final LocalReadTracker _tracker;
  final ReadStateService? _readState;
  final CursorUnreadCountService? _cursorService;
  final FeatureFlagService? _featureFlags;
  final Future<Map<String, int>> Function()? _legacyRefresh;
  final Future<CursorUnreadBreakdown> Function()? _cursorRefresh;
  final Future<void> Function()? _cursorBootstrap;
  final Future<void> Function(int, int, int, int)? _legacySync;
  final void Function(int)? _badgeUpdater;
  final Stream<UnreadCursorFeatureFlag> Function(String clubId)? _flagStream;
  final Future<SharedPreferences> Function() _preferencesLoader;
  final Future<void> Function(String clubId, String userId, String token)?
  _cacheBeforeCommit;

  int _announcements = 0;
  int _eventMessages = 0;
  int _teamMessages = 0;
  int _sessionMessages = 0;
  bool _isListening = false;
  bool _isRefreshing = false;
  bool _refreshQueued = false;
  final List<Completer<void>> _refreshWaiters = <Completer<void>>[];
  int _refreshGeneration = 0;
  int _flagStreamGeneration = 0;
  int _cacheGeneration = 0;
  int _cacheWriteSequence = 0;
  Future<void> _cacheMutationTail = Future<void>.value();

  Timer? _refreshTimer;
  StreamSubscription<UnreadCursorFeatureFlag>? _flagSubscription;
  UnreadCursorV1Mode _cursorMode = UnreadCursorV1Mode.off;
  bool _cursorReady = false;
  String? _clubId;
  String? _userId;
  List<String> _roles = const [];
  bool _includeAllTeamChannels = false;
  String? _plongeurCode;
  String? _targetFormationLevel;
  bool _formationActive = false;

  // === Cache keys voor SharedPreferences ===
  static const _legacyCachePrefix = 'unread_cache_';
  static const _cacheV2Prefix = 'unread_cache_v2_';
  static const _cacheCommitSuffix = 'commit_token';

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
  int get communication => _announcements + _teamMessages + _sessionMessages;
  UnreadCursorV1Mode get cursorMode => _cursorMode;
  bool get isCursorReady => _cursorReady;
  bool get isListening => _isListening;

  /// Cursor acknowledgements are intentionally available only in ON mode.
  /// Legacy LocalReadTracker calls remain the sole behaviour in OFF/shadow.
  bool get usesCursorReadState =>
      _cursorMode == UnreadCursorV1Mode.on && _cursorReady;

  Future<void> markAnnouncementSeen() => _acknowledge(
    (clubId, userId) => _readState!.markAnnouncementSeen(clubId, userId),
  );

  Future<void> markEventsSeen() => _acknowledge(
    (clubId, userId) =>
        _readState!.markSectionSeen(clubId, userId, ReadStateSection.events),
  );

  Future<void> markCommunicationSeen() async {
    await markAnnouncementsSeen();
    await markTeamsSeen();
    await markSessionsSeen();
  }

  Future<void> markAnnouncementsSeen() => markAnnouncementSeen();

  Future<void> markTeamsSeen() => _acknowledge(
    (clubId, userId) =>
        _readState!.markSectionSeen(clubId, userId, ReadStateSection.teams),
  );

  Future<void> markSessionsSeen() => _acknowledge(
    (clubId, userId) =>
        _readState!.markSectionSeen(clubId, userId, ReadStateSection.sessions),
  );

  Future<void> markEventConversationSeen(String operationId) => _acknowledge(
    (clubId, userId) =>
        _readState!.markEventConversationSeen(clubId, userId, operationId),
  );

  Future<void> markTeamChannelSeen(String channelId) => _acknowledge(
    (clubId, userId) =>
        _readState!.markTeamChannelSeen(clubId, userId, channelId),
  );

  Future<void> markSessionChatSeen(String scopeId) => _acknowledge(
    (clubId, userId) =>
        _readState!.markSessionChatSeen(clubId, userId, scopeId),
  );

  Future<void> _acknowledge(
    Future<void> Function(String clubId, String userId) action,
  ) async {
    if (!usesCursorReadState || _clubId == null || _userId == null) return;
    await action(_clubId!, _userId!);
    await refresh();
  }

  /// Start periodic refresh voor alle berichttypes.
  /// [roles] zijn de clubStatuten van de user (bijv. ['accueil', 'encadrant']).
  void listen(
    String clubId,
    String userId, {
    List<String> roles = const [],
    bool includeAllTeamChannels = false,
    String? plongeurCode,
    String? targetFormationLevel,
    bool formationActive = false,
  }) async {
    if (_isListening) {
      final contextChanged =
          _clubId != clubId ||
          _userId != userId ||
          !listEquals(_roles, roles) ||
          _includeAllTeamChannels != includeAllTeamChannels ||
          _plongeurCode != plongeurCode ||
          _targetFormationLevel != targetFormationLevel ||
          _formationActive != formationActive;

      if (!contextChanged) {
        debugPrint('ℹ️ UnreadCountProvider: al actief');
        return;
      }

      debugPrint('🔄 UnreadCountProvider: context bijgewerkt (roles: $roles)');
      _clubId = clubId;
      _userId = userId;
      _roles = List<String>.from(roles);
      _includeAllTeamChannels = includeAllTeamChannels;
      _plongeurCode = plongeurCode;
      _targetFormationLevel = targetFormationLevel;
      _formationActive = formationActive;
      _refreshGeneration++;
      _cacheGeneration++;
      _cursorMode = UnreadCursorV1Mode.off;
      _cursorReady = false;
      _clearDisplayedCountsForContextChange();
      final listenGeneration = _refreshGeneration;

      await _tracker.init();
      await _loadCachedCounts(clubId, userId, listenGeneration);
      if (!_isListenContextCurrent(clubId, userId, listenGeneration)) return;
      _listenToCursorFlag(clubId);
      unawaited(refresh());
      return;
    }

    debugPrint(
      '🔔 UnreadCountProvider: start periodic refresh (roles: $roles)',
    );
    _clubId = clubId;
    _userId = userId;
    _roles = List<String>.from(roles);
    _includeAllTeamChannels = includeAllTeamChannels;
    _plongeurCode = plongeurCode;
    _targetFormationLevel = targetFormationLevel;
    _formationActive = formationActive;
    _isListening = true;
    final listenGeneration = _refreshGeneration;

    // The legacy tracker remains initialized for OFF/shadow coexistence. ON
    // never writes it; Phase 3 moves the screen-level acknowledgements.
    await _tracker.init();

    // Laad cached counts direct (geen netwerk nodig, instant)
    await _loadCachedCounts(clubId, userId, listenGeneration);
    if (!_isListenContextCurrent(clubId, userId, listenGeneration)) return;

    _listenToCursorFlag(clubId);

    // Refresh in achtergrond (niet blocking)
    unawaited(refresh());
    _configureRefreshTimer();
  }

  bool _isListenContextCurrent(
    String clubId,
    String userId,
    int generation,
  ) =>
      _isListening &&
      _clubId == clubId &&
      _userId == userId &&
      _refreshGeneration == generation;

  void _listenToCursorFlag(String clubId) {
    final streamGeneration = ++_flagStreamGeneration;
    _flagSubscription?.cancel();
    final stream =
        _flagStream?.call(clubId) ?? _featureFlags!.unreadCursorV1(clubId);
    _flagSubscription = stream.listen(
      (flag) {
        if (streamGeneration == _flagStreamGeneration) {
          _onCursorFlag(flag);
        }
      },
      onError: (Object error, StackTrace stackTrace) {
        if (streamGeneration != _flagStreamGeneration) return;
        debugPrint('⚠️ unread cursor feature flag stream failed: $error');
        _onCursorFlag(UnreadCursorFeatureFlag.defaults);
      },
    );
  }

  void _onCursorFlag(UnreadCursorFeatureFlag flag) {
    final next = flag.effectiveModeFor(_userId);
    if (next == _cursorMode) {
      if (next == UnreadCursorV1Mode.on && !_cursorReady) {
        unawaited(refresh());
      }
      return;
    }
    _cursorMode = next;
    _cursorReady = false;
    _refreshGeneration++;
    debugPrint('🔀 unread cursor v1 mode=$_cursorMode');
    _configureRefreshTimer();
    notifyListeners();
    unawaited(refresh());
  }

  void _configureRefreshTimer() {
    _refreshTimer?.cancel();
    final interval = usesCursorReadState
        ? const Duration(minutes: 5)
        : const Duration(seconds: 60);
    _refreshTimer = Timer.periodic(interval, (_) => refresh());
  }

  /// Laad cached counts uit SharedPreferences (instant, geen netwerk)
  String _cachePrefixFor(String clubId, String userId) {
    final identity = base64Url
        .encode(utf8.encode('$clubId\u0000$userId'))
        .replaceAll('=', '');
    return '$_cacheV2Prefix${identity}_';
  }

  String _cacheSnapshotPrefix(String prefix, String token) =>
      '${prefix}snapshot_${token}_';

  Future<void> _withCacheMutationLock(
    Future<void> Function() operation,
  ) {
    final result = _cacheMutationTail.then<void>((_) => operation());
    _cacheMutationTail = result.then<void>(
      (_) {},
      onError: (Object _, StackTrace __) {},
    );
    return result;
  }

  Future<void> _removeCacheSnapshot(
    SharedPreferences prefs,
    String prefix,
    String token,
  ) async {
    final snapshotPrefix = _cacheSnapshotPrefix(prefix, token);
    await Future.wait([
      prefs.remove('${snapshotPrefix}announcements'),
      prefs.remove('${snapshotPrefix}event_messages'),
      prefs.remove('${snapshotPrefix}team_messages'),
      prefs.remove('${snapshotPrefix}session_messages'),
      prefs.remove('${snapshotPrefix}timestamp'),
    ]);
  }

  Future<void> _removeLegacyGlobalCache(SharedPreferences prefs) async {
    await Future.wait([
      prefs.remove('${_legacyCachePrefix}announcements'),
      prefs.remove('${_legacyCachePrefix}event_messages'),
      prefs.remove('${_legacyCachePrefix}team_messages'),
      prefs.remove('${_legacyCachePrefix}session_messages'),
      prefs.remove('${_legacyCachePrefix}timestamp'),
    ]);
  }

  Future<void> _loadCachedCounts(
    String clubId,
    String userId,
    int generation,
  ) async {
    try {
      final prefs = await _preferencesLoader();
      await _removeLegacyGlobalCache(prefs);
      final prefix = _cachePrefixFor(clubId, userId);
      final commitKey = '$prefix$_cacheCommitSuffix';
      final token = prefs.getString(commitKey);
      if (token == null || token.isEmpty) return;
      final snapshotPrefix = _cacheSnapshotPrefix(prefix, token);
      final timestamp = prefs.getInt('${snapshotPrefix}timestamp');
      final announcements = prefs.getInt('${snapshotPrefix}announcements');
      final eventMessages = prefs.getInt('${snapshotPrefix}event_messages');
      final teamMessages = prefs.getInt('${snapshotPrefix}team_messages');
      final sessionMessages = prefs.getInt('${snapshotPrefix}session_messages');
      if (timestamp == null ||
          announcements == null ||
          eventMessages == null ||
          teamMessages == null ||
          sessionMessages == null ||
          prefs.getString(commitKey) != token) {
        return;
      }
      final cacheAge = DateTime.now().millisecondsSinceEpoch - timestamp;

      // Gebruik cache als die niet te oud is
      if (cacheAge >= 0 && cacheAge < _cacheTTL.inMilliseconds) {
        if (!_isListenContextCurrent(clubId, userId, generation)) return;
        _announcements = announcements;
        _eventMessages = eventMessages;
        _teamMessages = teamMessages;
        _sessionMessages = sessionMessages;
        debugPrint(
          '💾 Cached counts geladen: ann=$_announcements evt=$_eventMessages team=$_teamMessages sess=$_sessionMessages',
        );
        notifyListeners();
      }
    } catch (e) {
      debugPrint('⚠️ Cache load error (niet erg): $e');
    }
  }

  /// Sla huidige counts op in SharedPreferences cache
  Future<void> _saveCachedCounts() async {
    final clubId = _clubId;
    final userId = _userId;
    if (clubId == null || userId == null) return;
    final generation = _cacheGeneration;
    final announcements = _announcements;
    final eventMessages = _eventMessages;
    final teamMessages = _teamMessages;
    final sessionMessages = _sessionMessages;
    final savedAt = DateTime.now().millisecondsSinceEpoch;
    final token =
        '${DateTime.now().microsecondsSinceEpoch}_${generation}_${++_cacheWriteSequence}';
    try {
      final prefs = await _preferencesLoader();
      if (generation != _cacheGeneration) return;
      final prefix = _cachePrefixFor(clubId, userId);
      final snapshotPrefix = _cacheSnapshotPrefix(prefix, token);
      final commitKey = '$prefix$_cacheCommitSuffix';

      // Snapshot fields have a unique namespace. The commit token is written
      // last, so a crash or concurrent save can never expose mixed counts.
      await Future.wait([
        prefs.setInt('${snapshotPrefix}announcements', announcements),
        prefs.setInt('${snapshotPrefix}event_messages', eventMessages),
        prefs.setInt('${snapshotPrefix}team_messages', teamMessages),
        prefs.setInt('${snapshotPrefix}session_messages', sessionMessages),
      ]);
      await prefs.setInt('${snapshotPrefix}timestamp', savedAt);
      await _cacheBeforeCommit?.call(clubId, userId, token);

      await _withCacheMutationLock(() async {
        if (generation != _cacheGeneration) {
          await _removeCacheSnapshot(prefs, prefix, token);
          return;
        }

        // A logout clear may have removed a staged snapshot while this save
        // was waiting for the commit lock. Never publish an incomplete one.
        if (prefs.getInt('${snapshotPrefix}announcements') == null ||
            prefs.getInt('${snapshotPrefix}event_messages') == null ||
            prefs.getInt('${snapshotPrefix}team_messages') == null ||
            prefs.getInt('${snapshotPrefix}session_messages') == null ||
            prefs.getInt('${snapshotPrefix}timestamp') == null) {
          await _removeCacheSnapshot(prefs, prefix, token);
          return;
        }

        final previousToken = prefs.getString(commitKey);
        await prefs.setString(commitKey, token);
        if (generation != _cacheGeneration) {
          // The lock prevents a newer commit from appearing between this
          // ownership check and removal.
          if (prefs.getString(commitKey) == token) {
            await prefs.remove(commitKey);
          }
          await _removeCacheSnapshot(prefs, prefix, token);
          return;
        }
        if (previousToken != null && previousToken != token) {
          await _removeCacheSnapshot(prefs, prefix, previousToken);
        }
      });
    } catch (e) {
      debugPrint('⚠️ Cache save error (niet erg): $e');
    }
  }

  void _clearDisplayedCountsForContextChange() {
    _announcements = 0;
    _eventMessages = 0;
    _teamMessages = 0;
    _sessionMessages = 0;
    notifyListeners();
    _updateBadge(0);
  }

  /// Herbereken alle counts. Wordt aangeroepen:
  /// - Bij app start (via listen, non-blocking)
  /// - Elke 60 seconden (periodic timer)
  /// - Na markAsRead in een chat screen
  /// - Bij app resume
  /// Na berekening worden de counts naar Firestore geschreven (badge sync).
  Future<void> refresh() {
    if (_clubId == null) return Future<void>.value();
    final completer = Completer<void>();
    _refreshWaiters.add(completer);
    _refreshQueued = true;
    if (!_isRefreshing) {
      unawaited(_drainRefreshQueue());
    }
    return completer.future;
  }

  Future<void> _drainRefreshQueue() async {
    if (_isRefreshing) return;
    _isRefreshing = true;
    try {
      do {
        _refreshQueued = false;
        try {
          await _refreshOnce();
        } catch (error, stackTrace) {
          debugPrint('❌ UnreadCountProvider refresh error: $error');
          debugPrintStack(stackTrace: stackTrace);
        }
      } while (_refreshQueued);
    } finally {
      _isRefreshing = false;
      final waiters = List<Completer<void>>.from(_refreshWaiters);
      _refreshWaiters.clear();
      for (final waiter in waiters) {
        if (!waiter.isCompleted) waiter.complete();
      }
    }
  }

  Future<void> _refreshOnce() async {
    final clubId = _clubId;
    final userId = _userId;
    if (clubId == null) return;
    final generation = _refreshGeneration;
    final mode = _cursorMode;

    if (mode == UnreadCursorV1Mode.on && userId != null) {
      await _refreshCursorMode(
        clubId: clubId,
        userId: userId,
        generation: generation,
      );
      return;
    }

    final counts = await _loadLegacyCounts(clubId);
    if (!_isCurrent(generation, mode, clubId, userId)) return;
    final values = _legacyValues(counts);
    _applyCounts(values[0], values[1], values[2], values[3], source: 'legacy');

    // Sync counts terug naar Firestore member document zodat legacy Cloud
    // Functions het correcte badge-aantal gebruiken.
    await (_legacySync?.call(values[0], values[1], values[2], values[3]) ??
        _syncCountsToFirestore(values[0], values[1], values[2], values[3]));
    if (!_isCurrent(generation, mode, clubId, userId)) return;

    if (mode == UnreadCursorV1Mode.shadow && userId != null) {
      unawaited(_refreshShadowCounts(clubId, userId, generation));
    }
  }

  Future<void> _refreshCursorMode({
    required String clubId,
    required String userId,
    required int generation,
  }) async {
    if (!_cursorReady) {
      // Keep a complete legacy result visible while the server performs the
      // one-time handover. A failed legacy refresh leaves cached/current values
      // untouched instead of flashing zero.
      try {
        final legacy = await _loadLegacyCounts(clubId);
        if (_isCurrent(generation, UnreadCursorV1Mode.on, clubId, userId)) {
          final values = _legacyValues(legacy);
          _applyCounts(
            values[0],
            values[1],
            values[2],
            values[3],
            source: 'legacy-handover',
          );
        }
      } catch (error) {
        debugPrint(
          '⚠️ legacy fallback refresh failed during cursor handover: '
          '$error',
        );
      }
      if (!_isCurrent(generation, UnreadCursorV1Mode.on, clubId, userId)) {
        return;
      }

      try {
        await (_cursorBootstrap?.call() ??
            () async {
              final snapshot = await _tracker.exportReadState();
              await _readState!.bootstrapFromLegacy(clubId, snapshot);
            }());
      } catch (error) {
        debugPrint(
          '⚠️ unread cursor bootstrap failed; keeping legacy '
          'authority: $error',
        );
        return;
      }
      if (!_isCurrent(generation, UnreadCursorV1Mode.on, clubId, userId)) {
        return;
      }
    }

    final cursor = await _loadCursorCounts(clubId, userId);
    if (!_isCurrent(generation, UnreadCursorV1Mode.on, clubId, userId)) {
      return;
    }

    final becameReady = !_cursorReady;
    _cursorReady = true;
    if (becameReady) _configureRefreshTimer();
    _applyCounts(
      cursor.announcements,
      cursor.events,
      cursor.teams,
      cursor.sessions,
      source: 'cursor',
      notifyEvenIfUnchanged: becameReady,
    );
  }

  Future<void> _refreshShadowCounts(
    String clubId,
    String userId,
    int generation,
  ) async {
    try {
      final cursor = await _loadCursorCounts(clubId, userId);
      if (!_isCurrent(generation, UnreadCursorV1Mode.shadow, clubId, userId)) {
        return;
      }
      debugPrint(
        '🔎 unread cursor shadow legacy='
        '{ann=$_announcements,event=$_eventMessages,team=$_teamMessages,session=$_sessionMessages} '
        'cursor=${cursor.toLegacyMap()} total=${cursor.total}',
      );
    } catch (error) {
      debugPrint('⚠️ unread cursor shadow refresh failed: $error');
    }
  }

  Future<Map<String, int>> _loadLegacyCounts(String clubId) =>
      _legacyRefresh?.call() ??
      _service!.refreshAllCounts(
        clubId,
        _roles,
        includeAllTeamChannels: _includeAllTeamChannels,
        plongeurCode: _plongeurCode,
        targetFormationLevel: _targetFormationLevel,
        formationActive: _formationActive,
      );

  List<int> _legacyValues(Map<String, int> counts) => <int>[
    counts['announcements'] ?? 0,
    counts['event_messages'] ?? 0,
    counts['team_messages'] ?? 0,
    counts['session_messages'] ?? 0,
  ];

  Future<CursorUnreadBreakdown> _loadCursorCounts(
    String clubId,
    String userId,
  ) =>
      _cursorRefresh?.call() ??
      _cursorService!.refreshAllCounts(
        clubId: clubId,
        userId: userId,
        roles: _roles,
        includeAllTeamChannels: _includeAllTeamChannels,
        plongeurCode: _plongeurCode,
        targetFormationLevel: _targetFormationLevel,
        formationActive: _formationActive,
      );

  bool _isCurrent(
    int generation,
    UnreadCursorV1Mode mode,
    String clubId,
    String? userId,
  ) =>
      generation == _refreshGeneration &&
      mode == _cursorMode &&
      clubId == _clubId &&
      userId == _userId;

  void _applyCounts(
    int announcements,
    int eventMessages,
    int teamMessages,
    int sessionMessages, {
    required String source,
    bool notifyEvenIfUnchanged = false,
  }) {
    if (announcements == _announcements &&
        eventMessages == _eventMessages &&
        teamMessages == _teamMessages &&
        sessionMessages == _sessionMessages) {
      // Cursor mode owns the OS icon, including an unchanged zero after a
      // cold start or foreground push.
      if (source == 'cursor') _updateBadge(total);
      if (notifyEvenIfUnchanged) notifyListeners();
      return;
    }
    _announcements = announcements;
    _eventMessages = eventMessages;
    _teamMessages = teamMessages;
    _sessionMessages = sessionMessages;
    debugPrint(
      '📊 $source unread counts: ann=$_announcements '
      'evt=$_eventMessages team=$_teamMessages sess=$_sessionMessages '
      '(communication=$communication total=$total)',
    );
    notifyListeners();
    _updateBadge(total);
    unawaited(_saveCachedCounts());
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
        '🔄 Badge sync: wrote unread_counts (ann=$announcements evt=$eventMessages team=$teamMessages sess=$sessionMessages) — total managed server-side',
      );
    } catch (e) {
      debugPrint('⚠️ Badge sync failed: $e');
    }
  }

  /// Update iOS/Android app icon badge na de huidige UI frame.
  /// Deferred via addPostFrameCallback om de main thread niet te blokkeren
  /// tijdens zware Firestore refresh operaties (voorkomt ANR).
  void _updateBadge(int count) {
    if (_badgeUpdater != null) {
      _badgeUpdater!(count);
      return;
    }
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
    _refreshGeneration++;
    _cacheGeneration++;
    _flagStreamGeneration++;
    _flagSubscription?.cancel();
    _flagSubscription = null;
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
    _formationActive = false;
    _cursorMode = UnreadCursorV1Mode.off;
    _cursorReady = false;
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
      final prefs = await _preferencesLoader();
      await _withCacheMutationLock(() async {
        final keys = prefs
            .getKeys()
            .where(
              (key) =>
                  key.startsWith(_cacheV2Prefix) ||
                  key.startsWith(_legacyCachePrefix),
            )
            .toList(growable: false);
        for (final key in keys) {
          await prefs.remove(key);
        }
      });
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
