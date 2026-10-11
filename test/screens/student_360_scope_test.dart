import 'package:calymob/models/formation_snapshot_doc.dart';
import 'package:calymob/models/member_profile.dart';
import 'package:calymob/models/mil_experience_overview.dart';
import 'package:calymob/models/pool_formation_snapshot_doc.dart';
import 'package:calymob/models/pool_student_history.dart';
import 'package:calymob/screens/formation/student_360_screen.dart';
import 'package:calymob/screens/exercises/member_exercises_screen.dart';
import 'package:calymob/screens/profile/who_is_who_screen.dart';
import 'package:calymob/utils/permission_helper.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('pool lesson history and retrospective note live in top pool tab',
      (tester) async {
    await _pump(tester, scope: FormationTrackingScope.full, history: [
      PoolStudentSession(
          id: 'old',
          date: DateTime(2025, 1, 7),
          location: 'Piscine',
          participation: 'training',
          lessons: const [
            PoolStudentLesson(
                level: '1*',
                group: '2',
                hour: '1ere_heure',
                theme: 'Apnée synthétique',
                monitorNames: ['Moniteur Test'])
          ]),
    ]);
    expect(find.text('Apnée synthétique'), findsNothing);
    expect(find.text('Ajouter une remarque piscine'), findsNothing);
    await tester.tap(find.text('Piscine').first);
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('Apnée synthétique'), findsOneWidget);
    expect(find.text('Encadrants : Moniteur Test'), findsOneWidget);
    expect(find.text('1* · Groupe 2 · 1re heure'), findsOneWidget);
    expect(find.text('Remontée assistée carrière'), findsNothing);
    expect(find.text('Ajouter une remarque piscine'), findsOneWidget);
    await tester.tap(find.text('Ajouter une remarque à cette séance'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Remarque · 07/01/2025'), findsOneWidget);
    await tester.tap(find.text('Annuler'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byType(AlertDialog), findsNothing);
  });
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

    await tester.tap(find.text('Expériences brevet'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));

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
  List<PoolStudentSession> history = const [],
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
        previewPoolHistory: history,
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
