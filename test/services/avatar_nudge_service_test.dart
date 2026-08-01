import 'package:calymob/services/avatar_nudge_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('does not prompt when photo is visible with internal consent', () async {
    expect(
      await AvatarNudgeService.shouldShow(
        userId: 'member',
        hasVisiblePhoto: true,
      ),
      isFalse,
    );
  });

  test('honours the cross-device server snooze', () async {
    final now = DateTime(2026, 8, 1, 12);
    expect(
      await AvatarNudgeService.shouldShow(
        userId: 'member',
        hasVisiblePhoto: false,
        serverSnoozedUntil: now.add(const Duration(days: 1)),
        now: now,
      ),
      isFalse,
    );
  });
}
