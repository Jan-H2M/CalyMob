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

/// Configuration complète d'une séance piscine
class PiscineSession {
  final String id;
  final String operationId;
  final DateTime date;
  final String lieu;
  final String horaireDebut;
  final String horaireFin;
  final List<SessionAssignment> accueil;
  final List<SessionAssignment> baptemes;
  final Map<String, LevelAssignment> niveaux;
  final String statut;
  final DateTime createdAt;
  final DateTime updatedAt;
  final String createdBy;

  PiscineSession({
    required this.id,
    required this.operationId,
    required this.date,
    required this.lieu,
    required this.horaireDebut,
    required this.horaireFin,
    required this.accueil,
    required this.baptemes,
    required this.niveaux,
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
        // Créer un niveau vide si pas présent
        niveaux[level] = LevelAssignment(encadrants: []);
      }
    }

    return PiscineSession(
      id: doc.id,
      operationId: data['operation_id'] ?? '',
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
      niveaux: niveaux,
      statut: data['statut'] ?? PiscineSessionStatus.brouillon,
      createdAt:
          (data['created_at'] as Timestamp?)?.toDate() ?? DateTime.now(),
      updatedAt:
          (data['updated_at'] as Timestamp?)?.toDate() ?? DateTime.now(),
      createdBy: data['created_by'] ?? '',
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'operation_id': operationId,
      'date': Timestamp.fromDate(date),
      'lieu': lieu,
      'horaire_debut': horaireDebut,
      'horaire_fin': horaireFin,
      'accueil': accueil.map((e) => e.toMap()).toList(),
      'baptemes': baptemes.map((e) => e.toMap()).toList(),
      'niveaux': niveaux.map((key, value) => MapEntry(key, value.toMap())),
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

  /// Obtenir tous les encadrants (tous niveaux confondus)
  List<SessionAssignment> get allEncadrants {
    final all = <SessionAssignment>[];
    for (final level in niveaux.values) {
      all.addAll(level.encadrants);
    }
    all.addAll(baptemes);
    return all;
  }

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
    DateTime? date,
    String? lieu,
    String? horaireDebut,
    String? horaireFin,
    List<SessionAssignment>? accueil,
    List<SessionAssignment>? baptemes,
    Map<String, LevelAssignment>? niveaux,
    String? statut,
    DateTime? createdAt,
    DateTime? updatedAt,
    String? createdBy,
  }) {
    return PiscineSession(
      id: id ?? this.id,
      operationId: operationId ?? this.operationId,
      date: date ?? this.date,
      lieu: lieu ?? this.lieu,
      horaireDebut: horaireDebut ?? this.horaireDebut,
      horaireFin: horaireFin ?? this.horaireFin,
      accueil: accueil ?? this.accueil,
      baptemes: baptemes ?? this.baptemes,
      niveaux: niveaux ?? this.niveaux,
      statut: statut ?? this.statut,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      createdBy: createdBy ?? this.createdBy,
    );
  }
}
