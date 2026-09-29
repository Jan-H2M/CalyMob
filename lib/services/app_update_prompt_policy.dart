/// Pure beslislogica voor automatische updateprompts.
///
/// Een snooze geldt uitsluitend voor dezelfde optionele versie. Verplichte
/// updates worden nooit door een eerder opgeslagen snooze onderdrukt.
class AppUpdatePromptPolicy {
  static const optionalUpdateSnoozeDuration = Duration(hours: 24);

  static bool shouldPresent({
    required bool updateAvailable,
    required bool forceUpdate,
    required String latestVersion,
    required String? snoozedVersion,
    required DateTime? snoozedUntil,
    required DateTime now,
  }) {
    if (!updateAvailable) return false;
    if (forceUpdate) return true;

    final hasActiveSnooze = snoozedVersion == latestVersion &&
        snoozedUntil != null &&
        snoozedUntil.isAfter(now);
    return !hasActiveSnooze;
  }

  static DateTime snoozedUntil(DateTime now) =>
      now.add(optionalUpdateSnoozeDuration);
}
