import 'dart:typed_data';

import 'package:calymob/models/bug_report_screenshot.dart';
import 'package:calymob/services/bug_report_service.dart';
import 'package:flutter_test/flutter_test.dart';

BugReportScreenshot screenshot(int marker) => BugReportScreenshot(
      bytes: Uint8List.fromList([marker]),
      page: '/page-$marker',
      capturedAt: DateTime.utc(2026, 10, 16, 10, marker),
    );

void main() {
  group('uploadBugReportScreenshots', () {
    test('uploads in capture order and returns ordered metadata', () async {
      final uploaded = <int>[];

      final result = await uploadBugReportScreenshots(
        screenshots: [screenshot(1), screenshot(2), screenshot(3)],
        upload: (index, capture) async {
          uploaded.add(index);
          return {
            'index': index,
            'page': capture.page,
            'capturedAt': capture.capturedAt.toIso8601String(),
          };
        },
        remove: (_) async {},
      );

      expect(uploaded, [0, 1, 2]);
      expect(result.map((item) => item['page']), [
        '/page-1',
        '/page-2',
        '/page-3',
      ]);
    });

    test('rejects more than the shared five-screenshot limit', () async {
      var uploadCalls = 0;

      await expectLater(
        uploadBugReportScreenshots(
          screenshots: List.generate(6, (index) => screenshot(index)),
          upload: (index, capture) async {
            uploadCalls++;
            return {};
          },
          remove: (_) async {},
        ),
        throwsArgumentError,
      );

      expect(uploadCalls, 0);
    });

    test('cleans the failed object and prior uploads in reverse order',
        () async {
      final removed = <int>[];

      await expectLater(
        uploadBugReportScreenshots(
          screenshots: [screenshot(1), screenshot(2), screenshot(3)],
          upload: (index, capture) async {
            if (index == 2) throw StateError('upload failed');
            return {'index': index};
          },
          remove: (index) async => removed.add(index),
        ),
        throwsStateError,
      );

      expect(removed, [2, 1, 0]);
    });

    test('keeps original upload error when best-effort cleanup fails',
        () async {
      await expectLater(
        uploadBugReportScreenshots(
          screenshots: [screenshot(1), screenshot(2)],
          upload: (index, capture) async {
            if (index == 1) throw StateError('original');
            return {'index': index};
          },
          remove: (_) async => throw StateError('cleanup'),
        ),
        throwsA(
          isA<StateError>().having(
            (error) => error.message,
            'message',
            'original',
          ),
        ),
      );
    });
  });
}
