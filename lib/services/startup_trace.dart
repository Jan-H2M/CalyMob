import 'dart:async';
import 'dart:developer' as developer;

import 'package:flutter/foundation.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

/// Records locally while booting; exports only after the measured work ends.
/// In particular, Sentry transport/collectors never gate the first frame.
class StartupTrace {
  StartupTrace(this.name)
      : startedAt = DateTime.now().toUtc(),
        _clock = Stopwatch()..start();

  final String name;
  final DateTime startedAt;
  final Stopwatch _clock;
  final List<StartupMeasurement> measurements = [];
  bool _finished = false;

  DateTime get now => startedAt.add(_clock.elapsed);

  Future<T> measure<T>(String phase, Future<T> Function() action) async {
    final start = now;
    final task = developer.TimelineTask()..start(phase);
    var status = const SpanStatus.ok();
    try {
      return await action();
    } catch (_) {
      status = const SpanStatus.internalError();
      rethrow;
    } finally {
      record(phase, start, now, status: status);
      task.finish();
    }
  }

  void record(String phase, DateTime start, DateTime end,
      {SpanStatus status = const SpanStatus.ok()}) {
    if (_finished) return;
    measurements.add(StartupMeasurement(phase, start, end, status));
    debugPrint('STARTUP $name $phase '
        '${end.difference(start).inMicroseconds / 1000} ms [$status]');
  }

  Future<void> finish({SpanStatus status = const SpanStatus.ok()}) async {
    if (_finished) return;
    _finished = true;
    final end = now;
    try {
      final transaction = Sentry.startTransaction(name, 'app.startup',
          startTimestamp: startedAt, bindToScope: false);
      for (final measurement in measurements) {
        final span = transaction.startChild('app.startup',
            description: measurement.phase, startTimestamp: measurement.start);
        await span.finish(
            status: measurement.status, endTimestamp: measurement.end);
      }
      await transaction.finish(status: status, endTimestamp: end);
    } catch (error) {
      // Observability must not become an initialization dependency.
      debugPrint('Startup trace export unavailable: $error');
    }
  }
}

@immutable
class StartupMeasurement {
  const StartupMeasurement(this.phase, this.start, this.end, this.status);
  final String phase;
  final DateTime start;
  final DateTime end;
  final SpanStatus status;
}

/// Only these prerequisites may gate providers and the first app frame.
Future<void> initializeCriticalStartup({
  required StartupTrace trace,
  required Future<void> Function() firebase,
  required Future<void> Function() readTracker,
  required Future<void> Function() locale,
}) async {
  await Future.wait([
    trace.measure('firebase.initialize', firebase),
    trace.measure('read_tracker.initialize', readTracker),
    trace.measure('locale.initialize', locale),
  ]);
}

/// Start independent optional services together, containing each failure.
Future<void> initializeDeferredStartup({
  required Future<void> Function() notifications,
  required Future<void> Function() deepLinks,
  required void Function(Object, StackTrace) onError,
}) async {
  Future<void> contained(Future<void> Function() action) async {
    try {
      await action();
    } catch (error, stack) {
      onError(error, stack);
    }
  }

  await Future.wait([contained(notifications), contained(deepLinks)]);
}
