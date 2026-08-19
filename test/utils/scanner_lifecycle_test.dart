import 'package:calymob/utils/scanner_lifecycle.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('scannerLifecycleAction', () {
    test('restarts barcode detection when the app resumes', () {
      expect(
        scannerLifecycleAction(
          state: AppLifecycleState.resumed,
          hasCameraPermission: true,
          showingManualSearch: false,
        ),
        ScannerLifecycleAction.start,
      );
    });

    test('stops detection while the app becomes inactive', () {
      expect(
        scannerLifecycleAction(
          state: AppLifecycleState.inactive,
          hasCameraPermission: true,
          showingManualSearch: false,
        ),
        ScannerLifecycleAction.stop,
      );
    });

    test('does not restart behind manual member search', () {
      expect(
        scannerLifecycleAction(
          state: AppLifecycleState.resumed,
          hasCameraPermission: true,
          showingManualSearch: true,
        ),
        ScannerLifecycleAction.none,
      );
    });

    test('ignores permission-dialog lifecycle events until authorized', () {
      expect(
        scannerLifecycleAction(
          state: AppLifecycleState.resumed,
          hasCameraPermission: false,
          showingManualSearch: false,
        ),
        ScannerLifecycleAction.none,
      );
    });
  });
}
