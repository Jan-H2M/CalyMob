import 'package:calymob/models/formation_snapshot_doc.dart';
import 'package:calymob/models/member_profile.dart';
import 'package:calymob/models/pool_formation_snapshot_doc.dart';
import 'package:calymob/screens/profile/who_is_who_screen.dart';
import 'package:calymob/utils/permission_helper.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets(
      'live canonical target suppresses old snapshot trajectory and counters',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: FormationListView(
      clubId: 'qa',
      searchQuery: '',
      scope: FormationTrackingScope.full,
      showTargetLevels: true,
      profilesLoader: (_) async => [
        MemberProfile(
            id: 'student',
            nom: 'Synthétique',
            prenom: 'Élève',
            email: '',
            memberStatus: 'active',
            plongeurCode: '1',
            targetFormationLevel: '3*',
            formationActive: true)
      ],
      snapshotsLoader: (_) async => [
        FormationSnapshotDoc.fromMap('student', {
          'target_level': '2*',
          'current_code': '1',
          'formation_pct': 88,
          'mil_experience': {'module_pct': 75},
          'attention_points': ['old target'],
        })
      ],
    ))));
    await tester.pumpAndSettle();
    expect(find.text('1 → 3*'), findsOneWidget);
    expect(find.textContaining('→ 2*'), findsNothing);
    expect(find.text('Progression en cours de recalcul'), findsNothing);
    expect(find.textContaining('88%'), findsNothing);
  });
  Widget subject({
    required FormationTrackingScope scope,
    Future<List<PoolFormationStudent>> Function(String)? poolStudentsLoader,
    Future<List<MemberProfile>> Function(String)? profilesLoader,
    Future<List<FormationSnapshotDoc>> Function(String)? snapshotsLoader,
  }) {
    return MaterialApp(
      home: Scaffold(
        backgroundColor: Colors.blueGrey,
        body: FormationListView(
          clubId: 'calypso',
          searchQuery: '',
          scope: scope,
          poolStudentsLoader: poolStudentsLoader,
          profilesLoader: profilesLoader,
          snapshotsLoader: snapshotsLoader,
        ),
      ),
    );
  }

  testWidgets('pool backend failure shows unavailable state and can retry',
      (tester) async {
    var calls = 0;

    await tester.pumpWidget(
      subject(
        scope: FormationTrackingScope.piscineOnly,
        poolStudentsLoader: (_) async {
          calls += 1;
          if (calls == 1) throw StateError('HTTP 404');
          return const [];
        },
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('formation-load-error')), findsOneWidget);
    expect(find.text('Suivi temporairement indisponible'), findsOneWidget);
    expect(find.text('Aucun élève en formation pour le moment.'), findsNothing);

    await tester.tap(find.byKey(const Key('formation-load-retry')));
    await tester.pumpAndSettle();

    expect(calls, 2);
    expect(find.byKey(const Key('formation-load-error')), findsNothing);
    expect(
      find.text('Aucun élève en formation pour le moment.'),
      findsOneWidget,
    );
  });

  testWidgets('Firestore failure is distinct from a genuine empty list',
      (tester) async {
    await tester.pumpWidget(
      subject(
        scope: FormationTrackingScope.full,
        profilesLoader: (_) async => throw StateError('permission-denied'),
        snapshotsLoader: (_) async => const [],
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('formation-load-error')), findsOneWidget);
    expect(find.text('Aucun élève en formation pour le moment.'), findsNothing);
  });
}
