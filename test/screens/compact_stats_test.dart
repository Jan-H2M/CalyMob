import 'package:calymob/models/formation_snapshot_doc.dart';
import 'package:calymob/models/mil_experience_overview.dart';
import 'package:calymob/screens/training/stats_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';

void main() {
  testWidgets('acquired brevet reference retains the full inline list',
      (tester) async {
    const data = MilExperienceOverview(preferredBrevet: '4', byBrevet: {
      '4': MilBrevetExperience(brevetCode: '4', modulePct: 100, requirements: {
        'total_milieu_naturel':
            SnapshotMilRequirement(have: 437, need: 100, dataMissing: false),
        'mer': SnapshotMilRequirement(have: 294, need: 30, dataMissing: false),
      }),
      'AM': MilBrevetExperience(brevetCode: 'AM', modulePct: 0, requirements: {
        'total_milieu_naturel':
            SnapshotMilRequirement(have: 0, need: 150, dataMissing: false),
      }),
    });
    await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
            body: StatsMilExperienceSection(
                overview: data, loading: false, hasActiveTraining: false))));
    expect(find.text('Brevet plongée acquis · référence informative'),
        findsOneWidget);
    expect(find.text('437/100'), findsOneWidget);
    expect(find.text('294/30'), findsOneWidget);
    expect(find.text('0/150'), findsNothing);
    expect(find.text('Voir les détails LIFRAS'), findsNothing);
  });
  test('hidden own profile without a directory still reads fresh metadata',
      () async {
    final db = FakeFirebaseFirestore();
    final doc = db.doc('clubs/calypso/members/hidden-self');
    await doc.set({'formation_active': false, 'plongeur_code': 'MC'});
    final goal = await StatsTrainingGoal.load(db, 'calypso', 'hidden-self');
    expect(goal.active, false);
    expect(goal.brevet, 'MC');
    await doc
        .update({'formation_active': true, 'target_formation_level': 'MF'});
    expect((await StatsTrainingGoal.load(db, 'calypso', 'hidden-self')).brevet,
        'MF');
  });
  test('opening stats rereads the changed directory instead of login cache',
      () async {
    final db = FakeFirebaseFirestore();
    final doc = db.doc('clubs/calypso/member_directory/pupil');
    await doc.set({'formation_active': true, 'plongeur_code': '2*'});
    expect(
        (await StatsTrainingGoal.load(db, 'calypso', 'pupil',
                snapshotTargetLevel: '2*'))
            .brevet,
        '3');
    await doc.update({'target_formation_level': '4*'});
    expect(
        (await StatsTrainingGoal.load(db, 'calypso', 'pupil',
                snapshotTargetLevel: '2*'))
            .brevet,
        '4');
    await doc.update({'formation_active': false});
    final apneeOnly = await StatsTrainingGoal.load(db, 'calypso', 'pupil',
        snapshotTargetLevel: '2*');
    expect(apneeOnly.active, false);
    expect(apneeOnly.brevet, '2');
  });
  test('stats uses live target and never reactivates historical SCUBA', () {
    expect(
        statsTargetBrevet(
            formationActive: false,
            currentCode: 'NB',
            snapshotTargetLevel: 'AM'),
        isNull);
    expect(
        statsTargetBrevet(
            formationActive: true,
            currentCode: '2*',
            snapshotTargetLevel: '2*'),
        '3');
    expect(
        statsTargetBrevet(
            formationActive: true,
            currentCode: '2*',
            targetFormationLevel: '4*',
            snapshotTargetLevel: '2*'),
        '4');
    expect(
        statsTargetBrevet(
            formationActive: true,
            currentCode: '2*',
            targetFormationLevel: 'UNKNOWN',
            snapshotTargetLevel: '2*'),
        'UNKNOWN');
    expect(
        statsTargetBrevet(
            formationActive: false,
            currentCode: '4*',
            snapshotTargetLevel: 'AM'),
        '4');
  });

  testWidgets('all compact target requirements are inline at 320px',
      (tester) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    const overview = MilExperienceOverview(preferredBrevet: '3', byBrevet: {
      '2': MilBrevetExperience(brevetCode: '2', modulePct: 100, requirements: {
        'prof_20m':
            SnapshotMilRequirement(have: 50, need: 10, dataMissing: false)
      }),
      '3': MilBrevetExperience(brevetCode: '3', modulePct: 99, requirements: {
        'total_milieu_naturel':
            SnapshotMilRequirement(have: 85, need: 75, dataMissing: false),
        'nuit': SnapshotMilRequirement(have: 4, need: 5, dataMissing: false),
        'encadrement':
            SnapshotMilRequirement(have: 0, need: 5, dataMissing: true),
      }),
    });
    await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
            body: StatsMilExperienceSection(
                overview: overview, loading: false))));
    expect(find.text('Expériences LIFRAS — Brevet 3*'), findsOneWidget);
    expect(find.text('85/75'), findsOneWidget);
    expect(find.text('4/5'), findsOneWidget);
    expect(find.text('Manque 1'), findsOneWidget);
    expect(find.text('—/5'), findsOneWidget);
    expect(find.text('Données manquantes'), findsOneWidget);
    expect(find.text('50/10'), findsNothing);
    expect(find.text('Voir les détails LIFRAS'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('inactive training does not show a guessed brevet',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
            body: StatsMilExperienceSection(
                overview: null, loading: false, hasActiveTraining: false))));
    expect(find.text('Aucun brevet plongée en préparation.'), findsOneWidget);
    expect(find.textContaining('Expériences LIFRAS'), findsNothing);
  });

  testWidgets('compact summary preserves KPIs and excludes pool from dives',
      (tester) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: StatsSummary(entries: [
      {
        'depth_max_meters': 30,
        'duration_minutes': 60,
        'counters': {'mer': true}
      },
      {'depth_max_meters': 20, 'duration_minutes': 60},
      {'source': 'piscine', 'depth_max_meters': 100, 'duration_minutes': 999},
    ]))));
    expect(find.text('2'), findsOneWidget);
    expect(find.text('1'), findsOneWidget);
    expect(find.text('2 h'), findsOneWidget);
    expect(find.text('30 m'), findsOneWidget);
    expect(find.text('1 séance piscine'), findsOneWidget);
    expect(
        tester.getSize(find.byKey(const Key('stats-compact-summary'))).height,
        lessThan(95));
    expect(tester.takeException(), isNull);
  });
}
