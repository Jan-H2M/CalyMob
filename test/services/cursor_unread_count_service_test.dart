import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
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
  test('does not count announcement before cursor', () async {
    await root(db, 'announcements', cursor);
    await db.doc('clubs/$club/announcements/old').set({
      'visibility': 'published',
      'last_activity_at': ts(cursor.subtract(const Duration(seconds: 1)))
    });
    expect(await service(db).countAnnouncements(club, member), 0);
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
  test('missing announcement cursor returns zero rather than an epoch flood',
      () async {
    await db
        .doc('clubs/$club/announcements/new')
        .set({'visibility': 'published', 'last_activity_at': ts(now)});
    expect(await service(db).countAnnouncements(club, member), 0);
  });
  test('counts eligible event messages within Brussels grace', () async {
    await root(db, 'events', cursor);
    await db
        .doc('clubs/$club/operations/op')
        .set({'date_fin': ts(DateTime.utc(2026, 3, 29, 10))});
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
    await db
        .doc('clubs/$club/operations/expired')
        .set({'date_fin': ts(DateTime.utc(2026, 3, 28, 10))});
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
    await db.doc('clubs/$club/operations/op').set({'date_fin': ts(now)});
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
  test('session niveau scope cursor is applied', () async {
    await root(db, 'sessions', cursor);
    await db.doc('clubs/$club/piscine_sessions/s').set({
      'statut': 'publie',
      'niveaux': {'P2': true}
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
  test('partial query failure retains the previous category value', () async {
    await root(db, 'announcements', cursor);
    await db
        .doc('clubs/$club/announcements/a')
        .set({'visibility': 'published', 'last_activity_at': ts(now)});
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
                clubId: club, userId: member, roles: const []))
            .announcements,
        1);
    fail = true;
    expect(
        (await tested.refreshAllCounts(
                clubId: club, userId: member, roles: const []))
            .announcements,
        1);
  });
}
