import 'dart:async';

import 'package:calymob/services/feature_flag_service.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('notifier contains auth errors, replaces listeners and disposes them',
      () async {
    final db = FakeFirebaseFirestore();
    final auth = StreamController<String?>.broadcast();
    final service =
        FeatureFlagService(firestore: db, authUserIds: () => auth.stream);
    var notifications = 0;
    service.addListener(() => notifications++);
    service.listen('first');
    auth.add(null);
    await Future<void>.delayed(Duration.zero);
    expect(service.isLoading, isFalse);
    expect((service.error as FirebaseException).code, 'unauthenticated');
    auth.add('member');
    await Future<void>.delayed(Duration.zero);
    expect(service.error, isNull);

    service.listen('second');
    auth.add('member');
    await Future<void>.delayed(Duration.zero);
    final before = notifications;
    await db.doc('clubs/first/settings/feature_flags').set({'ignored': true});
    await Future<void>.delayed(Duration.zero);
    expect(notifications, before);
    await db.doc('clubs/second/settings/feature_flags').set({'live': true});
    await Future<void>.delayed(Duration.zero);
    expect(notifications, greaterThan(before));
    service.dispose();
    await Future<void>.delayed(Duration.zero);
    expect(auth.hasListener, isFalse);
    await auth.close();
  });

  test('unread flag stays unknown on auth loss and recovers after reauth',
      () async {
    final db = FakeFirebaseFirestore();
    final auth = StreamController<String?>();
    final service =
        FeatureFlagService(firestore: db, authUserIds: () => auth.stream);
    final events = <Object>[];
    final subscription =
        service.unreadCursorV1('club').listen(events.add, onError: events.add);
    auth.add(null);
    await Future<void>.delayed(Duration.zero);
    expect(events.single, isA<FirebaseException>());
    auth.add('member');
    await Future<void>.delayed(Duration.zero);
    expect(events, hasLength(2));
    expect(events.last, isNot(isA<FirebaseException>()));
    await subscription.cancel();
    service.dispose();
    await auth.close();
  });
}
