import 'package:cloud_firestore/cloud_firestore.dart';
import 'tariff.dart';

/// Human-facing environment categories shared with CalyCompta's
/// `location_type` values.  Existing locations which only have `water_type`
/// remain readable: their broad legacy type is represented without rewriting
/// the Firestore document.
enum DiveEnvironment {
  career('Carrière', '⛏️'),
  lake('Lac', '🏞️'),
  sea('Mer', '🏖️'),
  northSea('Mer du Nord', '🚢'),
  zeeland('Zélande', '🌊'),
  pool('Piscine', '🏊'),
  freshWater('Eau douce', '💧'),
  other('Autre', '📍');

  const DiveEnvironment(this.label, this.icon);
  final String label;
  final String icon;

  static DiveEnvironment fromFirestore(Map<String, dynamic> data) {
    switch (data['location_type']?.toString().trim().toLowerCase()) {
      case 'carrière':
      case 'carriere':
        return DiveEnvironment.career;
      case 'lac':
        return DiveEnvironment.lake;
      case 'mer':
        return DiveEnvironment.sea;
      case 'mer du nord':
        return DiveEnvironment.northSea;
      case 'zélande':
      case 'zelande':
        return DiveEnvironment.zeeland;
      case 'piscine':
        return DiveEnvironment.pool;
      case 'autre':
        return DiveEnvironment.other;
    }

    // Compatibility for the older, broader catalogue shape.  Do not infer a
    // quarry or lake from fresh water: that distinction did not exist there.
    switch (data['water_type']?.toString().trim().toLowerCase()) {
      case 'sea':
      case 'mer':
        return DiveEnvironment.sea;
      case 'pool':
      case 'piscine':
        return DiveEnvironment.pool;
      case 'fresh':
      case 'eau douce':
        return DiveEnvironment.freshWater;
      default:
        return DiveEnvironment.other;
    }
  }

  /// Exact CalyCompta value for new operations. `Eau douce` is legacy-only:
  /// it deliberately remains unspecified rather than inventing a category.
  String? get operationLieuType => switch (this) {
        DiveEnvironment.career => 'Carrière',
        DiveEnvironment.lake => 'Lac',
        DiveEnvironment.sea => 'Mer',
        DiveEnvironment.northSea => 'Mer du Nord',
        DiveEnvironment.zeeland => 'Zélande',
        DiveEnvironment.pool => 'Piscine',
        DiveEnvironment.other => 'Autre',
        DiveEnvironment.freshWater => null,
      };

  bool get isSea =>
      this == DiveEnvironment.sea ||
      this == DiveEnvironment.northSea ||
      this == DiveEnvironment.zeeland;
}

/// Groups catalogue locations by their explicit environment while preserving
/// the legacy broad environment for records which have no `location_type`.
Map<DiveEnvironment, List<DiveLocation>> groupDiveLocationsByEnvironment(
  Iterable<DiveLocation> locations,
) {
  final groups = <DiveEnvironment, List<DiveLocation>>{};
  for (final location in locations) {
    groups.putIfAbsent(location.environment, () => []).add(location);
  }
  return groups;
}

/// Modèle DiveLocation - Lieu de plongée avec tarifs
/// Firestore collection: clubs/{clubId}/dive_locations
class DiveLocation {
  final String id;
  final String name;
  final String? description;
  final String country; // "BE", "NL", "FR"
  final String? address;
  final String? phone;
  final String? email;
  final String? website;
  final String? notes;

  /// Whether this location may be proposed when creating an activity.
  ///
  /// Missing Firestore values default to true for legacy locations, matching
  /// the CalyCompta settings screen.
  final bool availableForEvents;

  /// Previous ID when this record was merged into another canonical location.
  final String? mergedIntoLocationId;
  final List<Tariff> tariffs;
  final DateTime createdAt;
  final DateTime updatedAt;
  final String? createdBy;
  final DiveEnvironment environment;

  DiveLocation({
    required this.id,
    required this.name,
    this.description,
    required this.country,
    this.address,
    this.phone,
    this.email,
    this.website,
    this.notes,
    this.availableForEvents = true,
    this.mergedIntoLocationId,
    this.tariffs = const [],
    required this.createdAt,
    required this.updatedAt,
    this.createdBy,
    this.environment = DiveEnvironment.other,
  });

  /// Convertir depuis Firestore DocumentSnapshot
  factory DiveLocation.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    return DiveLocation(
      id: doc.id,
      name: data['name'] ?? '',
      description: data['description'],
      country: data['country'] ?? '',
      address: data['address'],
      phone: data['phone'],
      email: data['email'],
      website: data['website'],
      notes: data['notes'],
      availableForEvents: data['available_for_events'] != false,
      mergedIntoLocationId: data['merged_into_location_id'] as String?,
      tariffs: _parseTariffs(data['tariffs']),
      createdAt: (data['created_at'] as Timestamp?)?.toDate() ?? DateTime.now(),
      updatedAt: (data['updated_at'] as Timestamp?)?.toDate() ?? DateTime.now(),
      createdBy: data['created_by'],
      environment: DiveEnvironment.fromFirestore(data),
    );
  }

  static List<Tariff> _parseTariffs(dynamic tariffsData) {
    if (tariffsData == null) return [];
    final tariffsList = tariffsData as List<dynamic>;
    return tariffsList
        .map((t) => Tariff.fromMap(t as Map<String, dynamic>))
        .toList();
  }

  @override
  String toString() => 'DiveLocation(name: $name, country: $country)';
}
