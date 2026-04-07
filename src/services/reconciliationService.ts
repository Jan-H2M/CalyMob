import {
  TransactionBancaire,
  DemandeRemboursement,
  ReconciliationResult
} from '@/types';

/**
 * Service de réconciliation automatique pour matcher les transactions bancaires
 * avec les demandes de remboursement.
 */
export class ReconciliationService {
  private static calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    if (s1 === s2) return 100;

    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    if (longer.length === 0) return 100;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return ((longer.length - editDistance) / longer.length) * 100;
  }

  private static levenshteinDistance(str1: string, str2: string): number {
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
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  private static normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private static amountsMatch(amount1: number, amount2: number, tolerance: number = 0.01): boolean {
    return Math.abs(Math.abs(amount1) - Math.abs(amount2)) <= tolerance;
  }

  private static datesAreClose(date1: Date, date2: Date, daysTolerance: number = 7): boolean {
    const diff = Math.abs(date1.getTime() - date2.getTime());
    const diffDays = diff / (1000 * 60 * 60 * 24);
    return diffDays <= daysTolerance;
  }

  static matchWithExpenseClaims(
    transaction: TransactionBancaire,
    claims: DemandeRemboursement[]
  ): ReconciliationResult | null {
    if (transaction.montant > 0) return null;

    let bestMatch: ReconciliationResult | null = null;
    let highestConfidence = 0;

    const pendingClaims = claims.filter(claim =>
      claim.statut === 'approuve' && !claim.transaction_id
    );

    for (const claim of pendingClaims) {
      let confidence = 0;

      const amountMatches = this.amountsMatch(
        Math.abs(transaction.montant),
        claim.montant
      );

      const nameSimilarity = this.calculateSimilarity(
        this.normalizeName(claim.demandeur_nom || ''),
        this.normalizeName(transaction.contrepartie_nom)
      );

      const dateIsClose = claim.date_approbation
        ? this.datesAreClose(transaction.date_execution, claim.date_approbation, 14)
        : false;

      const descriptionMatch = transaction.communication?.toLowerCase()
        .includes(claim.description.toLowerCase().substring(0, 20));

      if (amountMatches && nameSimilarity > 80 && dateIsClose) {
        confidence = 95;
      } else if (amountMatches && (nameSimilarity > 70 || descriptionMatch)) {
        confidence = 85;
      } else if (amountMatches && dateIsClose) {
        confidence = 75;
      } else if (nameSimilarity > 80 && dateIsClose) {
        confidence = 70;
      }

      if (confidence > highestConfidence) {
        highestConfidence = confidence;
        bestMatch = {
          transaction_id: transaction.id,
          matched_with: {
            type: 'expense_claim',
            id: claim.id,
            name: claim.description,
            confidence
          },
          suggested_action: confidence > 85 ? 'auto_reconcile' : 'manual_review'
        };
      }
    }

    return highestConfidence > 60 ? bestMatch : null;
  }

  static async performAutoReconciliation(
    transactions: TransactionBancaire[],
    expenseClaims?: DemandeRemboursement[]
  ): Promise<{
    autoReconciled: ReconciliationResult[];
    needsReview: ReconciliationResult[];
    splitSuggestions: ReconciliationResult[];
    unmatched: string[];
  }> {
    const results = {
      autoReconciled: [] as ReconciliationResult[],
      needsReview: [] as ReconciliationResult[],
      splitSuggestions: [] as ReconciliationResult[],
      unmatched: [] as string[]
    };

    const unreconciledTransactions = transactions.filter(transaction => !transaction.reconcilie && !transaction.is_split);

    for (const transaction of unreconciledTransactions) {
      let matched = false;

      if (expenseClaims) {
        const claimMatch = this.matchWithExpenseClaims(transaction, expenseClaims);

        if (claimMatch) {
          if (claimMatch.suggested_action === 'auto_reconcile') {
            results.autoReconciled.push(claimMatch);
          } else {
            results.needsReview.push(claimMatch);
          }
          matched = true;
        }
      }

      if (!matched) {
        results.unmatched.push(transaction.id);
      }
    }

    return results;
  }
}
