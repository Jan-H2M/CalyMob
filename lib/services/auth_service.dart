import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'crashlytics_service.dart';

/// Service d'authentification Firebase
class AuthService {
  final FirebaseAuth _auth = FirebaseAuth.instance;

  /// Stream de l'état d'authentification
  Stream<User?> get authStateChanges => _auth.authStateChanges();

  /// Utilisateur actuellement connecté
  User? get currentUser => _auth.currentUser;

  /// Login avec email et mot de passe
  Future<User> login(String email, String password) async {
    try {
      debugPrint('🔐 Tentative login: $email');

      final userCredential = await _auth.signInWithEmailAndPassword(
        email: email,
        password: password,
      );

      if (userCredential.user == null) {
        throw Exception('Échec de connexion: utilisateur null');
      }

      debugPrint('✅ Login réussi: ${userCredential.user!.uid}');
      return userCredential.user!;
    } on FirebaseAuthException catch (e, stack) {
      CrashlyticsService.authError(e, stack, 'login FirebaseAuth ${e.code}');
      debugPrint('❌ Erreur login: ${e.code} - ${e.message}');

      switch (e.code) {
        case 'user-not-found':
          throw Exception('Aucun compte trouvé avec cet email');
        case 'wrong-password':
          throw Exception('Mot de passe incorrect');
        case 'invalid-email':
          throw Exception('Email invalide');
        case 'user-disabled':
          throw Exception('Ce compte a été désactivé');
        case 'too-many-requests':
          throw Exception('Trop de tentatives. Réessayez dans quelques minutes');
        default:
          throw Exception('Erreur d\'authentification: ${e.message}');
      }
    } catch (e, stack) {
      CrashlyticsService.authError(e, stack, 'login unexpected error');
      debugPrint('❌ Erreur inattendue login: $e');
      throw Exception('Erreur de connexion: $e');
    }
  }

  /// Logout
  Future<void> logout() async {
    try {
      debugPrint('👋 Déconnexion...');
      await _auth.signOut();
      debugPrint('✅ Déconnexion réussie');
    } catch (e, stack) {
      CrashlyticsService.authError(e, stack, 'logout failed');
      debugPrint('❌ Erreur logout: $e');
      throw Exception('Erreur de déconnexion: $e');
    }
  }

  /// Refresh token (Firebase le fait automatiquement toutes les heures)
  Future<void> refreshToken() async {
    try {
      final user = _auth.currentUser;
      if (user != null) {
        await user.reload();
        await user.getIdToken(true); // Force refresh
        debugPrint('🔄 Token rafraîchi');
      }
    } catch (e) {
      debugPrint('⚠️ Erreur refresh token: $e');
    }
  }

  /// Envoyer email de réinitialisation mot de passe
  /// [source] indique la source de la demande ('app' pour CalyMob, 'web' pour CalyCompta)
  Future<void> sendPasswordResetEmail(String email, {String source = 'app'}) async {
    try {
      // Utiliser ActionCodeSettings pour ajouter un paramètre source
      // Cela permet à la page web de savoir d'où vient la demande
      final actionCodeSettings = ActionCodeSettings(
        url: 'https://caly.club/reset-password?source=$source',
        handleCodeInApp: false,
      );

      await _auth.sendPasswordResetEmail(
        email: email,
        actionCodeSettings: actionCodeSettings,
      );
      debugPrint('✅ Email de réinitialisation envoyé à: $email (source: $source)');
    } on FirebaseAuthException catch (e) {
      debugPrint('❌ Erreur reset password: ${e.code}');

      switch (e.code) {
        case 'user-not-found':
          throw Exception('Aucun compte trouvé avec cet email');
        case 'invalid-email':
          throw Exception('Email invalide');
        default:
          throw Exception('Erreur: ${e.message}');
      }
    }
  }
}
