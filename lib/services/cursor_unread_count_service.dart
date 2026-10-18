import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import '../models/read_state.dart';
import '../utils/club_role_utils.dart';
import '../utils/event_unread_policy.dart';
import 'read_state_service.dart';
import 'unread_timestamp_authority_service.dart';

export '../utils/event_unread_policy.dart'
    show eventUnreadUntil, isUnreadEligibleEvent;

/// Cursor-derived counts used only while unread cursor v1 is in shadow/on mode.
/// The service is intentionally separate from [UnreadCountService] so OFF keeps
/// today's tracker/counter behaviour byte-for-byte independent.
class CursorUnreadCountService {
  CursorUnreadCountService({
    FirebaseFirestore? firestore,
    ReadStateService? readStateService,
    DateTime Function()? clock,
    Future<int> Function(Query<Map<String, dynamic>> query)? countQuery,
    Future<bool> Function(String clubId, String userId)? timestampV2Resolver,
  })  : _firestore = firestore ?? FirebaseFirestore.instance,
        _readState = readStateService ?? ReadStateService(firestore: firestore),
        _clock = clock ?? DateTime.now,
        _countQuery = countQuery ?? _aggregateCount,
        _timestampV2Resolver = timestampV2Resolver ??
            UnreadTimestampAuthorityService(firestore: firestore).shouldUseV2;

  final FirebaseFirestore _firestore;
  final ReadStateService _readState;
  final DateTime Function() _clock;
  final Future<int> Function(Query<Map<String, dynamic>> query) _countQuery;
  final Future<bool> Function(String clubId, String userId)
      _timestampV2Resolver;

  static const Duration queryTimeout = Duration(seconds: 8);
  static const int maxConcurrentQueries = 8;

  /// `total` intentionally equals the app-icon formula, while `communication`
  /// is the Communication landing-tile formula.
  Future<CursorUnreadBreakdown> refreshAllCounts({
    required String clubId,
    required String userId,
    required List<String> roles,
    bool includeAllTeamChannels = false,
    String? plongeurCode,
    String? targetFormationLevel,
    bool formationActive = false,
  }) async {
    // This refresh is deliberately all-or-nothing. A partial canonical result
    // is not a valid badge and must never replace a complete legacy/previous
    // value in the UI.
    final timestampV2 = await _timestampV2Resolver(clubId, userId);
    final announcementsFuture = countAnnouncements(
      clubId,
      userId,
      timestampV2: timestampV2,
    );
    final eventScopesFuture = countEventMessageScopes(
      clubId,
      userId,
      timestampV2: timestampV2,
    );
    final teamScopesFuture = countTeamMessageScopes(
      clubId,
      userId,
      roles,
      includeAllChannels: includeAllTeamChannels,
      plongeurCode: plongeurCode,
      targetFormationLevel: targetFormationLevel,
      formationActive: formationActive,
      timestampV2: timestampV2,
    );
    final sessionScopesFuture = countSessionMessageScopes(
      clubId,
      userId,
      roles,
      timestampV2: timestampV2,
    );
    final reportResolutionsFuture = countReportResolutionNotifications(
      clubId,
      userId,
    );
    // Await concurrently. Besides being faster, Future.wait observes every
    // branch immediately: awaiting these one-by-one leaves a later failed
    // branch temporarily unobserved and can surface as an uncaught async
    // error instead of making this all-or-nothing refresh fail normally.
    final results = await Future.wait<dynamic>([
      announcementsFuture,
      eventScopesFuture,
      teamScopesFuture,
      sessionScopesFuture,
      reportResolutionsFuture,
    ]);
    final announcements = results[0] as int;
    final eventScopes = results[1] as Map<String, int>;
    final teamScopes = results[2] as Map<String, int>;
    final sessionScopes = results[3] as Map<String, int>;
    final reportResolutions = results[4] as int;
    return CursorUnreadBreakdown(
      announcements: announcements,
      events: _sum(eventScopes),
      teams: _sum(teamScopes),
      sessions: _sum(sessionScopes),
      reportResolutions: reportResolutions,
      eventScopes: eventScopes,
      teamScopes: teamScopes,
      sessionScopes: sessionScopes,
    );
  }

  /// Resolution-feedback cards have per-card `read` state, not a section
  /// cursor. They still belong in the canonical Communication/app-icon total.
  Future<int> countReportResolutionNotifications(
    String clubId,
    String userId,
  ) =>
      _countQuery(
        _firestore
            .collection('clubs/$clubId/members/$userId/notifications')
            .where('type', isEqualTo: 'bug_report_resolution')
            .where('counts_toward_unread_badge', isEqualTo: true)
            .where('read', isEqualTo: false),
      );

  Future<Timestamp> _requiredCursor(
    String clubId,
    String userId,
    ReadStateSection section, {
    String? scopeId,
  }) async {
    final cursor = await _readState.getEffectiveCursor(
      clubId,
      userId,
      section,
      scopeId: scopeId,
    );
    if (cursor == null) {
      throw StateError(
        'Missing ${section.id} read cursor after confirmed bootstrap.',
      );
    }
    return cursor;
  }

  Future<int> countAnnouncements(
    String clubId,
    String userId, {
    bool? timestampV2,
  }) async {
    final useTimestampV2 =
        timestampV2 ?? await _timestampV2Resolver(clubId, userId);
    final collection = _firestore.collection('clubs/$clubId/announcements');
    final snapshot = await collection.get().timeout(queryTimeout);
    return _sumBounded(
      snapshot.docs
          .where((document) {
            final data = document.data();
            return data['deleted_at'] == null &&
                data['visibility'] != 'deleted';
          })
          .map(
            (document) => () => countAnnouncementThread(
                  clubId,
                  userId,
                  document.id,
                  document.data(),
                  timestampV2: useTimestampV2,
                ),
          )
          .toList(),
    );
  }

  Future<int> countAnnouncementThread(
    String clubId,
    String userId,
    String announcementId,
    Map<String, dynamic> announcement, {
    bool? timestampV2,
  }) async {
    if (announcement['deleted_at'] != null ||
        announcement['visibility'] == 'deleted') {
      return 0;
    }
    final useTimestampV2 =
        timestampV2 ?? await _timestampV2Resolver(clubId, userId);
    final activity = _timestampValue(
      useTimestampV2
          ? announcement['unread_activity_at']
          : announcement['last_activity_at'] ??
              announcement['last_reply_at'] ??
              announcement['created_at'],
    );
    if (activity == null) {
      throw StateError('Announcement $announcementId has no valid activity.');
    }
    final cursor = await _requiredCursor(
      clubId,
      userId,
      ReadStateSection.announcements,
      scopeId: announcementId,
    );
    return compareFirestoreTimestamps(activity, cursor) > 0 ? 1 : 0;
  }

  Future<int> countEventMessages(
    String clubId,
    String userId, {
    bool? timestampV2,
  }) async {
    final scopes = await countEventMessageScopes(
      clubId,
      userId,
      timestampV2: timestampV2,
    );
    return scopes.values.fold<int>(0, (total, value) => total + value);
  }

  Future<Map<String, int>> countEventMessageScopes(
    String clubId,
    String userId, {
    bool? timestampV2,
  }) async {
    final useTimestampV2 =
        timestampV2 ?? await _timestampV2Resolver(clubId, userId);
    final inscriptions = await _firestore
        .collectionGroup('inscriptions')
        .where('membre_id', isEqualTo: userId)
        .get()
        .timeout(queryTimeout);
    final operationIds = <String>{};
    for (final inscription in inscriptions.docs) {
      if (!isCursorCountableRegistration(inscription.data())) continue;
      final path = inscription.reference.parent.parent?.path.split('/');
      if (path != null &&
          path.length >= 4 &&
          path[0] == 'clubs' &&
          path[1] == clubId &&
          path[2] == 'operations') {
        operationIds.add(path[3]);
      }
    }
    final ids = operationIds.toList(growable: false);
    final values = await _runBounded(
      ids
          .map(
            (operationId) => () async {
              final operation = await _firestore
                  .doc('clubs/$clubId/operations/$operationId')
                  .get()
                  .timeout(queryTimeout);
              if (!operation.exists ||
                  !isUnreadEligibleEvent(
                    operation.data() ?? const {},
                    _clock(),
                  )) {
                return 0;
              }
              return countEventConversation(
                clubId,
                userId,
                operationId,
                timestampV2: useTimestampV2,
              );
            },
          )
          .toList(),
    );
    return <String, int>{
      for (var index = 0; index < ids.length; index++)
        ids[index]: values[index],
    };
  }

  Future<int> countEventConversation(
    String clubId,
    String userId,
    String operationId, {
    bool? timestampV2,
  }) async {
    final useTimestampV2 =
        timestampV2 ?? await _timestampV2Resolver(clubId, userId);
    final cursor = await _requiredCursor(
      clubId,
      userId,
      ReadStateSection.events,
      scopeId: operationId,
    );
    return _countQuery(
      _firestore
          .collection('clubs/$clubId/operations/$operationId/messages')
          .where(
            useTimestampV2 ? 'unread_created_at' : 'created_at',
            isGreaterThan: cursor,
          ),
    ).timeout(queryTimeout);
  }

  Future<int> countEligibleEventConversation(
    String clubId,
    String userId,
    String operationId, {
    bool? timestampV2,
  }) async {
    final operation = await _firestore
        .doc('clubs/$clubId/operations/$operationId')
        .get()
        .timeout(queryTimeout);
    if (!operation.exists ||
        !isUnreadEligibleEvent(operation.data() ?? const {}, _clock())) {
      return 0;
    }
    final registrations = await _firestore
        .collection('clubs/$clubId/operations/$operationId/inscriptions')
        .where('membre_id', isEqualTo: userId)
        .get()
        .timeout(queryTimeout);
    if (!registrations.docs.any(
      (registration) => isCursorCountableRegistration(registration.data()),
    )) {
      return 0;
    }
    return countEventConversation(
      clubId,
      userId,
      operationId,
      timestampV2: timestampV2,
    );
  }

  Future<int> countTeamMessages(
    String clubId,
    String userId,
    List<String> roles, {
    bool includeAllChannels = false,
    String? plongeurCode,
    String? targetFormationLevel,
    bool formationActive = false,
    bool? timestampV2,
  }) async {
    final scopes = await countTeamMessageScopes(
      clubId,
      userId,
      roles,
      includeAllChannels: includeAllChannels,
      plongeurCode: plongeurCode,
      targetFormationLevel: targetFormationLevel,
      formationActive: formationActive,
      timestampV2: timestampV2,
    );
    return scopes.values.fold<int>(0, (total, value) => total + value);
  }

  Future<Map<String, int>> countTeamMessageScopes(
    String clubId,
    String userId,
    List<String> roles, {
    bool includeAllChannels = false,
    String? plongeurCode,
    String? targetFormationLevel,
    bool formationActive = false,
    bool? timestampV2,
  }) async {
    final channels = ClubRoleUtils.getVisibleTeamChannelIds(
      roles,
      includeAllChannels: includeAllChannels,
      plongeurCode: plongeurCode,
      targetFormationLevel: targetFormationLevel,
      formationActive: formationActive,
    );
    final useTimestampV2 =
        timestampV2 ?? await _timestampV2Resolver(clubId, userId);
    final values = await _runBounded(
      channels
          .map(
            (channelId) => () => countTeamChannel(
                  clubId,
                  userId,
                  channelId,
                  timestampV2: useTimestampV2,
                ),
          )
          .toList(),
    );
    return <String, int>{
      for (var index = 0; index < channels.length; index++)
        channels[index]: values[index],
    };
  }

  Future<int> countTeamChannel(
    String clubId,
    String userId,
    String channelId, {
    bool? timestampV2,
  }) async {
    final useTimestampV2 =
        timestampV2 ?? await _timestampV2Resolver(clubId, userId);
    final cursor = await _requiredCursor(
      clubId,
      userId,
      ReadStateSection.teams,
      scopeId: channelId,
    );
    return _countQuery(
      _firestore
          .collection('clubs/$clubId/team_channels/$channelId/messages')
          .where(
            useTimestampV2 ? 'unread_created_at' : 'created_at',
            isGreaterThan: cursor,
          ),
    ).timeout(queryTimeout);
  }

  Future<int> countSessionMessages(
    String clubId,
    String userId,
    List<String> roles, {
    bool? timestampV2,
  }) async {
    final scopes = await countSessionMessageScopes(
      clubId,
      userId,
      roles,
      timestampV2: timestampV2,
    );
    return scopes.values.fold<int>(0, (total, value) => total + value);
  }

  Future<Map<String, int>> countSessionMessageScopes(
    String clubId,
    String userId,
    List<String> roles, {
    bool? timestampV2,
  }) async {
    final useTimestampV2 =
        timestampV2 ?? await _timestampV2Resolver(clubId, userId);
    final sessions = await _firestore
        .collection('clubs/$clubId/piscine_sessions')
        .where('statut', isEqualTo: 'publie')
        .get()
        .timeout(queryTimeout);
    final scopeIds = <String>[];
    final tasks = <Future<int> Function()>[];
    for (final session in sessions.docs) {
      for (final scope in sessionUnreadScopesForMember(
        session.data(),
        userId,
      )) {
        scopeIds.add(
          readStateSessionScopeId(
            session.id,
            scope.groupType,
            scope.groupLevel,
          ),
        );
        tasks.add(
          () => _countSessionScope(
            clubId,
            userId,
            session.id,
            scope.groupType,
            groupLevel: scope.groupLevel,
            timestampV2: useTimestampV2,
          ),
        );
      }
    }
    final values = await _runBounded(tasks);
    return <String, int>{
      for (var index = 0; index < scopeIds.length; index++)
        scopeIds[index]: values[index],
    };
  }

  Future<int> _countSessionScope(
    String clubId,
    String userId,
    String sessionId,
    String groupType, {
    String? groupLevel,
    required bool timestampV2,
  }) async {
    final scopeId = readStateSessionScopeId(sessionId, groupType, groupLevel);
    final cursor = await _requiredCursor(
      clubId,
      userId,
      ReadStateSection.sessions,
      scopeId: scopeId,
    );
    Query<Map<String, dynamic>> query = _firestore
        .collection('clubs/$clubId/piscine_sessions/$sessionId/messages')
        .where('group_type', isEqualTo: groupType)
        .where(
          timestampV2 ? 'unread_created_at' : 'created_at',
          isGreaterThan: cursor,
        );
    if (groupLevel != null) {
      query = query.where('group_level', isEqualTo: groupLevel);
    }
    return _countQuery(query).timeout(queryTimeout);
  }

  /// Row-level canonical count for one concrete session conversation.
  Future<int> countSessionChat(
    String clubId,
    String userId,
    String sessionId,
    String groupType, {
    String? groupLevel,
    bool? timestampV2,
  }) async {
    final useTimestampV2 =
        timestampV2 ?? await _timestampV2Resolver(clubId, userId);
    return _countSessionScope(
      clubId,
      userId,
      sessionId,
      groupType,
      groupLevel: groupLevel,
      timestampV2: useTimestampV2,
    );
  }

  Future<int> _sumBounded(List<Future<int> Function()> tasks) async {
    final results = await _runBounded(tasks);
    return results.fold<int>(0, (total, value) => total + value);
  }

  Future<List<int>> _runBounded(List<Future<int> Function()> tasks) async {
    if (tasks.isEmpty) {
      return const <int>[];
    }
    var next = 0;
    final results = List<int>.filled(tasks.length, 0);
    Object? firstError;
    StackTrace? firstStackTrace;
    Future<void> worker() async {
      while (next < tasks.length) {
        final index = next++;
        try {
          results[index] = await tasks[index]();
        } catch (error, stackTrace) {
          firstError ??= error;
          firstStackTrace ??= stackTrace;
          debugPrint('⚠️ cursor unread subquery failed: $error');
        }
      }
    }

    await Future.wait(
      List<Future<void>>.generate(
        tasks.length < maxConcurrentQueries
            ? tasks.length
            : maxConcurrentQueries,
        (_) => worker(),
      ),
    );
    if (firstError != null) {
      Error.throwWithStackTrace(firstError!, firstStackTrace!);
    }
    return results;
  }
}

Timestamp? _timestampValue(Object? value) {
  if (value is Timestamp) return value;
  if (value is DateTime) return Timestamp.fromDate(value);
  return null;
}

@immutable
class SessionUnreadScope {
  const SessionUnreadScope(this.groupType, [this.groupLevel]);

  final String groupType;
  final String? groupLevel;
}

List<SessionUnreadScope> sessionUnreadScopesForMember(
  Map<String, dynamic> session,
  String userId,
) {
  bool assigned(Object? raw) {
    if (raw is! List) return false;
    return raw.whereType<Map>().any(
          (member) => member['membre_id']?.toString() == userId,
        );
  }

  final scopes = <SessionUnreadScope>[];
  if (assigned(session['accueil'])) {
    scopes.add(const SessionUnreadScope('accueil'));
  }
  var anyEncadrant = assigned(session['baptemes']);
  final levels = session['niveaux'];
  if (levels is Map) {
    for (final entry in levels.entries) {
      final level = entry.value;
      if (level is! Map) continue;
      var assignedToLevel = assigned(level['encadrants']);
      final courses = level['courses_by_hour'] ?? level['coursesByHour'];
      if (courses is Map) {
        for (final rawCourses in courses.values) {
          if (rawCourses is! List) continue;
          for (final course in rawCourses.whereType<Map>()) {
            assignedToLevel = assignedToLevel || assigned(course['encadrants']);
          }
        }
      }
      if (assignedToLevel) {
        anyEncadrant = true;
        scopes.add(SessionUnreadScope('niveau', entry.key.toString()));
      }
    }
  }
  if (anyEncadrant) {
    scopes.insert(
      assigned(session['accueil']) ? 1 : 0,
      const SessionUnreadScope('encadrants'),
    );
  }
  return scopes;
}

Future<int> _aggregateCount(Query<Map<String, dynamic>> query) async {
  final aggregate = await query.count().get();
  return aggregate.count ?? 0;
}

class CursorUnreadBreakdown {
  const CursorUnreadBreakdown({
    required this.events,
    required this.announcements,
    required this.teams,
    required this.sessions,
    this.reportResolutions = 0,
    this.eventScopes = const <String, int>{},
    this.teamScopes = const <String, int>{},
    this.sessionScopes = const <String, int>{},
  });

  final int events;
  final int announcements;
  final int teams;
  final int sessions;
  final int reportResolutions;
  final Map<String, int> eventScopes;
  final Map<String, int> teamScopes;
  final Map<String, int> sessionScopes;

  int get communication => announcements + teams + sessions + reportResolutions;
  int get total => events + communication;

  Map<String, int> toLegacyMap() => <String, int>{
        'announcements': announcements,
        'event_messages': events,
        'team_messages': teams,
        'session_messages': sessions,
      };
}

int _sum(Map<String, int> values) =>
    values.values.fold<int>(0, (total, value) => total + value);

bool isCursorCountableRegistration(Map<String, dynamic> data) {
  final status = data['registration_status']?.toString().trim().toLowerCase();
  return status != 'canceled' &&
      status != 'waitlisted' &&
      status != 'withdrawn';
}
