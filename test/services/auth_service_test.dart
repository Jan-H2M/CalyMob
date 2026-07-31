import 'package:flutter_test/flutter_test.dart';

import 'package:calymob/services/auth_service.dart';

/// Régression biométrie: seules les erreurs de credentials (mot de passe
/// changé, compte désactivé, ...) peuvent effacer les credentials
/// biométriques. Les erreurs transitoires (réseau, throttling) ne le
/// peuvent JAMAIS — l'ancien code purgeait sur toute erreur, ce qui
/// désactivait définitivement Face ID / empreinte après un seul échec.
void main() {
  group('AuthLoginException.isCredentialFailure', () {
    test('erreurs de credentials → true (purge biométrie autorisée)', () {
      const codes = [
        'wrong-password',
        'invalid-credential',
        'user-not-found',
        'user-disabled',
        'invalid-email',
      ];
      for (final code in codes) {
        expect(AuthLoginException(code, 'x').isCredentialFailure, isTrue,
            reason: code);
      }
    });

    test('erreurs transitoires → false (credentials conservés)', () {
      const codes = [
        'too-many-requests',
        'network-request-failed',
        'internal-error',
        'operation-not-allowed',
        'unknown',
      ];
      for (final code in codes) {
        expect(AuthLoginException(code, 'x').isCredentialFailure, isFalse,
            reason: code);
      }
    });

    test('toString retourne uniquement le message (affichage snackbar)', () {
      expect(
        AuthLoginException('wrong-password', 'Mot de passe incorrect')
            .toString(),
        'Mot de passe incorrect',
      );
    });
  });
}
