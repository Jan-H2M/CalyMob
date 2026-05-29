import 'package:cloud_firestore/cloud_firestore.dart';
import 'exercice_lifras.dart';

/// Status van een ExerciceValide.
///
/// English-canonical (zelfde als CalyCompta backend):
/// - [pending]   : self-declaration door member, wacht op moniteur-validatie
/// - [validated] : gevalideerd door moniteur (of legacy docs zonder status)
/// - [refused]   : geweigerd door moniteur (met optionele refused_reason)
enum ExerciceValideStatus {
  pending,
  validated,
  refused,
}

extension ExerciceValideStatusExtension on ExerciceValideStatus {
  /// Canonical Firestore value.
  String get code {
    switch (this) {
      case ExerciceValideStatus.pending:
        return 'pending';
      case ExerciceValideStatus.validated:
        return 'validated';
      case ExerciceValideStatus.refused:
        return 'refused';
    }
  }

  /// Franstalig UI-label.
  String get label {
    switch (this) {
      case ExerciceValideStatus.pending:
        return 'En attente';
      case ExerciceValideStatus.validated:
        return 'Validé';
      case ExerciceValideStatus.refused:
        return 'Refusé';
    }
  }

  /// Parse vanuit Firestore. Onbekende/ontbrekende waarde → [validated]
  /// voor backwards-compatibility met legacy docs (alle pre-migration docs
  /// waren impliciet gevalideerd).
  static ExerciceValideStatus fromCode(String? code) {
    switch (code) {
      case 'pending':
        return ExerciceValideStatus.pending;
      case 'refused':
        return ExerciceValideStatus.refused;
      case 'validated':
      default:
        return ExerciceValideStatus.validated;
    }
  }
}

/// Model ExerciceValide - Exercice validé pour un membre
///
/// Per 2026-04-21 (Fase 1 eval-redesign):
/// - Documents hebben nu een expliciet [status] veld
///   (pending | validated | refused)
/// - Legacy docs zonder status worden gelezen als [validated]
///   (backwards-compatible)
/// - [declaredByMember] = true wanneer member zelf de declaratie aanmaakte
///   via CalyMob's "Je l'ai fait"-flow
/// - [refusedReason] = optionele feedback wanneer status = refused
/// - [sessionId] + [themaId] = optionele context voor koppeling aan de
///   piscine-séance of event waarin de exercice werd uitgevoerd
class ExerciceValide {
  final String id;
  final String exerciceId;           // Reference to exercices_lifras document
  final String exerciceCode;         // Ex: "P2.RA", "TN.NB1"
  final String exerciceDescription;  // Exercise description
  final NiveauLIFRAS exerciceNiveau; // TN, NB, P2, P3, P4, AM, MC
  final String? exerciceSpecialite;  // Only for TN niveau
  final ExerciceValideStatus status; // pending | validated | refused
  final bool declaredByMember;       // true = self-declaration via CalyMob
  final String? refusedReason;       // Optional feedback when status = refused
  final String? sessionId;           // Optional: piscine_session or operation ID
  final String? themaId;             // Optional: theme_id for piscine sessions
  final DateTime dateValidation;     // When exercise was validated (or declared)
  final String moniteurNom;          // Monitor name (free text) — empty for pending
  final String? moniteurId;          // Optional: member ID if monitor is from club
  final String? notes;               // Optional comments
  final String? lieu;                // Optional location
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final String createdBy;            // User ID who created the entry
  final String? source;              // e.g. carnet_formation
  final String? observationId;       // Source member_observations doc

  ExerciceValide({
    required this.id,
    required this.exerciceId,
    required this.exerciceCode,
    required this.exerciceDescription,
    required this.exerciceNiveau,
    this.exerciceSpecialite,
    this.status = ExerciceValideStatus.validated,
    this.declaredByMember = false,
    this.refusedReason,
    this.sessionId,
    this.themaId,
    required this.dateValidation,
    required this.moniteurNom,
    this.moniteurId,
    this.notes,
    this.lieu,
    this.createdAt,
    this.updatedAt,
    required this.createdBy,
    this.source,
    this.observationId,
  });

  /// Convertir depuis Firestore
  ///
  /// Backwards-compatible: documents zonder `status` of `declared_by_member`
  /// krijgen defaults ([validated] / `false`).
  factory ExerciceValide.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    return ExerciceValide(
      id: doc.id,
      exerciceId: data['exercice_id'] ?? '',
      exerciceCode: data['exercice_code'] ?? '',
      exerciceDescription: data['exercice_description'] ?? '',
      exerciceNiveau: NiveauLIFRASExtension.fromCode(data['exercice_niveau']) ?? NiveauLIFRAS.nb,
      exerciceSpecialite: data['exercice_specialite'],
      status: ExerciceValideStatusExtension.fromCode(data['status'] as String?),
      declaredByMember: data['declared_by_member'] == true,
      refusedReason: data['refused_reason'],
      sessionId: data['session_id'],
      themaId: data['thema_id'],
      dateValidation: (data['date_validation'] as Timestamp?)?.toDate() ?? DateTime.now(),
      moniteurNom: data['moniteur_nom'] ?? '',
      moniteurId: data['moniteur_id'],
      notes: data['notes'],
      lieu: data['lieu'],
      createdAt: (data['created_at'] as Timestamp?)?.toDate(),
      updatedAt: (data['updated_at'] as Timestamp?)?.toDate(),
      createdBy: data['created_by'] ?? '',
      source: data['source'],
      observationId: data['observation_id'],
    );
  }

  /// Convertir vers Firestore
  Map<String, dynamic> toFirestore() {
    final data = <String, dynamic>{
      'exercice_id': exerciceId,
      'exercice_code': exerciceCode,
      'exercice_description': exerciceDescription,
      'exercice_niveau': exerciceNiveau.code,
      'status': status.code,
      'declared_by_member': declaredByMember,
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
    if (refusedReason != null && refusedReason!.isNotEmpty) {
      data['refused_reason'] = refusedReason;
    }
    if (sessionId != null && sessionId!.isNotEmpty) {
      data['session_id'] = sessionId;
    }
    if (themaId != null && themaId!.isNotEmpty) {
      data['thema_id'] = themaId;
    }
    if (source != null && source!.isNotEmpty) {
      data['source'] = source;
    }
    if (observationId != null && observationId!.isNotEmpty) {
      data['observation_id'] = observationId;
    }

    return data;
  }

  /// Créer depuis un ExerciceLIFRAS (flow moniteur — status = validated)
  factory ExerciceValide.fromExercice({
    required ExerciceLIFRAS exercice,
    required DateTime dateValidation,
    required String moniteurNom,
    required String createdBy,
    String? moniteurId,
    String? notes,
    String? lieu,
    ExerciceValideStatus status = ExerciceValideStatus.validated,
    bool declaredByMember = false,
    String? sessionId,
    String? themaId,
  }) {
    return ExerciceValide(
      id: '', // Will be set by Firestore
      exerciceId: exercice.id,
      exerciceCode: exercice.code,
      exerciceDescription: exercice.description,
      exerciceNiveau: exercice.niveau,
      exerciceSpecialite: exercice.specialite,
      status: status,
      declaredByMember: declaredByMember,
      sessionId: sessionId,
      themaId: themaId,
      dateValidation: dateValidation,
      moniteurNom: moniteurNom,
      moniteurId: moniteurId,
      notes: notes,
      lieu: lieu,
      createdBy: createdBy,
    );
  }

  /// Convenience: Pending self-declaration door een member.
  /// Zet [status] = pending, [declaredByMember] = true, moniteurNom leeg.
  factory ExerciceValide.selfDeclaration({
    required ExerciceLIFRAS exercice,
    required DateTime dateDeclaration,
    required String memberId,
    String? sessionId,
    String? themaId,
    String? notes,
    String? lieu,
  }) {
    return ExerciceValide(
      id: '',
      exerciceId: exercice.id,
      exerciceCode: exercice.code,
      exerciceDescription: exercice.description,
      exerciceNiveau: exercice.niveau,
      exerciceSpecialite: exercice.specialite,
      status: ExerciceValideStatus.pending,
      declaredByMember: true,
      sessionId: sessionId,
      themaId: themaId,
      dateValidation: dateDeclaration,
      moniteurNom: '', // filled at validation time
      notes: notes,
      lieu: lieu,
      createdBy: memberId,
    );
  }

  /// Affichage formaté
  String get displayName => '$exerciceCode - $exerciceDescription';

  /// True wanneer deze validatie telt als "afgevinkt" in progressie-stats.
  /// Pending en refused tellen **niet** mee.
  bool get isValidated => status == ExerciceValideStatus.validated;

  /// True wanneer er op een moniteur-actie gewacht wordt.
  bool get isPending => status == ExerciceValideStatus.pending;

  /// True wanneer afgewezen door moniteur.
  bool get isRefused => status == ExerciceValideStatus.refused;

  /// Copy with modifications
  ExerciceValide copyWith({
    String? id,
    String? exerciceId,
    String? exerciceCode,
    String? exerciceDescription,
    NiveauLIFRAS? exerciceNiveau,
    String? exerciceSpecialite,
    ExerciceValideStatus? status,
    bool? declaredByMember,
    String? refusedReason,
    String? sessionId,
    String? themaId,
    DateTime? dateValidation,
    String? moniteurNom,
    String? moniteurId,
    String? notes,
    String? lieu,
    DateTime? createdAt,
    DateTime? updatedAt,
    String? createdBy,
    String? source,
    String? observationId,
  }) {
    return ExerciceValide(
      id: id ?? this.id,
      exerciceId: exerciceId ?? this.exerciceId,
      exerciceCode: exerciceCode ?? this.exerciceCode,
      exerciceDescription: exerciceDescription ?? this.exerciceDescription,
      exerciceNiveau: exerciceNiveau ?? this.exerciceNiveau,
      exerciceSpecialite: exerciceSpecialite ?? this.exerciceSpecialite,
      status: status ?? this.status,
      declaredByMember: declaredByMember ?? this.declaredByMember,
      refusedReason: refusedReason ?? this.refusedReason,
      sessionId: sessionId ?? this.sessionId,
      themaId: themaId ?? this.themaId,
      dateValidation: dateValidation ?? this.dateValidation,
      moniteurNom: moniteurNom ?? this.moniteurNom,
      moniteurId: moniteurId ?? this.moniteurId,
      notes: notes ?? this.notes,
      lieu: lieu ?? this.lieu,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      createdBy: createdBy ?? this.createdBy,
      source: source ?? this.source,
      observationId: observationId ?? this.observationId,
    );
  }

  bool get isFromCarnetFormation => source == 'carnet_formation';
}
