import 'package:calymob/widgets/camera_error_view.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

void main() {
  Widget host(Widget child) => MaterialApp(
        home: Scaffold(body: SizedBox(height: 220, child: child)),
      );

  testWidgets('refused camera access offers the system settings',
      (tester) async {
    var opened = 0;
    var retried = 0;

    await tester.pumpWidget(host(CameraErrorView(
      error: const MobileScannerException(
        errorCode: MobileScannerErrorCode.permissionDenied,
      ),
      onRetry: () => retried++,
      onOpenSettings: () async {
        opened++;
        return true;
      },
    )));

    expect(tester.takeException(), isNull);
    expect(find.text('Accès à la caméra refusé'), findsOneWidget);
    // The raw technical code is no longer shown to members.
    expect(find.textContaining('permissionDenied'), findsNothing);

    await tester.tap(find.text('Ouvrir les réglages'));
    expect(opened, 1);

    await tester.tap(find.text('Réessayer'));
    expect(retried, 1);
  });

  testWidgets('other camera failures only offer a retry', (tester) async {
    await tester.pumpWidget(host(CameraErrorView(
      error: const MobileScannerException(
        errorCode: MobileScannerErrorCode.genericError,
      ),
      onRetry: () {},
    )));

    expect(find.text('Caméra indisponible'), findsOneWidget);
    expect(find.text('Ouvrir les réglages'), findsNothing);
    expect(find.text('Réessayer'), findsOneWidget);
  });

  test('isCameraPermissionDenied', () {
    expect(isCameraPermissionDenied(null), isFalse);
    expect(
      isCameraPermissionDenied(const MobileScannerException(
        errorCode: MobileScannerErrorCode.permissionDenied,
      )),
      isTrue,
    );
    expect(
      isCameraPermissionDenied(const MobileScannerException(
        errorCode: MobileScannerErrorCode.unsupported,
      )),
      isFalse,
    );
  });
}
