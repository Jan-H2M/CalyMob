import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import '../models/read_state.dart';
import 'local_read_tracker.dart';

typedef UnreadCursorBootstrapCall = Future<Object?> Function(
    Map<String, Object> payload);
typedef ReadStateAcknowledgementWrite = Future<void> Function(
  DocumentReference<Map<String, dynamic>> reference,
  Map<String, dynamic> payload,
);
typedef VisibleReadAcknowledgementCall = Future<Object?> Function(
  Map<String, Object?> payload,
);

/// Firestore API for unread cursor v1. This service never writes a device clock:
/// every acknowledgement uses [FieldValue.serverTimestamp] and matches the
/// Phase-1 security-rule allowlists exactly.
class ReadStateService {
  ReadStateService({
    FirebaseFirestore? firestore,
    FirebaseFunctions? functions,
    DateTime Function()? clock,
    UnreadCursorBootstrapCall? bootstrapCall,
    ReadStateAcknowledgementWrite? acknowledgementWrite,
    VisibleReadAcknowledgementCall? visibleAcknowledgementCall,
    Future<void> Function(Duration duration)? acknowledgementDelay,
  })  : _firestore = firestore ?? FirebaseFirestore.instance,
        _functions = functions,
        _clock = clock ?? DateTime.now,
        _bootstrapCall = bootstrapCall,
        _acknowledgementWrite = acknowledgementWrite ?? _writeAcknowledgement,
        _visibleAcknowledgementCall = visibleAcknowledgementCall,
        _acknowledgementDelay = acknowledgementDelay ?? Future<void>.delayed;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions? _functions;
  final DateTime Function() _clock;
  final UnreadCursorBootstrapCall? _bootstrapCall;
  final ReadStateAcknowledgementWrite _acknowledgementWrite;
  final VisibleReadAcknowledgementCall? _visibleAcknowledgementCall;
  final Future<void> Function(Duration duration) _acknowledgementDelay;
  final Map<String, DateTime> _recentAcknowledgements = <String, DateTime>{};
  final Map<String, DateTime> _recentAcknowledgementResults =
      <String, DateTime>{};
  final Map<String, _AcknowledgementState> _acknowledgementStates =
      <String, _AcknowledgementState>{};

  static const Duration acknowledgementCoalesceWindow = Duration(seconds: 10);
  static const Duration bootstrapTimeout = Duration(seconds: 20);

  DocumentReference<Map<String, dynamic>> _sectionRef(
    String clubId,
    String userId,
    ReadStateSection section,
  ) =>
      _firestore
          .collection('clubs')
          .doc(clubId)
          .collection('members')
          .doc(userId)
          .collection('read_state')
          .doc(section.id);

  DocumentReference<Map<String, dynamic>> _scopeRef(
    String clubId,
    String userId,
    ReadStateSection section,
    String scopeId,
  ) =>
      _sectionRef(
        clubId,
        userId,
        section,
      ).collection(section.scopeCollection).doc(scopeId);

  Stream<ReadStateSectionCursor> watchSection(
    String clubId,
    String userId,
    ReadStateSection section,
  ) =>
      _sectionRef(clubId, userId, section).snapshots().map(
            (snapshot) =>
                ReadStateSectionCursor.fromFirestore(section, snapshot.data()),
          );

  Stream<ReadStateScopeCursor> watchScope(
    String clubId,
    String userId,
    ReadStateSection section,
    String scopeId,
  ) =>
      _scopeRef(clubId, userId, section, scopeId).snapshots().map(
            (snapshot) => ReadStateScopeCursor.fromFirestore(snapshot.data()),
          );

  Future<ReadStateSectionCursor> getSection(
    String clubId,
    String userId,
    ReadStateSection section,
  ) async {
    final snapshot = await _sectionRef(clubId, userId, section).get();
    return ReadStateSectionCursor.fromFirestore(section, snapshot.data());
  }

  Future<Timestamp?> getEffectiveCursor(
    String clubId,
    String userId,
    ReadStateSection section, {
    String? scopeId,
  }) async {
    final sectionFuture = getSection(clubId, userId, section);
    final scopeFuture = scopeId == null || !section.supportsScopes
        ? Future<ReadStateScopeCursor?>.value(null)
        : _scopeRef(clubId, userId, section, scopeId).get().then(
              (snapshot) => ReadStateScopeCursor.fromFirestore(snapshot.data()),
            );
    final values = await Future.wait<Object?>([sectionFuture, scopeFuture]);
    final sectionCursor = values[0] as ReadStateSectionCursor;
    final scopeCursor = values[1] as ReadStateScopeCursor?;
    return effectiveReadCursor(
      globalLastSeenAt: section == ReadStateSection.announcements
          ? sectionCursor.lastSeenAt
          : sectionCursor.globalLastSeenAt,
      scopeLastSeenAt: scopeCursor?.lastSeenAt,
    );
  }

  /// Atomically replaces the migration seed with the member's legacy local
  /// read state. The callable authenticates the member, validates/clamps all
  /// device timestamps against server time and records an idempotency marker.
  /// Direct clients deliberately cannot backdate cursor documents.
  Future<void> bootstrapFromLegacy(
    String clubId,
    String userId,
    LegacyReadStateSnapshot snapshot,
  ) async {
    final payload = <String, Object>{
      'clubId': clubId,
      'memberId': userId,
      ...snapshot.toCallablePayload(),
    };
    final Object? rawResult = await (_bootstrapCall != null
            ? _bootstrapCall!(payload)
            : (_functions ??
                    FirebaseFunctions.instanceFor(region: 'europe-west1'))
                .httpsCallable('bootstrapUnreadCursorV1')
                .call(payload)
                .then<Object?>((result) => result.data))
        .timeout(bootstrapTimeout);
    if (rawResult is! Map) {
      throw StateError('Invalid unread cursor bootstrap response.');
    }
    final status = rawResult['status'];
    final schemaVersion = rawResult['schemaVersion'];
    if (schemaVersion != 1 ||
        (status != 'bootstrapped' &&
            status != 'merged' &&
            status != 'already-complete')) {
      throw StateError('Unread cursor bootstrap was not confirmed.');
    }
  }

  /// Creates the four root cursors for a new user if absent. Existing cursors
  /// are never overwritten, so this is safe to retry after an interrupted
  /// login/flag rollout.
  Future<void> ensureRootCursors(String clubId, String userId) async {
    for (final section in ReadStateSection.values) {
      final reference = _sectionRef(clubId, userId, section);
      final snapshot = await reference.get();
      if (!snapshot.exists) {
        await reference.set(
          ReadStateSectionCursor.acknowledgementPayload(section),
        );
      }
    }
  }

  Future<DateTime> markAnnouncementSeen(
    String clubId,
    String userId,
    String announcementId, {
    String? visibleReplyId,
  }) =>
      _markVerifiedScope(
        clubId,
        userId,
        ReadStateSection.announcements,
        announcementId,
        visibleMessageId: visibleReplyId,
      );

  Future<DateTime> markSectionSeen(
    String clubId,
    String userId,
    ReadStateSection section,
  ) =>
      _markSection(clubId, userId, section);

  Future<DateTime> markEventConversationSeen(
    String clubId,
    String userId,
    String operationId, {
    required String visibleMessageId,
  }) =>
      _markVerifiedScope(
        clubId,
        userId,
        ReadStateSection.events,
        operationId,
        visibleMessageId: visibleMessageId,
      );

  Future<DateTime> markTeamChannelSeen(
    String clubId,
    String userId,
    String channelId, {
    required String visibleMessageId,
  }) =>
      _markVerifiedScope(
        clubId,
        userId,
        ReadStateSection.teams,
        channelId,
        visibleMessageId: visibleMessageId,
      );

  Future<DateTime> markSessionChatSeen(
    String clubId,
    String userId,
    String scopeId, {
    required String visibleMessageId,
    String? sessionId,
    String? groupType,
    String? groupLevel,
  }) =>
      _markVerifiedScope(
        clubId,
        userId,
        ReadStateSection.sessions,
        scopeId,
        visibleMessageId: visibleMessageId,
        sessionId: sessionId,
        groupType: groupType,
        groupLevel: groupLevel,
      );

  Future<DateTime> _markSection(
    String clubId,
    String userId,
    ReadStateSection section,
  ) async {
    final key = '$clubId/$userId/${section.id}';
    return _coalescedAcknowledgement(
      key,
      () async {
        final reference = _sectionRef(clubId, userId, section);
        await _acknowledgementWrite(
          reference,
          ReadStateSectionCursor.acknowledgementPayload(section),
        );
        final snapshot = await reference.get();
        final field = section == ReadStateSection.announcements
            ? 'last_seen_at'
            : 'global_last_seen_at';
        return _requiredServerTimestamp(snapshot.data()?[field]);
      },
    );
  }

  Future<DateTime> _markVerifiedScope(
    String clubId,
    String userId,
    ReadStateSection section,
    String scopeId, {
    String? visibleMessageId,
    String? sessionId,
    String? groupType,
    String? groupLevel,
  }) async {
    final key = '$clubId/$userId/${section.id}/$scopeId/'
        '${visibleMessageId ?? 'root'}';
    return _coalescedAcknowledgement(
      key,
      () async {
        final payload = <String, Object?>{
          'clubId': clubId,
          'memberId': userId,
          'section': section.id,
          'scopeId': scopeId,
          if (visibleMessageId != null) 'visibleMessageId': visibleMessageId,
          if (sessionId != null) 'sessionId': sessionId,
          if (groupType != null) 'groupType': groupType,
          if (groupLevel != null) 'groupLevel': groupLevel,
        };
        final result = await (_visibleAcknowledgementCall != null
                ? _visibleAcknowledgementCall!(payload)
                : (_functions ??
                        FirebaseFunctions.instanceFor(region: 'europe-west1'))
                    .httpsCallable('acknowledgeVisibleUnreadCursorV1')
                    .call(payload)
                    .then<Object?>((response) => response.data))
            .timeout(bootstrapTimeout);
        if (result is! Map ||
            !{'acknowledged', 'already-seen'}.contains(result['status'])) {
          throw StateError('Visible unread acknowledgement was not confirmed.');
        }
        final visibleThroughMs = result['visibleThroughMs'];
        if (visibleThroughMs is! int) {
          throw StateError(
              'Visible unread acknowledgement has no server cursor.');
        }
        return DateTime.fromMillisecondsSinceEpoch(
          visibleThroughMs,
          isUtc: true,
        );
      },
      reuseRecentResult: true,
      repeatDuringWrite: false,
    );
  }

  Future<DateTime> _coalescedAcknowledgement(
    String key,
    Future<DateTime> Function() write, {
    bool reuseRecentResult = false,
    bool repeatDuringWrite = true,
  }) {
    final active = _acknowledgementStates[key];
    if (active != null && !repeatDuringWrite) {
      return active.completion.future;
    }
    final last = _recentAcknowledgements[key];
    final recentResult = _recentAcknowledgementResults[key];
    if (reuseRecentResult &&
        last != null &&
        recentResult != null &&
        _clock().difference(last) < acknowledgementCoalesceWindow) {
      return Future<DateTime>.value(recentResult);
    }
    final state = active ?? _AcknowledgementState();
    _acknowledgementStates[key] = state;
    state
      ..write = write
      ..requested = true;
    if (!state.running) {
      state.running = true;
      unawaited(_drainAcknowledgements(key, state));
    }
    return state.completion.future;
  }

  Future<void> _drainAcknowledgements(
    String key,
    _AcknowledgementState state,
  ) async {
    try {
      DateTime? acknowledgedThrough;
      while (true) {
        final now = _clock();
        final last = _recentAcknowledgements[key];
        final elapsed =
            last == null ? acknowledgementCoalesceWindow : now.difference(last);
        final delay = elapsed < acknowledgementCoalesceWindow
            ? acknowledgementCoalesceWindow - elapsed
            : Duration.zero;
        if (delay != Duration.zero) {
          await _acknowledgementDelay(delay);
        }

        // Requests received while waiting are covered by the upcoming server
        // timestamp. Only a request arriving during the write needs a trailing
        // acknowledgement after the coalesce window.
        state.requested = false;
        acknowledgedThrough = await state.write!();
        _recentAcknowledgements[key] = _clock();
        _recentAcknowledgementResults[key] = acknowledgedThrough;
        if (!state.requested) break;
      }
      if (!state.completion.isCompleted) {
        state.completion.complete(acknowledgedThrough);
      }
    } catch (error, stackTrace) {
      if (!state.completion.isCompleted) {
        state.completion.completeError(error, stackTrace);
      }
    } finally {
      if (identical(_acknowledgementStates[key], state)) {
        _acknowledgementStates.remove(key);
      }
    }
  }
}

class _AcknowledgementState {
  Future<DateTime> Function()? write;
  bool requested = false;
  bool running = false;
  final Completer<DateTime> completion = Completer<DateTime>();
}

DateTime _requiredServerTimestamp(Object? value) {
  if (value is Timestamp) return value.toDate();
  if (value is DateTime) return value;
  throw StateError('Unread acknowledgement server timestamp is unavailable.');
}

Future<void> _writeAcknowledgement(
  DocumentReference<Map<String, dynamic>> reference,
  Map<String, dynamic> payload,
) =>
    reference.set(payload);
