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
  })  : _service =
            service ?? (legacyRefresh == null ? UnreadCountService() : null),
        _tracker = tracker ?? LocalReadTracker(),
        _readState =
            readState ?? (cursorRefresh == null ? ReadStateService() : null),
        _cursorService = cursorService ??
            (cursorRefresh == null ? CursorUnreadCountService() : null),
        _featureFlags =
            featureFlags ?? (flagStream == null ? FeatureFlagService() : null),
        _legacyRefresh = legacyRefresh,
        _cursorRefresh = cursorRefresh,
        _cursorBootstrap = cursorBootstrap,
        _legacySync = legacySync,
        _badgeUpdater = badgeUpdater,
        _flagStream = flagStream,
        _preferencesLoader = preferencesLoader ?? SharedPreferences.getInstance,
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
  int _listenGeneration = 0;
  int _flagStreamGeneration = 0;
  int _cacheGeneration = 0;
  int _cacheWriteSequence = 0;
  Future<void> _cacheMutationTail = Future<void>.value();

  Timer? _refreshTimer;
  StreamSubscription<UnreadCursorFeatureFlag>? _flagSubscription;
  UnreadCursorV1Mode _cursorMode = UnreadCursorV1Mode.off;
  bool _cursorReady = false;
  bool _flagResolved = false;
  bool _contextReady = false;
  bool _hasReliableBadgeCount = false;
  Object? _lastRefreshError;
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
  static const _cacheV3Prefix = 'unread_cache_v3_';
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
  bool get hasReliableBadgeCount =>
      _isListening &&
      _flagResolved &&
      _contextReady &&
      _hasReliableBadgeCount &&
      (_cursorMode != UnreadCursorV1Mode.on || _cursorReady);
  Object? get lastRefreshError => _lastRefreshError;

  /// Notification/deep-link navigation may start only after this identity's
  /// authority is known and its local namespace is active. Cursor bootstrap
  /// itself may still be retrying; screens then remain cursor-pending and
  /// never fall through to legacy acknowledgement.
  bool hasResolvedAuthorityFor(String clubId, String userId) =>
      _isListening &&
      _clubId == clubId &&
      _userId == userId &&
      _flagResolved &&
      _contextReady;

  /// Before the server flag resolves, the provider deliberately presents a
  /// cursor-pending authority. This prevents screens from briefly rendering
  /// or acknowledging through legacy state for a member who is effectively
  /// ON. A confirmed OFF/shadow (non-pilot) flag switches back to legacy.
  bool get usesCursorReadState =>
      _isListening && (!_flagResolved || _cursorMode == UnreadCursorV1Mode.on);

  Future<void> markAnnouncementSeen(
    String announcementId, {
    String? visibleReplyId,
    DateTime? visibleThroughAt,
  }) =>
      _acknowledge(
        (clubId, userId) => _readState!.markAnnouncementSeen(
          clubId,
          userId,
          announcementId,
          visibleReplyId: visibleReplyId,
        ),
        legacyKey: 'announcement_$announcementId',
        visibleThroughAt: visibleThroughAt,
      );

  Future<void> markEventsSeen() => _acknowledge(
        (clubId, userId) => _readState!
            .markSectionSeen(clubId, userId, ReadStateSection.events),
        legacySection: ReadStateSection.events,
      );

  Future<void> markCommunicationSeen() async {
    await markAnnouncementsSeen();
    await markTeamsSeen();
    await markSessionsSeen();
  }

  Future<void> markAnnouncementsSeen() => _acknowledge(
        (clubId, userId) => _readState!.markSectionSeen(
          clubId,
          userId,
          ReadStateSection.announcements,
        ),
        legacyKey: 'announcements',
      );

  Future<void> markTeamsSeen() => _acknowledge(
        (clubId, userId) =>
            _readState!.markSectionSeen(clubId, userId, ReadStateSection.teams),
        legacySection: ReadStateSection.teams,
      );

  Future<void> markSessionsSeen() => _acknowledge(
        (clubId, userId) => _readState!
            .markSectionSeen(clubId, userId, ReadStateSection.sessions),
        legacySection: ReadStateSection.sessions,
      );

  Future<void> markEventConversationSeen(
    String operationId, {
    required String visibleMessageId,
    DateTime? visibleThroughAt,
  }) =>
      _acknowledge(
        (clubId, userId) => _readState!.markEventConversationSeen(
          clubId,
          userId,
          operationId,
          visibleMessageId: visibleMessageId,
        ),
        legacyKey: 'operation_$operationId',
        visibleThroughAt: visibleThroughAt,
      );

  Future<void> markTeamChannelSeen(
    String channelId, {
    required String visibleMessageId,
    DateTime? visibleThroughAt,
  }) =>
      _acknowledge(
        (clubId, userId) => _readState!.markTeamChannelSeen(
          clubId,
          userId,
          channelId,
          visibleMessageId: visibleMessageId,
        ),
        legacyKey: 'team_$channelId',
        visibleThroughAt: visibleThroughAt,
      );

  Future<void> markSessionChatSeen(
    String scopeId, {
    required String visibleMessageId,
    String? sessionId,
    String? groupType,
    String? groupLevel,
    DateTime? visibleThroughAt,
  }) =>
      _acknowledge(
        (clubId, userId) => _readState!.markSessionChatSeen(
          clubId,
          userId,
          scopeId,
          visibleMessageId: visibleMessageId,
          sessionId: sessionId,
          groupType: groupType,
          groupLevel: groupLevel,
        ),
        legacyKey: 'session_${scopeId.replaceAll('__', '_')}',
        visibleThroughAt: visibleThroughAt,
      );

  Future<void> _acknowledge(
    Future<DateTime> Function(String clubId, String userId) action, {
    String? legacyKey,
    ReadStateSection? legacySection,
    DateTime? visibleThroughAt,
  }) async {
    final clubId = _clubId;
    final userId = _userId;
    final generation = _refreshGeneration;
    if (clubId == null || userId == null || !_flagResolved || !_contextReady) {
      throw StateError('Unread authority is not ready yet.');
    }
    final cursorAuthority = usesCursorReadState;
    if (cursorAuthority && !_cursorReady) {
      throw StateError('Cursor read state is not ready yet.');
    }

    Future<void> advanceRollbackState(DateTime timestamp) async {
      if (legacyKey != null) {
        await _tracker.markAsReadAtFor(clubId, userId, legacyKey, timestamp);
        return;
      }
      if (legacySection != null) {
        await _tracker.markSectionAsReadAtFor(
          clubId,
          userId,
          legacySection,
          timestamp,
        );
        return;
      }
      throw StateError('An unread acknowledgement needs a rollback key.');
    }

    Future<void> clearPendingMirror(DateTime through) async {
      if (legacyKey != null) {
        await _tracker.clearPendingReadMirrorFor(
          clubId,
          userId,
          legacyKey,
          through,
        );
      } else if (legacySection != null) {
        await _tracker.clearPendingSectionMirrorFor(
          clubId,
          userId,
          legacySection,
          through,
        );
      }
    }

    Future<void> recordPendingMirror(DateTime timestamp) async {
      if (legacyKey != null) {
        await _tracker.recordPendingReadMirrorFor(
          clubId,
          userId,
          legacyKey,
          timestamp,
        );
      } else if (legacySection != null) {
        await _tracker.recordPendingSectionMirrorFor(
          clubId,
          userId,
          legacySection,
          timestamp,
        );
      }
    }

    if (cursorAuthority) {
      final serverTimestamp = await action(clubId, userId);
      // Keep OFF rollback authority monotone with ON acknowledgements.
      await advanceRollbackState(serverTimestamp);
      await clearPendingMirror(serverTimestamp);
    } else {
      try {
        final serverTimestamp = await action(clubId, userId);
        await advanceRollbackState(serverTimestamp);
        await clearPendingMirror(serverTimestamp);
      } catch (error) {
        // A loaded Firestore snapshot timestamp is safe to retain while the
        // cursor mirror is offline. Never substitute DateTime.now(): a newer
        // message may have arrived between the visible snapshot and the local
        // write, and a client clock must not hide it after ON→OFF rollback.
        if (visibleThroughAt == null) rethrow;
        await advanceRollbackState(visibleThroughAt);
        await recordPendingMirror(visibleThroughAt);
        debugPrint('⚠️ Cursor mirror during legacy mode failed: $error');
      }
    }
    if (_isCurrent(
      generation,
      cursorAuthority ? UnreadCursorV1Mode.on : _cursorMode,
      clubId,
      userId,
    )) {
      await refresh();
    }
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
    final contextChanged = !_isListening ||
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

    // Invalidate the old listener before the first await. A late A emission
    // therefore cannot steer B (or a subsequent A) after a slow cache load.
    _flagStreamGeneration++;
    unawaited(_flagSubscription?.cancel() ?? Future<void>.value());
    _flagSubscription = null;
    _refreshGeneration++;
    _listenGeneration++;
    _cacheGeneration++;
    _clubId = clubId;
    _userId = userId;
    _roles = List<String>.from(roles);
    _includeAllTeamChannels = includeAllTeamChannels;
    _plongeurCode = plongeurCode;
    _targetFormationLevel = targetFormationLevel;
    _formationActive = formationActive;
    _isListening = true;
    _flagResolved = false;
    _contextReady = false;
    _cursorMode = UnreadCursorV1Mode.off;
    _cursorReady = false;
    _hasReliableBadgeCount = false;
    _lastRefreshError = null;
    // Authority is deliberately unknown until the server flag resolves. The
    // device badge is global and may still contain a legacy/cache value from
    // an earlier process or notification. Neutralise it synchronously now;
    // confirmed OFF/shadow restores its live legacy value after refresh,
    // while an eventual ON member can never retain a legacy 99+ during a slow
    // flag/bootstrap/query path.
    _clearDisplayedCountsForContextChange(clearOsBadge: true);
    final listenGeneration = _listenGeneration;
    _listenToCursorFlag(clubId, userId);

    await _tracker.init();
    await _tracker.activateContext(clubId, userId);
    if (!_isListenContextCurrent(clubId, userId, listenGeneration)) return;
    _contextReady = true;
    if (_flagResolved) {
      unawaited(_loadAuthorityCacheAndRefresh(
        clubId,
        userId,
        listenGeneration,
      ));
    }
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
      _listenGeneration == generation;

  void _listenToCursorFlag(String clubId, String userId) {
    final streamGeneration = _flagStreamGeneration;
    final stream =
        _flagStream?.call(clubId) ?? _featureFlags!.unreadCursorV1(clubId);
    _flagSubscription = stream.listen(
      (flag) {
        if (streamGeneration == _flagStreamGeneration &&
            clubId == _clubId &&
            userId == _userId) {
          _onCursorFlag(flag, clubId, userId);
        }
      },
      onError: (Object error, StackTrace stackTrace) {
        if (streamGeneration != _flagStreamGeneration) return;
        _lastRefreshError = error;
        notifyListeners();
        debugPrint('⚠️ unread cursor feature flag stream failed: $error');
        // Unknown authority is fail-closed: do not expose a legacy cache or
        // publish an OS badge until a real flag value arrives.
      },
    );
  }

  void _onCursorFlag(
    UnreadCursorFeatureFlag flag,
    String clubId,
    String userId,
  ) {
    final next = flag.effectiveModeFor(userId);
    final firstResolution = !_flagResolved;
    if (!firstResolution && next == _cursorMode) {
      if (_contextReady) unawaited(refresh());
      return;
    }
    _flagResolved = true;
    _cursorMode = next;
    _cursorReady = false;
    _hasReliableBadgeCount = false;
    _lastRefreshError = null;
    _refreshGeneration++;
    _cacheGeneration++;
    _clearDisplayedCountsForContextChange(
      clearOsBadge: next == UnreadCursorV1Mode.on,
    );
    debugPrint('🔀 unread cursor v1 mode=$_cursorMode');
    _configureRefreshTimer();
    if (_contextReady) {
      unawaited(_loadAuthorityCacheAndRefresh(
        clubId,
        userId,
        _listenGeneration,
      ));
    }
  }

  Future<void> _loadAuthorityCacheAndRefresh(
    String clubId,
    String userId,
    int generation,
  ) async {
    final cursorAuthority = _cursorMode == UnreadCursorV1Mode.on;
    final authority = cursorAuthority ? 'cursor' : 'legacy';
    // Cursor authority deliberately has no persistent startup cache. Even a
    // formerly canonical cache can be from a pre-fix/global identity and can
    // render the same transient 99+ symptom. Stay at zero until bootstrap and
    // one complete live canonical query succeed.
    if (!cursorAuthority) {
      await _loadCachedCounts(clubId, userId, generation, authority);
    }
    if (!_isListenContextCurrent(clubId, userId, generation) ||
        authority !=
            (_cursorMode == UnreadCursorV1Mode.on ? 'cursor' : 'legacy')) {
      return;
    }
    await refresh();
  }

  void _configureRefreshTimer() {
    _refreshTimer?.cancel();
    final interval = usesCursorReadState && _cursorReady
        ? const Duration(minutes: 5)
        : const Duration(seconds: 60);
    _refreshTimer = Timer.periodic(interval, (_) => refresh());
  }

  /// Laad cached counts uit SharedPreferences (instant, geen netwerk)
  String _cachePrefixFor(
    String clubId,
    String userId,
    String authority,
  ) {
    final identity = base64Url
        .encode(utf8.encode('$clubId\u0000$userId'))
        .replaceAll('=', '');
    return '$_cacheV3Prefix${identity}_${authority}_';
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
    String authority,
  ) async {
    try {
      final prefs = await _preferencesLoader();
      await _removeLegacyGlobalCache(prefs);
      final prefix = _cachePrefixFor(clubId, userId, authority);
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
        if (!_isListenContextCurrent(clubId, userId, generation) ||
            authority !=
                (_cursorMode == UnreadCursorV1Mode.on ? 'cursor' : 'legacy')) {
          return;
        }
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
  Future<void> _saveCachedCounts(String authority) async {
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
      final prefix = _cachePrefixFor(clubId, userId, authority);
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

  void _clearDisplayedCountsForContextChange({bool clearOsBadge = false}) {
    _announcements = 0;
    _eventMessages = 0;
    _teamMessages = 0;
    _sessionMessages = 0;
    notifyListeners();
    if (clearOsBadge) _updateBadgeImmediate(0);
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
          _lastRefreshError = error;
          notifyListeners();
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
    if (clubId == null || !_flagResolved || !_contextReady) return;
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
      try {
        await (_cursorBootstrap?.call() ??
            () async {
              final snapshot = await _tracker.exportReadState();
              await _readState!.bootstrapFromLegacy(clubId, userId, snapshot);
              await _tracker.clearPendingMirrorsUpTo(
                clubId,
                userId,
                snapshot,
              );
            }());
      } catch (error) {
        _lastRefreshError = error;
        notifyListeners();
        debugPrint(
          '⚠️ unread cursor bootstrap failed; keeping canonical UI '
          'fail-closed: $error',
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
    _lastRefreshError = null;
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
    _hasReliableBadgeCount = true;
    _lastRefreshError = null;
    if (announcements == _announcements &&
        eventMessages == _eventMessages &&
        teamMessages == _teamMessages &&
        sessionMessages == _sessionMessages) {
      // Cursor mode owns the OS icon, including an unchanged zero after a
      // cold start or foreground push.
      _updateBadge(total);
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
    if (source == 'legacy') {
      unawaited(_saveCachedCounts('legacy'));
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

  void _updateBadgeImmediate(int count) {
    if (_badgeUpdater != null) {
      _badgeUpdater!(count);
      return;
    }
    if (kIsWeb) return;
    try {
      AppBadgePlus.updateBadge(count);
      debugPrint('🔴 Badge immediately updated: $count');
    } catch (e) {
      debugPrint('⚠️ Immediate badge update failed: $e');
    }
  }

  /// Stop periodic refresh
  void stopListening() {
    _refreshTimer?.cancel();
    _refreshTimer = null;
    _isListening = false;
    _refreshGeneration++;
    _listenGeneration++;
    _cacheGeneration++;
    _flagStreamGeneration++;
    _flagSubscription?.cancel();
    _flagSubscription = null;
    _flagResolved = false;
    _contextReady = false;
    debugPrint('🔕 UnreadCountProvider: periodic refresh gestopt');
  }

  /// Reset alles (bij logout)
  Future<void> clear() async {
    final oldClubId = _clubId;
    final oldUserId = _userId;
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
    _hasReliableBadgeCount = false;
    _lastRefreshError = null;
    _announcements = 0;
    _eventMessages = 0;
    _teamMessages = 0;
    _sessionMessages = 0;
    _updateBadgeImmediate(0);
    notifyListeners();
    await Future.wait<void>([
      _tracker.deactivateContext(),
      if (oldClubId != null && oldUserId != null)
        _clearCacheFor(oldClubId, oldUserId),
    ]);
  }

  /// Wis alleen de cache van de uitgelogde identiteit. Een trailing A-write
  /// kan door generation+token ownership geen nieuwere B/A-cache verwijderen.
  Future<void> _clearCacheFor(String clubId, String userId) async {
    try {
      final prefs = await _preferencesLoader();
      await _withCacheMutationLock(() async {
        final identity = base64Url
            .encode(utf8.encode('$clubId\u0000$userId'))
            .replaceAll('=', '');
        final keys = prefs
            .getKeys()
            .where(
              (key) =>
                  key.startsWith('$_cacheV3Prefix${identity}_') ||
                  key.startsWith('$_cacheV2Prefix${identity}_') ||
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
