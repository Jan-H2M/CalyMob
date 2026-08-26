import 'package:calymob/services/avatar_nudge_service.dart';
import 'package:calymob/models/emergency_info.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

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

  test('prompts for emergency contact even when a photo is present', () async {
    expect(
      await AvatarNudgeService.shouldShow(
        userId: 'member-with-photo',
        hasVisiblePhoto: true,
        needsEmergencyContact: true,
      ),
      isTrue,
    );
  });

  test('uses a three day reminder interval', () {
    expect(AvatarNudgeService.snoozeDuration, const Duration(days: 3));
  });

  test('does not insist on emergency details after sharing was refused', () {
    expect(
      AvatarNudgeService.needsEmergencyContact(
        const EmergencyInfo(shareWithStaff: false),
      ),
      isFalse,
    );
  });

  test('asks for emergency details on a new incomplete profile', () {
    expect(AvatarNudgeService.needsEmergencyContact(null), isTrue);
    expect(
      AvatarNudgeService.needsEmergencyContact(const EmergencyInfo()),
      isTrue,
    );
  });
}
