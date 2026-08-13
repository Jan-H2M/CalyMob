import 'package:cloud_functions/cloud_functions.dart';

/// Result of the server-side canonical location contract.
///
/// `exact` is the only state that may populate `location_id` automatically;
/// `ambiguous` and `not_found` deliberately remain free text until a person
/// confirms a suggestion.
class CanonicalLocationResolution {
  final String status;
  final String query;
  final Map<String, dynamic>? canonical;
  final List<Map<String, dynamic>> suggestions;
  final String linkSource;
  final String resolverVersion;
  final String? confirmation;

  const CanonicalLocationResolution({
    required this.status,
    required this.query,
    required this.canonical,
    required this.suggestions,
    required this.linkSource,
    required this.resolverVersion,
    this.confirmation,
  });

  bool get isExact => status == 'exact' && canonical?['id'] is String;

  Map<String, dynamic>? get snapshot => canonical == null
      ? null
      : Map<String, dynamic>.from(canonical!);

  factory CanonicalLocationResolution.fromMap(
    Map<String, dynamic> map, {
    String? fallbackSource,
  }) {
    final canonical = map['canonical'];
    final rawSuggestions = map['suggestions'];
    return CanonicalLocationResolution(
      status: (map['status'] as String?) ?? 'not_found',
      query: (map['query'] as String?) ?? '',
      canonical: canonical is Map
          ? Map<String, dynamic>.from(canonical)
          : null,
      suggestions: rawSuggestions is List
          ? rawSuggestions
              .whereType<Map>()
              .map((value) => Map<String, dynamic>.from(value))
              .toList()
          : const [],
      linkSource: (map['linkSource'] as String?) ?? fallbackSource ?? 'manual',
      resolverVersion:
          (map['resolverVersion'] as String?) ?? 'canonical-location-v1',
      confirmation: map['confirmation'] as String?,
    );
  }

  /// Fields stored alongside a logbook entry. The canonical document remains
  /// the source of truth, while this snapshot preserves the reviewed label at
  /// the time of import for auditability.
  Map<String, dynamic> get entryExtras => {
        if (isExact && snapshot != null) 'location_snapshot': snapshot,
        if (isExact) 'location_link_source': linkSource,
        if (isExact) 'location_resolver_version': resolverVersion,
        if (!isExact)
          'location_resolution_status': status,
        if (suggestions.isNotEmpty && !isExact)
          'location_resolution_candidates': suggestions,
      };
}

class CanonicalDiveLocationResolver {
  final FirebaseFunctions _functions;

  CanonicalDiveLocationResolver({FirebaseFunctions? functions})
      : _functions = functions ??
            FirebaseFunctions.instanceFor(region: 'europe-west1');

  Future<CanonicalLocationResolution> resolve({
    required String clubId,
    required String locationName,
    required String source,
    String? locationId,
  }) async {
    final result = await _functions
        .httpsCallable('resolveCanonicalDiveLocation')
        .call({
      'clubId': clubId,
      'locationName': locationName,
      'source': source,
      if (locationId != null && locationId.trim().isNotEmpty)
        'locationId': locationId.trim(),
    });
    return CanonicalLocationResolution.fromMap(
      Map<String, dynamic>.from(result.data as Map),
      fallbackSource: source,
    );
  }
}
