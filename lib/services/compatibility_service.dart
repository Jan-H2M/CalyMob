import 'dart:io';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/compatibility_settings.dart';

class CompatibilityService {
  static CompatibilitySettings? _settings;

  /// Laad compatibility settings van Firebase
  static Future<void> initialize(String clubId) async {
    try {
      final doc = await FirebaseFirestore.instance
          .collection('clubs')
          .doc(clubId)
          .collection('settings')
          .doc('compatibility')
          .get();

      if (doc.exists && doc.data() != null) {
        _settings = CompatibilitySettings.fromFirestore(doc.data()!);
      }
    } catch (e) {
      print('⚠️ Failed to load compatibility settings: $e');
      _settings = null;
    }
  }

  /// Check device compatibility voor iOS
  static CompatibilityStatus checkIosCompatibility(String osVersion) {
    if (_settings == null) {
      return CompatibilityStatus.none();
    }

    final iosConfig = _settings!.calymob.ios;
    final version = _parseIosVersion(osVersion);
    final minSupported = _parseIosVersion(iosConfig.minSupported);
    final minRecommended = _parseIosVersion(iosConfig.minRecommended);

    if (version < minSupported) {
      return CompatibilityStatus.unsupported(
        _settings!.messages.unsupported.replaceAll('{platform}', 'iOS $osVersion')
      );
    }

    if (version < minRecommended) {
      return CompatibilityStatus.warning(
        _settings!.messages.warning.replaceAll('{platform}', 'iOS $osVersion')
      );
    }

    return CompatibilityStatus.none();
  }

  /// Check device compatibility voor Android
  static CompatibilityStatus checkAndroidCompatibility(int sdkInt) {
    if (_settings == null) {
      return CompatibilityStatus.none();
    }

    final androidConfig = _settings!.calymob.android;

    if (sdkInt < androidConfig.minSupported) {
      return CompatibilityStatus.unsupported(
        _settings!.messages.unsupported.replaceAll('{platform}', 'Android API $sdkInt')
      );
    }

    if (sdkInt < androidConfig.minRecommended) {
      return CompatibilityStatus.warning(
        _settings!.messages.warning.replaceAll('{platform}', 'Android API $sdkInt')
      );
    }

    return CompatibilityStatus.none();
  }

  /// Check current device compatibility
  static Future<CompatibilityStatus> checkCurrentDevice(
    String platform,
    String osVersion,
    {int? androidSdkInt}
  ) async {
    // Zorg dat settings geladen zijn
    if (_settings == null) {
      return CompatibilityStatus.none();
    }

    if (platform == 'ios') {
      return checkIosCompatibility(osVersion);
    } else if (platform == 'android' && androidSdkInt != null) {
      return checkAndroidCompatibility(androidSdkInt);
    }

    return CompatibilityStatus.none();
  }

  /// Parse iOS versie naar vergelijkbaar nummer (bijv. "14.5.1" -> 14.5)
  static double _parseIosVersion(String version) {
    try {
      // Split op "." en neem eerste twee delen
      final parts = version.split('.');
      if (parts.isEmpty) return 0.0;

      final major = int.tryParse(parts[0]) ?? 0;
      final minor = parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0;

      return major + (minor / 10.0);
    } catch (e) {
      print('⚠️ Failed to parse iOS version: $version');
      return 0.0;
    }
  }

  /// Opslaan compatibility status in Firestore member document
  static Future<void> saveCompatibilityStatus(
    String clubId,
    String userId,
    CompatibilityStatus status
  ) async {
    try {
      await FirebaseFirestore.instance
          .collection('clubs')
          .doc(clubId)
          .collection('members')
          .doc(userId)
          .update({
        'device_compatibility_status': status.warningLevel,
        'device_compatibility_message': status.message,
        'device_compatibility_checked_at': FieldValue.serverTimestamp(),
      });
    } catch (e) {
      print('⚠️ Failed to save compatibility status: $e');
    }
  }
}
