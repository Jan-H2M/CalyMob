import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

/// Service voor feature flags — bestuurt of Carnet de Formation of
/// Boutique V2 zichtbaar is.
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

  /// Returns true when the Boutique V2 feature is visible for the given member.
  bool isBoutiqueVisibleForMemberProvider(dynamic memberProvider) {
    if (_flags == null) return false;
    final enabled = _flags!['boutiqueV2Enabled'] == true;
    if (!enabled) return false;
    final adminOnly = _flags!['boutiqueV2AdminOnly'] == true;
    if (!adminOnly) return true;
    // Admin-only mode: check app_role
    if (memberProvider is dynamic) {
      try {
        final role = memberProvider.appRole?.toString().toLowerCase();
        return role == 'admin' || role == 'superadmin';
      } catch (_) {
        return false;
      }
    }
    return false;
  }
}