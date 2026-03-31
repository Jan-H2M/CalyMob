import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

/// Status van een app update check
class AppUpdateStatus {
  final bool updateAvailable;
  final bool forceUpdate;
  final String currentVersion;
  final String latestVersion;
  final String? message;
  /// True als het resultaat van een lokale cache komt (Firestore was niet bereikbaar)
  final bool fromLocalCache;

  AppUpdateStatus({
    required this.updateAvailable,
    required this.forceUpdate,
    required this.currentVersion,
    required this.latestVersion,
    this.message,
    this.fromLocalCache = false,
  });

  factory AppUpdateStatus.upToDate(String currentVersion) {
    return AppUpdateStatus(
      updateAvailable: false,
      forceUpdate: false,
      currentVersion: currentVersion,
      latestVersion: currentVersion,
    );
  }

  Map<String, dynamic> toJson() => {
    'updateAvailable': updateAvailable,
    'forceUpdate': forceUpdate,
    'currentVersion': currentVersion,
    'latestVersion': latestVersion,
    'message': message,
  };

  factory AppUpdateStatus.fromJson(Map<String, dynamic> json, {bool fromCache = false}) {
    return AppUpdateStatus(
      updateAvailable: json['updateAvailable'] as bool? ?? false,
      forceUpdate: json['forceUpdate'] as bool? ?? false,
      currentVersion: json['currentVersion'] as String? ?? '?',
      latestVersion: json['latestVersion'] as String? ?? '?',
      message: json['message'] as String?,
      fromLocalCache: fromCache,
    );
  }
}

/// Service die controleert of er een nieuwe versie van CalyMob beschikbaar is.
///
/// Vergelijkt de huidige app-versie met de versie in Firestore
/// (settings/app_version), die automatisch wordt bijgewerkt door
/// bump_version.sh bij elke nieuwe build.
///
/// Features:
/// - In-memory cache (1 uur) om Firestore reads te beperken
/// - Lokale SharedPreferences fallback bij offline/timeout
/// - Timeout op Firestore reads om ANR te voorkomen
class AppUpdateService {
  static AppUpdateStatus? _cachedStatus;
  static DateTime? _lastCheck;

  // Cache geldig voor 1 uur (voorkomt onnodige Firestore reads)
  static const _cacheDuration = Duration(hours: 1);

  // Timeout voor Firestore read
  static const _firestoreTimeout = Duration(seconds: 8);

  // SharedPreferences keys
  static const _prefKeyLastStatus = 'app_update_last_status';
  static const _prefKeyLastCheckTime = 'app_update_last_check_time';

  // Store URLs
  static const _playStoreUrl =
      'https://play.google.com/store/apps/details?id=club.caly.calymob';
  static const _appStoreUrl =
      'https://apps.apple.com/app/calymob/id6744917498';

  /// Check of er een update beschikbaar is.
  ///
  /// Leest settings/app_version uit Firestore en vergelijkt met de
  /// geïnstalleerde versie via package_info_plus.
  /// Bij timeout/offline wordt de lokale cache gebruikt als fallback.
  static Future<AppUpdateStatus> checkForUpdate({bool forceCheck = false}) async {
    // Return in-memory cache als die nog geldig is
    if (!forceCheck &&
        _cachedStatus != null &&
        _lastCheck != null &&
        DateTime.now().difference(_lastCheck!) < _cacheDuration) {
      return _cachedStatus!;
    }

    try {
      // Huidige app versie ophalen
      final packageInfo = await PackageInfo.fromPlatform();
      final currentVersion = packageInfo.version;

      // Firestore versie ophalen met timeout
      final doc = await FirebaseFirestore.instance
          .collection('settings')
          .doc('app_version')
          .get()
          .timeout(_firestoreTimeout);

      if (!doc.exists || doc.data() == null) {
        final status = AppUpdateStatus.upToDate(currentVersion);
        _updateCaches(status);
        return status;
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

      // Beide caches bijwerken
      _updateCaches(status);

      return status;
    } on TimeoutException {
      debugPrint('⚠️ AppUpdateService: Firestore timeout — falling back to local cache');
      return _getLocalCacheFallback();
    } catch (e) {
      debugPrint('⚠️ AppUpdateService: Fout bij het controleren op updates: $e');
      return _getLocalCacheFallback();
    }
  }

  /// Update zowel in-memory als lokale SharedPreferences cache.
  static void _updateCaches(AppUpdateStatus status) {
    _cachedStatus = status;
    _lastCheck = DateTime.now();
    _saveToLocalCache(status);
  }

  /// Sla status op in SharedPreferences als offline fallback.
  static Future<void> _saveToLocalCache(AppUpdateStatus status) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_prefKeyLastStatus, jsonEncode(status.toJson()));
      await prefs.setInt(_prefKeyLastCheckTime, DateTime.now().millisecondsSinceEpoch);
    } catch (e) {
      debugPrint('⚠️ AppUpdateService: Could not save to local cache: $e');
    }
  }

  /// Haal laatste bekende status op uit SharedPreferences.
  /// Returns "up to date" als er geen lokale cache is.
  static Future<AppUpdateStatus> _getLocalCacheFallback() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final statusJson = prefs.getString(_prefKeyLastStatus);

      if (statusJson != null) {
        final data = jsonDecode(statusJson) as Map<String, dynamic>;
        // Update currentVersion met de werkelijke geïnstalleerde versie
        final packageInfo = await PackageInfo.fromPlatform();
        data['currentVersion'] = packageInfo.version;
        // Herbereken updateAvailable met de huidige versie
        final latestVersion = data['latestVersion'] as String? ?? packageInfo.version;
        data['updateAvailable'] = _isNewer(latestVersion, packageInfo.version);
        return AppUpdateStatus.fromJson(data, fromCache: true);
      }

      final packageInfo = await PackageInfo.fromPlatform();
      return AppUpdateStatus.upToDate(packageInfo.version);
    } catch (_) {
      return AppUpdateStatus.upToDate('?');
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

  /// Reset de in-memory cache (bijv. na een pull-to-refresh).
  /// De lokale SharedPreferences cache blijft intact als offline fallback.
  static void clearCache() {
    _cachedStatus = null;
    _lastCheck = null;
  }

  /// Check voor update en toon dialoog indien nodig.
  /// Kan vanuit elke screen aangeroepen worden — dialoog-logica zit hier centraal.
  static Future<void> showUpdateDialogIfNeeded(BuildContext context) async {
    try {
      final status = await checkForUpdate();
      if (!status.updateAvailable) return;

      if (!context.mounted) return;

      if (status.forceUpdate) {
        _showForceUpdateDialog(context, status);
      } else {
        _showUpdateDialog(context, status);
      }
    } catch (e) {
      debugPrint('⚠️ AppUpdateService: Failed to check for update: $e');
    }
  }

  static void _showUpdateDialog(BuildContext context, AppUpdateStatus status) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.system_update, color: Colors.blue, size: 28),
            SizedBox(width: 12),
            Expanded(child: Text('Nouvelle version disponible')),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Version ${status.latestVersion} est disponible. '
              'Vous utilisez la version ${status.currentVersion}.',
            ),
            if (status.message != null) ...[
              const SizedBox(height: 12),
              Text(status.message!, style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
            ],
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Plus tard'),
          ),
          ElevatedButton.icon(
            onPressed: () {
              Navigator.pop(ctx);
              openStore();
            },
            icon: const Icon(Icons.download, size: 18),
            label: const Text('Mettre à jour'),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF1565C0),
              foregroundColor: Colors.white,
            ),
          ),
        ],
      ),
    );
  }

  static void _showForceUpdateDialog(BuildContext context, AppUpdateStatus status) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => PopScope(
        canPop: false,
        child: AlertDialog(
          title: const Row(
            children: [
              Icon(Icons.warning_amber_rounded, color: Colors.orange, size: 28),
              SizedBox(width: 12),
              Expanded(child: Text('Mise à jour obligatoire')),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Une mise à jour importante est nécessaire pour continuer à utiliser CalyMob. '
                'Veuillez installer la version ${status.latestVersion}.',
              ),
              if (status.message != null) ...[
                const SizedBox(height: 12),
                Text(status.message!, style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
              ],
            ],
          ),
          actions: [
            ElevatedButton.icon(
              onPressed: () => openStore(),
              icon: const Icon(Icons.download, size: 18),
              label: const Text('Mettre à jour maintenant'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.orange,
                foregroundColor: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
