import 'dart:async';

import 'package:flutter/widgets.dart';

/// Shared observer for screens that must only acknowledge content while their
/// route is actually visible. The observer also gives a covered route an
/// explicit retry point when the covering route is popped.
final RouteObserver<ModalRoute<dynamic>> readAcknowledgementRouteObserver =
    RouteObserver<ModalRoute<dynamic>>();

/// Mounted widgets can remain alive below an opaque route. Such content is not
/// visible and must not advance read cursors until its route becomes current.
bool isCurrentRouteForReadAcknowledgement(BuildContext context) =>
    ModalRoute.of(context)?.isCurrent ?? true;

/// Tracks successful visibility acknowledgements independently for legacy and
/// cursor authority. A cursor handover therefore still acknowledges content
/// that was already marked through the legacy path while bootstrap was busy.
class VisibleReadAckGate {
  String? _contentToken;
  int _contentRevision = 0;
  int _legacyAcknowledgedRevision = 0;
  int _cursorAcknowledgedRevision = 0;
  bool _inFlight = false;

  bool recordContent(String token) {
    if (_contentToken == token) return false;
    _contentToken = token;
    _contentRevision += 1;
    return true;
  }

  int? begin({required bool ready, required bool cursor}) {
    if (!ready || _inFlight || _contentRevision == 0) return null;
    final acknowledged =
        cursor ? _cursorAcknowledgedRevision : _legacyAcknowledgedRevision;
    if (acknowledged >= _contentRevision) return null;
    _inFlight = true;
    return _contentRevision;
  }

  void finish({
    required int revision,
    required bool cursor,
    required bool succeeded,
  }) {
    if (succeeded) {
      if (cursor) {
        if (revision > _cursorAcknowledgedRevision) {
          _cursorAcknowledgedRevision = revision;
        }
      } else if (revision > _legacyAcknowledgedRevision) {
        _legacyAcknowledgedRevision = revision;
      }
    }
    _inFlight = false;
  }

  bool hasPending({required bool cursor}) {
    final acknowledged =
        cursor ? _cursorAcknowledgedRevision : _legacyAcknowledgedRevision;
    return !_inFlight && _contentRevision > acknowledged;
  }
}

/// Capped retry scheduling for transient acknowledgement failures.
///
/// [suspend] cancels the pending timer without resetting the backoff position;
/// callers invoke it when the app is backgrounded or the route is covered.
/// Once the final delay is reached it is reused until the visible write
/// succeeds, so a prolonged offline period cannot permanently strand unread
/// state while the screen remains open.
class VisibleReadAckRetryScheduler {
  VisibleReadAckRetryScheduler({
    this.delays = const <Duration>[
      Duration(milliseconds: 750),
      Duration(seconds: 2),
      Duration(seconds: 5),
    ],
  });

  final List<Duration> delays;
  Timer? _timer;
  int _attempt = 0;

  bool get isScheduled => _timer?.isActive ?? false;
  int get attempts => _attempt;

  bool schedule(VoidCallback callback) {
    if (isScheduled || delays.isEmpty) return false;
    final index = _attempt < delays.length ? _attempt : delays.length - 1;
    final delay = delays[index];
    if (_attempt < delays.length) _attempt += 1;
    _timer = Timer(delay, () {
      _timer = null;
      callback();
    });
    return true;
  }

  void suspend() {
    _timer?.cancel();
    _timer = null;
  }

  void reset() {
    suspend();
    _attempt = 0;
  }

  void dispose() => suspend();
}
