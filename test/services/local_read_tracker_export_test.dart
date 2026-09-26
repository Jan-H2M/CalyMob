import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:calymob/services/local_read_tracker.dart';
import 'package:calymob/models/read_state.dart';

void main() {
  final tracker = LocalReadTracker();

  tearDown(tracker.resetForTesting);

  test(
    'exports legacy global, section, and every supported scope mapping',
    () async {
      final global = DateTime.utc(2026, 9, 20);
      final event = DateTime.utc(2026, 9, 21);
      final team = DateTime.utc(2026, 9, 22);
      final session = DateTime.utc(2026, 9, 23);
      SharedPreferences.setMockInitialValues({
        'localReadTracker_initialized': true,
        'localReadTracker_globalBaseline': global.microsecondsSinceEpoch,
        'lastRead_announcements':
            global.subtract(const Duration(days: 2)).microsecondsSinceEpoch,
        'lastRead_operation_event-1': event.microsecondsSinceEpoch,
        'lastRead_team_general': team.microsecondsSinceEpoch,
        'lastRead_session_session-1_accueil': session.microsecondsSinceEpoch,
        'lastRead_session_session-2_niveau_P2': session.microsecondsSinceEpoch,
        'lastRead_unsupported_value': session.microsecondsSinceEpoch,
      });
      tracker.resetForTesting();
      await tracker.activateContext('club', 'member-a');

      final snapshot = await tracker.exportReadState();

      expect(snapshot.pendingSections, isEmpty,
          reason:
              'ordinary rollback state is never a completed-handover merge');

      expect(snapshot.fallbackLastSeenAt.isAtSameMomentAs(global), isTrue);
      expect(
        snapshot.announcementsLastSeenAt.isAtSameMomentAs(global),
        isTrue,
        reason: 'the global mark-all floor wins over an older section key',
      );
      expect(
        snapshot.eventConversations['event-1']!.isAtSameMomentAs(event),
        isTrue,
      );
      expect(
        snapshot.teamChannels['general']!.isAtSameMomentAs(team),
        isTrue,
      );
      expect(
        snapshot.sessionChats['session-1__accueil']!.isAtSameMomentAs(session),
        isTrue,
      );
      expect(
        snapshot.sessionChats['session-2__niveau__P2']!.isAtSameMomentAs(
          session,
        ),
        isTrue,
      );
    },
  );

  test('persists a fresh-install fallback across app restarts', () async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    tracker.resetForTesting();
    await tracker.activateContext('club', 'member-a');
    final first = tracker.installBaseline!;
    expect(tracker.isFreshInstallThisRun, isTrue);
    expect(tracker.hasPendingFreshInstallResetFor('club', 'member-a'), isTrue);
    expect(tracker.consumeFreshInstallSignal(), isTrue);
    expect(
      tracker.consumeFreshInstallSignal(),
      isFalse,
      reason: 'the server reset may run only once in this process',
    );

    tracker.resetForTesting();
    await tracker.activateContext('club', 'member-a');
    expect(tracker.installBaseline!.isAtSameMomentAs(first), isTrue);
    expect(tracker.isFreshInstallThisRun, isFalse);
    expect(tracker.consumeFreshInstallSignal(), isFalse);
    expect(
      tracker.hasPendingFreshInstallResetFor('club', 'member-a'),
      isTrue,
      reason: 'a failed server reset must remain retryable after restart',
    );
    await tracker.completeFreshInstallResetFor('club', 'member-a');
    expect(
      tracker.hasPendingFreshInstallResetFor('club', 'member-a'),
      isFalse,
    );
    final snapshot = await tracker.exportReadState();
    expect(snapshot.fallbackLastSeenAt.isAtSameMomentAs(first), isTrue);
    expect(snapshot.pendingSections, isEmpty,
        reason: 'a persisted install baseline is never a real read action');
  });

  test('fresh-install reset completion cannot consume another identity',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    tracker.resetForTesting();
    await tracker.activateContext('club', 'member-a');
    expect(tracker.hasPendingFreshInstallResetFor('club', 'member-a'), isTrue);

    await tracker.activateContext('club', 'member-b');
    expect(tracker.hasPendingFreshInstallResetFor('club', 'member-b'), isFalse);
    final memberBBaseline = tracker.installBaseline;
    expect(memberBBaseline, isNotNull,
        reason:
            'a second account on this installation must not rewind to 2024');
    await tracker.completeFreshInstallResetFor('club', 'member-a');
    expect(tracker.hasPendingFreshInstallResetFor('club', 'member-b'), isFalse);

    await tracker.activateContext('club', 'member-a');
    expect(tracker.hasPendingFreshInstallResetFor('club', 'member-a'), isFalse);
  });

  test('all identities on a fresh installation share its persisted floor',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    tracker.resetForTesting();
    await tracker.activateContext('club', 'member-a');
    final installationFloor = tracker.installBaseline!;

    await tracker.activateContext('club', 'member-b');
    expect(
      tracker.installBaseline!.isAtSameMomentAs(installationFloor),
      isTrue,
    );
    expect(tracker.isFreshInstallThisRun, isFalse,
        reason: 'only the first identity may reset server counters');
    expect(
      (await tracker.exportReadState())
          .fallbackLastSeenAt
          .isAtSameMomentAs(installationFloor),
      isTrue,
    );

    tracker.resetForTesting();
    await tracker.activateContext('club', 'member-c');
    expect(
      tracker.installBaseline!.isAtSameMomentAs(installationFloor),
      isTrue,
      reason: 'a later process must retain the device installation floor',
    );
  });

  test('only failed mirror provenance is exported for completed handover merge',
      () async {
    SharedPreferences.setMockInitialValues({
      'localReadTracker_initialized': true,
    });
    tracker.resetForTesting();
    await tracker.activateContext('club', 'member-a');
    await tracker.markSectionAsRead(ReadStateSection.events);
    await tracker.markAsRead('announcements');
    final eventPending = DateTime.utc(2026, 9, 26, 10);
    final announcementsPending = DateTime.utc(2026, 9, 26, 11);
    final teamPending = DateTime.utc(2026, 9, 26, 12);
    await tracker.recordPendingSectionMirrorFor(
      'club',
      'member-a',
      ReadStateSection.events,
      eventPending,
    );
    await tracker.recordPendingReadMirrorFor(
      'club',
      'member-a',
      'announcements',
      announcementsPending,
    );
    await tracker.recordPendingReadMirrorFor(
      'club',
      'member-a',
      'team_general',
      teamPending,
    );

    final snapshot = await tracker.exportReadState();
    expect(snapshot.pendingSections, {
      ReadStateSection.announcements: announcementsPending,
      ReadStateSection.events: eventPending,
    });
    expect(snapshot.pendingTeamChannels, {'general': teamPending});
  });

  test('successful bootstrap cleanup cannot erase a newer failed mirror',
      () async {
    SharedPreferences.setMockInitialValues({
      'localReadTracker_initialized': true,
    });
    tracker.resetForTesting();
    await tracker.activateContext('club', 'member-a');
    final submitted = DateTime.utc(2026, 9, 26, 10);
    final newer = DateTime.utc(2026, 9, 26, 11);
    await tracker.recordPendingReadMirrorFor(
      'club',
      'member-a',
      'operation_event-1',
      submitted,
    );
    final snapshot = await tracker.exportReadState();
    await tracker.recordPendingReadMirrorFor(
      'club',
      'member-a',
      'operation_event-1',
      newer,
    );

    await tracker.clearPendingMirrorsUpTo('club', 'member-a', snapshot);

    final afterRace = await tracker.exportReadState();
    expect(afterRace.pendingEventConversations, {'event-1': newer});
    await tracker.clearPendingMirrorsUpTo('club', 'member-a', afterRace);
    expect(
      (await tracker.exportReadState()).pendingEventConversations,
      isEmpty,
    );
  });

  test('older installs without a persisted baseline fail safe to the epoch',
      () async {
    SharedPreferences.setMockInitialValues({
      'localReadTracker_initialized': true,
    });
    tracker.resetForTesting();
    await tracker.activateContext('club', 'member-a');

    final snapshot = await tracker.exportReadState();

    expect(tracker.isFreshInstallThisRun, isFalse);
    expect(tracker.consumeFreshInstallSignal(), isFalse);
    expect(snapshot.fallbackLastSeenAt, DateTime(2024, 1, 1));
  });

  test('read state is isolated per club and member and survives reactivation',
      () async {
    SharedPreferences.setMockInitialValues({
      'localReadTracker_initialized': true,
    });
    tracker.resetForTesting();

    await tracker.activateContext('club-a', 'member-a');
    await tracker.markAsRead('team_general');
    final memberARead = tracker.getLastRead('team_general');
    expect(memberARead, isNotNull);

    await tracker.activateContext('club-a', 'member-b');
    expect(tracker.getLastRead('team_general'), isNull);
    await tracker.markAsRead('announcement_b');

    await tracker.activateContext('club-b', 'member-a');
    expect(tracker.getLastRead('team_general'), isNull);
    expect(tracker.getLastRead('announcement_b'), isNull);

    await tracker.activateContext('club-a', 'member-a');
    expect(
      tracker.getLastRead('team_general')!.isAtSameMomentAs(memberARead!),
      isTrue,
    );
    expect(tracker.getLastRead('announcement_b'), isNull);
  });

  test('deactivation invalidates context without deleting rollback history',
      () async {
    SharedPreferences.setMockInitialValues({
      'localReadTracker_initialized': true,
    });
    tracker.resetForTesting();
    await tracker.activateContext('club', 'member');
    await tracker.markAsRead('operation_event');
    final read = tracker.getLastRead('operation_event');

    await tracker.deactivateContext();
    expect(tracker.getLastRead('operation_event'), isNull);
    await tracker.activateContext('club', 'member');
    expect(
      tracker.getLastRead('operation_event')!.isAtSameMomentAs(read!),
      isTrue,
    );
  });
}
