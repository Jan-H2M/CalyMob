import 'dart:async';

import 'package:calymob/services/startup_trace.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

void main() {
  test('critical startup overlaps prerequisites and waits for all three',
      () async {
    final gates = List.generate(3, (_) => Completer<void>());
    final started = <int>[];
    var ready = false;
    Future<void> initialize(int index) {
      started.add(index);
      return gates[index].future;
    }

    final trace = StartupTrace('test.startup');
    final startup = initializeCriticalStartup(
      trace: trace,
      firebase: () => initialize(0),
      readTracker: () => initialize(1),
      locale: () => initialize(2),
    ).then((_) => ready = true);
    expect(started, [0, 1, 2]);
    gates[1].complete();
    gates[2].complete();
    await Future<void>.delayed(Duration.zero);
    expect(ready, isFalse, reason: 'Firebase must precede dependent providers');
    gates[0].complete();
    await startup;
    expect(ready, isTrue);
    expect(
        trace.measurements.map((m) => m.phase),
        containsAll([
          'firebase.initialize',
          'read_tracker.initialize',
          'locale.initialize',
        ]));
  });

  test('failed Firebase bootstrap remains an error with a failed span',
      () async {
    final trace = StartupTrace('test.startup');
    await expectLater(
        initializeCriticalStartup(
          trace: trace,
          firebase: () async => throw StateError('unavailable'),
          readTracker: () async {},
          locale: () async {},
        ),
        throwsStateError);
    expect(
        trace.measurements
            .singleWhere((m) => m.phase == 'firebase.initialize')
            .status,
        const SpanStatus.internalError());
  });

  testWidgets('slow optional notifications do not hold a frame or deep links',
      (tester) async {
    final notifications = Completer<void>();
    var linksReady = false;
    Future<void>? deferred;
    final errors = <Object>[];
    await tester.pumpWidget(Builder(builder: (context) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        deferred = initializeDeferredStartup(
          notifications: () => notifications.future,
          deepLinks: () async {
            linksReady = true;
          },
          onError: (error, _) => errors.add(error),
        );
      });
      return const MaterialApp(home: Text('Ready'));
    }));
    await tester.pump();
    expect(find.text('Ready'), findsOneWidget);
    expect(linksReady, isTrue);
    expect(notifications.isCompleted, isFalse);
    notifications.completeError(StateError('permission service unavailable'));
    await deferred;
    expect(errors.single, isStateError);
    expect(tester.takeException(), isNull);
  });

  test('exports measured timestamps once, even if SDK initialized later',
      () async {
    final trace = StartupTrace('test.before_sentry');
    await trace.measure('firebase.initialize', () async {});
    final measured = trace.measurements.single;
    final captured = <SentryTransaction>[];
    await Sentry.init((options) {
      options.dsn = 'https://public@example.invalid/1';
      options.tracesSampleRate = 1;
      options.beforeSendTransaction = (transaction, _) {
        captured.add(transaction);
        return null; // No transport or external request in this test.
      };
    });
    addTearDown(Sentry.close);
    await trace.finish();
    await trace.finish();
    expect(captured, hasLength(1));
    expect(captured.single.startTimestamp, trace.startedAt);
    final span = captured.single.spans.single;
    expect(span.startTimestamp, measured.start);
    expect(span.endTimestamp, measured.end);
    expect(span.toJson()['description'], 'firebase.initialize');
    expect(span.status, const SpanStatus.ok());
  });
}
