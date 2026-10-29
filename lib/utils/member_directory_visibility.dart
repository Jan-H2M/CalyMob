/// Explicit test/visibility flags, never a name or email heuristic.
bool excludedFromMemberDirectory(Map<String, dynamic> data) {
  final metadata = data['metadata'];
  return data['exclude_from_directory'] == true ||
      data['is_test_account'] == true ||
      data['isTestUser'] == true ||
      (metadata is Map && metadata['isTestUser'] == true);
}
