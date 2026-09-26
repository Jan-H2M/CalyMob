import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/models/read_state.dart';
import 'package:calymob/services/cursor_unread_count_service.dart';
import 'package:calymob/services/read_state_service.dart';

const club = 'c1';
const member = 'm1';
final cursor = DateTime.utc(2026, 3, 1);
final now = DateTime.utc(2026, 4, 5, 10);

Timestamp ts(DateTime value) => Timestamp.fromDate(value);

CursorUnreadCountService service(FakeFirebaseFirestore db) =>
    CursorUnreadCountService(
      firestore: db,
      readStateService: ReadStateService(firestore: db),
      clock: () => now,
      countQuery: (query) async => (await query.get()).size,
    );

class _BarrierReadStateService extends ReadStateService {
  _BarrierReadStateService({required super.firestore, required this.cursor});

  final Timestamp cursor;
  final Completer<void> bothWaiting = Completer<void>();
  final Completer<void> release = Completer<void>();
  int scopeCalls = 0;

  @override
  Future<Timestamp?> getEffectiveCursor(
    String clubId,
    String userId,
    ReadStateSection section, {
    String? scopeId,
  }) async {
    if (scopeId != null) {
      scopeCalls++;
      if (scopeCalls == 2) bothWaiting.complete();
      await release.future;
    }
    return cursor;
  }
}

Future<void> root(FakeFirebaseFirestore db, String section, DateTime value) =>
    db.doc('clubs/$club/members/$member/read_state/$section').set(
        section == 'announcements'
            ? {
                'schema_version': 1,
                'last_seen_at': ts(value),
                'updated_at': ts(value)
              }
            : {
                'schema_version': 1,
                'global_last_seen_at': ts(value),
                'updated_at': ts(value)
              });

Future<void> message(FakeFirebaseFirestore db, String path, DateTime at,
        [Map<String, dynamic> extra = const {}]) =>
    db
        .doc('$path/m-${at.microsecondsSinceEpoch}')
        .set({'created_at': ts(at), ...extra});

void main() {
  late FakeFirebaseFirestore db;
  setUp(() => db = FakeFirebaseFirestore());

  test('counts published announcement after cursor', () async {
    await root(db, 'announcements', cursor);
    await db.doc('clubs/$club/announcements/new').set({
      'visibility': 'published',
      'last_activity_at': ts(cursor.add(const Duration(minutes: 1)))
    });
    expect(await service(db).countAnnouncements(club, member), 1);
  });
  test('parallel subqueries cannot overwrite each other\'s subtotal', () async {
    for (final id in ['one', 'two']) {
      await db.doc('clubs/$club/announcements/$id').set({
        'visibility': 'published',
        'last_activity_at': ts(cursor.add(const Duration(minutes: 1))),
      });
    }
    final readState = _BarrierReadStateService(
      firestore: db,
      cursor: ts(cursor),
    );
    final tested = CursorUnreadCountService(
      firestore: db,
      readStateService: readState,
      clock: () => now,
      countQuery: (query) async => (await query.get()).size,
      timestampV2Resolver: (_, __) async => false,
    );
    final result = tested.countAnnouncements(club, member);
    await readState.bothWaiting.future;
    readState.release.complete();
    expect(await result, 2);
  });
  test('does not count announcement before cursor', () async {
    await root(db, 'announcements', cursor);
    await db.doc('clubs/$club/announcements/old').set({
      'visibility': 'published',
      'last_activity_at': ts(cursor.subtract(const Duration(seconds: 1)))
    });
    expect(await service(db).countAnnouncements(club, member), 0);
  });
  test('announcement authority preserves sub-microsecond ordering', () async {
    final seen = Timestamp(10, 123456700);
    final oneNanosecondLater = Timestamp(10, 123456701);
    await db.doc('clubs/$club/members/$member/read_state/announcements').set({
      'schema_version': 1,
      'last_seen_at': seen,
      'updated_at': seen,
    });
    await db.doc('clubs/$club/announcements/new').set({
      'visibility': 'published',
      'unread_activity_at': oneNanosecondLater,
    });

    expect(
      await service(db).countAnnouncements(
        club,
        member,
        timestampV2: true,
      ),
      1,
    );
    await db.doc('clubs/$club/announcements/new').update({
      'unread_activity_at': seen,
    });
    expect(
      await service(db).countAnnouncements(
        club,
        member,
        timestampV2: true,
      ),
      0,
    );
  });
  test('excludes soft-deleted announcement after cursor', () async {
    await root(db, 'announcements', cursor);
    await db.doc('clubs/$club/announcements/deleted').set({
      'visibility': 'deleted',
      'deleted_at': ts(now),
      'last_activity_at': ts(now)
    });
    expect(await service(db).countAnnouncements(club, member), 0);
  });
  test('counts legacy visible announcement but not legacy soft delete',
      () async {
    await root(db, 'announcements', cursor);
    await db
        .doc('clubs/$club/announcements/legacy')
        .set({'created_at': ts(now)});
    await db
        .doc('clubs/$club/announcements/legacy-deleted')
        .set({'created_at': ts(now), 'deleted_at': ts(now)});
    expect(await service(db).countAnnouncements(club, member), 1);
  });
  test('missing announcement cursor fails instead of publishing a false zero',
      () async {
    await db
        .doc('clubs/$club/announcements/new')
        .set({'visibility': 'published', 'last_activity_at': ts(now)});
    await expectLater(service(db).countAnnouncements(club, member),
        throwsA(isA<StateError>()));
  });
  test('counts eligible event messages within Brussels grace', () async {
    await root(db, 'events', cursor);
    await db.doc('clubs/$club/operations/op').set({
      'type': 'evenement',
      'statut': 'ouvert',
      'date_fin': ts(DateTime.utc(2026, 3, 29, 10)),
    });
    await db
        .doc('clubs/$club/operations/op/inscriptions/i')
        .set({'membre_id': member, 'registration_status': 'confirmed'});
    await message(db, 'clubs/$club/operations/op/messages',
        cursor.add(const Duration(minutes: 1)));
    await message(db, 'clubs/$club/operations/op/messages',
        cursor.add(const Duration(minutes: 2)));
    expect(await service(db).countEventMessages(club, member), 2);
  });
  test('excludes expired and canceled/waitlisted event inscriptions', () async {
    await root(db, 'events', cursor);
    await db.doc('clubs/$club/operations/expired').set({
      'type': 'evenement',
      'statut': 'ferme',
      'date_fin': ts(DateTime.utc(2026, 3, 28, 10)),
    });
    for (final status in ['confirmed', 'canceled', 'waitlisted']) {
      await db
          .doc('clubs/$club/operations/expired/inscriptions/$status')
          .set({'membre_id': member, 'registration_status': status});
      await message(db, 'clubs/$club/operations/expired/messages', now);
    }
    expect(await service(db).countEventMessages(club, member), 0);
  });
  test('uses the newer event scope cursor over global cursor', () async {
    await root(db, 'events', cursor);
    await db
        .doc('clubs/$club/members/$member/read_state/events/conversations/op')
        .set({
      'last_seen_at': ts(cursor.add(const Duration(days: 2))),
      'updated_at': ts(cursor)
    });
    await db.doc('clubs/$club/operations/op').set({
      'type': 'evenement',
      'statut': 'ferme',
      'date_fin': ts(now),
    });
    await db
        .doc('clubs/$club/operations/op/inscriptions/i')
        .set({'membre_id': member, 'registration_status': 'confirmed'});
    await message(db, 'clubs/$club/operations/op/messages',
        cursor.add(const Duration(days: 1)));
    await message(db, 'clubs/$club/operations/op/messages',
        cursor.add(const Duration(days: 3)));
    expect(await service(db).countEventMessages(club, member), 1);
  });
  test('counts only role-visible team channels', () async {
    await root(db, 'teams', cursor);
    await message(db, 'clubs/$club/team_channels/general/messages', now);
    await message(db, 'clubs/$club/team_channels/ca/messages', now);
    expect(await service(db).countTeamMessages(club, member, const []), 1);
  });
  test('counts published accueil session but excludes unpublished', () async {
    await root(db, 'sessions', cursor);
    await db.doc('clubs/$club/piscine_sessions/published').set({
      'statut': 'publie',
      'accueil': [
        {'membre_id': member}
      ],
      'niveaux': {'P2': true}
    });
    await db.doc('clubs/$club/piscine_sessions/draft').set({
      'statut': 'brouillon',
      'niveaux': {'P2': true}
    });
    await message(db, 'clubs/$club/piscine_sessions/published/messages', now,
        {'group_type': 'accueil'});
    await message(db, 'clubs/$club/piscine_sessions/draft/messages', now,
        {'group_type': 'accueil'});
    expect(
        await service(db).countSessionMessages(club, member, const ['accueil']),
        1);
  });
  test('message queries exclude exact nanos and include one nanosecond later',
      () async {
    final seen = Timestamp(10, 123456700);
    final later = Timestamp(10, 123456701);
    await db.doc('clubs/$club/members/$member/read_state/events').set({
      'schema_version': 1,
      'global_last_seen_at': seen,
      'updated_at': seen,
    });
    await db.doc('clubs/$club/operations/op/messages/exact').set({
      'unread_created_at': seen,
    });
    await db.doc('clubs/$club/operations/op/messages/later').set({
      'unread_created_at': later,
    });

    expect(
      await service(db).countEventConversation(
        club,
        member,
        'op',
        timestampV2: true,
      ),
      1,
    );
  });
  test('session niveau scope cursor is applied', () async {
    await root(db, 'sessions', cursor);
    await db.doc('clubs/$club/piscine_sessions/s').set({
      'statut': 'publie',
      'niveaux': {
        'P2': {
          'encadrants': [
            {'membre_id': member}
          ]
        }
      }
    });
    await db
        .doc(
            'clubs/$club/members/$member/read_state/sessions/chats/s__niveau__P2')
        .set({
      'last_seen_at': ts(cursor.add(const Duration(days: 2))),
      'updated_at': ts(cursor)
    });
    await message(
        db,
        'clubs/$club/piscine_sessions/s/messages',
        cursor.add(const Duration(days: 1)),
        {'group_type': 'niveau', 'group_level': 'P2'});
    await message(
        db,
        'clubs/$club/piscine_sessions/s/messages',
        cursor.add(const Duration(days: 3)),
        {'group_type': 'niveau', 'group_level': 'P2'});
    expect(
        await service(db)
            .countSessionMessages(club, member, const ['encadrant']),
        1);
  });
  test('legacy camelCase course-only assignment gets matching session counts',
      () async {
    await root(db, 'sessions', cursor);
    await db.doc('clubs/$club/piscine_sessions/s').set({
      'statut': 'publie',
      'niveaux': {
        'P2': {
          'coursesByHour': {
            'h20': [
              {
                'encadrants': [
                  {'membre_id': member}
                ]
              }
            ]
          }
        }
      }
    });
    await message(db, 'clubs/$club/piscine_sessions/s/messages', now,
        {'group_type': 'encadrants'});
    await message(db, 'clubs/$club/piscine_sessions/s/messages',
        now.add(const Duration(seconds: 1)), {
      'group_type': 'niveau',
      'group_level': 'P2',
    });

    expect(
      await service(db).countSessionMessages(
        club,
        member,
        const ['encadrant'],
      ),
      2,
    );
  });
  test('refreshAllCounts computes communication and total from seeded docs',
      () async {
    for (final section in ['announcements', 'events', 'teams', 'sessions']) {
      await root(db, section, cursor);
    }
    await db
        .doc('clubs/$club/announcements/a')
        .set({'visibility': 'published', 'last_activity_at': ts(now)});
    await message(db, 'clubs/$club/team_channels/general/messages', now);
    final result = await service(db)
        .refreshAllCounts(clubId: club, userId: member, roles: const []);
    expect(result.communication,
        result.announcements + result.teams + result.sessions);
    expect(result.total, result.events + result.communication);
    expect(result.announcements, 1);
    expect(result.teams, 1);
  });
  test(
    'partial category failure rejects the whole canonical refresh',
    () async {
      for (final section in ['announcements', 'events', 'teams', 'sessions']) {
        await root(db, section, cursor);
      }
      await db.doc('clubs/$club/announcements/a').set({
        'visibility': 'published',
        'last_activity_at': ts(now),
      });
      var fail = false;
      final tested = CursorUnreadCountService(
        firestore: db,
        readStateService: ReadStateService(firestore: db),
        clock: () => now,
        countQuery: (query) async {
          if (fail) throw StateError('simulated aggregation failure');
          return (await query.get()).size;
        },
      );
      expect(
        (await tested.refreshAllCounts(
          clubId: club,
          userId: member,
          roles: const [],
        ))
            .announcements,
        1,
      );
      fail = true;
      await expectLater(
        tested.refreshAllCounts(clubId: club, userId: member, roles: const []),
        throwsA(isA<StateError>()),
      );
    },
  );

  test(
    'one bounded team subquery failure is never returned as a partial sum',
    () async {
      await root(db, 'teams', cursor);
      var queryNumber = 0;
      final tested = CursorUnreadCountService(
        firestore: db,
        readStateService: ReadStateService(firestore: db),
        clock: () => now,
        countQuery: (query) async {
          queryNumber++;
          if (queryNumber == 2) throw StateError('one channel failed');
          return 7;
        },
      );
      await expectLater(
        tested.countTeamMessages(
          club,
          member,
          const [],
          includeAllChannels: true,
        ),
        throwsA(isA<StateError>()),
      );
    },
  );
}
