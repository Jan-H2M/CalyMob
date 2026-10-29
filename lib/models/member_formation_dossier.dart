import 'exercice_lifras.dart';
import 'exercice_valide.dart';
import 'formation_snapshot_doc.dart';
import 'mil_experience_overview.dart';
import 'personal_exercise_progress.dart';

/// An explicit administrative exam correction takes precedence over legacy rows.
Iterable<ExerciceValide> dossierExerciseResults(
    List<ExerciceValide> values, ExerciceLIFRAS exercise) {
  final matches = values
      .where(
          (v) => v.exerciceId == exercise.id || v.exerciceCode == exercise.code)
      .toList();
  final official = matches.where((v) => v.source == 'formation_admin').toList()
    ..sort((a, b) => (b.updatedAt ?? b.dateValidation)
        .compareTo(a.updatedAt ?? a.dateValidation));
  return official.isEmpty ? matches : [official.first];
}

NiveauLIFRAS? dossierTargetNiveau(
    {String? memberTarget, String? currentCode, String? snapshotTarget}) {
  final code = resolvePreferredMilBrevet(
      targetFormationLevel: memberTarget,
      currentCode: currentCode,
      snapshotTargetLevel: snapshotTarget);
  return NiveauLIFRASExtension.fromCode(code == '1' ? 'NB' : code);
}

String dossierTargetLabel(NiveauLIFRAS target) => switch (target) {
      NiveauLIFRAS.nb => '1*',
      NiveauLIFRAS.p2 => '2*',
      NiveauLIFRAS.p3 => '3*',
      NiveauLIFRAS.p4 => '4*',
      _ => target.code,
    };

/// Read-only view model. The catalogue/validation stream determines exercises;
/// the existing snapshot supplies goals and dive statistics, never new writes.
FormationSnapshotDoc memberDossierSnapshot(
    {required String memberId,
    required String currentCode,
    required NiveauLIFRAS? target,
    String? unresolvedTarget,
    required List<ExerciceLIFRAS> catalog,
    required List<ExerciceValide> validations,
    List<PersonalExerciseProgress> personalProgress = const [],
    bool useSnapshotValidations = false,
    FormationSnapshotDoc? source}) {
  final original = source ?? FormationSnapshotDoc.fromMap(memberId, {});
  final validated = <SnapshotExercise>[];
  final pending = <SnapshotExercise>[];
  final remaining = <SnapshotExercise>[];
  for (final exercise in catalog.where((e) => e.niveau == target)) {
    final matches = dossierExerciseResults(validations, exercise);
    final personal =
        personalProgress.where((p) => p.exerciseId == exercise.id && p.done);
    final isNatural =
        formationModalityForExercise(exercise.code, exercise.description) ==
            FormationModality.career;
    final personalDone = isNatural && personal.isNotEmpty;
    final officialOverride = matches.any((v) => v.source == 'formation_admin');
    final officiallyDone = matches.any((v) => v.isValidated);
    final row = SnapshotExercise(
        code: exercise.code,
        description: exercise.description,
        niveau: exercise.niveau.code,
        personal: personalDone && !officiallyDone,
        status: matches.isNotEmpty ? matches.first.status.name : null,
        date: officiallyDone
            ? matches.firstWhere((v) => v.isValidated).dateValidation
            : personalDone
                ? personal.first.date
                : matches.isNotEmpty
                    ? matches.first.dateValidation
                    : null);
    if (officiallyDone ||
        personalDone ||
        (useSnapshotValidations &&
            !officialOverride &&
            original.validated.any((v) => v.code == exercise.code))) {
      validated.add(row);
    } else if (!isNatural &&
        (matches.any((v) => v.isPending) ||
            (useSnapshotValidations &&
                original.pending.any((v) => v.code == exercise.code)))) {
      pending.add(row);
    } else {
      remaining.add(row);
    }
  }
  final targetLabel =
      target == null ? unresolvedTarget : dossierTargetLabel(target);
  final sameTarget = target != null &&
      dossierTargetNiveau(memberTarget: original.targetLevel) == target;
  return FormationSnapshotDoc(
      memberId: memberId,
      targetLevel: targetLabel,
      currentCode: currentCode,
      validated: validated,
      pending: pending,
      remaining: remaining,
      pendingClaims: original.pendingClaims
          .where((claim) =>
              catalog.any((e) => e.niveau == target && e.code == claim.code))
          .where((claim) =>
              formationModalityForExercise(claim.code, claim.label) !=
              FormationModality.career)
          .toList(),
      perCode: original.perCode,
      attentionPoints: original.attentionPoints,
      diveStats: original.diveStats,
      milPerRequirement: sameTarget ? original.milPerRequirement : {},
      milModulePct: sameTarget ? original.milModulePct : null,
      milCountingVersion: sameTarget ? original.milCountingVersion : null,
      brevetPct: original.brevetPct,
      formationPct: original.formationPct,
      goalCodes: original.goalCodes,
      goalNote: original.goalNote,
      recentDives: original.recentDives);
}
