import 'dart:io';
import 'dart:ui' as ui;

bool get isAndroid => Platform.isAndroid;
bool get isIOS => Platform.isIOS;

/// Retourne la locale actuelle du système
String getCurrentLocale() {
  return ui.PlatformDispatcher.instance.locale.toString();
}
