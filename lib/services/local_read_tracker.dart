import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/read_state.dart';

/// The legacy device-local read state that is handed to the server exactly
/// once when cursor v1 becomes authoritative for a member.
///
/// The section fallback preserves the old `2024-01-01`/fresh-install/global
/// baseline for conversations that have never been opened. Per-scope values
/// preserve the more recent timestamps of conversations that were opened.
@immutable
class LegacyReadStateSnapshot {
  const LegacyReadStateSnapshot({
    required this.fallbackLastSeenAt,
    required this.announcementsLastSeenAt,
    required this.eventsLastSeenAt,
    required this.teamsLastSeenAt,
    required this.sessionsLastSeenAt,
    this.announcementItems = const {},
    required this.eventConversations,
    required this.teamChannels,
    required this.sessionChats,
    this.pendingSections = const <ReadStateSection, DateTime>{},
    this.pendingAnnouncementItems = const <String, DateTime>{},
    this.pendingEventConversations = const <String, DateTime>{},
    this.pendingTeamChannels = const <String, DateTime>{},
    this.pendingSessionChats = const <String, DateTime>{},
  });

  final DateTime fallbackLastSeenAt;
  final DateTime announcementsLastSeenAt;
  final DateTime eventsLastSeenAt;
  final DateTime teamsLastSeenAt;
  final DateTime sessionsLastSeenAt;
  final Map<String, DateTime> announcementItems;
  final Map<String, DateTime> eventConversations;
  final Map<String, DateTime> teamChannels;
  final Map<String, DateTime> sessionChats;
  final Map<ReadStateSection, DateTime> pendingSections;
  final Map<String, DateTime> pendingAnnouncementItems;
  final Map<String, DateTime> pendingEventConversations;
  final Map<String, DateTime> pendingTeamChannels;
  final Map<String, DateTime> pendingSessionChats;

  Map<String, Object> toCallablePayload() => <String, Object>{
        'schemaVersion': 1,
        'fallbackLastSeenAtMs': fallbackLastSeenAt.millisecondsSinceEpoch,
        'announcementsLastSeenAtMs':
            announcementsLastSeenAt.millisecondsSinceEpoch,
        'eventsLastSeenAtMs': eventsLastSeenAt.millisecondsSinceEpoch,
        'teamsLastSeenAtMs': teamsLastSeenAt.millisecondsSinceEpoch,
        'sessionsLastSeenAtMs': sessionsLastSeenAt.millisecondsSinceEpoch,
        'announcementItems': announcementItems.map(
          (key, value) => MapEntry(key, value.millisecondsSinceEpoch),
        ),
        'eventConversations': eventConversations.map(
          (key, value) => MapEntry(key, value.millisecondsSinceEpoch),
        ),
        'teamChannels': teamChannels.map(
          (key, value) => MapEntry(key, value.millisecondsSinceEpoch),
        ),
        'sessionChats': sessionChats.map(
          (key, value) => MapEntry(key, value.millisecondsSinceEpoch),
        ),
        'pendingSections': pendingSections.map(
          (key, value) => MapEntry(key.id, value.millisecondsSinceEpoch),
        ),
        'pendingAnnouncementItems': pendingAnnouncementItems.map(
          (key, value) => MapEntry(key, value.millisecondsSinceEpoch),
        ),
        'pendingEventConversations': pendingEventConversations.map(
          (key, value) => MapEntry(key, value.millisecondsSinceEpoch),
        ),
        'pendingTeamChannels': pendingTeamChannels.map(
          (key, value) => MapEntry(key, value.millisecondsSinceEpoch),
        ),
        'pendingSessionChats': pendingSessionChats.map(
          (key, value) => MapEntry(key, value.millisecondsSinceEpoch),
        ),
      };
}

/// Lokale tracker die per conversatie bijhoudt wanneer de user
/// het laatst gelezen heeft. Gebruikt SharedPreferences.
///
/// Keys:
///   lastRead_announcements
///   lastRead_operation_{opId}
///   lastRead_team_{channelId}
///   lastRead_session_{sessionId}_{groupType}_{groupLevel}
///   localReadTracker_globalBaseline  (Fix #7 — "Marquer tout comme lu")
class LocalReadTracker {
  // v1 keys are intentionally read only by the one-time identity claim below.
  // They were global and therefore must never be consulted after another
  // member has become active on the same device.
  static const _legacyReadPrefix = 'lastRead_';
  static const _legacyFirstLaunchKey = 'localReadTracker_initialized';
  static const _legacyInstallBaselineKey = 'localReadTracker_installBaseline';
  static const _legacyGlobalBaselineKey = 'localReadTracker_globalBaseline';
  static const _v2Prefix = 'localReadTracker_v2_';
  static const _deviceInitializedKey = 'localReadTracker_v2_device_initialized';
  static const _deviceInstallBaselineKey =
      'localReadTracker_v2_device_install_baseline';
  static const _freshInstallOwnerKey =
      'localReadTracker_v2_fresh_install_owner';
  static const _legacyOwnerKey = 'localReadTracker_v2_legacy_owner';
  static final DateTime _defaultEpoch = DateTime(2024, 1, 1);
  SharedPreferences? _prefs;
  Future<void>? _initialization;
  String? _activeIdentity;
  String? _activePrefix;
  String? _activationIdentity;
  Future<void>? _activation;
  Future<void> _storageMutationTail = Future<void>.value();
  int _contextGeneration = 0;
  bool _deviceFreshThisRun = false;
  final Set<String> _freshSignalsConsumed = <String>{};

  /// Singleton instance
  static final LocalReadTracker _instance = LocalReadTracker._internal();
  factory LocalReadTracker() => _instance;
  LocalReadTracker._internal();

  /// Baseline timestamp: bij verse installatie wordt dit op NOW gezet
  /// zodat bestaande berichten niet als ongelezen tellen.
  DateTime? _installBaseline;
  bool _isFreshInstallThisRun = false;
  bool _freshInstallSignalConsumed = false;

  /// Globale "alles gelezen" baseline — gezet door [markAllAsRead] en
  /// gebruikt door [getLastRead] om een floor te leggen op alle keys
  /// tegelijk. Dit dekt ook conversaties die de user nog nooit opende.
  DateTime? _globalReadBaseline;

  /// Haal de baseline op (null = niet eerste launch, gebruik gewoon _epoch)
  DateTime? get installBaseline => _installBaseline;

  /// True only in the process run that created the install marker. Loading a
  /// persisted install baseline on a later launch must not reset server
  /// counters again.
  bool get isFreshInstallThisRun => _isFreshInstallThisRun;

  /// Returns the fresh-install reset signal at most once in this process.
  bool consumeFreshInstallSignal() {
    if (!_isFreshInstallThisRun || _freshInstallSignalConsumed) return false;
    _freshInstallSignalConsumed = true;
    final identity = _activeIdentity;
    if (identity != null) _freshSignalsConsumed.add(identity);
    return true;
  }

  /// Identity-bound form used by auth bootstrap. A stale async callback for
  /// member A can never consume member B's fresh-install signal.
  bool consumeFreshInstallSignalFor(String clubId, String memberId) {
    final identity = _identityFor(clubId, memberId);
    if (_activeIdentity != identity) return false;
    return consumeFreshInstallSignal();
  }

  /// Durable reset intent created with a fresh-install baseline. It remains
  /// pending across process restarts until the member-scoped Firestore reset
  /// has actually succeeded.
  bool hasPendingFreshInstallResetFor(String clubId, String memberId) {
    final identity = _identityFor(clubId, memberId);
    if (_activeIdentity != identity) return false;
    return _prefs
            ?.getBool('${_prefixForIdentity(identity)}freshResetPending') ==
        true;
  }

  /// Commits a successful server reset. This is intentionally identity-
  /// scoped but does not require that identity to still be active: an A→B
  /// switch while A's idempotent Firestore update is in flight must not make
  /// A repeat the reset forever, and can never consume B's marker.
  Future<void> completeFreshInstallResetFor(
    String clubId,
    String memberId,
  ) async {
    await init();
    final identity = _identityFor(clubId, memberId);
    final prefix = _prefixForIdentity(identity);
    await _withStorageMutationLock<void>(() async {
      await _prefs!.remove('${prefix}freshResetPending');
    });
    _freshSignalsConsumed.add(identity);
    if (_activeIdentity == identity) {
      _freshInstallSignalConsumed = true;
      _isFreshInstallThisRun = false;
    }
  }

  bool isActiveContext(String clubId, String memberId) =>
      _activeIdentity == _identityFor(clubId, memberId);

  /// De globale "alles gelezen" baseline (null als nooit ingesteld).
  DateTime? get globalReadBaseline => _globalReadBaseline;

  DateTime _dateTimeFromStoredEpoch(int epoch) {
    // Backward compatibility: oudere builds schreven milliseconden weg.
    if (epoch.abs() < 100000000000000) {
      return DateTime.fromMillisecondsSinceEpoch(epoch, isUtc: true);
    }
    return DateTime.fromMicrosecondsSinceEpoch(epoch, isUtc: true);
  }

  /// Initialiseer uitsluitend de opslag. Read state wordt pas geladen nadat
  /// [activateContext] een club én member bindt.
  Future<void> init() => _initialization ??= _initialize();

  Future<void> _initialize() async {
    _prefs = await SharedPreferences.getInstance();
    final previouslyInitialized =
        _prefs!.getBool(_deviceInitializedKey) == true ||
            _prefs!.getBool(_legacyFirstLaunchKey) == true;
    _deviceFreshThisRun = !previouslyInitialized;
    if (_prefs!.getInt(_deviceInstallBaselineKey) == null) {
      final legacyBaseline = _prefs!.getInt(_legacyInstallBaselineKey);
      if (legacyBaseline != null) {
        await _prefs!.setInt(_deviceInstallBaselineKey, legacyBaseline);
      } else if (_deviceFreshThisRun) {
        await _prefs!.setInt(
          _deviceInstallBaselineKey,
          DateTime.now().microsecondsSinceEpoch,
        );
      }
    }
    await _prefs!.setBool(_deviceInitializedKey, true);
    debugPrint('✅ LocalReadTracker: opslag geïnitialiseerd');
  }

  String _identityFor(String clubId, String memberId) => base64Url
      .encode(utf8.encode('$clubId\u0000$memberId'))
      .replaceAll('=', '');

  String _prefixForIdentity(String identity) => '$_v2Prefix${identity}_';

  Future<T> _withStorageMutationLock<T>(Future<T> Function() operation) {
    final completer = Completer<T>();
    _storageMutationTail = _storageMutationTail.then<void>((_) async {
      try {
        completer.complete(await operation());
      } catch (error, stackTrace) {
        completer.completeError(error, stackTrace);
      }
    }, onError: (_) async {
      try {
        completer.complete(await operation());
      } catch (error, stackTrace) {
        completer.completeError(error, stackTrace);
      }
    });
    return completer.future;
  }

  String _key(String suffix) {
    final prefix = _activePrefix;
    if (prefix == null) {
      throw StateError('LocalReadTracker has no active club/member context.');
    }
    return '$prefix$suffix';
  }

  /// Switches authority synchronously, then loads only the requested
  /// club/member namespace. A slow load for A can never become active after B.
  Future<void> activateContext(String clubId, String memberId) {
    final identity = _identityFor(clubId, memberId);
    if (_activeIdentity == identity) return Future<void>.value();
    if (_activationIdentity == identity && _activation != null) {
      return _activation!;
    }
    final generation = ++_contextGeneration;
    _activeIdentity = null;
    _activePrefix = null;
    _installBaseline = null;
    _globalReadBaseline = null;
    _isFreshInstallThisRun = false;
    _freshInstallSignalConsumed = false;
    _activationIdentity = identity;
    late final Future<void> future;
    future =
        _activateContext(clubId, memberId, identity, generation).whenComplete(
      () {
        if (identical(_activation, future)) {
          _activation = null;
          _activationIdentity = null;
        }
      },
    );
    _activation = future;
    return future;
  }

  Future<void> _activateContext(
    String clubId,
    String memberId,
    String identity,
    int generation,
  ) async {
    await init();
    if (generation != _contextGeneration) return;
    final prefix = _prefixForIdentity(identity);
    final prefs = _prefs!;
    final initializedKey = '${prefix}initialized';

    final initialized = await _withStorageMutationLock<bool>(() async {
      if (generation != _contextGeneration) return false;
      if (prefs.getBool(initializedKey) == true) return true;

      final originalIdentityKeys =
          prefs.getKeys().where((key) => key.startsWith(prefix)).toSet();
      var claimedLegacy = false;
      var claimedFresh = false;

      Future<bool> rollbackIfStale() async {
        if (generation == _contextGeneration) return false;
        for (final key in prefs
            .getKeys()
            .where((key) =>
                key.startsWith(prefix) && !originalIdentityKeys.contains(key))
            .toList(growable: false)) {
          await prefs.remove(key);
        }
        if (claimedLegacy && prefs.getString(_legacyOwnerKey) == identity) {
          await prefs.remove(_legacyOwnerKey);
        }
        if (claimedFresh &&
            prefs.getString(_freshInstallOwnerKey) == identity) {
          await prefs.remove(_freshInstallOwnerKey);
        }
        return true;
      }

      final legacyOwner = prefs.getString(_legacyOwnerKey);
      final canClaimLegacy =
          legacyOwner == null && prefs.getBool(_legacyFirstLaunchKey) == true;
      if (canClaimLegacy) {
        await prefs.setString(_legacyOwnerKey, identity);
        claimedLegacy = true;
        if (await rollbackIfStale()) return false;
        final legacyInstall = prefs.getInt(_legacyInstallBaselineKey);
        final legacyGlobal = prefs.getInt(_legacyGlobalBaselineKey);
        if (legacyInstall != null) {
          await prefs.setInt('${prefix}installBaseline', legacyInstall);
          if (await rollbackIfStale()) return false;
        }
        if (legacyGlobal != null) {
          await prefs.setInt('${prefix}globalBaseline', legacyGlobal);
          if (await rollbackIfStale()) return false;
        }
        final legacyKeys = prefs
            .getKeys()
            .where((key) => key.startsWith(_legacyReadPrefix))
            .toList(growable: false);
        for (final key in legacyKeys) {
          final value = prefs.getInt(key);
          if (value != null) {
            await prefs.setInt(
              '${prefix}read_${key.substring(_legacyReadPrefix.length)}',
              value,
            );
            if (await rollbackIfStale()) return false;
          }
        }
      } else if (_deviceFreshThisRun &&
          prefs.getString(_freshInstallOwnerKey) == null) {
        final baselineEpoch = prefs.getInt(_deviceInstallBaselineKey) ??
            DateTime.now().microsecondsSinceEpoch;
        await prefs.setString(_freshInstallOwnerKey, identity);
        claimedFresh = true;
        if (await rollbackIfStale()) return false;
        await prefs.setInt(
          '${prefix}installBaseline',
          baselineEpoch,
        );
        if (await rollbackIfStale()) return false;
        await prefs.setBool('${prefix}freshResetPending', true);
        if (await rollbackIfStale()) return false;
      }
      // Every identity first activated on the same installation receives the
      // same device-owned floor. Only the first identity owns the one-time
      // server reset above; later accounts must not fall back to 2024 and
      // resurrect an arbitrary multi-year unread backlog.
      if (prefs.getInt('${prefix}installBaseline') == null) {
        final deviceBaseline = prefs.getInt(_deviceInstallBaselineKey);
        if (deviceBaseline != null) {
          await prefs.setInt('${prefix}installBaseline', deviceBaseline);
          if (await rollbackIfStale()) return false;
        }
      }
      await prefs.setBool(initializedKey, true);
      if (await rollbackIfStale()) return false;
      return true;
    });

    if (!initialized || generation != _contextGeneration) return;
    _activeIdentity = identity;
    _activePrefix = prefix;
    final installEpoch = prefs.getInt('${prefix}installBaseline');
    _installBaseline =
        installEpoch == null ? null : _dateTimeFromStoredEpoch(installEpoch);
    final globalEpoch = prefs.getInt('${prefix}globalBaseline');
    _globalReadBaseline =
        globalEpoch == null ? null : _dateTimeFromStoredEpoch(globalEpoch);
    _isFreshInstallThisRun = _deviceFreshThisRun &&
        prefs.getString(_freshInstallOwnerKey) == identity &&
        !_freshSignalsConsumed.contains(identity);
    debugPrint(
        '✅ LocalReadTracker: context geactiveerd voor $clubId/$memberId');
  }

  /// Invalidates pending work immediately. Persisted per-member history is
  /// retained so an OFF rollback or later login cannot resurrect read items.
  Future<void> deactivateContext() async {
    _contextGeneration++;
    _activation = null;
    _activationIdentity = null;
    _activeIdentity = null;
    _activePrefix = null;
    _installBaseline = null;
    _globalReadBaseline = null;
    _isFreshInstallThisRun = false;
    _freshInstallSignalConsumed = false;
  }

  DateTime _newer(DateTime first, DateTime? second) {
    if (second == null || !second.isAfter(first)) return first;
    return second;
  }

  DateTime _effectiveFallback() {
    var fallback = _installBaseline ?? _defaultEpoch;
    fallback = _newer(fallback, _globalReadBaseline);
    return fallback;
  }

  /// Export the exact legacy authority needed for the one-time server
  /// bootstrap. Unknown/unsupported keys are ignored; no message contents or
  /// member data leave the device.
  Future<LegacyReadStateSnapshot> exportReadState() async {
    await init();
    final prefix = _activePrefix;
    if (prefix == null) {
      throw StateError('Cannot export read state without an active identity.');
    }
    final fallback = _effectiveFallback();
    DateTime effectiveFor(String key) => getLastRead(key) ?? fallback;

    final announcements = <String, DateTime>{};
    final events = <String, DateTime>{};
    final teams = <String, DateTime>{};
    final sessions = <String, DateTime>{};
    final pendingSections = <ReadStateSection, DateTime>{};
    final pendingAnnouncements = <String, DateTime>{};
    final pendingEvents = <String, DateTime>{};
    final pendingTeams = <String, DateTime>{};
    final pendingSessions = <String, DateTime>{};
    for (final preferenceKey in _prefs!.getKeys()) {
      final readPrefix = '${prefix}read_';
      if (!preferenceKey.startsWith(readPrefix)) continue;
      final legacyKey = preferenceKey.substring(readPrefix.length);
      if (legacyKey.startsWith('announcement_')) {
        final announcementId = legacyKey.substring('announcement_'.length);
        if (announcementId.isNotEmpty) {
          announcements[announcementId] = effectiveFor(legacyKey);
        }
        continue;
      }
      if (legacyKey.startsWith('operation_')) {
        final operationId = legacyKey.substring('operation_'.length);
        if (operationId.isNotEmpty) {
          events[operationId] = effectiveFor(legacyKey);
        }
        continue;
      }
      if (legacyKey.startsWith('team_')) {
        final channelId = legacyKey.substring('team_'.length);
        if (channelId.isNotEmpty) {
          teams[channelId] = effectiveFor(legacyKey);
        }
        continue;
      }
      final sessionScope = _sessionScopeFromLegacyKey(legacyKey);
      if (sessionScope != null) {
        sessions[sessionScope] = effectiveFor(legacyKey);
      }
    }

    final pendingSectionPrefix = '${prefix}pending_section_';
    final pendingReadPrefix = '${prefix}pending_read_';
    for (final preferenceKey in _prefs!.getKeys()) {
      if (!preferenceKey.startsWith(pendingSectionPrefix) &&
          !preferenceKey.startsWith(pendingReadPrefix)) {
        continue;
      }
      final epoch = _prefs!.getInt(preferenceKey);
      if (epoch == null) continue;
      final timestamp = _dateTimeFromStoredEpoch(epoch);
      if (preferenceKey.startsWith(pendingSectionPrefix)) {
        final sectionId = preferenceKey.substring(pendingSectionPrefix.length);
        for (final section in ReadStateSection.values) {
          if (section.id == sectionId) {
            pendingSections[section] = timestamp;
            break;
          }
        }
        continue;
      }
      if (!preferenceKey.startsWith(pendingReadPrefix)) continue;
      final legacyKey = preferenceKey.substring(pendingReadPrefix.length);
      if (legacyKey == 'announcements') {
        pendingSections[ReadStateSection.announcements] = timestamp;
      } else if (legacyKey.startsWith('announcement_')) {
        final id = legacyKey.substring('announcement_'.length);
        if (id.isNotEmpty) pendingAnnouncements[id] = timestamp;
      } else if (legacyKey.startsWith('operation_')) {
        final id = legacyKey.substring('operation_'.length);
        if (id.isNotEmpty) pendingEvents[id] = timestamp;
      } else if (legacyKey.startsWith('team_')) {
        final id = legacyKey.substring('team_'.length);
        if (id.isNotEmpty) pendingTeams[id] = timestamp;
      } else {
        final scopeId = _sessionScopeFromLegacyKey(legacyKey);
        if (scopeId != null) pendingSessions[scopeId] = timestamp;
      }
    }

    return LegacyReadStateSnapshot(
      fallbackLastSeenAt: fallback,
      announcementsLastSeenAt: effectiveFor('announcements'),
      eventsLastSeenAt: _sectionFallback('events', fallback),
      teamsLastSeenAt: _sectionFallback('teams', fallback),
      sessionsLastSeenAt: _sectionFallback('sessions', fallback),
      announcementItems: Map.unmodifiable(announcements),
      eventConversations: Map.unmodifiable(events),
      teamChannels: Map.unmodifiable(teams),
      sessionChats: Map.unmodifiable(sessions),
      pendingSections: Map.unmodifiable(pendingSections),
      pendingAnnouncementItems: Map.unmodifiable(pendingAnnouncements),
      pendingEventConversations: Map.unmodifiable(pendingEvents),
      pendingTeamChannels: Map.unmodifiable(pendingTeams),
      pendingSessionChats: Map.unmodifiable(pendingSessions),
    );
  }

  String? _sessionScopeFromLegacyKey(String key) {
    if (!key.startsWith('session_')) return null;
    final value = key.substring('session_'.length);
    for (final groupType in const ['accueil', 'encadrants']) {
      final suffix = '_$groupType';
      if (value.endsWith(suffix)) {
        final sessionId = value.substring(0, value.length - suffix.length);
        return sessionId.isEmpty
            ? null
            : readStateSessionScopeId(sessionId, groupType);
      }
    }
    const levelMarker = '_niveau_';
    final marker = value.lastIndexOf(levelMarker);
    if (marker <= 0 || marker + levelMarker.length >= value.length) {
      return null;
    }
    return readStateSessionScopeId(
      value.substring(0, marker),
      'niveau',
      value.substring(marker + levelMarker.length),
    );
  }

  @visibleForTesting
  void resetForTesting() {
    _prefs = null;
    _initialization = null;
    _installBaseline = null;
    _isFreshInstallThisRun = false;
    _freshInstallSignalConsumed = false;
    _globalReadBaseline = null;
    _activeIdentity = null;
    _activePrefix = null;
    _activation = null;
    _activationIdentity = null;
    _contextGeneration = 0;
    _deviceFreshThisRun = false;
    _storageMutationTail = Future<void>.value();
    _freshSignalsConsumed.clear();
  }

  /// Haal de laatste gelezen timestamp op voor een key.
  /// Retourneert null als de key niet bestaat (= nooit gelezen).
  ///
  /// Als er een globale baseline gezet werd via [markAllAsRead], wordt
  /// het maximum van (stored, globalBaseline) teruggegeven zodat "alles
  /// als gelezen markeren" ook werkt voor conversaties waarvoor nog geen
  /// individuele lastRead-timestamp bestond.
  DateTime? getLastRead(String key) {
    final prefix = _activePrefix;
    if (prefix == null) return null;
    final millis = _prefs?.getInt('${prefix}read_$key');
    final stored = millis == null ? null : _dateTimeFromStoredEpoch(millis);

    final sectionEpoch = _prefs?.getInt(
      '${prefix}section_${_sectionForReadKey(key)}',
    );
    final section =
        sectionEpoch == null ? null : _dateTimeFromStoredEpoch(sectionEpoch);
    DateTime? effective = stored;
    if (section != null && (effective == null || section.isAfter(effective))) {
      effective = section;
    }
    if (_globalReadBaseline != null &&
        (effective == null || _globalReadBaseline!.isAfter(effective))) {
      effective = _globalReadBaseline;
    }
    return effective;
  }

  String _sectionForReadKey(String key) {
    if (key == 'announcements' || key.startsWith('announcement_')) {
      return 'announcements';
    }
    if (key.startsWith('operation_')) return 'events';
    if (key.startsWith('team_')) return 'teams';
    if (key.startsWith('session_')) return 'sessions';
    return 'other';
  }

  DateTime _sectionFallback(String section, DateTime fallback) {
    final epoch = _prefs?.getInt(_key('section_$section'));
    if (epoch == null) return fallback;
    return _newer(fallback, _dateTimeFromStoredEpoch(epoch));
  }

  Future<void> markSectionAsRead(ReadStateSection section) async {
    final prefix = _activePrefix;
    final generation = _contextGeneration;
    if (prefix == null) {
      throw StateError('LocalReadTracker has no active club/member context.');
    }
    await init();
    final now = DateTime.now();
    await _withStorageMutationLock(
      () => _prefs!.setInt(
        '${prefix}section_${section.id}',
        now.microsecondsSinceEpoch,
      ),
    );
    if (generation != _contextGeneration || _activePrefix != prefix) return;
    debugPrint('📖 LocalReadTracker: sectie ${section.id} gelezen');
  }

  /// Advances rollback state for an exact identity without consulting the
  /// mutable active context. Used after a server acknowledgement that may
  /// finish while another account is becoming active.
  Future<DateTime> markSectionAsReadFor(
    String clubId,
    String memberId,
    ReadStateSection section,
  ) =>
      markSectionAsReadAtFor(
        clubId,
        memberId,
        section,
        DateTime.now(),
      );

  Future<DateTime> markSectionAsReadAtFor(
    String clubId,
    String memberId,
    ReadStateSection section,
    DateTime timestamp,
  ) async {
    await init();
    final prefix = _prefixForIdentity(_identityFor(clubId, memberId));
    return _withStorageMutationLock(() async {
      final key = '${prefix}section_${section.id}';
      final existingEpoch = _prefs!.getInt(key);
      final existing = existingEpoch == null
          ? null
          : _dateTimeFromStoredEpoch(existingEpoch);
      final effective = existing != null && existing.isAfter(timestamp)
          ? existing
          : timestamp;
      await _prefs!.setInt(key, effective.microsecondsSinceEpoch);
      return effective;
    });
  }

  /// Markeer ALLES als gelezen tot op dit moment. Zet een globale
  /// "now" baseline die [getLastRead] gebruikt als floor voor elke key.
  /// Gebruikt door de "Marquer tout comme lu" knop in Settings (Fix #7).
  Future<void> markAllAsRead() async {
    final prefix = _activePrefix;
    final generation = _contextGeneration;
    if (prefix == null) {
      throw StateError('LocalReadTracker has no active club/member context.');
    }
    await init();
    final key = '${prefix}globalBaseline';
    final now = DateTime.now();
    await _withStorageMutationLock(
      () => _prefs!.setInt(key, now.microsecondsSinceEpoch),
    );
    if (generation != _contextGeneration || _activePrefix != prefix) return;
    _globalReadBaseline = now;
    debugPrint('📖 LocalReadTracker: markAllAsRead — globalBaseline=$now');
  }

  /// Markeer een conversatie als gelezen op dit moment.
  Future<void> markAsRead(String key) async {
    final prefix = _activePrefix;
    final generation = _contextGeneration;
    if (prefix == null) {
      throw StateError('LocalReadTracker has no active club/member context.');
    }
    await init();
    final storageKey = '${prefix}read_$key';
    await _withStorageMutationLock(
      () => _prefs!.setInt(
        storageKey,
        DateTime.now().microsecondsSinceEpoch,
      ),
    );
    if (generation != _contextGeneration || _activePrefix != prefix) return;
    debugPrint('📖 LocalReadTracker: $key gelezen');
  }

  Future<DateTime> markAsReadFor(
    String clubId,
    String memberId,
    String key,
  ) =>
      markAsReadAtFor(clubId, memberId, key, DateTime.now());

  Future<DateTime> markAsReadAtFor(
    String clubId,
    String memberId,
    String key,
    DateTime timestamp,
  ) async {
    await init();
    final prefix = _prefixForIdentity(_identityFor(clubId, memberId));
    return _withStorageMutationLock(() async {
      final storageKey = '${prefix}read_$key';
      final existingEpoch = _prefs!.getInt(storageKey);
      final existing = existingEpoch == null
          ? null
          : _dateTimeFromStoredEpoch(existingEpoch);
      final effective = existing != null && existing.isAfter(timestamp)
          ? existing
          : timestamp;
      await _prefs!.setInt(storageKey, effective.microsecondsSinceEpoch);
      return effective;
    });
  }

  Future<void> recordPendingSectionMirrorFor(
    String clubId,
    String memberId,
    ReadStateSection section,
    DateTime timestamp,
  ) =>
      _recordPendingFor(
        clubId,
        memberId,
        'section_${section.id}',
        timestamp,
      );

  Future<void> recordPendingReadMirrorFor(
    String clubId,
    String memberId,
    String key,
    DateTime timestamp,
  ) =>
      _recordPendingFor(clubId, memberId, 'read_$key', timestamp);

  Future<void> _recordPendingFor(
    String clubId,
    String memberId,
    String suffix,
    DateTime timestamp,
  ) async {
    await init();
    final prefix = _prefixForIdentity(_identityFor(clubId, memberId));
    final storageKey = '${prefix}pending_$suffix';
    await _withStorageMutationLock(() async {
      final existingEpoch = _prefs!.getInt(storageKey);
      if (existingEpoch != null &&
          !_dateTimeFromStoredEpoch(existingEpoch).isBefore(timestamp)) {
        return;
      }
      await _prefs!.setInt(storageKey, timestamp.microsecondsSinceEpoch);
    });
  }

  Future<void> clearPendingSectionMirrorFor(
    String clubId,
    String memberId,
    ReadStateSection section,
    DateTime through,
  ) =>
      _clearPendingFor(
        clubId,
        memberId,
        'section_${section.id}',
        through,
      );

  Future<void> clearPendingReadMirrorFor(
    String clubId,
    String memberId,
    String key,
    DateTime through,
  ) =>
      _clearPendingFor(clubId, memberId, 'read_$key', through);

  Future<void> _clearPendingFor(
    String clubId,
    String memberId,
    String suffix,
    DateTime through,
  ) async {
    await init();
    final prefix = _prefixForIdentity(_identityFor(clubId, memberId));
    final storageKey = '${prefix}pending_$suffix';
    await _withStorageMutationLock(() async {
      final existingEpoch = _prefs!.getInt(storageKey);
      if (existingEpoch == null) return;
      final existing = _dateTimeFromStoredEpoch(existingEpoch);
      if (!existing.isAfter(through)) await _prefs!.remove(storageKey);
    });
  }

  /// Removes only the pending values that were part of [snapshot]. A later
  /// failed mirror written while the callable was in flight is deliberately
  /// retained for the next retry.
  Future<void> clearPendingMirrorsUpTo(
    String clubId,
    String memberId,
    LegacyReadStateSnapshot snapshot,
  ) async {
    for (final entry in snapshot.pendingSections.entries) {
      if (entry.key == ReadStateSection.announcements) {
        await clearPendingReadMirrorFor(
          clubId,
          memberId,
          'announcements',
          entry.value,
        );
      } else {
        await clearPendingSectionMirrorFor(
          clubId,
          memberId,
          entry.key,
          entry.value,
        );
      }
    }
    for (final entry in snapshot.pendingAnnouncementItems.entries) {
      await clearPendingReadMirrorFor(
        clubId,
        memberId,
        'announcement_${entry.key}',
        entry.value,
      );
    }
    for (final entry in snapshot.pendingEventConversations.entries) {
      await clearPendingReadMirrorFor(
        clubId,
        memberId,
        'operation_${entry.key}',
        entry.value,
      );
    }
    for (final entry in snapshot.pendingTeamChannels.entries) {
      await clearPendingReadMirrorFor(
        clubId,
        memberId,
        'team_${entry.key}',
        entry.value,
      );
    }
    for (final entry in snapshot.pendingSessionChats.entries) {
      await clearPendingReadMirrorFor(
        clubId,
        memberId,
        'session_${entry.key.replaceAll('__', '_')}',
        entry.value,
      );
    }
  }

  /// Initialiseer een key als die nog niet bestaat.
  /// Wordt gebruikt bij eerste app start om alles als "gelezen" te markeren.
  Future<void> initIfAbsent(String key) async {
    if (_prefs?.getInt(_key('read_$key')) == null) {
      await markAsRead(key);
    }
  }

  /// Wis alle read timestamps + globale baseline (bij logout).
  Future<void> resetAll() async {
    final prefix = _activePrefix;
    if (prefix == null) return;
    final generation = _contextGeneration;
    await init();
    await _withStorageMutationLock(() async {
      final keys =
          _prefs!.getKeys().where((k) => k.startsWith(prefix)).toList();
      for (final key in keys) {
        await _prefs!.remove(key);
      }
    });
    if (generation == _contextGeneration && _activePrefix == prefix) {
      _installBaseline = null;
      _globalReadBaseline = null;
    }
    debugPrint('🗑️ LocalReadTracker: actieve context gewist');
  }
}
