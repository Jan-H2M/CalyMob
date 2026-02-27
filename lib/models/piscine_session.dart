import 'package:cloud_firestore/cloud_firestore.dart';

/// Assignment d'un membre à une fonction dans une séance
class SessionAssignment {
  final String membreId;
  final String membreNom;
  final String membrePrenom;

  SessionAssignment({
    required this.membreId,
    required this.membreNom,
    required this.membrePrenom,
  });

  factory SessionAssignment.fromMap(Map<String, dynamic> map) {
    return SessionAssignment(
      membreId: map['membre_id'] ?? '',
      membreNom: map['membre_nom'] ?? '',
      membrePrenom: map['membre_prenom'] ?? '',
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'membre_id': membreId,
      'membre_nom': membreNom,
      'membre_prenom': membrePrenom,
    };
  }

  String get fullName => '$membrePrenom $membreNom';
}

/// Configuration d'un niveau dans une séance
class LevelAssignment {
  final List<SessionAssignment> encadrants;
  final String? theme;
  final String? themeUpdatedBy;
  final DateTime? themeUpdatedAt;

  LevelAssignment({
    required this.encadrants,
    this.theme,
    this.themeUpdatedBy,
    this.themeUpdatedAt,
  });

  factory LevelAssignment.fromMap(Map<String, dynamic> map) {
    return LevelAssignment(
      encadrants: (map['encadrants'] as List<dynamic>?)
              ?.map((e) => SessionAssignment.fromMap(e as Map<String, dynamic>))
              .toList() ??
          [],
      theme: map['theme'],
      themeUpdatedBy: map['theme_updated_by'],
      themeUpdatedAt: (map['theme_updated_at'] as Timestamp?)?.toDate(),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'encadrants': encadrants.map((e) => e.toMap()).toList(),
      if (theme != null) 'theme': theme,
      if (themeUpdatedBy != null) 'theme_updated_by': themeUpdatedBy,
      if (themeUpdatedAt != null)
        'theme_updated_at': Timestamp.fromDate(themeUpdatedAt!),
    };
  }

  LevelAssignment copyWith({
    List<SessionAssignment>? encadrants,
    String? theme,
    String? themeUpdatedBy,
    DateTime? themeUpdatedAt,
  }) {
    return LevelAssignment(
      encadrants: encadrants ?? this.encadrants,
      theme: theme ?? this.theme,
      themeUpdatedBy: themeUpdatedBy ?? this.themeUpdatedBy,
      themeUpdatedAt: themeUpdatedAt ?? this.themeUpdatedAt,
    );
  }
}

/// Niveaux de plongée pour les séances piscine
class PiscineLevel {
  static const String niveau1 = '1*';
  static const String niveau2 = '2*';
  static const String niveau3 = '3*';
  static const String niveau4 = '4*';
  static const String am = 'AM';
  static const String mc = 'MC';

  static const List<String> all = [niveau1, niveau2, niveau3, niveau4, am, mc];

  /// Obtenir le nom d'affichage d'un niveau
  static String displayName(String level) {
    switch (level) {
      case niveau1:
        return '1 Étoile';
      case niveau2:
        return '2 Étoiles';
      case niveau3:
        return '3 Étoiles';
      case niveau4:
        return '4 Étoiles';
      case am:
        return 'Aide Moniteur';
      case mc:
        return 'Moniteur Club';
      default:
        return level;
    }
  }

  /// Obtenir l'icône d'étoiles pour un niveau
  static String stars(String level) {
    switch (level) {
      case niveau1:
        return '⭐';
      case niveau2:
        return '⭐⭐';
      case niveau3:
        return '⭐⭐⭐';
      case niveau4:
        return '⭐⭐⭐⭐';
      case am:
        return '🎓';
      case mc:
        return '🎓🎓';
      default:
        return '';
    }
  }
}

/// Statuts d'une séance piscine
class PiscineSessionStatus {
  static const String brouillon = 'brouillon';
  static const String publie = 'publie';
  static const String termine = 'termine';

  static String displayName(String status) {
    switch (status) {
      case brouillon:
        return 'Brouillon';
      case publie:
        return 'Publié';
      case termine:
        return 'Terminé';
      default:
        return status;
    }
  }
}

/// Configuration complète d'une séance piscine (ou théorie)
///
/// Le champ [type] distingue une séance piscine d'une séance théorie autonome.
/// Le champ [gonflage] est un Map indexé par créneau horaire (19h45, 20h15, 21h30).
/// Le champ [theorie] est optionnel et contient les séances théorie par créneau.
class PiscineSession {
  final String id;
  final String operationId;
  final String type; // 'piscine' | 'theorie' (défaut: 'piscine')
  final DateTime date;
  final String lieu;
  final String horaireDebut;
  final String horaireFin;
  final List<SessionAssignment> accueil;
  final List<SessionAssignment> baptemes;
  final Map<String, List<SessionAssignment>> gonflage; // Indexé par slot horaire
  final Map<String, LevelAssignment> niveaux;
  final Map<String, LevelAssignment>? theorie; // Indexé par slot horaire (19h30, 21h45)
  final String statut;
  final DateTime createdAt;
  final DateTime updatedAt;
  final String createdBy;

  PiscineSession({
    required this.id,
    required this.operationId,
    this.type = 'piscine',
    required this.date,
    required this.lieu,
    required this.horaireDebut,
    required this.horaireFin,
    required this.accueil,
    required this.baptemes,
    required this.gonflage,
    required this.niveaux,
    this.theorie,
    required this.statut,
    required this.createdAt,
    required this.updatedAt,
    required this.createdBy,
  });

  factory PiscineSession.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    // Parser les niveaux
    final niveauxData = data['niveaux'] as Map<String, dynamic>? ?? {};
    final niveaux = <String, LevelAssignment>{};
    for (final level in PiscineLevel.all) {
      if (niveauxData.containsKey(level)) {
        niveaux[level] =
            LevelAssignment.fromMap(niveauxData[level] as Map<String, dynamic>);
      } else {
        niveaux[level] = LevelAssignment(encadrants: []);
      }
    }

    // Parser gonflage — rétrocompatible (ancien format: Array, nouveau: Map)
    final gonflage = _parseGonflage(data['gonflage']);

    // Parser théorie (optionnel)
    final theorieData = data['theorie'] as Map<String, dynamic>?;
    Map<String, LevelAssignment>? theorie;
    if (theorieData != null) {
      theorie = {};
      for (final entry in theorieData.entries) {
        theorie[entry.key] =
            LevelAssignment.fromMap(entry.value as Map<String, dynamic>);
      }
    }

    return PiscineSession(
      id: doc.id,
      operationId: data['operation_id'] ?? '',
      type: data['type'] ?? 'piscine',
      date: (data['date'] as Timestamp?)?.toDate() ?? DateTime.now(),
      lieu: data['lieu'] ?? '',
      horaireDebut: data['horaire_debut'] ?? '20:30',
      horaireFin: data['horaire_fin'] ?? '21:30',
      accueil: (data['accueil'] as List<dynamic>?)
              ?.map((e) => SessionAssignment.fromMap(e as Map<String, dynamic>))
              .toList() ??
          [],
      baptemes: (data['baptemes'] as List<dynamic>?)
              ?.map((e) => SessionAssignment.fromMap(e as Map<String, dynamic>))
              .toList() ??
          [],
      gonflage: gonflage,
      niveaux: niveaux,
      theorie: theorie,
      statut: data['statut'] ?? PiscineSessionStatus.brouillon,
      createdAt:
          (data['created_at'] as Timestamp?)?.toDate() ?? DateTime.now(),
      updatedAt:
          (data['updated_at'] as Timestamp?)?.toDate() ?? DateTime.now(),
      createdBy: data['created_by'] ?? '',
    );
  }

  /// Parse gonflage data avec rétrocompatibilité
  /// - Ancien format (Array): [{membre_id, ...}] → migré en Map vide par slot avec données legacy
  /// - Nouveau format (Map): {19h45: [...], 20h15: [...], 21h30: [...]}
  /// - Absent/null: slots vides
  static Map<String, List<SessionAssignment>> _parseGonflage(dynamic rawData) {
    // Créer les slots vides par défaut
    final defaultSlots = <String, List<SessionAssignment>>{
      '19h45': [],
      '20h15': [],
      '21h30': [],
    };

    if (rawData == null) return defaultSlots;

    // Ancien format: Array de SessionAssignment
    if (rawData is List) {
      // Placer les anciennes assignations dans le premier slot par défaut
      final legacyAssignments = rawData
          .whereType<Map<String, dynamic>>()
          .map((e) => SessionAssignment.fromMap(e))
          .toList();
      if (legacyAssignments.isNotEmpty) {
        defaultSlots['19h45'] = legacyAssignments;
      }
      return defaultSlots;
    }

    // Nouveau format: Map par slot
    if (rawData is Map<String, dynamic>) {
      for (final slot in ['19h45', '20h15', '21h30']) {
        final slotData = rawData[slot];
        if (slotData is List) {
          defaultSlots[slot] = slotData
              .whereType<Map<String, dynamic>>()
              .map((e) => SessionAssignment.fromMap(e))
              .toList();
        }
      }
    }

    return defaultSlots;
  }

  Map<String, dynamic> toFirestore() {
    return {
      'operation_id': operationId,
      'type': type,
      'date': Timestamp.fromDate(date),
      'lieu': lieu,
      'horaire_debut': horaireDebut,
      'horaire_fin': horaireFin,
      'accueil': accueil.map((e) => e.toMap()).toList(),
      'baptemes': baptemes.map((e) => e.toMap()).toList(),
      'gonflage': gonflage.map(
        (slot, members) => MapEntry(slot, members.map((e) => e.toMap()).toList()),
      ),
      'niveaux': niveaux.map((key, value) => MapEntry(key, value.toMap())),
      if (theorie != null)
        'theorie': theorie!.map((key, value) => MapEntry(key, value.toMap())),
      'statut': statut,
      'created_at': Timestamp.fromDate(createdAt),
      'updated_at': Timestamp.fromDate(DateTime.now()),
      'created_by': createdBy,
    };
  }

  /// Vérifier si un membre est encadrant pour un niveau donné
  bool isEncadrantForLevel(String membreId, String level) {
    final levelAssignment = niveaux[level];
    if (levelAssignment == null) return false;
    return levelAssignment.encadrants.any((e) => e.membreId == membreId);
  }

  /// Obtenir le niveau qu'un encadrant encadre
  String? getEncadrantLevel(String membreId) {
    for (final entry in niveaux.entries) {
      if (entry.value.encadrants.any((e) => e.membreId == membreId)) {
        return entry.key;
      }
    }
    return null;
  }

  /// Vérifier si un membre fait partie de l'équipe accueil
  bool isAccueil(String membreId) {
    return accueil.any((e) => e.membreId == membreId);
  }

  /// Vérifier si un membre encadre les baptêmes
  bool isBaptemeEncadrant(String membreId) {
    return baptemes.any((e) => e.membreId == membreId);
  }

  /// Vérifier si un membre est assigné au gonflage (tous slots confondus)
  bool isGonflage(String membreId) {
    return gonflage.values.any(
      (slotMembers) => slotMembers.any((e) => e.membreId == membreId),
    );
  }

  /// Vérifier si un membre est assigné au gonflage pour un slot spécifique
  bool isGonflageForSlot(String membreId, String slot) {
    return gonflage[slot]?.any((e) => e.membreId == membreId) ?? false;
  }

  /// Obtenir tous les gonfleurs (tous slots confondus)
  List<SessionAssignment> get allGonfleurs {
    final all = <SessionAssignment>[];
    for (final slotMembers in gonflage.values) {
      all.addAll(slotMembers);
    }
    return all;
  }

  /// Vérifier si un membre est encadrant théorie
  bool isTheorieEncadrant(String membreId) {
    if (theorie == null) return false;
    return theorie!.values.any(
      (slot) => slot.encadrants.any((e) => e.membreId == membreId),
    );
  }

  /// Obtenir tous les encadrants (tous niveaux confondus)
  List<SessionAssignment> get allEncadrants {
    final all = <SessionAssignment>[];
    for (final level in niveaux.values) {
      all.addAll(level.encadrants);
    }
    all.addAll(baptemes);
    return all;
  }

  /// Vérifier si c'est une session de type théorie
  bool get isTheorieSession => type == 'theorie';

  /// Vérifier si c'est une session de type piscine
  bool get isPiscineSession => type == 'piscine';

  /// Vérifier si la session contient une section théorie
  bool get hasTheorie => theorie != null && theorie!.isNotEmpty;

  /// Date formatée pour l'affichage
  String get formattedDate {
    final weekdays = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    final months = [
      'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
      'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
    ];
    return '${weekdays[date.weekday - 1]} ${date.day} ${months[date.month - 1]} ${date.year}';
  }

  /// Horaire formaté pour l'affichage
  String get formattedHoraire => '$horaireDebut - $horaireFin';

  PiscineSession copyWith({
    String? id,
    String? operationId,
    String? type,
    DateTime? date,
    String? lieu,
    String? horaireDebut,
    String? horaireFin,
    List<SessionAssignment>? accueil,
    List<SessionAssignment>? baptemes,
    Map<String, List<SessionAssignment>>? gonflage,
    Map<String, LevelAssignment>? niveaux,
    Map<String, LevelAssignment>? theorie,
    String? statut,
    DateTime? createdAt,
    DateTime? updatedAt,
    String? createdBy,
  }) {
    return PiscineSession(
      id: id ?? this.id,
      operationId: operationId ?? this.operationId,
      type: type ?? this.type,
      date: date ?? this.date,
      lieu: lieu ?? this.lieu,
      horaireDebut: horaireDebut ?? this.horaireDebut,
      horaireFin: horaireFin ?? this.horaireFin,
      accueil: accueil ?? this.accueil,
      baptemes: baptemes ?? this.baptemes,
      gonflage: gonflage ?? this.gonflage,
      niveaux: niveaux ?? this.niveaux,
      theorie: theorie ?? this.theorie,
      statut: statut ?? this.statut,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      createdBy: createdBy ?? this.createdBy,
    );
  }
}
