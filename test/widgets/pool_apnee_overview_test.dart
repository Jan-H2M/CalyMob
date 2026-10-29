import 'dart:async';

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

  testWidgets('keeps one name lookup across parent rebuilds', (tester) async {
    final lessons = Stream.value([
      const PoolApneeLesson(
        track: 'apnee.a1',
        hour: '1ere_heure',
        theme: 'Statique',
        instructorIds: ['yves'],
        memberIds: ['jan'],
      ),
    ]);
    final pendingNames = Completer<Map<String, String>>();
    var calls = 0;
    Future<Map<String, String>> resolveNames(Set<String> ids) {
      calls += 1;
      return pendingNames.future;
    }

    Widget screen() => MaterialApp(
          home: PoolApneeOverview(
            lessons: lessons,
            resolveNames: resolveNames,
          ),
        );
    await tester.pumpWidget(screen());
    await tester.pump();
    expect(calls, 1);
    await tester.pumpWidget(screen());
    await tester.pump();
    expect(calls, 1);
    pendingNames.complete({'yves': 'Yves LEFLOT', 'jan': 'Jan ANDRIESSENS'});
    await tester.pumpAndSettle();
    expect(find.text('Élèves : Jan ANDRIESSENS'), findsOneWidget);
  });

  testWidgets('shows name lookup failures and retries the same roster',
      (tester) async {
    var calls = 0;
    await tester.pumpWidget(MaterialApp(
      home: PoolApneeOverview(
        lessons: Stream.value([
          const PoolApneeLesson(
            track: 'apnee.a1',
            hour: '1ere_heure',
            theme: '',
            instructorIds: ['yves'],
            memberIds: [],
          ),
        ]),
        resolveNames: (ids) async {
          calls += 1;
          if (calls == 1) throw StateError('synthetic directory error');
          return {'yves': 'Yves LEFLOT'};
        },
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Noms des participants indisponibles.'), findsOneWidget);
    expect(find.textContaining('Chargement'), findsNothing);
    await tester.tap(find.text('Réessayer'));
    await tester.pumpAndSettle();
    expect(calls, 2);
    expect(find.text('Encadrant : Yves LEFLOT'), findsOneWidget);
    expect(find.text('Noms des participants indisponibles.'), findsNothing);
  });

  testWidgets('replaces names when roster IDs change without stale identities',
      (tester) async {
    final controller = StreamController<List<PoolApneeLesson>>();
    final pendingNames = Completer<Map<String, String>>();
    final requestedIds = <Set<String>>[];
    await tester.pumpWidget(MaterialApp(
      home: PoolApneeOverview(
        lessons: controller.stream,
        resolveNames: (ids) {
          requestedIds.add({...ids});
          return ids.contains('jan')
              ? Future.value({'jan': 'Jan ANDRIESSENS'})
              : pendingNames.future;
        },
      ),
    ));
    PoolApneeLesson lesson(String id) => PoolApneeLesson(
          track: 'apnee.a1',
          hour: '1ere_heure',
          theme: '',
          instructorIds: const [],
          memberIds: [id],
        );
    controller.add([lesson('jan')]);
    await tester.pumpAndSettle();
    expect(find.text('Élèves : Jan ANDRIESSENS'), findsOneWidget);
    controller.add([lesson('maxime')]);
    await tester.pump();
    await tester.pump();
    expect(find.text('Élèves : Jan ANDRIESSENS'), findsNothing);
    pendingNames.complete({'maxime': 'Maxime ANDRIESSENS'});
    await tester.pumpAndSettle();
    expect(find.text('Élèves : Maxime ANDRIESSENS'), findsOneWidget);
    expect(requestedIds, [
      <String>{'jan'},
      <String>{'maxime'}
    ]);
    await tester.pumpWidget(const SizedBox.shrink());
    unawaited(controller.close());
    await tester.pump();
  });

  testWidgets('offers retry when name lookup never responds', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: PoolApneeOverview(
        lessons: Stream.value([
          const PoolApneeLesson(
            track: 'apnee.a2',
            hour: '2eme_heure',
            theme: '',
            instructorIds: [],
            memberIds: ['maxime'],
          ),
        ]),
        resolveNames: (ids) => Completer<Map<String, String>>().future,
      ),
    ));
    await tester.pump();
    await tester.pump(const Duration(seconds: 8));
    await tester.pump();
    expect(find.text('Noms des participants indisponibles.'), findsOneWidget);
    expect(find.text('Réessayer'), findsOneWidget);
    expect(find.textContaining('Chargement'), findsNothing);
  });
}
