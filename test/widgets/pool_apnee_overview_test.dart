import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/widgets/piscine/pool_apnee_overview.dart';

void main() {
  test('parses the separate planned roster without attendance fields', () {
    final lesson = PoolApneeLesson.fromMap({
      'track': 'apnee.a1',
      'hour': '1ere_heure',
      'theme': 'Statique',
      'instructor_ids': ['yves'],
      'member_ids': ['jan'],
    });
    expect(lesson.instructorIds, ['yves']);
    expect(lesson.memberIds, ['jan']);
    expect(lesson.theme, 'Statique');
  });

  testWidgets('shows scheduled apnée lessons without inferring QR status', (
    tester,
  ) async {
    final lesson = PoolApneeLesson.fromMap({
      'track': 'apnee.a1',
      'hour': '1ere_heure',
      'theme': 'Statique',
      'instructor_ids': ['yves'],
      'member_ids': ['jan'],
    });
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: PoolApneeOverview(
              lessons: Stream.value([lesson]),
              resolveNames: (ids) async => {
                'yves': 'Yves LEFLOT',
                'jan': 'Jan ANDRIESSENS',
              },
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Apnée'), findsOneWidget);
    expect(find.text('1★ apnée · A1 / Discovery · 20h15'), findsOneWidget);
    expect(find.text('Encadrant : Yves LEFLOT'), findsOneWidget);
    expect(find.text('Élèves : Jan ANDRIESSENS'), findsOneWidget);
    expect(
      find.text('Roster du cours · présence à vérifier séparément'),
      findsOneWidget,
    );
  });

  testWidgets('does not add an empty apnée block', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: PoolApneeOverview(
          lessons: Stream.value(const []),
          resolveNames: (ids) async => const {},
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Apnée'), findsNothing);
  });
}
