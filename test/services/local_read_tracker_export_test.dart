import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:calymob/services/local_read_tracker.dart';

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

      final snapshot = await tracker.exportReadState();

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
    await tracker.init();
    final first = tracker.installBaseline!;
    expect(tracker.isFreshInstallThisRun, isTrue);
    expect(tracker.consumeFreshInstallSignal(), isTrue);
    expect(
      tracker.consumeFreshInstallSignal(),
      isFalse,
      reason: 'the server reset may run only once in this process',
    );

    tracker.resetForTesting();
    await tracker.init();
    expect(tracker.installBaseline!.isAtSameMomentAs(first), isTrue);
    expect(tracker.isFreshInstallThisRun, isFalse);
    expect(tracker.consumeFreshInstallSignal(), isFalse);
    final snapshot = await tracker.exportReadState();
    expect(snapshot.fallbackLastSeenAt.isAtSameMomentAs(first), isTrue);
  });

  test('older installs without a persisted baseline fail safe to the epoch',
      () async {
    SharedPreferences.setMockInitialValues({
      'localReadTracker_initialized': true,
    });
    tracker.resetForTesting();

    final snapshot = await tracker.exportReadState();

    expect(tracker.isFreshInstallThisRun, isFalse);
    expect(tracker.consumeFreshInstallSignal(), isFalse);
    expect(snapshot.fallbackLastSeenAt, DateTime(2024, 1, 1));
  });
}
