import 'dart:convert';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

/// Service for password management
///
/// Provides password change functionality via the Vercel API.
/// Used for both forced first-time password change and voluntary changes.
class PasswordService {
  static const String _baseUrl = 'https://caly.club/api';

  /// Change user's own password via backend API
  ///
  /// This endpoint:
  /// - Updates the password in Firebase Auth
  /// - Clears the requirePasswordChange flag in Firestore
  /// - Invalidates other sessions
  /// - Creates an audit log entry
  ///
  /// Throws [PasswordChangeException] on error
  Future<void> changePassword({
    required String userId,
    required String clubId,
    required String newPassword,
  }) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      throw PasswordChangeException('Utilisateur non connecté');
    }

    try {
      debugPrint('🔐 [PasswordService] Changing password for user: $userId');

      final authToken = await user.getIdToken();

      final response = await http.post(
        Uri.parse('$_baseUrl/change-password'),
        headers: {
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'userId': userId,
          'clubId': clubId,
          'authToken': authToken,
          'newPassword': newPassword,
        }),
      );

      if (response.statusCode == 200) {
        debugPrint('✅ [PasswordService] Password changed successfully');
        return;
      }

      // Handle error responses
      final errorData = jsonDecode(response.body);
      final errorMessage = errorData['error'] ?? 'Erreur inconnue';

      debugPrint('❌ [PasswordService] Error: $errorMessage');

      switch (response.statusCode) {
        case 401:
          throw PasswordChangeException(
            'Session expirée. Veuillez vous reconnecter.',
          );
        case 403:
          throw PasswordChangeException(
            'Vous n\'êtes pas autorisé à effectuer cette action.',
          );
        case 404:
          throw PasswordChangeException(
            'Utilisateur non trouvé.',
          );
        default:
          throw PasswordChangeException(errorMessage);
      }
    } on PasswordChangeException {
      rethrow;
    } catch (e) {
      debugPrint('❌ [PasswordService] Unexpected error: $e');
      throw PasswordChangeException(
        'Erreur lors du changement de mot de passe. Veuillez réessayer.',
      );
    }
  }

  /// Validate password meets requirements
  ///
  /// Requirements:
  /// - At least 8 characters
  /// - At least one uppercase letter
  /// - At least one lowercase letter
  /// - At least one number
  static PasswordValidation validatePassword(String password) {
    final hasMinLength = password.length >= 8;
    final hasUppercase = password.contains(RegExp(r'[A-Z]'));
    final hasLowercase = password.contains(RegExp(r'[a-z]'));
    final hasNumber = password.contains(RegExp(r'[0-9]'));

    return PasswordValidation(
      hasMinLength: hasMinLength,
      hasUppercase: hasUppercase,
      hasLowercase: hasLowercase,
      hasNumber: hasNumber,
    );
  }

  /// Get password requirements text in French
  static String getPasswordRequirementsText() {
    return 'Le mot de passe doit contenir :\n'
        '• Au moins 8 caractères\n'
        '• Une lettre majuscule\n'
        '• Une lettre minuscule\n'
        '• Un chiffre';
  }
}

/// Password validation result
class PasswordValidation {
  final bool hasMinLength;
  final bool hasUppercase;
  final bool hasLowercase;
  final bool hasNumber;

  const PasswordValidation({
    required this.hasMinLength,
    required this.hasUppercase,
    required this.hasLowercase,
    required this.hasNumber,
  });

  /// Returns true if all requirements are met
  bool get isValid => hasMinLength && hasUppercase && hasLowercase && hasNumber;

  /// Returns the number of requirements met
  int get metCount =>
      (hasMinLength ? 1 : 0) +
      (hasUppercase ? 1 : 0) +
      (hasLowercase ? 1 : 0) +
      (hasNumber ? 1 : 0);
}

/// Exception thrown when password change fails
class PasswordChangeException implements Exception {
  final String message;

  PasswordChangeException(this.message);

  @override
  String toString() => message;
}
