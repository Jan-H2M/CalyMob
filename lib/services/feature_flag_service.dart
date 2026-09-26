import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import '../models/unread_cursor_feature_flag.dart';

/// Service voor feature flags — bestuurt of Carnet de Formation of
/// Boutique zichtbaar is.
/// Luistert real-time naar clubs/{clubId}/settings/feature_flags.
class FeatureFlagService extends ChangeNotifier {
  late final FirebaseFirestore _firestore;
  bool _isLoading = true;

  /// Constructor. Optioneel een [firestore] en [clubId] voor injectie in tests.
  FeatureFlagService({FirebaseFirestore? firestore, String? clubId})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  bool get isLoading => _isLoading;

  /// Start listening to the feature_flags document.
  /// Called automatically when [clubId] is known (or pass one).
  void listen(String clubId) {
    _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('settings')
        .doc('feature_flags')
        .snapshots()
        .listen((doc) {
      _isLoading = false;
      notifyListeners();
    });
  }

  /// Stream die true/false geeft voor carnetFormationEnabled.
  Stream<bool> isCarnetFormationEnabled(String clubId) {
    return _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('settings')
        .doc('feature_flags')
        .snapshots()
        .map((doc) {
      if (!doc.exists) return false;
      final data = doc.data();
      return data?['carnetFormationEnabled'] == true;
    });
  }

  /// Stream die true/false geeft voor adminOnly modus.
  Stream<bool> isCarnetFormationAdminOnly(String clubId) {
    return _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('settings')
        .doc('feature_flags')
        .snapshots()
        .map((doc) {
      if (!doc.exists) return true;
      final data = doc.data();
      return data?['carnetFormationAdminOnly'] ?? true;
    });
  }

  /// Standen voor Boutique-zichtbaarheid (CalyCompta > Boutique > Réglages).
  ///
  /// `testeurs` blijft de historische wire value voor de voorbereidingsstand:
  /// alleen actieve leden met de clubfunctie Responsable boutique. `tous` is
  /// de onlinestand voor alle actieve leden. `masque` wordt alleen nog
  /// defensief gelezen voor bestaande gegevens en is geen instelbare stand.
  static const String modeTous = 'tous';
  static const String modePreparation = 'testeurs';
  static const String modeMasque = 'masque';

  static const String defaultBoutiqueAccess = modePreparation;

  static const List<String> boutiqueSectionKeys = [
    'produits',
    'panier',
    'commandes',
    'cotisation',
    'pretsMateriel',
  ];

  static bool _isValidMode(Object? value) =>
      value == modeTous || value == modePreparation || value == modeMasque;

  /// Genormaliseerde Boutique-zichtbaarheid uit een feature_flags-document.
  /// Keys: 'access' (module) + alle sectiesleutels.
  static Map<String, String> parseBoutiqueVisibility(
    Map<String, dynamic>? flags,
  ) {
    final accessMode = _isValidMode(flags?['boutiqueAccess'])
        ? flags!['boutiqueAccess'] as String
        : defaultBoutiqueAccess;
    final result = <String, String>{'access': accessMode};
    final rawSections = flags?['boutiqueSections'];
    for (final key in boutiqueSectionKeys) {
      final value = rawSections is Map ? rawSections[key] : null;
      // Een ontbrekende/ongeldige sectiestand volgt altijd de globale stand.
      // Zo kan een gedeeltelijk oud document nooit een gemengde Boutique
      // opleveren wanneer de beheerder tussen voorbereiding en online wisselt.
      result[key] = _isValidMode(value) ? value as String : accessMode;
    }
    return result;
  }

  /// Stream met de genormaliseerde Boutique-zichtbaarheid.
  Stream<Map<String, String>> boutiqueVisibility(String clubId) {
    return _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('settings')
        .doc('feature_flags')
        .snapshots()
        .map((doc) => parseBoutiqueVisibility(doc.data()));
  }

  /// Cursor-v1 rollout flag. A missing document is a real OFF value, but a
  /// read error remains unknown. Converting an error to OFF could briefly
  /// expose stale legacy `99+` counts for a member who is effectively ON.
  Stream<UnreadCursorFeatureFlag> unreadCursorV1(String clubId) async* {
    try {
      await for (final doc in _firestore
          .collection('clubs')
          .doc(clubId)
          .collection('settings')
          .doc('feature_flags')
          .snapshots()) {
        yield UnreadCursorFeatureFlag.fromFirestore(doc.data());
      }
    } catch (error) {
      debugPrint('⚠️ unreadCursorV1 feature flag read failed: $error');
      rethrow;
    }
  }

  /// One-shot counterpart for startup paths and tests.
  Future<UnreadCursorFeatureFlag> getUnreadCursorV1(String clubId) async {
    try {
      final doc = await _firestore
          .collection('clubs')
          .doc(clubId)
          .collection('settings')
          .doc('feature_flags')
          .get();
      return UnreadCursorFeatureFlag.fromFirestore(doc.data());
    } catch (error) {
      debugPrint('⚠️ unreadCursorV1 feature flag read failed: $error');
      rethrow;
    }
  }

  /// Eenmalige check (voor use-cases waar stream niet nodig is).
  Future<bool> checkCarnetFormationEnabled(String clubId) async {
    final doc = await _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('settings')
        .doc('feature_flags')
        .get();
    if (!doc.exists) return false;
    return doc.data()?['carnetFormationEnabled'] == true;
  }
}
