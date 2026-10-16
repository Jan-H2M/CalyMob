import 'dart:typed_data';

const int maxBugReportScreenshots = 5;

/// An in-memory screenshot captured while composing a bug report.
class BugReportScreenshot {
  const BugReportScreenshot({
    required this.bytes,
    required this.page,
    required this.capturedAt,
  });

  final Uint8List bytes;
  final String page;
  final DateTime capturedAt;
}

/// Draft fields retained while the reporter navigates to capture another page.
class BugReportDraft {
  const BugReportDraft({
    this.title = '',
    this.description = '',
    this.priority = 'annoying',
  });

  final String title;
  final String description;
  final String priority;
}
