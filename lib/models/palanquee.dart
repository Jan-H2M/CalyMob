import 'package:cloud_firestore/cloud_firestore.dart';

/// Participant dans une palanquée (snapshot des données membre)
class PalanqueeParticipant {
  final String membreId;
  final String membreNom;
  final String membrePrenom;
  final String niveau;
  final int ordre;

  const PalanqueeParticipant({
    required this.membreId,
    required this.membreNom,
    required this.membrePrenom,
    required this.niveau,
    this.ordre = 0,
  });

  factory PalanqueeParticipant.fromMap(Map<String, dynamic> map) {
    return PalanqueeParticipant(
      membreId: map['membre_id'] ?? '',
      membreNom: map['membre_nom'] ?? '',
      membrePrenom: map['membre_prenom'] ?? '',
      niveau: map['niveau'] ?? '',
      ordre: map['ordre'] ?? 0,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'membre_id': membreId,
      'membre_nom': membreNom,
      'membre_prenom': membrePrenom,
      'niveau': niveau,
      'ordre': ordre,
    };
  }

  PalanqueeParticipant copyWith({
    String? membreId,
    String? membreNom,
    String? membrePrenom,
    String? niveau,
    int? ordre,
  }) {
    return PalanqueeParticipant(
      membreId: membreId ?? this.membreId,
      membreNom: membreNom ?? this.membreNom,
      membrePrenom: membrePrenom ?? this.membrePrenom,
      niveau: niveau ?? this.niveau,
      ordre: ordre ?? this.ordre,
    );
  }

  @override
  String toString() => '$membreNom $membrePrenom ($niveau)';
}

/// Une palanquée avec son numéro et ses participants
class Palanquee {
  final int numero;
  final List<PalanqueeParticipant> participants;

  const Palanquee({
    required this.numero,
    this.participants = const [],
  });

  factory Palanquee.fromMap(Map<String, dynamic> map) {
    return Palanquee(
      numero: map['numero'] ?? 1,
      participants: (map['participants'] as List<dynamic>?)
              ?.map((p) => PalanqueeParticipant.fromMap(p as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'numero': numero,
      'participants': participants.map((p) => p.toMap()).toList(),
    };
  }

  Palanquee copyWith({
    int? numero,
    List<PalanqueeParticipant>? participants,
  }) {
    return Palanquee(
      numero: numero ?? this.numero,
      participants: participants ?? this.participants,
    );
  }
}

/// Toutes palanquée-toewijzingen voor één operatie
///
/// Firestore path: clubs/{clubId}/operations/{operationId}/palanquees/assignments
class PalanqueeAssignments {
  final List<Palanquee> palanquees;
  final DateTime? updatedAt;
  final String? updatedBy;

  const PalanqueeAssignments({
    this.palanquees = const [],
    this.updatedAt,
    this.updatedBy,
  });

  factory PalanqueeAssignments.fromFirestore(Map<String, dynamic> data) {
    return PalanqueeAssignments(
      palanquees: (data['palanquees'] as List<dynamic>?)
              ?.map((p) => Palanquee.fromMap(p as Map<String, dynamic>))
              .toList() ??
          [],
      updatedAt: (data['updated_at'] as Timestamp?)?.toDate(),
      updatedBy: data['updated_by'] as String?,
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'palanquees': palanquees.map((p) => p.toMap()).toList(),
      'updated_at': FieldValue.serverTimestamp(),
      'updated_by': updatedBy,
    };
  }

  PalanqueeAssignments copyWith({
    List<Palanquee>? palanquees,
    DateTime? updatedAt,
    String? updatedBy,
  }) {
    return PalanqueeAssignments(
      palanquees: palanquees ?? this.palanquees,
      updatedAt: updatedAt ?? this.updatedAt,
      updatedBy: updatedBy ?? this.updatedBy,
    );
  }

  /// Tous participants die al toegewezen zijn
  Set<String> get assignedMemberIds {
    final ids = <String>{};
    for (final p in palanquees) {
      for (final part in p.participants) {
        ids.add(part.membreId);
      }
    }
    return ids;
  }
}
