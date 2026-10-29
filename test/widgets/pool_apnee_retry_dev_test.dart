import 'dart:async';
import 'package:calymob/widgets/piscine/pool_apnee_overview.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

const lesson = PoolApneeLesson(
    track: 'apnee.a1',
    hour: '1ere_heure',
    theme: 'Cours FICTIF',
    instructorIds: ['dev-instructor'],
    memberIds: ['dev-learner']);

void main() {
  testWidgets(
      'MOB-036 directory failure offers retry instead of permanent loading',
      (tester) async {
    var calls = 0;
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: PoolApneeOverview(
                lessons: Stream.value([lesson]),
                resolveNames: (_) async {
                  if (++calls == 1)
                    throw StateError('fictional-directory-failure');
                  return {
                    'dev-instructor': 'Moniteur FICTIF',
                    'dev-learner': 'Élève FICTIF'
                  };
                }))));
    await tester.pumpAndSettle();
    expect(find.text('Noms des participants indisponibles.'), findsOneWidget);
    expect(find.textContaining('Chargement'), findsNothing);
    await tester.tap(find.text('Réessayer'));
    await tester.pumpAndSettle();
    expect(find.text('Élèves : Élève FICTIF'), findsOneWidget);
    expect(calls, 2);
  });

  testWidgets(
      'MOB-036 unrelated rebuild does not restart pending identity lookup',
      (tester) async {
    final stream = Stream.value([lesson]);
    final names = Completer<Map<String, String>>();
    var calls = 0;
    Future<Map<String, String>> resolve(Set<String> _) {
      calls++;
      return names.future;
    }

    Widget screen() => MaterialApp(
        home: Scaffold(
            body: PoolApneeOverview(lessons: stream, resolveNames: resolve)));
    await tester.pumpWidget(screen());
    await tester.pump();
    await tester.pumpWidget(screen());
    await tester.pump();
    expect(calls, 1);
    names.complete(
        {'dev-instructor': 'Moniteur FICTIF', 'dev-learner': 'Élève FICTIF'});
    await tester.pumpAndSettle();
    expect(find.text('Élèves : Élève FICTIF'), findsOneWidget);
  });
}
