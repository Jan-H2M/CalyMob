import { TransactionBancaire } from '@/types';

/**
 * Service de suggestion de correspondances pour la réconciliation
 *
 * IMPORTANT: Ce service NE FAIT AUCUNE réconciliation automatique.
 * Il calcule uniquement des scores de pertinence pour aider à trier
 * les transactions manuellement.
 */

/**
 * Contexte pour le calcul de score de correspondance
 */
export interface MatchContext {
  type: 'inscription' | 'expense' | 'event';
  targetAmount?: number;
  targetName?: string;
  targetDate?: Date;
  eventDate?: Date; // Pour les inscriptions liées à un événement
}

/**
 * Résultat du calcul de score
 */
export interface MatchScore {
  score: number; // 0-100
  reasons: string[]; // Explications pour l'utilisateur
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Normalise une chaîne pour la comparaison
 * - Minuscules
 * - Sans accents
 * - Sans caractères spéciaux
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Enlever accents
    .replace(/[^a-z0-9\s]/g, '') // Enlever caractères spéciaux
    .replace(/\s+/g, ' ') // Normaliser espaces
    .trim();
}

/**
 * Calcule la similarité entre deux chaînes (Levenshtein normalisé)
 * Retourne un score de 0 à 100
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  const s1 = normalizeString(str1);
  const s2 = normalizeString(str2);

  if (s1 === s2) return 100;
  if (s1.length === 0 || s2.length === 0) return 0;

  // Vérifier si l'un contient l'autre
  if (s1.includes(s2) || s2.includes(s1)) {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    return (shorter.length / longer.length) * 90; // Max 90 pour inclusion partielle
  }

  const distance = levenshteinDistance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);
  return Math.max(0, ((maxLength - distance) / maxLength) * 100);
}

/**
 * Distance de Levenshtein (nombre de modifications nécessaires)
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // Substitution
          matrix[i][j - 1] + 1,     // Insertion
          matrix[i - 1][j] + 1      // Suppression
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Calcule la proximité entre deux montants
 * Retourne un score de 0 à 100
 */
function calculateAmountSimilarity(amount1: number, amount2: number): number {
  const diff = Math.abs(Math.abs(amount1) - Math.abs(amount2));

  // Match exact
  if (diff === 0) return 100;

  // Différence < 1 € → très proche
  if (diff < 1) return 95;

  // Différence < 5 € → proche
  if (diff < 5) return 80;

  // Différence < 10 € → moyen
  if (diff < 10) return 60;

  // Différence > 10% du montant → faible
  const percentDiff = (diff / Math.abs(amount2)) * 100;
  if (percentDiff > 10) return 0;

  return Math.max(0, 50 - percentDiff * 3);
}

/**
 * Calcule la proximité entre deux dates (en jours)
 * Retourne un score de 0 à 100
 */
function calculateDateProximity(date1: Date, date2: Date): number {
  const diffMs = Math.abs(date1.getTime() - date2.getTime());
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  // Même jour
  if (diffDays < 1) return 100;

  // Moins de 7 jours
  if (diffDays < 7) return 90;

  // Moins de 14 jours
  if (diffDays < 14) return 75;

  // Moins de 30 jours
  if (diffDays < 30) return 50;

  // Plus de 30 jours
  return Math.max(0, 30 - diffDays);
}

/**
 * Calcule le score de correspondance pour une transaction
 *
 * @param transaction Transaction bancaire à évaluer
 * @param context Contexte de la recherche (inscription, dépense, événement)
 * @returns Score de 0 à 100 avec explications
 */
export function calculateMatchScore(
  transaction: TransactionBancaire,
  context: MatchContext
): MatchScore {
  const reasons: string[] = [];
  let totalScore = 0;
  let weights = 0;

  // 1. Score de montant (poids: 40%)
  if (context.targetAmount !== undefined) {
    const amountScore = calculateAmountSimilarity(transaction.montant, context.targetAmount);
    totalScore += amountScore * 0.4;
    weights += 0.4;

    if (amountScore === 100) {
      reasons.push('Montant exact');
    } else if (amountScore >= 95) {
      reasons.push('Montant très proche');
    } else if (amountScore >= 80) {
      reasons.push('Montant proche');
    } else if (amountScore >= 60) {
      reasons.push('Montant similaire');
    }
  }

  // 2. Score de nom (poids: 40%)
  if (context.targetName) {
    let nameScore = 0;

    // Vérifier nom de contrepartie
    if (transaction.contrepartie_nom) {
      const counterpartScore = calculateStringSimilarity(
        transaction.contrepartie_nom,
        context.targetName
      );
      nameScore = Math.max(nameScore, counterpartScore);

      if (counterpartScore >= 80) {
        reasons.push('Nom correspond');
      }
    }

    // Vérifier communication
    if (transaction.communication) {
      const commScore = calculateStringSimilarity(
        transaction.communication,
        context.targetName
      );
      nameScore = Math.max(nameScore, commScore);

      if (commScore >= 80 && commScore > nameScore) {
        reasons.push('Nom dans communication');
      }
    }

    totalScore += nameScore * 0.4;
    weights += 0.4;
  }

  // 3. Score de date (poids: 20%)
  const relevantDate = context.eventDate || context.targetDate;
  if (relevantDate) {
    const dateScore = calculateDateProximity(transaction.date_execution, relevantDate);
    totalScore += dateScore * 0.2;
    weights += 0.2;

    if (dateScore === 100) {
      reasons.push('Même jour');
    } else if (dateScore >= 90) {
      reasons.push('Même semaine');
    } else if (dateScore >= 75) {
      reasons.push('Dans les 2 semaines');
    } else if (dateScore >= 50) {
      reasons.push('Même mois');
    }
  }

  // 4. Bonus: Type de transaction correspond (poids: bonus 10%)
  if (context.type === 'inscription' && transaction.montant > 0) {
    totalScore += 10;
    reasons.push('Revenu (inscription attendue)');
  } else if (context.type === 'expense' && transaction.montant < 0) {
    totalScore += 10;
    reasons.push('Dépense (remboursement attendu)');
  }

  // Normaliser le score final (0-100)
  const finalScore = weights > 0 ? Math.min(100, totalScore / weights * 100) : 0;

  // Déterminer le niveau de confiance
  let confidence: 'high' | 'medium' | 'low';
  if (finalScore >= 80) {
    confidence = 'high';
  } else if (finalScore >= 50) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return {
    score: Math.round(finalScore),
    reasons,
    confidence
  };
}

/**
 * Trie un tableau de transactions par pertinence
 *
 * @param transactions Transactions à trier
 * @param context Contexte de recherche
 * @returns Transactions triées avec leur score
 */
export function sortTransactionsByRelevance(
  transactions: TransactionBancaire[],
  context: MatchContext
): Array<{ transaction: TransactionBancaire; matchScore: MatchScore }> {
  // Calculer le score pour chaque transaction
  const withScores = transactions.map(transaction => ({
    transaction,
    matchScore: calculateMatchScore(transaction, context)
  }));

  // Trier par score décroissant
  withScores.sort((a, b) => b.matchScore.score - a.matchScore.score);

  return withScores;
}

/**
 * Groupe les transactions par montants similaires
 *
 * @param transactions Transactions à grouper
 * @param tolerance Tolérance en euros (défaut: 1€)
 * @returns Groupes de transactions avec montants similaires
 */
export function groupTransactionsByAmount(
  transactions: TransactionBancaire[],
  tolerance: number = 1
): Map<number, TransactionBancaire[]> {
  const groups = new Map<number, TransactionBancaire[]>();

  for (const tx of transactions) {
    const amount = Math.abs(tx.montant);

    // Chercher un groupe existant avec montant similaire
    let foundGroup = false;
    for (const [groupAmount, groupTxs] of groups.entries()) {
      if (Math.abs(groupAmount - amount) <= tolerance) {
        groupTxs.push(tx);
        foundGroup = true;
        break;
      }
    }

    // Créer un nouveau groupe si nécessaire
    if (!foundGroup) {
      groups.set(amount, [tx]);
    }
  }

  return groups;
}
