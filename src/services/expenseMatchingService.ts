import { TransactionBancaire, DemandeRemboursement } from '@/types';
import { ReconciliationService } from './reconciliationService';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, updateDoc, query, where } from 'firebase/firestore';

export interface MatchResult {
  transaction_id: string;
  demande_id: string;
  transaction: TransactionBancaire;
  demande: DemandeRemboursement;
  confidence: number;
  reason: string;
}

export interface BatchMatchResults {
  autoLinked: MatchResult[];
  suggested: MatchResult[];
  unmatched: {
    transactions: TransactionBancaire[];
    demandes: DemandeRemboursement[];
  };
  errors: string[];
}

/**
 * Service pour la liaison automatique entre transactions bancaires et demandes de remboursement
 */
export class ExpenseMatchingService {

  /**
   * Charge toutes les transactions de dépense non liées
   */
  private static async loadUnlinkedExpenseTransactions(clubId: string): Promise<TransactionBancaire[]> {
    const transactionsRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
    const snapshot = await getDocs(transactionsRef);

    return snapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data(),
        date_execution: doc.data().date_execution?.toDate?.() || new Date(doc.data().date_execution),
        date_valeur: doc.data().date_valeur?.toDate?.() || new Date(doc.data().date_valeur),
        created_at: doc.data().created_at?.toDate?.() || new Date(),
        updated_at: doc.data().updated_at?.toDate?.() || new Date()
      } as TransactionBancaire))
      .filter(t =>
        t.montant < 0 && // Dépense (sortie d'argent)
        !t.expense_claim_id && // Pas déjà liée
        !t.is_parent // Pas une transaction ventilée
      );
  }

  /**
   * Charge toutes les demandes approuvées non remboursées
   */
  private static async loadPendingExpenseClaims(clubId: string): Promise<DemandeRemboursement[]> {
    const demandesRef = collection(db, 'clubs', clubId, 'demandes_remboursement');
    const snapshot = await getDocs(demandesRef);

    return snapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data(),
        date_demande: doc.data().date_demande?.toDate?.() || new Date(doc.data().date_demande),
        date_depense: doc.data().date_depense?.toDate?.() || new Date(doc.data().date_depense),
        date_approbation: doc.data().date_approbation?.toDate?.() || doc.data().date_approbation,
        created_at: doc.data().created_at?.toDate?.() || new Date(),
        updated_at: doc.data().updated_at?.toDate?.() || new Date()
      } as DemandeRemboursement))
      .filter(d =>
        d.statut === 'approuve' &&
        !d.transaction_id
      );
  }

  /**
   * Trouve les correspondances entre transactions et demandes
   */
  private static findMatches(
    transactions: TransactionBancaire[],
    demandes: DemandeRemboursement[]
  ): { autoLinked: MatchResult[], suggested: MatchResult[] } {
    const autoLinked: MatchResult[] = [];
    const suggested: MatchResult[] = [];
    const usedDemandeIds = new Set<string>();

    for (const transaction of transactions) {
      // Chercher la meilleure correspondance parmi les demandes non encore matchées
      const availableDemandes = demandes.filter(d => !usedDemandeIds.has(d.id));

      const reconciliationResult = ReconciliationService.matchWithExpenseClaims(
        transaction,
        availableDemandes
      );

      if (reconciliationResult && reconciliationResult.matched_with.type === 'expense_claim') {
        const demande = availableDemandes.find(d => d.id === reconciliationResult.matched_with.id);
        if (!demande) continue;

        const matchResult: MatchResult = {
          transaction_id: transaction.id,
          demande_id: demande.id,
          transaction,
          demande,
          confidence: reconciliationResult.matched_with.confidence,
          reason: this.buildMatchReason(transaction, demande, reconciliationResult.matched_with.confidence)
        };

        // Auto-lier si confiance élevée (≥85%)
        if (reconciliationResult.matched_with.confidence >= 85) {
          autoLinked.push(matchResult);
          usedDemandeIds.add(demande.id);
        }
        // Suggérer pour validation si confiance moyenne (60-84%)
        else if (reconciliationResult.matched_with.confidence >= 60) {
          suggested.push(matchResult);
          usedDemandeIds.add(demande.id);
        }
      }
    }

    return { autoLinked, suggested };
  }

  /**
   * Construit une explication de pourquoi le match a été fait
   */
  private static buildMatchReason(
    transaction: TransactionBancaire,
    demande: DemandeRemboursement,
    confidence: number
  ): string {
    const reasons: string[] = [];

    // Vérifier le montant
    const montantMatch = Math.abs(Math.abs(transaction.montant) - demande.montant) <= 0.01;
    if (montantMatch) {
      reasons.push(`montant exact (${Math.abs(transaction.montant).toFixed(2)}€)`);
    }

    // Vérifier le nom
    const nomSimilarity = this.calculateNameSimilarity(
      transaction.contrepartie_nom,
      demande.demandeur_nom || ''
    );
    if (nomSimilarity > 70) {
      reasons.push(`nom similaire (${nomSimilarity.toFixed(0)}%)`);
    }

    // Vérifier la date
    if (demande.date_approbation) {
      const daysDiff = Math.abs(
        (transaction.date_execution.getTime() - demande.date_approbation.getTime()) /
        (1000 * 60 * 60 * 24)
      );
      if (daysDiff <= 14) {
        reasons.push(`date proche (${Math.round(daysDiff)} jours)`);
      }
    }

    // Vérifier la communication
    if (transaction.communication && demande.description) {
      const commLower = transaction.communication.toLowerCase();
      const descLower = demande.description.toLowerCase().substring(0, 20);
      if (commLower.includes(descLower)) {
        reasons.push('description trouvée dans communication');
      }
    }

    return reasons.length > 0
      ? `Confiance ${confidence}%: ${reasons.join(', ')}`
      : `Confiance ${confidence}%`;
  }

  /**
   * Calcule la similarité entre deux noms
   */
  private static calculateNameSimilarity(name1: string, name2: string): number {
    const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    const n1 = normalize(name1);
    const n2 = normalize(name2);

    if (n1 === n2) return 100;
    if (n1.length === 0 || n2.length === 0) return 0;

    // Simple similarité basée sur inclusion
    if (n1.includes(n2) || n2.includes(n1)) {
      return 80;
    }

    // Comparaison de mots
    const words1 = n1.split(/\s+/);
    const words2 = n2.split(/\s+/);
    const commonWords = words1.filter(w => words2.includes(w));

    if (commonWords.length > 0) {
      return (commonWords.length / Math.max(words1.length, words2.length)) * 100;
    }

    return 0;
  }

  /**
   * Lie une transaction à une demande dans Firestore
   */
  private static async linkTransactionToDemand(
    clubId: string,
    transactionId: string,
    demandeId: string
  ): Promise<void> {
    // Mettre à jour la transaction
    const transactionRef = doc(db, 'clubs', clubId, 'transactions_bancaires', transactionId);
    await updateDoc(transactionRef, {
      expense_claim_id: demandeId,
      updated_at: new Date()
    });

    // Mettre à jour la demande
    const demandeRef = doc(db, 'clubs', clubId, 'demandes_remboursement', demandeId);
    await updateDoc(demandeRef, {
      transaction_id: transactionId,
      statut: 'rembourse',
      date_remboursement: new Date(),
      updated_at: new Date()
    });
  }

  /**
   * Fonction principale : effectue le matching automatique batch
   */
  static async performBatchMatching(
    clubId: string,
    autoLinkHighConfidence: boolean = true
  ): Promise<BatchMatchResults> {
    const results: BatchMatchResults = {
      autoLinked: [],
      suggested: [],
      unmatched: {
        transactions: [],
        demandes: []
      },
      errors: []
    };

    try {
      // 1. Charger les données
      const transactions = await this.loadUnlinkedExpenseTransactions(clubId);
      const demandes = await this.loadPendingExpenseClaims(clubId);

      // 2. Trouver les correspondances
      const { autoLinked, suggested } = this.findMatches(transactions, demandes);

      // 3. Lier automatiquement si demandé
      if (autoLinkHighConfidence) {
        for (const match of autoLinked) {
          try {
            await this.linkTransactionToDemand(clubId, match.transaction_id, match.demande_id);
            results.autoLinked.push(match);
          } catch (error) {
            results.errors.push(
              `Erreur liaison ${match.transaction.contrepartie_nom}: ${error}`
            );
          }
        }
      } else {
        // Si pas d'auto-link, ajouter aux suggestions
        results.suggested.push(...autoLinked);
      }

      results.suggested.push(...suggested);

      // 4. Identifier les non-matchés
      const linkedTransactionIds = new Set([
        ...results.autoLinked.map(r => r.transaction_id),
        ...results.suggested.map(r => r.transaction_id)
      ]);
      const linkedDemandeIds = new Set([
        ...results.autoLinked.map(r => r.demande_id),
        ...results.suggested.map(r => r.demande_id)
      ]);

      results.unmatched.transactions = transactions.filter(
        t => !linkedTransactionIds.has(t.id)
      );
      results.unmatched.demandes = demandes.filter(
        d => !linkedDemandeIds.has(d.id)
      );

    } catch (error) {
      results.errors.push(`Erreur globale: ${error}`);
    }

    return results;
  }

  /**
   * Lie manuellement une transaction à une demande (pour les suggestions)
   */
  static async linkManually(
    clubId: string,
    transactionId: string,
    demandeId: string
  ): Promise<void> {
    await this.linkTransactionToDemand(clubId, transactionId, demandeId);
  }
}
