import 'dart:io';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

/// Status van een app update check
class AppUpdateStatus {
  final bool updateAvailable;
  final bool forceUpdate;
  final String currentVersion;
  final String latestVersion;
  final String? message;

  AppUpdateStatus({
    required this.updateAvailable,
    required this.forceUpdate,
    required this.currentVersion,
    required this.latestVersion,
    this.message,
  });

  factory AppUpdateStatus.upToDate(String currentVersion) {
    return AppUpdateStatus(
      updateAvailable: false,
      forceUpdate: false,
      currentVersion: currentVersion,
      latestVersion: currentVersion,
    );
  }
}

/// Service die controleert of er een nieuwe versie van CalyMob beschikbaar is.
///
/// Vergelijkt de huidige app-versie met de versie in Firestore
/// (settings/app_version), die automatisch wordt bijgewerkt door
/// bump_version.sh bij elke nieuwe build.
class AppUpdateService {
  static AppUpdateStatus? _cachedStatus;
  static DateTime? _lastCheck;

  // Cache geldig voor 1 uur (voorkomt onnodige Firestore reads)
  static const _cacheDuration = Duration(hours: 1);

  // Store URLs
  static const _playStoreUrl =
      'https://play.google.com/store/apps/details?id=club.caly.calymob';
  static const _appStoreUrl =
      'https://apps.apple.com/app/calymob/id6744917498';

  /// Check of er een update beschikbaar is.
  ///
  /// Leest settings/app_version uit Firestore en vergelijkt met de
  /// geïnstalleerde versie via package_info_plus.
  static Future<AppUpdateStatus> checkForUpdate({bool forceCheck = false}) async {
    // Return cache als die nog geldig is
    if (!forceCheck &&
        _cachedStatus != null &&
        _lastCheck != null &&
        DateTime.now().difference(_lastCheck!) < _cacheDuration) {
      return _cachedStatus!;
    }

    try {
      // Huidige app versie ophalen
      final packageInfo = await PackageInfo.fromPlatform();
      final currentVersion = packageInfo.version; // bijv. "1.1.3"

      // Firestore versie ophalen
      final doc = await FirebaseFirestore.instance
          .collection('settings')
          .doc('app_version')
          .get();

      if (!doc.exists || doc.data() == null) {
        return AppUpdateStatus.upToDate(currentVersion);
      }

      final data = doc.data()!;
      final latestVersion = data['version'] as String? ?? currentVersion;
      final minSupportedVersion = data['minSupportedVersion'] as String?;
      final forceRefresh = data['forceRefresh'] as bool? ?? false;
      final message = data['message'] as String?;

      // Vergelijk versies
      final hasUpdate = _isNewer(latestVersion, currentVersion);
      final mustUpdate = minSupportedVersion != null &&
          _isNewer(minSupportedVersion, currentVersion);

      final status = AppUpdateStatus(
        updateAvailable: hasUpdate,
        forceUpdate: mustUpdate || (forceRefresh && hasUpdate),
        currentVersion: currentVersion,
        latestVersion: latestVersion,
        message: message,
      );

      // Cache bijwerken
      _cachedStatus = status;
      _lastCheck = DateTime.now();

      return status;
    } catch (e) {
      print('⚠️ AppUpdateService: Fout bij het controleren op updates: $e');
      // Bij een fout, return "up to date" zodat de gebruiker niet geblokkeerd wordt
      try {
        final packageInfo = await PackageInfo.fromPlatform();
        return AppUpdateStatus.upToDate(packageInfo.version);
      } catch (_) {
        return AppUpdateStatus.upToDate('?');
      }
    }
  }

  /// Open de juiste store (Play Store of App Store) om de app te updaten.
  static Future<void> openStore() async {
    final urlString = Platform.isIOS ? _appStoreUrl : _playStoreUrl;
    final uri = Uri.parse(urlString);

    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  /// Vergelijkt twee semver versies. Returns true als [a] nieuwer is dan [b].
  /// Bijv. _isNewer("1.1.4", "1.1.3") => true
  static bool _isNewer(String a, String b) {
    final partsA = a.split('.').map((e) => int.tryParse(e) ?? 0).toList();
    final partsB = b.split('.').map((e) => int.tryParse(e) ?? 0).toList();

    // Zorg dat beide lijsten 3 elementen hebben
    while (partsA.length < 3) partsA.add(0);
    while (partsB.length < 3) partsB.add(0);

    for (int i = 0; i < 3; i++) {
      if (partsA[i] > partsB[i]) return true;
      if (partsA[i] < partsB[i]) return false;
    }
    return false; // gelijk
  }

  /// Reset de cache (bijv. na een pull-to-refresh)
  static void clearCache() {
    _cachedStatus = null;
    _lastCheck = null;
  }
}
