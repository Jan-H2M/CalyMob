import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

/// Service voor feature flags — bestuurt of Carnet de Formation of
/// Boutique zichtbaar is.
/// Luistert real-time naar clubs/{clubId}/settings/feature_flags.
class FeatureFlagService extends ChangeNotifier {
  late final FirebaseFirestore _firestore;
  final String? _clubId;
  Map<String, dynamic>? _flags;
  bool _isLoading = true;

  /// Constructor. Optioneel een [firestore] en [clubId] voor injectie in tests.
  FeatureFlagService({FirebaseFirestore? firestore, String? clubId})
      : _firestore = firestore ?? FirebaseFirestore.instance,
        _clubId = clubId;

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
      _flags = doc.data();
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
  /// 'tous' = elk lid, 'testeurs' = admins + feature_access.boutique,
  /// 'masque' = niemand.
  static const String modeTous = 'tous';
  static const String modeTesteurs = 'testeurs';
  static const String modeMasque = 'masque';

  static const String defaultBoutiqueAccess = modeTesteurs;

  static const Map<String, String> defaultBoutiqueSections = {
    'produits': modeTous,
    'panier': modeTous,
    'commandes': modeTous,
    'cotisation': modeTous,
    'pretsMateriel': modeMasque,
  };

  static bool _isValidMode(Object? value) =>
      value == modeTous || value == modeTesteurs || value == modeMasque;

  /// Genormaliseerde Boutique-zichtbaarheid uit een feature_flags-document.
  /// Keys: 'access' (module) + alle sectiesleutels.
  static Map<String, String> parseBoutiqueVisibility(
    Map<String, dynamic>? flags,
  ) {
    final result = <String, String>{
      'access': _isValidMode(flags?['boutiqueAccess'])
          ? flags!['boutiqueAccess'] as String
          : defaultBoutiqueAccess,
    };
    final rawSections = flags?['boutiqueSections'];
    defaultBoutiqueSections.forEach((key, fallback) {
      final value = rawSections is Map ? rawSections[key] : null;
      result[key] = _isValidMode(value) ? value as String : fallback;
    });
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