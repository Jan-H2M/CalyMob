import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

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

  /// Check if biometric authentication is available on this device
  Future<bool> isBiometricAvailable() async {
    // Biometrics not supported on web
    if (kIsWeb) return false;

    try {
      final canCheck = await _localAuth.canCheckBiometrics;
      final isDeviceSupported = await _localAuth.isDeviceSupported();
      return canCheck && isDeviceSupported;
    } on PlatformException {
      return false;
    } catch (e) {
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
  Future<bool> authenticate({String reason = 'Authentifiez-vous pour continuer'}) async {
    try {
      return await _localAuth.authenticate(
        localizedReason: reason,
        options: const AuthenticationOptions(
          stickyAuth: true,
          biometricOnly: true,
        ),
      );
    } on PlatformException {
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
  Future<String> getBiometricTypeName() async {
    if (await isFaceIdAvailable()) {
      return 'Face ID';
    } else if (await isFingerprintAvailable()) {
      return 'Touch ID';
    }
    return 'Biométrie';
  }
}
