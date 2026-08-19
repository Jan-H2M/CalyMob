import 'package:flutter/widgets.dart';

enum ScannerLifecycleAction { start, stop, none }

ScannerLifecycleAction scannerLifecycleAction({
  required AppLifecycleState state,
  required bool hasCameraPermission,
  required bool showingManualSearch,
}) {
  if (!hasCameraPermission) return ScannerLifecycleAction.none;

  return switch (state) {
    AppLifecycleState.resumed when !showingManualSearch =>
      ScannerLifecycleAction.start,
    AppLifecycleState.inactive => ScannerLifecycleAction.stop,
    _ => ScannerLifecycleAction.none,
  };
}
