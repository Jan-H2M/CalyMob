import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/models/read_state.dart';
import 'package:calymob/models/unread_cursor_feature_flag.dart';
import 'package:calymob/services/cursor_unread_count_service.dart';
import 'package:calymob/services/read_state_service.dart';

void main() {
  const clubId = 'demo-club';
  const userId = 'member-1';

  group('ReadStateService', () {
    late FakeFirebaseFirestore firestore;
    late DateTime now;
    late ReadStateService service;

    setUp(() {
      firestore = FakeFirebaseFirestore();
      now = DateTime.utc(2026, 9, 25, 12);
      service = ReadStateService(firestore: firestore, clock: () => now);
    });

    test('creates only the strict root cursor schema', () async {
      await service.ensureRootCursors(clubId, userId);
      final announcement = await firestore
          .doc('clubs/$clubId/members/$userId/read_state/announcements')
          .get();
      final events = await firestore
          .doc('clubs/$clubId/members/$userId/read_state/events')
          .get();

      expect(
          announcement.data()!.keys,
          containsAll(
              <String>['schema_version', 'last_seen_at', 'updated_at']));
      expect(
          events.data()!.keys,
          containsAll(<String>[
            'schema_version',
            'global_last_seen_at',
            'updated_at',
          ]));
      expect(announcement.data()!['schema_version'], 1);
    });

    test('effective cursor is max of the global and scope timestamps',
        () async {
      final global = DateTime.utc(2026, 9, 20);
      final scope = DateTime.utc(2026, 9, 21);
      await firestore
          .doc('clubs/$clubId/members/$userId/read_state/events')
          .set({
        'schema_version': 1,
        'global_last_seen_at': Timestamp.fromDate(global),
        'updated_at': Timestamp.fromDate(global),
      });
      await firestore
          .doc(
              'clubs/$clubId/members/$userId/read_state/events/conversations/op-1')
          .set({
        'last_seen_at': Timestamp.fromDate(scope),
        'updated_at': Timestamp.fromDate(scope),
      });

      final effective = await service.getEffectiveCursor(
        clubId,
        userId,
        ReadStateSection.events,
        scopeId: 'op-1',
      );
      expect(effective!.isAtSameMomentAs(scope), isTrue);
    });

    test('coalesces repeated acknowledgements for ten seconds', () async {
      await service.markTeamChannelSeen(clubId, userId, 'general');
      const path =
          'clubs/$clubId/members/$userId/read_state/teams/channels/general';
      final first = await firestore.doc(path).get();
      now = now.add(const Duration(seconds: 9));
      await service.markTeamChannelSeen(clubId, userId, 'general');
      final second = await firestore.doc(path).get();

      expect(second.data()!['updated_at'], first.data()!['updated_at']);
    });
  });

  group('cursor unread policy', () {
    test('soft-deleted legacy announcements are excluded by the fallback rule',
        () async {
      final firestore = FakeFirebaseFirestore();
      final cursor = Timestamp.fromDate(DateTime.utc(2026, 9, 1));
      final announcements = firestore.collection('clubs/$clubId/announcements');
      await announcements.doc('visible').set({
        'created_at': Timestamp.fromDate(DateTime.utc(2026, 9, 2)),
      });
      await announcements.doc('deleted').set({
        'created_at': Timestamp.fromDate(DateTime.utc(2026, 9, 2)),
        'deleted_at': Timestamp.fromDate(DateTime.utc(2026, 9, 3)),
      });
      final candidates =
          await announcements.where('created_at', isGreaterThan: cursor).get();
      final visible = candidates.docs
          .where((document) => document.data()['deleted_at'] == null)
          .length;
      expect(visible, 1);
    });

    test('event eligibility is seven Brussels calendar days across DST', () {
      final operation = <String, dynamic>{
        'date_fin': Timestamp.fromDate(DateTime.utc(2026, 3, 28, 22)),
      };
      // 23:00 Brussels on 28 March + 7 calendar days = 23:00 CEST 4 April.
      expect(
        isUnreadEligibleEvent(operation, DateTime.utc(2026, 4, 4, 20, 59)),
        isTrue,
      );
      expect(
        isUnreadEligibleEvent(operation, DateTime.utc(2026, 4, 4, 21, 1)),
        isFalse,
      );
    });

    test('canceled and waitlisted registrations are not countable', () {
      expect(isCursorCountableRegistration({'registration_status': 'canceled'}),
          isFalse);
      expect(
          isCursorCountableRegistration({'registration_status': 'waitlisted'}),
          isFalse);
      expect(
          isCursorCountableRegistration({'registration_status': 'confirmed'}),
          isTrue);
    });

    test('breakdown uses the confirmed Communication and icon formulas', () {
      const breakdown = CursorUnreadBreakdown(
        events: 2,
        announcements: 3,
        teams: 5,
        sessions: 7,
      );
      expect(breakdown.communication, 15);
      expect(breakdown.total, 17);
    });

    test('OFF is the safe default and cannot select cursor UI values', () {
      const flag = UnreadCursorFeatureFlag.defaults;
      expect(flag.enabled, isFalse);
      expect(flag.mode, UnreadCursorV1Mode.off);
    });
  });
}
