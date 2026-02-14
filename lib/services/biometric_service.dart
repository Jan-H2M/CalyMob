import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';
import 'package:local_auth_android/local_auth_android.dart';
import 'package:local_auth_darwin/local_auth_darwin.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'diagnostic_service.dart';

/// Service for biometric authentication (Face ID / Touch ID / Fingerprint)
class BiometricService {
  static final BiometricService _instance = BiometricService._internal();
  factory BiometricService() => _instance;
  BiometricService._internal();

  final LocalAuthentication _localAuth = LocalAuthentication();
  final FlutterSecureStorage _secureStorage = const FlutterSecureStorage();

  static const String _emailKey = 'biometric_email';
  static const String _passwordKey = 'biometric_password';
  static const String _enabledKey = 'biometric_enabled';

  /// Current user ID — set via setUserId() so diagnostics can be written to Firestore.
  String? _currentUserId;

  /// Stel de huidige user in zodat diagnostics naar Firestore geschreven worden.
  void setUserId(String? userId) {
    _currentUserId = userId;
  }

  /// Last diagnostic info (for debugging biometric issues)
  String _lastDiagnostic = '';
  String get lastDiagnostic => _lastDiagnostic;

  /// Check if biometric authentication is available on this device
  Future<bool> isBiometricAvailable() async {
    // Biometrics not supported on web
    if (kIsWeb) {
      _lastDiagnostic = 'Web platform - non supporté';
      return false;
    }

    try {
      final canCheck = await _localAuth.canCheckBiometrics;
      final isDeviceSupported = await _localAuth.isDeviceSupported();
      final biometrics = await _localAuth.getAvailableBiometrics();

      // Use isDeviceSupported() as the primary check.
      // Known bug (flutter/flutter#117309): on Samsung and other Android
      // devices with face unlock enabled (without fingerprint),
      // canCheckBiometrics returns false AND getAvailableBiometrics()
      // returns empty. But isDeviceSupported() correctly returns true
      // because the device supports authentication (biometric or PIN).
      // Combined with biometricOnly: false in authenticate(), this
      // ensures the biometric prompt appears on all capable devices.
      final available = isDeviceSupported;

      _lastDiagnostic = 'canCheckBiometrics: $canCheck, '
          'isDeviceSupported: $isDeviceSupported, '
          'types: ${biometrics.map((b) => b.name).join(', ')}, '
          'result: $available';

      // Log biometric status to Crashlytics for remote debugging
      if (!kIsWeb) {
        FirebaseCrashlytics.instance.setCustomKey('biometric_canCheck', canCheck);
        FirebaseCrashlytics.instance.setCustomKey('biometric_deviceSupported', isDeviceSupported);
        FirebaseCrashlytics.instance.setCustomKey('biometric_types', biometrics.map((b) => b.name).join(', '));
        FirebaseCrashlytics.instance.setCustomKey('biometric_available', available);
      }

      // Write to Firestore so admins can see it in CalyCompta
      if (_currentUserId != null) {
        DiagnosticService.saveBiometricStatus(
          userId: _currentUserId!,
          available: available,
          canCheck: canCheck,
          deviceSupported: isDeviceSupported,
          types: biometrics.map((b) => b.name).join(', '),
        );
      }

      return available;
    } on PlatformException catch (e, stack) {
      _lastDiagnostic = 'PlatformException: ${e.code} - ${e.message}';
      FirebaseCrashlytics.instance.recordError(
        e, stack,
        reason: 'BiometricService.isBiometricAvailable PlatformException',
      );
      if (_currentUserId != null) {
        DiagnosticService.saveBiometricStatus(
          userId: _currentUserId!,
          available: false, canCheck: false, deviceSupported: false, types: '',
          error: 'PlatformException: ${e.code} - ${e.message}',
        );
        DiagnosticService.logError(
          userId: _currentUserId!,
          domain: 'biometric',
          message: 'PlatformException in isBiometricAvailable',
          detail: '${e.code}: ${e.message}',
        );
      }
      return false;
    } catch (e, stack) {
      _lastDiagnostic = 'Exception: $e';
      FirebaseCrashlytics.instance.recordError(
        e, stack,
        reason: 'BiometricService.isBiometricAvailable unexpected error',
      );
      if (_currentUserId != null) {
        DiagnosticService.saveBiometricStatus(
          userId: _currentUserId!,
          available: false, canCheck: false, deviceSupported: false, types: '',
          error: '$e',
        );
        DiagnosticService.logError(
          userId: _currentUserId!,
          domain: 'biometric',
          message: 'Unexpected error in isBiometricAvailable',
          detail: '$e',
        );
      }
      return false;
    }
  }

  /// Get available biometric types
  Future<List<BiometricType>> getAvailableBiometrics() async {
    if (kIsWeb) return [];

    try {
      return await _localAuth.getAvailableBiometrics();
    } on PlatformException {
      return [];
    } catch (e) {
      return [];
    }
  }

  /// Check if Face ID is specifically available
  Future<bool> isFaceIdAvailable() async {
    final biometrics = await getAvailableBiometrics();
    return biometrics.contains(BiometricType.face);
  }

  /// Check if fingerprint is available
  Future<bool> isFingerprintAvailable() async {
    final biometrics = await getAvailableBiometrics();
    return biometrics.contains(BiometricType.fingerprint) ||
        biometrics.contains(BiometricType.strong) ||
        biometrics.contains(BiometricType.weak);
  }

  /// Authenticate user with biometrics
  /// Uses French localized messages for both Android and iOS
  Future<bool> authenticate({String reason = 'Authentifiez-vous pour continuer'}) async {
    try {
      return await _localAuth.authenticate(
        localizedReason: reason,
        options: const AuthenticationOptions(
          stickyAuth: true,
          biometricOnly: false,  // Allow device credentials fallback on Android
        ),
        authMessages: const <AuthMessages>[
          AndroidAuthMessages(
            signInTitle: 'Authentification CalyMob',
            cancelButton: 'Annuler',
            biometricHint: 'Vérification biométrique',
            biometricNotRecognized: 'Empreinte non reconnue. Réessayez.',
            biometricRequiredTitle: 'Biométrie requise',
            biometricSuccess: 'Authentification réussie',
            deviceCredentialsRequiredTitle: 'Identifiants requis',
            deviceCredentialsSetupDescription: 'Configurez vos identifiants',
            goToSettingsButton: 'Paramètres',
            goToSettingsDescription: 'La biométrie n\'est pas configurée. Allez dans Paramètres > Sécurité pour l\'activer.',
          ),
          IOSAuthMessages(
            cancelButton: 'Annuler',
            goToSettingsButton: 'Paramètres',
            goToSettingsDescription: 'Configurez Face ID ou Touch ID pour vous connecter rapidement.',
            lockOut: 'Biométrie désactivée. Verrouillez et déverrouillez votre écran pour la réactiver.',
            localizedFallbackTitle: 'Utiliser le code',
          ),
        ],
      );
    } on PlatformException catch (e, stack) {
      FirebaseCrashlytics.instance.recordError(
        e, stack,
        reason: 'BiometricService.authenticate failed: ${e.code}',
      );
      return false;
    }
  }

  /// Save credentials securely for biometric login
  Future<void> saveCredentials(String email, String password) async {
    await _secureStorage.write(key: _emailKey, value: email);
    await _secureStorage.write(key: _passwordKey, value: password);
    await _secureStorage.write(key: _enabledKey, value: 'true');
  }

  /// Get saved credentials
  Future<Map<String, String>?> getCredentials() async {
    final email = await _secureStorage.read(key: _emailKey);
    final password = await _secureStorage.read(key: _passwordKey);

    if (email != null && password != null) {
      return {'email': email, 'password': password};
    }
    return null;
  }

  /// Check if biometric login is enabled
  Future<bool> isBiometricLoginEnabled() async {
    final enabled = await _secureStorage.read(key: _enabledKey);
    return enabled == 'true';
  }

  /// Check if credentials are saved
  Future<bool> hasStoredCredentials() async {
    final email = await _secureStorage.read(key: _emailKey);
    final password = await _secureStorage.read(key: _passwordKey);
    return email != null && password != null;
  }

  /// Disable biometric login and clear credentials
  Future<void> disableBiometricLogin() async {
    await _secureStorage.delete(key: _emailKey);
    await _secureStorage.delete(key: _passwordKey);
    await _secureStorage.write(key: _enabledKey, value: 'false');
  }

  /// Clear all stored credentials
  Future<void> clearCredentials() async {
    await _secureStorage.deleteAll();
  }

  /// Get a human-readable name for the biometric type
  /// Falls back to 'Biométrie' when specific type can't be detected
  /// (known issue on Samsung with face unlock - flutter/flutter#117309)
  Future<String> getBiometricTypeName() async {
    if (await isFaceIdAvailable()) {
      return 'Face ID';
    } else if (await isFingerprintAvailable()) {
      return 'Empreinte digitale';
    }
    return 'Biométrie';
  }
}
