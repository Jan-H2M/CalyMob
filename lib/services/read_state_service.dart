import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/read_state.dart';

/// Firestore API for unread cursor v1. This service never writes a device clock:
/// every acknowledgement uses [FieldValue.serverTimestamp] and matches the
/// Phase-1 security-rule allowlists exactly.
class ReadStateService {
  ReadStateService({FirebaseFirestore? firestore, DateTime Function()? clock})
      : _firestore = firestore ?? FirebaseFirestore.instance,
        _clock = clock ?? DateTime.now;

  final FirebaseFirestore _firestore;
  final DateTime Function() _clock;
  final Map<String, DateTime> _recentAcknowledgements = <String, DateTime>{};

  static const Duration acknowledgementCoalesceWindow = Duration(seconds: 10);

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
      _sectionRef(clubId, userId, section)
          .collection(section.scopeCollection)
          .doc(scopeId);

  Stream<ReadStateSectionCursor> watchSection(
    String clubId,
    String userId,
    ReadStateSection section,
  ) =>
      _sectionRef(clubId, userId, section).snapshots().map(
            (snapshot) => ReadStateSectionCursor.fromFirestore(
              section,
              snapshot.data(),
            ),
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
            (snapshot) => ReadStateScopeCursor.fromFirestore(snapshot.data()));
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

  /// Creates the four root cursors for a new user if absent. Existing cursors
  /// are never overwritten, so this is safe to retry after an interrupted
  /// login/flag rollout.
  Future<void> ensureRootCursors(String clubId, String userId) async {
    for (final section in ReadStateSection.values) {
      final reference = _sectionRef(clubId, userId, section);
      final snapshot = await reference.get();
      if (!snapshot.exists) {
        await reference
            .set(ReadStateSectionCursor.acknowledgementPayload(section));
      }
    }
  }

  Future<void> markAnnouncementSeen(String clubId, String userId) =>
      _markSection(clubId, userId, ReadStateSection.announcements);

  Future<void> markSectionSeen(
    String clubId,
    String userId,
    ReadStateSection section,
  ) =>
      _markSection(clubId, userId, section);

  Future<void> markEventConversationSeen(
    String clubId,
    String userId,
    String operationId,
  ) =>
      _markScope(clubId, userId, ReadStateSection.events, operationId);

  Future<void> markTeamChannelSeen(
    String clubId,
    String userId,
    String channelId,
  ) =>
      _markScope(clubId, userId, ReadStateSection.teams, channelId);

  Future<void> markSessionChatSeen(
    String clubId,
    String userId,
    String scopeId,
  ) =>
      _markScope(clubId, userId, ReadStateSection.sessions, scopeId);

  Future<void> _markSection(
    String clubId,
    String userId,
    ReadStateSection section,
  ) async {
    final key = '$clubId/$userId/${section.id}';
    if (_isCoalesced(key)) return;
    await _sectionRef(clubId, userId, section).set(
      ReadStateSectionCursor.acknowledgementPayload(section),
    );
  }

  Future<void> _markScope(
    String clubId,
    String userId,
    ReadStateSection section,
    String scopeId,
  ) async {
    final key = '$clubId/$userId/${section.id}/$scopeId';
    if (_isCoalesced(key)) return;
    await _scopeRef(clubId, userId, section, scopeId).set(
      ReadStateScopeCursor.acknowledgementPayload(),
    );
  }

  bool _isCoalesced(String key) {
    final now = _clock();
    final last = _recentAcknowledgements[key];
    if (last != null && now.difference(last) < acknowledgementCoalesceWindow) {
      return true;
    }
    _recentAcknowledgements[key] = now;
    return false;
  }
}
