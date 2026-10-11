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

  testWidgets('compact summary opens details, switches brevet and dismisses', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
          home: Scaffold(body: MilRequirementsCard(overview: overview))),
    );

    expect(find.text('Expériences LIFRAS — Brevet 2*'), findsOneWidget);
    expect(find.text('Cumul carrière • v2026-test'), findsOneWidget);
    expect(find.text('8/20'), findsOneWidget);
    expect(find.text('Manque 12'), findsOneWidget);
    expect(find.text('Brevet 1*'), findsNothing);

    await tester.tap(find.byKey(const Key('mil-show-details')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('mil-details-sheet')), findsOneWidget);
    expect(find.text('Détails des expériences LIFRAS'), findsOneWidget);
    expect(find.text('Brevet 1*'), findsOneWidget);
    expect(find.text('Brevet 2*'), findsNWidgets(2));

    await tester.tap(find.byKey(const Key('mil-brevet-1')));
    await tester.pump();

    final sheet = find.byKey(const Key('mil-details-sheet'));
    expect(
      find.descendant(of: sheet, matching: find.text('3/3')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: sheet, matching: find.text('Atteint')),
      findsOneWidget,
    );

    await tester.tap(find.byKey(const Key('mil-close-details')));
    await tester.pumpAndSettle();

    expect(find.text('Expériences LIFRAS — Brevet 1*'), findsOneWidget);
    expect(find.text('3/3'), findsOneWidget);
    expect(find.byKey(const Key('mil-details-sheet')), findsNothing);
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

    expect(find.text('Cumul carrière • v2026-test'), findsOneWidget);
    expect(find.text('8/20'), findsOneWidget);
    expect(find.text('Voir les détails LIFRAS'), findsOneWidget);
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
    expect(find.text('Voir les détails LIFRAS'), findsNothing);
  });

  testWidgets('unknown categories prevent a false complete summary', (
    tester,
  ) async {
    const fallback = MilExperienceOverview(
      preferredBrevet: '2',
      snapshotFallback: true,
      byBrevet: {
        '2': MilBrevetExperience(
          brevetCode: '2',
          modulePct: 100,
          requirements: {
            'total_milieu_naturel': SnapshotMilRequirement(
              have: 25,
              need: 25,
              dataMissing: false,
            ),
            'encadrement': SnapshotMilRequirement(
              have: 0,
              need: 3,
              dataMissing: true,
            ),
          },
        ),
      },
    );
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(body: MilRequirementsCard(overview: fallback)),
      ),
    );

    expect(
      find.text('Dernier bilan disponible • cumul carrière'),
      findsOneWidget,
    );
    expect(find.text('1 exigence atteinte • 0 à compléter'), findsOneWidget);
    expect(
      find.text('1 exigence à vérifier faute de données'),
      findsOneWidget,
    );
    expect(find.textContaining('Toutes'), findsNothing);
  });
}
