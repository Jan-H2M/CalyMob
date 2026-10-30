import 'package:calymob/models/formation_snapshot_doc.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('exam status ignores training and keeps current exam validations', () {
    final snapshot = _snapshot(
      targetLevel: '3*',
      validated: const [
        SnapshotExercise(code: 'P2.EXT', description: 'Ancien examen'),
        SnapshotExercise(code: 'P3.EXT', description: 'Examen théorique'),
        SnapshotExercise(code: 'P3.POOL', description: 'Exercice piscine'),
      ],
      pendingClaims: const [
        SnapshotClaim(
            code: 'P3.EXP', label: 'Examen piscine', status: 'submitted'),
      ],
      remaining: const [
        SnapshotExercise(code: 'P3.EXP', description: 'Examen piscine'),
      ],
    );
    final exams = snapshot.examProgress;
    expect(exams[FormationModality.theory]?.validated, 1);
    expect(exams[FormationModality.theory]?.total, 1);
    expect(exams[FormationModality.pool]?.validated, 0);
    expect(exams[FormationModality.pool]?.pending, 1);
    expect(exams[FormationModality.pool]?.total, 1);
  });
  test('classifies production LIFRAS exam codes by modality', () {
    expect(
      formationModalityForExercise('P2.EXT', 'Examen théorique'),
      FormationModality.theory,
    );
    expect(
      formationModalityForExercise('P1.EXP', 'Examen piscine'),
      FormationModality.pool,
    );
    expect(
      formationModalityForExercise('P2.RA', 'Remontée assistée 20 m'),
      FormationModality.career,
    );
    expect(
      formationModalityForExercise('NTB.T', 'Nitrox Base Theorie'),
      FormationModality.theory,
    );
  });

  test('reports validated pending and remaining progress without duplicates', () {
    final snapshot = _snapshot(
      validated: const [
        SnapshotExercise(
          code: 'P2.RA',
          description: 'Remontée assistée',
          niveau: 'P2',
        ),
        SnapshotExercise(
          code: 'P1.EXP',
          description: 'Examen piscine',
          niveau: 'P2',
        ),
      ],
      pendingClaims: const [
        SnapshotClaim(
          code: 'P2.EXT',
          label: 'Examen théorique',
          status: 'submitted',
        ),
      ],
      remaining: const [
        SnapshotExercise(code: 'P2.RA', description: 'Remontée assistée'),
        SnapshotExercise(code: 'P2.RT', description: 'Remontée technique'),
      ],
    );

    final progress = snapshot.modalityProgress;
    expect(progress[FormationModality.career]?.validated, 1);
    expect(progress[FormationModality.career]?.remaining, 1);
    expect(progress[FormationModality.career]?.total, 2);
    expect(progress[FormationModality.pool]?.validated, 1);
    expect(progress[FormationModality.pool]?.total, 1);
    expect(progress[FormationModality.theory]?.pending, 1);
    expect(progress[FormationModality.theory]?.total, 1);
  });

  test('excludes historical exercises from earlier target levels', () {
    final snapshot = _snapshot(
      targetLevel: '3*',
      validated: const [
        SnapshotExercise(
          code: 'P2.EXT',
          description: 'Ancien examen théorique',
          niveau: 'P2',
        ),
        SnapshotExercise(
          code: 'P3.EXT',
          description: 'Examen théorique actuel',
          niveau: 'P3',
        ),
        SnapshotExercise(
          code: 'P2.RA',
          description: 'Ancienne remontée',
          niveau: 'P2',
        ),
      ],
      remaining: const [
        SnapshotExercise(code: 'P3.RA', description: 'Remontée actuelle'),
      ],
    );

    final progress = snapshot.modalityProgress;
    expect(progress[FormationModality.theory]?.validated, 1);
    expect(progress[FormationModality.theory]?.total, 1);
    expect(progress[FormationModality.career]?.validated, 0);
    expect(progress[FormationModality.career]?.remaining, 1);
  });
}

FormationSnapshotDoc _snapshot({
  String targetLevel = '2*',
  List<SnapshotExercise> validated = const [],
  List<SnapshotExercise> pending = const [],
  List<SnapshotClaim> pendingClaims = const [],
  List<SnapshotExercise> remaining = const [],
}) {
  return FormationSnapshotDoc(
    memberId: 'member-1',
    targetLevel: targetLevel,
    currentCode: 'P1',
    validated: validated,
    pending: pending,
    pendingClaims: pendingClaims,
    remaining: remaining,
    perCode: const {},
    attentionPoints: const [],
    diveStats: const SnapshotDiveStats(
      total: 0,
      mer: 0,
      nuit: 0,
      dp: 0,
      sf: 0,
      deco: 0,
      nitrox: 0,
      exo: 0,
      maree: 0,
      surveillance: 0,
      maxDepthMeters: null,
      totalMinutes: 0,
      lastDiveDate: null,
      zones: {},
      thresholdsCum: {},
    ),
    milPerRequirement: const {},
    milModulePct: null,
    brevetPct: const {},
    formationPct: 0,
    goalCodes: const [],
    goalNote: '',
    recentDives: const [],
  );
}
