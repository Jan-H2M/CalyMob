import 'package:calymob/screens/formation/apnee_dossier_screen.dart';
import 'package:calymob/services/apnee_training_service.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets(
      'embedded apnee dossier has no level selector and shows active enrollment only',
      (tester) async {
    await tester.runAsync(ApneeTrainingService.catalog);
    final db = FakeFirebaseFirestore();
    await db
        .doc('clubs/qa/apnee_enrollments/enrol')
        .set({'member_id': 'student', 'track': 'apnee.a1', 'status': 'active'});
    await db
        .doc('clubs/qa/apnee_enrollments/old')
        .set({'member_id': 'student', 'track': 'apnee.a2', 'status': 'closed'});
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: ApneeDossierScreen(
      clubId: 'qa',
      memberId: 'student',
      memberName: 'Élève synthétique',
      embedded: true,
      service: ApneeTrainingService(firestore: db),
    ))));
    for (var i = 0; i < 6; i++) {
      await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 20)));
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.text('1★ apnée · A1 / Discovery'), findsOneWidget);
    expect(find.text('2★ apnée · A2'), findsNothing);
    expect(find.byType(SegmentedButton<String>), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
      'dated participation popup saves attendance and note, never official results',
      (tester) async {
    ApneeRow? saved;
    final service = ApneeTrainingService(
        firestore: FakeFirebaseFirestore(),
        invoke: (payload) async {
          saved = payload;
        });
    await tester.pumpWidget(MaterialApp(
        home: Builder(
            builder: (context) => Scaffold(
                body: TextButton(
                    child: const Text('Modifier'),
                    onPressed: () => editApneeParticipation(
                        context,
                        'qa',
                        {
                          'member_id': 'student',
                          'session_id': 'synthetic',
                          'course_id': 'a1',
                          'revision': 4,
                          'session_date':
                              Timestamp.fromDate(DateTime(2026, 1, 6)),
                          'participation_status': 'rostered',
                        },
                        service))))));
    await tester.tap(find.text('Modifier'));
    await tester.pump(const Duration(seconds: 1));
    await tester.enterText(find.byType(TextField), 'Remarque synthétique');
    expect(
        tester
            .widget<FilledButton>(
                find.widgetWithText(FilledButton, 'Enregistrer'))
            .onPressed,
        isNull);
    await tester.tap(find.byType(DropdownButton<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('A participé').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Enregistrer'));
    await tester.pump(const Duration(seconds: 1));
    expect(saved, containsPair('action', 'attendance'));
    expect(saved, containsPair('status', 'attended'));
    expect(saved, containsPair('note', 'Remarque synthétique'));
    expect(saved, containsPair('expectedRevision', 4));
    expect(saved, containsPair('sessionId', 'synthetic'));
    expect(saved!.containsKey('requirementKey'), false);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
      'own apnee dossier works without a SCUBA brevet and displays sourced cards',
      (tester) async {
    final catalog = await tester.runAsync(ApneeTrainingService.catalog);
    final db = FakeFirebaseFirestore();
    await db
        .doc('clubs/qa/apnee_enrollments/enrol')
        .set({'member_id': 'student', 'track': 'apnee.a1', 'status': 'active'});
    await tester.pumpWidget(MaterialApp(
        home: ApneeDossierScreen(
            clubId: 'qa',
            memberId: 'student',
            memberName: 'Élève synthétique',
            service: ApneeTrainingService(firestore: db))));
    for (var i = 0; i < 6; i++) {
      await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 20)));
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.text('1★ apnée · A1 / Discovery'), findsNWidgets(2));
    expect(find.textContaining('Théorie  · Validation ○'), findsOneWidget);
    expect(find.textContaining('0/0'), findsNothing);
    expect(tester.takeException(), isNull);
    final firstPool = (catalog!['requirements'] as List)
        .cast<ApneeRow>()
        .firstWhere((r) => r['track'] == 'apnee.a1' && r['setting'] == 'pool');
    await tester.ensureVisible(find.text(firstPool['labelFr']));
    await tester.tap(find.text(firstPool['labelFr']));
    await tester.pump(const Duration(seconds: 1));
    expect(find.textContaining('pas un protocole complet'), findsOneWidget);
    expect(find.textContaining('page '), findsWidgets);
  });
  testWidgets('pool-only dossier hides depth, theory and official award',
      (tester) async {
    await tester.runAsync(ApneeTrainingService.catalog);
    final db = FakeFirebaseFirestore();
    await db
        .doc('clubs/qa/apnee_enrollments/enrol')
        .set({'member_id': 'student', 'track': 'apnee.a2', 'status': 'active'});
    await tester.pumpWidget(MaterialApp(
        home: ApneeDossierScreen(
            clubId: 'qa',
            memberId: 'student',
            memberName: 'Élève synthétique',
            poolOnly: true,
            service: ApneeTrainingService(firestore: db))));
    for (var i = 0; i < 6; i++) {
      await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 20)));
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.text('Piscine'), findsOneWidget);
    expect(find.text('Profondeur'), findsNothing);
    expect(find.text('Théorie'), findsNothing);
    expect(find.text('Brevet apnée officiel'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
