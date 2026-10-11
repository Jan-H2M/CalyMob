import 'package:calymob/services/pool_group_correction_service.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('choices are exact level group course and hour tuples', () {
    final choices = poolGroupChoices({
      'niveaux': {
        '3*': {
          'courses_by_hour': {
            '2eme_heure': [
              {'id': 'first', 'order': 0, 'theme': 'Première'},
              {'id': 'second', 'order': 1, 'theme': 'Deuxième'},
            ]
          }
        },
        '2*': {'theme_2eme_heure': 'Ancien groupe'},
      }
    });
    expect(choices.length, 3);
    expect(choices[1].number, 2);
    expect(choices[1].courseId, 'second');
    expect(choices[1].label, '3★ · Groupe 2 · 2e heure · Deuxième');
    expect(choices.last.courseId, '2*_legacy');
  });
  test('expected state preserves assignment data and normalizes timestamps',
      () {
    final state = poolAssignmentState({
      'assignedLevel': '2*',
      'remarks': 'private unrelated note',
      'hoursReport': {
        '2eme_heure': {'at': Timestamp.fromMillisecondsSinceEpoch(1000)}
      }
    });
    expect(state['assignedLevel'], '2*');
    expect(state.containsKey('remarks'), false);
    expect(state['assignedCourseId'], null);
    expect(state['hoursReport']['2eme_heure']['at'], 1000);
  });
}
