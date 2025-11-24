import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface NewActivityStats {
  transactions: number;
  operations: number;
  demandes: number;
  total: number;
  lastChecked: Date;
}

/**
 * Service pour suivre les nouvelles activités depuis la dernière visite
 */
export class ActivityTrackingService {
  /**
   * Récupère le nombre de nouveaux éléments depuis une date donnée
   * @param clubId ID du club
   * @param sinceDate Date de référence (généralement lastLogin)
   * @returns Statistiques des nouveautés
   */
  static async getNewActivitySince(
    clubId: string,
    sinceDate: Date
  ): Promise<NewActivityStats> {
    try {
      // Limiter à 30 jours max pour éviter les grosses requêtes
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const effectiveSinceDate = sinceDate < thirtyDaysAgo ? thirtyDaysAgo : sinceDate;

      const sinceTimestamp = Timestamp.fromDate(effectiveSinceDate);

      // Requêtes en parallèle pour performance optimale
      const [transactionsCount, operationsCount, demandesCount] = await Promise.all([
        this.countNewTransactions(clubId, sinceTimestamp),
        this.countNewOperations(clubId, sinceTimestamp),
        this.countNewDemandes(clubId, sinceTimestamp)
      ]);

      return {
        transactions: transactionsCount,
        operations: operationsCount,
        demandes: demandesCount,
        total: transactionsCount + operationsCount + demandesCount,
        lastChecked: new Date()
      };
    } catch (error) {
      console.error('Erreur lors du calcul des nouveautés:', error);
      return {
        transactions: 0,
        operations: 0,
        demandes: 0,
        total: 0,
        lastChecked: new Date()
      };
    }
  }

  /**
   * Compte les nouvelles transactions depuis une date
   */
  private static async countNewTransactions(
    clubId: string,
    sinceDate: Timestamp
  ): Promise<number> {
    try {
      const txRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
      const q = query(
        txRef,
        where('created_at', '>', sinceDate)
      );
      const snapshot = await getDocs(q);
      return snapshot.size;
    } catch (error) {
      console.error('Erreur comptage transactions:', error);
      return 0;
    }
  }

  /**
   * Compte les nouvelles opérations (événements, cotisations, etc.) depuis une date
   */
  private static async countNewOperations(
    clubId: string,
    sinceDate: Timestamp
  ): Promise<number> {
    try {
      const opsRef = collection(db, 'clubs', clubId, 'operations');
      const q = query(
        opsRef,
        where('created_at', '>', sinceDate)
      );
      const snapshot = await getDocs(q);
      return snapshot.size;
    } catch (error) {
      console.error('Erreur comptage opérations:', error);
      return 0;
    }
  }

  /**
   * Compte les nouvelles demandes de remboursement depuis une date
   */
  private static async countNewDemandes(
    clubId: string,
    sinceDate: Timestamp
  ): Promise<number> {
    try {
      const demandesRef = collection(db, 'clubs', clubId, 'demandes_remboursement');
      const q = query(
        demandesRef,
        where('created_at', '>', sinceDate)
      );
      const snapshot = await getDocs(q);
      return snapshot.size;
    } catch (error) {
      console.error('Erreur comptage demandes:', error);
      return 0;
    }
  }
}
