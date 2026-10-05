import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'crashlytics_service.dart';

typedef AuthSignIn = Future<User?> Function(String email, String password);
typedef AuthRetryDelay = Future<void> Function(Duration duration);
typedef AuthErrorReporter =
    void Function(Object error, StackTrace? stack, String context);

/// Exception de login qui conserve le code FirebaseAuth d'origine.
///
/// Permet à l'appelant (ex: login biométrique) de distinguer un refus des
/// credentials eux-mêmes (mot de passe changé, compte désactivé → il faut
/// purger les credentials biométriques) d'une erreur transitoire (réseau,
/// throttling) où les credentials stockés restent parfaitement valables.
class AuthLoginException implements Exception {
  final String code;
  final String message;

  AuthLoginException(this.code, this.message);

  factory AuthLoginException.fromFirebase(FirebaseAuthException exception) {
    switch (exception.code) {
      case 'user-not-found':
        return AuthLoginException(
          exception.code,
          'Aucun compte trouvé avec cet email',
        );
      case 'wrong-password':
        return AuthLoginException(exception.code, 'Mot de passe incorrect');
      case 'invalid-credential':
        return AuthLoginException(
          exception.code,
          'Email ou mot de passe incorrect',
        );
      case 'invalid-email':
        return AuthLoginException(exception.code, 'Email invalide');
      case 'user-disabled':
        return AuthLoginException(exception.code, 'Ce compte a été désactivé');
      case 'too-many-requests':
        return AuthLoginException(
          exception.code,
          'Trop de tentatives. Réessayez dans quelques minutes',
        );
      case 'network-request-failed':
        return AuthLoginException(
          exception.code,
          'Connexion impossible. Vérifiez votre réseau puis réessayez.',
        );
      default:
        return AuthLoginException(
          exception.code,
          'Erreur d\'authentification: ${exception.message}',
        );
    }
  }

  /// True quand les credentials eux-mêmes sont refusés par Firebase Auth.
  /// C'est la SEULE raison valable pour effacer les credentials biométriques.
  bool get isCredentialFailure => const {
        'wrong-password',
        'invalid-credential',
        'user-not-found',
        'user-disabled',
        'invalid-email',
      }.contains(code);

  @override
  String toString() => message;
}

/// Service d'authentification Firebase
class AuthService {
  static const Duration _networkRetryDelay = Duration(milliseconds: 750);

  final FirebaseAuth? _injectedAuth;
  final AuthSignIn? _injectedSignIn;
  final AuthRetryDelay _retryDelay;
  final AuthErrorReporter _reportError;

  AuthService({
    FirebaseAuth? auth,
    AuthSignIn? signIn,
    AuthRetryDelay retryDelay = Future<void>.delayed,
    AuthErrorReporter reportError = CrashlyticsService.authError,
  }) : _injectedAuth = auth,
       _injectedSignIn = signIn,
       _retryDelay = retryDelay,
       _reportError = reportError;

  FirebaseAuth get _auth => _injectedAuth ?? FirebaseAuth.instance;

  Future<User?> _signIn(String email, String password) async {
    final injectedSignIn = _injectedSignIn;
    if (injectedSignIn != null) {
      return injectedSignIn(email, password);
    }

    final credential = await _auth.signInWithEmailAndPassword(
      email: email,
      password: password,
    );
    return credential.user;
  }

  /// Stream de l'état d'authentification
  Stream<User?> get authStateChanges => _auth.authStateChanges();

  /// Utilisateur actuellement connecté
  User? get currentUser => _auth.currentUser;

  /// Login avec email et mot de passe
  Future<User> login(String email, String password) async {
    for (var attempt = 1; attempt <= 2; attempt++) {
      try {
        debugPrint('🔐 Tentative login: $email');

        final user = await _signIn(email, password);

        if (user == null) {
          throw Exception('Échec de connexion: utilisateur null');
        }

        debugPrint('✅ Login réussi: ${user.uid}');
        return user;
      } on FirebaseAuthException catch (e, stack) {
        _reportError(e, stack, 'login FirebaseAuth ${e.code}');
        debugPrint('❌ Erreur login: ${e.code} - ${e.message}');

        if (e.code == 'network-request-failed' && attempt == 1) {
          debugPrint('🔄 Réseau indisponible, nouvelle tentative de login');
          await _retryDelay(_networkRetryDelay);
          continue;
        }

        throw AuthLoginException.fromFirebase(e);
      } catch (e, stack) {
        if (e is AuthLoginException) rethrow;
        _reportError(e, stack, 'login unexpected error');
        debugPrint('❌ Erreur inattendue login: $e');
        throw Exception('Erreur de connexion: $e');
      }
    }

    throw StateError('Nombre de tentatives de connexion incohérent');
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
