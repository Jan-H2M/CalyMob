class DiveNumberResolution {
  final int? value;
  final bool conflict;

  const DiveNumberResolution({this.value, this.conflict = false});
}

/// Resolves what the client should write for a dive number.
///
/// Automatically suggested numbers are intentionally omitted on create so
/// the atomic Cloud Function remains the single allocator. A genuinely manual
/// value is preserved, including historical lower numbers, unless that exact
/// number is already in use.
DiveNumberResolution resolveDiveNumber({
  required int? typed,
  required bool isEditing,
  required bool isAutomaticSuggestion,
  required Set<int> usedNumbers,
}) {
  final positive = typed != null && typed > 0 ? typed : null;
  if (isEditing) return DiveNumberResolution(value: positive);
  if (positive == null || isAutomaticSuggestion) {
    return const DiveNumberResolution();
  }
  if (usedNumbers.contains(positive)) {
    return const DiveNumberResolution(conflict: true);
  }
  return DiveNumberResolution(value: positive);
}
