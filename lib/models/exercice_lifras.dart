import 'package:cloud_firestore/cloud_firestore.dart';

/// Niveaux LIFRAS
enum NiveauLIFRAS {
  tn,  // Tous Niveaux (spécialités)
  nb,  // Non Breveté
  p2,  // Plongeur 2★
  p3,  // Plongeur 3★
  p4,  // Plongeur 4★
  am,  // Assistant Moniteur
  mc,  // Moniteur Club
  mf,  // Moniteur Fédéral
  mn,  // Moniteur National
}

/// Extension pour convertir entre string et enum
extension NiveauLIFRASExtension on NiveauLIFRAS {
  String get code {
    switch (this) {
      case NiveauLIFRAS.tn:
        return 'TN';
      case NiveauLIFRAS.nb:
        return 'NB';
      case NiveauLIFRAS.p2:
        return 'P2';
      case NiveauLIFRAS.p3:
        return 'P3';
      case NiveauLIFRAS.p4:
        return 'P4';
      case NiveauLIFRAS.am:
        return 'AM';
      case NiveauLIFRAS.mc:
        return 'MC';
      case NiveauLIFRAS.mf:
        return 'MF';
      case NiveauLIFRAS.mn:
        return 'MN';
    }
  }

  String get label {
    switch (this) {
      case NiveauLIFRAS.tn:
        return 'Tous Niveaux';
      case NiveauLIFRAS.nb:
        return 'Non Breveté';
      case NiveauLIFRAS.p2:
        return 'Plongeur 2★';
      case NiveauLIFRAS.p3:
        return 'Plongeur 3★';
      case NiveauLIFRAS.p4:
        return 'Plongeur 4★';
      case NiveauLIFRAS.am:
        return 'Assistant Moniteur';
      case NiveauLIFRAS.mc:
        return 'Moniteur Club';
      case NiveauLIFRAS.mf:
        return 'Moniteur Fédéral';
      case NiveauLIFRAS.mn:
        return 'Moniteur National';
    }
  }

  static NiveauLIFRAS? fromCode(String? code) {
    if (code == null) return null;
    switch (code.toUpperCase()) {
      case 'TN':
        return NiveauLIFRAS.tn;
      case 'NB':
      case '0':
        return NiveauLIFRAS.nb;
      case 'P2':
      case '2':
        return NiveauLIFRAS.p2;
      case 'P3':
      case '3':
        return NiveauLIFRAS.p3;
      case 'P4':
      case '4':
        return NiveauLIFRAS.p4;
      case 'AM':
        return NiveauLIFRAS.am;
      case 'MC':
        return NiveauLIFRAS.mc;
      case 'MF':
        return NiveauLIFRAS.mf;
      case 'MN':
        return NiveauLIFRAS.mn;
      default:
        return null;
    }
  }
}

/// Model ExerciceLIFRAS - Exercice de formation LIFRAS
class ExerciceLIFRAS {
  final String id;
  final String code;             // Ex: "P2.RA", "AM.OP", "TN.01"
  final NiveauLIFRAS niveau;     // Niveau requis
  final String description;      // Description de l'exercice
  final String? specialite;      // Spécialité (uniquement pour niveau TN)
  final DateTime? createdAt;
  final DateTime? updatedAt;

  ExerciceLIFRAS({
    required this.id,
    required this.code,
    required this.niveau,
    required this.description,
    this.specialite,
    this.createdAt,
    this.updatedAt,
  });

  /// Convertir depuis Firestore
  factory ExerciceLIFRAS.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    return ExerciceLIFRAS(
      id: doc.id,
      code: data['code'] ?? '',
      niveau: NiveauLIFRASExtension.fromCode(data['niveau']) ?? NiveauLIFRAS.nb,
      description: data['description'] ?? '',
      specialite: data['specialite'],
      createdAt: (data['created_at'] as Timestamp?)?.toDate(),
      updatedAt: (data['updated_at'] as Timestamp?)?.toDate(),
    );
  }

  /// Convertir vers Firestore
  Map<String, dynamic> toFirestore() {
    final data = {
      'code': code,
      'niveau': niveau.code,
      'description': description,
      'created_at': createdAt != null ? Timestamp.fromDate(createdAt!) : FieldValue.serverTimestamp(),
      'updated_at': FieldValue.serverTimestamp(),
    };
    if (specialite != null) {
      data['specialite'] = specialite!;
    }
    return data;
  }

  /// Affichage formaté: "P2.RA - Remontée assistée 20 m"
  String get displayName => '$code - $description';
}
