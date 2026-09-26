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
    required this.eventConversations,
    required this.teamChannels,
    required this.sessionChats,
  });

  final DateTime fallbackLastSeenAt;
  final DateTime announcementsLastSeenAt;
  final Map<String, DateTime> eventConversations;
  final Map<String, DateTime> teamChannels;
  final Map<String, DateTime> sessionChats;

  Map<String, Object> toCallablePayload() => <String, Object>{
    'schemaVersion': 1,
    'fallbackLastSeenAtMs': fallbackLastSeenAt.millisecondsSinceEpoch,
    'announcementsLastSeenAtMs': announcementsLastSeenAt.millisecondsSinceEpoch,
    'eventConversations': eventConversations.map(
      (key, value) => MapEntry(key, value.millisecondsSinceEpoch),
    ),
    'teamChannels': teamChannels.map(
      (key, value) => MapEntry(key, value.millisecondsSinceEpoch),
    ),
    'sessionChats': sessionChats.map(
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
  static const _prefix = 'lastRead_';
  static const _firstLaunchKey = 'localReadTracker_initialized';
  static const _installBaselineKey = 'localReadTracker_installBaseline';
  static const _globalBaselineKey = 'localReadTracker_globalBaseline';
  static final DateTime _defaultEpoch = DateTime(2024, 1, 1);
  SharedPreferences? _prefs;
  Future<void>? _initialization;

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
    return true;
  }

  /// De globale "alles gelezen" baseline (null als nooit ingesteld).
  DateTime? get globalReadBaseline => _globalReadBaseline;

  DateTime _dateTimeFromStoredEpoch(int epoch) {
    // Backward compatibility: oudere builds schreven milliseconden weg.
    if (epoch.abs() < 100000000000000) {
      return DateTime.fromMillisecondsSinceEpoch(epoch);
    }
    return DateTime.fromMicrosecondsSinceEpoch(epoch);
  }

  /// Initialiseer SharedPreferences. Moet 1x aangeroepen worden bij app start.
  Future<void> init() => _initialization ??= _initialize();

  Future<void> _initialize() async {
    _prefs = await SharedPreferences.getInstance();

    // Detecteer verse installatie: als _firstLaunchKey niet bestaat,
    // sla dan NOW op als baseline zodat alle bestaande berichten
    // als "gelezen" worden beschouwd.
    if (_prefs?.getBool(_firstLaunchKey) != true) {
      _isFreshInstallThisRun = true;
      _installBaseline = DateTime.now();
      await Future.wait([
        _prefs!.setBool(_firstLaunchKey, true),
        _prefs!.setInt(
          _installBaselineKey,
          _installBaseline!.microsecondsSinceEpoch,
        ),
      ]);
      debugPrint(
        '🆕 LocalReadTracker: verse installatie gedetecteerd, baseline=$_installBaseline',
      );
    } else {
      _isFreshInstallThisRun = false;
      final installEpoch = _prefs?.getInt(_installBaselineKey);
      // Builds before this handover persisted only `_firstLaunchKey`. When
      // their install baseline is absent, the conservative 2024 epoch below
      // preserves unread messages instead of silently hiding them. The
      // server's app_first_installed field cannot repair this reliably: it is
      // the first install ever and is not replaced on a later reinstall.
      _installBaseline = installEpoch == null
          ? null
          : _dateTimeFromStoredEpoch(installEpoch);
    }

    // Herlaad de globale baseline (als die al gezet werd in een vorige sessie)
    final globalMillis = _prefs?.getInt(_globalBaselineKey);
    if (globalMillis != null) {
      _globalReadBaseline = _dateTimeFromStoredEpoch(globalMillis);
    }

    debugPrint('✅ LocalReadTracker: geïnitialiseerd');
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
    final fallback = _effectiveFallback();
    DateTime effectiveFor(String key) => getLastRead(key) ?? fallback;

    final events = <String, DateTime>{};
    final teams = <String, DateTime>{};
    final sessions = <String, DateTime>{};
    for (final preferenceKey in _prefs!.getKeys()) {
      if (!preferenceKey.startsWith(_prefix)) continue;
      final legacyKey = preferenceKey.substring(_prefix.length);
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

    return LegacyReadStateSnapshot(
      fallbackLastSeenAt: fallback,
      announcementsLastSeenAt: effectiveFor('announcements'),
      eventConversations: Map.unmodifiable(events),
      teamChannels: Map.unmodifiable(teams),
      sessionChats: Map.unmodifiable(sessions),
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
  }

  /// Haal de laatste gelezen timestamp op voor een key.
  /// Retourneert null als de key niet bestaat (= nooit gelezen).
  ///
  /// Als er een globale baseline gezet werd via [markAllAsRead], wordt
  /// het maximum van (stored, globalBaseline) teruggegeven zodat "alles
  /// als gelezen markeren" ook werkt voor conversaties waarvoor nog geen
  /// individuele lastRead-timestamp bestond.
  DateTime? getLastRead(String key) {
    final millis = _prefs?.getInt('$_prefix$key');
    final stored = millis == null ? null : _dateTimeFromStoredEpoch(millis);

    if (_globalReadBaseline == null) return stored;
    if (stored == null) return _globalReadBaseline;
    return stored.isAfter(_globalReadBaseline!) ? stored : _globalReadBaseline;
  }

  /// Markeer ALLES als gelezen tot op dit moment. Zet een globale
  /// "now" baseline die [getLastRead] gebruikt als floor voor elke key.
  /// Gebruikt door de "Marquer tout comme lu" knop in Settings (Fix #7).
  Future<void> markAllAsRead() async {
    final now = DateTime.now();
    _globalReadBaseline = now;
    await _prefs?.setInt(_globalBaselineKey, now.microsecondsSinceEpoch);
    debugPrint('📖 LocalReadTracker: markAllAsRead — globalBaseline=$now');
  }

  /// Markeer een conversatie als gelezen op dit moment.
  Future<void> markAsRead(String key) async {
    await _prefs?.setInt('$_prefix$key', DateTime.now().microsecondsSinceEpoch);
    debugPrint('📖 LocalReadTracker: $key gelezen');
  }

  /// Initialiseer een key als die nog niet bestaat.
  /// Wordt gebruikt bij eerste app start om alles als "gelezen" te markeren.
  Future<void> initIfAbsent(String key) async {
    if (_prefs?.getInt('$_prefix$key') == null) {
      await markAsRead(key);
    }
  }

  /// Wis alle read timestamps + globale baseline (bij logout).
  Future<void> resetAll() async {
    final keys = _prefs?.getKeys().where((k) => k.startsWith(_prefix)) ?? [];
    for (final key in keys) {
      await _prefs?.remove(key);
    }
    await _prefs?.remove(_globalBaselineKey);
    _globalReadBaseline = null;
    debugPrint('🗑️ LocalReadTracker: alles gewist');
  }
}
