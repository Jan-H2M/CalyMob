/// Registration data may contain LIFRAS document IDs as well as exercise codes.
/// Never show opaque Firestore IDs as if they were meaningful exercise labels.
class RequestedExerciseResolution {
  final List<String> codes;
  final int unresolvedCount;

  const RequestedExerciseResolution(this.codes, this.unresolvedCount);
}

RequestedExerciseResolution resolveRequestedExercises(
  Iterable<String> values,
  Map<String, String> codesByDocumentId,
) {
  final codes = <String>[];
  var unresolved = 0;
  for (final value in values) {
    final trimmed = value.trim();
    final code = codesByDocumentId[trimmed] ?? trimmed;
    if (!RegExp(r'^[A-Z]{1,4}[0-9]?\.[A-Z0-9]+$').hasMatch(code)) {
      unresolved++;
      continue;
    }
    if (!codes.contains(code)) codes.add(code);
  }
  return RequestedExerciseResolution(codes, unresolved);
}
