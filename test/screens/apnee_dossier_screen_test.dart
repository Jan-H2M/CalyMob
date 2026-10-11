import 'package:calymob/screens/formation/apnee_dossier_screen.dart';
import 'package:calymob/services/apnee_training_service.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
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
    expect(find.text('1★ apnée · A1 / Discovery'), findsOneWidget);
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
