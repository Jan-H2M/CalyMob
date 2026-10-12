import 'package:calymob/screens/formation/apnee_formation_list.dart';
import 'package:calymob/services/apnee_training_service.dart';
import 'package:calymob/widgets/formation/formation_navigation.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('all enrollment routes use one cross-discipline revision', () {
    final rows = <ApneeRow>[
      {
        'member_id': 'student',
        'track': 'apnee.a1',
        'status': 'active',
        'revision': 3
      },
      {
        'member_id': 'student',
        'track': 'apnee.a2',
        'status': 'closed',
        'revision': 7
      }
    ];
    expect(
        apneeEnrollmentChange(rows, 'student', 'apnee.a2',
            toggle: true, expectedRevision: 11),
        {
          'memberId': 'student',
          'track': 'apnee.a2',
          'active': true,
          'expectedRevision': 11,
        });
    expect(
        apneeEnrollmentChange(rows, 'student', 'apnee.a1',
            toggle: true)['active'],
        false);
    expect(
        apneeEnrollmentChange(rows, 'student', 'apnee.a1', toggle: true)
            .containsKey('fromTrack'),
        false);
  });
  testWidgets('exactly two discipline buttons retain selection',
      (tester) async {
    bool selected = false;
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: StatefulBuilder(
                builder: (context, update) => FormationDisciplineSelector(
                    apnee: selected,
                    onChanged: (value) => update(() => selected = value))))));
    expect(find.byType(ChoiceChip), findsNWidgets(2));
    await tester.tap(find.text('Apnée'));
    await tester.pump();
    expect(selected, true);
  });
  testWidgets(
      'apnee uses a second level row, excludes hidden/inactive and moves target atomically',
      (tester) async {
    final db = FakeFirebaseFirestore();
    ApneeRow? saved;
    for (final row in <ApneeRow>[
      {
        'id': 'student',
        'formation_revision': 11,
        'prenom': 'Élève',
        'nom': 'Synthétique',
        'member_status': 'active'
      },
      {
        'id': 'other',
        'prenom': 'Autre',
        'nom': 'Synthétique',
        'member_status': 'active'
      },
      {'id': 'hidden', 'prenom': 'Hidden', 'is_test_account': true},
      {'id': 'inactive', 'prenom': 'Inactive', 'member_status': 'inactive'},
    ]) {
      await db.doc('clubs/qa/member_directory/${row['id']}').set(row);
    }
    await db.doc('clubs/qa/apnee_enrollments/a1').set({
      'member_id': 'student',
      'track': 'apnee.a1',
      'status': 'active',
      'revision': 3
    });
    final service = ApneeTrainingService(
        firestore: db,
        invoke: (payload) async {
          saved = payload;
        });
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: ApneeFormationList(
                clubId: 'qa', canEnroll: true, service: service))));
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    expect(find.textContaining('1★ apnée · A1'), findsOneWidget);
    expect(find.text('Élève Synthétique'), findsOneWidget);
    expect(find.text('Hidden'), findsNothing);
    expect(find.text('Inactive'), findsNothing);
    await tester.tap(find.textContaining('2★ apnée · A2'));
    await tester.pump();
    await tester.tap(find.textContaining('Autres membres'));
    await tester.pump();
    final tile = find.ancestor(
        of: find.text('Élève Synthétique'), matching: find.byType(ListTile));
    await tester
        .tap(find.descendant(of: tile, matching: find.byType(IconButton)));
    await tester.pump(const Duration(milliseconds: 50));
    expect(saved, containsPair('expectedRevision', 11));
    expect(saved, containsPair('active', true));
    expect(saved!.containsKey('target_formation_level'), false);
    expect(tester.takeException(), isNull);
  });
  testWidgets('ordinary monitor has no administrative enrollment writes',
      (tester) async {
    final db = FakeFirebaseFirestore();
    await db
        .doc('clubs/qa/member_directory/student')
        .set({'prenom': 'Élève', 'member_status': 'active'});
    await db
        .doc('clubs/qa/apnee_enrollments/a1')
        .set({'member_id': 'student', 'track': 'apnee.a1', 'status': 'active'});
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: ApneeFormationList(
                clubId: 'qa', service: ApneeTrainingService(firestore: db)))));
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    expect(tester.widget<IconButton>(find.byType(IconButton).first).onPressed,
        isNull);
    expect(
        tester
            .widget<DropdownButton<String>>(find.byType(DropdownButton<String>))
            .onChanged,
        isNull);
  });
}
