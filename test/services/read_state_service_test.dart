import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/models/read_state.dart';
import 'package:calymob/models/unread_cursor_feature_flag.dart';
import 'package:calymob/services/cursor_unread_count_service.dart';
import 'package:calymob/services/read_state_service.dart';
import 'package:calymob/services/local_read_tracker.dart';

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
      expect(effective, Timestamp.fromDate(scope));
    });

    test('coalesces a burst into one trailing acknowledgement', () async {
      var writes = 0;
      final delay = Completer<void>();
      service = ReadStateService(
        firestore: firestore,
        clock: () => now,
        acknowledgementWrite: (reference, payload) async {
          writes += 1;
          await reference.set(payload);
        },
        acknowledgementDelay: (duration) {
          expect(duration, const Duration(seconds: 1));
          return delay.future;
        },
      );
      await service.markSectionSeen(clubId, userId, ReadStateSection.teams);
      expect(writes, 1);
      now = now.add(const Duration(seconds: 9));
      final second =
          service.markSectionSeen(clubId, userId, ReadStateSection.teams);
      final concurrent =
          service.markSectionSeen(clubId, userId, ReadStateSection.teams);
      expect(writes, 1);
      delay.complete();
      await Future.wait([second, concurrent]);

      expect(writes, 2);
    });

    test('failed acknowledgements are retryable and concurrent writes coalesce',
        () async {
      var attempts = 0;
      final firstWrite = Completer<void>();
      final retryService = ReadStateService(
        firestore: firestore,
        clock: () => now,
        acknowledgementWrite: (reference, payload) async {
          attempts += 1;
          if (attempts == 1) await firstWrite.future;
          await reference.set(payload);
        },
      );

      final first = retryService.markSectionSeen(
        clubId,
        userId,
        ReadStateSection.teams,
      );
      final concurrent = retryService.markSectionSeen(
        clubId,
        userId,
        ReadStateSection.teams,
      );
      await Future<void>.delayed(Duration.zero);
      expect(attempts, 1);
      final firstFailure = expectLater(first, throwsStateError);
      final concurrentFailure = expectLater(concurrent, throwsStateError);
      firstWrite.completeError(StateError('temporary write failure'));
      await firstFailure;
      await concurrentFailure;

      await retryService.markSectionSeen(
        clubId,
        userId,
        ReadStateSection.teams,
      );
      expect(attempts, 2);
    });

    test('content arriving during a write gets one trailing acknowledgement',
        () async {
      var writes = 0;
      final firstWrite = Completer<void>();
      final trailingDelay = Completer<void>();
      final trailingService = ReadStateService(
        firestore: firestore,
        clock: () => now,
        acknowledgementWrite: (reference, payload) async {
          writes += 1;
          if (writes == 1) await firstWrite.future;
          await reference.set(payload);
        },
        acknowledgementDelay: (duration) {
          expect(
            duration,
            ReadStateService.acknowledgementCoalesceWindow,
          );
          return trailingDelay.future;
        },
      );

      final first = trailingService.markSectionSeen(
        clubId,
        userId,
        ReadStateSection.teams,
      );
      await Future<void>.delayed(Duration.zero);
      final arrivedDuringWrite = trailingService.markSectionSeen(
        clubId,
        userId,
        ReadStateSection.teams,
      );
      firstWrite.complete();
      await Future<void>.delayed(Duration.zero);
      expect(writes, 1);

      trailingDelay.complete();
      await Future.wait([first, arrivedDuringWrite]);
      expect(writes, 2);
    });

    test(
      'bootstrap sends the complete legacy mapping and requires confirmation',
      () async {
        Map<String, Object>? payload;
        final bootstrapService = ReadStateService(
          firestore: firestore,
          bootstrapCall: (value) async {
            payload = value;
            return {'status': 'bootstrapped', 'schemaVersion': 1};
          },
        );
        final fallback = DateTime.utc(2024, 1, 1);
        await bootstrapService.bootstrapFromLegacy(
          clubId,
          userId,
          LegacyReadStateSnapshot(
            fallbackLastSeenAt: fallback,
            announcementsLastSeenAt: DateTime.utc(2026, 9, 20),
            eventsLastSeenAt: fallback,
            teamsLastSeenAt: fallback,
            sessionsLastSeenAt: fallback,
            eventConversations: {'event': DateTime.utc(2026, 9, 21)},
            teamChannels: {'general': DateTime.utc(2026, 9, 22)},
            sessionChats: {'session__accueil': DateTime.utc(2026, 9, 23)},
          ),
        );
        expect(payload?['clubId'], clubId);
        expect(payload?['memberId'], userId);
        expect(payload?['schemaVersion'], 1);
        expect(
          payload?['fallbackLastSeenAtMs'],
          fallback.millisecondsSinceEpoch,
        );
        expect(payload?['eventConversations'], isA<Map<String, int>>());

        final mergeService = ReadStateService(
          firestore: firestore,
          bootstrapCall: (_) async => {'status': 'merged', 'schemaVersion': 1},
        );
        await expectLater(
          mergeService.bootstrapFromLegacy(
            clubId,
            userId,
            LegacyReadStateSnapshot(
              fallbackLastSeenAt: fallback,
              announcementsLastSeenAt: fallback,
              eventsLastSeenAt: fallback,
              teamsLastSeenAt: fallback,
              sessionsLastSeenAt: fallback,
              eventConversations: const {},
              teamChannels: const {},
              sessionChats: const {},
            ),
          ),
          completes,
        );

        final invalid = ReadStateService(
          firestore: firestore,
          bootstrapCall: (_) async => {'status': 'unknown', 'schemaVersion': 1},
        );
        await expectLater(
          invalid.bootstrapFromLegacy(
            clubId,
            userId,
            LegacyReadStateSnapshot(
              fallbackLastSeenAt: fallback,
              announcementsLastSeenAt: fallback,
              eventsLastSeenAt: fallback,
              teamsLastSeenAt: fallback,
              sessionsLastSeenAt: fallback,
              eventConversations: const {},
              teamChannels: const {},
              sessionChats: const {},
            ),
          ),
          throwsA(isA<StateError>()),
        );
      },
    );
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
        'type': 'evenement',
        'statut': 'ouvert',
        'date_fin': Timestamp.fromDate(DateTime.utc(2026, 3, 28, 22)),
      };
      // 23:00 Brussels on 28 March + 7 calendar days = 23:00 CEST 4 April.
      expect(
        isUnreadEligibleEvent(operation, DateTime.utc(2026, 4, 3, 21)),
        isTrue,
      );
      expect(
        isUnreadEligibleEvent(operation, DateTime.utc(2026, 4, 4, 21)),
        isTrue,
      );
      expect(
        isUnreadEligibleEvent(
          operation,
          DateTime.utc(2026, 4, 4, 21, 0, 1),
        ),
        isFalse,
      );
      expect(
        isUnreadEligibleEvent(
          {...operation, 'statut': 'supprimé'},
          DateTime.utc(2026, 4, 1),
        ),
        isFalse,
      );
      expect(
        isUnreadEligibleEvent(
          {...operation, 'deleted_at': Timestamp.now()},
          DateTime.utc(2026, 4, 1),
        ),
        isFalse,
      );
      expect(
        isUnreadEligibleEvent(
          {...operation, 'statut': 'brouillon'},
          DateTime.utc(2026, 4, 1),
        ),
        isFalse,
      );
      expect(
        isUnreadEligibleEvent(
          {...operation, 'type': 'cotisation'},
          DateTime.utc(2026, 4, 1),
        ),
        isFalse,
      );
    });

    test('inactive registration statuses are not countable', () {
      for (final status in ['canceled', 'waitlisted', 'withdrawn']) {
        expect(
          isCursorCountableRegistration({'registration_status': status}),
          isFalse,
        );
      }
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
