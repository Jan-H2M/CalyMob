import 'package:calymob/models/formation_snapshot_doc.dart';
import 'package:calymob/models/member_profile.dart';
import 'package:calymob/models/pool_formation_snapshot_doc.dart';
import 'package:calymob/screens/profile/who_is_who_screen.dart';
import 'package:calymob/utils/permission_helper.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

MemberProfile profile(String id, String first, {String level = 'P2'}) =>
    MemberProfile(
      id: id,
      prenom: first,
      nom: 'QA',
      email: '',
      plongeurCode: level,
    );

FormationSnapshotDoc snapshot(
  String id, {
  int attention = 0,
  int pending = 0,
  int goals = 0,
}) =>
    FormationSnapshotDoc.fromMap(id, {
      'current_code': 'P2',
      'attention_points': List.generate(attention, (i) => 'P3.A$i'),
      'exercises': {
        'pending_claims': List.generate(
          pending,
          (i) => {'code': 'P3.C$i', 'status': 'submitted'},
        ),
      },
      'goals': {'codes': List.generate(goals, (i) => 'P3.G$i')},
    });

Widget subject({
  FormationTrackingScope scope = FormationTrackingScope.full,
  String query = '',
  String? level,
  List<MemberProfile> profiles = const [],
  List<FormationSnapshotDoc> snapshots = const [],
  List<PoolFormationStudent> poolStudents = const [],
}) =>
    MaterialApp(
      home: Scaffold(
        body: FormationListView(
          clubId: 'synthetic-club',
          searchQuery: query,
          filterLevel: level,
          scope: scope,
          profilesLoader: (_) async {
            if (scope == FormationTrackingScope.piscineOnly) {
              throw StateError('Pool-only must not load full profiles');
            }
            return profiles;
          },
          snapshotsLoader: (_) async {
            if (scope == FormationTrackingScope.piscineOnly) {
              throw StateError('Pool-only must not load full snapshots');
            }
            return snapshots;
          },
          poolStudentsLoader: (_) async => poolStudents,
        ),
      ),
    );

void before(WidgetTester tester, String first, String second) {
  expect(
    tester.getTopLeft(find.text('$first QA')).dy,
    lessThan(tester.getTopLeft(find.text('$second QA')).dy),
  );
}

void main() {
  for (final signal in ['attention', 'pending', 'goals']) {
    testWidgets('$signal badges put their student before unflagged students',
        (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(subject(
        profiles: [profile('quiet', 'Aaron'), profile('flagged', 'Zoe')],
        snapshots: [
          snapshot('quiet'),
          snapshot('flagged',
              attention: signal == 'attention' ? 5 : 0,
              pending: signal == 'pending' ? 5 : 0,
              goals: signal == 'goals' ? 5 : 0),
        ],
      ));
      await tester.pumpAndSettle();
      before(tester, 'Zoe', 'Aaron');
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('keeps alphabetical order inside both priority groups',
      (tester) async {
    tester.view.physicalSize = const Size(500, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(subject(
      profiles: [
        profile('quiet-z', 'Zoe'),
        profile('alert-z', 'Yves'),
        profile('quiet-a', 'Aaron'),
        profile('alert-a', 'Bert'),
      ],
      snapshots: [
        snapshot('quiet-z'),
        snapshot('alert-z', attention: 5),
        snapshot('quiet-a'),
        snapshot('alert-a', pending: 1),
      ],
    ));
    await tester.pumpAndSettle();
    before(tester, 'Bert', 'Yves');
    before(tester, 'Yves', 'Aaron');
    before(tester, 'Aaron', 'Zoe');
    expect(tester.takeException(), isNull);
  });

  testWidgets('search and level filters still limit the prioritized list',
      (tester) async {
    await tester.pumpWidget(subject(
      query: 'Bert',
      level: 'P2',
      profiles: [
        profile('other', 'Aaron'),
        profile('selected', 'Bert'),
        profile('wrong-level', 'Bert', level: 'P3'),
      ],
      snapshots: [
        snapshot('other', attention: 5),
        snapshot('selected'),
        snapshot('wrong-level', attention: 5),
      ],
    ));
    await tester.pumpAndSettle();
    expect(find.text('Bert QA'), findsOneWidget);
    expect(find.text('Aaron QA'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('pool pending students come first without full-data reads',
      (tester) async {
    PoolFormationStudent student(String id, String first, int pending) =>
        PoolFormationStudent(
          profile: profile(id, first),
          snapshot: PoolFormationSnapshotDoc(
            memberId: id,
            validated: 0,
            pending: pending,
            remaining: 1,
            pct: 0,
          ),
        );
    await tester.pumpWidget(subject(
      scope: FormationTrackingScope.piscineOnly,
      poolStudents: [student('quiet', 'Aaron', 0), student('alert', 'Zoe', 5)],
    ));
    await tester.pumpAndSettle();
    before(tester, 'Zoe', 'Aaron');
    expect(find.byKey(const Key('formation-load-error')), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
