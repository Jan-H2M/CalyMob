import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

/// Service de gestion des sessions utilisateur avec timeout configurable
///
/// Gère le heartbeat pour maintenir la session active selon les règles Firestore
class SessionService with WidgetsBindingObserver {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  String? _sessionId;
  String? _clubId;
  String? _userId;
  Timer? _heartbeatTimer;
  int _idleTimeoutMinutes = 30; // Défaut, chargé depuis Firebase

  // Singleton pattern
  static final SessionService _instance = SessionService._internal();
  factory SessionService() => _instance;
  SessionService._internal();

  /// Créer une nouvelle session au login
  Future<String> createSession({
    required String userId,
    required String clubId,
  }) async {
    try {
      // 1. Charger le timeout depuis Firebase settings
      await _loadTimeoutSettings(clubId);

      // 2. Générer session ID (userId pour simplifier)
      _sessionId = userId;
      _userId = userId;
      _clubId = clubId;

      // 3. Calculer expiresAt
      final now = Timestamp.now();
      final timeoutMs = _idleTimeoutMinutes * 60 * 1000;
      final expiresAtMs = now.millisecondsSinceEpoch + timeoutMs;
      final expiresAt = Timestamp.fromMillisecondsSinceEpoch(expiresAtMs);

      // 4. Créer document session dans Firestore
      final sessionRef = _firestore
          .collection('clubs')
          .doc(clubId)
          .collection('sessions')
          .doc(_sessionId);

      await sessionRef.set({
        'userId': userId,
        'clubId': clubId,
        'loginAt': now,
        'lastActivityAt': now,
        'expiresAt': expiresAt,
        'deviceInfo': 'Flutter Mobile ${DateTime.now().toIso8601String()}',
        'isActive': true,
        'userAgent': 'Flutter/3.x.x',
      });

      debugPrint('✅ Session créée: $userId, expire à: ${expiresAt.toDate()}');

      // 5. Démarrer le heartbeat
      _startHeartbeat();

      // 6. Observer le lifecycle de l'app
      WidgetsBinding.instance.addObserver(this);

      return _sessionId!;
    } catch (e) {
      debugPrint('❌ Erreur création session: $e');
      rethrow;
    }
  }

  // Maximum session duration: 30 days (security cap)
  static const int _maxSessionDurationMinutes = 30 * 24 * 60; // 43200 minutes

  /// Charger le timeout configurable depuis Firebase settings
  Future<void> _loadTimeoutSettings(String clubId) async {
    try {
      final settingsDoc = await _firestore
          .collection('clubs')
          .doc(clubId)
          .collection('settings')
          .doc('security')
          .get();

      if (settingsDoc.exists) {
        final data = settingsDoc.data();
        final autoLogoutEnabled = data?['autoLogoutEnabled'] ?? true;

        if (autoLogoutEnabled) {
          _idleTimeoutMinutes = data?['idleTimeoutMinutes'] ?? 30;
          debugPrint('⚙️ Timeout chargé: $_idleTimeoutMinutes minutes');
        } else {
          debugPrint('⚠️ Auto-logout désactivé, max: $_maxSessionDurationMinutes min (30 jours)');
          // SECURITY: Cap at 30 days even when auto-logout is disabled
          _idleTimeoutMinutes = _maxSessionDurationMinutes;
        }
      } else {
        debugPrint('⚠️ Settings security non trouvés, défaut: 30 min');
        _idleTimeoutMinutes = 30;
      }
    } catch (e) {
      debugPrint('⚠️ Erreur chargement timeout settings: $e, défaut: 30 min');
      _idleTimeoutMinutes = 30;
    }
  }

  /// Démarrer le heartbeat (update lastActivityAt toutes les 5 minutes)
  void _startHeartbeat() {
    // Annuler timer existant
    _heartbeatTimer?.cancel();

    // Timer périodique toutes les 5 minutes
    _heartbeatTimer = Timer.periodic(
      const Duration(minutes: 5),
      (_) => _updateActivity(),
    );

    debugPrint('💓 Heartbeat démarré (intervalle: 5 min)');
  }

  /// Mettre à jour lastActivityAt pour prolonger la session
  Future<void> _updateActivity() async {
    if (_sessionId == null || _clubId == null) {
      debugPrint('⚠️ Heartbeat skipped: session non initialisée');
      return;
    }

    try {
      final now = Timestamp.now();
      final timeoutMs = _idleTimeoutMinutes * 60 * 1000;
      final expiresAtMs = now.millisecondsSinceEpoch + timeoutMs;
      final expiresAt = Timestamp.fromMillisecondsSinceEpoch(expiresAtMs);

      final sessionRef = _firestore
          .collection('clubs')
          .doc(_clubId!)
          .collection('sessions')
          .doc(_sessionId!);

      await sessionRef.update({
        'lastActivityAt': now,
        'expiresAt': expiresAt,
      });

      debugPrint('💓 Heartbeat: session prolongée jusqu\'à ${expiresAt.toDate()}');
    } catch (e) {
      debugPrint('❌ Erreur heartbeat: $e');
    }
  }

  /// Observer le lifecycle de l'app (pause/resume)
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.resumed:
        // App revenue en foreground
        debugPrint('🟢 App resumed: redémarrage heartbeat');
        _startHeartbeat();
        _updateActivity(); // Update immédiat
        break;

      case AppLifecycleState.paused:
        // App en background
        debugPrint('🟡 App paused: arrêt heartbeat');
        _heartbeatTimer?.cancel();
        break;

      case AppLifecycleState.inactive:
      case AppLifecycleState.detached:
      case AppLifecycleState.hidden:
        // Autres états
        break;
    }
  }

  /// Vérifier si la session est toujours valide
  Future<bool> isSessionValid() async {
    if (_sessionId == null || _clubId == null) return false;

    try {
      final sessionDoc = await _firestore
          .collection('clubs')
          .doc(_clubId!)
          .collection('sessions')
          .doc(_sessionId!)
          .get();

      if (!sessionDoc.exists) return false;

      final data = sessionDoc.data();
      final isActive = data?['isActive'] ?? false;
      final expiresAt = data?['expiresAt'] as Timestamp?;

      if (!isActive) return false;
      if (expiresAt == null) return false;

      final now = Timestamp.now();
      final expired = now.millisecondsSinceEpoch > expiresAt.millisecondsSinceEpoch;

      return !expired;
    } catch (e) {
      debugPrint('❌ Erreur vérification session: $e');
      return false;
    }
  }

  /// Supprimer la session au logout
  Future<void> deleteSession() async {
    if (_sessionId == null || _clubId == null) return;

    try {
      // Arrêter le heartbeat
      _heartbeatTimer?.cancel();

      // Supprimer le document session
      await _firestore
          .collection('clubs')
          .doc(_clubId!)
          .collection('sessions')
          .doc(_sessionId!)
          .delete();

      debugPrint('✅ Session supprimée: $_sessionId');

      // Cleanup
      _sessionId = null;
      _userId = null;
      _clubId = null;

      // Retirer observer
      WidgetsBinding.instance.removeObserver(this);
    } catch (e) {
      debugPrint('❌ Erreur suppression session: $e');
    }
  }

  /// Forcer un update manuel (ex: après une action utilisateur importante)
  Future<void> touchActivity() async {
    await _updateActivity();
  }
}
