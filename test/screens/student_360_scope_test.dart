import 'package:calymob/models/formation_snapshot_doc.dart';
import 'package:calymob/models/member_profile.dart';
import 'package:calymob/models/mil_experience_overview.dart';
import 'package:calymob/models/pool_formation_snapshot_doc.dart';
import 'package:calymob/screens/formation/student_360_screen.dart';
import 'package:calymob/screens/exercises/member_exercises_screen.dart';
import 'package:calymob/screens/profile/who_is_who_screen.dart';
import 'package:calymob/utils/permission_helper.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('pool-only scope exposes only pool progress and observations', (
    tester,
  ) async {
    await _pump(tester, scope: FormationTrackingScope.piscineOnly);

    expect(find.text('Suivi piscine'), findsOneWidget);
    expect(find.text('Piscine'), findsOneWidget);
    expect(find.text('Observations piscine'), findsOneWidget);
    expect(find.text('Progression piscine'), findsOneWidget);
    expect(find.text('Validés'), findsOneWidget);
    expect(find.text('1'), findsNWidgets(3));
    expect(find.text('Expériences brevet'), findsNothing);
    expect(find.text('Remontée assistée carrière'), findsNothing);
    expect(find.text('Examen théorique'), findsNothing);
    expect(find.text('Total en milieu naturel'), findsNothing);
    expect(find.text('Ajouter une remarque piscine'), findsOneWidget);
    expect(find.text('Préparer la prochaine séance'), findsNothing);

    await tester.drag(find.byType(TabBarView), const Offset(-1200, 0));
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('Bonne maîtrise du vidage de masque.'), findsOneWidget);
    expect(
      find.text(
        'Observation carrière confidentielle.',
      ),
      findsNothing,
    );
  });

  testWidgets('full scope exposes canonical brevet experience have and need', (
    tester,
  ) async {
    await _pump(tester, scope: FormationTrackingScope.full);

    expect(find.text('Exercices'), findsWidgets);
    expect(find.text('Expériences brevet'), findsOneWidget);
    expect(find.text('Objectifs'), findsOneWidget);
    expect(find.text('Observations'), findsOneWidget);

    await tester.drag(find.byType(TabBarView), const Offset(-1200, 0));
    await tester.pump(const Duration(milliseconds: 400));

    expect(
      find.text('Expériences LIFRAS — Brevet 2*'),
      findsOneWidget,
    );
    expect(find.text('Total en milieu naturel'), findsOneWidget);
    expect(find.text('12/20'), findsOneWidget);
    expect(find.text('Manque 8'), findsOneWidget);
    expect(find.text('En mer'), findsOneWidget);
    expect(find.text('5/5'), findsOneWidget);
    expect(find.text('Atteint'), findsOneWidget);
    expect(find.text('Encadrement'), findsOneWidget);
    expect(find.text('Données manquantes • requis 3'), findsOneWidget);
    expect(find.text('Voir les détails LIFRAS'), findsNothing);
    expect(find.text('Brevet 3*'), findsNothing);
    expect(
      find.text('Répartition des plongées par profondeur'),
      findsOneWidget,
    );
  });

  testWidgets('full scope shows a retryable error when the snapshot read fails',
      (
    tester,
  ) async {
    var attempts = 0;
    await _pumpLive(
      tester,
      scope: FormationTrackingScope.full,
      snapshotLoader: () async {
        attempts += 1;
        if (attempts == 1) throw StateError('denied');
        return _snapshot();
      },
      milOverviewLoader: () async => _milOverview(),
      observationsLoader: () async => const [],
    );

    expect(find.text('Données de formation indisponibles.'), findsOneWidget);
    expect(find.text('Réessayer'), findsOneWidget);
    expect(
      find.textContaining('Aucune donnée de formation'),
      findsNothing,
    );

    await tester.tap(find.text('Réessayer'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(attempts, 2);
    expect(find.text('Données de formation indisponibles.'), findsNothing);
    expect(find.text('Expériences brevet'), findsOneWidget);
  });

  testWidgets('pool observation errors are not rendered as an empty list', (
    tester,
  ) async {
    var attempts = 0;
    await _pumpLive(
      tester,
      scope: FormationTrackingScope.piscineOnly,
      observationsLoader: () async {
        attempts += 1;
        if (attempts == 1) throw StateError('offline');
        return const [];
      },
    );

    expect(find.text('Données de formation indisponibles.'), findsOneWidget);
    expect(find.text('Aucune observation enregistrée.'), findsNothing);

    await tester.tap(find.text('Réessayer'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(attempts, 2);
    expect(find.text('Données de formation indisponibles.'), findsNothing);
    expect(find.text('Suivi piscine'), findsOneWidget);
  });

  testWidgets('saved pool remark is not reported as failed if refresh fails', (
    tester,
  ) async {
    var reads = 0;
    var writes = 0;
    await _pumpLive(
      tester,
      scope: FormationTrackingScope.piscineOnly,
      observationsLoader: () async {
        reads += 1;
        if (reads > 1) throw StateError('refresh unavailable');
        return const [];
      },
      poolRemarkWriter: (note) async {
        expect(note, 'Bonne séance');
        writes += 1;
      },
    );

    await tester.tap(find.text('Ajouter une remarque piscine'));
    await tester.pump();
    await tester.enterText(find.byType(TextField), 'Bonne séance');
    await tester.tap(find.text('Enregistrer'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(writes, 1);
    expect(
      find.text(
        'Remarque enregistrée, mais la liste n’a pas pu être actualisée.',
      ),
      findsOneWidget,
    );
    expect(
      find.text('La remarque n’a pas pu être enregistrée.'),
      findsNothing,
    );
  });

  test('pool observation boundary rejects non-pool records', () {
    expect(
      formationObservationVisible(FormationTrackingScope.piscineOnly, const {
        'contextType': 'piscine',
      }),
      isTrue,
    );
    expect(
      formationObservationVisible(FormationTrackingScope.piscineOnly, const {
        'contextType': 'exercice',
      }),
      isFalse,
    );
    expect(
      formationObservationVisible(FormationTrackingScope.full, const {
        'contextType': 'exercice',
      }),
      isTrue,
    );
  });

  test('the shared student list limits pool-only rows to pool progress', () {
    expect(formationListModalities(FormationTrackingScope.piscineOnly), const [
      FormationModality.pool,
    ]);
    expect(
      formationListModalities(FormationTrackingScope.full),
      FormationModality.values,
    );
  });

  testWidgets('own exercises reuses the canonical brevet requirements card', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: MemberFormationExperienceSection(
            snapshot: _snapshot(),
            loading: false,
          ),
        ),
      ),
    );

    expect(
      find.text('Expériences LIFRAS — Brevet 2*'),
      findsOneWidget,
    );
    expect(find.text('Total en milieu naturel'), findsOneWidget);
    expect(find.text('12/20'), findsOneWidget);
    expect(find.text('Manque 8'), findsOneWidget);
    expect(find.text('5/5'), findsNothing);

    final detailsButton = find.byKey(const Key('mil-show-details'));
    await tester.ensureVisible(detailsButton);
    await tester.tap(detailsButton);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('5/5'), findsOneWidget);
    expect(find.text('Atteint'), findsOneWidget);
  });
}

Future<void> _pump(
  WidgetTester tester, {
  required FormationTrackingScope scope,
}) async {
  tester.view.physicalSize = const Size(1200, 1800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    MaterialApp(
      home: Student360Screen(
        clubId: 'calypso',
        member: MemberProfile(
          id: 'student-1',
          nom: 'Martin',
          prenom: 'Alice',
          email: 'alice@example.invalid',
        ),
        scope: scope,
        previewMode: true,
        previewSnapshot:
            scope == FormationTrackingScope.full ? _snapshot() : null,
        previewMilOverview:
            scope == FormationTrackingScope.full ? _milOverview() : null,
        previewPoolSnapshot: scope == FormationTrackingScope.piscineOnly
            ? const PoolFormationSnapshotDoc(
                memberId: 'student-1',
                validated: 1,
                pending: 1,
                remaining: 1,
                pct: 33,
              )
            : null,
        previewObservations: const [
          {
            'contextType': 'piscine',
            'note': 'Bonne maîtrise du vidage de masque.',
          },
          {
            'contextType': 'exercice',
            'note': 'Observation carrière confidentielle.',
          },
        ],
      ),
    ),
  );
  await tester.pump();
}

Future<void> _pumpLive(
  WidgetTester tester, {
  required FormationTrackingScope scope,
  Future<FormationSnapshotDoc?> Function()? snapshotLoader,
  Future<MilExperienceOverview?> Function()? milOverviewLoader,
  required Future<List<Map<String, dynamic>>> Function() observationsLoader,
  Future<void> Function(String note)? poolRemarkWriter,
}) async {
  tester.view.physicalSize = const Size(1200, 1800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    MaterialApp(
      home: Student360Screen(
        clubId: 'calypso',
        member: MemberProfile(
          id: 'student-1',
          nom: 'Martin',
          prenom: 'Alice',
          email: 'alice@example.invalid',
        ),
        scope: scope,
        poolSnapshot: scope == FormationTrackingScope.piscineOnly
            ? const PoolFormationSnapshotDoc(
                memberId: 'student-1',
                validated: 1,
                pending: 1,
                remaining: 1,
                pct: 33,
              )
            : null,
        snapshotLoader: snapshotLoader,
        milOverviewLoader: milOverviewLoader,
        observationsLoader: observationsLoader,
        poolRemarkWriter: poolRemarkWriter,
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
}

MilExperienceOverview _milOverview() {
  return const MilExperienceOverview(
    preferredBrevet: '2',
    sourceVersion: 'test-v1',
    byBrevet: {
      '2': MilBrevetExperience(
        brevetCode: '2',
        modulePct: 61,
        requirements: {
          'total_milieu_naturel': SnapshotMilRequirement(
            have: 12,
            need: 20,
            dataMissing: false,
          ),
          'mer': SnapshotMilRequirement(
            have: 5,
            need: 5,
            dataMissing: false,
          ),
          'encadrement': SnapshotMilRequirement(
            have: 0,
            need: 3,
            dataMissing: true,
          ),
        },
      ),
      '3': MilBrevetExperience(
        brevetCode: '3',
        modulePct: 20,
        requirements: {
          'total_milieu_naturel': SnapshotMilRequirement(
            have: 12,
            need: 60,
            dataMissing: false,
          ),
        },
      ),
    },
  );
}

FormationSnapshotDoc _snapshot() {
  return const FormationSnapshotDoc(
    memberId: 'student-1',
    targetLevel: '2*',
    currentCode: '1*',
    validated: [
      SnapshotExercise(
        code: 'P1.EXP',
        description: 'Examen piscine',
        niveau: 'P2',
      ),
      SnapshotExercise(
        code: 'P2.RA',
        description: 'Remontée assistée carrière',
        niveau: 'P2',
      ),
    ],
    pending: [
      SnapshotExercise(
        code: 'P2.EXT',
        description: 'Examen théorique',
        niveau: 'P2',
      ),
    ],
    pendingClaims: [],
    remaining: [
      SnapshotExercise(
        code: 'P2.EXP',
        description: 'Technique piscine',
        niveau: 'P2',
      ),
    ],
    perCode: {},
    attentionPoints: ['P2.RA'],
    diveStats: SnapshotDiveStats(
      total: 12,
      mer: 5,
      nuit: 1,
      dp: 0,
      sf: 0,
      deco: 0,
      nitrox: 0,
      exo: 0,
      maree: 0,
      surveillance: 0,
      maxDepthMeters: 30,
      totalMinutes: 420,
      lastDiveDate: null,
      zones: {},
      thresholdsCum: {},
    ),
    milPerRequirement: {
      'total_milieu_naturel': SnapshotMilRequirement(
        have: 12,
        need: 20,
        dataMissing: false,
      ),
      'mer': SnapshotMilRequirement(have: 5, need: 5, dataMissing: false),
    },
    milModulePct: 61,
    brevetPct: {},
    formationPct: 50,
    goalCodes: [],
    goalNote: '',
    recentDives: [],
  );
}
