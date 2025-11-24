/**
 * Service de génération de rapports financiers
 *
 * Agrège les données depuis Firestore pour générer des rapports PDF
 * conformes aux standards comptables belges ASBL
 */

import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
  orderBy
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  TransactionBancaire,
  DemandeRemboursement,
  Evenement,
  InscriptionEvenement,
  Operation,
  ParticipantOperation,
  ReportPeriod,
  FinancialSummary,
  CategoryTotal,
  AccountTotal,
  MonthlyData,
  EventFinancial,
  PeriodType,
  FiscalYear,
  EventStatistics,
  EventMonthlyData,
  ParticipantStats
} from '@/types';
import { calypsoAccountCodes } from '@/config/calypso-accounts';
import { format, startOfYear, endOfYear, startOfQuarter, endOfQuarter, startOfMonth, endOfMonth } from 'date-fns';
import { fr } from 'date-fns/locale';

export class ReportService {
  /**
   * Génère une période de rapport depuis une année fiscale
   */
  static createPeriodFromFiscalYear(fiscalYear: FiscalYear, type: PeriodType = 'year'): ReportPeriod {
    const startDate = fiscalYear.start_date instanceof Date
      ? fiscalYear.start_date
      : (fiscalYear.start_date as any).toDate();
    const endDate = fiscalYear.end_date instanceof Date
      ? fiscalYear.end_date
      : (fiscalYear.end_date as any).toDate();

    return {
      start_date: startDate,
      end_date: endDate,
      fiscal_year: fiscalYear.year,
      label: `Année ${fiscalYear.year}`,
      type
    };
  }

  /**
   * Crée une période personnalisée
   */
  static createCustomPeriod(startDate: Date, endDate: Date, fiscalYear: number): ReportPeriod {
    return {
      start_date: startDate,
      end_date: endDate,
      fiscal_year: fiscalYear,
      label: `Du ${format(startDate, 'dd/MM/yyyy', { locale: fr })} au ${format(endDate, 'dd/MM/yyyy', { locale: fr })}`,
      type: 'custom'
    };
  }

  /**
   * Récupère toutes les transactions pour une période donnée
   */
  static async getTransactionsForPeriod(
    clubId: string,
    period: ReportPeriod,
    fiscalYearId?: string
  ): Promise<TransactionBancaire[]> {
    const transRef = collection(db, 'clubs', clubId, 'transactions_bancaires');

    console.log('🔍 Query transactions with DATE FILTER:', {
      period: `${period.start_date.toISOString()} → ${period.end_date.toISOString()}`,
      fiscalYearId: fiscalYearId || 'not used - using date filter instead'
    });

    // ALWAYS use date filtering (reliable, works with or without fiscal_year_id field)
    // This ensures backward compatibility and works even if transactions don't have fiscal_year_id
    const q = query(
      transRef,
      where('date_execution', '>=', Timestamp.fromDate(period.start_date)),
      where('date_execution', '<=', Timestamp.fromDate(period.end_date)),
      orderBy('date_execution', 'asc')
    );

    const snapshot = await getDocs(q);
    console.log(`   📦 Transactions trouvées par date: ${snapshot.size}`);

    const transactions = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        date_execution: data.date_execution?.toDate() || new Date(),
        date_valeur: data.date_valeur?.toDate() || new Date(),
        created_at: data.created_at?.toDate() || new Date(),
        updated_at: data.updated_at?.toDate() || new Date()
      } as TransactionBancaire;
    });

    console.log(`   ✅ Returning ${transactions.length} transactions`);
    return transactions;
  }

  /**
   * Récupère toutes les demandes de remboursement pour une période
   */
  static async getExpenseClaimsForPeriod(
    clubId: string,
    period: ReportPeriod
  ): Promise<DemandeRemboursement[]> {
    const expenseRef = collection(db, 'clubs', clubId, 'demandes_remboursement');

    const q = query(
      expenseRef,
      where('date_depense', '>=', Timestamp.fromDate(period.start_date)),
      where('date_depense', '<=', Timestamp.fromDate(period.end_date)),
      orderBy('date_depense', 'asc')
    );

    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        date_demande: data.date_demande?.toDate() || new Date(),
        date_depense: data.date_depense?.toDate() || new Date(),
        date_soumission: data.date_soumission?.toDate(),
        date_approbation: data.date_approbation?.toDate(),
        date_approbation_2: data.date_approbation_2?.toDate(),
        date_remboursement: data.date_remboursement?.toDate(),
        date_refus: data.date_refus?.toDate(),
        created_at: data.created_at?.toDate() || new Date(),
        updated_at: data.updated_at?.toDate() || new Date()
      } as DemandeRemboursement;
    });
  }

  /**
   * NOUVEAU: Récupère opérations (type='evenement') pour une période
   * Utilise la nouvelle collection 'operations'
   */
  static async getOperationsForPeriod(
    clubId: string,
    period: ReportPeriod
  ): Promise<Operation[]> {
    console.log('🔍 Recherche opérations (type=evenement) dans: clubs/' + clubId + '/operations');
    console.log('   Période:', period.start_date, '→', period.end_date);

    const operationsRef = collection(db, 'clubs', clubId, 'operations');

    const q = query(
      operationsRef,
      where('type', '==', 'evenement'),
      where('date_debut', '>=', Timestamp.fromDate(period.start_date)),
      where('date_debut', '<=', Timestamp.fromDate(period.end_date)),
      orderBy('date_debut', 'asc')
    );

    const snapshot = await getDocs(q);
    console.log('   📦 Opérations trouvées:', snapshot.size);

    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        date_debut: data.date_debut?.toDate(),
        date_fin: data.date_fin?.toDate(),
        periode_debut: data.periode_debut?.toDate(),
        periode_fin: data.periode_fin?.toDate(),
        created_at: data.created_at?.toDate() || new Date(),
        updated_at: data.updated_at?.toDate() || new Date()
      } as Operation;
    });
  }

  /**
   * 🆕 MIGRATION: Récupère opérations de type 'evenement' depuis collection 'operations'
   */
  static async getEventsForPeriod(
    clubId: string,
    period: ReportPeriod
  ): Promise<Evenement[]> {
    console.log('🔍 Recherche événements dans collection: clubs/' + clubId + '/operations');
    console.log('   Période:', period.start_date, '→', period.end_date);

    // 🆕 MIGRATION: Read from 'operations' collection
    const eventRef = collection(db, 'clubs', clubId, 'operations');

    // Query all operations of type 'evenement', then filter by date in memory
    const q = query(
      eventRef,
      where('type', '==', 'evenement')  // 🆕 Filter by type
    );

    const snapshot = await getDocs(q);

    // Filter by date in memory to avoid composite index requirement
    const events = snapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Evenement))
      .filter(event => {
        if (!event.date_debut) return false;
        const eventDate = event.date_debut instanceof Timestamp
          ? event.date_debut.toDate()
          : new Date(event.date_debut);
        return eventDate >= period.start_date && eventDate <= period.end_date;
      })
      .sort((a, b) => {
        const dateA = a.date_debut instanceof Timestamp ? a.date_debut.toDate() : new Date(a.date_debut);
        const dateB = b.date_debut instanceof Timestamp ? b.date_debut.toDate() : new Date(b.date_debut);
        return dateA.getTime() - dateB.getTime();
      });

    console.log('   📦 Événements trouvés après filtrage:', events.length);

    // Si aucun résultat, essayer sans filtre pour voir si la collection existe
    if (events.length === 0) {
      console.log('   ⚠️ Aucun événement trouvé avec filtres. Vérification collection...');
      const allEventsSnapshot = await getDocs(collection(db, 'clubs', clubId, 'operations'));
      console.log('   📦 Total opérations dans la collection (sans filtre):', allEventsSnapshot.size);

      if (allEventsSnapshot.size > 0) {
        const firstEvent = allEventsSnapshot.docs[0].data();
        console.log('   🔍 Première opération (exemple):', {
          id: allEventsSnapshot.docs[0].id,
          type: firstEvent.type,
          date_debut: firstEvent.date_debut,
          titre: firstEvent.titre
        });
      }
    }

    // Return the filtered and sorted events
    return events.map(event => ({
      ...event,
      date_debut: event.date_debut instanceof Timestamp ? event.date_debut.toDate() : new Date(event.date_debut),
      date_fin: event.date_fin ? (event.date_fin instanceof Timestamp ? event.date_fin.toDate() : new Date(event.date_fin)) : new Date(),
      created_at: event.created_at instanceof Timestamp ? event.created_at.toDate() : new Date(event.created_at),
      updated_at: event.updated_at instanceof Timestamp ? event.updated_at.toDate() : new Date(event.updated_at)
    } as Evenement));
  }

  /**
   * Agrège les transactions par catégorie
   */
  static aggregateByCategory(transactions: TransactionBancaire[]): {
    revenue: CategoryTotal[];
    expense: CategoryTotal[];
  } {
    const revenueMap = new Map<string, { total: number; count: number }>();
    const expenseMap = new Map<string, { total: number; count: number }>();

    let totalRevenue = 0;
    let totalExpense = 0;

    transactions.forEach(trans => {
      const amount = Math.abs(trans.montant);
      const category = trans.categorie || 'Non catégorisé';
      const isRevenue = trans.montant > 0;

      if (isRevenue) {
        totalRevenue += amount;
        const current = revenueMap.get(category) || { total: 0, count: 0 };
        revenueMap.set(category, {
          total: current.total + amount,
          count: current.count + 1
        });
      } else {
        totalExpense += amount;
        const current = expenseMap.get(category) || { total: 0, count: 0 };
        expenseMap.set(category, {
          total: current.total + amount,
          count: current.count + 1
        });
      }
    });

    const revenue: CategoryTotal[] = Array.from(revenueMap.entries()).map(([categorie, data]) => ({
      categorie,
      categorie_label: categorie,
      total: data.total,
      transaction_count: data.count,
      percentage: totalRevenue > 0 ? (data.total / totalRevenue) * 100 : 0
    })).sort((a, b) => b.total - a.total);

    const expense: CategoryTotal[] = Array.from(expenseMap.entries()).map(([categorie, data]) => ({
      categorie,
      categorie_label: categorie,
      total: data.total,
      transaction_count: data.count,
      percentage: totalExpense > 0 ? (data.total / totalExpense) * 100 : 0
    })).sort((a, b) => b.total - a.total);

    return { revenue, expense };
  }

  /**
   * Agrège les transactions par code comptable
   */
  static aggregateByAccountCode(transactions: TransactionBancaire[]): {
    revenue: AccountTotal[];
    expense: AccountTotal[];
  } {
    const revenueMap = new Map<string, { total: number; count: number; label: string }>();
    const expenseMap = new Map<string, { total: number; count: number; label: string }>();

    let totalRevenue = 0;
    let totalExpense = 0;

    transactions.forEach(trans => {
      const amount = Math.abs(trans.montant);
      const code = trans.code_comptable || 'Non défini';
      const isRevenue = trans.montant > 0;

      // Trouver le label du code comptable
      const accountCode = calypsoAccountCodes.find(ac => ac.code === code);
      const label = accountCode?.label || code;

      if (isRevenue) {
        totalRevenue += amount;
        const current = revenueMap.get(code) || { total: 0, count: 0, label };
        revenueMap.set(code, {
          total: current.total + amount,
          count: current.count + 1,
          label
        });
      } else {
        totalExpense += amount;
        const current = expenseMap.get(code) || { total: 0, count: 0, label };
        expenseMap.set(code, {
          total: current.total + amount,
          count: current.count + 1,
          label
        });
      }
    });

    const revenue: AccountTotal[] = Array.from(revenueMap.entries()).map(([code, data]) => ({
      code,
      label: data.label,
      total: data.total,
      transaction_count: data.count,
      percentage: totalRevenue > 0 ? (data.total / totalRevenue) * 100 : 0
    })).sort((a, b) => b.total - a.total);

    const expense: AccountTotal[] = Array.from(expenseMap.entries()).map(([code, data]) => ({
      code,
      label: data.label,
      total: data.total,
      transaction_count: data.count,
      percentage: totalExpense > 0 ? (data.total / totalExpense) * 100 : 0
    })).sort((a, b) => b.total - a.total);

    return { revenue, expense };
  }

  /**
   * Calcule l'évolution mensuelle
   */
  static calculateMonthlyEvolution(
    transactions: TransactionBancaire[],
    period: ReportPeriod
  ): MonthlyData[] {
    const monthlyMap = new Map<string, { revenue: number; expense: number }>();

    transactions.forEach(trans => {
      const monthKey = format(trans.date_execution, 'yyyy-MM');
      const current = monthlyMap.get(monthKey) || { revenue: 0, expense: 0 };

      if (trans.montant > 0) {
        current.revenue += trans.montant;
      } else {
        current.expense += Math.abs(trans.montant);
      }

      monthlyMap.set(monthKey, current);
    });

    let cumulativeNet = 0;
    const monthlyData: MonthlyData[] = [];

    // Créer une entrée pour chaque mois de la période, même sans transactions
    const startDate = new Date(period.start_date);
    const endDate = new Date(period.end_date);
    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const monthKey = format(currentDate, 'yyyy-MM');
      const data = monthlyMap.get(monthKey) || { revenue: 0, expense: 0 };
      const net = data.revenue - data.expense;
      cumulativeNet += net;

      monthlyData.push({
        month: format(currentDate, 'MMMM yyyy', { locale: fr }),
        month_number: currentDate.getMonth() + 1,
        year: currentDate.getFullYear(),
        revenue: data.revenue,
        expense: data.expense,
        net,
        cumulative_net: cumulativeNet
      });

      // Passer au mois suivant
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    return monthlyData;
  }

  /**
   * Génère les données financières pour chaque événement
   */
  static async generateEventFinancials(
    clubId: string,
    events: Evenement[],
    transactions: TransactionBancaire[],
    expenseClaims: DemandeRemboursement[]
  ): Promise<EventFinancial[]> {
    const eventFinancials: EventFinancial[] = [];

    for (const event of events) {
      // Trouver toutes les transactions liées à cet événement
      const eventTransactions = transactions.filter(trans =>
        trans.evenement_id === event.id ||
        trans.matched_entities?.some(me => me.entity_type === 'event' && me.entity_id === event.id)
      );

      // Trouver toutes les demandes de remboursement liées
      const eventExpenseClaims = expenseClaims.filter(ec => ec.evenement_id === event.id);

      // Calculer participants
      const inscriptionsRef = collection(db, 'clubs', clubId, 'event_registrations');
      const inscriptionsQuery = query(inscriptionsRef, where('evenement_id', '==', event.id));
      const inscriptionsSnapshot = await getDocs(inscriptionsQuery);
      const participantCount = inscriptionsSnapshot.size;

      // Calculer totaux
      const totalRevenue = eventTransactions
        .filter(t => t.montant > 0)
        .reduce((sum, t) => sum + t.montant, 0);

      const totalExpense = eventTransactions
        .filter(t => t.montant < 0)
        .reduce((sum, t) => sum + Math.abs(t.montant), 0) +
        eventExpenseClaims
          .filter(ec => ec.statut === 'approuve' || ec.statut === 'rembourse')
          .reduce((sum, ec) => sum + ec.montant, 0);

      const netResult = totalRevenue - totalExpense;
      const revenuePerParticipant = participantCount > 0 ? totalRevenue / participantCount : 0;

      eventFinancials.push({
        evenement_id: event.id,
        titre: event.titre,
        date_debut: event.date_debut,
        date_fin: event.date_fin,
        participant_count: participantCount,
        total_revenue: totalRevenue,
        total_expense: totalExpense,
        net_result: netResult,
        revenue_per_participant: revenuePerParticipant,
        transactions: eventTransactions,
        expense_claims: eventExpenseClaims
      });
    }

    // Trier par rentabilité décroissante
    return eventFinancials.sort((a, b) => b.net_result - a.net_result);
  }

  /**
   * Récupère toutes les inscriptions pour des événements d'une période donnée
   */
  static async getRegistrationsForPeriod(
    clubId: string,
    period: ReportPeriod,
    events: Evenement[]
  ): Promise<InscriptionEvenement[]> {
    // Si pas d'événements, retourner tableau vide
    if (events.length === 0) {
      return [];
    }

    const regRef = collection(db, 'clubs', clubId, 'event_registrations');

    // Récupérer toutes les inscriptions pour les événements de la période
    const eventIds = events.map(e => e.id);
    const allRegistrations: InscriptionEvenement[] = [];

    // Firestore limite à 10 éléments dans un "in" query, donc on fait par batches
    for (let i = 0; i < eventIds.length; i += 10) {
      const batch = eventIds.slice(i, i + 10);
      const q = query(
        regRef,
        where('evenement_id', 'in', batch)
      );

      const snapshot = await getDocs(q);
      const registrations = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          date_inscription: data.date_inscription?.toDate() || new Date(),
          date_paiement: data.date_paiement?.toDate(),
          created_at: data.created_at?.toDate(),
          updated_at: data.updated_at?.toDate()
        } as InscriptionEvenement;
      });

      allRegistrations.push(...registrations);
    }

    return allRegistrations;
  }

  /**
   * Génère les statistiques d'événements
   */
  static async generateEventStatistics(
    clubId: string,
    period: ReportPeriod
  ): Promise<EventStatistics> {
    console.log('📊 Génération statistiques événements pour période:', period);

    // Récupérer tous les événements d'abord
    const events = await this.getEventsForPeriod(clubId, period);

    // Puis récupérer les inscriptions pour ces événements
    const registrations = await this.getRegistrationsForPeriod(clubId, period, events);

    console.log(`   ✅ ${events.length} événements, ${registrations.length} inscriptions`);

    // Total des événements
    const totalEvents = events.length;
    const totalRegistrations = registrations.length;

    // Événements par mois
    const eventsByMonth = new Map<string, number>();
    const registrationsByMonth = new Map<string, number>();

    events.forEach(event => {
      const monthKey = format(event.date_debut, 'yyyy-MM');
      eventsByMonth.set(monthKey, (eventsByMonth.get(monthKey) || 0) + 1);
    });

    // Créer un map des événements par ID pour lookup rapide
    const eventsById = new Map(events.map(e => [e.id, e]));

    registrations.forEach(reg => {
      // Trouver l'événement correspondant pour utiliser sa date
      const event = eventsById.get(reg.evenement_id);
      if (event) {
        const monthKey = format(event.date_debut, 'yyyy-MM');
        registrationsByMonth.set(monthKey, (registrationsByMonth.get(monthKey) || 0) + 1);
      }
    });

    // Données mensuelles
    const monthlyData: EventMonthlyData[] = [];
    const startDate = new Date(period.start_date);
    const endDate = new Date(period.end_date);
    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const monthKey = format(currentDate, 'yyyy-MM');

      monthlyData.push({
        month: format(currentDate, 'MMMM yyyy', { locale: fr }),
        month_number: currentDate.getMonth() + 1,
        year: currentDate.getFullYear(),
        event_count: eventsByMonth.get(monthKey) || 0,
        registration_count: registrationsByMonth.get(monthKey) || 0
      });

      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    // Top 10 des participants les plus actifs
    // Grouper par membre_id et compter les événements UNIQUES (pas les inscriptions)
    const participantEventsMap = new Map<string, { eventIds: Set<string>; name: string }>();

    registrations.forEach(reg => {
      // Ignorer les inscriptions sans membre_id
      if (!reg.membre_id) {
        return;
      }

      const key = reg.membre_id;
      const name = `${reg.membre_prenom || ''} ${reg.membre_nom || 'Inconnu'}`.trim();

      if (!participantEventsMap.has(key)) {
        participantEventsMap.set(key, { eventIds: new Set(), name });
      }

      const participant = participantEventsMap.get(key)!;
      // Ajouter l'ID de l'événement au Set (déduplique automatiquement)
      if (reg.evenement_id) {
        participant.eventIds.add(reg.evenement_id);
      }
      // Garder le nom le plus complet
      if (name.length > participant.name.length) {
        participant.name = name;
      }
    });

    const topParticipants: ParticipantStats[] = Array.from(participantEventsMap.entries())
      .map(([membre_id, data]) => ({
        membre_id,
        membre_nom: data.name,
        registration_count: data.eventIds.size, // Nombre d'événements UNIQUES
        percentage: totalEvents > 0 ? (data.eventIds.size / totalEvents) * 100 : 0 // % sur total événements
      }))
      .filter(p => p.registration_count > 0) // Exclure ceux sans événements
      .sort((a, b) => b.registration_count - a.registration_count)
      .slice(0, 10);

    // Événements par statut
    const eventsByStatus = events.reduce((acc, event) => {
      acc[event.statut] = (acc[event.statut] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Taux de participation moyen
    const eventsWithRegistrations = events.filter(event => {
      const count = registrations.filter(r => r.evenement_id === event.id).length;
      return count > 0;
    });

    const averageRegistrationsPerEvent = eventsWithRegistrations.length > 0
      ? totalRegistrations / eventsWithRegistrations.length
      : 0;

    // Taux de paiement
    const paidRegistrations = registrations.filter(r => r.paye).length;
    const paymentRate = totalRegistrations > 0 ? (paidRegistrations / totalRegistrations) * 100 : 0;

    return {
      period,
      total_events: totalEvents,
      total_registrations: totalRegistrations,
      average_registrations_per_event: averageRegistrationsPerEvent,
      payment_rate: paymentRate,
      monthly_data: monthlyData,
      top_participants: topParticipants,
      events_by_status: eventsByStatus,
      events,
      registrations
    };
  }

  /**
   * Génère la synthèse financière complète
   */
  static async generateFinancialSummary(
    clubId: string,
    period: ReportPeriod,
    fiscalYear?: FiscalYear
  ): Promise<FinancialSummary> {
    console.log('📊 Génération synthèse financière pour période:', period);
    console.log('   📅 Fiscal Year ID:', fiscalYear?.id);

    // Récupérer toutes les données (pass fiscal_year_id to match TransactionsPage behavior)
    const [transactions, expenseClaims, events] = await Promise.all([
      this.getTransactionsForPeriod(clubId, period, fiscalYear?.id),
      this.getExpenseClaimsForPeriod(clubId, period),
      this.getEventsForPeriod(clubId, period)
    ]);

    console.log(`   ✅ ${transactions.length} transactions, ${expenseClaims.length} demandes, ${events.length} événements`);

    // Calculer soldes
    const openingBalance = fiscalYear?.opening_balances.bank_current || 0;

    const totalRevenue = transactions
      .filter(t => t.montant > 0)
      .reduce((sum, t) => sum + t.montant, 0);

    const totalExpense = transactions
      .filter(t => t.montant < 0)
      .reduce((sum, t) => sum + Math.abs(t.montant), 0);

    const netResult = totalRevenue - totalExpense;
    const closingBalance = openingBalance + netResult;

    // Agrégations
    const { revenue: revenueByCategory, expense: expenseByCategory } = this.aggregateByCategory(transactions);
    const { revenue: revenueByAccount, expense: expenseByAccount } = this.aggregateByAccountCode(transactions);
    const monthlyEvolution = this.calculateMonthlyEvolution(transactions, period);
    const eventFinancials = await this.generateEventFinancials(clubId, events, transactions, expenseClaims);

    // Transactions non réconciliées
    const unreconciledTransactions = transactions.filter(t => !t.reconcilie);

    // Demandes en attente
    const pendingExpenseClaims = expenseClaims.filter(
      ec => ec.statut === 'soumis' || ec.statut === 'en_attente_validation'
    );

    // Statistiques
    const transactionCount = transactions.length;
    const reconciledCount = transactions.filter(t => t.reconcilie).length;
    const reconciliationRate = transactionCount > 0 ? (reconciledCount / transactionCount) * 100 : 0;

    return {
      period,
      opening_balance: openingBalance,
      closing_balance: closingBalance,
      total_revenue: totalRevenue,
      total_expense: totalExpense,
      net_result: netResult,
      revenue_by_category: revenueByCategory,
      expense_by_category: expenseByCategory,
      revenue_by_account: revenueByAccount,
      expense_by_account: expenseByAccount,
      monthly_evolution: monthlyEvolution,
      events: eventFinancials,
      unreconciled_transactions: unreconciledTransactions,
      pending_expense_claims: pendingExpenseClaims,
      transaction_count: transactionCount,
      reconciliation_rate: reconciliationRate
    };
  }
}
