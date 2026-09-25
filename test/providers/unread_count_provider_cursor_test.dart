import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:calymob/models/unread_cursor_feature_flag.dart';
import 'package:calymob/providers/unread_count_provider.dart';
import 'package:calymob/services/cursor_unread_count_service.dart';

CursorUnreadBreakdown cursorCounts() => const CursorUnreadBreakdown(
    announcements: 2, events: 3, teams: 4, sessions: 5);

Future<void> settle() async {
  await Future<void>.delayed(Duration.zero);
  await Future<void>.delayed(Duration.zero);
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues(<String, Object>{}));

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
          'session_messages': 0
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
    expect(provider.cursorMode, UnreadCursorV1Mode.off);
    expect(provider.total, 6);
    expect(legacyCalls, greaterThan(0));
    expect(writerCalls, greaterThan(0));
    expect(cursorCalls, 0);

    flags.add(const UnreadCursorFeatureFlag(
        enabled: true, mode: UnreadCursorV1Mode.shadow));
    await settle();
    expect(provider.cursorMode, UnreadCursorV1Mode.shadow);
    expect(provider.total, 6,
        reason: 'shadow must not alter displayed legacy counts');
    expect(cursorCalls, greaterThan(0));
    expect(writerCalls, greaterThan(1));
    provider.dispose();
    await flags.close();
  });

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
        'session_messages': 9
      },
      cursorRefresh: () async => cursor,
      legacySync: (_, __, ___, ____) async {
        writerCalls++;
      },
      badgeUpdater: badgeValues.add,
    );
    provider.listen('club', 'pilot');
    await settle();
    final beforeOnWrites = writerCalls;
    flags.add(const UnreadCursorFeatureFlag(
        enabled: true,
        mode: UnreadCursorV1Mode.shadow,
        pilotMemberIds: ['pilot']));
    await settle();
    expect(provider.cursorMode, UnreadCursorV1Mode.on);
    expect(provider.total, 14);
    expect(provider.communication, 11);
    expect(writerCalls, beforeOnWrites);
    cursor = const CursorUnreadBreakdown(
        announcements: 0, events: 0, teams: 0, sessions: 0);
    await provider.refresh();
    expect(provider.total, 0);
    expect(badgeValues.last, 0);
    provider.dispose();
    await flags.close();
  });
}
