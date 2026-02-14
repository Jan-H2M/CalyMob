import 'package:flutter/foundation.dart' show kIsWeb, debugPrint;
import 'package:firebase_crashlytics/firebase_crashlytics.dart';

/// Centrale Crashlytics service voor remote monitoring.
///
/// Biedt een simpele API om fouten, events en user-context
/// te loggen naar Firebase Crashlytics. Alle calls zijn
/// no-ops op web (waar Crashlytics niet beschikbaar is).
///
/// Gebruik:
///   CrashlyticsService.log('Payment gestart');
///   CrashlyticsService.recordError(e, stack, reason: 'payment failed');
///   CrashlyticsService.setUserContext(userId: '123', email: 'jan@...');
class CrashlyticsService {
  CrashlyticsService._();

  static FirebaseCrashlytics? get _instance =>
      kIsWeb ? null : FirebaseCrashlytics.instance;

  // ─── User context ───────────────────────────────────────────

  /// Stel de user-ID in zodat crashes gelinkt zijn aan een gebruiker.
  /// Roep dit aan bij login.
  static void setUserContext({
    required String userId,
    String? email,
    String? displayName,
  }) {
    _instance?.setUserIdentifier(userId);
    if (email != null) _instance?.setCustomKey('user_email', email);
    if (displayName != null) _instance?.setCustomKey('user_name', displayName);
    debugPrint('📊 Crashlytics user: $userId');
  }

  /// Wis de user-ID bij logout.
  static void clearUserContext() {
    _instance?.setUserIdentifier('');
    debugPrint('📊 Crashlytics user cleared');
  }

  // ─── Custom keys ────────────────────────────────────────────

  /// Stel een custom key in (zichtbaar bij elke crash van deze user).
  static void setKey(String key, Object value) {
    _instance?.setCustomKey(key, value);
  }

  // ─── Logging ────────────────────────────────────────────────

  /// Log een broodkruimel (breadcrumb) — verschijnt in de crash-timeline.
  static void log(String message) {
    _instance?.log(message);
    debugPrint('📊 $message');
  }

  // ─── Error recording ───────────────────────────────────────

  /// Log een non-fatal error naar Crashlytics.
  /// Verschijnt als "Non-fatal" in de Firebase Console.
  static void recordError(
    dynamic exception,
    StackTrace? stack, {
    String? reason,
    bool fatal = false,
  }) {
    debugPrint('📊 ${fatal ? "FATAL" : "Error"}: $reason — $exception');
    _instance?.recordError(
      exception,
      stack,
      reason: reason ?? 'unknown',
      fatal: fatal,
    );
  }

  // ─── Convenience per domein ─────────────────────────────────

  /// Log een auth-gerelateerde fout.
  static void authError(dynamic e, StackTrace? stack, String context) {
    recordError(e, stack, reason: 'Auth: $context');
  }

  /// Log een payment-gerelateerde fout.
  static void paymentError(dynamic e, StackTrace? stack, String context) {
    recordError(e, stack, reason: 'Payment: $context');
  }

  /// Log een notification-gerelateerde fout.
  static void notificationError(dynamic e, StackTrace? stack, String context) {
    recordError(e, stack, reason: 'Notification: $context');
  }

  /// Log een Firestore-gerelateerde fout.
  static void firestoreError(dynamic e, StackTrace? stack, String context) {
    recordError(e, stack, reason: 'Firestore: $context');
  }
}
