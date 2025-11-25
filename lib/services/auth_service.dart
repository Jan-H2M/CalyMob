import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';

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
    } on FirebaseAuthException catch (e) {
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
    } catch (e) {
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
    } catch (e) {
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
  Future<void> sendPasswordResetEmail(String email) async {
    try {
      await _auth.sendPasswordResetEmail(email: email);
      debugPrint('✅ Email de réinitialisation envoyé à: $email');
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
