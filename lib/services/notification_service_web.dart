// Web platform - no Platform class available
bool get isAndroid => false;
bool get isIOS => false;

/// Retourne la locale actuelle du système (web fallback)
String getCurrentLocale() {
  return 'unknown';
}
