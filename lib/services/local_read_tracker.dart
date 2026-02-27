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
class LocalReadTracker {
  static const _prefix = 'lastRead_';
  static const _firstLaunchKey = 'localReadTracker_initialized';
  SharedPreferences? _prefs;

  /// Singleton instance
  static final LocalReadTracker _instance = LocalReadTracker._internal();
  factory LocalReadTracker() => _instance;
  LocalReadTracker._internal();

  /// Baseline timestamp: bij verse installatie wordt dit op NOW gezet
  /// zodat bestaande berichten niet als ongelezen tellen.
  DateTime? _installBaseline;

  /// Haal de baseline op (null = niet eerste launch, gebruik gewoon _epoch)
  DateTime? get installBaseline => _installBaseline;

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

    debugPrint('✅ LocalReadTracker: geïnitialiseerd');
  }

  /// Haal de laatste gelezen timestamp op voor een key.
  /// Retourneert null als de key niet bestaat (= nooit gelezen).
  DateTime? getLastRead(String key) {
    final millis = _prefs?.getInt('$_prefix$key');
    if (millis == null) return null;
    return DateTime.fromMillisecondsSinceEpoch(millis);
  }

  /// Markeer een conversatie als gelezen op dit moment.
  Future<void> markAsRead(String key) async {
    await _prefs?.setInt(
      '$_prefix$key',
      DateTime.now().millisecondsSinceEpoch,
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

  /// Wis alle read timestamps (bij logout).
  Future<void> resetAll() async {
    final keys = _prefs?.getKeys().where((k) => k.startsWith(_prefix)) ?? [];
    for (final key in keys) {
      await _prefs?.remove(key);
    }
    debugPrint('🗑️ LocalReadTracker: alles gewist');
  }
}
