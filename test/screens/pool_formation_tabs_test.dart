import 'dart:convert';
import 'dart:io';
import 'package:calymob/models/formation_snapshot_doc.dart';
import 'package:calymob/models/member_profile.dart';
import 'package:calymob/screens/formation/student_360_screen.dart';
import 'package:calymob/services/apnee_training_service.dart';
import 'package:calymob/services/mil_protocol_reader.dart';
import 'package:calymob/utils/permission_helper.dart';
import 'package:calymob/widgets/formation/active_formation_panel.dart';
import 'package:calymob/widgets/formation/pool_brevet_protocols.dart';
import 'package:calymob/widgets/formation/pool_formation_tabs.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

List<MilProtocol> catalog() =>
    (jsonDecode(File('assets/mil/preview_protocols.json').readAsStringSync())[
            'records'] as List)
        .map((r) => MilProtocol.fromMap(Map<String, dynamic>.from(r)))
        .toList();

Future<void> frames(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  testWidgets(
      'live explicit goal wins over stale snapshot in header and pool protocols',
      (tester) async {
    for (final target in ['3*', 'UNKNOWN']) {
      await tester.pumpWidget(MaterialApp(
          home: Student360Screen(
        clubId: 'qa',
        member: MemberProfile(
            id: 'synthetic',
            nom: 'Test',
            prenom: 'Élève',
            email: '',
            formationActive: true,
            plongeurCode: '1',
            targetFormationLevel: target),
        scope: FormationTrackingScope.full,
        previewMode: true,
        previewSnapshot: FormationSnapshotDoc.fromMap(
            'synthetic', {'current_code': '1', 'target_level': '2*'}),
        poolProtocolCatalogLoader: () async => catalog(),
      )));
      await frames(tester);
      expect(find.text('1 → $target'), findsOneWidget);
      await tester.tap(find.widgetWithText(Tab, 'Piscine'));
      await frames(tester);
      await tester.tap(find.widgetWithText(Tab, 'Exercices'));
      await frames(tester);
      expect(find.text('P2.AD'), findsNothing);
      expect(
          find.text('P3.AD'), target == '3*' ? findsOneWidget : findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    }
  });

  testWidgets(
      'monitor and pupil use the same exercise rows and specialties, preserving own action and protocol',
      (tester) async {
    final sizes = <Size>[];
    var actions = 0;
    for (final own in [false, true]) {
      await tester.pumpWidget(MaterialApp(
          home: Student360Screen(
        clubId: 'qa',
        member: MemberProfile(
            id: 'synthetic',
            nom: 'Test',
            prenom: 'Élève',
            email: '',
            formationActive: true),
        scope: FormationTrackingScope.full,
        previewMode: true,
        isOwnProfile: own,
        exerciseAction: own
            ? (_) async {
                actions++;
              }
            : null,
        previewSnapshot: FormationSnapshotDoc.fromMap('synthetic', {
          'current_code': '2',
          'target_level': '3*',
          'exercises': {
            'remaining': [
              {
                'code': 'P3.RA',
                'description': 'Épreuve synthétique',
                'niveau': 'P3'
              }
            ]
          },
        }),
        providedSpecialties: FormationSnapshotDoc.fromMap('synthetic', {
          'target_level': 'TN',
          'exercises': {
            'remaining': [
              {
                'code': 'NTB.T',
                'description': 'Théorie spécialité',
                'niveau': 'TN'
              }
            ]
          },
        }),
        protocolLoader: (code, pool) async => MilProtocol(
            key: 'mn__$code',
            code: code,
            medium: 'mn',
            sectionId: 'synthetic',
            title: 'Protocole synthétique',
            body: 'Instruction de test',
            sourceUrl: 'https://synthetic.invalid',
            sourceVersion: 'QA',
            referenceUrls: const []),
      )));
      await frames(tester);
      expect(find.text('Élève Test'), findsOneWidget);
      expect(find.text('○ Restants (1)'), findsOneWidget);
      final row = find.byKey(const ValueKey('mil-protocol-mn-P3.RA'));
      sizes.add(tester.getSize(row));
      if (own) {
        await tester.tap(find.byTooltip('Suivi de l’exercice'));
        await frames(tester);
      }
      await tester.tap(find.text('P3.RA'));
      await frames(tester);
      expect(find.text('Protocole synthétique'), findsOneWidget);
      await tester.tap(find.byTooltip('Fermer le protocole'));
      await frames(tester);
      await tester.ensureVisible(find.widgetWithText(Tab, 'Spécialités'));
      await tester.tap(find.widgetWithText(Tab, 'Spécialités'));
      await frames(tester);
      expect(find.text('NTB.T'), findsOneWidget);
      expect(find.text('Protocoles MIL · Milieu naturel'), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    }
    expect(sizes[0], sizes[1]);
    expect(actions, 1);
  });
  test(
      '3-star pool list contains all seven P3 pool protocols, not natural exercises or other levels',
      () {
    final rows = poolProtocolsForBrevet(catalog(), '3*');
    expect(rows.length, 7);
    expect(
        rows.map((r) => r.code),
        containsAll(
            ['P3.AD', 'P3.AI', 'P3.4P', 'P3.CO', 'P3.DR', 'P3.ET', 'P3.SAU']));
    expect(rows.every((r) => r.medium == 'pool'), isTrue);
    expect(poolProtocolsForBrevet(catalog(), 'UNKNOWN'), isEmpty);
    expect(poolProtocolsForBrevet(catalog(), 'P2').length, 9);
    expect(poolProtocolsForBrevet(catalog(), 'AM').single.code, 'AM.REA');
    expect(poolProtocolsForBrevet(catalog(), 'MC'),
        isEmpty); // no guessed mapping for uncoded sections
  });

  testWidgets(
      'pool tabs fit narrow screens and remove an active Apnee tab safely',
      (tester) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    Widget subject(bool apnee) => MaterialApp(
            home: Scaffold(
                body: PoolFormationTabs(
          sessions: const Text('Présences'),
          exercises: const Text('Protocoles P3'),
          apnee: apnee ? const Text('Dossier A1') : null,
        )));
    await tester.pumpWidget(subject(true));
    await tester.tap(find.widgetWithText(Tab, 'Apnée'));
    await frames(tester);
    expect(find.text('Dossier A1'), findsOneWidget);
    await tester.pumpWidget(subject(false));
    await frames(tester);
    expect(find.widgetWithText(Tab, 'Apnée'), findsNothing);
    expect(find.text('Présences'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'enrollment scope removes the top switch and hides Apnee when enrollment closes',
      (tester) async {
    final db = FakeFirebaseFirestore();
    await db
        .doc('clubs/qa/member_directory/student')
        .set({'formation_active': true});
    await db
        .doc('clubs/qa/apnee_enrollments/a1')
        .set({'member_id': 'student', 'track': 'apnee.a1', 'status': 'active'});
    final service = ApneeTrainingService(firestore: db);
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: ActiveFormationPanel(
      clubId: 'qa',
      memberId: 'student',
      fallbackScubaActive: true,
      service: service,
      embedApneeInPool: true,
      apnee: (_) => const Text('Dossier A1'),
      scuba: (context) => PoolFormationTabs(
          sessions: const Text('Présences'),
          exercises: const Text('Protocoles P3'),
          apnee: FormationPoolContext.maybeOf(context)?.apnee),
    ))));
    await frames(tester);
    expect(find.text('Plongée'), findsNothing);
    expect(find.widgetWithText(Tab, 'Apnée'), findsOneWidget);
    await tester.tap(find.widgetWithText(Tab, 'Apnée'));
    await frames(tester);
    await db.doc('clubs/qa/apnee_enrollments/a1').update({'status': 'closed'});
    await frames(tester);
    expect(find.widgetWithText(Tab, 'Apnée'), findsNothing);
    expect(find.text('Dossier A1'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'monitor and pupil dossiers share pool tabs and exact protocol popup',
      (tester) async {
    for (final own in [false, true]) {
      await tester.pumpWidget(MaterialApp(
          home: Student360Screen(
        clubId: 'qa',
        member: MemberProfile(
            id: 'synthetic',
            nom: 'Test',
            prenom: 'Élève',
            email: '',
            formationActive: true),
        scope: FormationTrackingScope.full,
        previewMode: true,
        isOwnProfile: own,
        previewSnapshot: FormationSnapshotDoc.fromMap(
            'synthetic', {'current_code': '2', 'target_level': '3*'}),
        poolProtocolCatalogLoader: () async => catalog(),
      )));
      await frames(tester);
      expect(find.text('Plongée'), findsNothing);
      expect(find.widgetWithText(Tab, 'Examens & brevet'), findsNothing);
      await tester.tap(find.widgetWithText(Tab, 'Piscine'));
      await frames(tester);
      expect(find.widgetWithText(Tab, 'Séances'), findsOneWidget);
      expect(find.widgetWithText(Tab, 'Exercices'), findsOneWidget);
      expect(find.widgetWithText(Tab, 'Apnée'), findsNothing);
      await tester.tap(find.widgetWithText(Tab, 'Exercices'));
      await frames(tester);
      expect(find.text('P3.AD'), findsOneWidget);
      expect(find.text('P2.AD'), findsNothing);
      await tester.tap(find.text('P3.AD'));
      await frames(tester);
      expect(find.text('P3.AD · Piscine'), findsOneWidget);
      await tester.tap(find.byTooltip('Fermer le protocole'));
      await frames(tester);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    }
  });
}
