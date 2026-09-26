import 'package:flutter/widgets.dart';

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

  void recordContent(String token) {
    if (_contentToken == token) return;
    _contentToken = token;
    _contentRevision += 1;
  }

  int? begin({required bool ready, required bool cursor}) {
    if (!ready || _inFlight || _contentRevision == 0) return null;
    final acknowledged = cursor
        ? _cursorAcknowledgedRevision
        : _legacyAcknowledgedRevision;
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
    final acknowledged = cursor
        ? _cursorAcknowledgedRevision
        : _legacyAcknowledgedRevision;
    return !_inFlight && _contentRevision > acknowledged;
  }
}
