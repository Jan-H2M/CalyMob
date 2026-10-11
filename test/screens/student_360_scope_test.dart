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
  testWidgets('compact pool card keeps actions side by side on a narrow phone',
      (tester) async {
    await _pump(tester,
        scope: FormationTrackingScope.full,
        size: const Size(320, 1000),
        snapshot: FormationSnapshotDoc.fromMap('student-1', {
          'target_level': '3*',
          'current_code': '2',
        }),
        history: [
          PoolStudentSession(
              id: 'compact',
              date: DateTime(2026, 10, 6),
              location: 'Piscine',
              participation: 'training',
              lessons: const [
                PoolStudentLesson(
                    level: '3*',
                    group: '1',
                    hour: '2eme_heure',
                    theme: 'Remontée assistée au gilet',
                    monitorNames: ['Moniteur Test']),
              ]),
        ]);
    await tester.ensureVisible(find.widgetWithText(Tab, 'Piscine'));
    await tester.tap(find.widgetWithText(Tab, 'Piscine'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(tester.takeException(), isNull);
    expect(find.text('Formation 3★ · 1 séance rapportée'), findsOneWidget);
    expect(find.textContaining('présences enregistrées'), findsNothing);
    expect(find.textContaining('Une présence ou un groupe attribué'),
        findsNothing);
    final actions = find.byKey(const Key('pool-session-actions-compact'));
    final remark = find.descendant(
        of: actions, matching: find.widgetWithText(OutlinedButton, 'Remarque'));
    final group = find.descendant(
        of: actions, matching: find.widgetWithText(OutlinedButton, 'Groupe'));
    expect(tester.getCenter(remark).dy, closeTo(tester.getCenter(group).dy, 1));
    expect(tester.getSize(remark).height, greaterThanOrEqualTo(48));
    expect(
        find.byTooltip('Ajouter une remarque à cette séance'), findsOneWidget);
    expect(
        find.byTooltip('Modifier le groupe de cette séance'), findsOneWidget);
    final card = find
        .ancestor(
            of: find.text('06/10/2026 · Piscine'),
            matching: find.byType(Container))
        .first;
    expect(tester.getSize(card).height, lessThan(230));
    await tester.tap(remark);
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Remarque · 06/10/2026'), findsOneWidget);
    await tester.tap(find.text('Annuler'));
    await tester.pump(const Duration(milliseconds: 400));
  });

  testWidgets('pool-only remarks require a dated session', (tester) async {
    await _pump(tester, scope: FormationTrackingScope.piscineOnly, history: [
      PoolStudentSession(
          id: 'dated',
          date: DateTime(2026, 10, 6),
          location: 'Piscine',
          lessons: const [],
          participation: ''),
      const PoolStudentSession(
          id: 'undated',
          date: null,
          hasLessonDate: false,
          location: 'Piscine',
          lessons: [],
          participation: ''),
    ]);
    expect(find.text('Ajouter une remarque piscine'), findsNothing);
    expect(find.text('Groupe'), findsNothing);
    final buttons = find.widgetWithText(OutlinedButton, 'Remarque');
    expect(buttons, findsNWidgets(2));
    final values = tester.widgetList<OutlinedButton>(buttons).toList();
    expect(values[0].onPressed, isNotNull);
    expect(values[1].onPressed, isNull);
    await tester.tap(buttons.first);
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Remarque · 06/10/2026'), findsOneWidget);
    await tester.tap(find.text('Annuler'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byType(AlertDialog), findsNothing);
  });

  testWidgets('full monitor can correct only a dated pool group',
      (tester) async {
    await _pump(tester, scope: FormationTrackingScope.full, history: [
      PoolStudentSession(
          id: 'dated',
          date: DateTime(2026, 10, 6),
          location: 'Piscine',
          lessons: const [],
          participation: ''),
      const PoolStudentSession(
          id: 'undated',
          date: null,
          hasLessonDate: false,
          location: 'Piscine',
          lessons: [],
          participation: ''),
    ]);
    await tester.tap(find.widgetWithText(Tab, 'Piscine'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    final buttons = find.widgetWithText(OutlinedButton, 'Groupe');
    expect(buttons, findsNWidgets(2));
    final values = tester.widgetList<OutlinedButton>(buttons).toList();
    expect(values[0].onPressed, isNotNull);
    expect(values[1].onPressed, isNull);
  });

  testWidgets('compact complete exams and experience use green checks',
      (tester) async {
    await _pump(tester,
        scope: FormationTrackingScope.full,
        snapshot: FormationSnapshotDoc.fromMap('student-1', {
          'target_level': '2*',
          'current_code': '1',
          'exercises': {
            'validated': [
              {'code': 'P2.RA'},
              {'code': 'P2.EXT'},
              {'code': 'P1.EXP'},
            ],
          },
          'mil_experience': {
            'per_requirement': {
              'total': {'have': 25, 'need': 25},
            },
          },
        }));
    expect(find.text('1/1'), findsOneWidget);
    expect(find.byIcon(Icons.check), findsNWidgets(3));
    for (final icon in tester.widgetList<Icon>(find.byIcon(Icons.check))) {
      expect(icon.color, Colors.greenAccent);
    }
    expect(find.byIcon(Icons.close), findsNothing);
    await tester.tap(find.byTooltip('Examen théorique : réalisé'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Examen théorique : réalisé'), findsOneWidget);
  });

  testWidgets('brevet header separates completed trials exams and experience',
      (tester) async {
    final snapshot = FormationSnapshotDoc.fromMap('student-1', {
      'target_level': '3*',
      'current_code': '2',
      'exercises': {
        'validated': [
          for (final code in ['P3.DP1', 'P3.DP2', 'P3.RA'])
            {'code': code, 'description': 'Épreuve synthétique'},
          {'code': 'P3.EXT', 'description': 'Examen théorique'},
        ],
        'pending_claims': [
          {'code': 'P3.EXP', 'label': 'Examen piscine'},
        ],
        'remaining': [
          for (final code in ['P3.RS', 'P3.SF1', 'P3.SF2'])
            {'code': code, 'description': 'Épreuve synthétique'},
          {'code': 'P3.EXP', 'description': 'Examen piscine'},
        ],
      },
      'mil_experience': {
        'module_pct': 100,
        'per_requirement': {
          'total_milieu_naturel': {'have': 75, 'need': 75},
          'mer': {'have': 0, 'need': 20, 'data_missing': true},
        },
      },
    });
    await _pump(tester, scope: FormationTrackingScope.full, snapshot: snapshot);
    expect(find.text('3/6'), findsOneWidget);
    expect(find.byTooltip('Épreuves en milieu naturel : 3 sur 6 réalisées'),
        findsOneWidget);
    expect(find.byTooltip('Examen théorique : réalisé'), findsOneWidget);
    expect(find.byTooltip('Examen piscine : en attente de validation'),
        findsOneWidget);
    expect(find.byIcon(Icons.check), findsOneWidget);
    expect(find.byIcon(Icons.hourglass_top), findsOneWidget);
    expect(find.byIcon(Icons.help_outline), findsOneWidget);
    expect(find.byIcon(Icons.close), findsNothing);
    expect(find.text('Expériences comptabilisées'), findsNothing);
    expect(find.text('Plongées'), findsNothing);
    expect(find.text('Progression par volet'), findsNothing);
  });

  testWidgets('brevet header fits a narrow phone and keeps unknowns honest',
      (tester) async {
    await _pump(tester,
        scope: FormationTrackingScope.full,
        size: const Size(320, 640),
        snapshot: FormationSnapshotDoc.fromMap('student-1', {
          'target_level': '2*',
          'current_code': '1',
        }));
    expect(tester.takeException(), isNull);
    expect(find.byIcon(Icons.help_outline), findsNWidgets(3));
    expect(find.byIcon(Icons.check), findsNothing);
    final strip = find.byKey(const Key('brevet-status-strip'));
    expect(tester.getSize(strip).height, lessThan(40));
    final labels = ['Épreuves', 'Théorie', 'Piscine', 'Exp.'];
    final y = tester.getCenter(find.text(labels.first)).dy;
    for (final label in labels.skip(1)) {
      final center = tester
          .getCenter(find.descendant(of: strip, matching: find.text(label)));
      expect(center.dy, closeTo(y, 1));
      expect(center.dx, lessThan(320));
    }
  });

  testWidgets('natural exercises omit the redundant modality summary',
      (tester) async {
    await _pump(tester, scope: FormationTrackingScope.full);

    expect(find.text('Progression par volet'), findsNothing);
    expect(find.text('Préparer la prochaine séance'), findsNothing);
    expect(find.text('Exercices en milieu naturel et théorie'), findsOneWidget);
    expect(find.text('Remontée assistée carrière'), findsOneWidget);
    expect(find.text('Examen théorique'), findsOneWidget);
    expect(find.text('Expériences brevet'), findsOneWidget);
  });

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
    await tester.tap(find.widgetWithText(Tab, 'Piscine'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('Apnée synthétique'), findsOneWidget);
    expect(find.text('Encadrants : Moniteur Test'), findsOneWidget);
    expect(find.text('Formation 1★ · Groupe 2 · 1re heure'), findsOneWidget);
    expect(find.text('Remontée assistée carrière'), findsNothing);
    expect(find.text('Ajouter une remarque piscine'), findsNothing);
    await tester.tap(find.text('Remarque'));
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
    expect(find.text('Ajouter une remarque piscine'), findsNothing);
    expect(find.text('Préparer la prochaine séance'), findsNothing);

    await tester.drag(find.byType(TabBarView), const Offset(-1200, 0));
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('Bonne maîtrise du vidage de masque.'), findsOneWidget);
    expect(find.text('Ajouter une remarque piscine'), findsNothing);
    expect(find.text('Ajouter une observation'), findsNothing);
    expect(
      find.text(
        'Observation carrière confidentielle.',
      ),
      findsNothing,
    );
  });
  testWidgets('monitor can open an observation directly from observations tab',
      (tester) async {
    await _pump(tester, scope: FormationTrackingScope.full);
    await tester.tap(find.text('Observations'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('Ajouter une observation'), findsOneWidget);
    await tester.tap(find.text('Ajouter une observation'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byType(AlertDialog), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'Observation synthétique');
    await tester.tap(find.text('Annuler'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byType(AlertDialog), findsNothing);
  });

  testWidgets('full scope exposes canonical brevet experience have and need', (
    tester,
  ) async {
    await _pump(tester, scope: FormationTrackingScope.full);

    expect(find.text('Épreuves'), findsOneWidget);
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
  FormationSnapshotDoc? snapshot,
  Size size = const Size(1200, 1800),
}) async {
  tester.view.physicalSize = size;
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
        previewSnapshot: scope == FormationTrackingScope.full
            ? snapshot ?? _snapshot()
            : null,
        previewMilOverview: scope == FormationTrackingScope.full
            ? snapshot == null
                ? _milOverview()
                : MilExperienceOverview.fromSnapshot(snapshot)
            : null,
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
