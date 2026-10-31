import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:calymob/services/deep_link_service.dart';
import 'package:calymob/services/startup_trace.dart';
import 'package:flutter_test/flutter_test.dart';

class _Links extends Fake implements AppLinks {
  final initial = Completer<Uri?>();
  final opened = StreamController<Uri>.broadcast();

  @override
  Future<Uri?> getInitialLink() => initial.future;

  @override
  Stream<Uri> get uriLinkStream => opened.stream;
}

void main() {
  test(
      'post-frame initialization delivers cold and warm links while permission waits',
      () async {
    final links = _Links();
    final service = DeepLinkService.forTesting(appLinks: links);
    final notificationPermission = Completer<void>();
    // The app installs its Navigator/listeners before deferred initialization.
    final resetCodes = <String>[];
    final batches = <String>[];
    service.onPasswordReset.listen((data) => resetCodes.add(data.oobCode));
    service.onHistoricalValidation.listen((data) => batches.add(data.batchId));
    final deferred = initializeDeferredStartup(
      notifications: () => notificationPermission.future,
      deepLinks: service.initialize,
      onError: (error, _) => fail('Unexpected startup error: $error'),
    );
    links.initial.complete(Uri.parse(
        'calymob://reset-password?mode=resetPassword&oobCode=fixture-reset-code'));
    await Future<void>.delayed(Duration.zero);
    expect(resetCodes, ['fixture-reset-code']);
    expect(notificationPermission.isCompleted, isFalse);
    links.opened.add(
        Uri.parse('calymob://historical-validation?batchId=fixture-batch'));
    await Future<void>.delayed(Duration.zero);
    expect(batches, ['fixture-batch']);
    notificationPermission.complete();
    await deferred;
    service.dispose();
    await links.opened.close();
  });
  test(
      'Boutique missions deep link survives cold start until login and carries no member authority',
      () async {
    final links = _Links();
    final service = DeepLinkService.forTesting(appLinks: links);
    var opened = 0;
    service.onBoutiqueMissions.listen((_) => opened++);
    final init = service.initialize();
    links.initial.complete(
        Uri.parse('calymob://boutique/missions?memberId=someone-else'));
    await init;
    await Future<void>.delayed(Duration.zero);
    expect(opened, 1);
    expect(service.hasPendingBoutiqueMissions, isTrue);
    service.hasPendingBoutiqueMissions = false;
    links.opened.add(Uri.parse('calymob://boutique/missions'));
    await Future<void>.delayed(Duration.zero);
    expect(opened, 2);
    service.dispose();
    await links.opened.close();
  });
}
