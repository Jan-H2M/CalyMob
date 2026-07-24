import 'package:calymob/utils/roster_activity_summary.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('summarizes declared per-hour activities without requalifying them', () {
    final summary = summarizeRosterActivity({
      '1ere_heure': {
        'activity': 'formation',
        'role': 'eleve',
      },
      '2eme_heure': {
        'activity': 'service',
        'service': 'gonflage',
      },
    });

    expect(summary.activityLabel, 'Formation · Service (gonflage)');
    expect(summary.attendanceLabel, 'Présent');
    expect(summary.isPresent, isTrue);
  });

  test('marks absence only when every declared hour is absent', () {
    final summary = summarizeRosterActivity({
      '1ere_heure': {'activity': 'absent'},
      '2eme_heure': {'activity': 'absent'},
    });

    expect(summary.activityLabel, 'Absent');
    expect(summary.attendanceLabel, 'Absent');
    expect(summary.isPresent, isFalse);
  });

  test('uses an explicit unknown state when attendee facts are unavailable',
      () {
    final summary = summarizeRosterActivity(null);

    expect(summary.activityLabel, 'Activité non renseignée');
    expect(summary.attendanceLabel, 'Inconnu');
    expect(summary.isPresent, isNull);
  });
}
