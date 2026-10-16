import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import '../models/bug_report_screenshot.dart';

typedef BugReportScreenshotUploader = Future<Map<String, dynamic>> Function(
  int index,
  BugReportScreenshot screenshot,
);
typedef BugReportScreenshotRemover = Future<void> Function(int index);

/// Uploads a bounded screenshot set and removes completed uploads if a later
/// upload fails. The returned metadata preserves capture order.
@visibleForTesting
Future<List<Map<String, dynamic>>> uploadBugReportScreenshots({
  required List<BugReportScreenshot> screenshots,
  required BugReportScreenshotUploader upload,
  required BugReportScreenshotRemover remove,
}) async {
  if (screenshots.length > maxBugReportScreenshots) {
    throw ArgumentError.value(
      screenshots.length,
      'screenshots',
      'A bug report accepts at most $maxBugReportScreenshots screenshots.',
    );
  }

  final uploadedIndexes = <int>[];
  final metadata = <Map<String, dynamic>>[];
  int? attemptedIndex;
  try {
    for (var index = 0; index < screenshots.length; index++) {
      final screenshot = screenshots[index];
      if (screenshot.bytes.isEmpty) continue;
      attemptedIndex = index;
      metadata.add(await upload(index, screenshot));
      uploadedIndexes.add(index);
      attemptedIndex = null;
    }
    return metadata;
  } catch (_) {
    // The failing upload may already have created its object (for example if
    // fetching its download URL failed), so include that index in cleanup.
    if (attemptedIndex != null) {
      try {
        await remove(attemptedIndex);
      } catch (_) {}
    }
    for (final index in uploadedIndexes.reversed) {
      try {
        await remove(index);
      } catch (_) {
        // Preserve the original upload error. Storage rules may prevent a
        // reporter from deleting an already uploaded object.
      }
    }
    rethrow;
  }
}

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
  /// - [screenshots]: captures d'écran PNG (0 à 5)
  /// - [currentRoute]: route/écran actuel
  Future<String> submitBugReport({
    required String clubId,
    required String userId,
    required String userName,
    required String userEmail,
    required String title,
    String? description,
    required String priority,
    List<BugReportScreenshot> screenshots = const [],
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
        if (lastEventId.isNotEmpty &&
            lastEventId != '00000000000000000000000000000000') {
          sentryReplayId = lastEventId;
        }
      } catch (e) {
        debugPrint(
          '⚠️ BugReport: Impossible de récupérer le Sentry replay ID: $e',
        );
      }

      if (screenshots.length > maxBugReportScreenshots) {
        throw ArgumentError.value(
          screenshots.length,
          'screenshots',
          'Maximum $maxBugReportScreenshots screenshots.',
        );
      }

      // 3. Créer d'abord le signalement vide. Les règles Storage vérifient ce
      // document pour prouver que l'appelant est bien le reporter avant tout
      // upload. Une mise à jour strictement limitée finalise ensuite la liste.
      final docRef = _firestore.collection('clubs/$clubId/bug_reports').doc();
      final reportData = {
        'app': 'CalyMob',
        'title': title,
        'description': description ?? '',
        'priority': priority,
        'status': 'nouveau', // Même valeur que CalyCompta (pas 'open')
        'reporter': {'uid': userId, 'name': userName, 'email': userEmail},
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
        'screenshotUrl': null,
        'screenshots': <Map<String, dynamic>>[],
        'createdAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      };
      await docRef.set(reportData);
      debugPrint('🐛 Bug report créé: ${docRef.id}');

      if (screenshots.isEmpty) return docRef.id;

      // 4. Upload et finalisation atomique du point de vue des lecteurs. Si
      // une étape échoue, les règles permettent au reporter de supprimer ses
      // objets et le document encore vide, sans toucher aux rapports finalisés.
      final uploadedRefs = <int, Reference>{};
      try {
        final screenshotMetadata = await uploadBugReportScreenshots(
          screenshots: screenshots,
          upload: (index, screenshot) async {
            final storagePath =
                'clubs/$clubId/bug_reports/${docRef.id}/screenshot_$index.png';
            final storageRef = _storage.ref().child(storagePath);
            await storageRef.putData(
              screenshot.bytes,
              SettableMetadata(contentType: 'image/png'),
            );
            uploadedRefs[index] = storageRef;
            final downloadUrl = await storageRef.getDownloadURL();
            return {
              'url': downloadUrl,
              'page': screenshot.page,
              'capturedAt': Timestamp.fromDate(screenshot.capturedAt),
              'storagePath': storagePath,
              'storageIndex': index,
            };
          },
          remove: (index) async {
            final storageRef = uploadedRefs[index];
            if (storageRef != null) await storageRef.delete();
          },
        );

        await docRef.update({
          'screenshotUrl': screenshotMetadata.first['url'],
          'screenshots': screenshotMetadata,
        });
        debugPrint('${screenshotMetadata.length} capture(s) jointe(s)');
      } catch (_) {
        for (final storageRef in uploadedRefs.values.toList().reversed) {
          try {
            await storageRef.delete();
          } catch (_) {}
        }
        try {
          await docRef.delete();
        } catch (_) {}
        rethrow;
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
        info['osVersion'] =
            'Android ${android.version.release} (SDK ${android.version.sdkInt})';
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
