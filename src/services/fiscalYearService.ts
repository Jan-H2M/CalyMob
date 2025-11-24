import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  Timestamp
} from 'firebase/firestore';
import { FiscalYear, TransactionBancaire } from '@/types';
import { addYears, isWithinInterval, parseISO, startOfDay, endOfDay } from 'date-fns';

/**
 * Service pour gérer les années fiscales et calcul des soldes
 * Conforme aux meilleures pratiques comptables belges et internationales
 */
export class FiscalYearService {

  /**
   * Récupérer toutes les années fiscales d'un club
   */
  static async getFiscalYears(clubId: string): Promise<FiscalYear[]> {
    try {
      const fyRef = collection(db, 'clubs', clubId, 'fiscal_years');
      const q = query(fyRef, orderBy('year', 'desc'));
      const snapshot = await getDocs(q);

      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          start_date: data.start_date?.toDate ? data.start_date.toDate() : new Date(data.start_date),
          end_date: data.end_date?.toDate ? data.end_date.toDate() : new Date(data.end_date),
          created_at: data.created_at?.toDate ? data.created_at.toDate() : new Date(data.created_at),
          updated_at: data.updated_at?.toDate ? data.updated_at.toDate() : new Date(data.updated_at),
          closed_at: data.closed_at?.toDate ? data.closed_at.toDate() : undefined,
        } as FiscalYear;
      });
    } catch (error) {
      console.error('Erreur lors du chargement des années fiscales:', error);
      throw error;
    }
  }

  /**
   * Récupérer l'année fiscale active (status = 'open')
   */
  static async getCurrentFiscalYear(clubId: string): Promise<FiscalYear | null> {
    try {
      const fyRef = collection(db, 'clubs', clubId, 'fiscal_years');
      const q = query(fyRef, where('status', '==', 'open'), orderBy('start_date', 'desc'));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        return null;
      }

      const doc = snapshot.docs[0];
      const data = doc.data();

      return {
        id: doc.id,
        ...data,
        start_date: data.start_date?.toDate ? data.start_date.toDate() : new Date(data.start_date),
        end_date: data.end_date?.toDate ? data.end_date.toDate() : new Date(data.end_date),
        created_at: data.created_at?.toDate ? data.created_at.toDate() : new Date(data.created_at),
        updated_at: data.updated_at?.toDate ? data.updated_at.toDate() : new Date(data.updated_at),
        closed_at: data.closed_at?.toDate ? data.closed_at.toDate() : undefined,
      } as FiscalYear;
    } catch (error) {
      console.error('Erreur lors du chargement de l\'année fiscale courante:', error);
      throw error;
    }
  }

  /**
   * Récupérer l'année fiscale précédente (année avant l'année active)
   */
  static async getPreviousFiscalYear(clubId: string): Promise<FiscalYear | null> {
    try {
      const fiscalYears = await this.getFiscalYears(clubId);

      // Les années sont triées par année décroissante
      // Si on a au moins 2 années, retourner la 2ème (année précédente)
      if (fiscalYears.length >= 2) {
        return fiscalYears[1];
      }

      return null;
    } catch (error) {
      console.error('Erreur lors du chargement de l\'année fiscale précédente:', error);
      throw error;
    }
  }

  /**
   * Trouver l'année fiscale qui contient une date donnée
   */
  static async getFiscalYearByDate(clubId: string, date: Date): Promise<FiscalYear | null> {
    try {
      const fiscalYears = await this.getFiscalYears(clubId);

      return fiscalYears.find(fy =>
        isWithinInterval(date, {
          start: startOfDay(fy.start_date),
          end: endOfDay(fy.end_date)
        })
      ) || null;
    } catch (error) {
      console.error('Erreur lors de la recherche de l\'année fiscale:', error);
      throw error;
    }
  }

  /**
   * Récupérer une année fiscale par son ID
   */
  static async getFiscalYearById(clubId: string, fiscalYearId: string): Promise<FiscalYear | null> {
    try {
      const fyRef = doc(db, 'clubs', clubId, 'fiscal_years', fiscalYearId);
      const snapshot = await getDoc(fyRef);

      if (!snapshot.exists()) {
        return null;
      }

      const data = snapshot.data();
      return {
        id: snapshot.id,
        ...data,
        start_date: data.start_date?.toDate ? data.start_date.toDate() : new Date(data.start_date),
        end_date: data.end_date?.toDate ? data.end_date.toDate() : new Date(data.end_date),
        created_at: data.created_at?.toDate ? data.created_at.toDate() : new Date(data.created_at),
        updated_at: data.updated_at?.toDate ? data.updated_at.toDate() : new Date(data.updated_at),
        closed_at: data.closed_at?.toDate ? data.closed_at.toDate() : undefined,
      } as FiscalYear;
    } catch (error) {
      console.error('Erreur lors du chargement de l\'année fiscale:', error);
      throw error;
    }
  }

  /**
   * Récupérer toutes les transactions d'une année fiscale
   * Filtre par date_execution entre start_date et end_date
   * Optionnellement filtre par type de compte (accountType)
   */
  static async getTransactionsForFiscalYear(
    clubId: string,
    fiscalYear: FiscalYear,
    accountType?: 'current' | 'savings'
  ): Promise<TransactionBancaire[]> {
    try {
      const txRef = collection(db, 'clubs', clubId, 'transactions_bancaires');

      // Query de base : transactions dans la période fiscale
      const q = query(
        txRef,
        where('date_execution', '>=', Timestamp.fromDate(startOfDay(fiscalYear.start_date))),
        where('date_execution', '<=', Timestamp.fromDate(endOfDay(fiscalYear.end_date))),
        orderBy('date_execution', 'asc')
      );

      const snapshot = await getDocs(q);
      let transactions = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          date_execution: data.date_execution?.toDate ? data.date_execution.toDate() : new Date(data.date_execution),
          date_valeur: data.date_valeur?.toDate ? data.date_valeur.toDate() : new Date(data.date_valeur),
          created_at: data.created_at?.toDate ? data.created_at.toDate() : new Date(data.created_at),
          updated_at: data.updated_at?.toDate ? data.updated_at.toDate() : new Date(data.updated_at),
        } as TransactionBancaire;
      });

      // Filtre supplémentaire par numéro de compte si spécifié
      if (accountType && fiscalYear.account_numbers) {
        const accountNumber = accountType === 'current'
          ? fiscalYear.account_numbers.bank_current
          : fiscalYear.account_numbers.bank_savings;

        if (accountNumber) {
          // Normaliser les numéros de compte (enlever les espaces) pour la comparaison
          const normalizedAccountNumber = accountNumber.replace(/\s/g, '');
          transactions = transactions.filter(tx => {
            const normalizedTxAccount = tx.numero_compte?.replace(/\s/g, '') || '';
            return normalizedTxAccount === normalizedAccountNumber;
          });
        }
      }

      return transactions;
    } catch (error) {
      console.error('Erreur lors du chargement des transactions:', error);
      throw error;
    }
  }

  /**
   * Calculer le solde actuel d'un compte pour l'année fiscale en cours
   * Formule: Opening Balance + Σ(transactions)
   * Conforme aux meilleures pratiques comptables
   */
  static async calculateCurrentBalance(
    clubId: string,
    accountType: 'current' | 'savings'
  ): Promise<number> {
    try {
      // 1. Récupérer l'année fiscale active
      const fiscalYear = await this.getCurrentFiscalYear(clubId);

      if (!fiscalYear) {
        console.warn('Aucune année fiscale active trouvée');
        return 0;
      }

      // 2. Récupérer le solde d'ouverture
      const openingBalance = accountType === 'current'
        ? fiscalYear.opening_balances.bank_current
        : fiscalYear.opening_balances.bank_savings;

      // 3. Récupérer toutes les transactions de l'année pour ce compte
      const transactions = await this.getTransactionsForFiscalYear(
        clubId,
        fiscalYear,
        accountType
      );

      // 4. Calculer la somme des transactions (positives et négatives)
      // Exclure les transactions ventilées (parents) pour éviter le double comptage
      const transactionsSum = transactions.reduce((sum, tx) => {
        // Les transactions ventilées parents ne doivent pas être comptées
        // car leurs montants sont déjà reflétés dans les transactions enfants
        if (tx.is_parent) {
          return sum;
        }
        return sum + tx.montant;
      }, 0);

      // 5. Retourner le solde actuel
      return openingBalance + transactionsSum;
    } catch (error) {
      console.error(`Erreur lors du calcul du solde ${accountType}:`, error);
      throw error;
    }
  }

  /**
   * Créer une nouvelle année fiscale
   */
  static async createFiscalYear(
    clubId: string,
    year: number,
    startDate: Date,
    endDate: Date,
    openingBalances: { bank_current: number; bank_savings: number },
    accountNumbers?: { bank_current?: string; bank_savings?: string },
    userId?: string
  ): Promise<string> {
    try {
      const fyId = `FY${year}`;
      const fyRef = doc(db, 'clubs', clubId, 'fiscal_years', fyId);

      const newFiscalYear: any = {
        year,
        start_date: Timestamp.fromDate(startDate),
        end_date: Timestamp.fromDate(endDate),
        status: 'open',
        opening_balances: openingBalances,
        closing_balances: {
          bank_current: 0,
          bank_savings: 0
        },
        created_at: Timestamp.fromDate(new Date()),
        updated_at: Timestamp.fromDate(new Date()),
      };

      // Ajouter accountNumbers seulement s'il est défini et non vide
      if (accountNumbers && (accountNumbers.bank_current || accountNumbers.bank_savings)) {
        newFiscalYear.account_numbers = accountNumbers;
      }

      await setDoc(fyRef, newFiscalYear);

      console.log(`Année fiscale ${year} créée avec succès`);
      return fyId;
    } catch (error) {
      console.error('Erreur lors de la création de l\'année fiscale:', error);
      throw error;
    }
  }

  /**
   * Clôturer une année fiscale
   * - Calcule et sauvegarde les closing_balances
   * - Change le status à 'closed'
   * - Crée automatiquement l'année suivante avec report des soldes
   * Conforme au principe de "Balance Carry Forward"
   */
  static async closeFiscalYear(
    clubId: string,
    fiscalYearId: string,
    userId?: string
  ): Promise<void> {
    try {
      // 1. Récupérer l'année fiscale
      const fiscalYear = await this.getFiscalYearById(clubId, fiscalYearId);

      if (!fiscalYear) {
        throw new Error('Année fiscale introuvable');
      }

      if (fiscalYear.status !== 'open') {
        throw new Error('Seule une année fiscale ouverte peut être clôturée');
      }

      // 2. Calculer les soldes de fin
      const closingCurrent = await this.calculateCurrentBalance(clubId, 'current');
      const closingSavings = await this.calculateCurrentBalance(clubId, 'savings');

      // 3. Mettre à jour l'année fiscale avec les soldes de clôture
      const fyRef = doc(db, 'clubs', clubId, 'fiscal_years', fiscalYearId);
      await updateDoc(fyRef, {
        'closing_balances.bank_current': closingCurrent,
        'closing_balances.bank_savings': closingSavings,
        status: 'closed',
        closed_at: Timestamp.fromDate(new Date()),
        closed_by: userId || 'system',
        updated_at: Timestamp.fromDate(new Date())
      });

      console.log(`Année fiscale ${fiscalYear.year} clôturée avec succès`);
      console.log(`Soldes de clôture - Courant: ${closingCurrent}, Épargne: ${closingSavings}`);

      // 4. Créer automatiquement l'année suivante avec report des soldes
      const nextYear = fiscalYear.year + 1;
      const nextStartDate = addYears(fiscalYear.start_date, 1);
      const nextEndDate = addYears(fiscalYear.end_date, 1);

      await this.createFiscalYear(
        clubId,
        nextYear,
        nextStartDate,
        nextEndDate,
        {
          bank_current: closingCurrent,  // Report automatique
          bank_savings: closingSavings   // Report automatique
        },
        fiscalYear.account_numbers,
        userId
      );

      console.log(`Année fiscale ${nextYear} créée automatiquement avec report des soldes`);
    } catch (error) {
      console.error('Erreur lors de la clôture de l\'année fiscale:', error);
      throw error;
    }
  }

  /**
   * Rouvrir une année fiscale clôturée (pour ajustements)
   * Best practice: permettre la réouverture tant que status != 'permanently_closed'
   */
  static async reopenFiscalYear(
    clubId: string,
    fiscalYearId: string
  ): Promise<void> {
    try {
      const fiscalYear = await this.getFiscalYearById(clubId, fiscalYearId);

      if (!fiscalYear) {
        throw new Error('Année fiscale introuvable');
      }

      if (fiscalYear.status === 'permanently_closed') {
        throw new Error('Impossible de rouvrir une année définitivement verrouillée');
      }

      const fyRef = doc(db, 'clubs', clubId, 'fiscal_years', fiscalYearId);
      await updateDoc(fyRef, {
        status: 'open',
        updated_at: Timestamp.fromDate(new Date())
      });

      console.log(`Année fiscale ${fiscalYear.year} rouverte`);
    } catch (error) {
      console.error('Erreur lors de la réouverture de l\'année fiscale:', error);
      throw error;
    }
  }

  /**
   * Verrouiller définitivement une année fiscale
   * ATTENTION: Action irréversible, à utiliser avec précaution
   */
  static async permanentlyCloseFiscalYear(
    clubId: string,
    fiscalYearId: string
  ): Promise<void> {
    try {
      const fyRef = doc(db, 'clubs', clubId, 'fiscal_years', fiscalYearId);
      await updateDoc(fyRef, {
        status: 'permanently_closed',
        updated_at: Timestamp.fromDate(new Date())
      });

      console.log('Année fiscale définitivement verrouillée');
    } catch (error) {
      console.error('Erreur lors du verrouillage définitif:', error);
      throw error;
    }
  }

  /**
   * Valider qu'une date de transaction tombe dans une année fiscale
   */
  static validateTransactionDate(date: Date, fiscalYear: FiscalYear): boolean {
    return isWithinInterval(date, {
      start: startOfDay(fiscalYear.start_date),
      end: endOfDay(fiscalYear.end_date)
    });
  }

  /**
   * Vérifier si une année fiscale peut être clôturée
   * Retourne les raisons pour lesquelles elle ne peut pas être clôturée
   */
  static async canCloseFiscalYear(
    clubId: string,
    fiscalYear: FiscalYear
  ): Promise<{ canClose: boolean; reasons: string[] }> {
    const reasons: string[] = [];

    // Vérifier le statut
    if (fiscalYear.status !== 'open') {
      reasons.push('L\'année fiscale n\'est pas ouverte');
    }

    // Vérifier qu'on est après la date de fin
    const now = new Date();
    if (now < fiscalYear.end_date) {
      reasons.push('L\'année fiscale n\'est pas encore terminée');
    }

    // Vérifier les transactions non réconciliées (optionnel, warning seulement)
    try {
      const transactions = await this.getTransactionsForFiscalYear(clubId, fiscalYear);
      const unreconciled = transactions.filter(tx => !tx.reconcilie);

      if (unreconciled.length > 0) {
        reasons.push(`${unreconciled.length} transaction(s) non réconciliée(s) (avertissement)`);
      }
    } catch (error) {
      console.error('Erreur lors de la vérification des transactions:', error);
    }

    return {
      canClose: reasons.length === 0 || reasons.every(r => r.includes('avertissement')),
      reasons
    };
  }

  /**
   * Mettre à jour les numéros de compte d'une année fiscale
   */
  static async updateAccountNumbers(
    clubId: string,
    fiscalYearId: string,
    accountNumbers: { bank_current?: string; bank_savings?: string }
  ): Promise<void> {
    try {
      const fyRef = doc(db, 'clubs', clubId, 'fiscal_years', fiscalYearId);
      await updateDoc(fyRef, {
        account_numbers: accountNumbers,
        updated_at: Timestamp.fromDate(new Date())
      });

      console.log('Numéros de compte mis à jour');
    } catch (error) {
      console.error('Erreur lors de la mise à jour des numéros de compte:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour une année fiscale
   */
  static async updateFiscalYear(
    clubId: string,
    fiscalYearId: string,
    updates: {
      start_date?: Date;
      end_date?: Date;
      opening_balances?: { bank_current: number; bank_savings: number };
      account_numbers?: { bank_current?: string; bank_savings?: string };
      notes?: string;
    }
  ): Promise<void> {
    try {
      const fyRef = doc(db, 'clubs', clubId, 'fiscal_years', fiscalYearId);

      const updateData: any = {
        updated_at: Timestamp.fromDate(new Date())
      };

      // Convertir les dates en Timestamps si présentes
      if (updates.start_date) {
        updateData.start_date = Timestamp.fromDate(updates.start_date);
      }
      if (updates.end_date) {
        updateData.end_date = Timestamp.fromDate(updates.end_date);
      }

      // Ajouter les autres champs s'ils sont présents
      if (updates.opening_balances) {
        updateData.opening_balances = updates.opening_balances;
      }
      if (updates.account_numbers) {
        updateData.account_numbers = updates.account_numbers;
      }
      if (updates.notes !== undefined) {
        updateData.notes = updates.notes;
      }

      await updateDoc(fyRef, updateData);
      console.log('Année fiscale mise à jour avec succès');
    } catch (error) {
      console.error('Erreur lors de la mise à jour de l\'année fiscale:', error);
      throw error;
    }
  }

  /**
   * Supprimer une année fiscale (seulement si status = 'open' et pas de transactions)
   */
  static async deleteFiscalYear(
    clubId: string,
    fiscalYearId: string
  ): Promise<void> {
    try {
      const fiscalYear = await this.getFiscalYearById(clubId, fiscalYearId);

      if (!fiscalYear) {
        throw new Error('Année fiscale introuvable');
      }

      if (fiscalYear.status !== 'open') {
        throw new Error('Seule une année fiscale ouverte peut être supprimée');
      }

      // Vérifier qu'il n'y a pas de transactions
      const transactions = await this.getTransactionsForFiscalYear(clubId, fiscalYear);
      if (transactions.length > 0) {
        throw new Error(`Impossible de supprimer : ${transactions.length} transaction(s) associée(s)`);
      }

      const fyRef = doc(db, 'clubs', clubId, 'fiscal_years', fiscalYearId);
      await updateDoc(fyRef, {
        status: 'deleted',
        updated_at: Timestamp.fromDate(new Date())
      });

      console.log('Année fiscale supprimée');
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      throw error;
    }
  }
}
