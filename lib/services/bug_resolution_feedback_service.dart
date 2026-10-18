import 'dart:typed_data';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_storage/firebase_storage.dart';

import '../models/bug_report_screenshot.dart';

/// Owns the reporter-side half of an explicitly requested resolution test.
/// Status and comments are always committed by the callable; the client can
/// only upload bounded images below the feedback request it already owns.
class BugResolutionFeedbackService {
  BugResolutionFeedbackService({
    FirebaseFunctions? functions,
    FirebaseStorage? storage,
  })  : _functions =
            functions ?? FirebaseFunctions.instanceFor(region: 'europe-west1'),
        _storage = storage ?? FirebaseStorage.instance;

  final FirebaseFunctions _functions;
  final FirebaseStorage _storage;

  Future<void> respond({
    required String clubId,
    required String reportId,
    required String feedbackId,
    required bool works,
    String text = '',
    List<BugReportScreenshot> screenshots = const [],
  }) async {
    final cleaned = text.trim();
    if (!works && cleaned.isEmpty) {
      throw ArgumentError.value(text, 'text', 'Veuillez décrire le problème.');
    }
    if (screenshots.length > maxBugReportScreenshots) {
      throw ArgumentError.value(
          screenshots, 'screenshots', 'Maximum 5 captures.');
    }
    final uploaded = <Reference>[];
    final metadata = <Map<String, dynamic>>[];
    try {
      for (var index = 0; index < screenshots.length; index++) {
        final screenshot = screenshots[index];
        if (screenshot.bytes.isEmpty) continue;
        final path = 'clubs/$clubId/bug_reports/$reportId/'
            'resolution_feedback/$feedbackId/screenshot_$index.png';
        final ref = _storage.ref(path);
        await ref.putData(
          Uint8List.fromList(screenshot.bytes),
          SettableMetadata(contentType: 'image/png'),
        );
        uploaded.add(ref);
        metadata.add(<String, dynamic>{
          'storagePath': path,
          'url': await ref.getDownloadURL(),
        });
      }
      await _functions
          .httpsCallable('respondToBugResolutionFeedbackV1')
          .call(<String, dynamic>{
        'clubId': clubId,
        'reportId': reportId,
        'feedbackId': feedbackId,
        'outcome': works ? 'confirmed' : 'reopened',
        'text': cleaned,
        'screenshots': metadata,
      });
    } catch (_) {
      for (final ref in uploaded.reversed) {
        try {
          await ref.delete();
        } catch (_) {}
      }
      rethrow;
    }
  }
}
