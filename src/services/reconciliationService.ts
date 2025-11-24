import { 
  TransactionBancaire, 
  InscriptionEvenement, 
  DemandeRemboursement,
  Membre,
  ReconciliationResult,
  TransactionSplit,
  VPDiveImport
} from '@/types';
import { VPDiveParticipant } from './vpDiveParser';

/**
 * Service de réconciliation automatique pour matcher les transactions bancaires
 * avec les participants VP Dive, demandes de remboursement, et membres
 */
export class ReconciliationService {
  
  /**
   * Calcule la similarité entre deux chaînes (algorithme de Levenshtein)
   */
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
  
  /**
   * Normalise un nom pour la comparaison
   */
  private static normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // Enlever caractères spéciaux
      .replace(/\s+/g, ' ') // Normaliser espaces
      .trim();
  }
  
  /**
   * Vérifie si les montants correspondent (avec tolérance)
   */
  private static amountsMatch(amount1: number, amount2: number, tolerance: number = 0.01): boolean {
    return Math.abs(Math.abs(amount1) - Math.abs(amount2)) <= tolerance;
  }
  
  /**
   * Vérifie si les dates sont proches (dans une fenêtre de temps)
   */
  private static datesAreClose(date1: Date, date2: Date, daysTolerance: number = 7): boolean {
    const diff = Math.abs(date1.getTime() - date2.getTime());
    const diffDays = diff / (1000 * 60 * 60 * 24);
    return diffDays <= daysTolerance;
  }
  
  /**
   * Recherche des correspondances avec les participants VP Dive
   */
  static matchWithVPDiveParticipants(
    transaction: TransactionBancaire,
    participants: VPDiveParticipant[],
    eventDate: Date
  ): ReconciliationResult | null {
    
    // Ne matcher que les transactions entrantes (revenus)
    if (transaction.montant < 0) return null;
    
    let bestMatch: ReconciliationResult | null = null;
    let highestConfidence = 0;
    
    for (const participant of participants) {
      let confidence = 0;
      
      // 1. Comparaison du nom
      const participantFullName = participant.nom;
      const transactionName = transaction.contrepartie_nom;
      const nameSimilarity = this.calculateSimilarity(
        this.normalizeName(participantFullName),
        this.normalizeName(transactionName)
      );
      
      // 2. Comparaison du montant
      const amountMatches = this.amountsMatch(
        transaction.montant,
        participant.montant || 0
      );
      
      // 3. Vérification de la date (proche de l'événement)
      const dateIsClose = this.datesAreClose(transaction.date_execution, eventDate, 30);
      
      // 4. Recherche du numéro de licence dans la communication
      const licenseMatch = participant.numero_licence && 
        transaction.communication?.includes(participant.numero_licence.split(' ')[0]);
      
      // Calcul du score de confiance
      if (nameSimilarity > 80 && amountMatches) {
        confidence = 95;
      } else if (nameSimilarity > 70 && amountMatches && dateIsClose) {
        confidence = 85;
      } else if (licenseMatch && amountMatches) {
        confidence = 90;
      } else if (nameSimilarity > 60 && dateIsClose) {
        confidence = 65;
      } else if (amountMatches && dateIsClose) {
        confidence = 60;
      } else {
        confidence = Math.max(nameSimilarity * 0.5, 0);
      }
      
      if (confidence > highestConfidence) {
        highestConfidence = confidence;
        bestMatch = {
          transaction_id: transaction.id,
          matched_with: {
            type: 'participant',
            id: `vpdive_${participant.nom}_${participant.numero_licence}`,
            name: participant.nom,
            confidence
          },
          suggested_action: confidence > 90 ? 'auto_reconcile' : 
                           confidence > 60 ? 'manual_review' : undefined
        };
      }
    }
    
    return highestConfidence > 50 ? bestMatch : null;
  }
  
  /**
   * Recherche des correspondances avec les demandes de remboursement
   */
  static matchWithExpenseClaims(
    transaction: TransactionBancaire,
    claims: DemandeRemboursement[]
  ): ReconciliationResult | null {
    
    // Ne matcher que les transactions sortantes (dépenses)
    if (transaction.montant > 0) return null;
    
    let bestMatch: ReconciliationResult | null = null;
    let highestConfidence = 0;
    
    // Filtrer les demandes approuvées non remboursées
    const pendingClaims = claims.filter(c => 
      c.statut === 'approuve' && !c.transaction_id
    );
    
    for (const claim of pendingClaims) {
      let confidence = 0;
      
      // 1. Comparaison du montant
      const amountMatches = this.amountsMatch(
        Math.abs(transaction.montant),
        claim.montant
      );
      
      // 2. Comparaison du nom
      const nameSimilarity = this.calculateSimilarity(
        this.normalizeName(claim.demandeur_nom || ''),
        this.normalizeName(transaction.contrepartie_nom)
      );
      
      // 3. Vérification de la date
      const dateIsClose = claim.date_approbation && 
        this.datesAreClose(transaction.date_execution, claim.date_approbation, 14);
      
      // 4. Recherche dans la communication
      const descriptionMatch = transaction.communication?.toLowerCase()
        .includes(claim.description.toLowerCase().substring(0, 20));
      
      // Calcul du score de confiance
      if (amountMatches && nameSimilarity > 80 && dateIsClose) {
        confidence = 95;
      } else if (amountMatches && (nameSimilarity > 70 || descriptionMatch)) {
        confidence = 85;
      } else if (amountMatches && dateIsClose) {
        confidence = 75;
      } else if (nameSimilarity > 80 && dateIsClose) {
        confidence = 70;
      } else {
        confidence = 0;
      }
      
      if (confidence > highestConfidence) {
        highestConfidence = confidence;
        bestMatch = {
          transaction_id: transaction.id,
          matched_with: {
            type: 'expense',
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
  
  /**
   * Suggère une ventilation pour une transaction avec plusieurs participants
   */
  static suggestTransactionSplits(
    transaction: TransactionBancaire,
    participants: VPDiveParticipant[]
  ): ReconciliationResult | null {
    
    // Vérifier si le montant total correspond à la somme de plusieurs participants
    const participantsWithAmount = participants.filter(p => p.montant && p.montant > 0);
    
    // Essayer différentes combinaisons
    for (let size = 2; size <= Math.min(5, participantsWithAmount.length); size++) {
      const combinations = this.getCombinations(participantsWithAmount, size);
      
      for (const combination of combinations) {
        const totalAmount = combination.reduce((sum, p) => sum + (p.montant || 0), 0);
        
        if (this.amountsMatch(transaction.montant, totalAmount, 0.10)) {
          // Vérifier si au moins un nom correspond
          const hasNameMatch = combination.some(p => {
            const similarity = this.calculateSimilarity(
              this.normalizeName(p.nom),
              this.normalizeName(transaction.contrepartie_nom)
            );
            return similarity > 50;
          });
          
          if (hasNameMatch || transaction.communication?.toLowerCase().includes('famille')) {
            // Créer les suggestions de split
            const splits: Omit<TransactionSplit, 'id' | 'created_at' | 'updated_at' | 'created_by'>[] = 
              combination.map(p => ({
                bank_transaction_id: transaction.id,
                description: `Paiement ${p.nom}`,
                amount: p.montant || 0,
                categorie: 'cotisation',
                membre_id: undefined, // À déterminer
                notes: `VP Dive: ${p.numero_licence}, Niveau: ${p.pratique}`,
                reconcilie: false
              }));
            
            return {
              transaction_id: transaction.id,
              matched_with: {
                type: 'participant',
                id: 'multiple',
                name: combination.map(p => p.nom).join(', '),
                confidence: hasNameMatch ? 80 : 65
              },
              suggested_action: 'split_transaction',
              suggested_splits: splits
            };
          }
        }
      }
    }
    
    return null;
  }
  
  /**
   * Génère des combinaisons de taille k depuis un tableau
   */
  private static getCombinations<T>(arr: T[], k: number): T[][] {
    if (k === 1) return arr.map(el => [el]);
    
    const combinations: T[][] = [];
    for (let i = 0; i <= arr.length - k; i++) {
      const head = arr.slice(i, i + 1);
      const tailCombinations = this.getCombinations(arr.slice(i + 1), k - 1);
      for (const tail of tailCombinations) {
        combinations.push(head.concat(tail));
      }
    }
    
    return combinations;
  }
  
  /**
   * Processus principal de réconciliation automatique
   */
  static async performAutoReconciliation(
    transactions: TransactionBancaire[],
    vpDiveImport?: VPDiveImport,
    participants?: VPDiveParticipant[],
    expenseClaims?: DemandeRemboursement[],
    eventDate?: Date
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
    
    // Filtrer les transactions non réconciliées
    const unreconciledTransactions = transactions.filter(t => !t.reconcilie && !t.is_split);
    
    for (const transaction of unreconciledTransactions) {
      let matched = false;
      
      // 1. Essayer de matcher avec les participants VP Dive
      if (participants && eventDate) {
        const participantMatch = this.matchWithVPDiveParticipants(
          transaction, 
          participants, 
          eventDate
        );
        
        if (participantMatch) {
          if (participantMatch.suggested_action === 'auto_reconcile') {
            results.autoReconciled.push(participantMatch);
          } else {
            results.needsReview.push(participantMatch);
          }
          matched = true;
        } else {
          // Essayer de suggérer une ventilation
          const splitSuggestion = this.suggestTransactionSplits(transaction, participants);
          if (splitSuggestion) {
            results.splitSuggestions.push(splitSuggestion);
            matched = true;
          }
        }
      }
      
      // 2. Essayer de matcher avec les demandes de remboursement
      if (!matched && expenseClaims) {
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
      
      // 3. Si aucune correspondance trouvée
      if (!matched) {
        results.unmatched.push(transaction.id);
      }
    }
    
    return results;
  }
  
  /**
   * Calcule le taux de réconciliation pour un import VP Dive
   */
  static calculateReconciliationRate(
    participants: VPDiveParticipant[],
    matchedTransactionIds: string[]
  ): {
    rate: number;
    totalExpected: number;
    totalMatched: number;
    unmatched: VPDiveParticipant[];
  } {
    const totalExpected = participants.filter(p => p.etat_paiement === 'Payé').length;
    const totalMatched = matchedTransactionIds.length;
    const rate = totalExpected > 0 ? (totalMatched / totalExpected) * 100 : 0;
    
    // Identifier les participants non matchés
    const unmatched = participants.filter(p => 
      p.etat_paiement === 'Payé' && 
      !matchedTransactionIds.includes(`vpdive_${p.nom}_${p.numero_licence}`)
    );
    
    return {
      rate,
      totalExpected,
      totalMatched,
      unmatched
    };
  }
}