import 'dart:async';

import 'package:calymob/services/notification_service.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_test/flutter_test.dart';

class _Settings extends Fake implements NotificationSettings {
  _Settings(this.authorizationStatus);
  @override
  final AuthorizationStatus authorizationStatus;
}

class _Messaging extends Fake implements FirebaseMessaging {
  AuthorizationStatus status = AuthorizationStatus.authorized;
  final permission = Completer<NotificationSettings>();
  int permissionRequests = 0;
  int tokenRequests = 0;

  @override
  Future<NotificationSettings> getNotificationSettings() async =>
      _Settings(status);

  @override
  Future<NotificationSettings> requestPermission({
    bool alert = true,
    bool announcement = false,
    bool badge = true,
    bool carPlay = false,
    bool criticalAlert = false,
    bool provisional = false,
    bool sound = true,
    bool providesAppNotificationSettings = false,
  }) {
    permissionRequests++;
    return permission.future;
  }

  @override
  Future<String?> getToken({String? vapidKey}) async {
    tokenRequests++;
    return 'test-token';
  }
}

class _LocalNotifications extends Fake
    implements FlutterLocalNotificationsPlugin {
  InitializationSettings? settings;
  DidReceiveNotificationResponseCallback? onTap;

  @override
  Future<bool?> initialize(
    InitializationSettings initializationSettings, {
    DidReceiveNotificationResponseCallback? onDidReceiveNotificationResponse,
    DidReceiveBackgroundNotificationResponseCallback?
        onDidReceiveBackgroundNotificationResponse,
  }) async {
    settings = initializationSettings;
    onTap = onDidReceiveNotificationResponse;
    return true;
  }

  @override
  Future<NotificationAppLaunchDetails?>
      getNotificationAppLaunchDetails() async =>
          const NotificationAppLaunchDetails(true,
              notificationResponse: NotificationResponse(
                  notificationResponseType:
                      NotificationResponseType.selectedNotification,
                  payload: 'initial'));
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late _Messaging messaging;
  late _LocalNotifications local;
  late NotificationService service;
  setUp(() {
    messaging = _Messaging();
    local = _LocalNotifications();
    service = NotificationService.forTesting(
        messaging: messaging,
        firestore: FakeFirebaseFirestore(),
        localNotifications: local);
  });

  test('launch payload and tap callback are ready without permission or token',
      () async {
    String? tapped;
    await service.initialize(onNotificationTap: (payload) => tapped = payload);
    expect(service.takeInitialLocalNotificationPayload(), 'initial');
    expect(service.takeInitialLocalNotificationPayload(), isNull);
    local.onTap!(const NotificationResponse(
        notificationResponseType: NotificationResponseType.selectedNotification,
        payload: 'foreground'));
    expect(tapped, 'foreground');
    expect(messaging.permissionRequests, 0);
    expect(messaging.tokenRequests, 0);
    expect(local.settings!.iOS!.requestAlertPermission, isFalse);
    expect(local.settings!.iOS!.requestBadgePermission, isFalse);
    expect(local.settings!.iOS!.requestSoundPermission, isFalse);
  });

  for (final status in [
    AuthorizationStatus.authorized,
    AuthorizationStatus.denied,
    AuthorizationStatus.provisional
  ]) {
    test(
        'existing $status avoids prompt and duplicate token-registration retry',
        () async {
      messaging.status = status;
      expect(await service.requestStartupPermission(), isFalse);
      expect(messaging.permissionRequests, 0);
      expect(messaging.tokenRequests, 0);
    });
  }

  test('new permission grant requests one prompt and signals token retry',
      () async {
    messaging.status = AuthorizationStatus.notDetermined;
    final result = service.requestStartupPermission();
    await Future<void>.delayed(Duration.zero);
    expect(messaging.permissionRequests, 1);
    messaging.permission.complete(_Settings(AuthorizationStatus.authorized));
    expect(await result, isTrue);
    expect(messaging.tokenRequests, 0);
  });

  test('new denial does not trigger token-registration retry', () async {
    messaging.status = AuthorizationStatus.notDetermined;
    messaging.permission.complete(_Settings(AuthorizationStatus.denied));
    expect(await service.requestStartupPermission(), isFalse);
  });
}
