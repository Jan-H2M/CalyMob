import 'dart:async';

import 'package:calymob/utils/authenticated_stream.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
      'waits for auth, cancels on logout/account switch, retries on token refresh',
      () async {
    final auth = StreamController<String?>();
    final sources = <StreamController<int>>[];
    final values = <int>[];
    final errors = <Object>[];
    var cancelled = 0;
    final subscription = authenticatedStream<int>(() {
      final source = StreamController<int>(onCancel: () => cancelled++);
      sources.add(source);
      return source.stream;
    }, userId: 'owner', authUserIds: () => auth.stream)
        .listen(values.add, onError: errors.add);
    Future<void> flush() => Future<void>.delayed(Duration.zero);

    auth.add(null);
    await flush();
    expect(sources, isEmpty);
    expect((errors.single as FirebaseException).code, 'unauthenticated');
    auth.add('owner');
    await flush();
    sources[0].add(1);
    await flush();
    expect(values, [1]);

    sources[0].addError(FirebaseException(
        plugin: 'cloud_firestore', code: 'permission-denied'));
    await flush();
    expect((errors.last as FirebaseException).code, 'permission-denied');
    // Refresh of the same UID is meaningful; do not distinct() UID events.
    auth.add('owner');
    await flush();
    expect(cancelled, 1);
    sources[0].add(99);
    sources[1].add(2);
    await flush();
    expect(values, [1, 2]);

    auth.add('other');
    await flush();
    expect(cancelled, 2);
    expect((errors.last as FirebaseException).code, 'unauthenticated');
    expect(errors, hasLength(3));
    expect(sources, hasLength(2));
    sources[1].add(99);
    auth.add(null);
    await flush();
    expect(values, [1, 2]);

    auth.add('owner');
    await flush();
    expect(sources, hasLength(3));
    await subscription.cancel();
    expect(cancelled, 3);
    expect(auth.hasListener, isFalse);
    await auth.close();
    for (final source in sources) {
      await source.close();
    }
  });

  test('contains synchronous source failures and can retry after them',
      () async {
    final auth = StreamController<String?>();
    var attempts = 0;
    final values = <int>[];
    final errors = <Object>[];
    final subscription = authenticatedStream<int>(() {
      if (attempts++ == 0) throw StateError('source failed');
      return Stream.value(42);
    }, authUserIds: () => auth.stream).listen(values.add, onError: errors.add);
    auth.add('owner');
    await Future<void>.delayed(Duration.zero);
    expect(errors.single, isA<StateError>());
    auth.add('owner');
    await Future<void>.delayed(Duration.zero);
    expect(values, [42]);
    await subscription.cancel();
    await auth.close();
  });
}
