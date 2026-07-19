/// Canonical member-name access for Firestore member documents.
///
/// Storage priority follows the English-canonical contract:
/// `first_name`/`last_name`, then temporary camelCase aliases, then legacy
/// French fields. Keep all member-name reads behind these helpers while the
/// additive backfill and legacy-client window are active.

String? _readNameValue(Map<String, dynamic> data, List<String> keys) {
  for (final key in keys) {
    final value = data[key];
    if (value is String && value.trim().isNotEmpty) return value.trim();
  }
  return null;
}

String? memberFirstName(Map<String, dynamic> data) =>
    _readNameValue(data, const ['first_name', 'firstName', 'prenom']);

String? memberLastName(Map<String, dynamic> data) =>
    _readNameValue(data, const ['last_name', 'lastName', 'nom']);

String memberDisplayName(
  Map<String, dynamic> data, {
  String fallback = 'Membre',
}) {
  final explicit = _readNameValue(data, const ['display_name', 'displayName']);
  if (explicit != null) return explicit;

  final constructed = [memberFirstName(data), memberLastName(data)]
      .whereType<String>()
      .join(' ')
      .trim();
  if (constructed.isNotEmpty) return constructed;

  return _readNameValue(data, const ['email']) ?? fallback;
}

List<String> memberNameSearchValues(Map<String, dynamic> data) {
  final firstName = memberFirstName(data) ?? '';
  final lastName = memberLastName(data) ?? '';
  return {
    memberDisplayName(data, fallback: ''),
    '$firstName $lastName'.trim(),
    '$lastName $firstName'.trim(),
    firstName,
    lastName,
    _readNameValue(data, const ['email']) ?? '',
  }.where((value) => value.isNotEmpty).toList();
}
