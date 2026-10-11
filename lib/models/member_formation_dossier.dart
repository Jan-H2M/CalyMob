import 'exercice_lifras.dart';
import 'exercice_valide.dart';
import 'formation_snapshot_doc.dart';
import 'mil_experience_overview.dart';

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
    bool useSnapshotValidations = false,
    FormationSnapshotDoc? source}) {
  final original = source ?? FormationSnapshotDoc.fromMap(memberId, {});
  final validated = <SnapshotExercise>[];
  final pending = <SnapshotExercise>[];
  final remaining = <SnapshotExercise>[];
  for (final exercise in catalog.where((e) => e.niveau == target)) {
    final matches = validations.where(
        (v) => v.exerciceId == exercise.id || v.exerciceCode == exercise.code);
    final row = SnapshotExercise(
        code: exercise.code,
        description: exercise.description,
        niveau: exercise.niveau.code);
    if (matches.any((v) => v.isValidated) ||
        (useSnapshotValidations &&
            original.validated.any((v) => v.code == exercise.code))) {
      validated.add(row);
    } else if (matches.any((v) => v.isPending) ||
        (useSnapshotValidations &&
            original.pending.any((v) => v.code == exercise.code))) {
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
          .toList(),
      perCode: original.perCode,
      attentionPoints: original.attentionPoints,
      diveStats: original.diveStats,
      milPerRequirement: sameTarget ? original.milPerRequirement : {},
      milModulePct: sameTarget ? original.milModulePct : null,
      brevetPct: original.brevetPct,
      formationPct: original.formationPct,
      goalCodes: original.goalCodes,
      goalNote: original.goalNote,
      recentDives: original.recentDives);
}
