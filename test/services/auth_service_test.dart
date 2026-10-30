import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:calymob/services/auth_service.dart';

class _FakeUser extends Fake implements User {
  @override
  String get uid => 'member-1';
}

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
        expect(
          AuthLoginException(code, 'x').isCredentialFailure,
          isTrue,
          reason: code,
        );
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
        expect(
          AuthLoginException(code, 'x').isCredentialFailure,
          isFalse,
          reason: code,
        );
      }
    });

    test('toString retourne uniquement le message (affichage snackbar)', () {
      expect(
        AuthLoginException(
          'wrong-password',
          'Mot de passe incorrect',
        ).toString(),
        'Mot de passe incorrect',
      );
    });

    test(
      'traduit network-request-failed sans exposer le message SDK anglais',
      () {
        final exception = AuthLoginException.fromFirebase(
          FirebaseAuthException(
            code: 'network-request-failed',
            message:
                'Network error (such as timeout, interrupted connection or unreachable host) has occurred.',
          ),
        );

        expect(exception.code, 'network-request-failed');
        expect(
          exception.message,
          'Connexion impossible. Vérifiez votre réseau puis réessayez.',
        );
        expect(exception.message, isNot(contains('Network error')));
        expect(exception.isCredentialFailure, isFalse);
      },
    );
  });

  group('AuthService.login réseau', () {
    test(
      'retente une seule fois puis réussit après une coupure transitoire',
      () async {
        final user = _FakeUser();
        var attempts = 0;
        var delays = 0;
        final service = AuthService(
          signIn: (email, password) async {
            attempts++;
            if (attempts == 1) {
              throw FirebaseAuthException(code: 'network-request-failed');
            }
            return user;
          },
          retryDelay: (duration) async {
            delays++;
            expect(duration, const Duration(milliseconds: 750));
          },
          reportError: (_, __, ___) {},
        );

        expect(
          await service.login('membre@example.test', 'secret'),
          same(user),
        );
        expect(attempts, 2);
        expect(delays, 1);
      },
    );

    test(
      'abandonne après deux erreurs réseau avec le message français',
      () async {
        var attempts = 0;
        final service = AuthService(
          signIn: (email, password) async {
            attempts++;
            throw FirebaseAuthException(
              code: 'network-request-failed',
              message:
                  'Network error (such as timeout, interrupted connection or unreachable host) has occurred.',
            );
          },
          retryDelay: (_) async {},
          reportError: (_, __, ___) {},
        );

        await expectLater(
          service.login('membre@example.test', 'secret'),
          throwsA(
            isA<AuthLoginException>()
                .having((e) => e.code, 'code', 'network-request-failed')
                .having(
                  (e) => e.message,
                  'message',
                  'Connexion impossible. Vérifiez votre réseau puis réessayez.',
                ),
          ),
        );
        expect(attempts, 2);
      },
    );

    test('ne retente jamais une erreur de credentials', () async {
      var attempts = 0;
      var delays = 0;
      final service = AuthService(
        signIn: (email, password) async {
          attempts++;
          throw FirebaseAuthException(code: 'wrong-password');
        },
        retryDelay: (_) async => delays++,
        reportError: (_, __, ___) {},
      );

      await expectLater(
        service.login('membre@example.test', 'incorrect'),
        throwsA(
          isA<AuthLoginException>()
              .having((e) => e.code, 'code', 'wrong-password')
              .having(
                (e) => e.isCredentialFailure,
                'isCredentialFailure',
                isTrue,
              ),
        ),
      );
      expect(attempts, 1);
      expect(delays, 0);
    });
  });
}
