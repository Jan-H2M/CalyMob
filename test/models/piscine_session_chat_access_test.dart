import 'package:calymob/models/piscine_session.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('mixed legacy and course instructors are unioned for chat access', () {
    final assignment = LevelAssignment.fromMap({
      'encadrants': [
        {
          'membre_id': 'legacy-only',
          'membre_nom': 'Legacy',
          'membre_prenom': 'Lina',
        },
        {
          'membre_id': 'both',
          'membre_nom': 'Old',
          'membre_prenom': 'Name',
        },
      ],
      'courses_by_hour': {
        '1ere_heure': [
          {
            'id': 'course-1',
            'encadrants': [
              {
                'membre_id': 'course-only',
                'membre_nom': 'Course',
                'membre_prenom': 'Chris',
              },
              {
                'membre_id': 'both',
                'membre_nom': 'Current',
                'membre_prenom': 'Name',
              },
            ],
          },
        ],
      },
    });

    expect(
      assignment.allEncadrants.map((member) => member.membreId).toSet(),
      {'legacy-only', 'course-only', 'both'},
    );
    expect(
      assignment.allEncadrants
          .singleWhere((member) => member.membreId == 'both')
          .membreNom,
      'Current',
    );
  });
}
