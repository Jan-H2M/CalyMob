import React, { useState, useEffect, useMemo } from 'react';
import { logger } from '@/utils/logger';
import { useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  Users,
  Plus,
  FileSpreadsheet,
  X,
  Eye,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { formatMontant, formatDate, cn } from '@/utils/utils';
import { Evenement, TransactionBancaire, InscriptionEvenement, DemandeRemboursement, DocumentJustificatif, Operation, EventCategory } from '@/types';
import { LOCATION_TYPE_COLORS, LOCATION_TYPE_ICONS, type LocationType } from '@/config/locationTypes';
import {
  getExpenseLinkedEventId,
  getOtherTransactionEventLinkIds,
  getTransactionEventLinkIds,
  isExpenseLinkedToOtherEvent,
  summarizeOperationTransactions
} from '@/utils/operationFinancials';
import { SourceBadge } from '../evenements/SourceBadge';
import { TransactionLinkingPanel } from '@/components/commun/TransactionLinkingPanel';
import { ExpenseLinkingPanel } from '../evenements/ExpenseLinkingPanel';
import { AutoMatchDialog } from '../evenements/AutoMatchDialog';
import { InscriptionMatcher } from '../evenements/InscriptionMatcher';
import { OperationTypeSelector } from './OperationTypeSelector';
import { OperationDetailView } from './OperationDetailView';
import { CreateEventWizard } from '../evenements/CreateEventWizard';
import { TransactionDetailView } from '../banque/TransactionDetailView';
import { DemandeDetailView } from '../depenses/DemandeDetailView';
import { CalendarView } from './CalendarView';
import {
  linkInscriptionToTransaction,
  unlinkInscriptionTransaction,
  markInscriptionPaidCash,
  AutoMatchResult,
  MatchQuality
} from '@/services/inscriptionService';
import { OperationService } from '@/services/operationService';

// MatchItem type for auto-match dialog
interface MatchItem {
  inscription: InscriptionEvenement;
  transaction: TransactionBancaire;
  confidence: number;
  quality: MatchQuality;
}
import toast from 'react-hot-toast';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, getDoc, doc, updateDoc, deleteDoc, query, where, orderBy, serverTimestamp, Timestamp, onSnapshot } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useAuth } from '@/contexts/AuthContext';
import { useFiscalYear } from '@/contexts/FiscalYearContext';
import { useKeyboardNavigation, getNavigationPosition } from '@/hooks/useKeyboardNavigation';
import { useLinkedEntityQuickViewStack } from '@/hooks/useLinkedEntityQuickViewStack';

type LinkedOperationTransaction = TransactionBancaire & {
  __link_reasons?: string[];
  __can_unlink_operation?: boolean;
};

export function OperationsPage() {
  const { clubId, user, appUser } = useAuth();
  const { selectedFiscalYear, loading: fiscalYearLoading, disableFiscalYearFilter } = useFiscalYear();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [events, setEvents] = useState<Operation[]>([]);
  const [inscriptions, setInscriptions] = useState<Record<string, InscriptionEvenement[]>>({});
  const [linkedTransactions, setLinkedTransactions] = useState<Record<string, TransactionBancaire[]>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatut, setFilterStatut] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('tous'); // Filtre par type d'opération
  const [filterEventCategory, setFilterEventCategory] = useState<EventCategory | 'all'>('all'); // Filtre par catégorie d'événement
  const [detailViewEvent, setDetailViewEvent] = useState<Operation | null>(null);
  const [lastViewedEventId, setLastViewedEventId] = useState<string | null>(null);
  const [showTransactionLinking, setShowTransactionLinking] = useState(false);
  const [showExpenseLinking, setShowExpenseLinking] = useState(false);
  const [linkingEventId, setLinkingEventId] = useState<string | null>(null);
  const [allTransactions, setAllTransactions] = useState<TransactionBancaire[]>([]);
  const [allExpenses, setAllExpenses] = useState<DemandeRemboursement[]>([]);
  const [linkedExpenses, setLinkedExpenses] = useState<Record<string, DemandeRemboursement[]>>({});
  const [detailLinkedTransactions, setDetailLinkedTransactions] = useState<LinkedOperationTransaction[]>([]);
  const [detailLinkedExpenses, setDetailLinkedExpenses] = useState<DemandeRemboursement[]>([]);
  const [detailAvailableTransactions, setDetailAvailableTransactions] = useState<TransactionBancaire[]>([]);
  const [detailAvailableExpenses, setDetailAvailableExpenses] = useState<DemandeRemboursement[]>([]);
  const [loading, setLoading] = useState(true);

  const { quickViews, openQuickView, closeQuickViewsFrom, closeAllQuickViews } = useLinkedEntityQuickViewStack();

  // Inscription linking state
  const [linkingInscriptionId, setLinkingInscriptionId] = useState<string | null>(null);
  const [autoMatchResult, setAutoMatchResult] = useState<AutoMatchResult | null>(null);
  const [showAutoMatchDialog, setShowAutoMatchDialog] = useState(false);

  // AI matching state
  const [showAIMatchDialog, setShowAIMatchDialog] = useState(false);

  // Operation type selector state
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [showEventWizard, setShowEventWizard] = useState(false);

  // Sort state
  type SortField = 'type' | 'titre' | 'date_debut' | 'participants' | 'balance' | 'statut';
  type SortDirection = 'asc' | 'desc' | null;
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  // View mode state (table or calendar)
  const [viewMode, setViewMode] = useState<'table' | 'calendar'>('table');

  const normalizeTransaction = (id: string, data: any): TransactionBancaire => {
    const amount = Number(data?.montant);

    return {
      ...data,
      id,
      montant: Number.isFinite(amount) ? amount : 0,
      date_execution: data?.date_execution?.toDate?.() ||
        (data?.date_execution ? new Date(data.date_execution) : new Date()),
      date_valeur: data?.date_valeur?.toDate?.() ||
        (data?.date_valeur ? new Date(data.date_valeur) : new Date()),
      created_at: data?.created_at?.toDate?.() || new Date(),
      updated_at: data?.updated_at?.toDate?.() || new Date(),
      type: amount > 0 ? 'income' : 'expense'
    } as TransactionBancaire;
  };

  const normalizeExpense = (id: string, data: any): DemandeRemboursement => ({
    ...data,
    id,
    montant: Number.isFinite(Number(data?.montant)) ? Number(data.montant) : 0,
    date_demande: data?.date_demande?.toDate?.() || new Date(data?.date_demande || Date.now()),
    date_depense: data?.date_depense?.toDate?.() || (data?.date_depense ? new Date(data.date_depense) : undefined),
    date_soumission: data?.date_soumission?.toDate?.() || (data?.date_soumission ? new Date(data.date_soumission) : undefined),
    date_approbation: data?.date_approbation?.toDate?.() || (data?.date_approbation ? new Date(data.date_approbation) : undefined),
    date_remboursement: data?.date_remboursement?.toDate?.() || (data?.date_remboursement ? new Date(data.date_remboursement) : undefined),
    created_at: data?.created_at?.toDate?.() || new Date(),
    updated_at: data?.updated_at?.toDate?.() || new Date()
  } as DemandeRemboursement);

  const normalizeInscription = (id: string, data: any): InscriptionEvenement => ({
    ...data,
    id,
    date_inscription: data?.date_inscription?.toDate?.() || new Date(),
    date_paiement: data?.date_paiement?.toDate?.() || null,
    created_at: data?.created_at?.toDate?.() || new Date(),
    updated_at: data?.updated_at?.toDate?.() || new Date()
  } as InscriptionEvenement);

  const getSafeOperationAmount = (data: any): number => {
    const primaryAmount = Number(data?.montant_prevu);
    if (Number.isFinite(primaryAmount)) {
      return primaryAmount;
    }

    const legacyAmount = Number(data?.budget_prevu_revenus);
    if (Number.isFinite(legacyAmount)) {
      return legacyAmount;
    }

    return 0;
  };

  const buildLinkedTransactionsForEvent = (
    eventId: string,
    transactions: TransactionBancaire[],
    eventInscriptions: InscriptionEvenement[] = [],
    eventExpenses: DemandeRemboursement[] = []
  ): LinkedOperationTransaction[] => {
    const transactionsById = new Map(transactions.map(tx => [tx.id, tx]));
    const linkedMap = new Map<string, LinkedOperationTransaction>();

    const addLinkedTransaction = (transaction: TransactionBancaire | undefined, reason: string, canUnlink: boolean) => {
      if (!transaction || transaction.is_parent || transaction.is_split) {
        return;
      }

      const existing = linkedMap.get(transaction.id);
      if (existing) {
        if (!existing.__link_reasons?.includes(reason)) {
          existing.__link_reasons = [...(existing.__link_reasons || []), reason];
        }
        existing.__can_unlink_operation = !!existing.__can_unlink_operation || canUnlink;
        return;
      }

      linkedMap.set(transaction.id, {
        ...transaction,
        __link_reasons: [reason],
        __can_unlink_operation: canUnlink
      });
    };

    for (const tx of transactions) {
      const directEventLinkIds = getTransactionEventLinkIds(tx);
      const directLegacyLink = tx.evenement_id === eventId || tx.operation_id === eventId;
      const directEntityLink = directEventLinkIds.includes(eventId);

      if (directLegacyLink || directEntityLink) {
        addLinkedTransaction(tx, directEntityLink ? 'event_link' : 'legacy_event_link', true);
      }
    }

    for (const inscription of eventInscriptions) {
      if (inscription.transaction_id) {
        addLinkedTransaction(transactionsById.get(inscription.transaction_id), 'inscription_payment', false);
      }
    }

    for (const expense of eventExpenses) {
      if (expense.transaction_id) {
        addLinkedTransaction(transactionsById.get(expense.transaction_id), 'expense_payment', false);
      }
    }

    // --- Second pass: find refund transactions that cancel a linked transaction ---
    // Build a map of numero_sequence → transaction id for all currently linked transactions
    const linkedSeqMap = new Map<string, string>();
    for (const [txId, tx] of linkedMap) {
      if (tx.numero_sequence) {
        linkedSeqMap.set(tx.numero_sequence, txId);
        // Also map the short number (e.g., "312" from "2026-00312") for "annule mvmt" patterns
        const parts = tx.numero_sequence.split('-');
        const shortNum = (parts[parts.length - 1] || '').replace(/^0+/, '') || '0';
        linkedSeqMap.set(shortNum, txId);
      }
    }

    if (linkedSeqMap.size > 0) {
      // Patterns to detect refund references in communication:
      // - "Remb. tr. 2026-00312" or "REMB. TR. 2026-00312"
      // - "annule mvmt 312" or "annule mouvement 312"
      const refundPatterns = [
        /remb\.?\s*tr\.?\s*([\d]{4}-[\d]+)/i,           // "Remb. tr. 2026-00312"
        /annul\w*\s+(?:mvmt|mouvement)?\s*[-:]?\s*(\d+)/i  // "annule mvmt 312"
      ];

      for (const tx of transactions) {
        // Skip if already linked or if it's a parent/split
        if (linkedMap.has(tx.id) || tx.is_parent || tx.is_split) continue;

        const comm = tx.communication || '';
        for (const pattern of refundPatterns) {
          const match = comm.match(pattern);
          if (match && match[1]) {
            const ref = match[1];
            // Check if the referenced transaction is in our linked set
            if (linkedSeqMap.has(ref)) {
              addLinkedTransaction(tx, 'refund_of_linked', false);
              break;
            }
            // For full sequence refs like "2026-00312", also try short form
            const shortRef = ref.includes('-') ? (ref.split('-').pop() || '').replace(/^0+/, '') || '0' : null;
            if (shortRef && linkedSeqMap.has(shortRef)) {
              addLinkedTransaction(tx, 'refund_of_linked', false);
              break;
            }
          }
        }
      }

      // Also check expenses with source_transaction_id pointing to a linked transaction
      for (const expense of eventExpenses) {
        if (expense.source_transaction_id && expense.transaction_id) {
          const sourceLinked = [...linkedMap.keys()].some(id => {
            const tx = linkedMap.get(id);
            return tx?.id === expense.source_transaction_id;
          });
          if (sourceLinked) {
            addLinkedTransaction(transactionsById.get(expense.transaction_id), 'refund_expense_payment', false);
          }
        }
      }
    }

    return Array.from(linkedMap.values()).sort((a, b) => {
      const aDate = a.date_execution instanceof Date ? a.date_execution.getTime() : new Date(a.date_execution).getTime();
      const bDate = b.date_execution instanceof Date ? b.date_execution.getTime() : new Date(b.date_execution).getTime();
      return bDate - aDate;
    });
  };

  const loadCompleteEventLinks = async (eventId: string): Promise<{
    transactions: LinkedOperationTransaction[];
    expenses: DemandeRemboursement[];
    inscriptions: InscriptionEvenement[];
  } | null> => {
    if (!clubId || appUser?.app_role === 'user') {
      return null;
    }

    try {
      const expensesRef = collection(db, 'clubs', clubId, 'demandes_remboursement');
      const transactionsRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
      const inscriptionsRef = collection(db, 'clubs', clubId, 'operations', eventId, 'inscriptions');

      const [inscriptionsSnap, expensesByOperationSnap, expensesByEventSnap, transactionsSnap] = await Promise.all([
        getDocs(inscriptionsRef),
        getDocs(query(expensesRef, where('operation_id', '==', eventId))),
        getDocs(query(expensesRef, where('evenement_id', '==', eventId))),
        getDocs(query(transactionsRef, orderBy('date_execution', 'desc')))
      ]);

      const fullInscriptions = inscriptionsSnap.docs.map(docSnap => normalizeInscription(docSnap.id, docSnap.data()));
      const expensesMap = new Map<string, DemandeRemboursement>();

      for (const expenseDoc of [...expensesByOperationSnap.docs, ...expensesByEventSnap.docs]) {
        expensesMap.set(expenseDoc.id, normalizeExpense(expenseDoc.id, expenseDoc.data()));
      }

      const fullExpenses = Array.from(expensesMap.values()).sort((a, b) => {
        const aDate = a.date_soumission?.getTime?.() || a.date_depense?.getTime?.() || 0;
        const bDate = b.date_soumission?.getTime?.() || b.date_depense?.getTime?.() || 0;
        return bDate - aDate;
      });

      const fullTransactions = transactionsSnap.docs.map(docSnap => normalizeTransaction(docSnap.id, docSnap.data()));
      const resolvedTransactions = buildLinkedTransactionsForEvent(eventId, fullTransactions, fullInscriptions, fullExpenses);

      setInscriptions(prev => ({
        ...prev,
        [eventId]: fullInscriptions
      }));
      setDetailAvailableTransactions(fullTransactions);
      setDetailLinkedTransactions(resolvedTransactions);
      setDetailLinkedExpenses(fullExpenses);
      return {
        transactions: resolvedTransactions,
        expenses: fullExpenses,
        inscriptions: fullInscriptions
      };
    } catch (error) {
      logger.error('Error loading complete event links:', error);
      toast.error('Erreur lors du chargement complet des liaisons');
      return null;
    }
  };

  const loadDetailAvailableExpenses = async (): Promise<DemandeRemboursement[]> => {
    if (!clubId || appUser?.app_role === 'user') {
      return [];
    }

    try {
      const expensesRef = collection(db, 'clubs', clubId, 'demandes_remboursement');
      const snapshot = await getDocs(query(expensesRef, orderBy('date_depense', 'desc')));
      const fullExpenses = snapshot.docs.map(docSnap => normalizeExpense(docSnap.id, docSnap.data()));
      setDetailAvailableExpenses(fullExpenses);
      return fullExpenses;
    } catch (error) {
      logger.error('Error loading complete expense candidates:', error);
      toast.error('Erreur lors du chargement complet des dépenses');
      return [];
    }
  };

  const getLinkedTransactionsForEvent = (eventId: string): LinkedOperationTransaction[] => {
    if (detailViewEvent?.id === eventId) {
      return detailLinkedTransactions;
    }

    return (linkedTransactions[eventId] || []) as LinkedOperationTransaction[];
  };

  const getLinkedExpensesForEvent = (eventId: string): DemandeRemboursement[] => {
    if (detailViewEvent?.id === eventId) {
      return detailLinkedExpenses;
    }

    return linkedExpenses[eventId] || [];
  };

  const getTransactionsForLinkingPanel = (eventId: string): TransactionBancaire[] => {
    if (detailViewEvent?.id === eventId && detailAvailableTransactions.length > 0) {
      return detailAvailableTransactions;
    }

    return allTransactions;
  };

  const getExpensesForLinkingPanel = (eventId: string): DemandeRemboursement[] => {
    if (detailViewEvent?.id === eventId && detailAvailableExpenses.length > 0) {
      return detailAvailableExpenses;
    }

    return allExpenses;
  };

  const getOperationById = (operationId: string): Operation | null => {
    if (detailViewEvent?.id === operationId) {
      return detailViewEvent;
    }

    return events.find(event => event.id === operationId) || null;
  };

  const getDemandLinkedTransactions = (
    demandId: string,
    fallbackTransactions: TransactionBancaire[] = [],
    legacyTransactionId?: string | null
  ) => {
    const transactionPool = [...fallbackTransactions, ...allTransactions];
    const seenIds = new Set<string>();

    return transactionPool.filter(transaction => {
      if (seenIds.has(transaction.id)) {
        return false;
      }

      const isLinked = transaction.id === legacyTransactionId || transaction.matched_entities?.some(entity =>
        (entity.entity_type === 'expense' || entity.entity_type === 'demand') && entity.entity_id === demandId
      );

      if (isLinked) {
        seenIds.add(transaction.id);
      }

      return isLinked;
    });
  };

  const getTransactionForMutation = async (eventId: string, transactionId: string): Promise<TransactionBancaire | null> => {
    const existingTransaction = getLinkedTransactionsForEvent(eventId).find(tx => tx.id === transactionId)
      || allTransactions.find(tx => tx.id === transactionId);

    if (existingTransaction) {
      return existingTransaction;
    }

    const txSnap = await getDoc(doc(db, 'clubs', clubId, 'transactions_bancaires', transactionId));
    if (!txSnap.exists()) {
      return null;
    }

    return normalizeTransaction(txSnap.id, txSnap.data());
  };

  const getExpenseForMutation = async (eventId: string, expenseId: string): Promise<DemandeRemboursement | null> => {
    const existingExpense = getLinkedExpensesForEvent(eventId).find(expense => expense.id === expenseId)
      || allExpenses.find(expense => expense.id === expenseId);

    if (existingExpense) {
      return existingExpense;
    }

    const expenseSnap = await getDoc(doc(db, 'clubs', clubId, 'demandes_remboursement', expenseId));
    if (!expenseSnap.exists()) {
      return null;
    }

    return normalizeExpense(expenseSnap.id, expenseSnap.data());
  };

  // Load events, transactions and expenses from Firestore on mount and when filter changes
  useEffect(() => {
    // ⚠️ CRITICAL: Wait for both selectedFiscalYear AND appUser before loading data
    // Without appUser, we don't know the role and can't apply correct filters
    // Exception: if disableFiscalYearFilter is true, we can proceed without selectedFiscalYear
    const canLoad = (selectedFiscalYear || disableFiscalYearFilter) && appUser;
    if (canLoad) {
      logger.debug(`🔄 [OperationsPage] Loading data with appUser role: ${appUser.app_role}, disableFiscalYearFilter: ${disableFiscalYearFilter}`);
      loadEvents();
      // ⚠️ CRITICAL: Users (role 'user') cannot access transactions/expenses - skip these queries
      if (appUser.app_role !== 'user') {
        loadAllTransactions();
        loadAllExpenses();
      } else {
        logger.debug('⏸️ [OperationsPage] User role cannot access transactions/expenses, skipping');
        setAllTransactions([]);
        setAllExpenses([]);
      }
    } else if ((selectedFiscalYear || disableFiscalYearFilter) && !appUser) {
      logger.debug('⏸️ [OperationsPage] Waiting for appUser to load before fetching data...');
    }
  }, [clubId, filterType, selectedFiscalYear, appUser, disableFiscalYearFilter]); // Recharger quand le filtre de type, fiscal year, toggle, ou appUser change

  // Auto-open event if navigated from transaction detail or expense detail
  useEffect(() => {
    const eventIdToOpen = location.state?.openEventId || location.state?.selectedEventId;
    if (eventIdToOpen && events.length > 0 && !detailViewEvent) {
      const eventToOpen = events.find(e => e.id === eventIdToOpen);
      if (eventToOpen) {
        logger.debug('🔓 [OperationsPage] Opening event from navigation state:', eventIdToOpen);
        setDetailViewEvent(eventToOpen);
        // Clear the state to prevent re-opening when modal closes
        navigate(location.pathname, { replace: true, state: {} });
      }
    }
  }, [location.state, events, detailViewEvent, navigate, location.pathname]);

  // Auto-open event with transaction linking modal from URL params (return from transaction detail)
  useEffect(() => {
    const selectedId = searchParams.get('selectedId');
    const openLinkingModal = searchParams.get('openLinkingModal');

    if (selectedId && openLinkingModal === 'true' && events.length > 0 && !detailViewEvent) {
      const eventToOpen = events.find(e => e.id === selectedId);
      if (eventToOpen) {
        // Open event detail
        setDetailViewEvent(eventToOpen);

        // Open transaction linking modal
        setLinkingEventId(selectedId);
        setShowTransactionLinking(true);

        // Clear URL params to prevent reopening on refresh
        setSearchParams({});
      }
    }
  }, [searchParams, events, detailViewEvent, setSearchParams]);

  // Restore scroll position and highlight when closing detail view
  useEffect(() => {
    if (!detailViewEvent && lastViewedEventId) {
      // Modal closed, scroll to the viewed event
      const element = document.getElementById(`event-${lastViewedEventId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      // Clear highlight after 3 seconds
      const timer = setTimeout(() => setLastViewedEventId(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [detailViewEvent, lastViewedEventId]);

  useEffect(() => {
    if (!detailViewEvent || appUser?.app_role === 'user') {
      setDetailLinkedTransactions([]);
      setDetailLinkedExpenses([]);
      setDetailAvailableTransactions([]);
      setDetailAvailableExpenses([]);
      return;
    }

    setDetailAvailableTransactions(allTransactions);
    setDetailAvailableExpenses(allExpenses);
    setDetailLinkedTransactions((linkedTransactions[detailViewEvent.id] || []) as LinkedOperationTransaction[]);
    setDetailLinkedExpenses(linkedExpenses[detailViewEvent.id] || []);
    void loadCompleteEventLinks(detailViewEvent.id);
  }, [detailViewEvent?.id, appUser?.app_role, allTransactions, allExpenses]);

  // Real-time listener for inscriptions when detail view is open
  // This ensures payment status updates are reflected immediately
  useEffect(() => {
    if (!detailViewEvent || !clubId) return;

    const eventId = detailViewEvent.id;
    const inscriptionsRef = collection(db, 'clubs', clubId, 'operations', eventId, 'inscriptions');

    logger.debug(`🔄 Setting up real-time listener for inscriptions of event: ${eventId}`);

    const unsubscribe = onSnapshot(inscriptionsRef, (snapshot) => {
      const loadedInscriptions = snapshot.docs.map(docSnap =>
        normalizeInscription(docSnap.id, docSnap.data())
      );

      logger.debug(`🔄 [Real-time] Inscriptions updated for event ${eventId}: ${loadedInscriptions.length}`);

      setInscriptions(prev => ({
        ...prev,
        [eventId]: loadedInscriptions
      }));
    }, (error) => {
      logger.error(`❌ Real-time inscription listener error for event ${eventId}:`, error);
    });

    return () => {
      logger.debug(`🛑 Cleaning up real-time listener for event: ${eventId}`);
      unsubscribe();
    };
  }, [detailViewEvent?.id, clubId]);

  useEffect(() => {
    if (!showExpenseLinking || !linkingEventId || detailViewEvent?.id !== linkingEventId || appUser?.app_role === 'user') {
      return;
    }

    void loadDetailAvailableExpenses();
  }, [showExpenseLinking, linkingEventId, detailViewEvent?.id, appUser?.app_role]);

  useEffect(() => {
    const nextLinkedExpenses: Record<string, DemandeRemboursement[]> = {};

    for (const expense of allExpenses) {
      const eventId = getExpenseLinkedEventId(expense);
      if (!eventId) continue;

      if (!nextLinkedExpenses[eventId]) {
        nextLinkedExpenses[eventId] = [];
      }
      nextLinkedExpenses[eventId].push(expense);
    }

    setLinkedExpenses(nextLinkedExpenses);
  }, [allExpenses]);

  useEffect(() => {
    const expensesByEvent: Record<string, DemandeRemboursement[]> = {};
    for (const expense of allExpenses) {
      const eventId = getExpenseLinkedEventId(expense);
      if (!eventId) continue;

      if (!expensesByEvent[eventId]) {
        expensesByEvent[eventId] = [];
      }
      expensesByEvent[eventId].push(expense);
    }

    const eventIds = new Set<string>();

    for (const eventId of Object.keys(inscriptions)) {
      eventIds.add(eventId);
    }
    for (const eventId of Object.keys(expensesByEvent)) {
      eventIds.add(eventId);
    }
    for (const tx of allTransactions) {
      if (tx.operation_id) eventIds.add(tx.operation_id);
      if (tx.evenement_id) eventIds.add(tx.evenement_id);
      for (const entity of tx.matched_entities || []) {
        if (entity.entity_type === 'event' || (entity.entity_type as string) === 'operation') {
          eventIds.add(entity.entity_id);
        }
      }
    }

    const nextLinkedTransactions: Record<string, TransactionBancaire[]> = {};
    for (const eventId of eventIds) {
      const eventTransactions = buildLinkedTransactionsForEvent(
        eventId,
        allTransactions,
        inscriptions[eventId] || [],
        expensesByEvent[eventId] || []
      );

      if (eventTransactions.length > 0) {
        nextLinkedTransactions[eventId] = eventTransactions;
      }
    }

    setLinkedTransactions(nextLinkedTransactions);
  }, [allTransactions, allExpenses, inscriptions]);

  const loadEvents = async () => {
    // 🔧 TEMPORAIRE: Si le filtre est désactivé, on n'attend pas selectedFiscalYear
    if (!disableFiscalYearFilter && !selectedFiscalYear) {
      logger.debug('⏸️ No fiscal year selected, skipping operations load');
      setEvents([]);
      setInscriptions({});
      return;
    }

    try {
      setLoading(true);
      // 🆕 MIGRATION: Lire depuis 'operations' au lieu de 'evenements'
      const operationsRef = collection(db, 'clubs', clubId, 'operations');

      // 🔒 USER ISOLATION: Filter by organisateur_id for 'user' role
      // 📅 Filter by date_debut within fiscal year range (not by fiscal_year_id)
      // This ensures events are shown based on when they occur, not when they were created
      // Convert Date to Timestamp for Firestore queries
      const startTimestamp = selectedFiscalYear ? Timestamp.fromDate(selectedFiscalYear.start_date) : null;
      const endTimestamp = selectedFiscalYear ? Timestamp.fromDate(selectedFiscalYear.end_date) : null;

      let q;
      if (appUser?.app_role === 'user') {
        // User role: only see own operations (type 'evenement' only enforced in create/update rules)
        logger.debug(`🔒 USER ISOLATION: Loading only own operations for user ${user?.uid}`);
        if (filterType === 'tous') {
          q = disableFiscalYearFilter
            ? query(operationsRef, where('organisateur_id', '==', user?.uid), orderBy('date_debut', 'desc'))
            : query(operationsRef, where('date_debut', '>=', startTimestamp), where('date_debut', '<=', endTimestamp), where('organisateur_id', '==', user?.uid), orderBy('date_debut', 'desc'));
        } else {
          q = disableFiscalYearFilter
            ? query(operationsRef, where('type', '==', filterType), where('organisateur_id', '==', user?.uid), orderBy('date_debut', 'desc'))
            : query(operationsRef, where('date_debut', '>=', startTimestamp), where('date_debut', '<=', endTimestamp), where('type', '==', filterType), where('organisateur_id', '==', user?.uid), orderBy('date_debut', 'desc'));
        }
      } else {
        // Admin/validateur/superadmin: see all operations
        if (filterType === 'tous') {
          q = disableFiscalYearFilter
            ? query(operationsRef, orderBy('date_debut', 'desc'))
            : query(operationsRef, where('date_debut', '>=', startTimestamp), where('date_debut', '<=', endTimestamp), orderBy('date_debut', 'desc'));
        } else {
          q = disableFiscalYearFilter
            ? query(operationsRef, where('type', '==', filterType), orderBy('date_debut', 'desc'))
            : query(operationsRef, where('date_debut', '>=', startTimestamp), where('date_debut', '<=', endTimestamp), where('type', '==', filterType), orderBy('date_debut', 'desc'));
        }
      }

      logger.debug(`📊 Loading operations for fiscal year: ${disableFiscalYearFilter ? 'ALL' : selectedFiscalYear?.year}, type: ${filterType} (role: ${appUser?.app_role})`);
      const snapshot = await getDocs(q);

      const loadedEvents = snapshot.docs.map(doc => {
        const data = doc.data();
        const normalizedOperation: Operation = {
          ...(data as Partial<Operation>),
          id: doc.id,
          type: (data.type || 'evenement') as Operation['type'],
          titre: data.titre || 'Activité sans titre',
          statut: (data.statut || 'brouillon') as Operation['statut'],
          organisateur_id: data.organisateur_id || '',
          montant_prevu: getSafeOperationAmount(data),
          date_debut: data.date_debut?.toDate?.() || new Date(data.date_debut),
          date_fin: data.date_fin?.toDate?.() || (data.date_fin ? new Date(data.date_fin) : null),
          created_at: data.created_at?.toDate?.() || new Date(),
          updated_at: data.updated_at?.toDate?.() || new Date(),
          // 🆕 Mapper budget_prevu_revenus depuis montant_prevu si absent
          budget_prevu_revenus: Number.isFinite(Number(data.budget_prevu_revenus))
            ? Number(data.budget_prevu_revenus)
            : getSafeOperationAmount(data),
          budget_prevu_depenses: data.budget_prevu_depenses || 0
        };

        return normalizedOperation;
      });

      logger.debug(`✅ Loaded ${loadedEvents.length} operations for year ${disableFiscalYearFilter ? 'ALL' : selectedFiscalYear?.year}`);
      setEvents(loadedEvents);


      // ✅ UNIFIED: Load inscriptions from subcollections for each event IN PARALLEL
      const allInscriptions: Record<string, InscriptionEvenement[]> = {};

      logger.debug(`🔍 Loading inscriptions for ${loadedEvents.length} events in parallel...`);

      // Load inscriptions for all events in parallel using Promise.all
      const inscriptionPromises = loadedEvents.map(async (event) => {
        try {
          const inscriptionsRef = collection(db, 'clubs', clubId, 'operations', event.id, 'inscriptions');
          const inscSnapshot = await getDocs(inscriptionsRef);

          logger.debug(`📊 Event "${event.titre}" (${event.id}): ${inscSnapshot.docs.length} inscriptions`);

          const eventInscriptions = inscSnapshot.docs.map(docSnap =>
            normalizeInscription(docSnap.id, docSnap.data())
          );

          if (eventInscriptions.length > 0) {
            logger.debug(`   ✅ Loaded ${eventInscriptions.length} inscriptions for event ${event.id}`);
            return { eventId: event.id, inscriptions: eventInscriptions };
          }
          return null;
        } catch (error) {
          logger.error(`❌ Error loading inscriptions for event ${event.id}:`, error);
          return null;
        }
      });

      // Wait for all inscription loads to complete
      const inscriptionResults = await Promise.all(inscriptionPromises);

      // Build the inscriptions map from results
      inscriptionResults.forEach(result => {
        if (result) {
          allInscriptions[result.eventId] = result.inscriptions;
        }
      });

      logger.debug('📦 Total inscriptions loaded', {
        eventCount: Object.keys(allInscriptions).length
      });
      logger.debug(`📋 Inscriptions by event:`, allInscriptions);

      setInscriptions(allInscriptions);

      // Now update linkedTransactions to include transactions linked via inscriptions
      // Get current linkedMap (set by loadAllTransactions)
      setLinkedTransactions(prevLinked => {
        const updatedMap = { ...prevLinked };

        // For each event, find inscriptions with transaction_id
        for (const [eventId, eventInscriptions] of Object.entries(allInscriptions)) {
          for (const inscription of eventInscriptions) {
            if (inscription.transaction_id) {
              // Find the transaction in allTransactions
              const tx = allTransactions.find(t => t.id === inscription.transaction_id);
              if (tx && !tx.is_parent && !tx.is_split) {
                // Add to linkedMap if not already there
                if (!updatedMap[eventId]) {
                  updatedMap[eventId] = [];
                }
                // Check if not already added (avoid duplicates)
                if (!updatedMap[eventId].some(t => t.id === tx.id)) {
                  updatedMap[eventId].push(tx);
                }
              }
            }
          }
        }

        return updatedMap;
      });


    } catch (error) {
      logger.error('Error loading events:', error);
      toast.error('Erreur lors du chargement des événements');
    } finally {
      setLoading(false);
    }
  };

  // Load all transactions from Firestore
  const loadAllTransactions = async () => {
    if (!disableFiscalYearFilter && !selectedFiscalYear) {
      logger.debug('⏸️ No fiscal year selected, skipping transactions load');
      setAllTransactions([]);
      setLinkedTransactions({});
      return;
    }

    try {
      const transactionsRef = collection(db, 'clubs', clubId, 'transactions_bancaires');

      // Respect disableFiscalYearFilter toggle - load ALL transactions if filter is disabled
      const q = disableFiscalYearFilter
        ? query(transactionsRef, orderBy('date_execution', 'desc'))
        : query(
            transactionsRef,
            where('fiscal_year_id', '==', selectedFiscalYear!.id),
            orderBy('date_execution', 'desc')
          );

      logger.debug(`📊 Loading transactions for fiscal year: ${disableFiscalYearFilter ? 'ALL' : selectedFiscalYear?.year}`);
      const snapshot = await getDocs(q);

      const loadedTransactions = snapshot.docs.map(docSnap =>
        normalizeTransaction(docSnap.id, docSnap.data())
      );

      logger.debug(`✅ Loaded ${loadedTransactions.length} transactions for year ${disableFiscalYearFilter ? 'ALL' : selectedFiscalYear?.year}`);
      setAllTransactions(loadedTransactions);

      // Build linked transactions map
      const linkedMap: Record<string, TransactionBancaire[]> = {};

      for (const tx of loadedTransactions) {
        // IMPORTANT : Exclure les transactions parent (ventilées) car elles sont non utilisables
        // Seules les transactions normales et les enfants sont comptabilisées
        if (tx.is_parent || tx.is_split) continue;

        for (const eventId of getTransactionEventLinkIds(tx)) {
          if (!linkedMap[eventId]) {
            linkedMap[eventId] = [];
          }
          if (!linkedMap[eventId].some(existingTx => existingTx.id === tx.id)) {
            linkedMap[eventId].push(tx);
          }
        }
      }

      setLinkedTransactions(linkedMap);

      // ALSO need to load transactions linked via inscriptions
      // This will be called after inscriptions are loaded

    } catch (error) {
      logger.error('Error loading transactions:', error);
      toast.error('Erreur lors du chargement des transactions');
    }
  };

  // Load all expense claims from Firestore
  const loadAllExpenses = async () => {
    // 🔧 Respect disableFiscalYearFilter toggle - load ALL expenses if filter is disabled
    if (!disableFiscalYearFilter && !selectedFiscalYear) {
      logger.debug('⏸️ No fiscal year selected, skipping expenses load');
      setAllExpenses([]);
      return;
    }

    try {
      const expensesRef = collection(db, 'clubs', clubId, 'demandes_remboursement');

      // Respect disableFiscalYearFilter toggle - load ALL expenses if filter is disabled
      const q = disableFiscalYearFilter
        ? query(expensesRef, orderBy('date_depense', 'desc'))
        : query(
            expensesRef,
            where('fiscal_year_id', '==', selectedFiscalYear!.id),
            orderBy('date_depense', 'desc')
          );

      logger.debug(`📊 Loading expenses for fiscal year: ${disableFiscalYearFilter ? 'ALL' : selectedFiscalYear?.year}`);
      const snapshot = await getDocs(q);

      const loadedExpenses = snapshot.docs.map(docSnap =>
        normalizeExpense(docSnap.id, docSnap.data())
      );

      logger.debug(`✅ Loaded ${loadedExpenses.length} expenses for year ${disableFiscalYearFilter ? 'ALL' : selectedFiscalYear?.year}`);
      setAllExpenses(loadedExpenses);

      // Build linked expenses map by event
      const linkedMap: Record<string, DemandeRemboursement[]> = {};
      for (const expense of loadedExpenses) {
        const eventId = getExpenseLinkedEventId(expense);
        if (eventId) {
          if (!linkedMap[eventId]) {
            linkedMap[eventId] = [];
          }
          linkedMap[eventId].push(expense);
        }
      }
      setLinkedExpenses(linkedMap);

    } catch (error) {
      logger.error('Error loading expenses:', error);
      toast.error('Erreur lors du chargement des demandes');
    }
  };

  // Reload inscriptions for a specific event (called after AI validation)
  const loadInscriptions = async (eventId: string) => {
    try {
      // ✅ UNIFIED: Load from subcollection 'clubs/{clubId}/operations/{eventId}/inscriptions'
      const inscriptionsRef = collection(db, 'clubs', clubId, 'operations', eventId, 'inscriptions');
      const inscSnapshot = await getDocs(inscriptionsRef);
      const eventInscriptions = inscSnapshot.docs.map(docSnap =>
        normalizeInscription(docSnap.id, docSnap.data())
      );

      setInscriptions(prev => ({
        ...prev,
        [eventId]: eventInscriptions
      }));

      logger.debug(`✅ Loaded ${eventInscriptions.length} inscriptions for event ${eventId} from subcollection`);

      if (detailViewEvent?.id === eventId) {
        void loadCompleteEventLinks(eventId);
      }
    } catch (error) {
      logger.error('Error loading inscriptions:', error);
    }
  };

  // Reload linked transactions for a specific event (called after AI validation)
  const loadLinkedTransactions = async (eventId: string) => {
    try {
      await loadCompleteEventLinks(eventId);
      logger.debug(`✅ Reloaded complete linked transactions for event ${eventId}`);
    } catch (error) {
      logger.error('Error reloading linked transactions:', error);
    }
  };

  // Handle column sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Cycle through: asc -> desc -> null
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortField(null);
        setSortDirection(null);
      }
    } else {
      // New field, start with asc
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Filtrer et trier les événements
  const now = useMemo(() => new Date(), []);
  const accountingSummariesByEvent = useMemo(() => {
    const summaries: Record<string, ReturnType<typeof summarizeOperationTransactions>> = {};

    for (const [eventId, eventTransactions] of Object.entries(linkedTransactions)) {
      summaries[eventId] = summarizeOperationTransactions(eventTransactions);
    }

    return summaries;
  }, [linkedTransactions]);

  const filteredEvents = events
    .filter(event => {
      const matchesSearch = searchTerm === '' ||
        event.titre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.lieu?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.organisateur_nom?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatut = filterStatut === '' || event.statut === filterStatut;

      // Filtre par catégorie d'événement (seulement applicable aux événements)
      // Si filterEventCategory est défini (pas 'all'), on filtre uniquement les événements qui ont cette catégorie
      // Les non-événements ne sont PAS affichés quand on filtre par catégorie d'événement
      const matchesEventCategory = filterEventCategory === 'all' ||
        ((event as Operation).type === 'evenement' && (event as Operation).event_category === filterEventCategory);

      return matchesSearch && matchesStatut && matchesEventCategory;
    })
    .sort((a, b) => {
      // Default sort (no manual sort): upcoming first (asc), then past (desc)
      // This puts the soonest upcoming event at the top, then future events,
      // then past events from most recent to oldest
      if (!sortField || !sortDirection) {
        const aStart = a.date_debut?.getTime() ?? 0;
        const bStart = b.date_debut?.getTime() ?? 0;
        const aIsFuture = aStart >= now.getTime();
        const bIsFuture = bStart >= now.getTime();

        if (aIsFuture && bIsFuture) {
          // Both future: soonest first (ascending)
          return aStart - bStart;
        }
        if (!aIsFuture && !bIsFuture) {
          // Both past: most recent first (descending)
          return bStart - aStart;
        }
        // Future before past
        return aIsFuture ? -1 : 1;
      }

      let comparison = 0;

      switch (sortField) {
        case 'type':
          comparison = (a.type || 'evenement').localeCompare(b.type || 'evenement', 'fr');
          break;
        case 'titre':
          comparison = a.titre.localeCompare(b.titre, 'fr');
          break;
        case 'date_debut':
          comparison = (a.date_debut?.getTime() ?? 0) - (b.date_debut?.getTime() ?? 0);
          break;
        case 'participants': {
          const aCount = inscriptions[a.id]?.length || 0;
          const bCount = inscriptions[b.id]?.length || 0;
          comparison = aCount - bCount;
          break;
        }
        case 'statut':
          const aStatut = a.statut || '';
          const bStatut = b.statut || '';
          comparison = aStatut.localeCompare(bStatut, 'fr');
          break;
        case 'balance': {
          const aBalance = accountingSummariesByEvent[a.id]?.balance || 0;
          const bBalance = accountingSummariesByEvent[b.id]?.balance || 0;
          comparison = aBalance - bBalance;
          break;
        }
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

  // Keyboard navigatie voor detail view (pijltjestoetsen ← →)
  useKeyboardNavigation({
    items: filteredEvents,
    currentItem: detailViewEvent,
    onNavigate: setDetailViewEvent,
    isOpen: !!detailViewEvent
  });

  // Synchronize lastViewedEventId with detailViewEvent (for blue highlight)
  useEffect(() => {
    if (detailViewEvent) {
      setLastViewedEventId(detailViewEvent.id);
    }
  }, [detailViewEvent]);

  // Calculer les totaux pour toutes les activités filtrées
  // Même formule que l'onglet Liaisons: uniquement les transactions bancaires catégorisées
  const pageTotals = useMemo(() => {
    return filteredEvents.reduce((totals, event) => {
      const summary = accountingSummariesByEvent[event.id];
      if (!summary) {
        return totals;
      }

      return {
        revenus: totals.revenus + summary.revenueTotal,
        depenses: totals.depenses + summary.expenseTotal,
        balance: totals.balance + summary.balance
      };
    }, { revenus: 0, depenses: 0, balance: 0 });
  }, [filteredEvents, accountingSummariesByEvent]);

  // Lier des transactions à un événement
  const handleLinkTransactions = async (transactionIds: string[]) => {
    if (!linkingEventId) return;

    const event = events.find(e => e.id === linkingEventId);
    if (!event) return;

    try {
      let linkedCount = 0;
      let skippedOtherEventCount = 0;

      // Mettre à jour chaque transaction
      for (const txId of transactionIds) {
        const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', txId);
        const transaction = await getTransactionForMutation(linkingEventId, txId);
        if (!transaction) continue;

        if (getOtherTransactionEventLinkIds(transaction, linkingEventId).length > 0) {
          skippedOtherEventCount += 1;
          continue;
        }

        // Ajouter ou mettre à jour l'entité liée
        const existingEntities = transaction.matched_entities || [];
        const newEntity = {
          entity_type: 'event' as const,
          entity_id: linkingEventId,
          entity_name: event.titre,
          confidence: 100,
          matched_at: new Date(),
          matched_by: 'manual' as const
        };

        // Vérifier si l'événement n'est pas déjà lié
        const alreadyLinked = getTransactionEventLinkIds(transaction).includes(linkingEventId);
        const nextEntities = alreadyLinked ? existingEntities : [...existingEntities, newEntity];

        await updateDoc(txRef, {
          matched_entities: nextEntities,
          operation_id: linkingEventId,
          evenement_id: linkingEventId,
          reconcilie: true,
          updated_at: serverTimestamp()
        });
        linkedCount += 1;
      }

      // Recharger les transactions
      await loadAllTransactions();
      if (detailViewEvent?.id === linkingEventId) {
        await loadCompleteEventLinks(linkingEventId);
      }

      if (linkedCount > 0 && skippedOtherEventCount > 0) {
        toast.success(`${linkedCount} transaction(s) liée(s), ${skippedOtherEventCount} ignorée(s) car déjà liée(s) à une autre activité`);
      } else if (linkedCount > 0) {
        toast.success(`${linkedCount} transaction${linkedCount > 1 ? 's' : ''} liée${linkedCount > 1 ? 's' : ''} à l'événement`);
      } else {
        toast.error("Aucune transaction liée : les transactions sélectionnées appartiennent déjà à une autre activité");
      }
    } catch (error) {
      logger.error('Error linking transactions:', error);
      toast.error('Erreur lors de la liaison des transactions');
      throw error;
    }
  };

  // Délier une transaction d'un événement
  const handleUnlinkTransaction = async (eventId: string, transactionId: string) => {
    try {
      const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', transactionId);
      const transaction = await getTransactionForMutation(eventId, transactionId);
      if (!transaction) return;

      // Retirer les liens directs vers l'événement, sans toucher aux liens indirects via inscription/dépense.
      const updatedEntities = (transaction.matched_entities || []).filter(
        e => !(
          (e.entity_type === 'event' || (e.entity_type as string) === 'operation') &&
          e.entity_id === eventId
        )
      );

      await updateDoc(txRef, {
        matched_entities: updatedEntities,
        operation_id: transaction.operation_id === eventId ? null : (transaction.operation_id || null),
        evenement_id: transaction.evenement_id === eventId ? null : (transaction.evenement_id || null),
        reconcilie: updatedEntities.length > 0,
        updated_at: serverTimestamp()
      });

      // Mettre à jour l'état local
      setLinkedTransactions(prev => ({
        ...prev,
        [eventId]: (prev[eventId] || []).filter(tx => tx.id !== transactionId)
      }));

      // Mettre à jour allTransactions
      setAllTransactions(prev => prev.map(tx =>
        tx.id === transactionId
          ? {
              ...tx,
              matched_entities: updatedEntities,
              operation_id: tx.operation_id === eventId ? undefined : tx.operation_id,
              evenement_id: tx.evenement_id === eventId ? undefined : tx.evenement_id,
              reconcilie: updatedEntities.length > 0
            }
          : tx
      ));

      if (detailViewEvent?.id === eventId) {
        await loadCompleteEventLinks(eventId);
      }

      toast.success("Transaction déliée de l'événement");
    } catch (error) {
      logger.error('Error unlinking transaction:', error);
      toast.error('Erreur lors de la suppression du lien');
    }
  };

  // Lier des dépenses à un événement
  const handleLinkExpenses = async (expenseIds: string[]) => {
    if (!linkingEventId) return;

    const event = events.find(e => e.id === linkingEventId);
    if (!event) return;

    try {
      let linkedCount = 0;
      let skippedOtherEventCount = 0;
      let skippedTransactionConflictCount = 0;

      // Mettre à jour chaque demande
      for (const expenseId of expenseIds) {
        const expenseRef = doc(db, 'clubs', clubId, 'demandes_remboursement', expenseId);
        const expense = await getExpenseForMutation(linkingEventId, expenseId);
        if (!expense) continue;

        if (isExpenseLinkedToOtherEvent(expense, linkingEventId)) {
          skippedOtherEventCount += 1;
          continue;
        }

        if (expense.transaction_id) {
          const transaction = await getTransactionForMutation(linkingEventId, expense.transaction_id);
          if (transaction && getOtherTransactionEventLinkIds(transaction, linkingEventId).length > 0) {
            skippedTransactionConflictCount += 1;
            continue;
          }
        }

        // Mettre à jour la demande avec l'événement
        // 🆕 MIGRATION: Write to both operation_id and evenement_id for backward compatibility
        await updateDoc(expenseRef, {
          operation_id: linkingEventId,
          operation_titre: event.titre,
          evenement_id: linkingEventId,
          evenement_titre: event.titre,
          updated_at: serverTimestamp()
        });
        linkedCount += 1;

        // Si la demande a une transaction bancaire liée, ajouter aussi l'événement à cette transaction
        if (expense.transaction_id) {
          const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', expense.transaction_id);
          const transaction = await getTransactionForMutation(linkingEventId, expense.transaction_id);

          if (transaction) {
            const existingEntities = transaction.matched_entities || [];

            // Vérifier si l'événement n'est pas déjà lié
            const alreadyLinked = getTransactionEventLinkIds(transaction).includes(linkingEventId);

            if (!alreadyLinked) {
              const newEntity = {
                entity_type: 'event' as const,
                entity_id: linkingEventId,
                entity_name: event.titre,
                confidence: 100,
                matched_at: new Date(),
                matched_by: 'auto' as const,
                notes: 'linked_via_expense'
              };

              await updateDoc(txRef, {
                matched_entities: [...existingEntities, newEntity],
                reconcilie: true,
                updated_at: serverTimestamp()
              });
            }
          }
        }
      }

      // Recharger les données
      await loadAllExpenses();
      await loadAllTransactions();
      if (detailViewEvent?.id === linkingEventId) {
        await loadCompleteEventLinks(linkingEventId);
      }

      if (linkedCount > 0 && (skippedOtherEventCount > 0 || skippedTransactionConflictCount > 0)) {
        toast.success(
          `${linkedCount} demande(s) liée(s), ${skippedOtherEventCount} ignorée(s) car déjà liée(s) ailleurs, ${skippedTransactionConflictCount} ignorée(s) car leur transaction appartient à une autre activité`
        );
      } else if (linkedCount > 0) {
        toast.success(`${linkedCount} demande${linkedCount > 1 ? 's' : ''} liée${linkedCount > 1 ? 's' : ''} à l'événement`);
      } else {
        toast.error("Aucune demande liée : les éléments sélectionnés appartiennent déjà à une autre activité");
      }
    } catch (error) {
      logger.error('Error linking expenses:', error);
      toast.error('Erreur lors de la liaison des demandes');
      throw error;
    }
  };

  // Délier une demande de remboursement d'un événement
  const handleUnlinkExpense = async (eventId: string, expenseId: string) => {
    try {
      const expenseRef = doc(db, 'clubs', clubId, 'demandes_remboursement', expenseId);
      const expense = await getExpenseForMutation(eventId, expenseId);
      if (!expense) return;

      // Retirer l'événement de la demande
      // 🆕 MIGRATION: Clear both operation_id and evenement_id for backward compatibility
      await updateDoc(expenseRef, {
        operation_id: null,
        operation_titre: null,
        evenement_id: null,
        evenement_titre: null,
        updated_at: serverTimestamp()
      });

      // Si la demande a une transaction bancaire liée, retirer aussi l'événement de cette transaction
      if (expense.transaction_id) {
        const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', expense.transaction_id);
        const transaction = await getTransactionForMutation(eventId, expense.transaction_id);

        if (transaction) {
          // Retirer uniquement le lien automatique créé via la dépense.
          const updatedEntities = (transaction.matched_entities || []).filter(
            e => !(
              (e.entity_type === 'event' || (e.entity_type as string) === 'operation') &&
              e.entity_id === eventId &&
              e.matched_by === 'auto'
            )
          );

          await updateDoc(txRef, {
            matched_entities: updatedEntities,
            reconcilie: updatedEntities.length > 0,
            updated_at: serverTimestamp()
          });

          // Mettre à jour allTransactions
          setAllTransactions(prev => prev.map(tx =>
            tx.id === expense.transaction_id
              ? { ...tx, matched_entities: updatedEntities, reconcilie: updatedEntities.length > 0 }
              : tx
          ));
        }
      }

      // Mettre à jour l'état local
      setLinkedExpenses(prev => ({
        ...prev,
        [eventId]: (prev[eventId] || []).filter(e => e.id !== expenseId)
      }));

      // Mettre à jour allExpenses
      // 🆕 MIGRATION: Clear both operation_id and evenement_id
      setAllExpenses(prev => prev.map(e =>
        e.id === expenseId
          ? { ...e, operation_id: undefined, operation_titre: undefined, evenement_id: undefined, evenement_titre: undefined }
          : e
      ));

      if (detailViewEvent?.id === eventId) {
        await loadCompleteEventLinks(eventId);
      }

      toast.success("Demande déliée de l'événement");
    } catch (error) {
      logger.error('Error unlinking expense:', error);
      toast.error('Erreur lors de la suppression du lien');
    }
  };

  // ============================================================
  // INSCRIPTION LINKING HANDLERS
  // ============================================================

  /**
   * Confirm linking after transaction selection
   */
  const handleConfirmInscriptionLink = async (transactionIds: string[]) => {
    if (!linkingInscriptionId || !detailViewEvent) return;
    if (transactionIds.length === 0) return;

    const transactionId = transactionIds[0]; // Single selection for inscriptions

    try {
      const result = await linkInscriptionToTransaction(
        clubId,
        detailViewEvent.id,
        linkingInscriptionId,
        transactionId
      );

      if (result.success) {
        toast.success(result.message);

        // Reload events to get updated inscriptions
        await loadEvents();
        await loadAllTransactions();
      } else {
        toast.error(result.message);
      }
    } catch (error: any) {
      logger.error('Error linking inscription:', error);
      toast.error(error.message || 'Erreur lors de la liaison');
    } finally {
      setShowTransactionLinking(false);
      setLinkingInscriptionId(null);
      setLinkingEventId(null);
    }
  };

  /**
   * Direct linking of inscription to transaction (for payment control feature)
   */
  const handleDirectInscriptionLink = async (eventId: string, inscriptionId: string, transactionId: string) => {
    try {
      const result = await linkInscriptionToTransaction(
        clubId,
        eventId,
        inscriptionId,
        transactionId
      );

      if (!result.success) {
        throw new Error(result.message);
      }

    } catch (error: any) {
      logger.error('Error in direct inscription link:', error);
      throw error;
    }
  };

  /**
   * Unlink inscription from transaction
   */
  const handleUnlinkInscriptionTransaction = async (eventId: string, inscriptionId: string) => {
    try {
      const result = await unlinkInscriptionTransaction(
        clubId,
        eventId,
        inscriptionId,
        true // Mark as unpaid - return to red status with transaction dropdown
      );

      if (!result.success) {
        throw new Error(result.message);
      }

      toast.success('Transaction déliée - inscription marquée non payée');
    } catch (error: any) {
      logger.error('Error unlinking inscription transaction:', error);
      throw error;
    }
  };

  /**
   * Reload inscriptions for a specific event from inscriptions subcollection
   */
  const handleRefreshInscriptions = async (eventId: string) => {
    try {
      logger.debug('🔄 Refreshing inscriptions for event:', eventId);

      // Query the inscriptions subcollection under the operation
      const inscriptionsRef = collection(db, 'clubs', clubId, 'operations', eventId, 'inscriptions');
      const inscriptionsSnap = await getDocs(inscriptionsRef);

      logger.debug('📊 Found inscriptions:', inscriptionsSnap.docs.length);

      const loadedInscriptions = inscriptionsSnap.docs.map(docSnap =>
        normalizeInscription(docSnap.id, docSnap.data())
      );

      logger.debug('✅ Loaded inscriptions:', loadedInscriptions.map(i => `${i.membre_prenom} ${i.membre_nom}`));

      setInscriptions(prev => ({
        ...prev,
        [eventId]: loadedInscriptions
      }));

      logger.debug('✅ Inscriptions state updated');

      if (detailViewEvent?.id === eventId) {
        await loadCompleteEventLinks(eventId);
      }
    } catch (error) {
      logger.error('❌ Error refreshing inscriptions:', error);
      throw error;
    }
  };

  /**
   * Confirm auto-match results - NEW SIGNATURE
   * Now receives only accepted matches from the dialog
   */
  const handleConfirmAutoMatch = async (selectedMatches: MatchItem[], autoMarkCash: boolean) => {
    if (!detailViewEvent) return;

    try {
      logger.debug('✅ Confirming auto-match...', {
        selectedMatches: selectedMatches.length,
        autoMarkCash
      });

      // Link all accepted inscriptions
      for (const match of selectedMatches) {
        await linkInscriptionToTransaction(
          clubId,
          detailViewEvent.id,
          match.inscription.id,
          match.transaction.id
        );
      }

      // Mark cash payments if requested
      if (autoMarkCash && autoMatchResult) {
        for (const inscription of autoMatchResult.cashSuggested) {
          await markInscriptionPaidCash(
            clubId,
            detailViewEvent.id,
            inscription.id,
            'Auto-marqué comme paiement espèces (aucune transaction correspondante)'
          );
        }
      }

      const totalProcessed = selectedMatches.length + (autoMarkCash && autoMatchResult ? autoMatchResult.cashSuggested.length : 0);
      toast.success(`${totalProcessed} inscription${totalProcessed > 1 ? 's' : ''} traitée${totalProcessed > 1 ? 's' : ''}`);

      // Reload data
      await loadEvents();
      await loadAllTransactions();

      // Close dialog
      setShowAutoMatchDialog(false);
      setAutoMatchResult(null);
    } catch (error: any) {
      logger.error('Error confirming auto-match:', error);
      toast.error('Erreur lors de la confirmation');
    }
  };

  // ============================================================
  // END INSCRIPTION LINKING HANDLERS
  // ============================================================

  // Supprimer un événement et ses inscriptions
  const handleDeleteEvent = async (eventId: string) => {
    try {
      const completeLinks = await loadCompleteEventLinks(eventId);

      // ✅ UNIFIED: Delete subcollections (Firestore does NOT auto-delete them)

      // 1a. Delete inscriptions
      const inscriptionsRef = collection(db, 'clubs', clubId, 'operations', eventId, 'inscriptions');
      const inscriptionsSnapshot = await getDocs(inscriptionsRef);
      for (const inscDoc of inscriptionsSnapshot.docs) {
        await deleteDoc(doc(db, 'clubs', clubId, 'operations', eventId, 'inscriptions', inscDoc.id));
      }

      // 1b. Delete messages (cascade)
      const messagesRef = collection(db, 'clubs', clubId, 'operations', eventId, 'messages');
      const messagesSnapshot = await getDocs(messagesRef);
      for (const msgDoc of messagesSnapshot.docs) {
        await deleteDoc(doc(db, 'clubs', clubId, 'operations', eventId, 'messages', msgDoc.id));
      }


      // 2. Délier toutes les transactions associées
      const eventTransactions = completeLinks?.transactions || getLinkedTransactionsForEvent(eventId);
      for (const transaction of eventTransactions) {
        const transactionFiscalYearId = (transaction as TransactionBancaire & { fiscal_year_id?: string | null }).fiscal_year_id ?? null;
        const hasDirectEventLink = transaction.evenement_id === eventId
          || transaction.operation_id === eventId
          || (transaction.matched_entities || []).some(entity =>
            (entity.entity_type === 'event' || (entity.entity_type as string) === 'operation') &&
            entity.entity_id === eventId
          );

        if (!hasDirectEventLink) {
          continue;
        }

        const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', transaction.id);
        const updatedEntities = (transaction.matched_entities || []).filter(
          e => !(
            (e.entity_type === 'event' || (e.entity_type as string) === 'operation') &&
            e.entity_id === eventId
          )
        );

        await updateDoc(txRef, {
          matched_entities: updatedEntities,
          reconcilie: updatedEntities.length > 0,
          operation_id: transaction.operation_id === eventId ? null : transaction.operation_id || null,
          evenement_id: transaction.evenement_id === eventId ? null : transaction.evenement_id || null,
          updated_at: serverTimestamp(),
          // Include fiscal_year_id to satisfy Firestore rules
          fiscal_year_id: transactionFiscalYearId
        });
      }

      // 3. Délier toutes les dépenses associées
      const eventExpenses = completeLinks?.expenses || getLinkedExpensesForEvent(eventId);
      for (const expense of eventExpenses) {
        const expenseFiscalYearId = (expense as DemandeRemboursement & { fiscal_year_id?: string | null }).fiscal_year_id ?? null;
        const expenseRef = doc(db, 'clubs', clubId, 'demandes_remboursement', expense.id);
        // 🆕 MIGRATION: Clear both operation_id and evenement_id
        await updateDoc(expenseRef, {
          operation_id: null,
          operation_titre: null,
          evenement_id: null,
          evenement_titre: null,
          updated_at: serverTimestamp(),
          // Include fiscal_year_id to satisfy Firestore rules
          fiscal_year_id: expenseFiscalYearId
        });
      }

      // 4. Supprimer l'événement lui-même
      // 🆕 MIGRATION: Delete from 'operations' collection instead of 'evenements'
      const eventRef = doc(db, 'clubs', clubId, 'operations', eventId);
      await deleteDoc(eventRef);

      // 5. Mettre à jour l'état local
      setEvents(prev => prev.filter(e => e.id !== eventId));
      setInscriptions(prev => {
        const updated = { ...prev };
        delete updated[eventId];
        return updated;
      });
      setLinkedTransactions(prev => {
        const updated = { ...prev };
        delete updated[eventId];
        return updated;
      });
      setLinkedExpenses(prev => {
        const updated = { ...prev };
        delete updated[eventId];
        return updated;
      });

      // 6. Fermer la vue détaillée et afficher un message
      if (detailViewEvent?.id === eventId) {
        setLastViewedEventId(eventId);
        setDetailLinkedTransactions([]);
        setDetailLinkedExpenses([]);
      }
      setDetailViewEvent(null);
      toast.success('Événement supprimé avec succès');

    } catch (error) {
      logger.error('Error deleting event:', error);
      toast.error('Erreur lors de la suppression de l\'événement');
    }
  };

  // Document management handlers for operations (ventes, cautions, etc.)
  const handleAddDocumentToOperation = async (operationId: string, files: FileList) => {
    logger.debug('🔍 [DOC UPLOAD] Starting upload for operation:', operationId);
    logger.debug('📁 Files to upload', { count: files.length });
    logger.debug('👤 User:', user);
    logger.debug('🏢 ClubId:', clubId);

    if (!clubId || !user) {
      logger.error('❌ No clubId or user available');
      return;
    }

    try {
      const storage = getStorage();
      logger.debug('✅ Firebase Storage initialized');

      const operation = events.find(e => e.id === operationId);
      logger.debug('🎯 Operation found:', operation);

      if (!operation) {
        logger.error('❌ Operation not found in events array');
        toast.error('Activité non trouvée');
        return;
      }

      const uploadedDocs: DocumentJustificatif[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        logger.debug('📄 Processing file upload', {
          index: i + 1,
          total: files.length,
          name: file.name,
          size: file.size
        });

        // Check file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
          logger.warn(`⚠️ File too large: ${file.name}`);
          toast.error(`${file.name}: fichier trop volumineux (max 10 Mo)`);
          continue;
        }

        // Upload to Firebase Storage
        const timestamp = Date.now();
        const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const storagePath = `clubs/${clubId}/operations/${operationId}/${timestamp}_${sanitizedFilename}`;
        logger.debug('📤 Uploading to path:', storagePath);

        const storageReference = storageRef(storage, storagePath);

        await uploadBytes(storageReference, file);
        logger.debug('✅ File uploaded to Storage');

        const downloadUrl = await getDownloadURL(storageReference);
        logger.debug('🔗 Download URL obtained:', downloadUrl);

        uploadedDocs.push({
          url: downloadUrl,
          nom_original: file.name,
          nom_affichage: file.name,
          type: file.type,
          taille: file.size,
          date_upload: new Date(),
          uploaded_by: user.uid,
          uploaded_by_nom: user.displayName || user.email || 'Utilisateur'
        });
      }

      if (uploadedDocs.length === 0) {
        logger.warn('⚠️ No documents uploaded (all too large or failed)');
        return;
      }

      logger.debug(`✅ ${uploadedDocs.length} document(s) uploaded to Storage, updating Firestore...`);

      // Update Firestore
      const operationRef = doc(db, 'clubs', clubId, 'operations', operationId);
      const existingDocs = operation.documents_justificatifs || [];
      logger.debug('📝 Existing documents:', existingDocs.length);

      await updateDoc(operationRef, {
        documents_justificatifs: [...existingDocs, ...uploadedDocs],
        updated_at: serverTimestamp()
      });
      logger.debug('✅ Firestore updated successfully');

      // Update local state
      const updatedOperation = { ...operation, documents_justificatifs: [...existingDocs, ...uploadedDocs] };

      setEvents(prev => prev.map(e =>
        e.id === operationId
          ? updatedOperation
          : e
      ));

      // Also update detailViewEvent if it's the same operation
      if (detailViewEvent?.id === operationId) {
        setDetailViewEvent(updatedOperation);
      }

      logger.debug('✅ Local state updated');

      toast.success(`${uploadedDocs.length} document(s) ajouté(s)`);
      logger.debug('🎉 Upload complete!');
    } catch (error) {
      logger.error('💥 Error uploading documents:', error);
      toast.error('Erreur lors de l\'ajout des documents');
    }
  };

  const handleDeleteDocumentFromOperation = async (operationId: string, docUrl: string) => {
    if (!clubId) return;

    try {
      const storage = getStorage();
      const operation = events.find(e => e.id === operationId);
      if (!operation) return;

      // Delete from Firebase Storage
      const fileRef = storageRef(storage, docUrl);
      await deleteObject(fileRef);

      // Update Firestore
      const updatedDocs = (operation.documents_justificatifs || []).filter(doc => doc.url !== docUrl);
      const operationRef = doc(db, 'clubs', clubId, 'operations', operationId);

      await updateDoc(operationRef, {
        documents_justificatifs: updatedDocs.length > 0 ? updatedDocs : [],
        updated_at: serverTimestamp()
      });

      // Update local state
      const updatedOperation = { ...operation, documents_justificatifs: updatedDocs };

      setEvents(prev => prev.map(e =>
        e.id === operationId
          ? updatedOperation
          : e
      ));

      // Also update detailViewEvent if it's the same operation
      if (detailViewEvent?.id === operationId) {
        setDetailViewEvent(updatedOperation);
      }

      toast.success('Document supprimé');
    } catch (error) {
      logger.error('Error deleting document:', error);
      toast.error('Erreur lors de la suppression du document');
    }
  };

  const handleUpdateOperationDocument = async (operationId: string, updates: Partial<Operation>) => {
    if (!clubId) return;

    try {
      const operationRef = doc(db, 'clubs', clubId, 'operations', operationId);

      await updateDoc(operationRef, {
        ...updates,
        updated_at: serverTimestamp()
      });

      // Update local state
      setEvents(prev => prev.map(e => {
        if (e.id === operationId) {
          const updatedOperation = { ...e, ...updates };
          // Also update detailViewEvent if it's the same operation
          if (detailViewEvent?.id === operationId) {
            setDetailViewEvent(updatedOperation);
          }
          return updatedOperation;
        }
        return e;
      }));

      toast.success('Document mis à jour');
    } catch (error) {
      logger.error('Error updating document:', error);
      toast.error('Erreur lors de la mise à jour du document');
    }
  };

  // Sauvegarder une opération (non-événement)
  const handleSaveOperation = async (operationData: Partial<Operation>) => {
    try {
      const operationsRef = collection(db, 'clubs', clubId, 'operations');

      // Clean operationData to remove undefined/null/invalid values (Firestore doesn't accept them)
      const cleanedData: any = {};
      Object.keys(operationData).forEach(key => {
        const value = (operationData as any)[key];
        // Skip undefined and null
        if (value === undefined || value === null) {
          return;
        }
        // Skip invalid Date objects
        if (value instanceof Date && isNaN(value.getTime())) {
          return;
        }
        // Skip temporary ID
        if (key === 'id' && typeof value === 'string' && value.startsWith('new-')) {
          return;
        }
        cleanedData[key] = value;
      });

      // Check if we're editing an existing operation OR updating from detail view
      const operationId = operationData.id && !operationData.id.startsWith('new-') ? operationData.id : null;

      if (operationId) {
        // Mise à jour d'une opération existante
        const operationRef = doc(db, 'clubs', clubId, 'operations', operationId);

        // Remove 'id' from cleanedData to avoid overwriting the document ID
        const { id, ...dataToUpdate } = cleanedData;

        await updateDoc(operationRef, {
          ...dataToUpdate,
          updated_at: serverTimestamp()
        });

        // Update local state immediately for faster UI
        setEvents(prev => prev.map(e => e.id === operationId ? { ...e, ...dataToUpdate } : e));

        // Update detailViewEvent if it's the same operation
        if (detailViewEvent?.id === operationId) {
          setDetailViewEvent({ ...detailViewEvent, ...dataToUpdate });
        }

        // Don't show toast for auto-save operations (they already show their own toast)
        // toast.success('Opération mise à jour');
      } else {
        // Création d'une nouvelle opération

        // Generate unique event_number for evenement type operations
        // Format: 2XXXXX for dive events (plongee), 3XXXXX for other events (sortie)
        let eventNumber: string | undefined;
        if (cleanedData.type === 'evenement') {
          const isDiveEvent = cleanedData.event_category === 'plongee';
          eventNumber = await OperationService.generateEventNumber(clubId, isDiveEvent);
          logger.debug(`📝 Generated event_number: ${eventNumber} (${isDiveEvent ? 'plongee' : 'sortie'})`);
        }

        await addDoc(operationsRef, {
          ...cleanedData,
          ...(eventNumber && { event_number: eventNumber }),
          club_id: clubId,
          fiscal_year_id: selectedFiscalYear?.id || null,  // Required by Firestore Rules
          organisateur_id: appUser?.id || '',  // ✅ Required by Firestore rules
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
          created_by: 'manual'
        });

        toast.success('Activité créée');

        // ✅ Invalidation du cache React Query - Dashboard & Stats (uniquement pour création)
        logger.debug('🔄 Invalidation du cache dashboard après création activité...');
        queryClient.invalidateQueries({ queryKey: ['countStats', clubId] });
        queryClient.invalidateQueries({ queryKey: ['pendingActions', clubId] });
        logger.debug('✅ Cache dashboard invalidé!');
      }

      // Recharger les opérations (only if creating a new operation)
      if (!operationId) {
        await loadEvents();
      }
    } catch (error) {
      logger.error('Error saving operation:', error);
      toast.error('Erreur lors de la sauvegarde de l\'activité');
      throw error;
    }
  };

  // Sauvegarder une caution depuis le detail view
  const handleSaveCaution = async (caution: Operation) => {
    try {
      const operationsRef = collection(db, 'clubs', clubId, 'operations');

      // Clean caution data to remove undefined/null/invalid values
      const cleanedData: any = { type: 'caution' };
      Object.keys(caution).forEach(key => {
        const value = (caution as any)[key];
        // Skip undefined and null
        if (value === undefined || value === null) {
          return;
        }
        // Skip invalid Date objects
        if (value instanceof Date && isNaN(value.getTime())) {
          return;
        }
        // Skip temporary ID
        if (key === 'id' && value.startsWith('new-')) {
          return;
        }
        cleanedData[key] = value;
      });

      if (caution.id && !caution.id.startsWith('new-')) {
        // Update existing caution
        const cautionRef = doc(db, 'clubs', clubId, 'operations', caution.id);
        await updateDoc(cautionRef, {
          ...cleanedData,
          updated_at: serverTimestamp()
        });
      } else {
        // Create new caution
        await addDoc(operationsRef, {
          ...cleanedData,
          club_id: clubId,
          fiscal_year_id: selectedFiscalYear?.id || null,  // Required by Firestore Rules
          organisateur_id: appUser?.id || '',  // ✅ Required by Firestore rules
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
          created_by: 'manual'
        });
      }

      // Reload operations
      await loadEvents();

      // Close detail view
      setDetailViewEvent(null);
    } catch (error) {
      logger.error('Error saving caution:', error);
      toast.error('Erreur lors de la sauvegarde de la caution');
      throw error;
    }
  };

  // Gérer la sélection de la catégorie d'événement
  const handleSelectEventCategory = async (category: EventCategory) => {
    setShowTypeSelector(false);

    if (category === 'plongee') {
      // Ouvrir le wizard de sélection de lieu pour les plongées
      setShowEventWizard(true);
    } else {
      // Piscine ou Sortie: créer directement et ouvrir la vue détail
      try {
        const eventData: Partial<Operation> = {
          type: 'evenement',
          event_category: category,
          titre: category === 'piscine' ? 'Entraînement Piscine' : 'Nouvelle sortie',
          description: '',
          montant_prevu: 0,
          date_debut: (() => {
            const date = new Date();
            if (category === 'piscine') {
              date.setHours(20, 30, 0, 0);
            }
            return date;
          })(),
          statut: 'brouillon',
          organisateur_id: appUser?.id || '',
          organisateur_nom: appUser ? `${appUser.prenom} ${appUser.nom}` : '',
          event_tariffs: [],
          lieu: '',
        };

        const operationsRef = collection(db, 'clubs', clubId, 'operations');
        const docRef = await addDoc(operationsRef, {
          ...eventData,
          club_id: clubId,
          fiscal_year_id: selectedFiscalYear?.id || null,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp()
        });

        const savedEvent: Operation = {
          ...eventData as Operation,
          id: docRef.id,
          created_at: new Date(),
          updated_at: new Date()
        };

        await loadEvents();
        setDetailViewEvent(savedEvent as any);
        toast.success(category === 'piscine' ? 'Entraînement piscine créé' : 'Sortie créée');
      } catch (error) {
        logger.error('Erreur création événement:', error);
        toast.error('Erreur lors de la création');
      }
    }
  };

  // Afficher un loader tant que les années fiscales ne sont pas chargées
  if (fiscalYearLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-dark-text-secondary">Chargement des années fiscales...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text-primary">Activités</h1>
            <p className="text-gray-600 dark:text-dark-text-secondary mt-1">Gérez toutes les activités financières du club</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                // 🔒 USER ISOLATION: Users can only create 'evenement' type
                if (appUser?.app_role === 'user') {
                  // Ouvrir directement le wizard de sélection de lieu
                  setShowEventWizard(true);
                } else {
                  // Admin/validateur/superadmin: show type selector
                  setShowTypeSelector(true);
                }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              {appUser?.app_role === 'user' ? 'Nouvel événement' : 'Nouvelle activité'}
            </button>
          </div>
        </div>
      </div>


      {/* Filtres et recherche */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border mb-6">
        <div className="p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
                <input
                  type="text"
                  placeholder="Rechercher..."
                  className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 dark:border-dark-border rounded-lg focus:ring-1 focus:ring-gray-400 focus:border-gray-400 bg-white dark:bg-dark-bg-secondary"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2 items-center">
              {/* 🔒 USER ISOLATION: Hide type filter for 'user' role (they only see 'evenement') */}
              {appUser?.app_role !== 'user' && (
                <select
                  className="px-3 py-1.5 text-xs border border-gray-300 dark:border-dark-border rounded-lg focus:ring-1 focus:ring-gray-400 focus:border-gray-400 bg-white dark:bg-dark-bg-secondary text-gray-600 dark:text-dark-text-secondary h-[30px]"
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                >
                  <option value="tous">Type</option>
                  <option value="evenement">Événements</option>
                  <option value="cotisation">Cotisations</option>
                  <option value="caution">Cautions</option>
                  <option value="vente">Ventes</option>
                  <option value="subvention">Subventions</option>
                  <option value="autre">Autre</option>
                </select>
              )}
              {/* Filtre par catégorie d'événement (visible quand on affiche les événements) */}
              {(filterType === 'tous' || filterType === 'evenement') && (
                <select
                  className="px-3 py-1.5 text-xs border border-gray-300 dark:border-dark-border rounded-lg focus:ring-1 focus:ring-gray-400 focus:border-gray-400 bg-white dark:bg-dark-bg-secondary text-gray-600 dark:text-dark-text-secondary h-[30px]"
                  value={filterEventCategory}
                  onChange={(e) => setFilterEventCategory(e.target.value as EventCategory | 'all')}
                >
                  <option value="all">Catégorie</option>
                  <option value="plongee">🤿 Plongées</option>
                  <option value="sortie">🎉 Sorties / Fêtes</option>
                </select>
              )}
              <select
                className="px-3 py-1.5 text-xs border border-gray-300 dark:border-dark-border rounded-lg focus:ring-1 focus:ring-gray-400 focus:border-gray-400 bg-white dark:bg-dark-bg-secondary text-gray-600 dark:text-dark-text-secondary h-[30px]"
                value={filterStatut}
                onChange={(e) => setFilterStatut(e.target.value)}
              >
                <option value="">Statut</option>
                <option value="brouillon">Brouillon</option>
                <option value="ouvert">Ouvert</option>
                <option value="ferme">Fermé</option>
                <option value="annule">Annulé</option>
              </select>

              {/* Bouton pour réinitialiser tous les filtres */}
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilterType('tous');
                  setFilterStatut('');
                  setFilterEventCategory('all');
                  toast.success('Filtres réinitialisés', { duration: 1500 });
                }}
                className="flex items-center justify-center h-[30px] w-[30px] border border-gray-300 dark:border-dark-border dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-gray-800 text-gray-400 dark:text-dark-text-secondary hover:text-gray-600 dark:text-dark-text-secondary dark:hover:text-gray-400 transition-colors"
                title="Réinitialiser tous les filtres"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setViewMode('table')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors",
            viewMode === 'table'
              ? "bg-blue-600 text-white"
              : "bg-white dark:bg-dark-bg-secondary text-gray-600 dark:text-dark-text-secondary border border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary"
          )}
        >
          <FileSpreadsheet className="h-4 w-4" />
          Liste
        </button>
        <button
          onClick={() => setViewMode('calendar')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors",
            viewMode === 'calendar'
              ? "bg-blue-600 text-white"
              : "bg-white dark:bg-dark-bg-secondary text-gray-600 dark:text-dark-text-secondary border border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary"
          )}
        >
          <Calendar className="h-4 w-4" />
          Calendrier
        </button>
      </div>

      {/* Résumé financier */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
          <div className="text-sm text-green-600 dark:text-green-400">Recettes</div>
          <div className="text-xl font-bold text-green-700 dark:text-green-300">
            {formatMontant(pageTotals.revenus)}
          </div>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
          <div className="text-sm text-red-600 dark:text-red-400">Dépenses</div>
          <div className="text-xl font-bold text-red-700 dark:text-red-300">
            {formatMontant(pageTotals.depenses)}
          </div>
        </div>
        <div className={cn(
          "rounded-lg p-4",
          pageTotals.balance >= 0
            ? "bg-blue-50 dark:bg-blue-900/20"
            : "bg-orange-50 dark:bg-orange-900/20"
        )}>
          <div className="text-sm text-gray-600 dark:text-gray-400">Balance</div>
          <div className={cn(
            "text-xl font-bold",
            pageTotals.balance >= 0
              ? "text-blue-700 dark:text-blue-300"
              : "text-orange-700 dark:text-orange-300"
          )}>
            {formatMontant(pageTotals.balance)}
          </div>
        </div>
      </div>

      {viewMode === 'table' ? (
        /* Table des opérations */
        <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 mb-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-calypso-blue"></div>
                </div>
                <p className="text-gray-500 dark:text-dark-text-muted">Chargement des activités...</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-dark-bg-tertiary border-b border-gray-200 dark:border-dark-border">
                  <tr>
                    {/* Cat (catégorie: emoji) */}
                    <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider w-10">
                      Cat
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:bg-dark-bg-tertiary transition-colors"
                      onClick={() => handleSort('type')}
                    >
                      <div className="flex items-center gap-2">
                        <span>Type</span>
                        {sortField === 'type' ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          )
                        ) : (
                          <ArrowUpDown className="h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
                        )}
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:bg-dark-bg-tertiary transition-colors"
                      onClick={() => handleSort('titre')}
                    >
                      <div className="flex items-center gap-2">
                        <span>Activité</span>
                        {sortField === 'titre' ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          )
                        ) : (
                          <ArrowUpDown className="h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
                        )}
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:bg-dark-bg-tertiary transition-colors"
                      onClick={() => handleSort('date_debut')}
                    >
                      <div className="flex items-center gap-2">
                        <span>Date</span>
                        {sortField === 'date_debut' ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          )
                        ) : (
                          <ArrowUpDown className="h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
                        )}
                      </div>
                    </th>
                    {/* Lieu type */}
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                      Lieu
                    </th>
                    <th
                      className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:bg-dark-bg-tertiary transition-colors"
                      onClick={() => handleSort('participants')}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <span>Part.</span>
                        {sortField === 'participants' ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          )
                        ) : (
                          <ArrowUpDown className="h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
                        )}
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:bg-dark-bg-tertiary transition-colors"
                      onClick={() => handleSort('balance')}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <span>Balance</span>
                        {sortField === 'balance' ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          )
                        ) : (
                          <ArrowUpDown className="h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
                        )}
                      </div>
                    </th>
                    {/* Statut compact */}
                    <th
                      className="px-2 py-3 text-center text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:bg-dark-bg-tertiary transition-colors w-16"
                      onClick={() => handleSort('statut')}
                      title="Statut"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>St.</span>
                        {sortField === 'statut' ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 text-gray-400 dark:text-dark-text-muted" />
                        )}
                      </div>
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredEvents.map((event, index) => {
                    // Determine if we need a separator between future and past events
                    const eventStart = event.date_debut || event.created_at || new Date();
                    const isFuture = eventStart.getTime() >= now.getTime();
                    const prevEvent = index > 0 ? filteredEvents[index - 1] : null;
                    const prevEventStart = prevEvent?.date_debut || prevEvent?.created_at || null;
                    const prevIsFuture = prevEventStart ? prevEventStart.getTime() >= now.getTime() : true;
                    const showPastSeparator = !sortField && !sortDirection && !isFuture && prevIsFuture && index > 0;
                    const eventInscriptions = inscriptions[event.id] || [];
                    const accountingSummary = accountingSummariesByEvent[event.id] || {
                      revenueTransactions: [],
                      expenseTransactions: [],
                      uncategorizedTransactions: [],
                      revenueTotal: 0,
                      expenseTotal: 0,
                      balance: 0
                    };

                    // Fonction helper pour afficher le type
                    const getTypeLabel = (type: string) => {
                      switch (type) {
                        case 'evenement': return 'Événement';
                        case 'cotisation': return 'Cotisation';
                        case 'caution': return 'Caution';
                        case 'vente': return 'Vente';
                        case 'subvention': return 'Subvention';
                        case 'autre': return 'Autre';
                        default: return type;
                      }
                    };

                    const getTypeColor = (type: string) => {
                      switch (type) {
                        case 'evenement': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
                        case 'cotisation': return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
                        case 'caution': return 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400';
                        case 'vente': return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400';
                        case 'subvention': return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400';
                        case 'autre': return 'bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700/30 text-gray-700 dark:text-dark-text-primary dark:text-gray-300';
                        default: return 'bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700/30 text-gray-700 dark:text-dark-text-primary dark:text-gray-300';
                      }
                    };

                    return (
                      <React.Fragment key={event.id}>
                        {/* Separator line between upcoming/future and past events */}
                        {showPastSeparator && (
                          <tr className="border-0">
                            <td colSpan={9} className="px-0 py-1">
                              <div className="flex items-center gap-3 px-4">
                                <div className="flex-1 border-t-2 border-gray-300 dark:border-gray-600"></div>
                                <span className="text-xs font-medium text-gray-400 dark:text-dark-text-muted uppercase tracking-wider whitespace-nowrap">
                                  Activités passées
                                </span>
                                <div className="flex-1 border-t-2 border-gray-300 dark:border-gray-600"></div>
                              </div>
                            </td>
                          </tr>
                        )}
                      <tr
                        id={`event-${event.id}`}
                        className={cn(
                          "hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors cursor-pointer",
                          lastViewedEventId === event.id && "bg-blue-100 dark:bg-blue-900/30",
                          !isFuture && !sortField && "opacity-75"
                        )}
                        onClick={() => {
                          setLastViewedEventId(event.id);
                          setDetailViewEvent(event);
                        }}
                      >
                        {/* Cat (catégorie) */}
                        <td className="px-2 py-4 text-center w-10">
                          {(event as Operation).type === 'evenement' && (event as Operation).event_category ? (
                            <span className="text-base" title={(event as Operation).event_category === 'plongee' ? 'Plongée' : (event as Operation).event_category === 'piscine' ? 'Piscine' : 'Sortie'}>
                              {(event as Operation).event_category === 'plongee' ? '🤿' : '🎉'}
                            </span>
                          ) : (
                            <span className="text-gray-300 dark:text-gray-600">—</span>
                          )}
                        </td>
                        {/* Type */}
                        <td className="px-4 py-4">
                          <span className={cn(
                            "px-2 py-1 text-xs rounded-full font-medium whitespace-nowrap",
                            getTypeColor(event.type || 'evenement')
                          )}>
                            {getTypeLabel(event.type || 'evenement')}
                          </span>
                        </td>
                        {/* Activité */}
                        <td className="px-4 py-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-gray-900 dark:text-dark-text-primary">{event.titre}</p>
                              <SourceBadge operation={event} showLock={true} />
                            </div>
                            <p className="text-sm text-gray-500 dark:text-dark-text-muted">{event.organisateur_nom}</p>
                          </div>
                        </td>
                        {/* Date */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="text-sm">
                            <p className="text-gray-900 dark:text-dark-text-primary">{formatDate(eventStart, 'dd MMM yyyy')}</p>
                            {event.date_fin && event.date_fin.getTime() !== eventStart.getTime() && (
                              <p className="text-gray-500 dark:text-dark-text-muted">→ {formatDate(event.date_fin, 'dd MMM')}</p>
                            )}
                          </div>
                        </td>
                        {/* Lieu type */}
                        <td className="px-3 py-4 text-center">
                          {(event as Operation).lieu_type ? (
                            <span className={cn(
                              "px-1.5 py-0.5 text-xs rounded font-medium whitespace-nowrap",
                              LOCATION_TYPE_COLORS[(event as Operation).lieu_type as LocationType] || 'bg-gray-100 text-gray-600'
                            )} title={(event as Operation).lieu || ''}>
                              {LOCATION_TYPE_ICONS[(event as Operation).lieu_type as LocationType] || ''} {(event as Operation).lieu_type}
                            </span>
                          ) : (
                            <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                          )}
                        </td>
                        {/* Participants */}
                        <td className="px-4 py-4">
                          <div className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Users className="h-3.5 w-3.5 text-gray-400 dark:text-dark-text-muted" />
                              <span className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                                {eventInscriptions.length}
                                {event.capacite_max && (
                                  <span className="text-gray-500 dark:text-dark-text-muted">/{event.capacite_max}</span>
                                )}
                              </span>
                            </div>
                            {event.capacite_max && (
                              <div className="mt-1 w-16 mx-auto bg-gray-200 dark:bg-gray-700 rounded-full h-1">
                                <div
                                  className="bg-calypso-blue dark:bg-calypso-aqua h-1 rounded-full"
                                  style={{ width: `${Math.min(100, (eventInscriptions.length / event.capacite_max) * 100)}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </td>
                        {/* Balance */}
                        <td className="px-4 py-4 text-center">
                          <span className={cn(
                            "px-2 py-1 text-sm rounded-lg font-semibold",
                            accountingSummary.balance >= 0
                              ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                              : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                          )}>
                            {formatMontant(accountingSummary.balance)}
                          </span>
                        </td>
                        {/* Statut compact */}
                        <td className="px-2 py-4 text-center w-16">
                          <span className={cn(
                            "inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold",
                            event.statut === 'ouvert' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                              event.statut === 'ferme' ? 'bg-gray-200 dark:bg-gray-700/30 text-gray-600 dark:text-gray-400' :
                                event.statut === 'annule' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                                  'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                          )} title={event.statut}>
                            {event.statut === 'ouvert' ? 'O' : event.statut === 'ferme' ? 'F' : event.statut === 'annule' ? 'A' : 'B'}
                          </span>
                        </td>
                        {/* Actions */}
                        <td className="px-3 py-4 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setLastViewedEventId(event.id);
                              setDetailViewEvent(event);
                            }}
                            className="text-gray-600 dark:text-dark-text-secondary hover:text-gray-700 dark:text-dark-text-primary"
                            title="Voir les détails"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <CalendarView
          events={filteredEvents}
          onEventClick={(event) => {
            setDetailViewEvent(event);
            setLastViewedEventId(event.id);
          }}
        />
      )}

      {/* Wizard de création d'événement avec sélection de lieu */}
      <CreateEventWizard
        isOpen={showEventWizard}
        onClose={() => setShowEventWizard(false)}
        onSave={async (eventData) => {
          // Événement avec lieu sélectionné = plongée
          const fullEvent = {
            ...eventData,
            event_category: 'plongee' as EventCategory,
          };
          await handleSaveOperation(fullEvent);
          setShowEventWizard(false);
        }}
        onCreateManual={async () => {
          // Fermer le wizard et créer l'événement directement dans Firestore
          setShowEventWizard(false);
          const defaultDate = new Date();
          defaultDate.setHours(14, 0, 0, 0);

          try {
            // Generate event_number for sortie (non-dive) event
            const eventNumber = await OperationService.generateEventNumber(clubId, false);
            logger.debug(`📝 Generated event_number for manual event: ${eventNumber}`);

            const manualEventData = {
              type: 'evenement' as const,
              titre: 'Nouvel événement',
              description: '',
              montant_prevu: 0,
              montant_reel: 0,
              date_debut: defaultDate,
              statut: 'ouvert' as const,
              event_category: 'sortie' as const,  // Manuel = sortie (non-plongée)
              event_number: eventNumber,  // Unique number for bank reconciliation
              lieu: '',
              organisateur_nom: appUser?.displayName || appUser?.email || '',
              organisateur_id: appUser?.id || '',
              event_tariffs: [],
              club_id: clubId,
              fiscal_year_id: selectedFiscalYear?.id || null,
              created_by: 'manual'
            } satisfies Omit<Operation, 'id' | 'created_at' | 'updated_at'> & {
              montant_reel: number;
              club_id: string;
              fiscal_year_id: string | null;
              created_by: string;
            };

            // Sauvegarder directement dans Firestore pour obtenir un vrai ID
            const operationsRef = collection(db, 'clubs', clubId, 'operations');
            const docRef = await addDoc(operationsRef, {
              ...manualEventData,
              created_at: serverTimestamp(),
              updated_at: serverTimestamp()
            });

            // Ouvrir la detail view avec le vrai ID (auto-save fonctionnera)
            const savedEvent: Operation = {
              ...manualEventData,
              id: docRef.id,
              created_at: new Date(),
              updated_at: new Date()
            };
            // Recharger la liste pour inclure le nouvel événement
            await loadEvents();

            // Re-set detailViewEvent AFTER loadEvents to ensure it stays open
            setDetailViewEvent(savedEvent as any);

            toast.success('Événement créé');
          } catch (error) {
            logger.error('Erreur création événement manuel:', error);
            toast.error('Erreur lors de la création');
          }
        }}
      />

      {/* Sélecteur de type d'opération */}
      <OperationTypeSelector
        isOpen={showTypeSelector}
        onClose={() => setShowTypeSelector(false)}
        onSelectEventCategory={handleSelectEventCategory}
        onNavigateToPiscine={() => navigate('/piscine')}
      />

      {/* Panel de liaison des transactions */}
      {linkingEventId && showTransactionLinking && (() => {
        const linkedEvent = events.find(e => e.id === linkingEventId);
        logger.debug('🔍 entityDate passed to panel', {
          date: linkedEvent?.date_debut,
          type: typeof linkedEvent?.date_debut
        });
        return (
          <TransactionLinkingPanel
            isOpen={showTransactionLinking}
            onClose={() => {
              setShowTransactionLinking(false);
              setLinkingEventId(null);
              setLinkingInscriptionId(null);
            }}
            transactions={getTransactionsForLinkingPanel(linkingEventId)}
            linkedTransactionIds={getLinkedTransactionsForEvent(linkingEventId).map(tx => tx.id)}
            onLinkTransactions={linkingInscriptionId ? handleConfirmInscriptionLink : handleLinkTransactions}
            mode={linkingInscriptionId ? 'inscription' : 'event'}
            entityId={linkingInscriptionId || linkingEventId}
            entityName={linkedEvent?.titre || ''}
            entityDate={linkedEvent?.date_debut}
            targetAmount={linkingInscriptionId ?
              inscriptions[linkingEventId]?.find(i => i.id === linkingInscriptionId)?.prix : undefined}
            inscriptionMemberName={linkingInscriptionId ?
              inscriptions[linkingEventId]?.find(i => i.id === linkingInscriptionId)?.membre_nom : undefined}
            theme="blue"
            onViewTransaction={(transaction) => {
              openQuickView({ kind: 'transaction', transaction });
            }}
          />
        );
      })()}

      {/* Panel de liaison des dépenses */}
      {linkingEventId && showExpenseLinking && (
        <ExpenseLinkingPanel
          isOpen={showExpenseLinking}
          onClose={() => {
            setShowExpenseLinking(false);
            setLinkingEventId(null);
          }}
          expenses={getExpensesForLinkingPanel(linkingEventId)}
          linkedExpenseIds={getLinkedExpensesForEvent(linkingEventId).map(e => e.id)}
          eventId={linkingEventId}
          eventName={events.find(e => e.id === linkingEventId)?.titre || ''}
          onLinkExpenses={handleLinkExpenses}
        />
      )}

      {/* Vue détaillée de l'opération - UNIFIED COMPONENT */}
      {detailViewEvent && (
        <OperationDetailView
          operation={detailViewEvent}
          isOpen={!!detailViewEvent}
          onClose={() => {
            if (detailViewEvent) {
              setLastViewedEventId(detailViewEvent.id);
            }
            closeAllQuickViews();
            setDetailViewEvent(null);
          }}
          onSave={async (operation) => {
            // Use appropriate save handler
            if (operation.type === 'caution') {
              await handleSaveCaution(operation);
            } else {
              await handleSaveOperation(operation);
            }
          }}
          onDelete={() => {
            handleDeleteEvent(detailViewEvent.id);
          }}
          onAddDocument={async (files) => {
            await handleAddDocumentToOperation(detailViewEvent.id, files);
          }}
          onDeleteDocument={async (docUrl) => {
            await handleDeleteDocumentFromOperation(detailViewEvent.id, docUrl);
          }}
          onUpdateDocument={async (updates) => {
            await handleUpdateOperationDocument(detailViewEvent.id, updates);
          }}
          linkedTransactions={getLinkedTransactionsForEvent(detailViewEvent.id)}
          linkedDemands={getLinkedExpensesForEvent(detailViewEvent.id)}
          linkedInscriptions={inscriptions[detailViewEvent.id] || []}
          onLinkTransaction={() => {
            setLinkingEventId(detailViewEvent.id);
            setShowTransactionLinking(true);
          }}
          onUnlinkTransaction={(transactionId) => {
            handleUnlinkTransaction(detailViewEvent.id, transactionId);
          }}
          onLinkDemand={() => {
            setLinkingEventId(detailViewEvent.id);
            setShowExpenseLinking(true);
          }}
          onUnlinkDemand={(expenseId) => {
            handleUnlinkExpense(detailViewEvent.id, expenseId);
          }}
          onViewTransaction={(transaction) => {
            openQuickView({ kind: 'transaction', transaction });
          }}
          onViewDemand={(demand) => {
            openQuickView({ kind: 'demand', demand });
          }}
          onLinkInscriptionToTransaction={(inscriptionId, transactionId) =>
            handleDirectInscriptionLink(detailViewEvent.id, inscriptionId, transactionId)
          }
          onUnlinkInscriptionTransaction={(inscriptionId) =>
            handleUnlinkInscriptionTransaction(detailViewEvent.id, inscriptionId)
          }
          onRefreshInscriptions={() => handleRefreshInscriptions(detailViewEvent.id)}
          navigationPosition={getNavigationPosition(filteredEvents, detailViewEvent)}
          onNavigatePrevious={() => {
            const currentIndex = filteredEvents.findIndex(e => e.id === detailViewEvent.id);
            if (currentIndex > 0) {
              setDetailViewEvent(filteredEvents[currentIndex - 1]);
            } else {
              // Wrap to end
              setDetailViewEvent(filteredEvents[filteredEvents.length - 1]);
            }
          }}
          onNavigateNext={() => {
            const currentIndex = filteredEvents.findIndex(e => e.id === detailViewEvent.id);
            if (currentIndex < filteredEvents.length - 1) {
              setDetailViewEvent(filteredEvents[currentIndex + 1]);
            } else {
              // Wrap to start
              setDetailViewEvent(filteredEvents[0]);
            }
          }}
        />
      )}

      {/* Auto-Match Dialog */}
      {autoMatchResult && (
        <AutoMatchDialog
          isOpen={showAutoMatchDialog}
          onClose={() => {
            setShowAutoMatchDialog(false);
            setAutoMatchResult(null);
          }}
          matched={autoMatchResult.matched}
          needsSplit={autoMatchResult.needsSplit}
          cashSuggested={autoMatchResult.cashSuggested}
          availableTransactions={autoMatchResult.availableTransactions}
          onConfirm={handleConfirmAutoMatch}
        />
      )}

      {/* Inscription Matcher Dialog (Algorithmic) */}
      {detailViewEvent && (
        <InscriptionMatcher
          isOpen={showAIMatchDialog}
          onClose={() => setShowAIMatchDialog(false)}
          unmatchedTransactions={
            allTransactions.filter(tx =>
              tx.montant > 0 && // Revenue only
              !tx.is_parent && // Not ventilated
              !tx.matched_entities?.some(e => e.entity_type === 'inscription') // Not already linked to inscription
            )
          }
          unmatchedInscriptions={
            (inscriptions[detailViewEvent.id] || []).filter(i =>
              !i.transaction_id && !i.paye // Not linked and not paid
            )
          }
          eventContext={{
            titre: detailViewEvent.titre,
            lieu: detailViewEvent.lieu || '',
            date_debut: detailViewEvent.date_debut || new Date(),
            date_fin: detailViewEvent.date_fin || detailViewEvent.date_debut || new Date()
          }}
          onMatchesValidated={async (validatedMatches) => {
            logger.debug('🎯 ÉVÉNEMENTS PAGE - onMatchesValidated appelé');
            logger.debug('  📊 Nombre de matches reçus:', validatedMatches.size);

            if (!clubId || !detailViewEvent) {
              toast.error('Impossible de sauvegarder les correspondances');
              return;
            }

            if (validatedMatches.size === 0) {
              toast('Aucune correspondance sélectionnée', { icon: 'ℹ️' });
              return;
            }

            let successCount = 0;
            let errorCount = 0;

            for (const [transactionId, match] of validatedMatches.entries()) {
              try {
                // Lier l'inscription à la transaction
                await linkInscriptionToTransaction(
                  clubId,
                  detailViewEvent.id,
                  match.inscription_id,
                  transactionId
                );

                successCount++;
              } catch (error) {
                logger.error(`Erreur liaison ${transactionId}:`, error);
                errorCount++;
              }
            }

            // Toast et reload
            if (successCount > 0) {
              toast.success(`✨ ${successCount} correspondance(s) validée(s) et sauvegardée(s)`);
            }
            if (errorCount > 0) {
              toast.error(`❌ ${errorCount} erreur(s) lors de la sauvegarde`);
            }

            // Reload inscriptions and transactions to reflect changes
            await loadInscriptions(detailViewEvent.id);
            await loadLinkedTransactions(detailViewEvent.id);
          }}
        />
      )}

      {quickViews.map((quickView, index) => {
        const stackLevel = index + 2;

        if (quickView.kind === 'transaction') {
          return (
            <TransactionDetailView
              key={`quick-transaction-${quickView.transaction.id}-${index}`}
              transaction={quickView.transaction}
              isOpen={true}
              stackLevel={stackLevel}
              onClose={() => closeQuickViewsFrom(index)}
              events={events as unknown as Evenement[]}
              demands={allExpenses}
              onNavigateToEvent={(eventId) => {
                if (detailViewEvent?.id === eventId) {
                  closeQuickViewsFrom(index);
                  return;
                }

                const operation = getOperationById(eventId);
                if (operation) {
                  openQuickView({ kind: 'operation', operation });
                  return;
                }

                navigate('/operations', { state: { openEventId: eventId } });
              }}
              onNavigateToDemand={(demandId) => {
                const demand = allExpenses.find(item => item.id === demandId);
                if (demand) {
                  openQuickView({ kind: 'demand', demand });
                  return;
                }

                navigate('/depenses', { state: { openDemandId: demandId } });
              }}
              onOpenContext={() => {
                navigate('/transactions', { state: { selectedTransactionId: quickView.transaction.id } });
              }}
              contextActionLabel="Aller aux transactions"
            />
          );
        }

        if (quickView.kind === 'demand') {
          const linkedDemandTransactions = getDemandLinkedTransactions(
            quickView.demand.id,
            detailViewEvent ? getLinkedTransactionsForEvent(detailViewEvent.id) : [],
            quickView.demand.transaction_id
          );

          return (
            <DemandeDetailView
              key={`quick-demand-${quickView.demand.id}-${index}`}
              demand={quickView.demand}
              linkedTransactions={linkedDemandTransactions}
              evenements={events as unknown as Evenement[]}
              isOpen={true}
              stackLevel={stackLevel}
              onClose={() => closeQuickViewsFrom(index)}
              onViewTransaction={(transaction) => {
                openQuickView({ kind: 'transaction', transaction });
              }}
              onViewOperation={(operation) => {
                if (detailViewEvent?.id === operation.id) {
                  closeQuickViewsFrom(index);
                  return;
                }

                openQuickView({ kind: 'operation', operation: operation as unknown as Operation });
              }}
              onOpenContext={() => {
                navigate('/depenses', { state: { openDemandId: quickView.demand.id } });
              }}
              contextActionLabel="Aller aux dépenses"
              onUpdate={async (updates: Partial<DemandeRemboursement>) => {
                const demandRef = doc(db, 'clubs', clubId, 'demandes_remboursement', quickView.demand.id);
                await updateDoc(demandRef, {
                  ...updates,
                  updated_at: serverTimestamp()
                });

                await loadAllExpenses();
                closeQuickViewsFrom(index);
              }}
              onDelete={async () => {
                const demandRef = doc(db, 'clubs', clubId, 'demandes_remboursement', quickView.demand.id);
                await deleteDoc(demandRef);
                await loadAllExpenses();
                closeQuickViewsFrom(index);
              }}
            />
          );
        }

        return (
          <OperationDetailView
            key={`quick-operation-${quickView.operation.id}-${index}`}
            operation={quickView.operation}
            isOpen={true}
            stackLevel={stackLevel}
            onClose={() => closeQuickViewsFrom(index)}
            onSave={async (operation) => {
              if (operation.type === 'caution') {
                await handleSaveCaution(operation);
              } else {
                await handleSaveOperation(operation);
              }
            }}
            onDelete={() => {
              handleDeleteEvent(quickView.operation.id);
            }}
            onAddDocument={async (files) => {
              await handleAddDocumentToOperation(quickView.operation.id, files);
            }}
            onDeleteDocument={async (docUrl) => {
              await handleDeleteDocumentFromOperation(quickView.operation.id, docUrl);
            }}
            onUpdateDocument={async (updates) => {
              await handleUpdateOperationDocument(quickView.operation.id, updates);
            }}
            linkedTransactions={getLinkedTransactionsForEvent(quickView.operation.id)}
            linkedDemands={getLinkedExpensesForEvent(quickView.operation.id)}
            linkedInscriptions={inscriptions[quickView.operation.id] || []}
            onLinkTransaction={() => {
              setLinkingEventId(quickView.operation.id);
              setShowTransactionLinking(true);
            }}
            onUnlinkTransaction={(transactionId) => {
              handleUnlinkTransaction(quickView.operation.id, transactionId);
            }}
            onLinkDemand={() => {
              setLinkingEventId(quickView.operation.id);
              setShowExpenseLinking(true);
            }}
            onUnlinkDemand={(expenseId) => {
              handleUnlinkExpense(quickView.operation.id, expenseId);
            }}
            onViewTransaction={(transaction) => {
              openQuickView({ kind: 'transaction', transaction });
            }}
            onViewDemand={(demand) => {
              openQuickView({ kind: 'demand', demand });
            }}
            onLinkInscriptionToTransaction={(inscriptionId, transactionId) =>
              handleDirectInscriptionLink(quickView.operation.id, inscriptionId, transactionId)
            }
            onUnlinkInscriptionTransaction={(inscriptionId) =>
              handleUnlinkInscriptionTransaction(quickView.operation.id, inscriptionId)
            }
            onRefreshInscriptions={() => handleRefreshInscriptions(quickView.operation.id)}
            onOpenContext={() => {
              navigate('/operations', { state: { openEventId: quickView.operation.id } });
            }}
            contextActionLabel="Aller aux activités"
          />
        );
      })}
    </div>
  );
}
