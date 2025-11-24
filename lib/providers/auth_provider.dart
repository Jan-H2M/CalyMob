import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import '../services/auth_service.dart';
import '../services/session_service.dart';

/// Provider pour l'état d'authentification
class AuthProvider with ChangeNotifier {
  final AuthService _authService = AuthService();
  final SessionService _sessionService = SessionService();
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

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
    _authService.authStateChanges.listen((user) {
      _currentUser = user;
      if (user != null) {
        _loadUserDisplayName(user.uid);
      } else {
        _displayName = null;
      }
      notifyListeners();
    });
  }

  /// Charger le nom d'affichage depuis Firestore
  Future<void> _loadUserDisplayName(String userId) async {
    try {
      final doc = await _firestore
          .collection('clubs')
          .doc('calypso')
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

      debugPrint('✅ Login et session OK');

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

  /// Envoyer un email de réinitialisation de mot de passe
  Future<void> sendPasswordResetEmail() async {
    if (_currentUser?.email == null) {
      throw Exception('Aucun utilisateur connecté');
    }

    try {
      await FirebaseAuth.instance.sendPasswordResetEmail(
        email: _currentUser!.email!,
      );
      debugPrint('✅ Email de réinitialisation envoyé à ${_currentUser!.email}');
    } catch (e) {
      debugPrint('❌ Erreur envoi email réinitialisation: $e');
      rethrow;
    }
  }
}
