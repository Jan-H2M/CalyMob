import 'package:cloud_firestore/cloud_firestore.dart';
import 'tariff.dart';

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
