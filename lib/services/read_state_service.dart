import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import '../models/read_state.dart';
import 'local_read_tracker.dart';

typedef UnreadCursorBootstrapCall =
    Future<Object?> Function(Map<String, Object> payload);
typedef ReadStateAcknowledgementWrite = Future<void> Function(
  DocumentReference<Map<String, dynamic>> reference,
  Map<String, dynamic> payload,
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
    Future<void> Function(Duration duration)? acknowledgementDelay,
  }) : _firestore = firestore ?? FirebaseFirestore.instance,
       _functions = functions,
       _clock = clock ?? DateTime.now,
       _bootstrapCall = bootstrapCall,
       _acknowledgementWrite = acknowledgementWrite ?? _writeAcknowledgement,
       _acknowledgementDelay =
           acknowledgementDelay ?? Future<void>.delayed;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions? _functions;
  final DateTime Function() _clock;
  final UnreadCursorBootstrapCall? _bootstrapCall;
  final ReadStateAcknowledgementWrite _acknowledgementWrite;
  final Future<void> Function(Duration duration) _acknowledgementDelay;
  final Map<String, DateTime> _recentAcknowledgements = <String, DateTime>{};
  final Map<String, _AcknowledgementState> _acknowledgementStates =
      <String, _AcknowledgementState>{};

  static const Duration acknowledgementCoalesceWindow = Duration(seconds: 10);
  static const Duration bootstrapTimeout = Duration(seconds: 20);

  DocumentReference<Map<String, dynamic>> _sectionRef(
    String clubId,
    String userId,
    ReadStateSection section,
  ) => _firestore
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
  ) => _sectionRef(
    clubId,
    userId,
    section,
  ).collection(section.scopeCollection).doc(scopeId);

  Stream<ReadStateSectionCursor> watchSection(
    String clubId,
    String userId,
    ReadStateSection section,
  ) => _sectionRef(clubId, userId, section).snapshots().map(
    (snapshot) =>
        ReadStateSectionCursor.fromFirestore(section, snapshot.data()),
  );

  Stream<ReadStateScopeCursor> watchScope(
    String clubId,
    String userId,
    ReadStateSection section,
    String scopeId,
  ) => _scopeRef(clubId, userId, section, scopeId).snapshots().map(
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

  Future<DateTime?> getEffectiveCursor(
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
    return section == ReadStateSection.announcements
        ? sectionCursor.lastSeenAt
        : effectiveReadCursor(
            globalLastSeenAt: sectionCursor.globalLastSeenAt,
            scopeLastSeenAt: scopeCursor?.lastSeenAt,
          );
  }

  /// Atomically replaces the migration seed with the member's legacy local
  /// read state. The callable authenticates the member, validates/clamps all
  /// device timestamps against server time and records an idempotency marker.
  /// Direct clients deliberately cannot backdate cursor documents.
  Future<void> bootstrapFromLegacy(
    String clubId,
    LegacyReadStateSnapshot snapshot,
  ) async {
    final payload = <String, Object>{
      'clubId': clubId,
      ...snapshot.toCallablePayload(),
    };
    final Object? rawResult =
        await (_bootstrapCall != null
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

  Future<void> markAnnouncementSeen(String clubId, String userId) =>
      _markSection(clubId, userId, ReadStateSection.announcements);

  Future<void> markSectionSeen(
    String clubId,
    String userId,
    ReadStateSection section,
  ) => _markSection(clubId, userId, section);

  Future<void> markEventConversationSeen(
    String clubId,
    String userId,
    String operationId,
  ) => _markScope(clubId, userId, ReadStateSection.events, operationId);

  Future<void> markTeamChannelSeen(
    String clubId,
    String userId,
    String channelId,
  ) => _markScope(clubId, userId, ReadStateSection.teams, channelId);

  Future<void> markSessionChatSeen(
    String clubId,
    String userId,
    String scopeId,
  ) => _markScope(clubId, userId, ReadStateSection.sessions, scopeId);

  Future<void> _markSection(
    String clubId,
    String userId,
    ReadStateSection section,
  ) async {
    final key = '$clubId/$userId/${section.id}';
    await _coalescedAcknowledgement(
      key,
      () => _acknowledgementWrite(
        _sectionRef(clubId, userId, section),
        ReadStateSectionCursor.acknowledgementPayload(section),
      ),
    );
  }

  Future<void> _markScope(
    String clubId,
    String userId,
    ReadStateSection section,
    String scopeId,
  ) async {
    final key = '$clubId/$userId/${section.id}/$scopeId';
    await _coalescedAcknowledgement(
      key,
      () => _acknowledgementWrite(
        _scopeRef(clubId, userId, section, scopeId),
        ReadStateScopeCursor.acknowledgementPayload(),
      ),
    );
  }

  Future<void> _coalescedAcknowledgement(
    String key,
    Future<void> Function() write,
  ) {
    final state = _acknowledgementStates.putIfAbsent(
      key,
      _AcknowledgementState.new,
    );
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
      while (true) {
        final now = _clock();
        final last = _recentAcknowledgements[key];
        final elapsed = last == null
            ? acknowledgementCoalesceWindow
            : now.difference(last);
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
        await state.write!();
        _recentAcknowledgements[key] = _clock();
        if (!state.requested) break;
      }
      if (!state.completion.isCompleted) state.completion.complete();
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
  Future<void> Function()? write;
  bool requested = false;
  bool running = false;
  final Completer<void> completion = Completer<void>();
}

Future<void> _writeAcknowledgement(
  DocumentReference<Map<String, dynamic>> reference,
  Map<String, dynamic> payload,
) => reference.set(payload);
