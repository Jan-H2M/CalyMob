import '../models/palanquee.dart';

/// Résultat de validation pour un message individuel
class ValidationMessage {
  /// Code machine (ex: 'INVALID_PAIR', 'ZELANDE_SIZE')
  final String code;

  /// Message humain en français
  final String message;

  /// Référence MIL 2026 (ex: '§1.7.1', '§5.1')
  final String? rule;

  const ValidationMessage({
    required this.code,
    required this.message,
    this.rule,
  });
}

/// Résultat de validation d'une palanquée
class ValidationResult {
  /// true si aucune erreur bloquante
  bool valid;

  /// Erreurs bloquantes (composition interdite)
  final List<ValidationMessage> errors;

  /// Avertissements (recommandations)
  final List<ValidationMessage> warnings;

  /// Profondeur max calculée pour cette palanquée (null si non autorisé)
  final int? maxDepth;

  ValidationResult({
    required this.valid,
    required this.errors,
    required this.warnings,
    this.maxDepth,
  });
}

// ============================================================
// Hiérarchie des niveaux (pour tri et comparaison)
// ============================================================

const Map<String, int> niveauHierarchy = {
  'NB': 0,
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  'AM': 5,
  'MC': 6,
  'MF': 7,
  'MN': 8,
};

// ============================================================
// Matrice de profondeur LIFRAS MIL 2026 (§1.7.1)
// ============================================================

/// Matrice symétrique: depthMatrix[niveauA][niveauB] = profondeur max en mètres.
/// null = combinaison non autorisée.
const Map<String, Map<String, int?>> defaultDepthMatrix = {
  'NB': {'NB': null, '1': null, '2': null, '3': null, '4': null, 'AM': 15, 'MC': 15, 'MF': 15, 'MN': 15},
  '1':  {'NB': null, '1': null, '2': null, '3': 20, '4': 20, 'AM': 20, 'MC': 20, 'MF': 20, 'MN': 20},
  '2':  {'NB': null, '1': null, '2': 20, '3': 30, '4': 40, 'AM': 40, 'MC': 40, 'MF': 40, 'MN': 40},
  '3':  {'NB': null, '1': 20, '2': 30, '3': 40, '4': 40, 'AM': 40, 'MC': 40, 'MF': 40, 'MN': 40},
  '4':  {'NB': null, '1': 20, '2': 40, '3': 40, '4': 60, 'AM': 60, 'MC': 60, 'MF': 60, 'MN': 60},
  'AM': {'NB': 15, '1': 20, '2': 40, '3': 40, '4': 60, 'AM': 60, 'MC': 60, 'MF': 60, 'MN': 60},
  'MC': {'NB': 15, '1': 20, '2': 40, '3': 40, '4': 60, 'AM': 60, 'MC': 60, 'MF': 60, 'MN': 60},
  'MF': {'NB': 15, '1': 20, '2': 40, '3': 40, '4': 60, 'AM': 60, 'MC': 60, 'MF': 60, 'MN': 60},
  'MN': {'NB': 15, '1': 20, '2': 40, '3': 40, '4': 60, 'AM': 60, 'MC': 60, 'MF': 60, 'MN': 60},
};

// ============================================================
// Helper functions
// ============================================================

/// Normalise un niveau vers un code standardisé.
/// Accepte: "2*", "2★", "Plongeur 2*", "MC", "Moniteur Club", etc.
String normalizeLevelCode(String niveau) {
  if (niveau.isEmpty) return '';

  final normalized = niveau.trim().toLowerCase();

  // Non Breveté
  if (normalized == 'nb' || normalized.contains('non breveté') || normalized.contains('non brevete')) return 'NB';

  // Plongeur 1-4★
  if (normalized.contains('plongeur 1') || normalized == '1' || normalized == '1★' || normalized == '1*') return '1';
  if (normalized.contains('plongeur 2') || normalized == '2' || normalized == '2★' || normalized == '2*') return '2';
  if (normalized.contains('plongeur 3') || normalized == '3' || normalized == '3★' || normalized == '3*') return '3';
  if (normalized.contains('plongeur 4') || normalized == '4' || normalized == '4★' || normalized == '4*') return '4';

  // Moniteurs (check MN first to avoid false matches)
  if (normalized.contains('moniteur national') || normalized == 'mn') return 'MN';
  if (normalized.contains('moniteur club') || normalized == 'mc') return 'MC';
  if (normalized.contains('moniteur fédéral') || normalized.contains('moniteur federal') || normalized == 'mf') return 'MF';

  // Assistant Moniteur
  if (normalized.contains('assistant moniteur') || normalized == 'am') return 'AM';

  // Fallback: strip stars
  final stripped = niveau.trim().replaceAll('★', '*').replaceAll('*', '');
  if (['1', '2', '3', '4'].contains(stripped)) return stripped;
  final upper = stripped.toUpperCase();
  if (['NB', 'AM', 'MC', 'MF', 'MN'].contains(upper)) return upper;

  return niveau.trim();
}

/// Profondeur max pour une paire de niveaux.
({int? depth, bool allowed}) getMaxDepthForPair(String level1, String level2) {
  final l1 = normalizeLevelCode(level1);
  final l2 = normalizeLevelCode(level2);

  final row = defaultDepthMatrix[l1];
  if (row == null) return (depth: null, allowed: false);
  final depth = row[l2];
  return (depth: depth, allowed: depth != null);
}

/// Vérifie si un niveau est "chef de palanquée" (min 3★)
bool isChefDePalanquee(String level) {
  final code = normalizeLevelCode(level);
  return ['3', '4', 'AM', 'MC', 'MF', 'MN'].contains(code);
}

/// Vérifie si un niveau peut encadrer un NB (AM, MC, MF, MN)
/// MIL 2026 §1.7.1: AM est dans la même colonne que MC/MF/MN
bool isMoniteur(String level) {
  final code = normalizeLevelCode(level);
  return ['AM', 'MC', 'MF', 'MN'].contains(code);
}

// ============================================================
// Validation d'une palanquée
// ============================================================

/// Valide la composition d'une palanquée selon les règles LIFRAS MIL 2026.
ValidationResult validatePalanquee(
  List<PalanqueeParticipant> participants, {
  String? lieuType,
}) {
  final errors = <ValidationMessage>[];
  final warnings = <ValidationMessage>[];
  int? maxDepth;

  // Palanquée vide
  if (participants.isEmpty) {
    return ValidationResult(valid: true, errors: [], warnings: [], maxDepth: null);
  }

  // Un seul plongeur
  if (participants.length == 1) {
    errors.add(const ValidationMessage(
      code: 'MIN_SIZE',
      message: 'Une palanquée doit avoir minimum 2 plongeurs.',
      rule: '§1.7',
    ));
    return ValidationResult(valid: false, errors: errors, warnings: warnings, maxDepth: null);
  }

  // Normaliser les niveaux
  final levels = participants.map((p) => normalizeLevelCode(p.niveau)).toList();

  // Pré-calculer la supervision
  final hasMoniteurInGroup = levels.any((l) => isMoniteur(l));
  final hasCPInGroup = levels.any((l) => isChefDePalanquee(l));

  // --- Vérifier chaque paire ---
  int globalMaxDepth = 999999; // Infinity equivalent

  for (int i = 0; i < levels.length; i++) {
    for (int j = i + 1; j < levels.length; j++) {
      final pair = getMaxDepthForPair(levels[i], levels[j]);
      if (!pair.allowed) {
        // NB+NB autorisé si un moniteur est dans la palanquée
        if (levels[i] == 'NB' && levels[j] == 'NB' && hasMoniteurInGroup) continue;
        // 1★+1★ autorisé si un CP (3★+) est présent
        if (levels[i] == '1' && levels[j] == '1' && hasCPInGroup) continue;

        final labelI = levels[i].isNotEmpty ? levels[i] : participants[i].niveau;
        final labelJ = levels[j].isNotEmpty ? levels[j] : participants[j].niveau;
        errors.add(ValidationMessage(
          code: 'INVALID_PAIR',
          message: '${participants[i].membreNom} ($labelI) ne peut pas plonger avec ${participants[j].membreNom} ($labelJ).',
          rule: '§1.7.1 Limitations de profondeur',
        ));
      } else if (pair.depth != null) {
        if (pair.depth! < globalMaxDepth) {
          globalMaxDepth = pair.depth!;
        }
      }
    }
  }

  // Si NB + moniteur: max depth NB
  if (hasMoniteurInGroup && levels.any((l) => l == 'NB')) {
    const nbMaxDepth = 15;
    if (globalMaxDepth == 999999) {
      globalMaxDepth = nbMaxDepth;
    } else if (nbMaxDepth < globalMaxDepth) {
      globalMaxDepth = nbMaxDepth;
    }
  }
  // Si 1★ + CP: max depth 1★
  if (hasCPInGroup && levels.any((l) => l == '1')) {
    const oneStarMaxDepth = 20;
    if (globalMaxDepth == 999999) {
      globalMaxDepth = oneStarMaxDepth;
    } else if (oneStarMaxDepth < globalMaxDepth) {
      globalMaxDepth = oneStarMaxDepth;
    }
  }

  maxDepth = globalMaxDepth == 999999 ? null : globalMaxDepth;

  // --- Règles spécifiques 1★ (§1.7.3) ---
  final count1Star = levels.where((l) => l == '1').length;
  if (count1Star > 0) {
    if (count1Star > 4) {
      errors.add(ValidationMessage(
        code: 'MAX_1STAR',
        message: 'Maximum 4 plongeurs 1★ par palanquée (actuellement $count1Star).',
        rule: '§1.7.3 Limitations du plongeur 1★',
      ));
    }

    // Chef de palanquée obligatoire
    if (!levels.any((l) => isChefDePalanquee(l))) {
      errors.add(const ValidationMessage(
        code: 'NO_CP_FOR_1STAR',
        message: 'Un chef de palanquée (min. 3★) est obligatoire pour encadrer des plongeurs 1★.',
        rule: '§1.7.3 Limitations du plongeur 1★',
      ));
    }

    // No Deco obligatoire
    warnings.add(const ValidationMessage(
      code: 'NO_DECO_REQUIRED',
      message: 'Plongée dans la courbe sans palier (No Deco) obligatoire avec des plongeurs 1★.',
      rule: '§1.7.3 Limitations du plongeur 1★',
    ));

    // Contact physique
    if (count1Star > 1) {
      warnings.add(ValidationMessage(
        code: 'PHYSICAL_CONTACT',
        message: 'Le chef de palanquée doit pouvoir établir un contact physique avec les $count1Star plongeurs 1★ à tout moment.',
        rule: '§1.7.3 Limitations du plongeur 1★',
      ));
    }
  }

  // --- Règles spécifiques NB (§8 Plongée Découverte) ---
  final countNB = levels.where((l) => l == 'NB').length;
  final countMoniteur = levels.where((l) => isMoniteur(l)).length;
  if (countNB > 0) {
    // NB ne peut plonger qu'avec MC/MF/MN
    if (countMoniteur == 0) {
      errors.add(const ValidationMessage(
        code: 'NB_NEEDS_MONITEUR',
        message: 'Un plongeur Non Breveté ne peut plonger qu\'avec un Moniteur Club (MC) minimum.',
        rule: '§1.7.2 Limitations du plongeur non breveté',
      ));
    }

    // Max NB par moniteur
    if (countMoniteur > 0 && countNB > countMoniteur) {
      errors.add(ValidationMessage(
        code: 'NB_MAX_PER_MONITEUR',
        message: 'Maximum 1 plongeur NB par moniteur ($countNB NB pour $countMoniteur moniteur${countMoniteur > 1 ? 's' : ''}).',
        rule: '§8 Plongée Découverte',
      ));
    }

    // Max taille palanquée avec NB
    if (participants.length > 3) {
      errors.add(ValidationMessage(
        code: 'NB_MAX_PALANQUEE_SIZE',
        message: 'Palanquée Découverte: maximum 3 plongeurs. Actuellement ${participants.length}.',
        rule: '§8 Plongée Découverte',
      ));
    }

    warnings.add(const ValidationMessage(
      code: 'NB_DECOUVERTE',
      message: 'Plongée Découverte: max 15m, contact physique permanent avec le NB obligatoire.',
      rule: '§8 Plongée Découverte',
    ));
  }

  // --- Règles spécifiques 2★+2★ ---
  final count2Star = levels.where((l) => l == '2').length;
  if (count2Star >= 2 && levels.every((l) => l == '2')) {
    warnings.add(const ValidationMessage(
      code: 'AGE_CHECK_2STAR',
      message: 'Deux plongeurs 2★ ensemble: les deux doivent avoir 18 ans accomplis.',
      rule: '§25.1.2 Prérogatives plongeur 2★',
    ));
  }

  // --- Règles Zélande (§5.1) ---
  if (lieuType == 'Zélande') {
    if (participants.length > 3) {
      errors.add(ValidationMessage(
        code: 'ZELANDE_MAX_SIZE',
        message: 'En Zélande, une palanquée ne peut dépasser 3 plongeurs (actuellement ${participants.length}).',
        rule: '§5.1 Règles particulières LIFRAS - Zélande',
      ));
    }
    if (participants.length == 3) {
      warnings.add(const ValidationMessage(
        code: 'ZELANDE_3_NODECO',
        message: 'En Zélande, une palanquée de 3 plongeurs doit plonger dans la courbe sans palier (No Deco).',
        rule: '§5.1 Règles particulières LIFRAS - Zélande',
      ));
    }
    // Rappels matériel
    warnings.add(const ValidationMessage(
      code: 'ZELANDE_EQUIPMENT',
      message: 'Zélande: lampe de plongée obligatoire + une dragonne par palanquée.',
      rule: '§5.1 Règles particulières LIFRAS - Zélande',
    ));
  }

  // --- Recommandation profondeur 4★ (§1.7.4) ---
  final has4StarOrAbove = levels.any((l) => ['4', 'AM', 'MC', 'MF', 'MN'].contains(l));
  if (has4StarOrAbove && maxDepth != null && maxDepth! > 40) {
    if (lieuType != null && ['Carrière', 'Lac'].contains(lieuType)) {
      warnings.add(const ValidationMessage(
        code: 'DEPTH_REC_LAKE',
        message: 'En lacs et carrières: il est recommandé de ne pas dépasser 40m.',
        rule: '§1.7.4 Recommandations de profondeur',
      ));
    }
    warnings.add(const ValidationMessage(
      code: 'DEPTH_REC_AIR',
      message: 'Il est recommandé de ne pas dépasser 60m lors de l\'utilisation de l\'air comme gaz fond.',
      rule: '§1.7.4 Recommandations de profondeur',
    ));
  }

  return ValidationResult(
    valid: errors.isEmpty,
    errors: errors,
    warnings: warnings,
    maxDepth: maxDepth,
  );
}

// ============================================================
// Validation de toutes les palanquées
// ============================================================

/// Valide toutes les palanquées ensemble (pour les règles inter-palanquées).
Map<int, ValidationResult> validateAllPalanquees(
  List<Palanquee> palanquees, {
  String? lieuType,
}) {
  final results = <int, ValidationResult>{};

  // Valider chaque palanquée individuellement
  for (final pal in palanquees) {
    final result = validatePalanquee(pal.participants, lieuType: lieuType);
    results[pal.numero] = result;
  }

  // --- Règles inter-palanquées Zélande (§5.1) ---
  if (lieuType == 'Zélande') {
    final palanqueesOf3 = palanquees.where((p) => p.participants.length == 3).toList();
    if (palanqueesOf3.length > 1) {
      for (final pal in palanqueesOf3) {
        final result = results[pal.numero];
        if (result != null) {
          result.errors.add(ValidationMessage(
            code: 'ZELANDE_MULTI_3',
            message: 'En Zélande, max 1 palanquée de 3 autorisée (${palanqueesOf3.length} trouvées).',
            rule: '§5.1 Règles particulières LIFRAS - Zélande',
          ));
          result.valid = false;
        }
      }
    }

    // Préférer paires
    final totalDivers = palanquees.fold<int>(0, (sum, p) => sum + p.participants.length);
    final isOdd = totalDivers % 2 != 0;
    if (!isOdd && palanqueesOf3.isNotEmpty) {
      for (final pal in palanqueesOf3) {
        final result = results[pal.numero];
        if (result != null) {
          result.warnings.add(const ValidationMessage(
            code: 'ZELANDE_PREFER_PAIRS',
            message: 'Nombre total de plongeurs pair: toutes les palanquées doivent être de 2 plongeurs.',
            rule: '§5.1 Règles particulières LIFRAS - Zélande',
          ));
        }
      }
    }
  }

  return results;
}
