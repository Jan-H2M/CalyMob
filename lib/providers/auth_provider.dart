import 'dart:async';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import '../services/auth_service.dart';
import '../services/session_service.dart';
import '../services/notification_service.dart';
import '../services/profile_service.dart';
import '../services/biometric_service.dart';
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
      } else {
        _displayName = null;
      }
      notifyListeners();
    });
  }

  @override
  void dispose() {
    _authStateSubscription?.cancel();
    super.dispose();
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

      debugPrint('✅ Login, session et FCM token OK');

      _isLoading = false;
      notifyListeners();
    } catch (e) {
      _isLoading = false;
      _errorMessage = e.toString().replaceFirst('Exception: ', '');
      notifyListeners();

      debugPrint('❌ Erreur AuthProvider.login: $e');
      rethrow;
    }
  }

  /// Logout
  Future<void> logout() async {
    try {
      _isLoading = true;
      notifyListeners();

      // 1. Supprimer session Firestore
      await _sessionService.deleteSession();

      // 2. Logout Firebase Auth
      await _authService.logout();

      _currentUser = null;
      _isLoading = false;
      _errorMessage = null;
      notifyListeners();

      debugPrint('✅ Logout complet');
    } catch (e) {
      _isLoading = false;
      _errorMessage = e.toString();
      notifyListeners();

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

      debugPrint('❌ Erreur suppression compte: $e');
      rethrow;
    }
  }
}
