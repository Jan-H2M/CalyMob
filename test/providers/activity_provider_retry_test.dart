import 'dart:async';
import 'dart:collection';

import 'package:calymob/models/activity_item.dart';
import 'package:calymob/providers/activity_provider.dart';
import 'package:calymob/screens/operations/operations_list_screen.dart';
import 'package:calymob/services/activity_service.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('an older activity subscription cannot overwrite the newer list', () {
    final oldStream = _StubbornStream<List<ActivityItem>>();
    final newStream = _StubbornStream<List<ActivityItem>>();
    final service = _FakeActivityService()
      ..activityStreams.addAll([oldStream, newStream]);
    final provider = ActivityProvider(activityService: service);

    provider.listenToActivities('calypso');
    provider.listenToActivities('calypso');
    newStream.add([_activity('new')]);
    oldStream.add([_activity('old')]);

    expect(provider.activities.map((item) => item.id), ['new']);
    provider.dispose();
  });

  test(
    'closed list retains rows and exposes a retry after a stream error',
    () async {
      final initialStream = _StubbornStream<List<ActivityItem>>();
      final service = _FakeActivityService()
        ..closedStreams.addAll([
          initialStream,
          Stream<List<ActivityItem>>.error(StateError('offline')),
        ]);
      final provider = ActivityProvider(activityService: service);

      provider.listenToClosedActivities('calypso');
      initialStream.add([_activity('retained')]);
      provider.retryClosedActivities();
      await pumpEventQueue();

      expect(provider.closedActivities.map((item) => item.id), ['retained']);
      expect(provider.closedErrorMessage, contains('offline'));
      expect(provider.isLoadingClosed, isFalse);
      provider.dispose();
    },
  );

  test('an older closed-list subscription cannot overwrite a retry result', () {
    final oldStream = _StubbornStream<List<ActivityItem>>();
    final retryStream = _StubbornStream<List<ActivityItem>>();
    final service = _FakeActivityService()
      ..closedStreams.addAll([oldStream, retryStream]);
    final provider = ActivityProvider(activityService: service);

    provider.listenToClosedActivities('calypso');
    provider.retryClosedActivities();
    retryStream.add([_activity('new-closed')]);
    oldStream.add([_activity('old-closed')]);

    expect(provider.closedActivities.map((item) => item.id), ['new-closed']);
    provider.dispose();
  });

  testWidgets('closed-list failure notice exposes a working retry action', (
    tester,
  ) async {
    var retries = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: OperationsLoadFailureNotice(
            hasRetainedRows: false,
            onRetry: () => retries += 1,
          ),
        ),
      ),
    );

    expect(find.text('Chargement indisponible.'), findsOneWidget);
    expect(find.text('Réessayer'), findsOneWidget);
    await tester.tap(find.text('Réessayer'));
    expect(retries, 1);
  });
}

ActivityItem _activity(String id) => ActivityItem(
      id: id,
      type: 'operation',
      titre: id,
      date: DateTime(2026, 10, 17),
      categorie: 'sortie',
    );

class _FakeActivityService extends ActivityService {
  _FakeActivityService() : super(firestore: FakeFirebaseFirestore());

  final Queue<Stream<List<ActivityItem>>> activityStreams = Queue();
  final Queue<Stream<List<ActivityItem>>> closedStreams = Queue();

  @override
  Stream<List<ActivityItem>> getAllActivitiesStream(
    String clubId, {
    bool includeClosed = false,
    String? currentUserId,
  }) =>
      activityStreams.removeFirst();

  @override
  Stream<List<ActivityItem>> getClosedOperationsStream(String clubId) =>
      closedStreams.removeFirst();
}

/// Deliberately ignores cancellation so the test can deliver a late callback
/// from an obsolete source and prove that the provider's generation guard wins.
class _StubbornStream<T> extends Stream<T> {
  _StubbornSubscription<T>? _subscription;

  void add(T value) => _subscription?.add(value);

  @override
  StreamSubscription<T> listen(
    void Function(T event)? onData, {
    Function? onError,
    void Function()? onDone,
    bool? cancelOnError,
  }) {
    final subscription = _StubbornSubscription<T>();
    subscription.onData(onData);
    _subscription = subscription;
    return subscription;
  }
}

class _StubbornSubscription<T> implements StreamSubscription<T> {
  void Function(T event)? _onData;
  bool _isPaused = false;

  void add(T value) => _onData?.call(value);

  @override
  Future<E> asFuture<E>([E? futureValue]) => Completer<E>().future;

  @override
  Future<void> cancel() async {}

  @override
  bool get isPaused => _isPaused;

  @override
  void onData(void Function(T data)? handleData) => _onData = handleData;

  @override
  void onDone(void Function()? handleDone) {}

  @override
  void onError(Function? handleError) {}

  @override
  void pause([Future<void>? resumeSignal]) {
    _isPaused = true;
    resumeSignal?.whenComplete(resume);
  }

  @override
  void resume() => _isPaused = false;
}
