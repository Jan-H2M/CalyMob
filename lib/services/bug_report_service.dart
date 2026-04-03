import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

/// Service pour envoyer des signalements de bugs vers Firestore + Firebase Storage.
class BugReportService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseStorage _storage = FirebaseStorage.instance;

  /// Envoie un signalement de bug.
  ///
  /// - [clubId]: ID du club (ex: 'calypso')
  /// - [userId], [userName], [userEmail]: infos du reporter
  /// - [title]: titre du problème (obligatoire)
  /// - [description]: détails (optionnel)
  /// - [priority]: 'blocking', 'annoying', ou 'minor'
  /// - [screenshotBytes]: capture d'écran en PNG (optionnel)
  /// - [currentRoute]: route/écran actuel
  Future<String> submitBugReport({
    required String clubId,
    required String userId,
    required String userName,
    required String userEmail,
    required String title,
    String? description,
    required String priority,
    Uint8List? screenshotBytes,
    String? currentRoute,
  }) async {
    try {
      // 1. Collecter les infos de l'appareil
      final deviceInfo = await _collectDeviceInfo();
      final packageInfo = await PackageInfo.fromPlatform();

      // 2. Récupérer le Sentry replay ID (si dispo)
      String? sentryReplayId;
      try {
        final lastEventId = Sentry.lastEventId.toString();
        if (lastEventId.isNotEmpty && lastEventId != '00000000000000000000000000000000') {
          sentryReplayId = lastEventId;
        }
      } catch (e) {
        debugPrint('⚠️ BugReport: Impossible de récupérer le Sentry replay ID: $e');
      }

      // 3. Préparer le document Firestore
      final reportData = {
        'app': 'CalyMob',
        'title': title,
        'description': description ?? '',
        'priority': priority,
        'status': 'open',
        'reporter': {
          'uid': userId,
          'name': userName,
          'email': userEmail,
        },
        'device': {
          'model': deviceInfo['model'] ?? 'Inconnu',
          'os': deviceInfo['os'] ?? 'Inconnu',
          'osVersion': deviceInfo['osVersion'] ?? '',
          'appVersion': '${packageInfo.version}+${packageInfo.buildNumber}',
          'platform': defaultTargetPlatform.name,
        },
        'currentRoute': currentRoute ?? '',
        'sentryReplayId': sentryReplayId,
        'sentryEventUrl': sentryReplayId != null
            ? 'https://h2m-ai.sentry.io/replays/?query=$sentryReplayId'
            : null,
        'linearIssueId': null, // Rempli par la Cloud Function
        'screenshotUrl': null, // Rempli ci-dessous si screenshot fourni
        'createdAt': FieldValue.serverTimestamp(),
      };

      // 4. Écrire dans Firestore
      final docRef = await _firestore
          .collection('clubs/$clubId/bug_reports')
          .add(reportData);

      debugPrint('🐛 Bug report créé: ${docRef.id}');

      // 5. Uploader la capture d'écran (si fournie)
      if (screenshotBytes != null && screenshotBytes.isNotEmpty) {
        try {
          final storageRef = _storage
              .ref()
              .child('clubs/$clubId/bug_reports/${docRef.id}/screenshot.png');

          await storageRef.putData(
            screenshotBytes,
            SettableMetadata(contentType: 'image/png'),
          );

          final downloadUrl = await storageRef.getDownloadURL();

          // Mettre à jour le document avec l'URL de la capture
          await docRef.update({'screenshotUrl': downloadUrl});
          debugPrint('📸 Screenshot uploadé: $downloadUrl');
        } catch (e) {
          debugPrint('❌ Erreur upload screenshot: $e');
          // On continue — le bug report est déjà enregistré sans screenshot
        }
      }

      return docRef.id;
    } catch (e, stack) {
      debugPrint('❌ Erreur création bug report: $e');
      Sentry.captureException(e, stackTrace: stack);
      rethrow;
    }
  }

  /// Collecte les informations de l'appareil.
  Future<Map<String, String>> _collectDeviceInfo() async {
    final deviceInfoPlugin = DeviceInfoPlugin();
    final info = <String, String>{};

    try {
      if (defaultTargetPlatform == TargetPlatform.android) {
        final android = await deviceInfoPlugin.androidInfo;
        info['model'] = '${android.manufacturer} ${android.model}';
        info['os'] = 'Android';
        info['osVersion'] = 'Android ${android.version.release} (SDK ${android.version.sdkInt})';
      } else if (defaultTargetPlatform == TargetPlatform.iOS) {
        final ios = await deviceInfoPlugin.iosInfo;
        info['model'] = ios.utsname.machine;
        info['os'] = 'iOS';
        info['osVersion'] = '${ios.systemName} ${ios.systemVersion}';
      } else if (kIsWeb) {
        final web = await deviceInfoPlugin.webBrowserInfo;
        info['model'] = web.browserName.name;
        info['os'] = 'Web';
        info['osVersion'] = web.userAgent ?? 'Inconnu';
      }
    } catch (e) {
      debugPrint('⚠️ BugReport: Erreur collecte device info: $e');
    }

    return info;
  }
}
