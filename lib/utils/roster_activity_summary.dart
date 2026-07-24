class RosterActivitySummary {
  final String activityLabel;
  final String attendanceLabel;
  final bool? isPresent;

  const RosterActivitySummary({
    required this.activityLabel,
    required this.attendanceLabel,
    required this.isPresent,
  });

  static const unknown = RosterActivitySummary(
    activityLabel: 'Activité non renseignée',
    attendanceLabel: 'Inconnu',
    isPresent: null,
  );
}

RosterActivitySummary summarizeRosterActivity(Object? rawHours) {
  if (rawHours is! Map || rawHours.isEmpty) {
    return RosterActivitySummary.unknown;
  }

  final activities = <String>[];
  var hasKnownActivity = false;
  var allAbsent = true;
  for (final value in rawHours.values) {
    if (value is! Map) continue;
    final activity = value['activity']?.toString();
    if (activity == null || activity.isEmpty) continue;
    hasKnownActivity = true;
    allAbsent = allAbsent && activity == 'absent';
    final label = switch (activity) {
      'formation' => 'Formation',
      'service' => _serviceLabel(value),
      'nage_libre' => 'Nage libre',
      'absent' => 'Absent',
      _ => 'Activité non renseignée',
    };
    if (!activities.contains(label)) activities.add(label);
  }

  if (!hasKnownActivity) return RosterActivitySummary.unknown;
  return RosterActivitySummary(
    activityLabel: activities.join(' · '),
    attendanceLabel: allAbsent ? 'Absent' : 'Présent',
    isPresent: !allAbsent,
  );
}

String _serviceLabel(Map value) {
  final service = value['service']?.toString().trim();
  if (service == null || service.isEmpty) return 'Service';
  final readable = service.replaceAll('_', ' ');
  return 'Service ($readable)';
}
