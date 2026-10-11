import 'package:calymob/models/formation_snapshot_doc.dart';
import 'package:calymob/models/mil_experience_overview.dart';
import 'package:calymob/screens/training/stats_screen.dart';
import 'package:calymob/widgets/formation/mil_requirements_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const overview = MilExperienceOverview(
    preferredBrevet: '2',
    sourceVersion: 'v2026-test',
    byBrevet: {
      '1': MilBrevetExperience(
        brevetCode: '1',
        modulePct: 100,
        requirements: {
          'mer': SnapshotMilRequirement(
            have: 3,
            need: 3,
            dataMissing: false,
          ),
        },
      ),
      '2': MilBrevetExperience(
        brevetCode: '2',
        modulePct: 40,
        requirements: {
          'total_milieu_naturel': SnapshotMilRequirement(
            have: 8,
            need: 20,
            dataMissing: false,
          ),
        },
      ),
    },
  );

  testWidgets(
      'target brevet is preselected and every configured brevet can be inspected',
      (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
          home: Scaffold(body: MilRequirementsCard(overview: overview))),
    );

    expect(find.text('Expériences LIFRAS — Brevet 2*'), findsOneWidget);
    expect(
        find.text('Cumul carrière • module 40 % • v2026-test'), findsOneWidget);
    expect(find.text('8/20'), findsOneWidget);
    expect(find.text('Manque 12'), findsOneWidget);

    await tester.tap(find.text('Brevet 1*'));
    await tester.pump();

    expect(find.text('Expériences LIFRAS — Brevet 1*'), findsOneWidget);
    expect(find.text('3/3'), findsOneWidget);
    expect(find.text('Atteint'), findsOneWidget);
  });

  testWidgets('personal Statistiques reuses the lifetime MIL presentation', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: StatsMilExperienceSection(
            overview: overview,
            loading: false,
          ),
        ),
      ),
    );

    expect(
        find.text('Cumul carrière • module 40 % • v2026-test'), findsOneWidget);
    expect(find.text('8/20'), findsOneWidget);
  });

  testWidgets('missing legacy data is unavailable, never zero requirements', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: MilRequirementsCard(
            overview: MilExperienceOverview(byBrevet: {}),
          ),
        ),
      ),
    );

    expect(
      find.text("Les données d'expérience ne sont pas encore disponibles."),
      findsOneWidget,
    );
    expect(find.textContaining("Aucune exigence d'expérience"), findsNothing);
  });
}
