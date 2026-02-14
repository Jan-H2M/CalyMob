import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart' show kIsWeb, debugPrint;
import '../config/firebase_config.dart';

/// Service die diagnostische gegevens naar Firestore schrijft,
/// zodat ze zichtbaar zijn in CalyCompta (onglet "App" van een lid).
///
/// In tegenstelling tot Crashlytics (dat enkel in de Firebase Console
/// zichtbaar is), worden deze gegevens rechtstreeks in het member-document
/// opgeslagen en kunnen ze door admins bekeken worden.
class DiagnosticService {
  DiagnosticService._();

  static final _firestore = FirebaseFirestore.instance;

  /// Maximaal aantal fouten dat we bijhouden per gebruiker.
  static const int _maxErrors = 10;

  // ─── Biometric diagnostics ──────────────────────────────────

  /// Sla de biometrische status op in Firestore.
  /// Wordt aangeroepen na elke check in BiometricService.
  static Future<void> saveBiometricStatus({
    required String userId,
    required bool available,
    required bool canCheck,
    required bool deviceSupported,
    required String types,
    String? error,
  }) async {
    if (kIsWeb) return;
    try {
      final clubId = FirebaseConfig.defaultClubId;
      final ref = _firestore.collection('clubs/$clubId/members').doc(userId);
      await ref.update({
        'diag_biometric': {
          'available': available,
          'canCheck': canCheck,
          'deviceSupported': deviceSupported,
          'types': types,
          'error': error,
          'updated_at': FieldValue.serverTimestamp(),
        },
      });
      debugPrint('📊 Diagnostic biometric saved for $userId');
    } catch (e) {
      debugPrint('⚠️ DiagnosticService.saveBiometricStatus failed: $e');
    }
  }

  // ─── Error log ──────────────────────────────────────────────

  /// Voeg een fout toe aan het diagnostisch logboek in Firestore.
  /// CalyCompta toont de laatste [_maxErrors] fouten per gebruiker.
  static Future<void> logError({
    required String userId,
    required String domain,
    required String message,
    String? detail,
  }) async {
    if (kIsWeb) return;
    try {
      final clubId = FirebaseConfig.defaultClubId;
      final ref = _firestore.collection('clubs/$clubId/members').doc(userId);

      final entry = {
        'domain': domain,
        'message': message,
        if (detail != null) 'detail': detail,
        'timestamp': DateTime.now().toUtc().toIso8601String(),
      };

      // Lees huidige lijst, voeg toe, trim tot _maxErrors
      final doc = await ref.get();
      final data = doc.data();
      final existing = (data?['diag_errors'] as List<dynamic>?) ?? [];
      existing.insert(0, entry);
      if (existing.length > _maxErrors) {
        existing.removeRange(_maxErrors, existing.length);
      }

      await ref.update({
        'diag_errors': existing,
        'diag_last_error_at': FieldValue.serverTimestamp(),
      });
      debugPrint('📊 Diagnostic error logged: $domain - $message');
    } catch (e) {
      debugPrint('⚠️ DiagnosticService.logError failed: $e');
    }
  }

  /// Sla de algemene app-gezondheid op (wordt aangeroepen bij app-start).
  static Future<void> saveAppHealth({
    required String userId,
    required bool notificationsEnabled,
    required bool biometricAvailable,
    String? appVersion,
  }) async {
    if (kIsWeb) return;
    try {
      final clubId = FirebaseConfig.defaultClubId;
      final ref = _firestore.collection('clubs/$clubId/members').doc(userId);
      await ref.update({
        'diag_health': {
          'notifications_ok': notificationsEnabled,
          'biometric_ok': biometricAvailable,
          'app_version': appVersion,
          'checked_at': FieldValue.serverTimestamp(),
        },
      });
      debugPrint('📊 Diagnostic app health saved for $userId');
    } catch (e) {
      debugPrint('⚠️ DiagnosticService.saveAppHealth failed: $e');
    }
  }
}
