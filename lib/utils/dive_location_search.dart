class DiveLocationSearchCandidate {
  final String name;
  final String? countryCode;
  final String? countryLabel;
  final String? region;
  final String? zone;
  final String? address;
  final String? type;
  final List<String> aliases;

  const DiveLocationSearchCandidate({
    required this.name,
    this.countryCode,
    this.countryLabel,
    this.region,
    this.zone,
    this.address,
    this.type,
    this.aliases = const [],
  });
}

String normalizeDiveLocationSearch(String value) => value
    .toLowerCase()
    .replaceAll(RegExp(r'[àáâä]'), 'a')
    .replaceAll(RegExp(r'[ç]'), 'c')
    .replaceAll(RegExp(r'[èéêë]'), 'e')
    .replaceAll(RegExp(r'[ìíîï]'), 'i')
    .replaceAll(RegExp(r'[ñ]'), 'n')
    .replaceAll(RegExp(r'[òóôö]'), 'o')
    .replaceAll(RegExp(r'[ùúûü]'), 'u')
    .replaceAll(RegExp(r'[^a-z0-9]+'), ' ')
    .trim()
    .replaceAll(RegExp(r'\s+'), ' ');

int scoreDiveLocation(DiveLocationSearchCandidate candidate, String rawQuery) {
  final query = normalizeDiveLocationSearch(rawQuery);
  if (query.isEmpty) return 0;
  final name = normalizeDiveLocationSearch(candidate.name);
  final nameWords = name.split(' ').where((word) => word.isNotEmpty);
  if (name == query) return 0;
  if (name.startsWith(query)) return 1;
  if (nameWords.any((word) => word == query)) return 2;
  if (nameWords.any((word) => word.startsWith(query))) return 3;
  final metadata = [
    candidate.countryCode,
    candidate.countryLabel,
    candidate.region,
    candidate.zone,
    candidate.address,
    candidate.type,
  ].whereType<String>();
  if (metadata.any((value) => normalizeDiveLocationSearch(value) == query)) {
    return 4;
  }
  if (query.length >= 3 &&
      [
        candidate.name,
        ...metadata,
      ].any((value) => normalizeDiveLocationSearch(value).contains(query))) {
    return 5;
  }
  if (candidate.aliases.any(
    (alias) => normalizeDiveLocationSearch(alias).contains(query),
  )) {
    return 6;
  }
  return 999;
}

const diveLocationCountryLabels = <String, String>{
  'BE': 'Belgique',
  'NL': 'Pays-Bas',
  'FR': 'France',
  'DE': 'Allemagne',
  'IT': 'Italie',
  'ES': 'Espagne',
  'PT': 'Portugal',
  'GR': 'Grèce',
  'HR': 'Croatie',
  'EG': 'Égypte',
  'MT': 'Malte',
  'GB': 'Royaume-Uni',
};
