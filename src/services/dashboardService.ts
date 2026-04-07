import { collection, query, where, getDocs, Timestamp, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { startOfMonth, endOfMonth, startOfDay, endOfDay, subMonths } from 'date-fns';
import { FiscalYear, TransactionBancaire, DemandeRemboursement, Evenement, Membre } from '@/types';
import { FiscalYearService } from './fiscalYearService';
import { logger } from '@/utils/logger';

export interface FiscalYearStats {
  total_revenus: number;
  total_depenses: number;
  solde_net: number;
  nombre_transactions: number;
  nombre_revenus: number;
  nombre_depenses: number;
}

export interface MonthStats {
  revenus_mois: number;
  depenses_mois: number;
  variation_revenus_pct: number;
  variation_depenses_pct: number;
  nombre_transactions: number;
}

export interface MemberStats {
  total_membres: number;
  membres_actifs: number;
  nouveaux_ce_mois: number;
}

export interface EventStats {
  evenements_a_venir: number;
  evenements_du_mois: number;
  total_participants: number;
}

export interface PendingActionsStats {
  demandes_attente: number;
  transactions_non_reconciliees: number;
  evenements_sans_budget: number;
}

export interface ReconciliationStats {
  total_transactions: number;
  transactions_reconciliees: number;
  taux_reconciliation: number;
}

export interface MonthlyBreakdown {
  mois: string; // Format: "2025-01" pour janvier 2025
  mois_nom: string; // Format: "Janvier 2025"
  revenus: number;
  depenses: number;
  nombre_transactions: number;
}

export interface FinancialSummary {
  solde_debut: number;
  total_revenus: number;
  total_depenses: number;
  solde_avant_epargne: number;
  solde_epargne: number;
  solde_total: number;
}

export interface CountStats {
  nombre_transactions: number;
  nombre_evenements: number;
  nombre_depenses: number;
}

export interface MonthlyComparison {
  mois: string;           // "01" pour janvier
  mois_nom: string;       // "Janvier"
  annee_courante: {
    annee: number;
    revenus: number;
    depenses: number;
  };
  annee_precedente: {
    annee: number;
    revenus: number;
    depenses: number;
  };
  variations: {
    revenus_pct: number;
    depenses_pct: number;
  };
}

export class DashboardService {
  /**
   * Obtenir la répartition mensuelle des revenus et dépenses
   */
  static async getMonthlyBreakdown(clubId: string, fiscalYear: FiscalYear): Promise<MonthlyBreakdown[]> {
    try {
      const txRef = collection(db, 'clubs', clubId, 'transactions_bancaires');

      // Query pour toutes les transactions de l'année fiscale
      const q = query(
        txRef,
        where('date_execution', '>=', Timestamp.fromDate(startOfDay(fiscalYear.start_date))),
        where('date_execution', '<=', Timestamp.fromDate(endOfDay(fiscalYear.end_date)))
      );

      const snapshot = await getDocs(q);

      // Obtenir le numéro de compte courant pour filtrer
      const currentAccountNumber = fiscalYear.account_numbers?.bank_current;
      const normalizedCurrentAccount = currentAccountNumber?.replace(/\s/g, '');

      // Grouper par mois
      const monthlyData: Record<string, { revenus: number; depenses: number; nombre_transactions: number }> = {};

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const montant = data.montant || 0;

        // Exclure les transactions ventilées (parents)
        if (data.is_parent) return;

        // Ne compter que les transactions du compte courant
        if (normalizedCurrentAccount) {
          const normalizedTxAccount = data.numero_compte?.replace(/\s/g, '') || '';
          if (normalizedTxAccount !== normalizedCurrentAccount) return;
        }

        // Extraire le mois (format: "2025-01")
        const date = data.date_execution?.toDate();
        if (!date) return;

        const moisKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

        if (!monthlyData[moisKey]) {
          monthlyData[moisKey] = { revenus: 0, depenses: 0, nombre_transactions: 0 };
        }

        monthlyData[moisKey].nombre_transactions++;

        if (montant > 0) {
          monthlyData[moisKey].revenus += montant;
        } else if (montant < 0) {
          monthlyData[moisKey].depenses += Math.abs(montant);
        }
      });

      // Convertir en tableau et trier par date
      const moisNoms = [
        'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
        'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
      ];

      return Object.entries(monthlyData)
        .map(([mois, data]) => {
          const [year, month] = mois.split('-');
          const monthIndex = parseInt(month) - 1;
          return {
            mois,
            mois_nom: `${moisNoms[monthIndex]} ${year}`,
            revenus: data.revenus,
            depenses: data.depenses,
            nombre_transactions: data.nombre_transactions
          };
        })
        .sort((a, b) => a.mois.localeCompare(b.mois));
    } catch (error) {
      logger.error('Erreur lors du calcul de la répartition mensuelle:', error);
      throw error;
    }
  }

  /**
   * Calculer le résumé financier
   */
  static async getFinancialSummary(clubId: string, fiscalYear: FiscalYear): Promise<FinancialSummary> {
    try {
      // Soldes de début
      const solde_debut = fiscalYear.opening_balances.bank_current;
      const solde_epargne = await FiscalYearService.calculateCurrentBalance(clubId, 'savings');

      // Calculer les totaux de l'année
      const stats = await this.getFiscalYearStats(clubId, fiscalYear);

      return {
        solde_debut,
        total_revenus: stats.total_revenus,
        total_depenses: stats.total_depenses,
        solde_avant_epargne: solde_debut + stats.total_revenus - stats.total_depenses,
        solde_epargne,
        solde_total: solde_debut + stats.total_revenus - stats.total_depenses + solde_epargne
      };
    } catch (error) {
      logger.error('Erreur lors du calcul du résumé financier:', error);
      throw error;
    }
  }

  /**
   * Calculer les statistiques de l'année fiscale
   */
  static async getFiscalYearStats(clubId: string, fiscalYear: FiscalYear): Promise<FiscalYearStats> {
    try {
      const txRef = collection(db, 'clubs', clubId, 'transactions_bancaires');

      // Query pour toutes les transactions de l'année fiscale
      const q = query(
        txRef,
        where('date_execution', '>=', Timestamp.fromDate(startOfDay(fiscalYear.start_date))),
        where('date_execution', '<=', Timestamp.fromDate(endOfDay(fiscalYear.end_date)))
      );

      const snapshot = await getDocs(q);

      let total_revenus = 0;
      let total_depenses = 0;
      let nombre_revenus = 0;
      let nombre_depenses = 0;

      // Obtenir le numéro de compte courant pour filtrer
      const currentAccountNumber = fiscalYear.account_numbers?.bank_current;
      const normalizedCurrentAccount = currentAccountNumber?.replace(/\s/g, '');

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const montant = data.montant || 0;

        // Exclure les transactions ventilées (parents)
        if (data.is_parent) {
          return;
        }

        // Ne compter que les transactions du compte courant pour éviter le double comptage
        // (les virements internes entre compte courant et épargne seraient comptés 2 fois sinon)
        if (normalizedCurrentAccount) {
          const normalizedTxAccount = data.numero_compte?.replace(/\s/g, '') || '';
          if (normalizedTxAccount !== normalizedCurrentAccount) {
            return;
          }
        }

        if (montant > 0) {
          total_revenus += montant;
          nombre_revenus++;
        } else if (montant < 0) {
          total_depenses += Math.abs(montant);
          nombre_depenses++;
        }
      });

      return {
        total_revenus,
        total_depenses,
        solde_net: total_revenus - total_depenses,
        nombre_transactions: snapshot.size,
        nombre_revenus,
        nombre_depenses
      };
    } catch (error) {
      logger.error('Erreur lors du calcul des stats de l\'année fiscale:', error);
      throw error;
    }
  }

  /**
   * Calculer les statistiques du mois en cours
   */
  static async getCurrentMonthStats(clubId: string): Promise<MonthStats> {
    try {
      const now = new Date();
      const startMonth = startOfMonth(now);
      const endMonth = endOfMonth(now);

      // Charger la fiscal year pour obtenir le numéro de compte courant
      const fiscalYear = await FiscalYearService.getCurrentFiscalYear(clubId);
      const currentAccountNumber = fiscalYear?.account_numbers?.bank_current;
      const normalizedCurrentAccount = currentAccountNumber?.replace(/\s/g, '');

      const txRef = collection(db, 'clubs', clubId, 'transactions_bancaires');

      // Stats du mois en cours
      const qCurrent = query(
        txRef,
        where('date_execution', '>=', Timestamp.fromDate(startMonth)),
        where('date_execution', '<=', Timestamp.fromDate(endMonth))
      );

      const snapshotCurrent = await getDocs(qCurrent);

      let revenus_mois = 0;
      let depenses_mois = 0;
      let nombre_transactions = 0;

      snapshotCurrent.docs.forEach(doc => {
        const data = doc.data();
        const montant = data.montant || 0;

        // Exclure les transactions ventilées (parents)
        if (data.is_parent) {
          return;
        }

        // Ne compter que les transactions du compte courant pour éviter le double comptage
        if (normalizedCurrentAccount) {
          const normalizedTxAccount = data.numero_compte?.replace(/\s/g, '') || '';
          if (normalizedTxAccount !== normalizedCurrentAccount) {
            return;
          }
        }

        nombre_transactions++;

        if (montant > 0) {
          revenus_mois += montant;
        } else if (montant < 0) {
          depenses_mois += Math.abs(montant);
        }
      });

      // Stats du mois précédent pour comparaison
      const startPrevMonth = startOfMonth(subMonths(now, 1));
      const endPrevMonth = endOfMonth(subMonths(now, 1));

      const qPrev = query(
        txRef,
        where('date_execution', '>=', Timestamp.fromDate(startPrevMonth)),
        where('date_execution', '<=', Timestamp.fromDate(endPrevMonth))
      );

      const snapshotPrev = await getDocs(qPrev);

      let revenus_mois_precedent = 0;
      let depenses_mois_precedent = 0;

      snapshotPrev.docs.forEach(doc => {
        const data = doc.data();
        const montant = data.montant || 0;

        if (data.is_parent) {
          return;
        }

        // Ne compter que les transactions du compte courant pour éviter le double comptage
        if (normalizedCurrentAccount) {
          const normalizedTxAccount = data.numero_compte?.replace(/\s/g, '') || '';
          if (normalizedTxAccount !== normalizedCurrentAccount) {
            return;
          }
        }

        if (montant > 0) {
          revenus_mois_precedent += montant;
        } else if (montant < 0) {
          depenses_mois_precedent += Math.abs(montant);
        }
      });

      // Calculer les variations
      const variation_revenus_pct = revenus_mois_precedent > 0
        ? ((revenus_mois - revenus_mois_precedent) / revenus_mois_precedent) * 100
        : 0;

      const variation_depenses_pct = depenses_mois_precedent > 0
        ? ((depenses_mois - depenses_mois_precedent) / depenses_mois_precedent) * 100
        : 0;

      return {
        revenus_mois,
        depenses_mois,
        variation_revenus_pct,
        variation_depenses_pct,
        nombre_transactions
      };
    } catch (error) {
      logger.error('Erreur lors du calcul des stats du mois:', error);
      throw error;
    }
  }

  /**
   * Calculer les statistiques des membres
   */
  static async getMemberStats(clubId: string): Promise<MemberStats> {
    try {
      const membersRef = collection(db, 'clubs', clubId, 'members');
      const snapshot = await getDocs(membersRef);

      let total_membres = 0;
      let membres_actifs = 0;
      let nouveaux_ce_mois = 0;

      const startMonth = startOfMonth(new Date());

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        total_membres++;

        if (data.actif || data.isActive) {
          membres_actifs++;
        }

        // Vérifier si créé ce mois
        const createdAt = data.created_at?.toDate ? data.created_at.toDate() : null;
        if (createdAt && createdAt >= startMonth) {
          nouveaux_ce_mois++;
        }
      });

      return {
        total_membres,
        membres_actifs,
        nouveaux_ce_mois
      };
    } catch (error) {
      logger.error('Erreur lors du calcul des stats membres:', error);
      throw error;
    }
  }

  /**
   * Calculer les statistiques des événements
   */
  static async getEventStats(clubId: string): Promise<EventStats> {
    try {
      // 🆕 MIGRATION: Read from 'operations' collection with type filter
      const eventsRef = collection(db, 'clubs', clubId, 'operations');

      const now = new Date();
      const startMonth = startOfMonth(now);
      const endMonth = endOfMonth(now);

      // Événements à venir (date_debut >= now et statut ouvert)
      // Filter by type only to avoid composite index requirement
      const qUpcoming = query(
        eventsRef,
        where('type', '==', 'evenement')
      );

      const snapshotUpcoming = await getDocs(qUpcoming);
      // Filter in memory to avoid composite index
      const evenements_a_venir = snapshotUpcoming.docs.filter(doc => {
        const data = doc.data();
        if (!data.date_debut || data.statut !== 'ouvert') return false;
        const dateDebut = data.date_debut instanceof Timestamp ? data.date_debut.toDate() : new Date(data.date_debut);
        return dateDebut >= now;
      }).length;

      // Événements du mois (date_debut entre startMonth et endMonth)
      // Reuse the same snapshot and filter in memory
      const evenements_du_mois = snapshotUpcoming.docs.filter(doc => {
        const data = doc.data();
        if (!data.date_debut) return false;
        const dateDebut = data.date_debut instanceof Timestamp ? data.date_debut.toDate() : new Date(data.date_debut);
        return dateDebut >= startMonth && dateDebut <= endMonth;
      }).length;

      // Total des participants (somme des inscriptions)
      const registrationsRef = collection(db, 'clubs', clubId, 'inscriptions_evenements');
      const snapshotRegistrations = await getDocs(registrationsRef);
      const total_participants = snapshotRegistrations.size;

      return {
        evenements_a_venir,
        evenements_du_mois,
        total_participants
      };
    } catch (error) {
      logger.error('Erreur lors du calcul des stats événements:', error);
      throw error;
    }
  }

  /**
   * Calculer les actions en attente
   */
  static async getPendingActions(clubId: string): Promise<PendingActionsStats> {
    try {
      // Demandes de remboursement en attente
      const demandesRef = collection(db, 'clubs', clubId, 'demandes_remboursement');
      const qDemandes = query(
        demandesRef,
        where('statut', 'in', ['en_attente', 'attente_2e_validation'])
      );
      const snapshotDemandes = await getDocs(qDemandes);
      const demandes_attente = snapshotDemandes.size;

      // Transactions non réconciliées
      const txRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
      const qTx = query(
        txRef,
        where('reconcilie', '==', false)
      );
      const snapshotTx = await getDocs(qTx);

      // Exclure les transactions ventilées (parents)
      const transactions_non_reconciliees = snapshotTx.docs.filter(doc => !doc.data().is_parent).length;

      // Événements sans budget (budget_prevu_revenus = 0 et statut ouvert)
      // 🆕 MIGRATION: Read from 'operations' collection with type filter
      const eventsRef = collection(db, 'clubs', clubId, 'operations');
      const qEvents = query(
        eventsRef,
        where('type', '==', 'evenement')
      );
      const snapshotEvents = await getDocs(qEvents);

      // Filter in memory for statut='ouvert' AND no budget
      const evenements_sans_budget = snapshotEvents.docs.filter(doc => {
        const data = doc.data();
        return data.statut === 'ouvert' &&
               (data.budget_prevu_revenus || 0) === 0 &&
               (data.budget_prevu_depenses || 0) === 0;
      }).length;

      return {
        demandes_attente,
        transactions_non_reconciliees,
        evenements_sans_budget
      };
    } catch (error) {
      logger.error('Erreur lors du calcul des actions en attente:', error);
      throw error;
    }
  }

  /**
   * Calculer le taux de réconciliation
   */
  static async getReconciliationStats(clubId: string): Promise<ReconciliationStats> {
    try {
      // Charger la fiscal year pour obtenir le numéro de compte courant
      const fiscalYear = await FiscalYearService.getCurrentFiscalYear(clubId);
      const currentAccountNumber = fiscalYear?.account_numbers?.bank_current;
      const normalizedCurrentAccount = currentAccountNumber?.replace(/\s/g, '');

      // ✅ FIX: Filtrer par année fiscale uniquement
      const txRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
      const q = query(
        txRef,
        where('date_execution', '>=', Timestamp.fromDate(startOfDay(fiscalYear.start_date))),
        where('date_execution', '<=', Timestamp.fromDate(endOfDay(fiscalYear.end_date)))
      );
      const snapshot = await getDocs(q);

      let total_transactions = 0;
      let transactions_reconciliees = 0;

      snapshot.docs.forEach(doc => {
        const data = doc.data();

        // Exclure les transactions ventilées (parents)
        if (data.is_parent) {
          return;
        }

        // Ne compter que les transactions du compte courant pour éviter le double comptage
        if (normalizedCurrentAccount) {
          const normalizedTxAccount = data.numero_compte?.replace(/\s/g, '') || '';
          if (normalizedTxAccount !== normalizedCurrentAccount) {
            return;
          }
        }

        total_transactions++;

        if (data.reconcilie) {
          transactions_reconciliees++;
        }
      });

      const taux_reconciliation = total_transactions > 0
        ? (transactions_reconciliees / total_transactions) * 100
        : 0;

      return {
        total_transactions,
        transactions_reconciliees,
        taux_reconciliation
      };
    } catch (error) {
      logger.error('Erreur lors du calcul du taux de réconciliation:', error);
      throw error;
    }
  }

  /**
   * Calculer les statistiques de codes comptables assignés (année fiscale courante uniquement)
   */
  static async getAccountingCodeStats(clubId: string): Promise<{
    total_transactions: number;
    transactions_avec_code: number;
    taux_codification: number;
  }> {
    try {
      // Charger la fiscal year pour filtrer les transactions
      const fiscalYear = await FiscalYearService.getCurrentFiscalYear(clubId);
      const currentAccountNumber = fiscalYear?.account_numbers?.bank_current;
      const normalizedCurrentAccount = currentAccountNumber?.replace(/\s/g, '');

      // Filtrer par année fiscale uniquement
      const txRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
      const q = query(
        txRef,
        where('date_execution', '>=', Timestamp.fromDate(startOfDay(fiscalYear.start_date))),
        where('date_execution', '<=', Timestamp.fromDate(endOfDay(fiscalYear.end_date)))
      );
      const snapshot = await getDocs(q);

      let total_transactions = 0;
      let transactions_avec_code = 0;

      snapshot.docs.forEach(doc => {
        const data = doc.data();

        // Exclure les transactions ventilées (parents)
        if (data.is_parent) {
          return;
        }

        // Ne compter que les transactions du compte courant
        if (normalizedCurrentAccount) {
          const normalizedTxAccount = data.numero_compte?.replace(/\s/g, '') || '';
          if (normalizedTxAccount !== normalizedCurrentAccount) {
            return;
          }
        }

        total_transactions++;

        // Vérifier si code comptable est assigné (non vide)
        if (data.code_comptable && data.code_comptable.trim() !== '') {
          transactions_avec_code++;
        }
      });

      const taux_codification = total_transactions > 0
        ? (transactions_avec_code / total_transactions) * 100
        : 0;

      return {
        total_transactions,
        transactions_avec_code,
        taux_codification
      };
    } catch (error) {
      logger.error('Erreur lors du calcul des codes comptables:', error);
      throw error;
    }
  }

  /**
   * Obtenir les statistiques de comptage (transactions, événements, dépenses)
   */
  static async getCountStats(clubId: string): Promise<CountStats> {
    try {
      // Charger la fiscal year pour obtenir le numéro de compte courant
      const fiscalYear = await FiscalYearService.getCurrentFiscalYear(clubId);
      const currentAccountNumber = fiscalYear?.account_numbers?.bank_current;
      const normalizedCurrentAccount = currentAccountNumber?.replace(/\s/g, '');

      logger.debug('=== DEBUG COUNT STATS ===');
      logger.debug('Fiscal Year:', fiscalYear?.year);
      logger.debug('Période:', fiscalYear?.start_date, '→', fiscalYear?.end_date);
      logger.debug('IBAN configuré:', currentAccountNumber);
      logger.debug('IBAN normalisé:', normalizedCurrentAccount);

      // 1. Compter les transactions (compte courant uniquement, année fiscale en cours)
      let nombre_transactions = 0;
      let total_in_period = 0;
      let excluded_parent = 0;
      let excluded_wrong_account = 0;

      if (fiscalYear) {
        const txRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
        const q = query(
          txRef,
          where('date_execution', '>=', Timestamp.fromDate(startOfDay(fiscalYear.start_date))),
          where('date_execution', '<=', Timestamp.fromDate(endOfDay(fiscalYear.end_date)))
        );
        const snapshot = await getDocs(q);
        total_in_period = snapshot.size;

        logger.debug('Total transactions dans la période:', total_in_period);

        snapshot.docs.forEach(doc => {
          const data = doc.data();

          // Exclure les transactions ventilées (parents)
          if (data.is_parent) {
            excluded_parent++;
            return;
          }

          // Si IBAN compte courant configuré, filtrer par compte
          if (normalizedCurrentAccount) {
            const normalizedTxAccount = data.numero_compte?.replace(/\s/g, '').toUpperCase() || '';
            const normalizedFYAccount = normalizedCurrentAccount.toUpperCase();

            if (normalizedTxAccount === normalizedFYAccount) {
              nombre_transactions++;
            } else {
              excluded_wrong_account++;
            }
          } else {
            // Si pas d'IBAN configuré, compter toutes les transactions
            nombre_transactions++;
          }
        });
      } else {
        logger.debug('⚠️ Aucune année fiscale active trouvée');
      }

      // 2. Compter tous les événements
      // 🆕 MIGRATION: Read from 'operations' collection with type filter
      const eventsRef = collection(db, 'clubs', clubId, 'operations');
      const eventsQuery = query(eventsRef, where('type', '==', 'evenement'));
      const eventsSnapshot = await getDocs(eventsQuery);
      const nombre_evenements = eventsSnapshot.size;

      // 3. Compter toutes les demandes de remboursement
      const demandesRef = collection(db, 'clubs', clubId, 'demandes_remboursement');
      const demandesSnapshot = await getDocs(demandesRef);
      const nombre_depenses = demandesSnapshot.size;

      return {
        nombre_transactions,
        nombre_evenements,
        nombre_depenses
      };
    } catch (error) {
      logger.error('Erreur lors du calcul des statistiques de comptage:', error);
      throw error;
    }
  }

  /**
   * Obtenir la comparaison année par année (mois par mois)
   */
  static async getYearOverYearComparison(
    clubId: string,
    currentFY: FiscalYear,
    previousFY: FiscalYear
  ): Promise<MonthlyComparison[]> {
    try {
      const txRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
      const currentAccountNumber = currentFY.account_numbers?.bank_current;
      const normalizedCurrentAccount = currentAccountNumber?.replace(/\s/g, '');

      // Charger les transactions de l'année courante
      const qCurrent = query(
        txRef,
        where('date_execution', '>=', Timestamp.fromDate(startOfDay(currentFY.start_date))),
        where('date_execution', '<=', Timestamp.fromDate(endOfDay(currentFY.end_date)))
      );
      const snapshotCurrent = await getDocs(qCurrent);

      // Charger les transactions de l'année précédente
      const qPrevious = query(
        txRef,
        where('date_execution', '>=', Timestamp.fromDate(startOfDay(previousFY.start_date))),
        where('date_execution', '<=', Timestamp.fromDate(endOfDay(previousFY.end_date)))
      );
      const snapshotPrevious = await getDocs(qPrevious);

      // Grouper par mois calendaire (01-12)
      const currentYearData: Record<string, { revenus: number; depenses: number }> = {};
      const previousYearData: Record<string, { revenus: number; depenses: number }> = {};

      // Traiter les transactions de l'année courante
      snapshotCurrent.docs.forEach(doc => {
        const data = doc.data();
        const montant = data.montant || 0;

        // Exclure les parents
        if (data.is_parent) return;

        // Ne compter que le compte courant
        if (normalizedCurrentAccount) {
          const normalizedTxAccount = data.numero_compte?.replace(/\s/g, '') || '';
          if (normalizedTxAccount !== normalizedCurrentAccount) return;
        }

        const date = data.date_execution?.toDate();
        if (!date) return;

        const moisKey = String(date.getMonth() + 1).padStart(2, '0');

        if (!currentYearData[moisKey]) {
          currentYearData[moisKey] = { revenus: 0, depenses: 0 };
        }

        if (montant > 0) {
          currentYearData[moisKey].revenus += montant;
        } else if (montant < 0) {
          currentYearData[moisKey].depenses += Math.abs(montant);
        }
      });

      // Traiter les transactions de l'année précédente
      snapshotPrevious.docs.forEach(doc => {
        const data = doc.data();
        const montant = data.montant || 0;

        if (data.is_parent) return;

        if (normalizedCurrentAccount) {
          const normalizedTxAccount = data.numero_compte?.replace(/\s/g, '') || '';
          if (normalizedTxAccount !== normalizedCurrentAccount) return;
        }

        const date = data.date_execution?.toDate();
        if (!date) return;

        const moisKey = String(date.getMonth() + 1).padStart(2, '0');

        if (!previousYearData[moisKey]) {
          previousYearData[moisKey] = { revenus: 0, depenses: 0 };
        }

        if (montant > 0) {
          previousYearData[moisKey].revenus += montant;
        } else if (montant < 0) {
          previousYearData[moisKey].depenses += Math.abs(montant);
        }
      });

      // Créer le tableau de comparaison
      const moisNoms = [
        'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
        'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
      ];

      const comparisons: MonthlyComparison[] = [];

      for (let i = 1; i <= 12; i++) {
        const moisKey = String(i).padStart(2, '0');
        const current = currentYearData[moisKey] || { revenus: 0, depenses: 0 };
        const previous = previousYearData[moisKey] || { revenus: 0, depenses: 0 };

        // Calculer les variations
        const revenus_pct = previous.revenus > 0
          ? ((current.revenus - previous.revenus) / previous.revenus) * 100
          : 0;

        const depenses_pct = previous.depenses > 0
          ? ((current.depenses - previous.depenses) / previous.depenses) * 100
          : 0;

        comparisons.push({
          mois: moisKey,
          mois_nom: moisNoms[i - 1],
          annee_courante: {
            annee: currentFY.year,
            revenus: current.revenus,
            depenses: current.depenses
          },
          annee_precedente: {
            annee: previousFY.year,
            revenus: previous.revenus,
            depenses: previous.depenses
          },
          variations: {
            revenus_pct,
            depenses_pct
          }
        });
      }

      return comparisons;
    } catch (error) {
      logger.error('Erreur lors du calcul de la comparaison année par année:', error);
      throw error;
    }
  }
}
