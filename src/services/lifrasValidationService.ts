/**
 * Service de validation des palanquées selon les règles LIFRAS MIL 2026
 *
 * Ce service est indépendant de l'UI (pure functions) et peut être réutilisé
 * dans le PalanqueeBuilder, le PDF, ou même des Cloud Functions.
 *
 * Les règles sont configurables via Firestore (clubs/{clubId}/settings/lifras_rules).
 * Si aucune configuration n'est fournie, les valeurs par défaut MIL 2026 sont utilisées.
 *
 * Source: https://mil.amb-lifras.be/ (MIL LIFRAS 2026 Webapp)
 */

import type { PalanqueeParticipant, Palanquee } from '@/types/palanquee.types';
import { calculatePlongeurCode } from '@/utils/plongeurUtils';
import { LifrasRulesSettings, DEFAULT_LIFRAS_RULES } from '@/types/settings.types';

// ============================================================
// Types
// ============================================================

export interface ValidationMessage {
  /** Code machine (ex: 'INVALID_PAIR', 'ZELANDE_SIZE') */
  code: string;
  /** Message humain en français */
  message: string;
  /** Référence MIL 2026 (ex: '§1.7.1', '§5.1') */
  rule?: string;
}

export interface ValidationResult {
  /** true si aucune erreur bloquante */
  valid: boolean;
  /** Erreurs bloquantes (composition interdite) */
  errors: ValidationMessage[];
  /** Avertissements (recommandations) */
  warnings: ValidationMessage[];
  /** Profondeur max calculée pour cette palanquée (null si non autorisé) */
  maxDepth: number | null;
}

// ============================================================
// Matrice de profondeur LIFRAS MIL 2026 (§1.7.1) — defaults
// ============================================================

/**
 * Matrice symétrique: DEPTH_MATRIX[niveauA][niveauB] = profondeur max en mètres.
 * null = combinaison non autorisée.
 *
 * Niveaux: NB, 1, 2, 3, 4, AM, MC, MF, MN
 * AM a les mêmes prérogatives que 4★ + encadrement
 * MC/MF/MN ont les mêmes prérogatives de profondeur (au-delà de 40m avec 4★)
 */
const DEPTH_MATRIX: Record<string, Record<string, number | null>> = DEFAULT_LIFRAS_RULES.depthMatrix;

// ============================================================
// Helper functions
// ============================================================

/**
 * Normalise un niveau vers un code standardisé.
 * Accepte: "2*", "2★", "Plongeur 2*", "MC", "Moniteur Club", etc.
 */
export function normalizeLevelCode(niveau: string): string {
  if (!niveau) return '';
  // D'abord essayer le calculatePlongeurCode qui gère les formes longues
  const code = calculatePlongeurCode(niveau);
  if (code) return code;
  // Sinon, traiter les formes courtes directement
  const n = niveau.trim().replace('★', '*').replace('*', '');
  if (['1', '2', '3', '4'].includes(n)) return n;
  const upper = n.toUpperCase();
  if (['NB', 'AM', 'MC', 'MF', 'MN'].includes(upper)) return upper;
  return niveau.trim();
}

/**
 * Profondeur max pour une paire de niveaux.
 * Accepte une matrice optionnelle (sinon utilise les defaults).
 */
export function getMaxDepthForPair(
  level1: string,
  level2: string,
  matrix?: Record<string, Record<string, number | null>>
): { depth: number | null; allowed: boolean } {
  const l1 = normalizeLevelCode(level1);
  const l2 = normalizeLevelCode(level2);
  const m = matrix || DEPTH_MATRIX;

  const row = m[l1];
  if (!row) return { depth: null, allowed: false };
  const depth = row[l2] ?? null;
  return { depth, allowed: depth !== null };
}

/**
 * Vérifie si un niveau est considéré comme "encadrant" (peut être chef de palanquée pour 1★)
 * Selon MIL 2026: min. 3★ ou "Guide de Palanquée"
 */
function isChefDePalanquee(level: string): boolean {
  const code = normalizeLevelCode(level);
  return ['3', '4', 'AM', 'MC', 'MF', 'MN'].includes(code);
}

/**
 * Vérifie si un niveau peut encadrer un NB (AM, MC, MF, MN)
 * MIL 2026 §1.7.1: AM est dans la même colonne que MC/MF/MN
 * MIL 2026 §8: AM peut diriger des baptêmes (AM.DB1, AM.DB2)
 */
function isMoniteur(level: string): boolean {
  const code = normalizeLevelCode(level);
  return ['AM', 'MC', 'MF', 'MN'].includes(code);
}

// ============================================================
// Validation d'une palanquée
// ============================================================

/**
 * Valide la composition d'une palanquée selon les règles LIFRAS MIL 2026.
 *
 * @param participants - Les participants de la palanquée
 * @param lieuType - Type de lieu (optionnel, pour règles Zélande etc.)
 * @param rules - Règles LIFRAS configurables (optionnel, sinon defaults MIL 2026)
 * @returns Résultat de validation avec erreurs, avertissements et profondeur max
 */
export function validatePalanquee(
  participants: PalanqueeParticipant[],
  lieuType?: string,
  rules?: LifrasRulesSettings
): ValidationResult {
  const errors: ValidationMessage[] = [];
  const warnings: ValidationMessage[] = [];
  let maxDepth: number | null = null;

  // Utiliser les règles fournies ou les defaults
  const r = rules || (DEFAULT_LIFRAS_RULES as LifrasRulesSettings);
  const matrix = r.depthMatrix || DEPTH_MATRIX;

  // Palanquée vide ou avec un seul plongeur
  if (participants.length === 0) {
    return { valid: true, errors: [], warnings: [], maxDepth: null };
  }

  if (participants.length === 1) {
    errors.push({
      code: 'MIN_SIZE',
      message: 'Une palanquée doit avoir minimum 2 plongeurs.',
      rule: '§1.7',
    });
    return { valid: false, errors, warnings, maxDepth: null };
  }

  // Normaliser les niveaux
  const levels = participants.map(p => normalizeLevelCode(p.niveau));

  // Pré-calculer la supervision présente dans la palanquée
  const hasMoniteurInGroup = levels.some(l => isMoniteur(l));  // AM/MC/MF/MN
  const hasCPInGroup = levels.some(l => isChefDePalanquee(l)); // 3★+

  // --- Vérifier chaque paire ---
  let globalMaxDepth: number = Infinity;

  for (let i = 0; i < levels.length; i++) {
    for (let j = i + 1; j < levels.length; j++) {
      const { depth, allowed } = getMaxDepthForPair(levels[i], levels[j], matrix);
      if (!allowed) {
        // NB+NB est autorisé si un moniteur (MC/MF/MN) est dans la palanquée
        // → la palanquée fonctionne en groupe sous supervision
        if (levels[i] === 'NB' && levels[j] === 'NB' && hasMoniteurInGroup) {
          continue;
        }
        // 1★+1★ est autorisé si un chef de palanquée (3★+) est présent
        if (levels[i] === '1' && levels[j] === '1' && hasCPInGroup) {
          continue;
        }
        const labelI = levels[i] || participants[i].niveau || '?';
        const labelJ = levels[j] || participants[j].niveau || '?';
        errors.push({
          code: 'INVALID_PAIR',
          message: `${participants[i].membre_nom} (${labelI}) ne peut pas plonger avec ${participants[j].membre_nom} (${labelJ}).`,
          rule: '§1.7.1 Limitations de profondeur',
        });
      } else if (depth !== null) {
        globalMaxDepth = Math.min(globalMaxDepth, depth);
      }
    }
  }

  // Si NB+moniteur ou 1★+CP: prendre la profondeur de la paire superviseur↔supervisé
  if (hasMoniteurInGroup && levels.some(l => l === 'NB')) {
    // Max depth pour NB selon les règles
    const nbMaxDepth = r.nbRules?.maxDepthNb ?? 15;
    globalMaxDepth = Math.min(globalMaxDepth === Infinity ? nbMaxDepth : globalMaxDepth, nbMaxDepth);
  }
  if (hasCPInGroup && levels.some(l => l === '1')) {
    // Max depth pour 1★ selon les règles
    const oneStarMaxDepth = r.oneStarRules?.maxDepth1Star ?? 20;
    globalMaxDepth = Math.min(globalMaxDepth === Infinity ? oneStarMaxDepth : globalMaxDepth, oneStarMaxDepth);
  }

  maxDepth = globalMaxDepth === Infinity ? null : globalMaxDepth;

  // --- Règles spécifiques 1★ (§1.7.3) ---
  const count1Star = levels.filter(l => l === '1').length;
  if (count1Star > 0) {
    const max1Star = r.oneStarRules?.max1StarPerPalanquee ?? 4;
    if (count1Star > max1Star) {
      errors.push({
        code: 'MAX_1STAR',
        message: `Maximum ${max1Star} plongeurs 1★ par palanquée (actuellement ${count1Star}).`,
        rule: '§1.7.3 Limitations du plongeur 1★',
      });
    }

    // Chef de palanquée obligatoire (min 3★)
    if (r.oneStarRules?.requireCP !== false) {
      const hasCP = levels.some(l => isChefDePalanquee(l));
      if (!hasCP) {
        errors.push({
          code: 'NO_CP_FOR_1STAR',
          message: 'Un chef de palanquée (min. 3★) est obligatoire pour encadrer des plongeurs 1★.',
          rule: '§1.7.3 Limitations du plongeur 1★',
        });
      }
    }

    // No Deco obligatoire
    if (r.oneStarRules?.noDecoRequired !== false) {
      warnings.push({
        code: 'NO_DECO_REQUIRED',
        message: 'Plongée dans la courbe sans palier (No Deco) obligatoire avec des plongeurs 1★.',
        rule: '§1.7.3 Limitations du plongeur 1★',
      });
    }

    // Contact physique
    if (count1Star > 1) {
      warnings.push({
        code: 'PHYSICAL_CONTACT',
        message: `Le chef de palanquée doit pouvoir établir un contact physique avec les ${count1Star} plongeurs 1★ à tout moment.`,
        rule: '§1.7.3 Limitations du plongeur 1★',
      });
    }
  }

  // --- Règles spécifiques NB (§8 Plongée Découverte) ---
  const countNB = levels.filter(l => l === 'NB').length;
  const countMoniteur = levels.filter(l => isMoniteur(l)).length;
  if (countNB > 0) {
    // NB ne peut plonger qu'avec MC/MF/MN
    if (r.nbRules?.requireMoniteur !== false && countMoniteur === 0) {
      errors.push({
        code: 'NB_NEEDS_MONITEUR',
        message: 'Un plongeur Non Breveté ne peut plonger qu\'avec un Moniteur Club (MC) minimum.',
        rule: '§1.7.2 Limitations du plongeur non breveté',
      });
    }

    // Max NB par moniteur (§8)
    const maxNbPerMoniteur = r.nbRules?.maxNbPerMoniteur ?? 1;
    if (countMoniteur > 0 && countNB > countMoniteur * maxNbPerMoniteur) {
      errors.push({
        code: 'NB_MAX_PER_MONITEUR',
        message: `Maximum ${maxNbPerMoniteur} plongeur${maxNbPerMoniteur > 1 ? 's' : ''} NB par moniteur (${countNB} NB pour ${countMoniteur} moniteur${countMoniteur > 1 ? 's' : ''}).`,
        rule: '§8 Plongée Découverte',
      });
    }

    // Max taille palanquée avec NB
    const maxPalSizeNb = r.nbRules?.maxPalanqueeSizeWithNb ?? 3;
    if (participants.length > maxPalSizeNb) {
      errors.push({
        code: 'NB_MAX_PALANQUEE_SIZE',
        message: `Palanquée Découverte: maximum ${maxPalSizeNb} plongeurs (moniteur + ${maxNbPerMoniteur} NB + éventuellement 1 accompagnant 2★+). Actuellement ${participants.length}.`,
        rule: '§8 Plongée Découverte',
      });
    }

    const nbMaxDepth = r.nbRules?.maxDepthNb ?? 15;
    warnings.push({
      code: 'NB_DECOUVERTE',
      message: `Plongée Découverte: max ${nbMaxDepth}m, contact physique permanent avec le NB obligatoire.`,
      rule: '§8 Plongée Découverte',
    });
  }

  // --- Règles spécifiques 2★+2★ ---
  const count2Star = levels.filter(l => l === '2').length;
  if (count2Star >= 2 && levels.every(l => l === '2') && r.twoStarRules?.requireAge18WithPeer !== false) {
    warnings.push({
      code: 'AGE_CHECK_2STAR',
      message: 'Deux plongeurs 2★ ensemble: les deux doivent avoir 18 ans accomplis.',
      rule: '§25.1.2 Prérogatives plongeur 2★',
    });
  }

  // --- Règles Zélande (§5.1) ---
  if (lieuType === 'Zélande') {
    const maxZealandSize = r.zealandRules?.maxPalanqueeSize ?? 3;
    if (participants.length > maxZealandSize) {
      errors.push({
        code: 'ZELANDE_MAX_SIZE',
        message: `En Zélande, une palanquée ne peut dépasser ${maxZealandSize} plongeurs (actuellement ${participants.length}).`,
        rule: '§5.1 Règles particulières LIFRAS - Zélande',
      });
    }
    if (participants.length === 3 && r.zealandRules?.palanqueeOf3NoDeco !== false) {
      warnings.push({
        code: 'ZELANDE_3_NODECO',
        message: 'En Zélande, une palanquée de 3 plongeurs doit plonger dans la courbe sans palier (No Deco).',
        rule: '§5.1 Règles particulières LIFRAS - Zélande',
      });
    }
    // Rappels matériel
    const equipWarnings: string[] = [];
    if (r.zealandRules?.requireLamp !== false) equipWarnings.push('lampe de plongée obligatoire');
    if (r.zealandRules?.requireDragonne !== false) equipWarnings.push('une dragonne par palanquée');
    if (equipWarnings.length > 0) {
      warnings.push({
        code: 'ZELANDE_EQUIPMENT',
        message: `Zélande: ${equipWarnings.join(' + ')}.`,
        rule: '§5.1 Règles particulières LIFRAS - Zélande',
      });
    }
  }

  // --- Recommandation profondeur 4★ (§1.7.4) ---
  const has4StarOrAbove = levels.some(l => ['4', 'AM', 'MC', 'MF', 'MN'].includes(l));
  if (has4StarOrAbove && maxDepth && maxDepth > (r.depthRecommendations?.maxDepthLakeQuarry ?? 40)) {
    if (lieuType && ['Carrière', 'Lac'].includes(lieuType)) {
      warnings.push({
        code: 'DEPTH_REC_LAKE',
        message: `En lacs et carrières: il est recommandé de ne pas dépasser ${r.depthRecommendations?.maxDepthLakeQuarry ?? 40}m.`,
        rule: '§1.7.4 Recommandations de profondeur',
      });
    }
    const maxAir = r.depthRecommendations?.maxDepthAir ?? 60;
    warnings.push({
      code: 'DEPTH_REC_AIR',
      message: `Il est recommandé de ne pas dépasser ${maxAir}m lors de l'utilisation de l'air comme gaz fond.`,
      rule: '§1.7.4 Recommandations de profondeur',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    maxDepth,
  };
}

// ============================================================
// Validation de toutes les palanquées
// ============================================================

/**
 * Valide toutes les palanquées ensemble (pour les règles inter-palanquées comme Zélande).
 *
 * @param palanquees - Toutes les palanquées de l'opération
 * @param lieuType - Type de lieu
 * @param rules - Règles LIFRAS configurables (optionnel)
 * @returns Map de numéro de palanquée → résultat de validation
 */
export function validateAllPalanquees(
  palanquees: Palanquee[],
  lieuType?: string,
  rules?: LifrasRulesSettings
): Map<number, ValidationResult> {
  const results = new Map<number, ValidationResult>();
  const r = rules || (DEFAULT_LIFRAS_RULES as LifrasRulesSettings);

  // Valider chaque palanquée individuellement
  for (const pal of palanquees) {
    const result = validatePalanquee(pal.participants, lieuType, r);
    results.set(pal.numero, result);
  }

  // --- Règles inter-palanquées Zélande (§5.1) ---
  if (lieuType === 'Zélande') {
    const maxPalOf3 = r.zealandRules?.maxPalanqueesOf3 ?? 1;
    const palanqueesOf3 = palanquees.filter(p => p.participants.length === 3);
    if (palanqueesOf3.length > maxPalOf3) {
      // Plus qu'autorisé → erreur sur chaque palanquée de 3
      for (const pal of palanqueesOf3) {
        const result = results.get(pal.numero);
        if (result) {
          result.errors.push({
            code: 'ZELANDE_MULTI_3',
            message: `En Zélande, max ${maxPalOf3} palanquée${maxPalOf3 > 1 ? 's' : ''} de 3 autorisée${maxPalOf3 > 1 ? 's' : ''} (${palanqueesOf3.length} trouvées).`,
            rule: '§5.1 Règles particulières LIFRAS - Zélande',
          });
          result.valid = false;
        }
      }
    }

    // En Zélande, préférer les palanquées de 2
    const totalDivers = palanquees.reduce((sum, p) => sum + p.participants.length, 0);
    const isOdd = totalDivers % 2 !== 0;
    if (!isOdd && palanqueesOf3.length > 0) {
      for (const pal of palanqueesOf3) {
        const result = results.get(pal.numero);
        if (result) {
          result.warnings.push({
            code: 'ZELANDE_PREFER_PAIRS',
            message: 'Nombre total de plongeurs pair: toutes les palanquées doivent être de 2 plongeurs.',
            rule: '§5.1 Règles particulières LIFRAS - Zélande',
          });
        }
      }
    }
  }

  return results;
}

/**
 * Export la matrice de profondeur pour utilisation externe (auto-assign, PDF, etc.)
 */
export { DEPTH_MATRIX };
