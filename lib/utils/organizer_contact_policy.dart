/// Returns whether a directory profile is consistent with the organiser name
/// stored on an event.
///
/// The organiser id is the lookup key for contact details, while older events
/// may contain a separately edited organiser name. Contact details must fail
/// closed when those two identity hints disagree. Short legacy labels such as
/// "Juan" and reordered names remain compatible with the full directory name.
bool organizerNameMatchesProfile({
  required String? storedOrganizerName,
  required String? profileName,
}) {
  final profileTokens = _nameTokens(profileName);
  if (profileTokens.isEmpty) return false;

  if (storedOrganizerName == null || storedOrganizerName.trim().isEmpty) {
    return true;
  }
  final storedTokens = _nameTokens(storedOrganizerName);
  if (storedTokens.isEmpty) return false;

  return _isSubset(storedTokens, profileTokens) ||
      _isSubset(profileTokens, storedTokens);
}

/// Contact details from the public directory remain opt-in at the display
/// boundary, even if a stale legacy projection still contains a phone number.
bool canDisplayOrganizerPhone({
  required bool sharePhone,
  required String? phoneNumber,
}) =>
    sharePhone && (phoneNumber?.trim().isNotEmpty ?? false);

bool _isSubset(Set<String> candidate, Set<String> source) =>
    candidate.isNotEmpty && candidate.every(source.contains);

Set<String> _nameTokens(String? value) {
  if (value == null) return const <String>{};

  var normalized = value.toLowerCase();
  const replacements = <String, String>{
    'à': 'a',
    'á': 'a',
    'â': 'a',
    'ä': 'a',
    'ã': 'a',
    'å': 'a',
    'æ': 'ae',
    'ç': 'c',
    'è': 'e',
    'é': 'e',
    'ê': 'e',
    'ë': 'e',
    'ì': 'i',
    'í': 'i',
    'î': 'i',
    'ï': 'i',
    'ñ': 'n',
    'ò': 'o',
    'ó': 'o',
    'ô': 'o',
    'ö': 'o',
    'õ': 'o',
    'œ': 'oe',
    'ù': 'u',
    'ú': 'u',
    'û': 'u',
    'ü': 'u',
    'ý': 'y',
    'ÿ': 'y',
  };
  for (final entry in replacements.entries) {
    normalized = normalized.replaceAll(entry.key, entry.value);
  }
  // Treat canonically decomposed accents (for example `e` + U+0301) like
  // their precomposed equivalent before applying the ASCII token boundary.
  normalized = normalized.replaceAll(RegExp(r'[\u0300-\u036f]'), '');

  return normalized
      .replaceAll(RegExp(r'[^a-z]+'), ' ')
      .split(RegExp(r'\s+'))
      .where((token) => token.length > 1)
      .toSet();
}
