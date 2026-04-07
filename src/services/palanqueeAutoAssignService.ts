/**
 * Service d'attribution automatique des palanquées selon les règles LIFRAS MIL 2026
 *
 * Algorithme greedy:
 * 1. Trier les participants par niveau (du plus haut au plus bas)
 * 2. Constituer des palanquées en associant les niveaux compatibles
 * 3. Valider le résultat avec lifrasValidationService
 */

import type { PalanqueeParticipant, Palanquee } from '@/types/palanquee.types';
import { NIVEAU_HIERARCHY } from '@/utils/plongeurUtils';
import { normalizeLevelCode, getMaxDepthForPair, validateAllPalanquees } from './lifrasValidationService';
import type { LifrasRulesSettings } from '@/types/settings.types';

// ============================================================
// Types
// ============================================================

export interface AutoAssignResult {
  palanquees: Palanquee[];
  unassigned: PalanqueeParticipant[];
  warnings: string[];
}

// ============================================================
// Helpers
// ============================================================

/**
 * Retourne le rang hiérarchique d'un niveau (plus haut = meilleur encadrant)
 */
function getLevelRank(niveau: string): number {
  const code = normalizeLevelCode(niveau);
  return NIVEAU_HIERARCHY[code] ?? -1;
}

/**
 * Vérifie si deux participants peuvent plonger ensemble
 */
function canDiveTogether(a: PalanqueeParticipant, b: PalanqueeParticipant): boolean {
  const { allowed } = getMaxDepthForPair(a.niveau, b.niveau);
  return allowed;
}

/**
 * Vérifie si un participant peut rejoindre une palanquée existante
 */
function canJoinPalanquee(participant: PalanqueeParticipant, group: PalanqueeParticipant[]): boolean {
  return group.every(member => canDiveTogether(participant, member));
}

// ============================================================
// Algorithme principal
// ============================================================

/**
 * Attribue automatiquement les participants à des palanquées valides.
 *
 * @param participants - Tous les participants à assigner
 * @param lieuType - Type de lieu (important pour Zélande)
 * @param rules - Règles LIFRAS configurables (optionnel)
 * @returns Résultat avec palanquées créées, participants non assignables, et avertissements
 */
export function autoAssignPalanquees(
  participants: PalanqueeParticipant[],
  lieuType?: string,
  rules?: LifrasRulesSettings
): AutoAssignResult {
  const warnings: string[] = [];

  if (participants.length === 0) {
    return { palanquees: [], unassigned: [], warnings: [] };
  }

  if (participants.length === 1) {
    warnings.push('Un seul participant — impossible de former une palanquée.');
    return { palanquees: [], unassigned: [...participants], warnings };
  }

  // Déterminer la taille de groupe cible
  const isZelande = lieuType === 'Zélande';
  const maxGroupSize = isZelande ? 2 : 3;  // Zélande: paires obligatoires
  const totalCount = participants.length;

  // Trier par niveau décroissant (les encadrants en premier)
  const sorted = [...participants].sort((a, b) => {
    return getLevelRank(b.niveau) - getLevelRank(a.niveau);
  });

  const used = new Set<string>();
  const groups: PalanqueeParticipant[][] = [];

  // --- Phase 1: Pairer les encadrants avec les niveaux les plus bas ---
  // Stratégie: le meilleur encadrant prend le plongeur le plus faible

  const anchors: PalanqueeParticipant[] = [];
  const others: PalanqueeParticipant[] = [];

  for (const p of sorted) {
    const code = normalizeLevelCode(p.niveau);
    const rank = NIVEAU_HIERARCHY[code] ?? -1;
    // Encadrants: 3★ et plus
    if (rank >= 3) {
      anchors.push(p);
    } else {
      others.push(p);
    }
  }

  // Reverser "others" pour commencer par les plus faibles
  others.reverse();

  // --- Phase 2: Former les groupes ---
  // Chaque encadrant prend des plongeurs faibles en priorité

  for (const anchor of anchors) {
    if (used.has(anchor.membre_id)) continue;

    const group: PalanqueeParticipant[] = [anchor];
    used.add(anchor.membre_id);

    // Chercher un buddy parmi les non-assignés (priorité: plus faible)
    for (const other of others) {
      if (used.has(other.membre_id)) continue;
      if (group.length >= maxGroupSize) break;
      if (canJoinPalanquee(other, group)) {
        group.push(other);
        used.add(other.membre_id);
      }
    }

    // Si l'encadrant n'a pas de buddy, chercher parmi les autres encadrants
    if (group.length === 1) {
      for (const otherAnchor of anchors) {
        if (used.has(otherAnchor.membre_id)) continue;
        if (group.length >= maxGroupSize) break;
        if (canDiveTogether(anchor, otherAnchor)) {
          group.push(otherAnchor);
          used.add(otherAnchor.membre_id);
        }
      }
    }

    if (group.length >= 2) {
      groups.push(group);
    } else {
      // Remettre l'anchor dans le pool
      used.delete(anchor.membre_id);
    }
  }

  // --- Phase 3: Former des groupes avec les restants ---
  const remaining = sorted.filter(p => !used.has(p.membre_id));

  // Grouper les restants par paires/triplets compatibles
  for (let i = 0; i < remaining.length; i++) {
    if (used.has(remaining[i].membre_id)) continue;

    const group: PalanqueeParticipant[] = [remaining[i]];
    used.add(remaining[i].membre_id);

    for (let j = i + 1; j < remaining.length; j++) {
      if (used.has(remaining[j].membre_id)) continue;
      if (group.length >= maxGroupSize) break;
      if (canJoinPalanquee(remaining[j], group)) {
        group.push(remaining[j]);
        used.add(remaining[j].membre_id);
      }
    }

    if (group.length >= 2) {
      groups.push(group);
    } else {
      // Remettre dans unassigned
      used.delete(remaining[i].membre_id);
    }
  }

  // --- Phase 4: Zélande — si nombre impair, permettre UNE palanquée de 3 ---
  if (isZelande && totalCount % 2 !== 0) {
    const stillUnassigned = sorted.filter(p => !used.has(p.membre_id));
    if (stillUnassigned.length === 1 && groups.length > 0) {
      // Essayer d'ajouter le dernier participant à un groupe existant
      let added = false;
      for (const group of groups) {
        if (group.length === 2 && canJoinPalanquee(stillUnassigned[0], group)) {
          group.push(stillUnassigned[0]);
          used.add(stillUnassigned[0].membre_id);
          added = true;
          warnings.push(
            'Nombre impair de plongeurs en Zélande: une palanquée de 3 a été créée (No Deco obligatoire).'
          );
          break;
        }
      }
      if (!added) {
        warnings.push(
          `Impossible d'assigner ${stillUnassigned[0].membre_nom} ${stillUnassigned[0].membre_prenom} — aucune palanquée compatible en Zélande.`
        );
      }
    }
  }

  // --- Phase 5: Collecter les non-assignés ---
  const unassigned = sorted.filter(p => !used.has(p.membre_id));
  if (unassigned.length > 0) {
    const names = unassigned.map(p => `${p.membre_nom} ${p.membre_prenom} (${p.niveau})`);
    warnings.push(
      `${unassigned.length} plongeur(s) non assignable(s) selon les règles: ${names.join(', ')}`
    );
  }

  // --- Phase 6: Construire les palanquées numérotées ---
  const palanquees: Palanquee[] = groups.map((group, idx) => ({
    numero: idx + 1,
    participants: group.map((p, ordre) => ({ ...p, ordre })),
  }));

  // --- Phase 7: Valider le résultat ---
  const validationResults = validateAllPalanquees(palanquees, lieuType, rules);
  let hasErrors = false;
  for (const [numero, result] of validationResults) {
    if (!result.valid) {
      hasErrors = true;
      for (const err of result.errors) {
        warnings.push(`Palanquée ${numero}: ${err.message}`);
      }
    }
  }
  if (hasErrors) {
    warnings.push('Certaines palanquées ont des problèmes de composition. Vérifiez et ajustez manuellement.');
  }

  return { palanquees, unassigned, warnings };
}
