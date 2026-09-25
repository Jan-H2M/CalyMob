import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:timezone/data/latest.dart' as timezone_data;
import 'package:timezone/timezone.dart' as timezone;
import '../models/read_state.dart';
import '../utils/club_role_utils.dart';
import 'read_state_service.dart';

/// Cursor-derived counts used only while unread cursor v1 is in shadow/on mode.
/// The service is intentionally separate from [UnreadCountService] so OFF keeps
/// today's tracker/counter behaviour byte-for-byte independent.
class CursorUnreadCountService {
  CursorUnreadCountService({
    FirebaseFirestore? firestore,
    ReadStateService? readStateService,
    DateTime Function()? clock,
    Future<int> Function(Query<Map<String, dynamic>> query)? countQuery,
  })  : _firestore = firestore ?? FirebaseFirestore.instance,
        _readState = readStateService ?? ReadStateService(firestore: firestore),
        _clock = clock ?? DateTime.now,
        _countQuery = countQuery ?? _aggregateCount;

  final FirebaseFirestore _firestore;
  final ReadStateService _readState;
  final DateTime Function() _clock;
  final Future<int> Function(Query<Map<String, dynamic>> query) _countQuery;
  final Map<String, int> _lastKnown = <String, int>{};

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
    final values = await Future.wait<int?>([
      _capture('announcements', () => countAnnouncements(clubId, userId)),
      _capture('events', () => countEventMessages(clubId, userId)),
      _capture(
        'teams',
        () => countTeamMessages(
          clubId,
          userId,
          roles,
          includeAllChannels: includeAllTeamChannels,
          plongeurCode: plongeurCode,
          targetFormationLevel: targetFormationLevel,
          formationActive: formationActive,
        ),
      ),
      _capture('sessions', () => countSessionMessages(clubId, userId, roles)),
    ]);
    return CursorUnreadBreakdown(
      announcements: _remember('announcements', values[0]),
      events: _remember('events', values[1]),
      teams: _remember('teams', values[2]),
      sessions: _remember('sessions', values[3]),
    );
  }

  Future<int?> _capture(
      String category, Future<int> Function() operation) async {
    try {
      return await operation();
    } catch (error) {
      debugPrint('⚠️ cursor unread $category count failed: $error');
      return null;
    }
  }

  int _remember(String category, int? value) {
    if (value != null) {
      _lastKnown[category] = value;
    }
    return value ?? _lastKnown[category] ?? 0;
  }

  Future<int> countAnnouncements(String clubId, String userId) async {
    final cursor = await _readState.getEffectiveCursor(
          clubId,
          userId,
          ReadStateSection.announcements,
        ) ??
        _clock();
    final timestamp = Timestamp.fromDate(cursor);
    final collection = _firestore.collection('clubs/$clubId/announcements');

    final canonical = await _countQuery(collection
        .where('visibility', isEqualTo: 'published')
        .where('last_activity_at', isGreaterThan: timestamp)).timeout(queryTimeout);

    // Temporary compatibility for documents that predate visibility/activity
    // normalization. These are deliberately filtered client-side by id and
    // soft-delete marker; the migration removes this slower fallback.
    final legacy = await Future.wait([
      collection.where('created_at', isGreaterThan: timestamp).get(),
      collection.where('last_reply_at', isGreaterThan: timestamp).get(),
    ]).timeout(queryTimeout);
    final legacyIds = <String>{};
    for (final snapshot in legacy) {
      for (final document in snapshot.docs) {
        final data = document.data();
        final indexedActivity = data['last_activity_at'];
        final indexedDate = indexedActivity is Timestamp
            ? indexedActivity.toDate()
            : indexedActivity is DateTime
                ? indexedActivity
                : null;
        // Field-maintenance triggers are asynchronous. A published document
        // whose indexed activity is still at/before the cursor must use this
        // compatibility path; otherwise the canonical aggregate already has it.
        if (data['deleted_at'] == null && data['visibility'] != 'deleted' &&
            (data['visibility'] == null || indexedDate == null ||
                !indexedDate.isAfter(cursor))) {
          legacyIds.add(document.id);
        }
      }
    }
    return canonical + legacyIds.length;
  }

  Future<int> countEventMessages(String clubId, String userId) async {
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
    final tasks = operationIds
        .map((operationId) => () async {
              final operation = await _firestore
                  .doc('clubs/$clubId/operations/$operationId')
                  .get()
                  .timeout(queryTimeout);
              if (!operation.exists ||
                  !isUnreadEligibleEvent(
                      operation.data() ?? const {}, _clock())) {
                return 0;
              }
              final cursor = await _readState.getEffectiveCursor(
                    clubId,
                    userId,
                    ReadStateSection.events,
                    scopeId: operationId,
                  ) ??
                  _clock();
              return _countQuery(_firestore
                  .collection('clubs/$clubId/operations/$operationId/messages')
                  .where('created_at',
                      isGreaterThan: Timestamp.fromDate(cursor))).timeout(queryTimeout);
            })
        .toList();
    return _sumBounded(tasks);
  }

  Future<int> countTeamMessages(
    String clubId,
    String userId,
    List<String> roles, {
    bool includeAllChannels = false,
    String? plongeurCode,
    String? targetFormationLevel,
    bool formationActive = false,
  }) {
    final channels = ClubRoleUtils.getVisibleTeamChannelIds(
      roles,
      includeAllChannels: includeAllChannels,
      plongeurCode: plongeurCode,
      targetFormationLevel: targetFormationLevel,
      formationActive: formationActive,
    );
    return _sumBounded(channels
        .map((channelId) => () async {
              final cursor = await _readState.getEffectiveCursor(
                    clubId,
                    userId,
                    ReadStateSection.teams,
                    scopeId: channelId,
                  ) ??
                  _clock();
              return _countQuery(_firestore
                  .collection('clubs/$clubId/team_channels/$channelId/messages')
                  .where('created_at',
                      isGreaterThan: Timestamp.fromDate(cursor))).timeout(queryTimeout);
            })
        .toList());
  }

  Future<int> countSessionMessages(
    String clubId,
    String userId,
    List<String> roles,
  ) async {
    final normalized = ClubRoleUtils.normalizeRoles(roles);
    final groups = <String>[];
    if (normalized.contains('accueil')) {
      groups.add('accueil');
    }
    if (normalized.contains('encadrant')) {
      groups.addAll(['encadrants', 'niveau']);
    }
    if (groups.isEmpty) {
      return 0;
    }
    final sessions = await _firestore
        .collection('clubs/$clubId/piscine_sessions')
        .where('statut', isEqualTo: 'publie')
        .get()
        .timeout(queryTimeout);
    final tasks = <Future<int> Function()>[];
    for (final session in sessions.docs) {
      for (final group in groups) {
        if (group != 'niveau') {
          tasks
              .add(() => _countSessionScope(clubId, userId, session.id, group));
          continue;
        }
        final levels = session.data()['niveaux'];
        if (levels is Map) {
          for (final level in levels.keys) {
            tasks.add(() => _countSessionScope(
                  clubId,
                  userId,
                  session.id,
                  group,
                  level.toString(),
                ));
          }
        }
      }
    }
    return _sumBounded(tasks);
  }

  Future<int> _countSessionScope(
    String clubId,
    String userId,
    String sessionId,
    String groupType, [
    String? groupLevel,
  ]) async {
    final scopeId = readStateSessionScopeId(sessionId, groupType, groupLevel);
    final cursor = await _readState.getEffectiveCursor(
          clubId,
          userId,
          ReadStateSection.sessions,
          scopeId: scopeId,
        ) ??
        _clock();
    Query<Map<String, dynamic>> query = _firestore
        .collection('clubs/$clubId/piscine_sessions/$sessionId/messages')
        .where('group_type', isEqualTo: groupType)
        .where('created_at', isGreaterThan: Timestamp.fromDate(cursor));
    if (groupLevel != null) {
      query = query.where('group_level', isEqualTo: groupLevel);
    }
    return _countQuery(query).timeout(queryTimeout);
  }

  Future<int> _sumBounded(List<Future<int> Function()> tasks) async {
    if (tasks.isEmpty) {
      return 0;
    }
    var next = 0;
    var total = 0;
    Future<void> worker() async {
      while (next < tasks.length) {
        final index = next++;
        try {
          total += await tasks[index]();
        } catch (error) {
          debugPrint('⚠️ cursor unread subquery failed: $error');
        }
      }
    }

    await Future.wait(List<Future<void>>.generate(
      tasks.length < maxConcurrentQueries ? tasks.length : maxConcurrentQueries,
      (_) => worker(),
    ));
    return total;
  }
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
  });

  final int events;
  final int announcements;
  final int teams;
  final int sessions;

  int get communication => announcements + teams + sessions;
  int get total => events + communication;

  Map<String, int> toLegacyMap() => <String, int>{
        'announcements': announcements,
        'event_messages': events,
        'team_messages': teams,
        'session_messages': sessions,
      };
}

DateTime? _operationEnd(Map<String, dynamic> operation) {
  final raw = operation['date_fin'];
  if (raw is Timestamp) {
    return raw.toDate();
  }
  if (raw is DateTime) {
    return raw;
  }
  return null;
}

/// Applies the confirmed seven *calendar*-day grace period in Brussels, not a
/// fixed 168-hour duration. Missing legacy end dates remain eligible until data
/// normalization gives them a reliable end value.
bool isUnreadEligibleEvent(Map<String, dynamic> operation, DateTime now) {
  final end = _operationEnd(operation);
  if (end == null) {
    return true;
  }
  timezone_data.initializeTimeZones();
  final brussels = timezone.getLocation('Europe/Brussels');
  final localEnd = timezone.TZDateTime.from(end, brussels);
  final expiry = timezone.TZDateTime(
    brussels,
    localEnd.year,
    localEnd.month,
    localEnd.day + 7,
    localEnd.hour,
    localEnd.minute,
    localEnd.second,
    localEnd.millisecond,
    localEnd.microsecond,
  );
  return !timezone.TZDateTime.from(now, brussels).isAfter(expiry);
}

bool isCursorCountableRegistration(Map<String, dynamic> data) {
  final status = data['registration_status'];
  return status != 'canceled' &&
      status != 'waitlisted' &&
      status != 'withdrawn';
}
