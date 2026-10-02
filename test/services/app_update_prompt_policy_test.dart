import 'package:calymob/services/app_update_prompt_policy.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final now = DateTime.utc(2026, 9, 29, 12);

  group('AppUpdatePromptPolicy.shouldPresent', () {
    test('does not present when no update is available', () {
      expect(
        AppUpdatePromptPolicy.shouldPresent(
          updateAvailable: false,
          forceUpdate: false,
          latestVersion: '1.23.2',
          snoozedVersion: null,
          snoozedUntil: null,
          now: now,
        ),
        isFalse,
      );
    });

    test('presents an optional update without a snooze', () {
      expect(
        AppUpdatePromptPolicy.shouldPresent(
          updateAvailable: true,
          forceUpdate: false,
          latestVersion: '1.23.2',
          snoozedVersion: null,
          snoozedUntil: null,
          now: now,
        ),
        isTrue,
      );
    });

    test('suppresses the same optional version during its snooze', () {
      expect(
        AppUpdatePromptPolicy.shouldPresent(
          updateAvailable: true,
          forceUpdate: false,
          latestVersion: '1.23.2',
          snoozedVersion: '1.23.2',
          snoozedUntil: now.add(const Duration(hours: 1)),
          now: now,
        ),
        isFalse,
      );
    });

    test(
      'presents a newer optional version despite an older-version snooze',
      () {
        expect(
          AppUpdatePromptPolicy.shouldPresent(
            updateAvailable: true,
            forceUpdate: false,
            latestVersion: '1.23.3',
            snoozedVersion: '1.23.2',
            snoozedUntil: now.add(const Duration(hours: 1)),
            now: now,
          ),
          isTrue,
        );
      },
    );

    test('presents the optional version once its snooze expires', () {
      expect(
        AppUpdatePromptPolicy.shouldPresent(
          updateAvailable: true,
          forceUpdate: false,
          latestVersion: '1.23.2',
          snoozedVersion: '1.23.2',
          snoozedUntil: now,
          now: now,
        ),
        isTrue,
      );
    });

    test('never suppresses a mandatory update', () {
      expect(
        AppUpdatePromptPolicy.shouldPresent(
          updateAvailable: true,
          forceUpdate: true,
          latestVersion: '1.23.2',
          snoozedVersion: '1.23.2',
          snoozedUntil: now.add(const Duration(days: 1)),
          now: now,
        ),
        isTrue,
      );
    });
  });

  test('optional update snooze lasts 24 hours', () {
    expect(
      AppUpdatePromptPolicy.snoozedUntil(now),
      now.add(const Duration(hours: 24)),
    );
  });
}
