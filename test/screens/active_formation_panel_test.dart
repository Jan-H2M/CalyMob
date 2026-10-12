import 'package:calymob/services/apnee_training_service.dart';
import 'package:calymob/widgets/formation/active_formation_panel.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Future<FakeFirebaseFirestore> fixture(
      {bool scuba = false, bool apnee = true}) async {
    final db = FakeFirebaseFirestore();
    await db
        .doc('clubs/qa/member_directory/student')
        .set({'formation_active': scuba, 'plongeur_code': '4'});
    if (apnee)
      await db.doc('clubs/qa/apnee_enrollments/a1').set(
          {'member_id': 'student', 'track': 'apnee.a1', 'status': 'active'});
    return db;
  }

  Widget subject(FakeFirebaseFirestore db,
          {String memberId = 'student', ApneeTrainingService? service}) =>
      MaterialApp(
          home: Scaffold(
              body: ActiveFormationPanel(
        clubId: 'qa',
        memberId: memberId,
        fallbackScubaActive: true,
        service: service ?? ApneeTrainingService(firestore: db),
        scuba: (_) => const Text('Ancien snapshot 4 → AM'),
        apnee: (_) => const Text('Formation A1'),
      )));
  Future<void> settle(WidgetTester tester) async {
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  testWidgets(
      'live A1 enrollment overrides old 4-star AM snapshot and stale profile',
      (tester) async {
    await tester.pumpWidget(subject(await fixture()));
    await settle(tester);
    expect(find.text('Formation A1'), findsOneWidget);
    expect(find.text('Ancien snapshot 4 → AM'), findsNothing);
    await tester.tap(find.text('Plongée'));
    await settle(tester);
    expect(find.textContaining('Historique plongée'), findsOneWidget);
    expect(find.text('Ancien snapshot 4 → AM'), findsOneWidget);
  });
  testWidgets(
      'live enrollment change selects apnee without re-opening the fiche',
      (tester) async {
    final db = await fixture(scuba: true, apnee: false);
    await tester.pumpWidget(subject(db));
    await settle(tester);
    expect(find.text('Ancien snapshot 4 → AM'), findsOneWidget);
    final batch = db.batch();
    batch.update(db.doc('clubs/qa/member_directory/student'),
        {'formation_active': false});
    batch.set(db.doc('clubs/qa/apnee_enrollments/a1'),
        {'member_id': 'student', 'track': 'apnee.a1', 'status': 'active'});
    await batch.commit();
    await settle(tester);
    expect(find.text('Formation A1'), findsOneWidget);
    expect(find.text('Ancien snapshot 4 → AM'), findsNothing);
  });
  testWidgets('legacy double enrollment never silently chooses a discipline',
      (tester) async {
    await tester.pumpWidget(subject(await fixture(scuba: true)));
    await settle(tester);
    expect(
        find.textContaining('Plusieurs inscriptions actives'), findsOneWidget);
    expect(find.text('Ancien snapshot 4 → AM'), findsNothing);
    expect(find.text('Formation A1'), findsNothing);
  });
  testWidgets(
      'no active training is labeled history, not a newly inferred AM goal',
      (tester) async {
    await tester.pumpWidget(subject(await fixture(apnee: false)));
    await settle(tester);
    expect(find.textContaining('Aucune formation active'), findsOneWidget);
    expect(find.text('Apnée'), findsNothing);
  });
  testWidgets('scuba-only learners have no apnee tab or content',
      (tester) async {
    await tester.pumpWidget(subject(await fixture(scuba: true, apnee: false)));
    await settle(tester);
    expect(find.text('Apnée'), findsNothing);
    expect(find.text('Formation A1'), findsNothing);
  });
  testWidgets('past apnee stays accessible with a symmetric historical label',
      (tester) async {
    final db = await fixture(scuba: true);
    await db.doc('clubs/qa/apnee_enrollments/a1').update({'status': 'closed'});
    await tester.pumpWidget(subject(db));
    await settle(tester);
    await tester.tap(find.text('Apnée'));
    await settle(tester);
    expect(find.text('Historique apnée · Formation actuelle : Plongée'),
        findsOneWidget);
  });
  testWidgets(
      'identity switch clears manual selection and watches the new learner',
      (tester) async {
    final db = await fixture();
    final service = ApneeTrainingService(firestore: db);
    await db
        .doc('clubs/qa/member_directory/other')
        .set({'formation_active': true});
    await tester.pumpWidget(subject(db, service: service));
    await settle(tester);
    await tester.tap(find.text('Apnée'));
    await settle(tester);
    await tester.pumpWidget(subject(db, memberId: 'other', service: service));
    await settle(tester);
    expect(find.text('Formation A1'), findsNothing);
    expect(find.text('Apnée'), findsNothing);
    expect(find.text('Ancien snapshot 4 → AM'), findsOneWidget);
  });
  testWidgets(
      'personal apnee shortcut stays hidden until the member has an enrollment',
      (tester) async {
    final db = await fixture(apnee: false);
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: ApneeEnrollmentVisibility(
                clubId: 'qa',
                memberId: 'student',
                service: ApneeTrainingService(firestore: db),
                child: const Text('Mon parcours apnée')))));
    await settle(tester);
    expect(find.text('Mon parcours apnée'), findsNothing);
    await db
        .doc('clubs/qa/apnee_enrollments/a1')
        .set({'member_id': 'student', 'track': 'apnee.a1', 'status': 'active'});
    await settle(tester);
    expect(find.text('Mon parcours apnée'), findsOneWidget);
  });
}
