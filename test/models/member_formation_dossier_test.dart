import 'package:calymob/models/exercice_lifras.dart';
import 'package:calymob/models/exercice_valide.dart';
import 'package:calymob/models/formation_snapshot_doc.dart';
import 'package:calymob/models/member_formation_dossier.dart';
import 'package:calymob/models/personal_exercise_progress.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('failed, pending and absent exam data retain distinct status and date',
      () {
    final dossier = memberDossierSnapshot(
        memberId: 'synthetic',
        currentCode: '2',
        target: NiveauLIFRAS.p3,
        catalog: [
          _exercise('P3.EXT'),
          _exercise('P3.EXP'),
          _exercise('P3.T')
        ],
        validations: [
          _validation('P3.EXT', ExerciceValideStatus.refused),
          _validation('P3.EXP', ExerciceValideStatus.pending)
        ]);
    final failed = dossier.remaining.firstWhere((e) => e.code == 'P3.EXT');
    expect(failed.status, 'refused');
    expect(failed.date, DateTime(2026, 10, 1));
    expect(
        dossier.remaining.firstWhere((e) => e.code == 'P3.T').status, isNull);
    expect(dossier.pending.single.status, 'pending');
    expect(dossier.examProgress[FormationModality.theory]!.refused, 1);
    expect(dossier.examProgress[FormationModality.theory]!.remaining, 2);
  });
  test(
      'same personal counts for member and monitor, never exams or another target',
      () {
    final dossier = memberDossierSnapshot(
        memberId: 'synthetic',
        currentCode: '2',
        target: NiveauLIFRAS.p3,
        catalog: [
          _exercise('P3.RA'),
          _exercise('P3.EXT'),
          _exercise('P3.EXP')
        ],
        validations: [],
        personalProgress: [
          PersonalExerciseProgress(
              exerciseId: 'P3.RA',
              done: true,
              revision: 1,
              date: DateTime(2026, 10, 1)),
          const PersonalExerciseProgress(
              exerciseId: 'P3.EXT', done: true, revision: 1),
          const PersonalExerciseProgress(
              exerciseId: 'P3.EXP', done: true, revision: 1),
          const PersonalExerciseProgress(
              exerciseId: 'P2.RA', done: true, revision: 1),
        ]);
    expect(dossier.validated.map((e) => e.code), ['P3.RA']);
    expect(dossier.validated.single.personal, true);
    expect(dossier.modalityProgress[FormationModality.career]!.validated, 1);
    expect(dossier.examProgress[FormationModality.theory]!.validated, 0);
    expect(dossier.examProgress[FormationModality.pool]!.validated, 0);
  });
  test(
      'personal unchecked does not erase historical official results; old requests are not done',
      () {
    final dossier = memberDossierSnapshot(
        memberId: 'synthetic',
        currentCode: '2',
        target: NiveauLIFRAS.p3,
        catalog: [
          _exercise('P3.RA'),
          _exercise('P3.RT')
        ],
        validations: [
          _validation('P3.RA', ExerciceValideStatus.validated),
          _validation('P3.RT', ExerciceValideStatus.pending)
        ],
        personalProgress: [
          const PersonalExerciseProgress(
              exerciseId: 'P3.RA', done: false, revision: 2)
        ]);
    expect(dossier.validated.map((e) => e.code), ['P3.RA']);
    expect(dossier.validated.single.personal, false);
    expect(dossier.remaining.map((e) => e.code), ['P3.RT']);
    expect(dossier.pending, isEmpty);
  });
  test(
      'explicit official failed exam overrides an older successful row and stale snapshot',
      () {
    final result = ExerciceValide(
        id: 'official',
        exerciceId: 'P3.EXT',
        exerciceCode: 'P3.EXT',
        exerciceDescription: 'Theory',
        exerciceNiveau: NiveauLIFRAS.p3,
        status: ExerciceValideStatus.refused,
        dateValidation: DateTime(2026, 10, 2),
        moniteurNom: 'Admin',
        createdBy: 'synthetic',
        source: 'formation_admin');
    final dossier = memberDossierSnapshot(
        memberId: 'synthetic',
        currentCode: '2',
        target: NiveauLIFRAS.p3,
        catalog: [_exercise('P3.EXT')],
        validations: [
          _validation('P3.EXT', ExerciceValideStatus.validated),
          result
        ],
        useSnapshotValidations: true,
        source: FormationSnapshotDoc.fromMap('synthetic', {
          'target_level': '3*',
          'exercises': {
            'validated': [
              {'code': 'P3.EXT'}
            ]
          },
        }));
    expect(dossier.validated, isEmpty);
    expect(dossier.remaining.single.code, 'P3.EXT');
  });
  test('explicit goal wins, otherwise uses the same next brevet as MIL', () {
    expect(dossierTargetNiveau(currentCode: 'MC'), NiveauLIFRAS.mf);
    expect(dossierTargetNiveau(currentCode: 'MC', memberTarget: 'MC'),
        NiveauLIFRAS.mc);
    expect(dossierTargetNiveau(currentCode: 'NB'), NiveauLIFRAS.nb);
    expect(dossierTargetNiveau(currentCode: '1', memberTarget: '3*'),
        NiveauLIFRAS.p3);
    expect(dossierTargetNiveau(currentCode: 'MC', memberTarget: 'UNKNOWN'),
        isNull);
  });

  test('reconciles all modalities and statuses without counting specialties',
      () {
    final catalog = [
      _exercise('P3.RA'),
      _exercise('P3.EXT'),
      _exercise('P3.EXP'),
      ExerciceLIFRAS(
          id: 'TN.N',
          code: 'TN.N',
          niveau: NiveauLIFRAS.tn,
          description: 'Nitrox'),
    ];
    final dossier = memberDossierSnapshot(
        memberId: 'synthetic',
        currentCode: '2',
        target: NiveauLIFRAS.p3,
        catalog: catalog,
        validations: [
          _validation('P3.RA', ExerciceValideStatus.pending),
          _validation('P3.RA', ExerciceValideStatus.validated),
          _validation('P3.EXT', ExerciceValideStatus.pending),
          _validation('TN.N', ExerciceValideStatus.validated),
        ]);
    expect(dossier.targetLevel, '3*');
    expect(dossier.validated.map((e) => e.code), ['P3.RA']);
    expect(dossier.pending.map((e) => e.code), ['P3.EXT']);
    expect(dossier.remaining.map((e) => e.code), ['P3.EXP']);
    expect(dossier.modalityProgress[FormationModality.career]!.validated, 1);
    expect(dossier.examProgress[FormationModality.theory]!.pending, 1);
  });

  test('old snapshot requirements cannot be presented as the new goal', () {
    final source = FormationSnapshotDoc.fromMap('synthetic', {
      'target_level': '2*',
      'goals': {'note': 'Objectif conservé'},
      'mil_experience': {
        'per_requirement': {
          'total': {'have': 25, 'need': 25}
        },
        'module_pct': 100,
      },
    });
    expect(source.goalNote, 'Objectif conservé');
    expect(source.milPerRequirement, isNotEmpty);
    expect(source.milModulePct, 100);
    final dossier = memberDossierSnapshot(
        memberId: 'synthetic',
        currentCode: '2',
        target: NiveauLIFRAS.p3,
        catalog: [_exercise('P3.RA')],
        validations: [],
        source: source);
    expect(dossier.targetLevel, '3*');
    expect(dossier.milPerRequirement, isEmpty);
    expect(dossier.milModulePct, isNull);
    expect(dossier.goalNote, source.goalNote);
  });

  test('monitor rebases snapshot statuses on the new goal catalogue', () {
    final source = FormationSnapshotDoc.fromMap('synthetic', {
      'target_level': '2*',
      'current_code': '2',
      'exercises': {
        'validated': [
          {'code': 'P2.RA', 'niveau': 'P2'},
          {'code': 'P3.RA', 'niveau': 'P3'},
        ]
      },
    });
    expect(source.validated.length, 2);
    final dossier = memberDossierSnapshot(
        memberId: 'synthetic',
        currentCode: '2',
        target: NiveauLIFRAS.p3,
        catalog: [_exercise('P3.RA'), _exercise('P3.EXT')],
        validations: [],
        source: source,
        useSnapshotValidations: true);
    expect(dossier.targetLevel, '3*');
    expect(dossier.validated.map((e) => e.code), ['P3.RA']);
    expect(dossier.remaining.map((e) => e.code), ['P3.EXT']);
  });
}

ExerciceLIFRAS _exercise(String code) => ExerciceLIFRAS(
    id: code, code: code, niveau: NiveauLIFRAS.p3, description: code);
ExerciceValide _validation(String code, ExerciceValideStatus status) =>
    ExerciceValide(
        id: '$code-${status.name}',
        exerciceId: code,
        exerciceCode: code,
        exerciceDescription: code,
        exerciceNiveau: NiveauLIFRAS.p3,
        status: status,
        dateValidation: DateTime(2026, 10, 1),
        moniteurNom: 'Test',
        createdBy: 'synthetic');
