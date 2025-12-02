import 'package:cloud_firestore/cloud_firestore.dart';
import 'exercice_lifras.dart';

/// Model ExerciceValide - Exercice validé pour un membre
class ExerciceValide {
  final String id;
  final String exerciceId;           // Reference to exercices_lifras document
  final String exerciceCode;         // Ex: "P2.RA", "TN.NB1"
  final String exerciceDescription;  // Exercise description
  final NiveauLIFRAS exerciceNiveau; // TN, NB, P2, P3, P4, AM, MC
  final String? exerciceSpecialite;  // Only for TN niveau
  final DateTime dateValidation;     // When exercise was validated
  final String moniteurNom;          // Monitor name (free text)
  final String? moniteurId;          // Optional: member ID if monitor is from club
  final String? notes;               // Optional comments
  final String? lieu;                // Optional location
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final String createdBy;            // User ID who created the entry

  ExerciceValide({
    required this.id,
    required this.exerciceId,
    required this.exerciceCode,
    required this.exerciceDescription,
    required this.exerciceNiveau,
    this.exerciceSpecialite,
    required this.dateValidation,
    required this.moniteurNom,
    this.moniteurId,
    this.notes,
    this.lieu,
    this.createdAt,
    this.updatedAt,
    required this.createdBy,
  });

  /// Convertir depuis Firestore
  factory ExerciceValide.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    return ExerciceValide(
      id: doc.id,
      exerciceId: data['exercice_id'] ?? '',
      exerciceCode: data['exercice_code'] ?? '',
      exerciceDescription: data['exercice_description'] ?? '',
      exerciceNiveau: NiveauLIFRASExtension.fromCode(data['exercice_niveau']) ?? NiveauLIFRAS.nb,
      exerciceSpecialite: data['exercice_specialite'],
      dateValidation: (data['date_validation'] as Timestamp?)?.toDate() ?? DateTime.now(),
      moniteurNom: data['moniteur_nom'] ?? '',
      moniteurId: data['moniteur_id'],
      notes: data['notes'],
      lieu: data['lieu'],
      createdAt: (data['created_at'] as Timestamp?)?.toDate(),
      updatedAt: (data['updated_at'] as Timestamp?)?.toDate(),
      createdBy: data['created_by'] ?? '',
    );
  }

  /// Convertir vers Firestore
  Map<String, dynamic> toFirestore() {
    final data = <String, dynamic>{
      'exercice_id': exerciceId,
      'exercice_code': exerciceCode,
      'exercice_description': exerciceDescription,
      'exercice_niveau': exerciceNiveau.code,
      'date_validation': Timestamp.fromDate(dateValidation),
      'moniteur_nom': moniteurNom,
      'created_by': createdBy,
      'created_at': createdAt != null ? Timestamp.fromDate(createdAt!) : FieldValue.serverTimestamp(),
      'updated_at': FieldValue.serverTimestamp(),
    };

    if (exerciceSpecialite != null) {
      data['exercice_specialite'] = exerciceSpecialite;
    }
    if (moniteurId != null) {
      data['moniteur_id'] = moniteurId;
    }
    if (notes != null && notes!.isNotEmpty) {
      data['notes'] = notes;
    }
    if (lieu != null && lieu!.isNotEmpty) {
      data['lieu'] = lieu;
    }

    return data;
  }

  /// Créer depuis un ExerciceLIFRAS
  factory ExerciceValide.fromExercice({
    required ExerciceLIFRAS exercice,
    required DateTime dateValidation,
    required String moniteurNom,
    required String createdBy,
    String? moniteurId,
    String? notes,
    String? lieu,
  }) {
    return ExerciceValide(
      id: '', // Will be set by Firestore
      exerciceId: exercice.id,
      exerciceCode: exercice.code,
      exerciceDescription: exercice.description,
      exerciceNiveau: exercice.niveau,
      exerciceSpecialite: exercice.specialite,
      dateValidation: dateValidation,
      moniteurNom: moniteurNom,
      moniteurId: moniteurId,
      notes: notes,
      lieu: lieu,
      createdBy: createdBy,
    );
  }

  /// Affichage formaté
  String get displayName => '$exerciceCode - $exerciceDescription';

  /// Copy with modifications
  ExerciceValide copyWith({
    String? id,
    String? exerciceId,
    String? exerciceCode,
    String? exerciceDescription,
    NiveauLIFRAS? exerciceNiveau,
    String? exerciceSpecialite,
    DateTime? dateValidation,
    String? moniteurNom,
    String? moniteurId,
    String? notes,
    String? lieu,
    DateTime? createdAt,
    DateTime? updatedAt,
    String? createdBy,
  }) {
    return ExerciceValide(
      id: id ?? this.id,
      exerciceId: exerciceId ?? this.exerciceId,
      exerciceCode: exerciceCode ?? this.exerciceCode,
      exerciceDescription: exerciceDescription ?? this.exerciceDescription,
      exerciceNiveau: exerciceNiveau ?? this.exerciceNiveau,
      exerciceSpecialite: exerciceSpecialite ?? this.exerciceSpecialite,
      dateValidation: dateValidation ?? this.dateValidation,
      moniteurNom: moniteurNom ?? this.moniteurNom,
      moniteurId: moniteurId ?? this.moniteurId,
      notes: notes ?? this.notes,
      lieu: lieu ?? this.lieu,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      createdBy: createdBy ?? this.createdBy,
    );
  }
}
