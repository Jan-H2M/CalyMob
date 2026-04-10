import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

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
  static const _globalBaselineKey = 'localReadTracker_globalBaseline';
  SharedPreferences? _prefs;

  /// Singleton instance
  static final LocalReadTracker _instance = LocalReadTracker._internal();
  factory LocalReadTracker() => _instance;
  LocalReadTracker._internal();

  /// Baseline timestamp: bij verse installatie wordt dit op NOW gezet
  /// zodat bestaande berichten niet als ongelezen tellen.
  DateTime? _installBaseline;

  /// Globale "alles gelezen" baseline — gezet door [markAllAsRead] en
  /// gebruikt door [getLastRead] om een floor te leggen op alle keys
  /// tegelijk. Dit dekt ook conversaties die de user nog nooit opende.
  DateTime? _globalReadBaseline;

  /// Haal de baseline op (null = niet eerste launch, gebruik gewoon _epoch)
  DateTime? get installBaseline => _installBaseline;

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
  Future<void> init() async {
    _prefs ??= await SharedPreferences.getInstance();

    // Detecteer verse installatie: als _firstLaunchKey niet bestaat,
    // sla dan NOW op als baseline zodat alle bestaande berichten
    // als "gelezen" worden beschouwd.
    if (_prefs?.getBool(_firstLaunchKey) != true) {
      _installBaseline = DateTime.now();
      await _prefs?.setBool(_firstLaunchKey, true);
      debugPrint(
          '🆕 LocalReadTracker: verse installatie gedetecteerd, baseline=$_installBaseline');
    }

    // Herlaad de globale baseline (als die al gezet werd in een vorige sessie)
    final globalMillis = _prefs?.getInt(_globalBaselineKey);
    if (globalMillis != null) {
      _globalReadBaseline = _dateTimeFromStoredEpoch(globalMillis);
    }

    debugPrint('✅ LocalReadTracker: geïnitialiseerd');
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
    await _prefs?.setInt(
      '$_prefix$key',
      DateTime.now().microsecondsSinceEpoch,
    );
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
