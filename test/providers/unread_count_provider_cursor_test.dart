import 'dart:async';

import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:calymob/models/unread_cursor_feature_flag.dart';
import 'package:calymob/providers/unread_count_provider.dart';
import 'package:calymob/services/cursor_unread_count_service.dart';
import 'package:calymob/services/local_read_tracker.dart';
import 'package:calymob/services/read_state_service.dart';

CursorUnreadBreakdown cursorCounts() => const CursorUnreadBreakdown(
      announcements: 2,
      events: 3,
      teams: 4,
      sessions: 5,
    );

Future<void> settle() async {
  for (var i = 0; i < 5; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

Future<void> waitUntil(bool Function() condition) async {
  for (var i = 0; i < 100 && !condition(); i++) {
    await Future<void>.delayed(const Duration(milliseconds: 1));
  }
  expect(condition(), isTrue);
}

Stream<UnreadCursorFeatureFlag> explicitOffStream() =>
    Stream<UnreadCursorFeatureFlag>.value(UnreadCursorFeatureFlag.defaults);

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    LocalReadTracker().resetForTesting();
  });

  test(
    'OFF uses legacy UI and writer; shadow keeps legacy UI but calculates cursor',
    () async {
      final flags = StreamController<UnreadCursorFeatureFlag>.broadcast();
      var legacyCalls = 0, cursorCalls = 0, writerCalls = 0;
      final provider = UnreadCountProvider(
        flagStream: (_) => flags.stream,
        legacyRefresh: () async {
          legacyCalls++;
          return {
            'announcements': 1,
            'event_messages': 2,
            'team_messages': 3,
            'session_messages': 0,
          };
        },
        cursorRefresh: () async {
          cursorCalls++;
          return cursorCounts();
        },
        legacySync: (_, __, ___, ____) async {
          writerCalls++;
        },
        badgeUpdater: (_) {},
      );
      provider.listen('club', 'member');
      await settle();
      expect(provider.total, 0,
          reason: 'unknown authority must remain fail-closed');
      expect(provider.hasReliableBadgeCount, isFalse);
      expect(provider.usesCursorReadState, isTrue);
      flags.add(UnreadCursorFeatureFlag.defaults);
      await waitUntil(() => provider.total == 6);
      expect(provider.cursorMode, UnreadCursorV1Mode.off);
      expect(provider.total, 6);
      expect(legacyCalls, greaterThan(0));
      expect(writerCalls, greaterThan(0));
      expect(cursorCalls, 0);

      flags.add(
        const UnreadCursorFeatureFlag(
          enabled: true,
          mode: UnreadCursorV1Mode.shadow,
        ),
      );
      await settle();
      expect(provider.cursorMode, UnreadCursorV1Mode.shadow);
      expect(
        provider.total,
        6,
        reason: 'shadow must not alter displayed legacy counts',
      );
      expect(cursorCalls, greaterThan(0));
      expect(writerCalls, greaterThan(1));
      provider.dispose();
      await flags.close();
    },
  );

  test(
    'shadow pilot is effective ON and ON neither writes legacy counters nor omits zero badges',
    () async {
      final flags = StreamController<UnreadCursorFeatureFlag>.broadcast();
      var writerCalls = 0;
      final badgeValues = <int>[];
      var cursor = cursorCounts();
      final provider = UnreadCountProvider(
        flagStream: (_) => flags.stream,
        legacyRefresh: () async => {
          'announcements': 9,
          'event_messages': 9,
          'team_messages': 9,
          'session_messages': 9,
        },
        cursorRefresh: () async => cursor,
        cursorBootstrap: () async {},
        legacySync: (_, __, ___, ____) async {
          writerCalls++;
        },
        badgeUpdater: badgeValues.add,
      );
      provider.listen('club', 'pilot');
      await settle();
      expect(provider.total, 0);
      final beforeOnWrites = writerCalls;
      flags.add(
        const UnreadCursorFeatureFlag(
          enabled: true,
          mode: UnreadCursorV1Mode.shadow,
          pilotMemberIds: ['pilot'],
        ),
      );
      await settle();
      expect(provider.cursorMode, UnreadCursorV1Mode.on);
      expect(provider.total, 14);
      expect(provider.communication, 11);
      expect(writerCalls, beforeOnWrites);
      cursor = const CursorUnreadBreakdown(
        announcements: 0,
        events: 0,
        teams: 0,
        sessions: 0,
      );
      await provider.refresh();
      expect(provider.total, 0);
      expect(badgeValues.last, 0);
      provider.dispose();
      await flags.close();
    },
  );

  test(
    'switching an OFF member ON hides legacy values before bootstrap completes',
    () async {
      final flags = StreamController<UnreadCursorFeatureFlag>.broadcast();
      final bootstrap = Completer<void>();
      final badgeValues = <int>[];
      final provider = UnreadCountProvider(
        flagStream: (_) => flags.stream,
        legacyRefresh: () async => {
          'announcements': 27,
          'event_messages': 425,
          'team_messages': 175,
          'session_messages': 3,
        },
        cursorBootstrap: () => bootstrap.future,
        cursorRefresh: () async => const CursorUnreadBreakdown(
          announcements: 0,
          events: 0,
          teams: 0,
          sessions: 0,
        ),
        legacySync: (_, __, ___, ____) async {},
        badgeUpdater: badgeValues.add,
      );
      provider.listen('club', 'pilot');
      flags.add(UnreadCursorFeatureFlag.defaults);
      await waitUntil(() => provider.total == 630);

      flags.add(
        const UnreadCursorFeatureFlag(
          enabled: true,
          mode: UnreadCursorV1Mode.shadow,
          pilotMemberIds: ['pilot'],
        ),
      );
      await waitUntil(() => provider.cursorMode == UnreadCursorV1Mode.on);
      await settle();
      expect(provider.total, 0,
          reason: 'legacy handover values must never remain visible in ON');
      expect(badgeValues.last, 0,
          reason: 'the OS badge must be neutral while bootstrap is pending');
      expect(provider.usesCursorReadState, isTrue);
      expect(provider.isCursorReady, isFalse);

      bootstrap.complete();
      await waitUntil(() => provider.isCursorReady);
      expect(
        provider.total,
        0,
        reason: 'a zero can become authoritative only after bootstrap',
      );
      provider.dispose();
      await flags.close();
    },
  );

  test(
    'bootstrap or initial cursor query failure never republishes legacy',
    () async {
      for (final failAt in ['bootstrap', 'query']) {
        final flags = StreamController<UnreadCursorFeatureFlag>.broadcast();
        final badgeValues = <int>[];
        final provider = UnreadCountProvider(
          flagStream: (_) => flags.stream,
          legacyRefresh: () async => {
            'announcements': 2,
            'event_messages': 3,
            'team_messages': 4,
            'session_messages': 5,
          },
          cursorBootstrap: () async {
            if (failAt == 'bootstrap') throw StateError('bootstrap failed');
          },
          cursorRefresh: () async {
            if (failAt == 'query') throw StateError('query failed');
            return cursorCounts();
          },
          legacySync: (_, __, ___, ____) async {},
          badgeUpdater: badgeValues.add,
        );
        provider.listen('club', 'pilot');
        flags.add(UnreadCursorFeatureFlag.defaults);
        await waitUntil(() => provider.total == 14);
        final writesBeforeOn = badgeValues.length;
        flags.add(
          const UnreadCursorFeatureFlag(
            enabled: true,
            mode: UnreadCursorV1Mode.on,
          ),
        );
        await waitUntil(() => provider.cursorMode == UnreadCursorV1Mode.on);
        await provider.refresh();
        expect(provider.total, 0, reason: failAt);
        expect(provider.usesCursorReadState, isTrue, reason: failAt);
        expect(provider.hasReliableBadgeCount, isFalse, reason: failAt);
        expect(badgeValues.sublist(writesBeforeOn), const <int>[0],
            reason: 'effective ON must neutralise the legacy OS badge even '
                'when bootstrap/query authority is unavailable');
        provider.dispose();
        await flags.close();
      }
    },
  );

  test('a delayed feature flag clears a cold-start OS badge immediately',
      () async {
    final flags = StreamController<UnreadCursorFeatureFlag>.broadcast();
    final badgeValues = <int>[99];
    final provider = UnreadCountProvider(
      flagStream: (_) => flags.stream,
      legacyRefresh: () async => {
        'announcements': 27,
        'event_messages': 425,
        'team_messages': 175,
        'session_messages': 3,
      },
      cursorBootstrap: () async => throw StateError('offline'),
      cursorRefresh: () async => cursorCounts(),
      legacySync: (_, __, ___, ____) async {},
      badgeUpdater: badgeValues.add,
    );

    provider.listen('club', 'pilot');
    expect(badgeValues, <int>[99, 0]);
    await settle();
    expect(provider.hasReliableBadgeCount, isFalse);

    flags.add(const UnreadCursorFeatureFlag(
      enabled: true,
      mode: UnreadCursorV1Mode.shadow,
      pilotMemberIds: <String>['pilot'],
    ));
    await waitUntil(() => provider.cursorMode == UnreadCursorV1Mode.on);
    await provider.refresh();
    expect(badgeValues, <int>[99, 0, 0]);
    expect(provider.hasReliableBadgeCount, isFalse);

    provider.dispose();
    await flags.close();
  });

  test(
    'mode switch queues behind an in-flight legacy refresh without stale UI',
    () async {
      final flags = StreamController<UnreadCursorFeatureFlag>.broadcast();
      final firstLegacy = Completer<Map<String, int>>();
      var legacyCalls = 0;
      final badgeValues = <int>[];
      final provider = UnreadCountProvider(
        flagStream: (_) => flags.stream,
        legacyRefresh: () {
          legacyCalls++;
          if (legacyCalls == 1) return firstLegacy.future;
          return Future.value({
            'announcements': 1,
            'event_messages': 1,
            'team_messages': 1,
            'session_messages': 1,
          });
        },
        cursorBootstrap: () async {},
        cursorRefresh: () async => cursorCounts(),
        legacySync: (_, __, ___, ____) async {},
        badgeUpdater: badgeValues.add,
      );
      provider.listen('club', 'pilot');
      await settle();
      flags.add(UnreadCursorFeatureFlag.defaults);
      await waitUntil(() => legacyCalls == 1);
      flags.add(
        const UnreadCursorFeatureFlag(
          enabled: true,
          mode: UnreadCursorV1Mode.on,
        ),
      );
      await waitUntil(() => provider.cursorMode == UnreadCursorV1Mode.on);
      firstLegacy.complete({
        'announcements': 99,
        'event_messages': 99,
        'team_messages': 99,
        'session_messages': 99,
      });
      await waitUntil(() => provider.isCursorReady);
      expect(provider.total, 14);
      expect(
        badgeValues,
        isNot(contains(396)),
        reason: 'the stale OFF result must not apply after the mode change',
      );
      expect(
        legacyCalls,
        1,
        reason: 'ON must not start another legacy refresh',
      );
      provider.dispose();
      await flags.close();
    },
  );

  test('failed OFF mirror is merged once on ON bootstrap then cleared',
      () async {
    final flags = StreamController<UnreadCursorFeatureFlag>.broadcast();
    final tracker = LocalReadTracker();
    Map<String, Object>? bootstrapPayload;
    final trustedVisibleAt = DateTime.utc(2026, 9, 25, 8, 30);
    final readState = ReadStateService(
      firestore: FakeFirebaseFirestore(),
      visibleAcknowledgementCall: (_) async {
        throw StateError('offline');
      },
      bootstrapCall: (payload) async {
        bootstrapPayload = payload;
        return {'status': 'merged', 'schemaVersion': 1};
      },
    );
    final provider = UnreadCountProvider(
      tracker: tracker,
      readState: readState,
      flagStream: (_) => flags.stream,
      legacyRefresh: () async => {
        'announcements': 0,
        'event_messages': 0,
        'team_messages': 0,
        'session_messages': 0,
      },
      cursorRefresh: () async => cursorCounts(),
      legacySync: (_, __, ___, ____) async {},
      badgeUpdater: (_) {},
    );
    provider.listen('club', 'member');
    flags.add(UnreadCursorFeatureFlag.defaults);
    await waitUntil(
        () => provider.isListening && !provider.usesCursorReadState);

    await provider.markEventConversationSeen(
      'operation-1',
      visibleMessageId: 'message-1',
      visibleThroughAt: trustedVisibleAt,
    );
    final pending = await tracker.exportReadState();
    expect(pending.pendingEventConversations, {
      'operation-1': trustedVisibleAt,
    });

    flags.add(const UnreadCursorFeatureFlag(
      enabled: true,
      mode: UnreadCursorV1Mode.on,
    ));
    await waitUntil(() => provider.isCursorReady);
    expect(
      (bootstrapPayload?['pendingEventConversations'] as Map?)?['operation-1'],
      trustedVisibleAt.millisecondsSinceEpoch,
    );
    expect(
      (await tracker.exportReadState()).pendingEventConversations,
      isEmpty,
    );
    provider.dispose();
    await flags.close();
  });

  test('successful ON acknowledgement updates rollback but never pending merge',
      () async {
    final flags = StreamController<UnreadCursorFeatureFlag>.broadcast();
    final tracker = LocalReadTracker();
    final serverVisibleAt = DateTime.utc(2026, 9, 25, 9);
    final readState = ReadStateService(
      firestore: FakeFirebaseFirestore(),
      visibleAcknowledgementCall: (_) async => {
        'status': 'acknowledged',
        'visibleThroughMs': serverVisibleAt.millisecondsSinceEpoch,
      },
      bootstrapCall: (_) async => {
        'status': 'already-complete',
        'schemaVersion': 1,
      },
    );
    final provider = UnreadCountProvider(
      tracker: tracker,
      readState: readState,
      flagStream: (_) => flags.stream,
      legacyRefresh: () async => {
        'announcements': 0,
        'event_messages': 0,
        'team_messages': 0,
        'session_messages': 0,
      },
      cursorRefresh: () async => cursorCounts(),
      legacySync: (_, __, ___, ____) async {},
      badgeUpdater: (_) {},
    );
    provider.listen('club', 'member');
    flags.add(const UnreadCursorFeatureFlag(
      enabled: true,
      mode: UnreadCursorV1Mode.on,
    ));
    await waitUntil(() => provider.isCursorReady);

    await provider.markEventConversationSeen(
      'operation-1',
      visibleMessageId: 'message-1',
    );

    final snapshot = await tracker.exportReadState();
    expect(snapshot.eventConversations['operation-1'], serverVisibleAt);
    expect(snapshot.pendingSections, isEmpty);
    provider.dispose();
    await flags.close();
  });

  test(
    'a later canonical query failure keeps the last complete cursor result',
    () async {
      final flags = StreamController<UnreadCursorFeatureFlag>.broadcast();
      var cursorCalls = 0;
      final provider = UnreadCountProvider(
        flagStream: (_) => flags.stream,
        legacyRefresh: () async => {
          'announcements': 8,
          'event_messages': 8,
          'team_messages': 8,
          'session_messages': 8,
        },
        cursorBootstrap: () async {},
        cursorRefresh: () async {
          cursorCalls++;
          if (cursorCalls > 1) throw StateError('temporary cursor failure');
          return cursorCounts();
        },
        legacySync: (_, __, ___, ____) async {},
        badgeUpdater: (_) {},
      );
      provider.listen('club', 'pilot');
      flags.add(
        const UnreadCursorFeatureFlag(
          enabled: true,
          mode: UnreadCursorV1Mode.on,
        ),
      );
      await waitUntil(() => provider.isCursorReady);
      expect(provider.total, 14);
      await provider.refresh();
      expect(provider.total, 14);
      expect(provider.usesCursorReadState, isTrue);
      provider.dispose();
      await flags.close();
    },
  );

  test('cached counts are isolated per club and member', () async {
    final first = UnreadCountProvider(
      flagStream: (_) => explicitOffStream(),
      legacyRefresh: () async => {
        'announcements': 27,
        'event_messages': 425,
        'team_messages': 175,
        'session_messages': 3,
      },
      cursorRefresh: () async => cursorCounts(),
      legacySync: (_, __, ___, ____) async {},
      badgeUpdater: (_) {},
    );
    first.listen('club', 'member-a');
    await waitUntil(() => first.total == 630);
    await settle();
    first.dispose();

    final secondRefresh = Completer<Map<String, int>>();
    final second = UnreadCountProvider(
      flagStream: (_) => explicitOffStream(),
      legacyRefresh: () => secondRefresh.future,
      cursorRefresh: () async => cursorCounts(),
      legacySync: (_, __, ___, ____) async {},
      badgeUpdater: (_) {},
    );
    second.listen('club', 'member-b');
    await settle();

    expect(
      second.total,
      0,
      reason: 'member B must never render member A cached badges',
    );
    secondRefresh.complete({
      'announcements': 0,
      'event_messages': 0,
      'team_messages': 0,
      'session_messages': 0,
    });
    await settle();
    second.dispose();
  });

  test('legacy global cache is ignored and removed fail-closed', () async {
    SharedPreferences.setMockInitialValues({
      'unread_cache_announcements': 99,
      'unread_cache_event_messages': 99,
      'unread_cache_team_messages': 99,
      'unread_cache_session_messages': 99,
      'unread_cache_timestamp': DateTime.now().millisecondsSinceEpoch,
    });
    LocalReadTracker().resetForTesting();
    final refresh = Completer<Map<String, int>>();
    final provider = UnreadCountProvider(
      flagStream: (_) => explicitOffStream(),
      legacyRefresh: () => refresh.future,
      cursorRefresh: () async => cursorCounts(),
      legacySync: (_, __, ___, ____) async {},
      badgeUpdater: (_) {},
    );
    provider.listen('club', 'member');
    await settle();

    expect(provider.total, 0);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getInt('unread_cache_announcements'), isNull);
    expect(prefs.getInt('unread_cache_timestamp'), isNull);

    refresh.complete({
      'announcements': 0,
      'event_messages': 0,
      'team_messages': 0,
      'session_messages': 0,
    });
    await settle();
    provider.dispose();
  });

  test('an in-place account switch clears the previous visible counts',
      () async {
    final memberBRefresh = Completer<Map<String, int>>();
    var calls = 0;
    final provider = UnreadCountProvider(
      flagStream: (_) => explicitOffStream(),
      legacyRefresh: () {
        calls += 1;
        if (calls == 1) {
          return Future.value({
            'announcements': 27,
            'event_messages': 425,
            'team_messages': 175,
            'session_messages': 3,
          });
        }
        return memberBRefresh.future;
      },
      cursorRefresh: () async => cursorCounts(),
      legacySync: (_, __, ___, ____) async {},
      badgeUpdater: (_) {},
    );
    provider.listen('club', 'member-a');
    await waitUntil(() => provider.total == 630);

    provider.listen('club', 'member-b');
    expect(provider.total, 0);
    memberBRefresh.complete({
      'announcements': 0,
      'event_messages': 0,
      'team_messages': 0,
      'session_messages': 0,
    });
    await settle();
    provider.dispose();
  });

  test('external auth sign-out clear immediately removes UI and OS badge state',
      () async {
    final badgeValues = <int>[];
    final tracker = LocalReadTracker();
    final provider = UnreadCountProvider(
      tracker: tracker,
      flagStream: (_) => explicitOffStream(),
      legacyRefresh: () async => {
        'announcements': 27,
        'event_messages': 425,
        'team_messages': 175,
        'session_messages': 3,
      },
      cursorRefresh: () async => cursorCounts(),
      legacySync: (_, __, ___, ____) async {},
      badgeUpdater: badgeValues.add,
    );
    provider.listen('club', 'member-a');
    await waitUntil(() => provider.total == 630);

    final clearing = provider.clear();
    expect(provider.total, 0);
    expect(provider.isListening, isFalse);
    expect(badgeValues.last, 0);
    await clearing;
    expect(tracker.isActiveContext('club', 'member-a'), isFalse);
    provider.dispose();
  });

  test('confirmed account switch clears the old OS badge immediately',
      () async {
    final badgeValues = <int>[];
    final next = Completer<Map<String, int>>();
    var calls = 0;
    final provider = UnreadCountProvider(
      flagStream: (_) => explicitOffStream(),
      legacyRefresh: () {
        calls++;
        return calls == 1
            ? Future.value({
                'announcements': 1,
                'event_messages': 2,
                'team_messages': 3,
                'session_messages': 4,
              })
            : next.future;
      },
      cursorRefresh: () async => cursorCounts(),
      legacySync: (_, __, ___, ____) async {},
      badgeUpdater: badgeValues.add,
    );
    provider.listen('club', 'member-a');
    await waitUntil(() => provider.total == 10);

    provider.listen('club', 'member-b');
    expect(provider.total, 0);
    expect(badgeValues.last, 0);
    expect(provider.hasReliableBadgeCount, isFalse);

    next.complete({
      'announcements': 0,
      'event_messages': 0,
      'team_messages': 0,
      'session_messages': 0,
    });
    await settle();
    provider.dispose();
  });

  test('old flag subscriptions cannot steer A-B-A context switches', () async {
    final flags = <String, StreamController<UnreadCursorFeatureFlag>>{
      'club-a': StreamController<UnreadCursorFeatureFlag>.broadcast(),
      'club-b': StreamController<UnreadCursorFeatureFlag>.broadcast(),
    };
    final flagClubs = <String>[];
    final provider = UnreadCountProvider(
      flagStream: (clubId) {
        flagClubs.add(clubId);
        return flags[clubId]!.stream;
      },
      legacyRefresh: () async => {
        'announcements': 0,
        'event_messages': 0,
        'team_messages': 0,
        'session_messages': 0,
      },
      cursorRefresh: () async => cursorCounts(),
      legacySync: (_, __, ___, ____) async {},
      badgeUpdater: (_) {},
    );

    provider.listen('club-a', 'member-a');
    provider.listen('club-b', 'member-b');
    await waitUntil(() => flagClubs.contains('club-b'));
    flags['club-a']!.add(const UnreadCursorFeatureFlag(
      enabled: true,
      mode: UnreadCursorV1Mode.on,
    ));
    flags['club-b']!.add(UnreadCursorFeatureFlag.defaults);
    await settle();
    expect(provider.cursorMode, UnreadCursorV1Mode.off);

    provider.listen('club-a', 'member-a');
    flags['club-b']!.add(const UnreadCursorFeatureFlag(
      enabled: true,
      mode: UnreadCursorV1Mode.on,
    ));
    flags['club-a']!.add(UnreadCursorFeatureFlag.defaults);
    await settle();

    expect(flagClubs, ['club-a', 'club-b', 'club-a']);
    expect(provider.cursorMode, UnreadCursorV1Mode.off);
    provider.dispose();
    await Future.wait(flags.values.map((controller) => controller.close()));
  });

  test('a late save cannot write new-context values under the old member key',
      () async {
    final prefs = await SharedPreferences.getInstance();
    final delayedSave = Completer<SharedPreferences>();
    final memberBRefresh = Completer<Map<String, int>>();
    var loaderCalls = 0;
    var refreshCalls = 0;
    final provider = UnreadCountProvider(
      preferencesLoader: () {
        loaderCalls += 1;
        return loaderCalls == 2 ? delayedSave.future : Future.value(prefs);
      },
      flagStream: (_) => explicitOffStream(),
      legacyRefresh: () {
        refreshCalls += 1;
        if (refreshCalls == 1) {
          return Future.value({
            'announcements': 27,
            'event_messages': 425,
            'team_messages': 175,
            'session_messages': 3,
          });
        }
        return memberBRefresh.future;
      },
      cursorRefresh: () async => cursorCounts(),
      legacySync: (_, __, ___, ____) async {},
      badgeUpdater: (_) {},
    );
    provider.listen('club', 'member-a');
    await waitUntil(() => provider.total == 630 && loaderCalls >= 2);

    provider.listen('club', 'member-b');
    await settle();
    delayedSave.complete(prefs);
    await settle();

    expect(
      prefs.getKeys().where((key) => key.startsWith('unread_cache_v2_')),
      isEmpty,
    );
    memberBRefresh.complete({
      'announcements': 0,
      'event_messages': 0,
      'team_messages': 0,
      'session_messages': 0,
    });
    await settle();
    provider.dispose();
  });

  test('an A-B-A race cannot let the old A save erase the new A cache',
      () async {
    final prefs = await SharedPreferences.getInstance();
    final oldSaveReachedCommit = Completer<void>();
    final releaseOldSave = Completer<void>();
    final stagedTokens = <String>[];
    final stagedUsers = <String>[];
    var currentCounts = <String, int>{
      'announcements': 27,
      'event_messages': 425,
      'team_messages': 175,
      'session_messages': 3,
    };
    final provider = UnreadCountProvider(
      cacheBeforeCommit: (_, userId, token) async {
        stagedUsers.add(userId);
        stagedTokens.add(token);
        if (stagedTokens.length == 1) {
          oldSaveReachedCommit.complete();
          await releaseOldSave.future;
        }
      },
      flagStream: (_) => explicitOffStream(),
      legacyRefresh: () async => Map<String, int>.from(currentCounts),
      cursorRefresh: () async => cursorCounts(),
      legacySync: (_, __, ___, ____) async {},
      badgeUpdater: (_) {},
    );

    provider.listen('club', 'member-a');
    await oldSaveReachedCommit.future;
    final oldToken = stagedTokens.single;

    currentCounts = {
      'announcements': 0,
      'event_messages': 0,
      'team_messages': 0,
      'session_messages': 0,
    };
    provider.listen('club', 'member-b');
    await settle();
    await provider.refresh();

    currentCounts = {
      'announcements': 1,
      'event_messages': 2,
      'team_messages': 3,
      'session_messages': 4,
    };
    provider.listen('club', 'member-a');
    await settle();
    await provider.refresh();
    await waitUntil(
      () =>
          provider.total == 10 &&
          stagedUsers.where((userId) => userId == 'member-a').length >= 2,
    );
    final currentToken = stagedTokens[stagedUsers.lastIndexOf('member-a')];
    await waitUntil(
      () => prefs.getKeys().any(
            (key) =>
                key.endsWith('commit_token') &&
                prefs.getString(key) == currentToken,
          ),
    );

    releaseOldSave.complete();
    await waitUntil(
      () => !prefs.getKeys().any((key) => key.contains(oldToken)),
    );
    expect(
      prefs.getKeys().any(
            (key) =>
                key.endsWith('commit_token') &&
                prefs.getString(key) == currentToken,
          ),
      isTrue,
    );
    provider.dispose();

    final refresh = Completer<Map<String, int>>();
    final reloaded = UnreadCountProvider(
      flagStream: (_) => explicitOffStream(),
      legacyRefresh: () => refresh.future,
      cursorRefresh: () async => cursorCounts(),
      legacySync: (_, __, ___, ____) async {},
      badgeUpdater: (_) {},
    );
    reloaded.listen('club', 'member-a');
    await waitUntil(() => reloaded.total == 10);
    refresh.complete({
      'announcements': 1,
      'event_messages': 2,
      'team_messages': 3,
      'session_messages': 4,
    });
    await settle();
    reloaded.dispose();
  });

  test('a pending save cannot recreate cache after clear', () async {
    final prefs = await SharedPreferences.getInstance();
    final delayedSave = Completer<SharedPreferences>();
    var loaderCalls = 0;
    final provider = UnreadCountProvider(
      preferencesLoader: () {
        loaderCalls += 1;
        return loaderCalls == 2 ? delayedSave.future : Future.value(prefs);
      },
      flagStream: (_) => explicitOffStream(),
      legacyRefresh: () async => {
        'announcements': 1,
        'event_messages': 2,
        'team_messages': 3,
        'session_messages': 4,
      },
      cursorRefresh: () async => cursorCounts(),
      legacySync: (_, __, ___, ____) async {},
      badgeUpdater: (_) {},
    );
    provider.listen('club', 'member');
    await waitUntil(() => provider.total == 10 && loaderCalls >= 2);

    provider.clear();
    delayedSave.complete(prefs);
    await settle();

    expect(
      prefs.getKeys().where((key) => key.startsWith('unread_cache_v2_')),
      isEmpty,
    );
    provider.dispose();
  });
}
