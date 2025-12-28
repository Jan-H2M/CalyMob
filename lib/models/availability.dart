import 'package:cloud_firestore/cloud_firestore.dart';

/// Model Availability - Beschikbaarheden voor piscine sessies
/// Accueil en Encadrants kunnen aangeven wanneer ze beschikbaar zijn
class Availability {
  final String id;
  final String membreId;
  final String membreNom;
  final String membrePrenom;
  final DateTime date; // De dinsdag van de piscine sessie
  final String role; // 'accueil' of 'encadrant'
  final bool available;
  final DateTime createdAt;
  final DateTime updatedAt;

  Availability({
    required this.id,
    required this.membreId,
    required this.membreNom,
    required this.membrePrenom,
    required this.date,
    required this.role,
    required this.available,
    required this.createdAt,
    required this.updatedAt,
  });

  /// Convertir depuis Firestore DocumentSnapshot
  factory Availability.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    return Availability(
      id: doc.id,
      membreId: data['membre_id'] ?? '',
      membreNom: data['membre_nom'] ?? '',
      membrePrenom: data['membre_prenom'] ?? '',
      date: (data['date'] as Timestamp?)?.toDate() ?? DateTime.now(),
      role: data['role'] ?? 'encadrant',
      available: data['available'] ?? false,
      createdAt:
          (data['created_at'] as Timestamp?)?.toDate() ?? DateTime.now(),
      updatedAt:
          (data['updated_at'] as Timestamp?)?.toDate() ?? DateTime.now(),
    );
  }

  /// Convertir vers Firestore Map
  Map<String, dynamic> toFirestore() {
    return {
      'membre_id': membreId,
      'membre_nom': membreNom,
      'membre_prenom': membrePrenom,
      'date': Timestamp.fromDate(date),
      'role': role,
      'available': available,
      'created_at': Timestamp.fromDate(createdAt),
      'updated_at': Timestamp.fromDate(DateTime.now()),
    };
  }

  /// Créer une copie avec des modifications
  Availability copyWith({
    String? id,
    String? membreId,
    String? membreNom,
    String? membrePrenom,
    DateTime? date,
    String? role,
    bool? available,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return Availability(
      id: id ?? this.id,
      membreId: membreId ?? this.membreId,
      membreNom: membreNom ?? this.membreNom,
      membrePrenom: membrePrenom ?? this.membrePrenom,
      date: date ?? this.date,
      role: role ?? this.role,
      available: available ?? this.available,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  /// Nom complet du membre
  String get fullName => '$membrePrenom $membreNom';

  /// Vérifier si c'est un mardi
  bool get isTuesday => date.weekday == DateTime.tuesday;

  @override
  String toString() {
    return 'Availability(id: $id, membre: $fullName, date: $date, role: $role, available: $available)';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is Availability &&
        other.id == id &&
        other.membreId == membreId &&
        other.date == date &&
        other.role == role;
  }

  @override
  int get hashCode => Object.hash(id, membreId, date, role);
}
