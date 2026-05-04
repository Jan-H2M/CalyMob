import 'dart:async';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../services/auth_service.dart';
import '../services/session_service.dart';
import '../services/notification_service.dart';
import '../services/profile_service.dart';
import '../services/biometric_service.dart';
import '../services/crashlytics_service.dart';
import '../services/local_read_tracker.dart';
import '../config/firebase_config.dart';

/// Provider pour l'état d'authentification
class AuthProvider with ChangeNotifier {
  final AuthService _authService = AuthService();
  final SessionService _sessionService = SessionService();
  final NotificationService _notificationService = NotificationService();
  final ProfileService _profileService = ProfileService();
  final BiometricService _biometricService = BiometricService();
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  // Stream subscription for memory management
  StreamSubscription<User?>? _authStateSubscription;

  User? _currentUser;
  String? _displayName;
  bool _isLoading = false;
  String? _errorMessage;

  /// Flag om te voorkomen dat we de fresh-install reset meerdere keren
  /// aanroepen binnen dezelfde app-sessie (zowel auth-state listener als
  /// login() triggeren anders beide).
  bool _freshInstallHandled = false;

  // Getters
  User? get currentUser => _currentUser;
  String? get displayName => _displayName;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  bool get isAuthenticated => _currentUser != null;

  AuthProvider() {
    // Écouter les changements d'état d'authentification
    _authStateSubscription = _authService.authStateChanges.listen((user) {
      _currentUser = user;
      if (user != null) {
        _loadUserDisplayName(user.uid);
        // Enregistrer/mettre à jour le token FCM et les infos appareil à chaque ouverture
        _notificationService.saveTokenToFirestore(
          FirebaseConfig.defaultClubId,
          user.uid,
        );
        // Écouter les rafraîchissements de token FCM (crucial pour iOS!)
        // Sans ça, quand iOS rotent le token, les notifications s'arrêtent.
        _notificationService.listenForTokenRefresh(
          FirebaseConfig.defaultClubId,
          user.uid,
        );
        // Ensure Firestore session is active (refresh expired session on app restart)
        // Fire-and-forget, but catch errors so they don't bubble up as fatal
        // (e.g. transient permission-denied during auth-token rehydration at app start).
        // The session will be (re)created on the next heartbeat or user interaction.
        unawaited(
          _sessionService
              .createSession(
                userId: user.uid,
                clubId: FirebaseConfig.defaultClubId,
              )
              .catchError((Object e) {
            debugPrint('⚠️ Session create failed at auth-state init: $e');
            return ''; // satisfy Future<String> return type
          }),
        );
        // Fix #6: bij verse installatie moeten we de unread counters + badge
        // resetten, anders blijven oude notificaties uit een vorige install
        // spoken op de badge.
        unawaited(
          _resetUnreadCountersIfFreshInstall(
            FirebaseConfig.defaultClubId,
            user.uid,
          ),
        );
      } else {
        _displayName = null;
        _freshInstallHandled = false;
        _notificationService.stopListeningForTokenRefresh();
      }
      notifyListeners();
    });
  }

  @override
  void dispose() {
    _authStateSubscription?.cancel();
    _notificationService.stopListeningForTokenRefresh();
    super.dispose();
  }

  /// Fix #6: Reset Firestore unread_counts + badge + pending notificaties
  /// als dit een verse installatie is. De `LocalReadTracker.installBaseline`
  /// wordt enkel gezet op de allereerste run na (re)installatie — perfect
  /// signaal om oude badge-state op te ruimen.
  ///
  /// Zonder deze reset blijft `unread_counts.total` staan op wat de vorige
  /// installatie achterliet (bvb. 12) en toont de badge onmiddellijk 12
  /// ongelezen berichten die de user intussen al lang gezien heeft.
  Future<void> _resetUnreadCountersIfFreshInstall(
    String clubId,
    String userId,
  ) async {
    if (_freshInstallHandled) return;
    _freshInstallHandled = true;

    try {
      final tracker = LocalReadTracker();
      await tracker.init();
      if (tracker.installBaseline == null) {
        // Niet de eerste run na install → niets doen
        return;
      }

      debugPrint(
          '🆕 Fresh install gedetecteerd — reset unread_counts + badge + pending notifs');

      await _firestore
          .collection('clubs')
          .doc(clubId)
          .collection('members')
          .doc(userId)
          .update({
        'unread_counts.announcements': 0,
        'unread_counts.event_messages': 0,
        'unread_counts.team_messages': 0,
        'unread_counts.session_messages': 0,
        'unread_counts.medical_certificates': 0,
        'unread_counts.total': 0,
        'unread_counts.last_updated': FieldValue.serverTimestamp(),
      });

      await _notificationService.clearBadge();
      try {
        await FlutterLocalNotificationsPlugin().cancelAll();
      } catch (e) {
        debugPrint('⚠️ cancelAll failed (niet erg): $e');
      }

      debugPrint('✅ Fresh install reset OK');
    } catch (e) {
      debugPrint('⚠️ _resetUnreadCountersIfFreshInstall failed: $e');
    }
  }

  /// Charger le nom d'affichage depuis Firestore
  Future<void> _loadUserDisplayName(String userId) async {
    try {
      final doc = await _firestore
          .collection('clubs')
          .doc(FirebaseConfig.defaultClubId)
          .collection('members')
          .doc(userId)
          .get();

      if (doc.exists) {
        // Essayer displayName d'abord, puis construire depuis nom/prenom
        final data = doc.data();
        _displayName = data?['displayName'] as String? ??
            '${data?['prenom'] ?? ''} ${data?['nom'] ?? ''}'.trim();

        if (_displayName?.isEmpty ?? true) {
          _displayName = null;
        }

        debugPrint('✅ Nom affiché chargé: $_displayName');
        notifyListeners();
      }
    } catch (e) {
      debugPrint('⚠️ Erreur chargement nom affichage: $e');
    }
  }

  /// Login avec email et mot de passe
  Future<void> login({
    required String email,
    required String password,
    required String clubId,
  }) async {
    try {
      _isLoading = true;
      _errorMessage = null;
      notifyListeners();

      // 1. Login Firebase Auth
      final user = await _authService.login(email, password);
      _currentUser = user;

      // 2. Créer session Firestore
      await _sessionService.createSession(
        userId: user.uid,
        clubId: clubId,
      );

      // 3. Enregistrer le token FCM et les infos de l'appareil
      await _notificationService.saveTokenToFirestore(clubId, user.uid);

      // 4. Identifier l'utilisateur dans Crashlytics pour le suivi
      CrashlyticsService.setUserContext(
        userId: user.uid,
        email: email,
      );
      CrashlyticsService.log('Login réussi pour $email');

      // 5. Configurer BiometricService avec l'ID utilisateur pour les diagnostics Firestore
      _biometricService.setUserId(user.uid);

      debugPrint('✅ Login, session et FCM token OK');

      _isLoading = false;
      notifyListeners();
    } catch (e) {
      _isLoading = false;
      _errorMessage = e.toString().replaceFirst('Exception: ', '');
      notifyListeners();

      CrashlyticsService.authError(e, StackTrace.current, 'login failed for $email');
      debugPrint('❌ Erreur AuthProvider.login: $e');
      rethrow;
    }
  }

  /// Logout
  Future<void> logout() async {
    try {
      _isLoading = true;
      notifyListeners();

      // Fix #4: verwijder het FCM token VOOR we uitloggen, anders hebben we
      // straks geen user-context meer om de Firestore-write mee te doen en
      // blijft het token hangen op het member document. Gevolg zou zijn dat
      // de volgende push naar deze user (bvb. na een herinstall met nieuwe
      // token) nog steeds probeerde af te leveren op dit dode token, wat de
      // delivery degraded en bij genoeg failures de Cloud Function de hele
      // batch als falend rapporteert.
      final uid = _currentUser?.uid;
      if (uid != null) {
        try {
          await _notificationService.removeTokenFromFirestore(
            FirebaseConfig.defaultClubId,
            uid,
          );
        } catch (e) {
          debugPrint('⚠️ removeTokenFromFirestore failed at logout: $e');
        }
      }
      _notificationService.stopListeningForTokenRefresh();

      // 1. Supprimer session Firestore
      await _sessionService.deleteSession();

      // 2. Logout Firebase Auth
      await _authService.logout();

      _currentUser = null;
      _isLoading = false;
      _errorMessage = null;
      _freshInstallHandled = false;
      CrashlyticsService.clearUserContext();
      _biometricService.setUserId(null);
      notifyListeners();

      debugPrint('✅ Logout complet');
    } catch (e) {
      _isLoading = false;
      _errorMessage = e.toString();
      notifyListeners();

      CrashlyticsService.authError(e, StackTrace.current, 'logout failed');
      debugPrint('❌ Erreur AuthProvider.logout: $e');
    }
  }

  /// Effacer le message d'erreur
  void clearError() {
    _errorMessage = null;
    notifyListeners();
  }

  /// Refresh token
  Future<void> refreshToken() async {
    try {
      await _authService.refreshToken();
    } catch (e) {
      debugPrint('⚠️ Erreur refresh token: $e');
    }
  }

  /// Send password reset email to current user
  Future<void> sendPasswordResetEmail() async {
    try {
      final email = _currentUser?.email;
      if (email == null) {
        throw Exception('Aucun email trouvé pour cet utilisateur');
      }
      await _authService.sendPasswordResetEmail(email);
      debugPrint('✅ Email de réinitialisation envoyé à: $email');
    } catch (e) {
      debugPrint('❌ Erreur envoi email reset: $e');
      rethrow;
    }
  }

  /// Supprimer le compte utilisateur (RGPD Article 17 - Droit à l'effacement)
  /// Cette action est irréversible et supprime:
  /// - Toutes les données personnelles dans Firestore
  /// - La photo de profil dans Storage
  /// - Les credentials biométriques stockés localement
  /// - Le compte Firebase Authentication
  Future<void> deleteAccount({required String clubId}) async {
    try {
      _isLoading = true;
      _errorMessage = null;
      notifyListeners();

      final userId = _currentUser?.uid;
      if (userId == null) {
        throw Exception('Aucun utilisateur connecté');
      }

      debugPrint('🗑️ Début suppression compte: $userId');

      // Fix #4: eerst FCM token wegdoen zolang we nog geauthenticeerd zijn.
      try {
        await _notificationService.removeTokenFromFirestore(clubId, userId);
      } catch (e) {
        debugPrint('⚠️ removeTokenFromFirestore failed at deleteAccount: $e');
      }
      _notificationService.stopListeningForTokenRefresh();

      // 1. Supprimer les données utilisateur dans Firestore/Storage
      await _profileService.deleteUserData(clubId, userId);
      debugPrint('✅ Données Firestore/Storage supprimées');

      // 2. Supprimer les credentials biométriques locaux
      await _biometricService.clearCredentials();
      debugPrint('✅ Credentials biométriques supprimés');

      // 3. Supprimer la session
      await _sessionService.deleteSession();
      debugPrint('✅ Session supprimée');

      // 4. Supprimer le compte Firebase Auth
      // Note: Cette opération nécessite une ré-authentification récente
      // Si elle échoue avec 'requires-recent-login', l'utilisateur doit se reconnecter
      try {
        await _currentUser?.delete();
        debugPrint('✅ Compte Firebase Auth supprimé');
      } on FirebaseAuthException catch (e) {
        if (e.code == 'requires-recent-login') {
          debugPrint('⚠️ Ré-authentification requise pour supprimer le compte Auth');
          // Les données sont déjà anonymisées, le compte sera marqué comme supprimé
          // L'utilisateur peut contacter le support pour finaliser la suppression
        } else {
          rethrow;
        }
      }

      // 5. Nettoyer l'état local
      _currentUser = null;
      _displayName = null;
      _isLoading = false;
      _errorMessage = null;
      notifyListeners();

      debugPrint('✅ Suppression compte terminée');
    } catch (e) {
      _isLoading = false;
      _errorMessage = e.toString().replaceFirst('Exception: ', '');
      notifyListeners();

      CrashlyticsService.authError(e, StackTrace.current, 'deleteAccount failed');
      debugPrint('❌ Erreur suppression compte: $e');
      rethrow;
    }
  }
}
