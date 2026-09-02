class EventWaitlistDefaults {
  const EventWaitlistDefaults._();

  /// A new dive opts into the waitlist only when it has a usable quota.
  /// Once the organizer explicitly changes the switch, that choice wins.
  static bool effectiveValue({
    required String eventCategory,
    required String capacityText,
    bool? explicitChoice,
  }) {
    if (explicitChoice != null) return explicitChoice;

    final capacity = int.tryParse(capacityText.trim());
    return eventCategory == 'plongee' && capacity != null && capacity > 0;
  }
}
