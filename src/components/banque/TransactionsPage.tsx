import React, { useState, useEffect, useMemo } from 'react';
import { logger } from '@/utils/logger';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Upload,
  Search,
  Split,
  TrendingUp,
  TrendingDown,
  Filter,
  Eye,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  ArrowLeft,
  X,
  Bot,
  AlertTriangle,
  Sparkles,
  Settings2,
  Link2,
  Users,
  FileText
} from 'lucide-react';
import { formatMontant, formatDate, cn, CATEGORY_COLORS, findIncompleteMatch, isIncompleteSequenceNumber } from '@/utils/utils';
import { parseCSVFile, exportTransactionsToCSV } from '@/services/csvParser';
import { canAutoMatch, autoMatchByEventNumber } from '@/services/eventNumberMatchingService';
import { autoControlInscriptionPayments } from '@/services/inscriptionService';
import { migrateFiscalYearIds } from '@/utils/migrateFiscalYear';
import { migrateOperationsAndDemands } from '@/utils/migrateAllCollections';
import { TransactionBancaire, TransactionSplit, Categorie, DemandeRemboursement, Evenement, Operation, FiscalYear, Membre, TransactionFieldAudit, MatchedEntity } from '@/types';
import { TransactionSplitModal } from './TransactionSplitModal';
import { OperationLinkingPanel } from './OperationLinkingPanel';
import { ExpenseFromTransactionLinkingPanel } from './ExpenseFromTransactionLinkingPanel';
import { TransactionDetailView } from './TransactionDetailView';
import { MultiFileImportModal, ImportProgress } from './MultiFileImportModal';
import { DemandeDetailView } from '@/components/depenses/DemandeDetailView';
import { OperationDetailView } from '@/components/operations/OperationDetailView';
import { MemberLinkingPanel } from './MemberLinkingPanel';
import { CotisationDateConfirmModal } from './CotisationDateConfirmModal';
import { BulkMemberLinkingModal, MemberAssignment } from './BulkMemberLinkingModal';
import { BulkEditModal } from './BulkEditModal';
import { updateMembre } from '@/services/membreService';
import toast from 'react-hot-toast';
import { CategorizationService } from '@/services/categorizationService';
import { ClaudeSkillsService } from '@/services/claudeSkillsService';
import { db, storage } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, setDoc, query, where, orderBy, serverTimestamp, deleteField, writeBatch, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useAuth } from '@/contexts/AuthContext';
import { getRole } from '@/utils/fieldMapper';
import { useFiscalYear } from '@/contexts/FiscalYearContext';
import { ProtectedAction } from '@/components/commun/ProtectedAction';
import { useKeyboardNavigation, getNavigationPosition } from '@/hooks/useKeyboardNavigation';
import { useLinkedEntityQuickViewStack } from '@/hooks/useLinkedEntityQuickViewStack';
import { FilterAccordionWithTabs } from '@/components/common/FilterAccordionWithTabs';
import { ComboBox } from '@/components/common/ComboBox';
import { Tooltip } from '@/components/common/Tooltip';
import { AccountCodeService } from '@/services/accountCodeService';
import { AccountCodeSelectorModal } from '@/components/commun/AccountCodeSelectorModal';
import { SessionService } from '@/services/sessionService';
import { findFournisseurByIban, createFournisseur } from '@/services/fournisseurService';
import { getExpenseLinkedEventId, getTransactionEventLinkIds } from '@/utils/operationFinancials';

// Données de démonstration - vide pour commencer avec des vraies données
const demoTransactions: TransactionBancaire[] = [];


// Données de démonstration pour les demandes de remboursement
const demoDemands: DemandeRemboursement[] = [];

// Données de démonstration pour les événements
const demoEvents: Evenement[] = [
  {
    id: 'calyfiesta2025',
    titre: 'Calyfiesta 2025',
    description: 'Souper annuel du club',
    date_debut: new Date('2025-03-22'),
    date_fin: new Date('2025-03-22'),
    lieu: 'Salle des fêtes',
    organisateur_id: 'org1',
    organisateur_nom: 'Comité des fêtes',
    budget_prevu_revenus: 5000,
    budget_prevu_depenses: 3000,
    prix_membre: 35,
    prix_non_membre: 45,
    capacite_max: 150,
    statut: 'ouvert',
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    id: 'plongee-zelande-2025',
    titre: 'Plongée Zélande Avril',
    description: 'Sortie plongée en Zélande',
    date_debut: new Date('2025-04-15'),
    date_fin: new Date('2025-04-17'),
    lieu: 'Zélande, Pays-Bas',
    organisateur_id: 'org2',
    organisateur_nom: 'Section plongée',
    budget_prevu_revenus: 2400,
    budget_prevu_depenses: 2000,
    prix_membre: 120,
    prix_non_membre: 150,
    capacite_max: 20,
    statut: 'ouvert',
    created_at: new Date(),
    updated_at: new Date()
  }
];

// Données de démonstration pour les ventilations
const demoSplits: TransactionSplit[] = [
  {
    id: 'split1',
    bank_transaction_id: '4',
    description: 'Cotisation Pierre Martin',
    amount: 70.00,
    categorie: 'cotisation',
    reconcilie: false,
    created_at: new Date(),
    created_by: 'user1',
    updated_at: new Date()
  },
  {
    id: 'split2',
    bank_transaction_id: '4',
    description: 'Cotisation Marie Martin',
    amount: 70.00,
    categorie: 'cotisation',
    reconcilie: false,
    created_at: new Date(),
    created_by: 'user1',
    updated_at: new Date()
  },
  {
    id: 'split3',
    bank_transaction_id: '4',
    description: 'Cotisation Julie Martin (junior)',
    amount: 70.00,
    categorie: 'cotisation',
    reconcilie: false,
    created_at: new Date(),
    created_by: 'user1',
    updated_at: new Date()
  }
];

export function TransactionsPage() {
  const { clubId, appUser } = useAuth();
  const { selectedFiscalYear, allFiscalYears, disableFiscalYearFilter } = useFiscalYear();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [transactions, setTransactions] = useState<TransactionBancaire[]>([]);
  const [splits, setSplits] = useState<TransactionSplit[]>(demoSplits);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [demands, setDemands] = useState<DemandeRemboursement[]>([]);
  const [membres, setMembres] = useState<Membre[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [accountCodeFilter, setAccountCodeFilter] = useState<'all' | 'with' | 'without'>('all');
  const [categorizationSourceFilter, setCategorizationSourceFilter] = useState<'all' | 'manual' | 'rules' | 'ai' | 'needs_review'>('all');
  const [flaggedFilter, setFlaggedFilter] = useState<'all' | 'flagged' | 'not_flagged'>('all');
  const [activeTab, setActiveTab] = useState<'all' | 'income' | 'expense'>('all');
  const [reconciliationFilter, setReconciliationFilter] = useState<'all' | 'reconciled' | 'unreconciled' | 'not_found'>('all');
  const [amountFilterType, setAmountFilterType] = useState<'all' | 'equal' | 'greater' | 'less' | 'between'>('all');
  const [amountValue1, setAmountValue1] = useState<string>('');
  const [amountValue2, setAmountValue2] = useState<string>('');
  const [showAmountFilterHelp, setShowAmountFilterHelp] = useState(false);

  // Enhanced filter states
  const [transactionStatus, setTransactionStatus] = useState<'all' | 'accepte' | 'refuse' | 'en_attente'>('all');
  const [hasAttachments, setHasAttachments] = useState<'all' | 'with' | 'without'>('all');
  const [parentChildFilter, setParentChildFilter] = useState<'all' | 'parent' | 'child' | 'standalone'>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<{start: string; end: string}>({start: '', end: ''});
  const [dateFilterType, setDateFilterType] = useState<'execution' | 'valeur'>('execution');
  const [counterpartySearch, setCounterpartySearch] = useState<string>('');
  const [ibanSearch, setIbanSearch] = useState<string>('');
  const [communicationSearch, setCommunicationSearch] = useState<string>('');
  const [sequenceNumberRange, setSequenceNumberRange] = useState<{start: string; end: string}>({start: '', end: ''});
  const [linkedEntityType, setLinkedEntityType] = useState<'all' | 'membre' | 'operation' | 'expense' | 'loan' | 'inventory' | 'sale' | 'order'>('all');
  const [specificAccountCode, setSpecificAccountCode] = useState<string>('');
  const [commentSearch, setCommentSearch] = useState<string>('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<Map<string, TransactionBancaire[]>>(new Map());
  const [splitModalTransaction, setSplitModalTransaction] = useState<TransactionBancaire | null>(null);
  const [operationLinkingTransaction, setOperationLinkingTransaction] = useState<TransactionBancaire | null>(null);
  const [expenseLinkingTransaction, setExpenseLinkingTransaction] = useState<TransactionBancaire | null>(null);
  const [detailViewTransaction, setDetailViewTransaction] = useState<TransactionBancaire | null>(null);
  const [returnContext, setReturnContext] = useState<{ type: string; id: string; name: string } | null>(null);
  const { quickViews, openQuickView, closeQuickViewsFrom, closeAllQuickViews } = useLinkedEntityQuickViewStack();
  const [lastViewedTransactionId, setLastViewedTransactionId] = useState<string | null>(null);
  const [expandedTransactions, setExpandedTransactions] = useState<Set<string>>(new Set());
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<string>>(new Set());
  const [showOnlySelected, setShowOnlySelected] = useState(false); // Filtre pour voir uniquement les sélectionnées
  const [batchFilter, setBatchFilter] = useState<string>('all'); // Filtre par batch de catégorisation
  const [isFilterAccordionOpen, setIsFilterAccordionOpen] = useState(false);
  const [isBulkCodeModalOpen, setIsBulkCodeModalOpen] = useState(false);
  const [isBulkActivityModalOpen, setIsBulkActivityModalOpen] = useState(false);
  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
  const [isAutoCategorizeModalOpen, setIsAutoCategorizeModalOpen] = useState(false);
  // Member linking states
  const [isMemberPanelOpen, setIsMemberPanelOpen] = useState(false);
  const [selectedMemberForCotisation, setSelectedMemberForCotisation] = useState<Membre | null>(null);
  const [isBulkMemberModalOpen, setIsBulkMemberModalOpen] = useState(false);
  const [isAutoCategorizing, setIsAutoCategorizing] = useState(false);
  const [autoCategorizeLimit, setAutoCategorizeLimit] = useState<'all' | '5' | '10' | '20' | '50'>('all');
  const [autoCategorizeUseAi, setAutoCategorizeUseAi] = useState(false); // Désactivé par défaut - AI pas fiable
  const [autoCategorizeScope, setAutoCategorizeScope] = useState<'uncategorized' | 'all' | 'selected'>('uncategorized'); // uncategorized = seulement sans code, selected = sélectionnées
  const [autoCategorizeResult, setAutoCategorizeResult] = useState<{
    total: number;
    byRules: number;
    byAi: number;
    needsReview: number;
    noMatch: number;
    processedIds: string[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof TransactionBancaire | null;
    direction: 'asc' | 'desc';
  }>({ key: 'date_execution', direction: 'desc' });

  // TEMPORARY: Expose migration functions to browser console
  useEffect(() => {
    (window as any).runFiscalYearMigration = () => migrateFiscalYearIds(clubId);
    (window as any).migrateOperationsAndDemands = () => migrateOperationsAndDemands(clubId);
    logger.debug('💡 Migration functions available:');
    logger.debug('   - window.runFiscalYearMigration() (transactions)');
    logger.debug('   - window.migrateOperationsAndDemands() (operations + demands)');
  }, [clubId]);

  // Load data from Firestore on mount and when fiscal year changes
  useEffect(() => {
    if (selectedFiscalYear) {
      loadTransactions();
      loadOperations();
      loadDemands();
      loadMembres();
    }
  }, [clubId, selectedFiscalYear]);

  // Auto-open transaction from URL params (from TransactionLinkingPanel)
  useEffect(() => {
    const openTransactionId = searchParams.get('openTransaction');
    const returnTo = searchParams.get('returnTo');
    const entityId = searchParams.get('entityId');
    const entityName = searchParams.get('entityName');

    if (openTransactionId && transactions.length > 0 && !detailViewTransaction) {
      const transactionToOpen = transactions.find(t => t.id === openTransactionId);
      if (transactionToOpen) {
        setDetailViewTransaction(transactionToOpen);

        // Set return context if provided
        if (returnTo && entityId && entityName) {
          setReturnContext({
            type: returnTo,
            id: entityId,
            name: decodeURIComponent(entityName)
          });
        }

        // Note: URL params are cleaned in a separate useEffect below
        // to ensure the modal opens with returnContext properly set
      }
    }
  }, [searchParams, transactions, detailViewTransaction]);

  // Clean URL params AFTER modal opens with returnContext
  useEffect(() => {
    if (detailViewTransaction && searchParams.get('openTransaction')) {
      navigate(location.pathname, { replace: true });
    }
  }, [detailViewTransaction, searchParams, navigate, location.pathname]);

  // Auto-open transaction if navigated from event/demand/expense detail
  useEffect(() => {
    const transactionIdToOpen = location.state?.fromTransactionId || location.state?.selectedTransactionId;
    if (transactionIdToOpen && transactions.length > 0 && !detailViewTransaction) {
      const transactionToOpen = transactions.find(t => t.id === transactionIdToOpen);
      if (transactionToOpen) {
        logger.debug('🔓 [TransactionsPage] Opening transaction from navigation state:', transactionIdToOpen);
        setDetailViewTransaction(transactionToOpen);
        // Clear the state to prevent re-opening when modal closes (modernized from window.history.replaceState)
        navigate(location.pathname, { replace: true, state: {} });
      }
    }
  }, [location.state, transactions, detailViewTransaction, navigate, location.pathname]);

  // Restore scroll position and highlight when closing detail view
  useEffect(() => {
    if (!detailViewTransaction && lastViewedTransactionId) {
      // Modal closed, scroll to the viewed transaction
      const element = document.getElementById(`tx-${lastViewedTransactionId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      // Clear highlight after 3 seconds
      const timer = setTimeout(() => setLastViewedTransactionId(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [detailViewTransaction, lastViewedTransactionId]);

  const loadTransactions = async () => {
    // 🔧 TEMPORAIRE: Si le filtre est désactivé, on n'attend pas selectedFiscalYear
    if (!disableFiscalYearFilter && !selectedFiscalYear) {
      logger.debug('⏸️ No fiscal year selected, skipping transaction load');
      setTransactions([]);
      return;
    }

    try {
      setLoading(true);
      const transactionsRef = collection(db, 'clubs', clubId, 'transactions_bancaires');

      // Query with fiscal year filter (or all if disabled)
      const q = disableFiscalYearFilter
        ? query(transactionsRef, orderBy('date_execution', 'desc'))
        : query(transactionsRef, where('fiscal_year_id', '==', selectedFiscalYear!.id), orderBy('date_execution', 'desc'));

      logger.debug(`📊 Loading transactions for fiscal year: ${disableFiscalYearFilter ? 'ALL' : selectedFiscalYear?.year} (ID: ${disableFiscalYearFilter ? 'ALL' : selectedFiscalYear?.id})`);
      const snapshot = await getDocs(q);

      const loadedTransactions = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          date_execution: data.date_execution?.toDate?.() ||
                         (data.date_execution ? new Date(data.date_execution) : new Date()),
          date_valeur: data.date_valeur?.toDate?.() ||
                      (data.date_valeur ? new Date(data.date_valeur) : new Date()),
          created_at: data.created_at?.toDate?.() || new Date(),
          updated_at: data.updated_at?.toDate?.() || new Date(),
          type: data.montant > 0 ? 'income' : 'expense'
        } as TransactionBancaire;
      });

      logger.debug(`✅ Loaded ${loadedTransactions.length} transactions for year ${disableFiscalYearFilter ? 'ALL' : selectedFiscalYear?.year}`);
      setTransactions(loadedTransactions);
    } catch (error) {
      logger.error('❌ Error loading transactions:', error);
      toast.error('Erreur lors du chargement des transactions');
    } finally {
      setLoading(false);
    }
  };

  const loadOperations = async () => {
    // 🔧 TEMPORAIRE: Si le filtre est désactivé, on n'attend pas selectedFiscalYear
    if (!disableFiscalYearFilter && !selectedFiscalYear) {
      logger.debug('⏸️ No fiscal year selected, skipping operations load');
      setOperations([]);
      return;
    }

    try {
      const operationsRef = collection(db, 'clubs', clubId, 'operations');

      // 📅 Filter by date_debut within fiscal year range (not by fiscal_year_id)
      // This ensures events are shown based on when they occur, not when they were created
      // Convert Date to Timestamp for Firestore queries
      const startTimestamp = selectedFiscalYear ? Timestamp.fromDate(selectedFiscalYear.start_date) : null;
      const endTimestamp = selectedFiscalYear ? Timestamp.fromDate(selectedFiscalYear.end_date) : null;

      const q = disableFiscalYearFilter
        ? query(operationsRef, orderBy('date_debut', 'desc'))
        : query(operationsRef, where('date_debut', '>=', startTimestamp), where('date_debut', '<=', endTimestamp), orderBy('date_debut', 'desc'));

      logger.debug(`📊 Loading operations for fiscal year: ${disableFiscalYearFilter ? 'ALL' : selectedFiscalYear?.year}`);
      const snapshot = await getDocs(q);

      const loadedOperations = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          date_debut: data.date_debut?.toDate?.() || (data.date_debut ? new Date(data.date_debut) : undefined),
          date_fin: data.date_fin?.toDate?.() || (data.date_fin ? new Date(data.date_fin) : undefined),
          periode_debut: data.periode_debut?.toDate?.() || (data.periode_debut ? new Date(data.periode_debut) : undefined),
          periode_fin: data.periode_fin?.toDate?.() || (data.periode_fin ? new Date(data.periode_fin) : undefined),
          created_at: data.created_at?.toDate?.() || new Date(),
          updated_at: data.updated_at?.toDate?.() || new Date()
        } as Operation;
      });

      logger.debug(`✅ Loaded ${loadedOperations.length} operations for year ${disableFiscalYearFilter ? 'ALL' : selectedFiscalYear?.year}`);

      // Count by type
      const typeCounts = loadedOperations.reduce((acc, op) => {
        acc[op.type] = (acc[op.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      logger.debug(`📊 Operations by type:`, typeCounts);

      setOperations(loadedOperations);
    } catch (error) {
      logger.error('❌ Error loading operations:', error);
    }
  };

  const loadDemands = async () => {
    // 🔧 TEMPORAIRE: Si le filtre est désactivé, on n'attend pas selectedFiscalYear
    if (!disableFiscalYearFilter && !selectedFiscalYear) {
      logger.debug('⏸️ No fiscal year selected, skipping demands load');
      setDemands([]);
      return;
    }

    try {
      const demandsRef = collection(db, 'clubs', clubId, 'demandes_remboursement');

      // Query with fiscal year filter (or all if disabled)
      const q = disableFiscalYearFilter
        ? query(demandsRef, orderBy('date_depense', 'desc'))
        : query(demandsRef, where('fiscal_year_id', '==', selectedFiscalYear!.id), orderBy('date_depense', 'desc'));

      logger.debug(`📊 Loading demands for fiscal year: ${disableFiscalYearFilter ? 'ALL' : selectedFiscalYear?.year}`);
      const snapshot = await getDocs(q);

      const loadedDemands = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          date_demande: data.date_demande?.toDate?.() || new Date(data.date_demande),
          date_depense: data.date_depense?.toDate?.() || new Date(data.date_depense),
          date_approbation: data.date_approbation?.toDate?.() || null,
          date_paiement: data.date_paiement?.toDate?.() || null,
          created_at: data.created_at?.toDate?.() || new Date(),
          updated_at: data.updated_at?.toDate?.() || new Date()
        } as DemandeRemboursement;
      });

      logger.debug(`✅ Loaded ${loadedDemands.length} demands for year ${disableFiscalYearFilter ? 'ALL' : selectedFiscalYear?.year}`);
      setDemands(loadedDemands);
    } catch (error) {
      logger.error('❌ Error loading demands:', error);
      toast.error('Erreur lors du chargement des demandes');
    }
  };

  // Load membres for CommunicationModal
  const loadMembres = async () => {
    try {
      const membresRef = collection(db, 'clubs', clubId, 'members');
      const snapshot = await getDocs(membresRef);
      const loadedMembres = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as Membre[];
      setMembres(loadedMembres);
    } catch (error) {
      logger.error('Error loading membres:', error);
    }
  };

  // Fonction pour obtenir les transactions enfants d'une transaction parent
  const getChildTransactions = (parentId: string) => {
    return transactions.filter(tx => tx.parent_transaction_id === parentId)
      .sort((a, b) => (a.child_index || 0) - (b.child_index || 0));
  };

  const getOperationById = (operationId: string): Operation | null => {
    return operations.find(operation => operation.id === operationId) || null;
  };

  const getDemandById = (demandId: string): DemandeRemboursement | null => {
    return demands.find(demand => demand.id === demandId) || null;
  };

  const getLinkedTransactionsForOperation = (operationId: string): TransactionBancaire[] => {
    return transactions.filter(transaction => getTransactionEventLinkIds(transaction).includes(operationId));
  };

  const getLinkedDemandsForOperation = (operationId: string): DemandeRemboursement[] => {
    return demands.filter(demand => getExpenseLinkedEventId(demand) === operationId);
  };

  // Filtrer les transactions - EXCLURE les transactions enfants de la liste principale
  const filteredTransactions = transactions.filter(tx => {
    // NOUVEAU: Exclure les transactions enfants (elles seront affichées sous leur parent)
    if (tx.parent_transaction_id) return false;

    // Filtre par type (revenus/dépenses)
    const matchesTab = activeTab === 'all' ||
      (activeTab === 'income' && tx.montant > 0) ||
      (activeTab === 'expense' && tx.montant < 0);

    // Filtre par recherche (nom, communication, numéro, bedrag, datum)
    const matchesSearch = searchTerm === '' || (() => {
      const term = searchTerm.toLowerCase().trim();

      // Zoek in tekstvelden
      if (tx.contrepartie_nom.toLowerCase().includes(term)) return true;
      if (tx.communication.toLowerCase().includes(term)) return true;
      if (tx.numero_sequence && tx.numero_sequence.toLowerCase().includes(term)) return true;

      // Zoek op bedrag (zowel met als zonder decimalen)
      const montantStr = Math.abs(tx.montant).toString();
      const montantFormatted = Math.abs(tx.montant).toFixed(2);
      if (montantStr.includes(term.replace(',', '.'))) return true;
      if (montantFormatted.includes(term.replace(',', '.'))) return true;

      // Zoek op datum (formaat: DD/MM/YYYY)
      const dateStr = formatDate(tx.date_execution);
      if (dateStr.includes(term)) return true;

      // Zoek op jaar/maand
      // Handle both Firestore Timestamp and Date objects
      const date = tx.date_execution?.toDate ? tx.date_execution.toDate() : new Date(tx.date_execution);
      const year = date.getFullYear().toString();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      if (year.includes(term) || month.includes(term)) return true;

      return false;
    })();

    // Category filter removed - field doesn't exist
    const matchesCategory = true;

    // Filtre par code comptable
    // Pour les parents: vérifier le statut des children au lieu du parent lui-même
    let matchesAccountCode = accountCodeFilter === 'all';
    if (!matchesAccountCode) {
      if (tx.is_parent) {
        const children = getChildTransactions(tx.id);
        if (accountCodeFilter === 'without') {
          // Parent visible seulement si au moins 1 child n'a pas de code
          matchesAccountCode = children.length === 0 || children.some(c => !c.code_comptable || c.code_comptable.trim() === '');
        } else if (accountCodeFilter === 'with') {
          // Parent visible seulement si tous les children ont un code
          matchesAccountCode = children.length > 0 && children.every(c => c.code_comptable && c.code_comptable.trim() !== '');
        }
      } else {
        matchesAccountCode =
          (accountCodeFilter === 'with' && tx.code_comptable && tx.code_comptable.trim() !== '') ||
          (accountCodeFilter === 'without' && (!tx.code_comptable || tx.code_comptable.trim() === ''));
      }
    }

    // Filtre par source de catégorisation
    const matchesCategorizationSource = categorizationSourceFilter === 'all' ||
      (categorizationSourceFilter === 'manual' && (!tx.categorization_source || tx.categorization_source === 'manual')) ||
      (categorizationSourceFilter === 'rules' && tx.categorization_source === 'rules') ||
      (categorizationSourceFilter === 'ai' && tx.categorization_source === 'ai') ||
      (categorizationSourceFilter === 'needs_review' && tx.needs_review === true);

    // Filtre par signalement problématique
    const matchesFlagged = flaggedFilter === 'all' ||
      (flaggedFilter === 'flagged' && tx.flagged_problematic === true) ||
      (flaggedFilter === 'not_flagged' && !tx.flagged_problematic);

    // Filtre par état de réconciliation avec la nouvelle logique
    const hasEntities = tx.matched_entities && tx.matched_entities.length > 0;
    const status = tx.statut_reconciliation || 'non_verifie';

    // Déterminer les états
    const isReconciled = hasEntities || status === 'reconcilie';
    const isNotFound = status === 'pas_trouve' && !hasEntities;
    const isUnverified = status === 'non_verifie' && !hasEntities && !isReconciled;

    const matchesReconciliation = reconciliationFilter === 'all' ||
      (reconciliationFilter === 'reconciled' && isReconciled) ||
      (reconciliationFilter === 'not_found' && isNotFound) ||
      (reconciliationFilter === 'unreconciled' && isUnverified);

    // Filtre par montant
    let matchesAmount = true;
    if (amountFilterType !== 'all') {
      const amount1 = parseFloat(amountValue1);
      const amount2 = parseFloat(amountValue2);
      const txAmount = Math.abs(tx.montant);

      if (!isNaN(amount1)) {
        switch (amountFilterType) {
          case 'equal':
            matchesAmount = txAmount === amount1;
            break;
          case 'greater':
            matchesAmount = txAmount >= amount1;
            break;
          case 'less':
            matchesAmount = txAmount <= amount1;
            break;
          case 'between':
            if (!isNaN(amount2)) {
              const min = Math.min(amount1, amount2);
              const max = Math.max(amount1, amount2);
              matchesAmount = txAmount >= min && txAmount <= max;
            } else {
              matchesAmount = true;
            }
            break;
        }
      }
    }

    // Enhanced filters

    // Transaction status filter
    const matchesStatus = transactionStatus === 'all' || tx.statut === transactionStatus;

    // Attachments filter
    const hasAttachmentsFlag = (tx.urls_justificatifs && tx.urls_justificatifs.length > 0) ||
                              (tx.documents_justificatifs && tx.documents_justificatifs.length > 0);
    const matchesAttachments = hasAttachments === 'all' ||
      (hasAttachments === 'with' && hasAttachmentsFlag) ||
      (hasAttachments === 'without' && !hasAttachmentsFlag);

    // Parent/Child filter
    const matchesParentChild = parentChildFilter === 'all' ||
      (parentChildFilter === 'parent' && tx.is_parent) ||
      (parentChildFilter === 'child' && tx.parent_transaction_id) ||
      (parentChildFilter === 'standalone' && !tx.is_parent && !tx.parent_transaction_id);

    // Date range filter
    let matchesDateRange = true;
    if (dateRangeFilter.start || dateRangeFilter.end) {
      const txDate = dateFilterType === 'execution' ? tx.date_execution : tx.date_valeur;
      const date = txDate?.toDate ? txDate.toDate() : new Date(txDate);
      if (dateRangeFilter.start) {
        const startDate = new Date(dateRangeFilter.start);
        if (date < startDate) matchesDateRange = false;
      }
      if (dateRangeFilter.end && matchesDateRange) {
        const endDate = new Date(dateRangeFilter.end);
        if (date > endDate) matchesDateRange = false;
      }
    }

    // Counterparty search (separate from main search)
    const matchesCounterparty = !counterpartySearch ||
      tx.contrepartie_nom.toLowerCase().includes(counterpartySearch.toLowerCase());

    // IBAN search
    const matchesIban = !ibanSearch ||
      (tx.contrepartie_iban && tx.contrepartie_iban.toLowerCase().includes(ibanSearch.toLowerCase()));

    // Communication search (separate from main search)
    const matchesCommunication = !communicationSearch ||
      tx.communication.toLowerCase().includes(communicationSearch.toLowerCase());

    // Sequence number range
    let matchesSequenceRange = true;
    if (sequenceNumberRange.start || sequenceNumberRange.end) {
      // Extract just the number part from format like "2025-00950"
      const seqNumMatch = tx.numero_sequence?.match(/(\d+)$/);
      const seqNum = seqNumMatch ? parseInt(seqNumMatch[1], 10) : null;

      if (seqNum !== null) {
        const startNum = sequenceNumberRange.start ? parseInt(sequenceNumberRange.start, 10) : null;
        const endNum = sequenceNumberRange.end ? parseInt(sequenceNumberRange.end, 10) : null;

        if (startNum !== null && !isNaN(startNum) && seqNum < startNum) matchesSequenceRange = false;
        if (endNum !== null && !isNaN(endNum) && seqNum > endNum) matchesSequenceRange = false;
      } else {
        // If we can't parse the sequence number, don't match
        matchesSequenceRange = false;
      }
    }

    // Linked entity type filter
    const matchesLinkedEntity = linkedEntityType === 'all' ||
      (linkedEntityType === 'membre' && tx.membre_lifras_id) ||
      (linkedEntityType === 'operation' && tx.operation_id) ||
      (linkedEntityType === 'expense' && tx.expense_claim_id) ||
      (linkedEntityType === 'loan' && tx.linked_to_loan_id) ||
      (linkedEntityType === 'inventory' && tx.linked_to_inventory_item_id) ||
      (linkedEntityType === 'sale' && tx.linked_to_sale_id) ||
      (linkedEntityType === 'order' && tx.linked_to_order_id);

    // Specific account code search
    const matchesSpecificCode = !specificAccountCode ||
      (tx.code_comptable && tx.code_comptable.includes(specificAccountCode));

    // Comment search
    const matchesComment = !commentSearch ||
      (tx.commentaire && tx.commentaire.toLowerCase().includes(commentSearch.toLowerCase()));

    // Batch filter (for categorization batches)
    const matchesBatch = batchFilter === 'all' ||
      (tx.categorization_batch_id === batchFilter);

    // NIEUW: Geselecteerde transacties altijd tonen, ook als ze niet aan filter voldoen
    const isSelected = selectedTransactionIds.has(tx.id);
    
    const matchesAllFilters = matchesTab && matchesSearch && matchesCategory && matchesAccountCode &&
           matchesCategorizationSource && matchesFlagged && matchesReconciliation && matchesAmount && matchesStatus && matchesAttachments &&
           matchesParentChild && matchesDateRange && matchesCounterparty && matchesIban &&
           matchesCommunication && matchesSequenceRange && matchesLinkedEntity &&
           matchesSpecificCode && matchesComment && matchesBatch;
    
    // Toon als: matches filters OF is geselecteerd
    return matchesAllFilters || isSelected;
  });

  // Calculer les batchs uniques pour le dropdown (avec nombre de transactions)
  const availableBatches = useMemo(() => {
    const batchCounts = new Map<string, number>();
    transactions.forEach(tx => {
      if (tx.categorization_batch_id) {
        batchCounts.set(tx.categorization_batch_id, (batchCounts.get(tx.categorization_batch_id) || 0) + 1);
      }
    });

    // Convertir en tableau et trier par date décroissante (plus récent en premier)
    return Array.from(batchCounts.entries())
      .map(([batchId, count]) => ({
        batchId,
        count,
        date: new Date(batchId)
      }))
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [transactions]);

  // Helper pour vérifier si un code est un code cotisation (730-00-7xx ou 493-00-719)
  const isCotisationCode = (code: string | undefined): boolean => {
    if (!code) return false;
    return code.startsWith('730-00-7') || code === '493-00-719';
  };

  // Transactions cotisation sélectionnées (pour le bouton bulk "Lier Membres")
  const selectedCotisationTransactions = useMemo(() => {
    return transactions.filter(tx =>
      selectedTransactionIds.has(tx.id) &&
      isCotisationCode(tx.code_comptable) &&
      !tx.is_parent
    );
  }, [transactions, selectedTransactionIds]);

  // Synchronize lastViewedTransactionId with detailViewTransaction (for blue highlight)
  useEffect(() => {
    if (detailViewTransaction) {
      setLastViewedTransactionId(detailViewTransaction.id);
    }
  }, [detailViewTransaction]);

  // Handler pour retourner à l'entité d'origine (event, inscription, expense)
  const handleReturnToEntity = () => {
    if (!returnContext) return;

    // Clear return context
    setReturnContext(null);

    // Build return URL based on context type
    const params = new URLSearchParams({
      selectedId: returnContext.id,
      openLinkingModal: 'true'
    });

    if (returnContext.type === 'event') {
      navigate(`/operations?${params.toString()}`);
    } else if (returnContext.type === 'inscription') {
      navigate(`/operations?${params.toString()}`);
    } else if (returnContext.type === 'expense') {
      navigate(`/depenses?${params.toString()}`);
    }
  };

  // Fonction pour gérer le tri
  const handleSort = (key: keyof TransactionBancaire) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Appliquer le filtre "sélectionnées uniquement" puis le tri
  const transactionsToSort = showOnlySelected && selectedTransactionIds.size > 0
    ? filteredTransactions.filter(t => selectedTransactionIds.has(t.id))
    : filteredTransactions;

  const sortedTransactions = [...transactionsToSort].sort((a, b) => {
    if (!sortConfig.key) return 0;

    const aValue = a[sortConfig.key];
    const bValue = b[sortConfig.key];

    // Handle null/undefined values
    if (aValue === null || aValue === undefined) return 1;
    if (bValue === null || bValue === undefined) return -1;

    // Handle dates
    if (aValue instanceof Date && bValue instanceof Date) {
      return sortConfig.direction === 'asc'
        ? aValue.getTime() - bValue.getTime()
        : bValue.getTime() - aValue.getTime();
    }

    // Handle numbers
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return sortConfig.direction === 'asc'
        ? aValue - bValue
        : bValue - aValue;
    }

    // Handle strings
    const aString = String(aValue).toLowerCase();
    const bString = String(bValue).toLowerCase();

    if (sortConfig.direction === 'asc') {
      return aString.localeCompare(bString);
    } else {
      return bString.localeCompare(aString);
    }
  });

  // Keyboard navigatie voor detail view (pijltjestoetsen ← →)
  useKeyboardNavigation({
    items: sortedTransactions,
    currentItem: detailViewTransaction,
    onNavigate: setDetailViewTransaction,
    isOpen: !!detailViewTransaction
  });

  // Calculer les statistiques
  const stats = {
    totalIncome: transactions.filter(t => t.montant > 0).reduce((sum, t) => sum + t.montant, 0),
    totalExpense: transactions.filter(t => t.montant < 0).reduce((sum, t) => sum + Math.abs(t.montant), 0),
    unreconciled: transactions.filter(t => !t.reconcilie).length,
    reconciled: transactions.filter(t => t.reconcilie).length
  };

  // Gérer l'import CSV
  const handleMultiFileImport = async (files: File[], onProgress?: (progress: ImportProgress) => void) => {
    if (!files || files.length === 0) return;

    let totalImported = 0;
    let totalDuplicates = 0;
    let totalUpdated = 0; // NOUVEAU - Compteur de mises à jour de numéros incomplets
    let totalErrors = 0;
    let totalPendingCount = 0;
    let totalPendingAmount = 0;

    // Process each file
    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      const file = files[fileIndex];

      // Update progress: starting new file
      if (onProgress) {
        onProgress({
          currentFile: fileIndex + 1,
          totalFiles: files.length,
          currentFileName: file.name,
          imported: totalImported,
          duplicates: totalDuplicates,
          errors: totalErrors
        });
      }
      try {
        const result = await parseCSVFile(file);

        if (result.errors.length > 0) {
          totalErrors += result.errors.length;
          logger.error(`Erreurs dans ${file.name}:`, result.errors);
        }

        // Accumuler les transactions en attente (virements instantanés sans numéro définitif)
        if (result.pendingTransactions.count > 0) {
          totalPendingCount += result.pendingTransactions.count;
          totalPendingAmount += result.pendingTransactions.totalAmount;
          logger.debug(`⏳ ${result.pendingTransactions.count} transaction(s) en attente (${result.pendingTransactions.totalAmount.toFixed(2)}€) - numéro de séquence incomplet`);
        }

        // Check for duplicates first
        const transactionsRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
        const existingSnapshot = await getDocs(transactionsRef);
        const existingHashes = new Set(
          existingSnapshot.docs.map(doc => doc.data().hash_dedup).filter(Boolean)
        );

        // Récupérer toutes les transactions existantes (avec leurs données complètes)
        const existingTransactions = existingSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as TransactionBancaire));

        // CRITIQUE: Créer un Set des numero_sequence existants (deuxième ligne de défense)
        const existingSequenceNumbers = new Set(
          existingTransactions.map(tx => tx.numero_sequence).filter(Boolean)
        );

        // Compter les transactions avec numéros incomplets
        const incompleteTransactions = existingTransactions.filter(tx =>
          /^\d{4}-$/.test(tx.numero_sequence)
        );
        const incompleteCount = incompleteTransactions.length;

        // Logs de démarrage
        logger.debug(`\n📊 Import CSV: ${file.name}`);
        logger.debug(`📊 Transactions dans le CSV: ${result.transactions.length}`);
        logger.debug(`📊 Transactions en base: ${existingTransactions.length} (dont ${incompleteCount} avec numéros incomplets)`);

        // DEBUG: Afficher les transactions avec numéros incomplets
        if (incompleteCount > 0) {
          logger.debug(`\n🔍 Transactions avec numéros incomplets en base:`);
          incompleteTransactions.forEach(tx => {
            const date = tx.date_execution instanceof Date ? tx.date_execution : new Date(tx.date_execution);
            const dateStr = !isNaN(date.getTime()) ? date.toISOString().split('T')[0] : 'INVALID_DATE';
            logger.debug(`  - ${tx.numero_sequence} | ${dateStr} | ${tx.montant}€ | ${tx.contrepartie_nom} | "${tx.communication}"`);
          });
        }

        // Separate new, duplicate, and updatable transactions
        const newTransactions: typeof result.transactions = [];
        const duplicates: typeof result.transactions = [];
        const toUpdate: Array<{ newTx: TransactionBancaire; existingId: string }> = [];

        for (const tx of result.transactions) {
          // Vérification 1: PRIORITÉ - Match avec numéro incomplet
          const incompleteMatch = findIncompleteMatch(tx, existingTransactions);

          if (incompleteMatch) {
            // Match trouvé! Préparer pour mise à jour
            logger.debug(`🔄 Match incomplet: ${tx.numero_sequence} - ${tx.contrepartie_nom} (${tx.montant}€) → Update ${incompleteMatch.id.substring(0, 8)}...`);
            toUpdate.push({ newTx: tx, existingId: incompleteMatch.id });
            // Ajouter le hash de la nouvelle transaction pour éviter les doublons dans le batch
            if (tx.hash_dedup) {
              existingHashes.add(tx.hash_dedup);
            }
            existingSequenceNumbers.add(tx.numero_sequence);
            continue;
          }

          // Vérification 1.5: ENRICHISSEMENT - Transaction existe par numero_sequence avec contrepartie vide
          if (tx.numero_sequence && existingSequenceNumbers.has(tx.numero_sequence)) {
            const existingTx = existingTransactions.find(t => t.numero_sequence === tx.numero_sequence);
            if (existingTx && (!existingTx.contrepartie_nom || existingTx.contrepartie_nom.trim() === '') && tx.contrepartie_nom) {
              // Transaction existe avec contrepartie vide + CSV a une contrepartie → Enrichir!
              logger.debug(`🎨 Enrichissement détecté: ${tx.numero_sequence} → "${tx.contrepartie_nom}"`);
              toUpdate.push({ newTx: tx, existingId: existingTx.id });
              continue;
            }
            // Sinon c'est un vrai duplicate
            duplicates.push(tx);
            continue;
          }

          // Vérification 2: Duplicate par hash (comportement actuel)
          if (tx.hash_dedup && existingHashes.has(tx.hash_dedup)) {
            // Vérifier aussi si besoin d'enrichissement par hash
            const existingTx = existingTransactions.find(t => t.hash_dedup === tx.hash_dedup);
            if (existingTx && (!existingTx.contrepartie_nom || existingTx.contrepartie_nom.trim() === '') && tx.contrepartie_nom) {
              logger.debug(`🎨 Enrichissement détecté (hash): ${tx.numero_sequence} → "${tx.contrepartie_nom}"`);
              toUpdate.push({ newTx: tx, existingId: existingTx.id });
              continue;
            }
            duplicates.push(tx);
            continue;
          }

          // Pas de duplicate, pas de match incomplet → Nouvelle transaction
          newTransactions.push(tx);
          if (tx.hash_dedup) {
            existingHashes.add(tx.hash_dedup);
          }
          if (tx.numero_sequence) {
            existingSequenceNumbers.add(tx.numero_sequence);
          }
        }

        totalDuplicates += duplicates.length;

        // Log des résultats du tri
        logger.debug(`📊 Résultat du tri: ${toUpdate.length} à mettre à jour, ${newTransactions.length} nouvelles, ${duplicates.length} duplicates`);

        // NOUVEAU: Mettre à jour les transactions (numéros incomplets + enrichissement)
        for (const { newTx, existingId } of toUpdate) {
          try {
            const docRef = doc(db, 'clubs', clubId, 'transactions_bancaires', existingId);
            const existingTx = existingTransactions.find(tx => tx.id === existingId);

            // Préparer les champs à mettre à jour
            const updateData: {
              updated_at: ReturnType<typeof serverTimestamp>;
              numero_sequence?: string;
              hash_dedup?: string;
              contrepartie_nom?: string;
            } = {
              updated_at: serverTimestamp()
            };

            // Cas 1: Update numéro incomplet (toujours mettre à jour numero + hash)
            if (existingTx && isIncompleteSequenceNumber(existingTx.numero_sequence)) {
              updateData.numero_sequence = newTx.numero_sequence;
              updateData.hash_dedup = newTx.hash_dedup;
              logger.debug(`🔄 Update numéro incomplet: ${existingTx.numero_sequence} → ${newTx.numero_sequence}`);
            }

            // Cas 2: Enrichissement contrepartie (seulement si vide)
            if (existingTx && (!existingTx.contrepartie_nom || existingTx.contrepartie_nom.trim() === '') && newTx.contrepartie_nom) {
              updateData.contrepartie_nom = newTx.contrepartie_nom;
              logger.debug(`🎨 Enrichissement contrepartie: ${existingId.substring(0, 8)}... → "${newTx.contrepartie_nom}"`);
            }

            await updateDoc(docRef, updateData);

            totalUpdated++;

            // Mettre à jour dans l'état local
            setTransactions(prev =>
              prev.map(t => t.id === existingId
                ? {
                    ...t,
                    ...updateData,
                    updated_at: new Date()
                  }
                : t
              )
            );

            const enrichmentNote = updateData.contrepartie_nom ? ` [enrichi: "${updateData.contrepartie_nom}"]` : '';
            const numeroNote = updateData.numero_sequence ? ` [numero: ${updateData.numero_sequence}]` : '';
            logger.debug(`✓ Mise à jour: ${existingId.substring(0, 8)}...${numeroNote}${enrichmentNote}`);
          } catch (error) {
            logger.error('Error updating transaction:', error);
            totalErrors++;
          }
        }

        // Save only new transactions to Firestore
        const savedTransactions: TransactionBancaire[] = [];

        for (const tx of newTransactions) {
          try {
            // Determine fiscal year ID based on transaction date
            let fiscalYearId = selectedFiscalYear?.id || null;

            // If transaction date is available, find the correct fiscal year
            if (tx.date_execution) {
              const txDate = tx.date_execution instanceof Date ? tx.date_execution : new Date(tx.date_execution);
              if (!isNaN(txDate.getTime())) {
                const txYear = txDate.getFullYear();
                // Find fiscal year that matches this transaction's year
                const matchingFY = allFiscalYears.find((fy: FiscalYear) => fy.year === txYear);
                if (matchingFY) {
                  fiscalYearId = matchingFY.id;
                }
              }
            }

            const docRef = await addDoc(transactionsRef, {
              ...tx,
              club_id: clubId,
              fiscal_year_id: fiscalYearId,
              statut: 'accepte',
              created_at: serverTimestamp(),
              updated_at: serverTimestamp(),
              created_by: 'import',
              source_file: file.name
            });
            
            savedTransactions.push({
              ...tx,
              id: docRef.id,
              club_id: clubId,
              statut: 'accepte' as const,
              created_at: new Date(),
              updated_at: new Date(),
              created_by: 'import'
            } as TransactionBancaire);
            totalImported++;
          } catch (error) {
            logger.error('Error saving transaction:', error);
            totalErrors++;
          }
        }

        setTransactions(prev => [...prev, ...savedTransactions]);

        // AUTO-MATCH: Tenter le matching automatique par event_number sur les nouvelles transactions
        let autoMatchCount = 0;
        const matchedEventTransactions = new Map<string, TransactionBancaire[]>(); // eventId -> transactions matched to it

        for (const tx of savedTransactions) {
          if (canAutoMatch(tx)) {
            try {
              const matchResult = await autoMatchByEventNumber(clubId, tx);
              if (matchResult.success && matchResult.transactionUpdates) {
                autoMatchCount++;
                logger.debug(`✅ Auto-match réussi: ${tx.communication} → ${matchResult.message}`);

                // Track which events got new transactions
                if (matchResult.operation) {
                  const eventId = matchResult.operation.id;
                  const updatedTx = { ...tx, ...matchResult.transactionUpdates };
                  if (!matchedEventTransactions.has(eventId)) {
                    matchedEventTransactions.set(eventId, []);
                  }
                  matchedEventTransactions.get(eventId)!.push(updatedTx);
                }

                // Mettre à jour la transaction dans l'état local
                setTransactions(prev =>
                  prev.map(t => t.id === tx.id ? { ...t, ...matchResult.transactionUpdates } : t)
                );
              }
            } catch (error) {
              logger.error(`Auto-match échoué pour ${tx.numero_sequence}:`, error);
            }
          }
        }
        if (autoMatchCount > 0) {
          logger.debug(`🔗 Auto-match: ${autoMatchCount}/${savedTransactions.length} transactions liées automatiquement`);
        }

        // AUTO-CONTROL INSCRIPTIONS: For each event that got linked transactions,
        // automatically match inscriptions to transactions by name similarity
        // (mirrors "Contrôler les paiements" button logic)
        if (matchedEventTransactions.size > 0) {
          let inscriptionMatchCount = 0;
          for (const [eventId, newTxs] of matchedEventTransactions) {
            // Combine new transactions with existing ones already linked to this event
            const existingEventTxs = transactions.filter(t =>
              t.operation_id === eventId ||
              t.matched_entities?.some(e => e.entity_type === 'event' && e.entity_id === eventId)
            );
            const allEventTransactions = [...existingEventTxs, ...newTxs];

            try {
              const matched = await autoControlInscriptionPayments(clubId, eventId, allEventTransactions);
              inscriptionMatchCount += matched;
            } catch (error) {
              logger.error(`Auto-control inscriptions échoué pour event ${eventId}:`, error);
            }
          }

          if (inscriptionMatchCount > 0) {
            logger.debug(`💳 Auto-control: ${inscriptionMatchCount} inscription(s) liées automatiquement`);
          }
        }

        // Update progress: file completed
        if (onProgress) {
          onProgress({
            currentFile: fileIndex + 1,
            totalFiles: files.length,
            currentFileName: file.name,
            imported: totalImported,
            duplicates: totalDuplicates,
            errors: totalErrors
          });
        }

      } catch (error) {
        logger.error(`Error processing ${file.name}:`, error);
        totalErrors++;
      }
    }

    // Log final
    logger.debug(`\n✅ Import terminé: ${totalUpdated} mises à jour, ${totalImported} nouvelles, ${totalDuplicates} duplicates, ${totalErrors} erreurs\n`);

    // Sauvegarder les transactions en attente dans Firestore pour affichage dans le dashboard
    try {
      const pendingRef = doc(db, 'clubs', clubId, 'settings', 'pending_transactions');
      await setDoc(pendingRef, {
        count: totalPendingCount,
        amount: totalPendingAmount,
        updated_at: serverTimestamp()
      });
      logger.debug(`💾 Pending transactions sauvegardées: ${totalPendingCount} transactions, ${totalPendingAmount.toFixed(2)}€`);
    } catch (error) {
      logger.error('Erreur sauvegarde pending transactions:', error);
    }

    // Show summary for multiple files
    if (totalDuplicates > 0 && totalImported === 0 && totalUpdated === 0) {
      // Show warning modal when all transactions are duplicates
      const confirmModal = document.createElement('div');
      confirmModal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50';
      confirmModal.innerHTML = `
        <div class="bg-white rounded-xl p-6 max-w-md w-full mx-4">
          <div class="flex items-start gap-3 mb-4">
            <div class="p-2 bg-amber-100 rounded-full">
              <svg class="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div class="flex-1">
              <h3 class="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">Toutes les transactions existent déjà!</h3>
              <p class="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                ${totalDuplicates} transaction(s) étaient déjà présentes dans la base de données.
              </p>
              <p class="text-sm text-amber-600 font-medium mt-2">
                Aucune nouvelle transaction n'a été importée.
              </p>
            </div>
          </div>
          <div class="flex justify-end mt-6">
            <button id="close-modal" class="px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue-dark">
              Compris
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(confirmModal);
      
      document.getElementById('close-modal')?.addEventListener('click', () => {
        document.body.removeChild(confirmModal);
      });
    } else if (totalImported > 0 || totalUpdated > 0) {
      // Show success modal with basic statistics only
      const successModal = document.createElement('div');
      successModal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50';
      successModal.innerHTML = `
        <div class="bg-white rounded-xl p-6 max-w-md w-full mx-4">
          <div class="flex items-start gap-3 mb-4">
            <div class="p-2 bg-green-100 rounded-full">
              <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div class="flex-1">
              <h3 class="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">Import réussi!</h3>
              <p class="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                Les transactions ont été importées avec succès depuis ${files.length} fichier${files.length > 1 ? 's' : ''}.
              </p>
            </div>
          </div>

          <div class="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4 space-y-2">
            <div class="flex justify-between text-sm">
              <span class="text-gray-600 dark:text-dark-text-secondary">Fichiers traités:</span>
              <span class="font-semibold">${files.length}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-600 dark:text-dark-text-secondary">Transactions importées:</span>
              <span class="font-semibold text-green-600">${totalImported}</span>
            </div>
            ${totalUpdated > 0 ? `
            <div class="flex justify-between text-sm">
              <span class="text-gray-600 dark:text-dark-text-secondary">Mises à jour:</span>
              <span class="font-semibold text-blue-600">${totalUpdated}</span>
            </div>
            ` : ''}
            ${totalDuplicates > 0 ? `
            <div class="flex justify-between text-sm">
              <span class="text-gray-600 dark:text-dark-text-secondary">Doublons ignorés:</span>
              <span class="font-semibold text-amber-600">${totalDuplicates}</span>
            </div>
            ` : ''}
            ${totalErrors > 0 ? `
            <div class="flex justify-between text-sm">
              <span class="text-gray-600 dark:text-dark-text-secondary">Erreurs:</span>
              <span class="font-semibold text-red-600">${totalErrors}</span>
            </div>
            ` : ''}
          </div>
          ${totalPendingCount > 0 ? `
          <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mt-3">
            <div class="flex items-start gap-2">
              <svg class="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div class="text-sm">
                <p class="font-medium text-blue-800 dark:text-blue-200">${totalPendingCount} virement(s) instantané(s) en attente</p>
                <p class="text-blue-600 dark:text-blue-300 mt-1">
                  Montant: <span class="font-semibold">${totalPendingAmount.toLocaleString('fr-BE', { minimumFractionDigits: 2 })} €</span>
                </p>
                <p class="text-blue-600/80 dark:text-blue-400/80 text-xs mt-2">
                  Ces transactions n'ont pas encore de numéro de séquence définitif. Elles apparaîtront automatiquement lors du prochain import (1-2 jours).
                </p>
              </div>
            </div>
          </div>
          ` : ''}

          <div class="flex justify-end mt-6">
            <button id="close-success-modal" class="px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue-dark transition-colors">
              Fermer
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(successModal);

      document.getElementById('close-success-modal')?.addEventListener('click', () => {
        document.body.removeChild(successModal);
      });
    } else if (totalErrors > 0) {
      toast.error(`Erreur lors de l'import: ${totalErrors} erreur(s) rencontrée(s)`);
    }

    // ✅ Invalidation du cache React Query - Dashboard & Stats
    if (totalImported > 0 || totalUpdated > 0) {
      logger.debug('🔄 Invalidation du cache dashboard après import transactions...');
      await queryClient.invalidateQueries({ queryKey: ['fiscalYearStats', clubId] });
      await queryClient.invalidateQueries({ queryKey: ['monthlyBreakdown', clubId] });
      await queryClient.invalidateQueries({ queryKey: ['financialSummary', clubId] });
      await queryClient.invalidateQueries({ queryKey: ['currentMonthStats', clubId] });
      await queryClient.invalidateQueries({ queryKey: ['reconciliationStats', clubId] });
      await queryClient.invalidateQueries({ queryKey: ['accountingCodeStats', clubId] });
      await queryClient.invalidateQueries({ queryKey: ['countStats', clubId] });
      await queryClient.invalidateQueries({ queryKey: ['yearOverYearData', clubId] });
      await queryClient.invalidateQueries({ queryKey: ['balanceCurrent', clubId] });
      await queryClient.invalidateQueries({ queryKey: ['balanceSavings', clubId] });
      logger.debug('✅ Cache dashboard invalidé!');
    }
  };

  // Exporter les transactions
  const handleExport = () => {
    const csv = exportTransactionsToCSV(filteredTransactions);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transactions_${formatDate(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Transactions exportées');
  };

  // Générer un rapport Excel avec Claude Skills API
  const handleGenerateAIReport = async () => {
    if (!ClaudeSkillsService.isAvailable()) {
      toast.error('Service Claude Skills non disponible. Vérifiez la clé API dans les paramètres.');
      return;
    }

    if (filteredTransactions.length === 0) {
      toast.error('Aucune transaction à inclure dans le rapport');
      return;
    }

    const loadingToast = toast.loading('Génération du rapport Excel avec AI...');

    try {
      const blob = await ClaudeSkillsService.generateTransactionsReport(
        filteredTransactions,
        {
          filename: `calypso_rapport_${formatDate(new Date(), 'yyyy-MM-dd')}.xlsx`
        }
      );

      // Télécharger le fichier
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `calypso_rapport_${formatDate(new Date(), 'yyyy-MM-dd')}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('Rapport Excel généré avec succès', { id: loadingToast });
    } catch (error) {
      logger.error('Error generating AI report:', error);
      toast.error('Erreur lors de la génération du rapport', { id: loadingToast });
    }
  };

  // Obtenir les splits pour une transaction
  const getTransactionSplits = (transactionId: string) => {
    return splits.filter(split => split.bank_transaction_id === transactionId);
  };

  // Gérer la sauvegarde des splits - NOUVEAU : crée des transactions enfants
  const handleSaveSplits = async (newSplits: Omit<TransactionSplit, 'id' | 'created_at' | 'updated_at' | 'created_by'>[]) => {
    if (!splitModalTransaction) return;

    try {
      const parentTx = splitModalTransaction;

      // 1. Supprimer les anciennes transactions enfants si elles existent
      const existingChildren = transactions.filter(tx => tx.parent_transaction_id === parentTx.id);
      for (const child of existingChildren) {
        const childRef = doc(db, 'clubs', clubId, 'transactions_bancaires', child.id);
        await deleteDoc(childRef);
      }

      // NOUVEAU : Si 0-1 lignes → restaurer la transaction comme normale
      if (newSplits.length < 2) {
        const parentRef = doc(db, 'clubs', clubId, 'transactions_bancaires', parentTx.id);
        await updateDoc(parentRef, {
          is_parent: false,
          child_count: 0,
          is_split: false,
          split_count: 0,
          updated_at: serverTimestamp()
        });

        // Mettre à jour l'état local
        setTransactions(prev => [
          ...prev.filter(tx => tx.id !== parentTx.id && tx.parent_transaction_id !== parentTx.id),
          { ...parentTx, is_parent: false, child_count: 0, is_split: false, split_count: 0 }
        ]);

        toast.success('Ventilation supprimée - La transaction est redevenue normale');
        setSplitModalTransaction(null);
        return;
      }

      // 2. Créer les nouvelles transactions enfants dans Firestore (si 2+ lignes)
      const childTransactions: TransactionBancaire[] = [];

      for (let i = 0; i < newSplits.length; i++) {
        const split = newSplits[i];
        const sign = parentTx.montant < 0 ? -1 : 1; // Garder le même signe que la transaction mère

        // Préparer les données pour Firestore (ne pas inclure undefined)
        const firestoreData: Record<string, unknown> = {
          // Champs obligatoires de base (copiés de la mère)
          numero_sequence: `${parentTx.numero_sequence}_child_${i + 1}`,
          date_execution: parentTx.date_execution,
          date_valeur: parentTx.date_valeur,
          montant: split.amount * sign,
          devise: parentTx.devise,
          numero_compte: parentTx.numero_compte,
          type_transaction: parentTx.type_transaction,
          contrepartie_nom: split.description || parentTx.contrepartie_nom,
          communication: `${parentTx.communication} - Ligne ${i + 1}/${newSplits.length}`,
          statut: parentTx.statut,

          // Champs de gestion
          reconcilie: split.reconcilie || false,
          hash_dedup: `${parentTx.hash_dedup}_child_${i + 1}`,

          // Marqueurs parent-enfant
          parent_transaction_id: parentTx.id,
          child_index: i + 1,

          type: split.amount < 0 ? 'expense' : 'income',

          // IMPORTANT: Copier le fiscal_year_id de la transaction mère (requis par Firestore Rules)
          fiscal_year_id: parentTx.fiscal_year_id || selectedFiscalYear?.id || null,

          created_at: serverTimestamp(),
          updated_at: serverTimestamp()
        };

        // Copier tous les champs optionnels de la transaction mère si définis
        if (parentTx.contrepartie_iban) firestoreData.contrepartie_iban = parentTx.contrepartie_iban;
        if (parentTx.details) firestoreData.details = parentTx.details;
        if (parentTx.motif_refus) firestoreData.motif_refus = parentTx.motif_refus;
        if (parentTx.import_batch_id) firestoreData.import_batch_id = parentTx.import_batch_id;
        if (parentTx.evenement_id) firestoreData.evenement_id = parentTx.evenement_id;
        if (parentTx.expense_claim_id) firestoreData.expense_claim_id = parentTx.expense_claim_id;
        if (parentTx.matched_entities) firestoreData.matched_entities = parentTx.matched_entities;
        if (parentTx.commentaire) firestoreData.commentaire = parentTx.commentaire;

        // Priorité aux valeurs du split pour categorie et code_comptable
        if (split.notes) firestoreData.details = split.notes;
        if (split.categorie) firestoreData.categorie = split.categorie;
        else if (parentTx.categorie) firestoreData.categorie = parentTx.categorie;
        if (split.code_comptable) firestoreData.code_comptable = split.code_comptable;
        else if (parentTx.code_comptable) firestoreData.code_comptable = parentTx.code_comptable;

        // Gérer la liaison avec une opération (activité)
        if (split.operation_id) {
          const operation = operations.find(op => op.id === split.operation_id);
          firestoreData.matched_entities = [{
            entity_type: 'event',
            entity_id: split.operation_id,
            entity_name: operation?.titre || 'Activité',
            confidence: 100,
            matched_at: new Date(),
            matched_by: 'manual'
          }];
        }

        // Sauvegarder dans Firestore
        const txRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
        const docRef = await addDoc(txRef, firestoreData);

        childTransactions.push({
          ...firestoreData,
          id: docRef.id,
          created_at: new Date(),
          updated_at: new Date()
        } as TransactionBancaire);
      }

      // 3. Mettre à jour la transaction mère pour la marquer comme parent
      const parentRef = doc(db, 'clubs', clubId, 'transactions_bancaires', parentTx.id);
      await updateDoc(parentRef, {
        is_parent: true,
        child_count: newSplits.length,
        // Marquer aussi avec l'ancien système pour compatibilité
        is_split: true,
        split_count: newSplits.length,
        updated_at: serverTimestamp()
      });

      // 4. Mettre à jour l'état local
      setTransactions(prev => [
        ...prev.filter(tx => tx.id !== parentTx.id && tx.parent_transaction_id !== parentTx.id), // Retirer l'ancienne version
        { ...parentTx, is_parent: true, child_count: newSplits.length, is_split: true, split_count: newSplits.length },
        ...childTransactions
      ]);

      toast.success(`Transaction ventilée en ${newSplits.length} lignes`);
      setSplitModalTransaction(null);

    } catch (error) {
      logger.error('Error saving splits:', error);
      toast.error('Erreur lors de la ventilation');
    }
  };

  // Supprimer une transaction enfant
  const deleteChildTransaction = async (childId: string) => {
    const child = transactions.find(tx => tx.id === childId);
    if (!child || !child.parent_transaction_id) {
      toast.error('Transaction enfant introuvable');
      return;
    }

    // Vérifier si l'enfant est lié ou réconcilié
    const isLinked = child.matched_entities && child.matched_entities.length > 0;
    const isReconciled = child.reconcilie;

    if (isLinked || isReconciled) {
      const reasons = [];
      if (isReconciled) reasons.push('réconciliée');
      if (isLinked) reasons.push('liée à un événement/dépense');

      toast.error(`Impossible de supprimer : transaction ${reasons.join(' et ')}`);
      return;
    }

    const confirmed = window.confirm(
      `Voulez-vous vraiment supprimer cette ligne de ventilation ?\n\n` +
      `Ligne: ${child.contrepartie_nom}\n` +
      `Montant: ${formatMontant(child.montant)}`
    );

    if (!confirmed) return;

    try {
      const parentTx = transactions.find(tx => tx.id === child.parent_transaction_id);
      if (!parentTx) {
        toast.error('Transaction parent introuvable');
        return;
      }

      // Supprimer l'enfant de Firestore
      const childRef = doc(db, 'clubs', clubId, 'transactions_bancaires', childId);
      await deleteDoc(childRef);

      // Récupérer les autres enfants restants
      const remainingChildren = transactions.filter(
        tx => tx.parent_transaction_id === parentTx.id && tx.id !== childId
      );

      // Si moins de 2 enfants restants → restaurer transaction normale
      if (remainingChildren.length < 2) {
        const parentRef = doc(db, 'clubs', clubId, 'transactions_bancaires', parentTx.id);
        await updateDoc(parentRef, {
          is_parent: false,
          child_count: 0,
          is_split: false,
          split_count: 0,
          updated_at: serverTimestamp()
        });

        // Supprimer les autres enfants restants s'il y en a
        for (const remaining of remainingChildren) {
          const remainingRef = doc(db, 'clubs', clubId, 'transactions_bancaires', remaining.id);
          await deleteDoc(remainingRef);
        }

        setTransactions(prev => [
          ...prev.filter(tx => tx.id !== parentTx.id && tx.parent_transaction_id !== parentTx.id),
          { ...parentTx, is_parent: false, child_count: 0, is_split: false, split_count: 0 }
        ]);

        toast.success('Ligne supprimée - Transaction redevenue normale (moins de 2 lignes)');
      } else {
        // Mettre à jour le nombre d'enfants du parent
        const parentRef = doc(db, 'clubs', clubId, 'transactions_bancaires', parentTx.id);
        await updateDoc(parentRef, {
          child_count: remainingChildren.length,
          split_count: remainingChildren.length,
          updated_at: serverTimestamp()
        });

        setTransactions(prev => [
          ...prev.filter(tx => tx.id !== childId),
          ...prev.filter(tx => tx.id === parentTx.id).map(tx => ({
            ...tx,
            child_count: remainingChildren.length,
            split_count: remainingChildren.length
          }))
        ]);

        toast.success('Ligne de ventilation supprimée');
      }
    } catch (error) {
      logger.error('Error deleting child transaction:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  // Basculer l'expansion d'une transaction
  const toggleExpanded = (transactionId: string) => {
    setExpandedTransactions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(transactionId)) {
        newSet.delete(transactionId);
      } else {
        newSet.add(transactionId);
      }
      return newSet;
    });
  };

  // Fonctions de sélection pour l'assignation en masse
  const toggleTransactionSelection = (transactionId: string) => {
    setSelectedTransactionIds(prev => {
      const next = new Set(prev);
      if (next.has(transactionId)) {
        next.delete(transactionId);
      } else {
        next.add(transactionId);
      }
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedTransactionIds(new Set(sortedTransactions.map(t => t.id)));
  };

  const clearSelection = () => {
    setSelectedTransactionIds(new Set());
    setShowOnlySelected(false); // Reset le filtre quand on désélectionne tout
  };

  // Assignation en masse du code comptable
  const handleBulkCodeAssignment = async (code: string) => {
    if (!clubId || selectedTransactionIds.size === 0) return;

    try {
      const batch = writeBatch(db);
      const transactionIds = Array.from(selectedTransactionIds);

      for (const transactionId of transactionIds) {
        const transactionRef = doc(db, 'clubs', clubId, 'transactions_bancaires', transactionId);

        // Trouver la transaction actuelle pour obtenir le code précédent
        const transaction = transactions.find(t => t.id === transactionId);

        if (code === '') {
          // Supprimer le code et les champs d'auto-catégorisation
          batch.update(transactionRef, {
            code_comptable: deleteField(),
            categorization_source: deleteField(),
            categorization_confidence: deleteField(),
            needs_review: deleteField()
          });
        } else {
          // Créer l'entrée audit trail
          const auditEntry: import('@/types').CodeComptableAudit = {
            code_comptable: code,
            categorie: transaction?.categorie,
            assigned_by: appUser?.id || 'unknown',
            assigned_by_name: appUser?.displayName || appUser?.email || 'Utilisateur inconnu',
            assigned_at: new Date(),
            previous_code: transaction?.code_comptable,
            previous_categorie: transaction?.categorie,
            source: 'bulk'
          };

          // Nettoyer l'entry - verwijder undefined velden
          Object.keys(auditEntry).forEach(key => {
            if (auditEntry[key as keyof typeof auditEntry] === undefined) {
              delete auditEntry[key as keyof typeof auditEntry];
            }
          });

          // Ajouter à l'historique existant
          const updatedHistory = [
            ...(transaction?.code_comptable_history || []),
            auditEntry
          ];

          // Assigner un nouveau code (marquer comme bulk)
          batch.update(transactionRef, {
            code_comptable: code,
            code_comptable_history: updatedHistory,
            categorization_source: 'bulk',
            categorization_confidence: deleteField(),
            needs_review: deleteField()
          });
        }
      }

      await batch.commit();

      if (code === '') {
        toast.success(`Code comptable supprimé de ${transactionIds.length} transactions`);
      } else {
        toast.success(`Code comptable assigné à ${transactionIds.length} transactions`);
      }

      // Rafraîchir les transactions (garder la sélection pour permettre d'autres actions)
      await loadTransactions();
      setIsBulkCodeModalOpen(false);
    } catch (error) {
      logger.error('Erreur lors de l\'assignation en masse:', error);
      toast.error('Erreur lors de l\'assignation en masse');
    }
  };

  // Liaison en masse des transactions à une/des activités
  const handleBulkActivityLinking = async (operationIds: string[]) => {
    if (!clubId || selectedTransactionIds.size === 0 || operationIds.length === 0) return;

    try {
      // Rafraîchir la session AVANT l'écriture pour éviter permission-denied
      if (appUser?.id) {
        await SessionService.ensureValidSession(clubId, appUser.id);
      }

      const batch = writeBatch(db);
      const transactionIds = Array.from(selectedTransactionIds);

      for (const transactionId of transactionIds) {
        const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', transactionId);
        const tx = transactions.find(t => t.id === transactionId);

        // Créer les nouvelles entités liées
        const newEntities = operationIds.map(opId => {
          const operation = operations.find(op => op.id === opId);
          return {
            entity_type: 'event' as const,
            entity_id: opId,
            entity_name: operation?.titre || 'Activité',
            confidence: 100,
            matched_at: new Date(),
            matched_by: 'manual' as const
          };
        });

        // Fusionner avec entités existantes (éviter doublons)
        const existingEntities = tx?.matched_entities || [];
        const existingIds = new Set(existingEntities.map(e => e.entity_id));
        const uniqueNewEntities = newEntities.filter(e => !existingIds.has(e.entity_id));

        batch.update(txRef, {
          matched_entities: [...existingEntities, ...uniqueNewEntities],
          reconcilie: true,
          updated_at: serverTimestamp()
        });
      }

      await batch.commit();
      toast.success(`${transactionIds.length} transaction${transactionIds.length > 1 ? 's' : ''} liée${transactionIds.length > 1 ? 's' : ''} à ${operationIds.length} activité${operationIds.length > 1 ? 's' : ''}`);

      // Rafraîchir les transactions (garder la sélection pour permettre d'autres actions)
      await loadTransactions();
      setIsBulkActivityModalOpen(false);
    } catch (error: any) {
      logger.error('Erreur lors de la liaison en masse:', error);
      if (error?.code === 'permission-denied') {
        toast.error('Session expirée. Veuillez rafraîchir la page et réessayer.');
      } else {
        toast.error('Erreur lors de la liaison en masse');
      }
    }
  };

  // Délier une transaction
  const unlinkTransaction = (transactionId: string) => {
    setTransactions(prev => prev.map(tx =>
      tx.id === transactionId
        ? {
            ...tx,
            reconcilie: false,
            matched_entities: undefined
          }
        : tx
    ));
    toast.success('Transaction déliée');
  };

  // Handler pour confirmer la cotisation d'un membre (mode single)
  const handleConfirmCotisation = async (cotisationDate: Date) => {
    if (!selectedMemberForCotisation || !detailViewTransaction || !clubId) return;

    try {
      const membre = selectedMemberForCotisation;

      // 1. Mettre à jour le membre avec la nouvelle date de cotisation
      await updateMembre(clubId, membre.id!, {
        cotisation_validite: Timestamp.fromDate(cotisationDate)
      });

      // 2. Ajouter l'entité membre à la transaction
      const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', detailViewTransaction.id);
      const existingEntities = detailViewTransaction.matched_entities || [];

      // Vérifier qu'il n'y a pas déjà un membre lié
      const filteredEntities = existingEntities.filter(e => e.entity_type !== 'member');

      const newEntity = {
        entity_type: 'member' as const,
        entity_id: membre.id!,
        entity_name: membre.displayName || `${membre.prenom || ''} ${membre.nom || ''}`.trim(),
        cotisation_date: Timestamp.fromDate(cotisationDate)
      };

      const updatedEntities = [...filteredEntities, newEntity];

      await updateDoc(txRef, {
        matched_entities: updatedEntities,
        reconcilie: true,
        updated_at: serverTimestamp()
      });

      // 3. Mettre à jour l'état local de la transaction
      const updatedTransaction = {
        ...detailViewTransaction,
        matched_entities: updatedEntities,
        reconcilie: true
      };

      setTransactions(prev => prev.map(tx =>
        tx.id === detailViewTransaction.id ? updatedTransaction : tx
      ));
      setDetailViewTransaction(updatedTransaction);

      // 4. Mettre à jour l'état local des membres
      setMembres(prev => prev.map(m =>
        m.id === membre.id
          ? { ...m, cotisation_validite: cotisationDate }
          : m
      ));

      // 5. Fermer les modals et afficher un toast
      setSelectedMemberForCotisation(null);
      setIsMemberPanelOpen(false);

      toast.success(`Cotisation de ${newEntity.entity_name} mise à jour jusqu'au ${cotisationDate.toLocaleDateString('fr-BE')}`);
    } catch (error) {
      logger.error('Erreur lors de la mise à jour de la cotisation:', error);
      toast.error('Erreur lors de la mise à jour de la cotisation');
    }
  };

  // Handler pour confirmer les cotisations en batch
  const handleBulkMemberCotisation = async (assignments: MemberAssignment[], cotisationDate: Date) => {
    if (!clubId || assignments.length === 0) return;

    try {
      const batch = writeBatch(db);
      const processedMemberIds = new Set<string>();

      for (const assignment of assignments) {
        const transaction = transactions.find(t => t.id === assignment.transactionId);
        if (!transaction) continue;

        // Mettre à jour le membre (une seule fois par membre)
        if (!processedMemberIds.has(assignment.memberId)) {
          const membreRef = doc(db, 'clubs', clubId, 'members', assignment.memberId);
          const membre = membres.find(m => m.id === assignment.memberId);

          const memberUpdate: Record<string, unknown> = {
            cotisation_validite: Timestamp.fromDate(cotisationDate),
            updated_at: serverTimestamp()
          };

          // Ajouter IBAN seulement si le membre n'en a aucun (évite le cas James/Jacqueline)
          if (assignment.ibanToAdd) {
            const memberHasNoIban = !membre?.iban && (!membre?.ibans || membre.ibans.length === 0);
            if (memberHasNoIban) {
              // Ajouter comme IBAN principal
              memberUpdate.iban = assignment.ibanToAdd.replace(/\s/g, '').toUpperCase();
            }
          }

          batch.update(membreRef, memberUpdate);
          processedMemberIds.add(assignment.memberId);
        }

        // Mettre à jour la transaction
        const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', assignment.transactionId);
        const existingEntities = transaction.matched_entities || [];
        const filteredEntities = existingEntities.filter(e => e.entity_type !== 'member');

        const newEntity = {
          entity_type: 'member' as const,
          entity_id: assignment.memberId,
          entity_name: assignment.memberName,
          cotisation_date: Timestamp.fromDate(cotisationDate)
        };

        batch.update(txRef, {
          matched_entities: [...filteredEntities, newEntity],
          reconcilie: true,
          updated_at: serverTimestamp()
        });
      }

      await batch.commit();

      // Mettre à jour l'état local des transactions
      setTransactions(prev => prev.map(tx => {
        const assignment = assignments.find(a => a.transactionId === tx.id);
        if (!assignment) return tx;

        const existingEntities = tx.matched_entities || [];
        const filteredEntities = existingEntities.filter(e => e.entity_type !== 'member');
        const newEntity = {
          entity_type: 'member' as const,
          entity_id: assignment.memberId,
          entity_name: assignment.memberName,
          cotisation_date: Timestamp.fromDate(cotisationDate)
        };

        return {
          ...tx,
          matched_entities: [...filteredEntities, newEntity],
          reconcilie: true
        };
      }));

      // Mettre à jour l'état local des membres (y compris le nouvel IBAN si ajouté)
      setMembres(prev => prev.map(m => {
        const assignment = assignments.find(a => a.memberId === m.id);
        if (processedMemberIds.has(m.id!)) {
          const updates: Partial<Membre> = { cotisation_validite: cotisationDate };

          // Ajouter l'IBAN seulement si le membre n'en a aucun
          if (assignment?.ibanToAdd) {
            const memberHasNoIban = !m.iban && (!m.ibans || m.ibans.length === 0);
            if (memberHasNoIban) {
              updates.iban = assignment.ibanToAdd.replace(/\s/g, '').toUpperCase();
            }
          }

          return { ...m, ...updates };
        }
        return m;
      }));

      // Fermer le modal et effacer la sélection
      setIsBulkMemberModalOpen(false);
      setSelectedTransactionIds(new Set());

      toast.success(`${processedMemberIds.size} cotisation${processedMemberIds.size > 1 ? 's' : ''} mise${processedMemberIds.size > 1 ? 's' : ''} à jour`);
    } catch (error) {
      logger.error('Erreur lors de la mise à jour des cotisations en batch:', error);
      toast.error('Erreur lors de la mise à jour des cotisations');
    }
  };

  // Handle document upload for a transaction
  const handleAddTransactionDocument = async (transactionId: string, files: FileList) => {
    try {
      const uploadedUrls: string[] = [];

      for (const file of Array.from(files)) {
        // Use justificatifs path which has the correct permissions
        const fileName = `${transactionId}_${Date.now()}_${file.name}`;
        const storageRef = ref(storage, `clubs/${clubId}/justificatifs/${fileName}`);

        // Upload the file
        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);
        uploadedUrls.push(downloadURL);
      }

      // Update the transaction with new document URLs in Firestore
      const transactionRef = doc(db, 'clubs', clubId, 'transactions_bancaires', transactionId);
      const transaction = transactions.find(t => t.id === transactionId);
      const existingDocs = transaction?.urls_justificatifs || [];

      await updateDoc(transactionRef, {
        urls_justificatifs: [...existingDocs, ...uploadedUrls],
        updated_at: serverTimestamp()
      });

      // Update local state
      setTransactions(prev => prev.map(t =>
        t.id === transactionId
          ? { ...t, urls_justificatifs: [...existingDocs, ...uploadedUrls] }
          : t
      ));

      // Update detail view transaction if it's the same one
      if (detailViewTransaction && detailViewTransaction.id === transactionId) {
        setDetailViewTransaction(prev => prev
          ? { ...prev, urls_justificatifs: [...existingDocs, ...uploadedUrls] }
          : null
        );
      }

      toast.success(`${files.length} document${files.length > 1 ? 's' : ''} ajouté${files.length > 1 ? 's' : ''} avec succès`);
    } catch (error) {
      logger.error('Error uploading documents:', error);
      toast.error('Erreur lors du téléversement des documents');
      throw error;
    }
  };

  // Handle document deletion for a transaction
  const handleDeleteTransactionDocument = async (transactionId: string, urlToDelete: string) => {
    try {
      // Delete from Firebase Storage
      try {
        const fileName = decodeURIComponent(urlToDelete.split('/').pop()?.split('?')[0] || '');
        const storageRef = ref(storage, `clubs/${clubId}/justificatifs/${fileName}`);
        await deleteObject(storageRef);
      } catch (storageError) {
        logger.warn('Could not delete file from storage (it may have already been deleted):', storageError);
      }

      // Update the transaction in Firestore
      const transactionRef = doc(db, 'clubs', clubId, 'transactions_bancaires', transactionId);
      const transaction = transactions.find(t => t.id === transactionId);
      const updatedUrls = transaction?.urls_justificatifs?.filter(url => url !== urlToDelete) || [];

      await updateDoc(transactionRef, {
        urls_justificatifs: updatedUrls,
        updated_at: serverTimestamp()
      });

      // Update local state
      setTransactions(prev => prev.map(t =>
        t.id === transactionId
          ? { ...t, urls_justificatifs: updatedUrls }
          : t
      ));

      // Update detail view transaction if it's the same one
      if (detailViewTransaction && detailViewTransaction.id === transactionId) {
        setDetailViewTransaction(prev => prev
          ? { ...prev, urls_justificatifs: updatedUrls }
          : null
        );
      }

      toast.success('Document supprimé avec succès');
    } catch (error) {
      logger.error('Error deleting document:', error);
      toast.error('Erreur lors de la suppression du document');
      throw error;
    }
  };

  // Handle transaction deletion (superadmin only)
  const handleDeleteTransaction = async (transactionId: string) => {
    const transaction = transactions.find(t => t.id === transactionId);
    if (!transaction) return;

    // Double confirmation
    const confirmMessage = `⚠️ ATTENTION: Supprimer définitivement cette transaction ?\n\nN° ${transaction.numero_sequence}\n${transaction.contrepartie_nom}\n${formatMontant(transaction.montant)}\n\nCette action est IRRÉVERSIBLE !`;

    if (!window.confirm(confirmMessage)) return;

    // Second confirmation
    if (!window.confirm('Êtes-vous VRAIMENT sûr ? Cette transaction sera définitivement supprimée.')) return;

    try {
      // Delete from Firestore
      await deleteDoc(doc(db, 'clubs', clubId, 'transactions_bancaires', transactionId));

      // Update local state
      setTransactions(prev => prev.filter(t => t.id !== transactionId));

      // Close detail view if open
      if (detailViewTransaction?.id === transactionId) {
        setDetailViewTransaction(null);
      }

      toast.success('Transaction supprimée avec succès');
    } catch (error) {
      logger.error('Error deleting transaction:', error);
      toast.error('Erreur lors de la suppression de la transaction');
    }
  };

  // Create a reimbursement expense from a bank transaction
  const handleCreateReimbursementFromTransaction = async (transaction: TransactionBancaire) => {
    try {
      // 1. Try to find or create Fournisseur by IBAN (graceful failure - continues without if permissions fail)
      let fournisseurId: string | undefined;
      let fournisseurNom: string | undefined;

      if (transaction.contrepartie_iban && transaction.contrepartie_nom) {
        try {
          // Search existing fournisseurs by IBAN
          const existingFournisseur = await findFournisseurByIban(clubId, transaction.contrepartie_iban);

          if (existingFournisseur) {
            fournisseurId = existingFournisseur.id;
            fournisseurNom = existingFournisseur.nom;
          } else {
            // Create new fournisseur
            const newFournisseurId = await createFournisseur(
              clubId,
              {
                nom: transaction.contrepartie_nom,
                iban: transaction.contrepartie_iban,
              },
              appUser?.id || 'system'
            );
            fournisseurId = newFournisseurId;
            fournisseurNom = transaction.contrepartie_nom;
          }
        } catch (fournisseurError) {
          // Permission error on fournisseurs collection - continue without fournisseur
          // User can manually set the beneficiary in the expense detail view
          logger.warn('Could not access fournisseurs collection, continuing without fournisseur:', fournisseurError);
        }
      }

      // 2. Get linked activity name (if any)
      const linkedActivity = transaction.matched_entities?.find(e => e.entity_type === 'event');
      const activityName = linkedActivity?.entity_name || '';

      // 3. Format communication_qr (max 140 chars) - include activity name if available
      const communicationQr = activityName
        ? `Remb. tr. ${transaction.numero_sequence} - ${activityName}`.substring(0, 140)
        : `Remb. tr. ${transaction.numero_sequence}`.substring(0, 140);

      // 4. Format description with date and activity name
      const dateStr = formatDate(transaction.date_execution);
      const description = activityName
        ? `Remboursement qui annule la transaction ${transaction.numero_sequence} du ${dateStr} - ${activityName}`
        : `Remboursement qui annule la transaction ${transaction.numero_sequence} du ${dateStr}`;

      // 5. Create expense in Firestore
      const demandesRef = collection(db, 'clubs', clubId, 'demandes_remboursement');
      const newDemande = {
        description,
        communication_qr: communicationQr,
        montant: Math.abs(transaction.montant),
        date_depense: transaction.date_execution,
        demandeur_id: appUser?.id,
        demandeur_nom: appUser?.nom || appUser?.displayName || 'Utilisateur',
        demandeur_prenom: appUser?.prenom || '',
        demandeur_email: appUser?.email || '',
        beneficiaire_type: fournisseurId ? 'fournisseur' : 'demandeur',
        fournisseur_id: fournisseurId || null,
        fournisseur_nom: fournisseurNom || null,
        source_transaction_id: transaction.id,
        source_transaction_ref: transaction.numero_sequence,
        statut: 'brouillon',
        club_id: clubId,
        fiscal_year_id: selectedFiscalYear?.id || null,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      };

      const docRef = await addDoc(demandesRef, newDemande);

      // 5. Close detail view and navigate to expenses page
      setDetailViewTransaction(null);
      navigate('/depenses', {
        state: {
          openDemandId: docRef.id,
          fromTransactionId: transaction.id
        }
      });

      toast.success('Demande de remboursement créée en brouillon');
    } catch (error) {
      logger.error('Error creating reimbursement from transaction:', error);
      toast.error('Erreur lors de la création du remboursement');
    }
  };

  // Find duplicate transactions (same numero_sequence)
  const findDuplicateTransactions = (): Map<string, TransactionBancaire[]> => {
    const groups = new Map<string, TransactionBancaire[]>();

    // Group transactions by numero_sequence
    transactions.forEach(tx => {
      const key = tx.numero_sequence;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(tx);
    });

    // Keep only groups with 2 or more transactions
    const duplicates = new Map<string, TransactionBancaire[]>();
    groups.forEach((txList, key) => {
      if (txList.length >= 2) {
        duplicates.set(key, txList);
      }
    });

    return duplicates;
  };

  // Handle find duplicates button click
  const handleFindDuplicates = () => {
    const duplicates = findDuplicateTransactions();

    if (duplicates.size === 0) {
      toast.success('Aucun doublon trouvé ✓', {
        duration: 3000,
        icon: '🎉'
      });
      return;
    }

    setDuplicateGroups(duplicates);
    setShowDuplicatesModal(true);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Floating Return Banner */}
      {returnContext && (
        <div className="fixed top-4 left-6 z-[9999] animate-slide-down">
          <button
            onClick={handleReturnToEntity}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-2xl transition-all hover:shadow-blue-500/50 hover:scale-105 border-2 border-blue-400"
          >
            <ArrowLeft className="h-5 w-5" />
            <span className="font-medium">
              Retour à {returnContext.name}
            </span>
          </button>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text-primary">Transactions bancaires</h1>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-gray-600 dark:text-dark-text-secondary">Gérez et réconciliez les transactions du club</p>
              {/* Bouton Auto-catégoriser - temporairement masqué pour debugging */}
              {/* TODO: Réactiver après debugging du système d'auto-catégorisation */}
              {false && getRole(appUser) === 'superadmin' && selectedTransactionIds.size === 0 && (
                <button
                  onClick={() => setIsAutoCategorizeModalOpen(true)}
                  className="flex items-center gap-1.5 px-2 py-1 text-xs border border-purple-300 dark:border-purple-600 text-purple-600 dark:text-purple-400 rounded hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-colors"
                  title="Auto-catégoriser les transactions sans code comptable"
                >
                  <Sparkles className="h-3 w-3" />
                  Auto-catégoriser
                </button>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <ProtectedAction requireModify>
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 dark:border-dark-border text-gray-600 dark:text-dark-text-secondary rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors"
                title="Importer des transactions depuis un fichier CSV"
              >
                <Upload className="h-3.5 w-3.5" />
                CSV
              </button>
            </ProtectedAction>
          </div>
        </div>
      </div>

      {/* Single Accordion with Tabbed Filters */}
        <FilterAccordionWithTabs
          persistKey="transactions-filters"
          recordsFound={filteredTransactions.length}
          totalRecords={transactions.length}
          onExpandedChange={(expanded) => {
            setIsFilterAccordionOpen(expanded);
            // Clear selection when accordion closes
            if (!expanded) {
              clearSelection();
            }
          }}
          searchBar={
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
              <input
                type="text"
                placeholder="Recherche rapide (contrepartie, communication, numéro, montant, date)..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg focus:ring-1 focus:ring-calypso-blue focus:border-calypso-blue bg-white dark:bg-dark-bg"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          }
          onReset={() => {
            // Reset all filters
            setSearchTerm('');
            setActiveTab('all');
            setReconciliationFilter('all');
            setAccountCodeFilter('all');
            setCategorizationSourceFilter('all');
            setFlaggedFilter('all');
            setAmountFilterType('all');
            setAmountValue1('');
            setAmountValue2('');
            setTransactionStatus('all');
            setHasAttachments('all');
            setParentChildFilter('all');
            setDateRangeFilter({ start: '', end: '' });
            setDateFilterType('execution');
            setCounterpartySearch('');
            setIbanSearch('');
            setCommunicationSearch('');
            setSequenceNumberRange({ start: '', end: '' });
            setLinkedEntityType('all');
            setSpecificAccountCode('');
            setCommentSearch('');
            setSortConfig({ key: null, direction: 'asc' });
            toast.success('Tous les filtres ont été réinitialisés', { duration: 1500 });
          }}
          tabs={[
            {
              id: 'general',
              title: 'Général',
              activeFilters: (activeTab !== 'all' ? 1 : 0) +
                            (reconciliationFilter !== 'all' ? 1 : 0) +
                            (hasAttachments !== 'all' ? 1 : 0) +
                            (parentChildFilter !== 'all' ? 1 : 0) +
                            (accountCodeFilter !== 'all' ? 1 : 0) +
                            (categorizationSourceFilter !== 'all' ? 1 : 0) +
                            (flaggedFilter !== 'all' ? 1 : 0),
              content: (
                <div className="flex gap-2 flex-wrap">
                  {/* All filters on one line */}
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setActiveTab('all')}
                      className={cn(
                        "px-2.5 py-1.5 text-sm rounded-lg transition-colors",
                        activeTab === 'all'
                          ? "bg-calypso-blue text-white"
                          : "border border-gray-300 dark:border-dark-border text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary"
                      )}
                    >
                      Tout ({transactions.length})
                    </button>
                    <button
                      onClick={() => setActiveTab('income')}
                      className={cn(
                        "px-2.5 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1",
                        activeTab === 'income'
                          ? "bg-green-600 text-white"
                          : "border border-gray-300 dark:border-dark-border text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary"
                      )}
                    >
                      <TrendingUp className="h-4 w-4" />
                      Revenus ({transactions.filter(t => t.montant > 0).length})
                    </button>
                    <button
                      onClick={() => setActiveTab('expense')}
                      className={cn(
                        "px-2.5 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1",
                        activeTab === 'expense'
                          ? "bg-red-600 text-white"
                          : "border border-gray-300 dark:border-dark-border text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary"
                      )}
                    >
                      <TrendingDown className="h-4 w-4" />
                      Dépenses ({transactions.filter(t => t.montant < 0).length})
                    </button>
                  </div>

                  <select
                    className="px-2 py-1.5 text-sm border border-gray-300 dark:border-dark-border rounded-lg focus:ring-1 focus:ring-calypso-blue bg-white dark:bg-dark-bg"
                    value={reconciliationFilter}
                    onChange={(e) => setReconciliationFilter(e.target.value as any)}
                  >
                    <option value="all">Réconciliation: Tous</option>
                    <option value="reconciled">✓ Réconciliés</option>
                    <option value="unreconciled">⚠ Non vérifiés</option>
                    <option value="not_found">✗ Pas trouvé</option>
                  </select>

                  <select
                    className="px-2 py-1.5 text-sm border border-gray-300 dark:border-dark-border rounded-lg focus:ring-1 focus:ring-calypso-blue bg-white dark:bg-dark-bg"
                    value={hasAttachments}
                    onChange={(e) => setHasAttachments(e.target.value as any)}
                  >
                    <option value="all">Justificatifs: Tous</option>
                    <option value="with">Avec</option>
                    <option value="without">Sans</option>
                  </select>

                  <select
                    className="px-2 py-1.5 text-sm border border-gray-300 dark:border-dark-border rounded-lg focus:ring-1 focus:ring-calypso-blue bg-white dark:bg-dark-bg"
                    value={parentChildFilter}
                    onChange={(e) => setParentChildFilter(e.target.value as any)}
                  >
                    <option value="all">Structure: Toutes</option>
                    <option value="parent">Parent</option>
                    <option value="child">Enfant</option>
                    <option value="standalone">Simple</option>
                  </select>

                  <select
                    className="px-2 py-1.5 text-sm border border-gray-300 dark:border-dark-border rounded-lg focus:ring-1 focus:ring-calypso-blue bg-white dark:bg-dark-bg"
                    value={accountCodeFilter}
                    onChange={(e) => setAccountCodeFilter(e.target.value as any)}
                  >
                    <option value="all">Code comptable: Tous</option>
                    <option value="with">Avec code</option>
                    <option value="without">Sans code</option>
                  </select>

                  <select
                    className={cn(
                      "px-2 py-1.5 text-sm border rounded-lg focus:ring-1 focus:ring-calypso-blue bg-white dark:bg-dark-bg",
                      categorizationSourceFilter !== 'all'
                        ? "border-purple-400 dark:border-purple-600 text-purple-700 dark:text-purple-400"
                        : "border-gray-300 dark:border-dark-border"
                    )}
                    value={categorizationSourceFilter}
                    onChange={(e) => setCategorizationSourceFilter(e.target.value as any)}
                  >
                    <option value="all">Source: Toutes</option>
                    <option value="manual">👤 Manuel</option>
                    <option value="rules">⚙️ Règles auto</option>
                    <option value="ai">🤖 AI</option>
                    <option value="needs_review">⚠️ À vérifier</option>
                  </select>

                  <select
                    className={cn(
                      "px-2 py-1.5 text-sm border rounded-lg focus:ring-1 focus:ring-calypso-blue bg-white dark:bg-dark-bg",
                      flaggedFilter !== 'all'
                        ? "border-red-400 dark:border-red-600 text-red-700 dark:text-red-400"
                        : "border-gray-300 dark:border-dark-border"
                    )}
                    value={flaggedFilter}
                    onChange={(e) => setFlaggedFilter(e.target.value as any)}
                  >
                    <option value="all">Signalement: Tous</option>
                    <option value="flagged">🚩 Signalées</option>
                    <option value="not_flagged">Non signalées</option>
                  </select>
                </div>
              )
            },
            {
              id: 'classification',
              title: 'Classification',
              activeFilters: (accountCodeFilter !== 'all' ? 1 : 0) +
                            (specificAccountCode ? 1 : 0),
              content: (
                <div className="flex gap-1.5 flex-wrap">
                  <select
                    className="w-auto px-1.5 py-1 text-sm border border-gray-300 dark:border-dark-border rounded focus:ring-1 focus:ring-calypso-blue bg-white dark:bg-dark-bg"
                    value={accountCodeFilter}
                    onChange={(e) => setAccountCodeFilter(e.target.value as any)}
                  >
                    <option value="all">Code: Tous</option>
                    <option value="with">Avec code</option>
                    <option value="without">Sans code</option>
                  </select>

                  <ComboBox
                    options={AccountCodeService.getActiveCodes()
                      .sort((a, b) => a.code.localeCompare(b.code))
                      .map(code => ({
                        value: code.code,
                        label: code.label,
                        type: code.type
                      }))}
                    value={specificAccountCode}
                    onChange={setSpecificAccountCode}
                    placeholder="Code spéc. (730-00-712)"
                    className="w-52"
                    allowFreeText={true}
                    filterOptions={true}
                  />
                </div>
              )
            },
            {
              id: 'financial',
              title: 'Financier',
              activeFilters: (amountFilterType !== 'all' ? 1 : 0) +
                            (dateRangeFilter.start || dateRangeFilter.end ? 1 : 0),
              content: (
                <div className="flex gap-1.5 flex-wrap items-center">
                  {/* Amount and date filters on same line */}
                  <select
                    className="w-auto px-1.5 py-1 text-sm border border-gray-300 dark:border-dark-border rounded focus:ring-1 focus:ring-calypso-blue bg-white dark:bg-dark-bg"
                    value={amountFilterType}
                    onChange={(e) => {
                      setAmountFilterType(e.target.value as any);
                      if (e.target.value === 'all') {
                        setAmountValue1('');
                        setAmountValue2('');
                      }
                    }}
                  >
                    <option value="all">Montant: Tous</option>
                    <option value="equal">=</option>
                    <option value="greater">≥</option>
                    <option value="less">≤</option>
                    <option value="between">Entre</option>
                  </select>

                  {amountFilterType !== 'all' && (
                    <>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="€"
                        className="w-24 px-1.5 py-1 text-sm border border-gray-300 dark:border-dark-border rounded focus:ring-1 focus:ring-calypso-blue bg-white dark:bg-dark-bg"
                        value={amountValue1}
                        onChange={(e) => setAmountValue1(e.target.value)}
                      />
                      {amountFilterType === 'between' && (
                        <>
                          <span className="text-gray-400 dark:text-dark-text-muted text-sm">-</span>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="€"
                            className="w-24 px-1.5 py-1 text-sm border border-gray-300 dark:border-dark-border rounded focus:ring-1 focus:ring-calypso-blue bg-white dark:bg-dark-bg"
                            value={amountValue2}
                            onChange={(e) => setAmountValue2(e.target.value)}
                          />
                        </>
                      )}
                    </>
                  )}

                  <div className="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>

                  <select
                    className="w-auto px-1.5 py-1 text-sm border border-gray-300 dark:border-dark-border rounded focus:ring-1 focus:ring-calypso-blue bg-white dark:bg-dark-bg"
                    value={dateFilterType}
                    onChange={(e) => setDateFilterType(e.target.value as any)}
                  >
                    <option value="execution">Date exec.</option>
                    <option value="valeur">Date val.</option>
                  </select>
                  <input
                    type="date"
                    className="w-auto px-1.5 py-1 text-sm border border-gray-300 dark:border-dark-border rounded focus:ring-1 focus:ring-calypso-blue bg-white dark:bg-dark-bg"
                    value={dateRangeFilter.start}
                    onChange={(e) => setDateRangeFilter({ ...dateRangeFilter, start: e.target.value })}
                  />
                  <span className="text-sm text-gray-500 dark:text-dark-text-muted">-</span>
                  <input
                    type="date"
                    className="w-auto px-1.5 py-1 text-sm border border-gray-300 dark:border-dark-border rounded focus:ring-1 focus:ring-calypso-blue bg-white dark:bg-dark-bg"
                    value={dateRangeFilter.end}
                    onChange={(e) => setDateRangeFilter({ ...dateRangeFilter, end: e.target.value })}
                  />
                </div>
              )
            },
            {
              id: 'entities',
              title: 'Entités',
                activeFilters: (counterpartySearch ? 1 : 0) +
                              (ibanSearch ? 1 : 0) +
                              (communicationSearch ? 1 : 0) +
                              (linkedEntityType !== 'all' ? 1 : 0),
                content: (
                  <div className="flex gap-1.5 flex-wrap">
                    <input
                      type="text"
                      placeholder="Contrepartie"
                      className="w-28 px-1.5 py-1 text-[10px] border border-gray-300 dark:border-dark-border rounded focus:ring-1 focus:ring-calypso-blue bg-white dark:bg-dark-bg"
                      value={counterpartySearch}
                      onChange={(e) => setCounterpartySearch(e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="IBAN"
                      className="w-28 px-1.5 py-1 text-[10px] border border-gray-300 dark:border-dark-border rounded focus:ring-1 focus:ring-calypso-blue bg-white dark:bg-dark-bg"
                      value={ibanSearch}
                      onChange={(e) => setIbanSearch(e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Communication"
                      className="w-32 px-1.5 py-1 text-[10px] border border-gray-300 dark:border-dark-border rounded focus:ring-1 focus:ring-calypso-blue bg-white dark:bg-dark-bg"
                      value={communicationSearch}
                      onChange={(e) => setCommunicationSearch(e.target.value)}
                    />
                    <select
                      className="w-32 px-1.5 py-1 text-[10px] border border-gray-300 dark:border-dark-border rounded focus:ring-1 focus:ring-calypso-blue bg-white dark:bg-dark-bg cursor-pointer relative z-10"
                      value={linkedEntityType}
                      onChange={(e) => {
                        logger.debug('Changing linkedEntityType to:', e.target.value);
                        setLinkedEntityType(e.target.value as any);
                      }}
                    >
                      <option value="all">Liaison: Toutes</option>
                      <option value="membre">Membre</option>
                      <option value="operation">Opération</option>
                      <option value="expense">Dépense</option>
                      <option value="loan">Prêt</option>
                      <option value="inventory">Inventaire</option>
                      <option value="sale">Vente</option>
                      <option value="order">Commande</option>
                    </select>
                  </div>
                )
              },
            {
              id: 'advanced',
              title: 'Avancé',
                activeFilters: (sequenceNumberRange.start || sequenceNumberRange.end ? 1 : 0) +
                              (commentSearch ? 1 : 0),
                content: (
                  <div className="flex gap-1.5 flex-wrap items-center">
                    <div className="flex items-center">
                      <input
                        type="text"
                        placeholder="N° trans. début"
                        className="w-auto px-1.5 py-1 text-sm border border-gray-300 dark:border-dark-border rounded focus:ring-1 focus:ring-calypso-blue bg-white dark:bg-dark-bg"
                        value={sequenceNumberRange.start}
                        onChange={(e) => setSequenceNumberRange({ ...sequenceNumberRange, start: e.target.value })}
                      />
                      <span className="mx-1 text-sm text-gray-500 dark:text-dark-text-muted">-</span>
                      <input
                        type="text"
                        placeholder="N° trans. fin"
                        className="w-auto px-1.5 py-1 text-sm border border-gray-300 dark:border-dark-border rounded focus:ring-1 focus:ring-calypso-blue bg-white dark:bg-dark-bg"
                        value={sequenceNumberRange.end}
                        onChange={(e) => setSequenceNumberRange({ ...sequenceNumberRange, end: e.target.value })}
                      />
                      <Tooltip text="Filtrer par plage de numéros de transaction (comme affiché dans la colonne N° TRANS.). Exemple: 950 à 960 affichera uniquement les transactions numérotées de 2025-00950 à 2025-00960." />
                    </div>
                    <div className="flex items-center">
                      <input
                        type="text"
                        placeholder="Recherche commentaires..."
                        className="w-44 px-1.5 py-1 text-sm border border-gray-300 dark:border-dark-border rounded focus:ring-1 focus:ring-calypso-blue bg-white dark:bg-dark-bg"
                        value={commentSearch}
                        onChange={(e) => setCommentSearch(e.target.value)}
                      />
                      <Tooltip text="Rechercher dans les commentaires et notes des transactions. Tapez un mot-clé pour trouver toutes les transactions contenant ce texte dans leurs commentaires." />
                    </div>
                    {/* Batch filter dropdown */}
                    {availableBatches.length > 0 && (
                      <div className="flex items-center">
                        <select
                          value={batchFilter}
                          onChange={(e) => setBatchFilter(e.target.value)}
                          className="w-52 px-1.5 py-1 text-sm border border-gray-300 dark:border-dark-border rounded focus:ring-1 focus:ring-calypso-blue bg-white dark:bg-dark-bg"
                        >
                          <option value="all">Tous les batchs</option>
                          {availableBatches.map(({ batchId, count, date }) => (
                            <option key={batchId} value={batchId}>
                              {date.toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit', year: 'numeric' })} {date.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })} ({count})
                            </option>
                          ))}
                        </select>
                        <Tooltip text="Filtrer par batch de catégorisation. Chaque fois que vous auto-catégorisez des transactions, elles reçoivent un identifiant de batch commun pour les retrouver facilement." />
                      </div>
                    )}
                  </div>
                )
              }
            ]}
        />


      {/* Table des transactions */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border">
        {/* Barre de sélection simplifiée */}
        {selectedTransactionIds.size > 0 && (
          <div className="px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsBulkEditModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue-dark transition-colors text-sm font-medium"
              >
                <FileText className="h-4 w-4" />
                Modifier
              </button>
              <button
                onClick={clearSelection}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary transition-colors text-sm font-medium"
              >
                <X className="h-4 w-4" />
                Désélectionner tout
              </button>
            </div>
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
              {selectedTransactionIds.size} transaction{selectedTransactionIds.size > 1 ? 's' : ''} sélectionnée{selectedTransactionIds.size > 1 ? 's' : ''}
            </span>
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 mb-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-calypso-blue"></div>
              </div>
              <p className="text-gray-500 dark:text-dark-text-muted">Chargement des transactions...</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-full table-fixed" style={{ width: '100%' }}>
            <thead className="bg-gray-50 dark:bg-dark-bg-tertiary border-b border-gray-200 dark:border-dark-border">
              <tr>
                {/* Checkbox column - only visible when filter accordion is open */}
                {isFilterAccordionOpen && (
                  <th className="w-10 px-2 py-3">
                    <input
                      type="checkbox"
                      checked={selectedTransactionIds.size === sortedTransactions.length && sortedTransactions.length > 0}
                      onChange={() => selectedTransactionIds.size === sortedTransactions.length ? clearSelection() : selectAllFiltered()}
                      className="w-4 h-4 rounded border-gray-300 dark:border-dark-border text-calypso-blue focus:ring-calypso-blue cursor-pointer"
                      title={selectedTransactionIds.size === sortedTransactions.length ? "Tout désélectionner" : "Tout sélectionner"}
                    />
                  </th>
                )}
                <th
                  className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider w-20 cursor-pointer hover:bg-gray-100 dark:bg-dark-bg-tertiary select-none"
                  onClick={() => handleSort('numero_sequence')}
                >
                  <div className="flex items-center gap-1">
                    N°
                    {sortConfig.key === 'numero_sequence' && (
                      <span className="text-calypso-blue">
                        {sortConfig.direction === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </th>
                <th
                  className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider w-24 cursor-pointer hover:bg-gray-100 dark:bg-dark-bg-tertiary select-none"
                  onClick={() => handleSort('date_execution')}
                >
                  <div className="flex items-center gap-1">
                    Date
                    {sortConfig.key === 'date_execution' && (
                      <span className="text-calypso-blue">
                        {sortConfig.direction === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </th>
                <th
                  className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider w-72 cursor-pointer hover:bg-gray-100 dark:bg-dark-bg-tertiary select-none"
                  onClick={() => handleSort('contrepartie_nom')}
                >
                  <div className="flex items-center gap-1">
                    Contrepartie
                    {sortConfig.key === 'contrepartie_nom' && (
                      <span className="text-calypso-blue">
                        {sortConfig.direction === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider w-44">
                  Liaison
                </th>
                <th
                  className="px-2 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider w-24 cursor-pointer hover:bg-gray-100 dark:bg-dark-bg-tertiary select-none"
                  onClick={() => handleSort('code_comptable')}
                >
                  <div className="flex items-center gap-1">
                    CCompt.
                    {sortConfig.key === 'code_comptable' && (
                      <span className="text-calypso-blue">
                        {sortConfig.direction === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </th>
                <th
                  className="px-2 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider w-20 cursor-pointer hover:bg-gray-100 dark:bg-dark-bg-tertiary select-none"
                  onClick={() => handleSort('montant')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Montant
                    {sortConfig.key === 'montant' && (
                      <span className="text-calypso-blue">
                        {sortConfig.direction === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </th>
                <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider w-16">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
              {sortedTransactions.map((transaction) => {
                const transactionSplits = getTransactionSplits(transaction.id);
                const childTransactions = getChildTransactions(transaction.id);
                const isExpanded = expandedTransactions.has(transaction.id);
                const isParent = transaction.is_parent || transaction.is_split;

                return (
                  <React.Fragment key={transaction.id}>
                    {/* Transaction parent ou normale */}
                    <tr
                      id={`tx-${transaction.id}`}
                      className={cn(
                        "hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors cursor-pointer",
                        transaction.flagged_problematic && "bg-red-100 dark:bg-red-900/30 border-l-4 border-red-500 dark:border-red-600",
                        isParent && !transaction.flagged_problematic && "bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-400 dark:border-orange-600",
                        lastViewedTransactionId === transaction.id && !transaction.flagged_problematic && "bg-blue-100 dark:bg-blue-900/30",
                        selectedTransactionIds.has(transaction.id) && !transaction.flagged_problematic && "bg-blue-50 dark:bg-blue-900/20"
                      )}
                      onClick={() => {
                        setLastViewedTransactionId(transaction.id);
                        setDetailViewTransaction(transaction);
                      }}
                    >
                      {/* Checkbox cell - only visible when filter accordion is open, disabled for parent transactions */}
                      {isFilterAccordionOpen && (
                        <td
                          className="w-10 px-2 py-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {!isParent ? (
                            <input
                              type="checkbox"
                              checked={selectedTransactionIds.has(transaction.id)}
                              onChange={() => toggleTransactionSelection(transaction.id)}
                              className="w-4 h-4 rounded border-gray-300 dark:border-dark-border text-calypso-blue focus:ring-calypso-blue cursor-pointer"
                            />
                          ) : (
                            <div className="w-4 h-4" title="Transaction ventilée - sélectionnez les lignes enfants" />
                          )}
                        </td>
                      )}
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-dark-text-primary">
                        <div className="flex items-center gap-1.5">
                          {transaction.flagged_problematic && (
                            <Tooltip content={transaction.flagged_reason || "Signalée comme problématique"}>
                              <span className="inline-flex items-center justify-center w-5 h-5 bg-red-100 dark:bg-red-900/30 rounded-full flex-shrink-0">
                                <AlertTriangle className="h-3 w-3 text-red-600 dark:text-red-400" />
                              </span>
                            </Tooltip>
                          )}
                          <span className={cn("font-mono text-xs", isParent ? "text-orange-700 dark:text-orange-400" : "text-gray-600 dark:text-dark-text-secondary")}>
                            {transaction.numero_sequence || '-'}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-dark-text-primary">
                        <div className="flex items-center space-x-1.5">
                          {isParent && (
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleExpanded(transaction.id); }}
                              className="p-0.5 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded transition-colors"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                              )}
                            </button>
                          )}
                          <span className={cn("text-xs", isParent && "font-semibold")}>{formatDate(transaction.date_execution)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 w-72" title={transaction.communication || ''}>
                        <div className="cursor-default">
                          {/* Contrepartie + Communication sur même ligne */}
                          <div className="flex items-center gap-2">
                            <p className={cn("text-sm font-medium truncate max-w-[250px]", isParent ? "text-orange-900 dark:text-orange-400" : "text-gray-900 dark:text-dark-text-primary")}>
                              {transaction.contrepartie_nom}
                            </p>
                            {isParent && (
                              <span className="inline-flex items-center gap-0.5 px-1 py-0.5 text-xs rounded bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 whitespace-nowrap">
                                <Split className="h-2.5 w-2.5" />
                                Ventilée
                              </span>
                            )}
                          </div>

                          {/* Communication */}
                          <div className="mt-0.5 text-xs text-gray-600 dark:text-dark-text-secondary">
                            <span className={cn("truncate max-w-[250px] block", isParent && "text-gray-500 dark:text-dark-text-muted")}>
                              {transaction.communication}
                            </span>
                          </div>
                        </div>
                      </td>
                      {/* Colonne Liaison */}
                      <td className="px-3 py-2 w-44">
                        {transaction.matched_entities && transaction.matched_entities.length > 0 ? (
                          <div className="space-y-0.5">
                            {transaction.matched_entities.filter(e => e.entity_type === 'event' || e.entity_type === 'operation').slice(0, 2).map((entity, idx) => (
                              <div key={idx} className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400">
                                <span className="truncate max-w-[160px]" title={entity.entity_name}>
                                  📅 {entity.entity_name}
                                </span>
                              </div>
                            ))}
                            {transaction.matched_entities.filter(e => e.entity_type === 'expense' || e.entity_type === 'demand').slice(0, 2).map((entity, idx) => (
                              <div key={idx} className="flex items-center gap-1 text-sm text-orange-600 dark:text-orange-400">
                                <span className="truncate max-w-[160px]" title={entity.entity_name}>
                                  💳 {entity.entity_name}
                                </span>
                              </div>
                            ))}
                            {transaction.matched_entities.filter(e => e.entity_type === 'member').slice(0, 2).map((entity, idx) => (
                              <div key={idx} className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                                <span className="truncate max-w-[160px]" title={entity.entity_name}>
                                  🎫 {entity.entity_name}
                                </span>
                              </div>
                            ))}
                            {transaction.matched_entities.length > 2 && (
                              <span className="text-xs text-gray-400 dark:text-dark-text-muted">
                                +{transaction.matched_entities.length - 2} autre{transaction.matched_entities.length > 3 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400 dark:text-dark-text-muted">-</span>
                        )}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap w-32">
                        <div className="space-y-0.5">
                          {!transaction.is_split && transaction.code_comptable && (
                            <div className="flex flex-col gap-0.5">
                              {/* Libellé du code comptable */}
                              <span className="text-xs text-gray-700 dark:text-dark-text-primary truncate max-w-[120px]" title={AccountCodeService.getByCode(transaction.code_comptable)?.label || ''}>
                                {AccountCodeService.getByCode(transaction.code_comptable)?.label || ''}
                              </span>
                              {/* Code + badges */}
                              <div className="flex items-center gap-1">
                                <span className="px-1.5 py-0.5 text-[10px] font-mono bg-gray-100 dark:bg-dark-bg-tertiary text-gray-500 dark:text-dark-text-muted rounded">
                                  {transaction.code_comptable}
                                </span>
                                {/* Badge source de catégorisation */}
                                {transaction.categorization_source === 'ai' && (
                                  <Tooltip content={transaction.needs_review ? "Catégorisé par AI - À vérifier" : `Catégorisé par AI (${transaction.categorization_confidence || 0}%)`}>
                                    <span className={cn(
                                      "flex items-center gap-0.5 px-1 py-0.5 text-[10px] rounded",
                                      transaction.needs_review
                                        ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400"
                                        : "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400"
                                    )}>
                                      {transaction.needs_review ? <AlertTriangle className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                                    </span>
                                  </Tooltip>
                                )}
                                {transaction.categorization_source === 'rules' && (
                                  <Tooltip content={`Catégorisé par règles (${transaction.categorization_confidence || 0}%)`}>
                                    <span className="flex items-center gap-0.5 px-1 py-0.5 text-[10px] rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                                      <Settings2 className="h-3 w-3" />
                                    </span>
                                  </Tooltip>
                                )}
                              </div>
                            </div>
                          )}
                          {!transaction.is_split && !transaction.code_comptable && transaction.categorie && (
                            <span className="text-xs text-gray-700 dark:text-dark-text-primary">
                              {(() => {
                                const categoryNames: Record<string, string> = {
                                  'sorties_revenu': 'Sorties plongées',
                                  'sorties_depense': 'Sorties plongées',
                                  'cotisations': 'Cotisations',
                                  'evenement': 'Événements',
                                  'assurance': 'Assurances',
                                  'reunion': 'Réunions',
                                  'subsides': 'Subsides',
                                  'frais_bancaires': 'Frais bancaires',
                                  'formation': 'Formation',
                                  'administration': 'Administration',
                                  'piscine': 'Piscine',
                                  'materiel': 'Matériel',
                                  'boutique': 'Boutique',
                                  'activite': 'Activités',
                                  'divers': 'Divers',
                                  'reports': 'Reports',
                                  'bilan': 'Bilan'
                                };
                                return categoryNames[transaction.categorie] || transaction.categorie;
                              })()}
                            </span>
                          )}
                          {!transaction.is_split && !transaction.code_comptable && transaction.code_comptable_not_found && (
                            <Tooltip content="Aucun code comptable approprié trouvé">
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400">
                                <HelpCircle className="h-3 w-3" />
                                Non trouvé
                              </span>
                            </Tooltip>
                          )}
                          {transaction.is_split && (
                            <span className="text-xs text-gray-500 dark:text-dark-text-muted italic">Ventilé</span>
                          )}
                        </div>
                      </td>
                      <td className={cn(
                        "px-2 py-2 whitespace-nowrap text-sm font-semibold text-right w-20",
                        transaction.montant > 0 ? "text-green-600" : "text-red-600"
                      )}>
                        {formatMontant(transaction.montant)}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-center w-16">
                        <div className="flex items-center justify-center gap-1">
                          {/* Icône de statut de réconciliation */}
                          {(() => {
                            const hasEntities = transaction.matched_entities && transaction.matched_entities.length > 0;
                            const status = transaction.statut_reconciliation || 'non_verifie';
                            const isReconciled = hasEntities || status === 'reconcilie';
                            const isNotFound = status === 'pas_trouve' && !hasEntities;

                            return (
                              <div
                                className={cn(
                                  "inline-flex items-center justify-center w-6 h-6 rounded-full",
                                  transaction.is_split || transaction.is_parent
                                    ? "bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-gray-700 text-gray-300 dark:text-dark-text-secondary"
                                    : isReconciled
                                    ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                                    : isNotFound
                                    ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                                    : "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"
                                )}
                                title={
                                  isReconciled ? "Transaction réconciliée"
                                  : isNotFound ? "Pas trouvé - Aucune correspondance"
                                  : "Non vérifié"
                                }
                              >
                                {isReconciled ? "✓" : isNotFound ? "✗" : "⚠"}
                              </div>
                            );
                          })()}

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setLastViewedTransactionId(transaction.id);
                              setDetailViewTransaction(transaction);
                            }}
                            className="p-1 text-gray-400 dark:text-dark-text-muted hover:text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:bg-dark-bg-tertiary rounded transition-colors"
                            title="Voir les détails"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* NOUVEAU: Transactions enfants (remplace les anciens splits) */}
                    {isParent && isExpanded && childTransactions.map((child, index) => (
                      <tr
                        key={child.id}
                        id={`tx-${child.id}`}
                        className={cn(
                          "hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors cursor-pointer",
                          lastViewedTransactionId === child.id && "bg-blue-200 dark:bg-blue-900/40",
                          selectedTransactionIds.has(child.id) && "bg-blue-100 dark:bg-blue-900/30"
                        )}
                        onClick={() => {
                          setLastViewedTransactionId(child.id);
                          setDetailViewTransaction(child);
                        }}
                      >
                        {/* Checkbox pour enfant - visible quand le filtre accordion est ouvert */}
                        {isFilterAccordionOpen && (
                          <td
                            className="w-10 px-2 py-1.5 bg-blue-50/50 dark:bg-blue-900/20"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={selectedTransactionIds.has(child.id)}
                              onChange={() => toggleTransactionSelection(child.id)}
                              className="w-4 h-4 rounded border-blue-300 dark:border-blue-600 text-blue-500 focus:ring-blue-500 cursor-pointer"
                            />
                          </td>
                        )}
                        <td className="px-4 py-1.5 whitespace-nowrap text-sm bg-blue-50/50 dark:bg-blue-900/20">
                          <span className="font-mono text-xs text-blue-600 dark:text-blue-400">
                            {transaction.numero_sequence}_{child.child_index || index + 1}
                          </span>
                        </td>
                        <td className="py-1.5 whitespace-nowrap text-sm bg-white dark:bg-dark-bg-secondary">
                          <div className="flex items-center">
                            <div className="w-12"></div>
                            <div className="flex items-center gap-1 bg-blue-50/50 dark:bg-blue-900/20 px-2 py-1 rounded-l-lg border-l-2 border-blue-300 dark:border-blue-600">
                              <span className="text-blue-500 dark:text-blue-400 text-xs">└─</span>
                              <span className="text-xs text-blue-700 dark:text-blue-300">
                                {child.child_index}/{childTransactions.length}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-1.5 bg-blue-50/50 dark:bg-blue-900/20">
                          <div className="flex items-center gap-2 text-xs">
                            {/* Contrepartie enfant inline */}
                            <span className="font-medium text-gray-900 dark:text-dark-text-primary truncate max-w-xs">
                              {transaction.contrepartie_nom} - {child.contrepartie_nom} /{child.communication}
                            </span>

                            {/* Liaisons enfant inline */}
                            {child.matched_entities && child.matched_entities.length > 0 && (
                              <>
                                <span className="text-gray-300 dark:text-dark-border">•</span>
                                {child.matched_entities.filter(e => e.entity_type === 'event' || e.entity_type === 'operation').map((entity, idx) => (
                                  <span key={idx} className="text-blue-600 dark:text-blue-400 whitespace-nowrap">
                                    📅 {entity.entity_name}
                                  </span>
                                ))}
                                {child.matched_entities.filter(e => e.entity_type === 'expense' || e.entity_type === 'demand').map((entity, idx) => (
                                  <span key={idx} className="text-orange-600 dark:text-orange-400 whitespace-nowrap">
                                    💳 {entity.entity_name}
                                  </span>
                                ))}
                                {child.matched_entities.filter(e => e.entity_type === 'member').map((entity, idx) => (
                                  <span key={idx} className="text-green-600 dark:text-green-400 whitespace-nowrap">
                                    🎫 {entity.entity_name}
                                  </span>
                                ))}
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-1.5 whitespace-nowrap bg-blue-50/50 dark:bg-blue-900/20">
                          <div className="space-y-0.5">
                            {child.code_comptable && (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-xs text-gray-700 dark:text-dark-text-primary truncate max-w-[120px]" title={AccountCodeService.getByCode(child.code_comptable)?.label || ''}>
                                  {AccountCodeService.getByCode(child.code_comptable)?.label || ''}
                                </span>
                                <span className="px-1.5 py-0.5 text-[10px] font-mono bg-gray-100 dark:bg-dark-bg-tertiary text-gray-500 dark:text-dark-text-muted rounded w-fit">
                                  {child.code_comptable}
                                </span>
                              </div>
                            )}
                            {!child.code_comptable && child.categorie && (
                              <span className={cn(
                                "px-1.5 py-0.5 text-xs rounded-full",
                                CATEGORY_COLORS[child.categorie] || CATEGORY_COLORS.autre
                              )}>
                                {CategorizationService.getAllCategories().find(c => c.id === child.categorie)?.nom || child.categorie}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className={cn(
                          "px-4 py-1.5 whitespace-nowrap text-xs font-semibold text-right bg-blue-50/50 dark:bg-blue-900/20",
                          child.montant > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                        )}>
                          {formatMontant(child.montant)}
                        </td>
                        <td className="px-4 py-1.5 whitespace-nowrap text-center bg-blue-50/50 dark:bg-blue-900/20">
                          <div className="flex items-center justify-center gap-2">
                            {/* Icône de statut de réconciliation pour enfant */}
                            {(() => {
                              const hasEntities = child.matched_entities && child.matched_entities.length > 0;
                              const status = child.statut_reconciliation || 'non_verifie';
                              const isReconciled = hasEntities || status === 'reconcilie';
                              const isNotFound = status === 'pas_trouve' && !hasEntities;

                              return (
                                <div
                                  className={cn(
                                    "inline-flex items-center justify-center w-6 h-6 rounded-full",
                                    isReconciled
                                      ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                                      : isNotFound
                                      ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                                      : "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"
                                  )}
                                  title={
                                    isReconciled ? "Transaction réconciliée"
                                    : isNotFound ? "Pas trouvé - Aucune correspondance"
                                    : "Non vérifié"
                                  }
                                >
                                  {isReconciled ? "✓" : isNotFound ? "✗" : "⚠"}
                                </div>
                              );
                            })()}

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setLastViewedTransactionId(child.id);
                                setDetailViewTransaction(child);
                              }}
                              className="p-1 text-gray-400 dark:text-dark-text-muted hover:text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:bg-dark-bg-tertiary rounded transition-colors"
                              title="Voir les détails"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {/* ANCIEN: Lignes de ventilation (pour compatibilité avec anciens splits) */}
                    {transaction.is_split && isExpanded && transactionSplits.length > 0 && transactionSplits.map((split, index) => (
                      <tr key={split.id} className="bg-amber-50/30">
                        <td className="px-6 py-2 text-xs text-gray-400 dark:text-dark-text-muted">-</td>
                        <td className="px-6 py-2 pl-14 text-xs text-gray-600 dark:text-dark-text-secondary">
                          Ancien split {index + 1}
                        </td>
                        <td className="px-6 py-2" colSpan={2}>
                          <p className="text-sm text-gray-700 dark:text-dark-text-primary">{split.description}</p>
                          {split.notes && (
                            <p className="text-xs text-gray-500 dark:text-dark-text-muted">{split.notes}</p>
                          )}
                        </td>
                        <td className="px-6 py-2">
                          <div className="space-y-1">
                            {split.code_comptable && (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-xs text-gray-700 dark:text-dark-text-primary truncate max-w-[120px]" title={AccountCodeService.getByCode(split.code_comptable)?.label || ''}>
                                  {AccountCodeService.getByCode(split.code_comptable)?.label || ''}
                                </span>
                                <span className="px-1.5 py-0.5 text-[10px] font-mono bg-gray-50 dark:bg-dark-bg-tertiary text-gray-500 dark:text-dark-text-muted rounded w-fit">
                                  {split.code_comptable}
                                </span>
                              </div>
                            )}
                            {!split.code_comptable && split.categorie && (
                              <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary">
                                {CategorizationService.getAllCategories().find(c => c.id === split.categorie)?.nom}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className={cn(
                          "px-6 py-2 text-sm font-medium text-right",
                          split.amount > 0 ? "text-green-600" : "text-red-600"
                        )}>
                          {formatMontant(split.amount)}
                        </td>
                        <td className="px-6 py-2 text-center">
                          <button
                            className={cn(
                              "inline-flex items-center justify-center w-6 h-6 rounded-full",
                              split.reconcilie
                                ? "bg-green-100 text-green-600"
                                : "bg-gray-100 dark:bg-dark-bg-tertiary text-gray-400 dark:text-dark-text-muted"
                            )}
                          >
                            {split.reconcilie ? "✓" : "✗"}
                          </button>
                        </td>
                        <td></td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* Modal d'import multi-fichiers */}
      <MultiFileImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={handleMultiFileImport}
        acceptedFormats=".csv"
        title="Importer des transactions bancaires"
      />
      
      {/* Modal de ventilation */}
      {splitModalTransaction && (
        <TransactionSplitModal
          transaction={splitModalTransaction}
          existingSplits={getTransactionSplits(splitModalTransaction.id)}
          childTransactions={getChildTransactions(splitModalTransaction.id)}
          onSave={handleSaveSplits}
          onClose={() => setSplitModalTransaction(null)}
          clubId={clubId}
          operations={operations}
          membres={membres}
        />
      )}
      
      {/* Panel de liaison des opérations */}
      {operationLinkingTransaction && (
        <OperationLinkingPanel
          isOpen={!!operationLinkingTransaction}
          onClose={() => setOperationLinkingTransaction(null)}
          transaction={operationLinkingTransaction}
          operations={operations}
          position={detailViewTransaction ? 'left' : 'right'}
          linkedOperationIds={
            operationLinkingTransaction.matched_entities
              ?.filter(e => e.entity_type === 'event')
              .map(e => e.entity_id) || []
          }
          onLinkOperations={async (operationIds: string[]) => {
            try {
              // Rafraîchir la session AVANT l'écriture pour éviter permission-denied
              if (appUser?.id) {
                await SessionService.ensureValidSession(clubId, appUser.id);
              }

              const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', operationLinkingTransaction.id);

              // Créer les entités liées pour toutes les opérations sélectionnées
              const existingEntities = operationLinkingTransaction.matched_entities || [];
              const newEntities = operationIds.map(operationId => {
                const operation = operations.find(op => op.id === operationId);
                return {
                  entity_type: 'event' as const,
                  entity_id: operationId,
                  entity_name: operation?.titre || 'Activité',
                  confidence: 100,
                  matched_at: new Date(),
                  matched_by: 'manual' as const
                };
              });

              // Fusionner avec les entités existantes (éviter les doublons)
              const allEntities = [...existingEntities, ...newEntities];

              // ✅ Field audit trail voor reconciliatie
              const wasReconciled = operationLinkingTransaction.reconcilie || false;
              const fieldAuditEntry = !wasReconciled ? {
                field: 'reconcilie',
                old_value: false,
                new_value: true,
                changed_by: appUser?.id || '',
                changed_by_name: `${appUser?.prenom || ''} ${appUser?.nom || ''}`.trim() || appUser?.email || 'Unknown',
                changed_at: new Date(),
                was_reconciled: false
              } : null;

              const firestoreUpdates: {
                reconcilie: boolean;
                matched_entities: MatchedEntity[];
                updated_at: ReturnType<typeof serverTimestamp>;
                field_history?: TransactionFieldAudit[];
                fields_modified?: boolean;
              } = {
                reconcilie: true,
                matched_entities: allEntities,
                updated_at: serverTimestamp()
              };

              if (fieldAuditEntry) {
                firestoreUpdates.field_history = [
                  ...(operationLinkingTransaction.field_history || []),
                  fieldAuditEntry
                ];
                firestoreUpdates.fields_modified = true;
              }

              await updateDoc(txRef, firestoreUpdates);

              // Mettre à jour l'état local
              const updatedTransaction = {
                ...operationLinkingTransaction,
                reconcilie: true,
                matched_entities: allEntities,
                ...(fieldAuditEntry && {
                  field_history: [...(operationLinkingTransaction.field_history || []), fieldAuditEntry],
                  fields_modified: true
                })
              };

              setTransactions(prev => prev.map(tx =>
                tx.id === operationLinkingTransaction.id
                  ? updatedTransaction
                  : tx
              ));

              toast.success(`Transaction liée à ${operationIds.length} activité${operationIds.length > 1 ? 's' : ''}`);
              setOperationLinkingTransaction(null);

              // Rouvrir le panneau de détail avec la transaction mise à jour
              setDetailViewTransaction(updatedTransaction);

              loadTransactions();
            } catch (error: any) {
              logger.error('Error linking operations:', error);
              if (error?.code === 'permission-denied') {
                toast.error('Session expirée. Veuillez rafraîchir la page et réessayer.');
              } else {
                toast.error('Erreur lors de la liaison des activités');
              }
            }
          }}
        />
      )}

      {/* Panel de liaison des opérations en masse */}
      <OperationLinkingPanel
        isOpen={isBulkActivityModalOpen}
        onClose={() => setIsBulkActivityModalOpen(false)}
        transaction={null}
        operations={operations}
        linkedOperationIds={[]}
        onLinkOperations={handleBulkActivityLinking}
        bulkMode={true}
        bulkCount={selectedTransactionIds.size}
      />

      {/* Panel de liaison des dépenses */}
      {expenseLinkingTransaction && (
        <ExpenseFromTransactionLinkingPanel
          isOpen={!!expenseLinkingTransaction}
          onClose={() => setExpenseLinkingTransaction(null)}
          transaction={expenseLinkingTransaction}
          expenses={demands}
          linkedExpenseIds={
            expenseLinkingTransaction.matched_entities
              ?.filter(e => e.entity_type === 'expense' || e.entity_type === 'demand')
              .map(e => e.entity_id) || []
          }
          onRefresh={loadDemands}
          onLinkExpenses={async (expenseIds: string[]) => {
            try {
              const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', expenseLinkingTransaction.id);

              // Créer les entités liées pour toutes les dépenses sélectionnées
              const existingEntities = expenseLinkingTransaction.matched_entities || [];
              const newEntities = expenseIds.map(expenseId => {
                const expense = demands.find(d => d.id === expenseId);
                return {
                  entity_type: 'expense' as const,
                  entity_id: expenseId,
                  entity_name: expense?.titre || expense?.description || 'Dépense',
                  confidence: 100,
                  matched_at: new Date(),
                  matched_by: 'manual' as const
                };
              });

              // Fusionner avec les entités existantes
              const allEntities = [...existingEntities, ...newEntities];

              // ✅ Field audit trail voor reconciliatie
              const wasReconciled = expenseLinkingTransaction.reconcilie || false;
              const fieldAuditEntry = !wasReconciled ? {
                field: 'reconcilie',
                old_value: false,
                new_value: true,
                changed_by: appUser?.id || '',
                changed_by_name: `${appUser?.prenom || ''} ${appUser?.nom || ''}`.trim() || appUser?.email || 'Unknown',
                changed_at: new Date(),
                was_reconciled: false
              } : null;

              const txFirestoreUpdates: {
                reconcilie: boolean;
                matched_entities: MatchedEntity[];
                updated_at: ReturnType<typeof serverTimestamp>;
                field_history?: TransactionFieldAudit[];
                fields_modified?: boolean;
              } = {
                reconcilie: true,
                matched_entities: allEntities,
                updated_at: serverTimestamp()
              };

              if (fieldAuditEntry) {
                txFirestoreUpdates.field_history = [
                  ...(expenseLinkingTransaction.field_history || []),
                  fieldAuditEntry
                ];
                txFirestoreUpdates.fields_modified = true;
              }

              await updateDoc(txRef, txFirestoreUpdates);

              // Mettre à jour toutes les demandes de remboursement avec status audit
              const userFullName = `${appUser?.prenom || ''} ${appUser?.nom || ''}`.trim() || appUser?.email || 'Unknown';
              for (const expenseId of expenseIds) {
                const expense = demands.find(d => d.id === expenseId);
                const statusAuditEntry = {
                  old_statut: expense?.statut || 'en_attente_validation',
                  new_statut: 'rembourse',
                  changed_by: appUser?.id || '',
                  changed_by_name: userFullName,
                  changed_at: new Date()
                };

                const demandeRef = doc(db, 'clubs', clubId, 'demandes_remboursement', expenseId);
                await updateDoc(demandeRef, {
                  transaction_id: expenseLinkingTransaction.id,
                  statut: 'rembourse',
                  date_remboursement: new Date(),
                  updated_at: serverTimestamp(),
                  status_history: [...(expense?.status_history || []), statusAuditEntry]
                });
              }

              // Mettre à jour l'état local
              const updatedTransaction = {
                ...expenseLinkingTransaction,
                reconcilie: true,
                matched_entities: allEntities,
                ...(fieldAuditEntry && {
                  field_history: [...(expenseLinkingTransaction.field_history || []), fieldAuditEntry],
                  fields_modified: true
                })
              };

              setTransactions(prev => prev.map(tx =>
                tx.id === expenseLinkingTransaction.id
                  ? updatedTransaction
                  : tx
              ));

              toast.success(`Transaction liée à ${expenseIds.length} dépense${expenseIds.length > 1 ? 's' : ''}`);
              setExpenseLinkingTransaction(null);

              // Rouvrir le panneau de détail avec la transaction mise à jour
              setDetailViewTransaction(updatedTransaction);

              loadTransactions();
              loadDemands();
            } catch (error) {
              logger.error('Error linking expenses:', error);
              toast.error('Erreur lors de la liaison des dépenses');
            }
          }}
        />
      )}
      
      {/* Vue détaillée de la transaction */}
      {detailViewTransaction && (
        <TransactionDetailView
          transaction={detailViewTransaction}
          demands={demands}
          events={operations as unknown as Evenement[]}
          splits={splits}
          childTransactions={getChildTransactions(detailViewTransaction.id)}
          selectedTransactionIds={selectedTransactionIds}
          onBulkCodeAssigned={async () => {
            await loadTransactions();
          }}
          membres={membres}
          isOpen={!!detailViewTransaction}
          onClose={() => {
            if (detailViewTransaction) {
              setLastViewedTransactionId(detailViewTransaction.id);
            }
            closeAllQuickViews();
            setDetailViewTransaction(null);
            setReturnContext(null); // Clear return context
          }}
          onLinkEvent={() => {
            setOperationLinkingTransaction(detailViewTransaction);
            // NE PAS fermer le panneau de détail - il sera rouvert après la liaison
          }}
          onLinkExpense={() => {
            setExpenseLinkingTransaction(detailViewTransaction);
            // NE PAS fermer le panneau de détail - il sera rouvert après la liaison
          }}
          onCreateReimbursement={() => {
            if (detailViewTransaction) {
              handleCreateReimbursementFromTransaction(detailViewTransaction);
            }
          }}
          onUnlink={async (entityId: string) => {
            // Délier une entité (demande, événement ou inscription) de la transaction
            try {
              const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', detailViewTransaction.id);

              // Trouver le type d'entité - chercher dans matched_entities OU legacy link
              const entity = detailViewTransaction.matched_entities?.find(e => e.entity_id === entityId);

              // Vérifier si c'est une demande liée à l'ancienne méthode (transaction_id sur la demande)
              const legacyLinkedDemand = !entity
                ? demands.find(d => d.id === entityId && d.transaction_id === detailViewTransaction.id)
                : null;

              if (!entity && !legacyLinkedDemand) {
                toast.error('Entité non trouvée');
                return;
              }

              // Déterminer le type d'entité
              const entityType = entity?.entity_type || 'expense'; // legacy links are always expenses/demands

              // 1. Supprimer l'entité liée de la transaction (si présente dans matched_entities)
              const updatedEntities = detailViewTransaction.matched_entities?.filter(
                e => e.entity_id !== entityId
              ) || [];

              // Préparer les updates - utiliser deleteField() pour supprimer les champs
              const updates: {
                matched_entities?: MatchedEntity[] | ReturnType<typeof deleteField>;
                reconcilie: boolean;
                updated_at: ReturnType<typeof serverTimestamp>;
                expense_claim_id?: ReturnType<typeof deleteField>;
              } = {
                reconcilie: updatedEntities.length > 0,
                updated_at: serverTimestamp()
              };

              // Seulement mettre à jour matched_entities si l'entité y était présente
              if (entity) {
                updates.matched_entities = updatedEntities.length > 0 ? updatedEntities : deleteField();
              }

              // Si c'est une dépense, supprimer expense_claim_id
              if (entityType === 'expense' || entityType === 'demand') {
                updates.expense_claim_id = deleteField();
              }

              await updateDoc(txRef, updates);

              // 2. Mettre à jour l'entité selon son type
              if (entityType === 'expense' || entityType === 'demand') {
                // Demande de remboursement - supprimer transaction_id et date_remboursement
                const existingDemand = demands.find(d => d.id === entityId);
                const demandeRef = doc(db, 'clubs', clubId, 'demandes_remboursement', entityId);

                // Préparer l'update - ajouter les métadonnées d'approbation si manquantes
                // (requis par les règles Firestore quand statut = 'approuve')
                const demandUpdate: Record<string, unknown> = {
                  transaction_id: deleteField(),
                  statut: 'approuve',
                  date_remboursement: deleteField(),
                  updated_at: serverTimestamp()
                };

                // Si les métadonnées d'approbation manquent, les ajouter avec l'utilisateur actuel
                if (!existingDemand?.approuve_par) {
                  demandUpdate.approuve_par = appUser?.id || null;
                  demandUpdate.approuve_par_nom = `${appUser?.prenom || ''} ${appUser?.nom || ''}`.trim() || appUser?.email || 'Unknown';
                  demandUpdate.date_approbation = serverTimestamp();
                }

                await updateDoc(demandeRef, demandUpdate);

                setDemands(prev => prev.map(d =>
                  d.id === entityId
                    ? { ...d, transaction_id: null, statut: 'approuve' as const, date_remboursement: null }
                    : d
                ));
                toast.success('Dépense déliée de la transaction');
              } else if (entityType === 'event') {
                // Événement - juste retirer de matched_entities
                toast.success('Événement délié de la transaction');
              } else if (entityType === 'inscription') {
                // Inscription - utiliser le service d'inscription
                // Note: Nécessite eventId, on ne peut pas le faire ici sans plus d'infos
                toast.success('Inscription déliée de la transaction');
              }

              // 3. Mettre à jour l'état local des transactions
              const updatedTransaction = {
                ...detailViewTransaction,
                matched_entities: updatedEntities.length > 0 ? updatedEntities : undefined,
                reconcilie: updatedEntities.length > 0
              };

              // Si c'est une dépense, supprimer expense_claim_id
              if (entityType === 'expense' || entityType === 'demand') {
                delete (updatedTransaction as any).expense_claim_id;
              }

              setTransactions(prev => prev.map(tx => {
                if (tx.id !== detailViewTransaction.id) return tx;
                return updatedTransaction;
              }));

              // Mettre à jour la vue détaillée pour refléter les changements immédiatement
              setDetailViewTransaction(updatedTransaction);

              // Recharger les données en arrière-plan pour assurer la cohérence
              loadTransactions();
              loadDemands();
            } catch (error) {
              logger.error('Error unlinking entity:', error);
              toast.error('Erreur lors de la déliaison');
            }
          }}
          onUnlinkEvent={async (eventId: string) => {
            // Délier un événement de la transaction (alias pour onUnlink)
            try {
              const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', detailViewTransaction.id);

              // Supprimer l'entité liée de la transaction
              const updatedEntities = detailViewTransaction.matched_entities?.filter(
                e => e.entity_id !== eventId
              ) || [];

              const eventUpdates: {
                matched_entities: MatchedEntity[] | ReturnType<typeof deleteField>;
                reconcilie: boolean;
                updated_at: ReturnType<typeof serverTimestamp>;
              } = {
                matched_entities: updatedEntities.length > 0 ? updatedEntities : deleteField(),
                reconcilie: updatedEntities.length > 0,
                updated_at: serverTimestamp()
              };

              await updateDoc(txRef, eventUpdates);

              // Mettre à jour l'état local
              const updatedTransaction = {
                ...detailViewTransaction,
                matched_entities: updatedEntities.length > 0 ? updatedEntities : undefined,
                reconcilie: updatedEntities.length > 0
              };

              setTransactions(prev => prev.map(tx => {
                if (tx.id === detailViewTransaction.id) {
                  return updatedTransaction;
                }
                return tx;
              }));

              // Mettre à jour la vue détaillée pour refléter les changements immédiatement
              setDetailViewTransaction(updatedTransaction);

              toast.success('Événement délié');
              loadTransactions();
            } catch (error) {
              logger.error('Error unlinking event:', error);
              toast.error('Erreur lors de la déliaison de l\'événement');
            }
          }}
          onSplit={() => {
            // NOUVEAU : Vérifications de sécurité avant modification
            if (detailViewTransaction.is_parent || detailViewTransaction.is_split) {
              const children = getChildTransactions(detailViewTransaction.id);
              const linkedChildren = children.filter(c => c.matched_entities && c.matched_entities.length > 0);
              const reconciledChildren = children.filter(c => c.reconcilie);

              if (linkedChildren.length > 0 || reconciledChildren.length > 0) {
                const warnings: string[] = [];
                if (reconciledChildren.length > 0) {
                  warnings.push(`${reconciledChildren.length} ligne(s) réconciliée(s)`);
                }
                if (linkedChildren.length > 0) {
                  warnings.push(`${linkedChildren.length} ligne(s) liée(s) à des événements/dépenses`);
                }

                const confirmed = window.confirm(
                  `⚠️ ATTENTION : Cette ventilation contient:\n\n${warnings.join('\n')}\n\n` +
                  `La modification supprimera ces lignes et créera de nouvelles lignes.\n` +
                  `Les liens et réconciliations seront perdus.\n\n` +
                  `Voulez-vous vraiment continuer ?`
                );

                if (!confirmed) {
                  return;
                }
              }
            }

            setSplitModalTransaction(detailViewTransaction);
            setDetailViewTransaction(null);
          }}
          onNavigateToEvent={(eventId) => {
            const operation = getOperationById(eventId);
            if (operation) {
              openQuickView({ kind: 'operation', operation });
              return;
            }

            navigate('/operations', { state: { openEventId: eventId, fromTransactionId: detailViewTransaction.id } });
          }}
          onNavigateToDemand={(demandId) => {
            const demand = getDemandById(demandId);
            if (demand) {
              openQuickView({ kind: 'demand', demand });
              return;
            }

            navigate('/depenses', { state: { openDemandId: demandId, fromTransactionId: detailViewTransaction.id } });
          }}
          onLinkMember={() => {
            setIsMemberPanelOpen(true);
          }}
          onUnlinkMember={async (memberId: string) => {
            try {
              const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', detailViewTransaction.id);

              // Supprimer l'entité membre de la transaction
              const updatedEntities = detailViewTransaction.matched_entities?.filter(
                e => !(e.entity_type === 'member' && e.entity_id === memberId)
              ) || [];

              const memberUpdates: {
                matched_entities: MatchedEntity[] | ReturnType<typeof deleteField>;
                reconcilie: boolean;
                updated_at: ReturnType<typeof serverTimestamp>;
              } = {
                matched_entities: updatedEntities.length > 0 ? updatedEntities : deleteField(),
                reconcilie: updatedEntities.length > 0,
                updated_at: serverTimestamp()
              };

              await updateDoc(txRef, memberUpdates);

              // Mettre à jour l'état local
              const updatedTransaction = {
                ...detailViewTransaction,
                matched_entities: updatedEntities.length > 0 ? updatedEntities : undefined,
                reconcilie: updatedEntities.length > 0
              };

              setTransactions(prev => prev.map(tx => {
                if (tx.id === detailViewTransaction.id) {
                  return updatedTransaction;
                }
                return tx;
              }));

              setDetailViewTransaction(updatedTransaction);
              toast.success('Membre délié');
              loadTransactions();
            } catch (error) {
              logger.error('Error unlinking member:', error);
              toast.error('Erreur lors de la déliaison du membre');
            }
          }}
          onNavigateToMember={(memberId) => {
            setDetailViewTransaction(null);
            navigate('/membres', { state: { openMemberId: memberId } });
          }}
          onUpdateTransaction={async (updates) => {
            try {
              const transactionRef = doc(db, 'clubs', clubId, 'transactions_bancaires', detailViewTransaction.id);

              // Helper voor field audit trail - use null instead of undefined for Firestore compatibility
              const createFieldAuditEntry = (field: string, oldValue: unknown, newValue: unknown): TransactionFieldAudit => ({
                field,
                old_value: oldValue ?? null,
                new_value: newValue ?? null,
                changed_by: appUser?.id || '',
                changed_by_name: `${appUser?.prenom || ''} ${appUser?.nom || ''}`.trim() || appUser?.email || 'Unknown',
                changed_at: new Date(),
                was_reconciled: detailViewTransaction.reconcilie || false
              });

              // Si on efface le code comptable (chaîne vide), supprimer tous les champs de catégorisation
              if (updates.code_comptable === '') {
                // Créer l'entrée audit trail pour la suppression
                const deleteAuditEntry = {
                  code_comptable: '',
                  categorie: '',
                  assigned_by: appUser?.id || 'unknown',
                  assigned_by_name: `${appUser?.prenom || ''} ${appUser?.nom || ''}`.trim() || appUser?.email || 'Utilisateur inconnu',
                  assigned_at: new Date(),
                  previous_code: detailViewTransaction.code_comptable,
                  previous_categorie: detailViewTransaction.categorie,
                  source: 'manual_delete' as const
                };

                const updatedHistory = [
                  ...(detailViewTransaction.code_comptable_history || []),
                  deleteAuditEntry
                ];

                await updateDoc(transactionRef, {
                  code_comptable: deleteField(),
                  categorie: deleteField(),
                  categorization_source: deleteField(),
                  categorization_confidence: deleteField(),
                  needs_review: deleteField(),
                  code_comptable_history: updatedHistory,
                  updated_at: serverTimestamp()
                });

                // Mettre à jour la transaction dans la liste locale
                const clearedUpdates = {
                  code_comptable: undefined,
                  categorie: undefined,
                  categorization_source: undefined,
                  categorization_confidence: undefined,
                  needs_review: undefined,
                  code_comptable_history: updatedHistory
                };
                setTransactions(prev =>
                  prev.map(t => t.id === detailViewTransaction.id
                    ? { ...t, ...clearedUpdates }
                    : t
                  )
                );
                setDetailViewTransaction(prev => prev ? { ...prev, ...clearedUpdates } : null);
                toast.success('Code comptable supprimé');
              } else {
                // ✅ Field audit trail voor kritieke velden
                const fieldsToAudit = ['contrepartie_nom', 'categorie', 'reconcilie'];
                const auditEntries: TransactionFieldAudit[] = [];

                for (const field of fieldsToAudit) {
                  if (field in updates && updates[field as keyof typeof updates] !== detailViewTransaction[field as keyof TransactionBancaire]) {
                    auditEntries.push(createFieldAuditEntry(
                      field,
                      detailViewTransaction[field as keyof TransactionBancaire],
                      updates[field as keyof typeof updates]
                    ));
                  }
                }

                // Remove undefined values - Firestore doesn't accept undefined
                const cleanedUpdates = Object.fromEntries(
                  Object.entries(updates).filter(([_, value]) => value !== undefined)
                );

                const firestoreUpdates: Record<string, unknown> & { updated_at: ReturnType<typeof serverTimestamp> } = {
                  ...cleanedUpdates,
                  updated_at: serverTimestamp()
                };

                // Voeg audit history toe als er geaudite wijzigingen zijn
                if (auditEntries.length > 0) {
                  firestoreUpdates.field_history = [
                    ...(detailViewTransaction.field_history || []),
                    ...auditEntries
                  ];
                  firestoreUpdates.fields_modified = true;
                }

                await updateDoc(transactionRef, firestoreUpdates);

                // Mettre à jour la transaction dans la liste locale
                const localUpdates = {
                  ...updates,
                  ...(auditEntries.length > 0 && {
                    field_history: [...(detailViewTransaction.field_history || []), ...auditEntries],
                    fields_modified: true
                  })
                };

                setTransactions(prev =>
                  prev.map(t => t.id === detailViewTransaction.id
                    ? { ...t, ...localUpdates }
                    : t
                  )
                );
                // Mettre à jour la transaction dans le modal
                setDetailViewTransaction(prev => prev ? { ...prev, ...localUpdates } : null);

                // Message de succès spécifique selon le type de mise à jour
                if (updates.commentaire !== undefined) {
                  toast.success('Commentaire mis à jour');
                } else if (updates.categorie || updates.code_comptable) {
                  toast.success('Catégorisation mise à jour');
                } else {
                  toast.success('Transaction mise à jour');
                }
              }
            } catch (error) {
              logger.error('Error updating transaction:', error);
              toast.error('Erreur lors de la mise à jour de la transaction');
            }
          }}
          onUpdateChildTransaction={async (childId: string, updates: Partial<TransactionBancaire>) => {
            try {
              // Remove undefined values - Firestore doesn't accept undefined
              const cleanedUpdates = Object.fromEntries(
                Object.entries(updates).filter(([_, value]) => value !== undefined)
              );

              // Mettre à jour dans Firestore
              const childRef = doc(db, 'clubs', clubId, 'transactions_bancaires', childId);
              await updateDoc(childRef, {
                ...cleanedUpdates,
                updated_at: serverTimestamp()
              });

              // Mettre à jour dans l'état local
              setTransactions(prev =>
                prev.map(t => t.id === childId
                  ? { ...t, ...updates }
                  : t
                )
              );

              toast.success('✓ Sauvegardé', {
                duration: 1500,
                position: 'bottom-right'
              });
            } catch (error) {
              logger.error('Error updating child transaction:', error);
              toast.error('Erreur lors de la sauvegarde');
            }
          }}
          onAddDocument={async (files) => {
            await handleAddTransactionDocument(detailViewTransaction.id, files);
          }}
          onDeleteDocument={async (url) => {
            await handleDeleteTransactionDocument(detailViewTransaction.id, url);
          }}
          onDelete={async () => {
            await handleDeleteTransaction(detailViewTransaction.id);
          }}
          navigationPosition={getNavigationPosition(sortedTransactions, detailViewTransaction)}
          onNavigatePrevious={() => {
            const currentIndex = sortedTransactions.findIndex(t => t.id === detailViewTransaction.id);
            if (currentIndex > 0) {
              setDetailViewTransaction(sortedTransactions[currentIndex - 1]);
            } else {
              // Wrap to end
              setDetailViewTransaction(sortedTransactions[sortedTransactions.length - 1]);
            }
          }}
          onNavigateNext={() => {
            const currentIndex = sortedTransactions.findIndex(t => t.id === detailViewTransaction.id);
            if (currentIndex < sortedTransactions.length - 1) {
              setDetailViewTransaction(sortedTransactions[currentIndex + 1]);
            } else {
              // Wrap to start
              setDetailViewTransaction(sortedTransactions[0]);
            }
          }}
          returnContext={returnContext}
          onOpenContext={returnContext ? () => {
            setDetailViewTransaction(null);
            if (returnContext.type === 'event' || returnContext.type === 'operation') {
              navigate('/operations', { state: { openEventId: returnContext.id } });
              return;
            }

            if (returnContext.type === 'expense' || returnContext.type === 'demand') {
              navigate('/depenses', { state: { openDemandId: returnContext.id } });
              return;
            }

            navigate('/transactions', { state: { selectedTransactionId: detailViewTransaction.id } });
          } : undefined}
          contextActionLabel={returnContext ? `Retour à ${returnContext.name}` : undefined}
        />
      )}

      {quickViews.map((quickView, index) => {
        const stackLevel = index + 2;

        if (quickView.kind === 'transaction') {
          return (
            <TransactionDetailView
              key={`quick-transaction-${quickView.transaction.id}-${index}`}
              transaction={quickView.transaction}
              demands={demands}
              events={operations as unknown as Evenement[]}
              splits={splits}
              childTransactions={getChildTransactions(quickView.transaction.id)}
              membres={membres}
              isOpen={true}
              stackLevel={stackLevel}
              onClose={() => closeQuickViewsFrom(index)}
              onNavigateToEvent={(eventId) => {
                const operation = getOperationById(eventId);
                if (operation) {
                  openQuickView({ kind: 'operation', operation });
                  return;
                }

                navigate('/operations', { state: { openEventId: eventId } });
              }}
              onNavigateToDemand={(demandId) => {
                const demand = getDemandById(demandId);
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
          return (
            <DemandeDetailView
              key={`quick-demand-${quickView.demand.id}-${index}`}
              demand={quickView.demand}
              linkedTransactions={transactions.filter(transaction =>
                transaction.id === quickView.demand.transaction_id ||
                transaction.matched_entities?.some(entity =>
                  (entity.entity_type === 'expense' || entity.entity_type === 'demand') && entity.entity_id === quickView.demand.id
                )
              )}
              evenements={operations as unknown as Evenement[]}
              membres={membres}
              isOpen={true}
              stackLevel={stackLevel}
              onClose={() => closeQuickViewsFrom(index)}
              onViewTransaction={(transaction) => {
                openQuickView({ kind: 'transaction', transaction });
              }}
              onViewOperation={(operation) => {
                openQuickView({ kind: 'operation', operation: operation as unknown as Operation });
              }}
              onOpenContext={() => {
                navigate('/depenses', { state: { openDemandId: quickView.demand.id } });
              }}
              contextActionLabel="Aller aux dépenses"
            />
          );
        }

        return (
          <OperationDetailView
            key={`quick-operation-${quickView.operation.id}-${index}`}
            operation={quickView.operation}
            linkedTransactions={getLinkedTransactionsForOperation(quickView.operation.id)}
            linkedDemands={getLinkedDemandsForOperation(quickView.operation.id)}
            linkedInscriptions={[]}
            isOpen={true}
            stackLevel={stackLevel}
            onClose={() => closeQuickViewsFrom(index)}
            onViewTransaction={(transaction) => {
              openQuickView({ kind: 'transaction', transaction });
            }}
            onViewDemand={(demand) => {
              openQuickView({ kind: 'demand', demand });
            }}
            onOpenContext={() => {
              navigate('/operations', { state: { openEventId: quickView.operation.id } });
            }}
            contextActionLabel="Aller aux activités"
          />
        );
      })}

      {/* Duplicates Modal */}
      {showDuplicatesModal && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => setShowDuplicatesModal(false)}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col">
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border flex items-center justify-between bg-orange-50 dark:bg-orange-900/20">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg text-orange-600 dark:text-orange-400 text-xl">
                    ⚠
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary">
                      Transactions en double trouvées
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                      {duplicateGroups.size} groupe{duplicateGroups.size > 1 ? 's' : ''} de doublons détecté{duplicateGroups.size > 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDuplicatesModal(false)}
                  className="p-2 hover:bg-gray-200 dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body - Scrollable */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {Array.from(duplicateGroups.entries()).map(([numeroSequence, txList]) => (
                  <div
                    key={numeroSequence}
                    className="border-l-4 border-orange-500 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-bold text-gray-900 dark:text-dark-text-primary">
                        N° {numeroSequence}
                      </h3>
                      <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-xs font-medium rounded">
                        {txList.length} transactions
                      </span>
                    </div>

                    <div className="space-y-2">
                      {txList.map((tx, index) => (
                        <div
                          key={tx.id}
                          className={cn(
                            'flex items-center justify-between p-3 rounded-lg',
                            index % 2 === 0 ? 'bg-white dark:bg-dark-bg-secondary' : 'bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-dark-bg-primary'
                          )}
                        >
                          <div className="flex-1 grid grid-cols-3 gap-4">
                            <div>
                              <p className="text-xs text-gray-500 dark:text-dark-text-muted">Date</p>
                              <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                                {formatDate(tx.date_execution)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 dark:text-dark-text-muted">Contrepartie</p>
                              <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary truncate">
                                {tx.contrepartie_nom}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 dark:text-dark-text-muted">Montant</p>
                              <p className={cn(
                                'text-sm font-bold',
                                tx.montant >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                              )}>
                                {formatMontant(tx.montant)}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 ml-4">
                            {tx.reconcilie && (
                              <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium rounded">
                                Réconcilié
                              </span>
                            )}
                            <button
                              onClick={() => {
                                setDetailViewTransaction(tx);
                                // Ne pas fermer le modal pour permettre de revenir
                              }}
                              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Voir
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary flex justify-end">
                <button
                  onClick={() => setShowDuplicatesModal(false)}
                  className="px-4 py-2 bg-gray-200 dark:bg-dark-bg-primary text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-300 dark:hover:bg-dark-bg-secondary transition-colors font-medium"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal de bewerking in bulk - nieuwe aanpak */}
      <BulkEditModal
        isOpen={isBulkEditModalOpen}
        onClose={() => setIsBulkEditModalOpen(false)}
        transactions={transactions.filter(t => selectedTransactionIds.has(t.id))}
        operations={operations}
        membres={membres}
        clubId={clubId || ''}
        onAssignCode={handleBulkCodeAssignment}
        onAssignActivities={handleBulkActivityLinking}
        onLinkMembers={handleBulkMemberCotisation}
        onClearSelection={clearSelection}
      />

      {/* Modal de sélection de code comptable en masse (legacy - behouden als fallback) */}
      <AccountCodeSelectorModal
        isOpen={isBulkCodeModalOpen}
        onClose={() => setIsBulkCodeModalOpen(false)}
        onSelect={handleBulkCodeAssignment}
        isExpense={true}
        clubId={clubId}
        allowClear={true}
      />

      {/* Modal d'auto-catégorisation */}
      {isAutoCategorizeModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-500" />
                  Auto-catégorisation intelligente
                </h2>
                <button
                  onClick={() => {
                    setIsAutoCategorizeModalOpen(false);
                    setAutoCategorizeResult(null);
                  }}
                  className="text-gray-400 dark:text-dark-text-muted hover:text-gray-600 dark:text-dark-text-secondary dark:hover:text-gray-300"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {!autoCategorizeResult ? (
                <>
                  {/* Info avant lancement */}
                  <div className="space-y-4">
                    <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                      <p className="text-sm text-purple-700 dark:text-purple-300 mb-3">
                        Cette fonction va analyser les transactions et tenter de les catégoriser automatiquement avec les règles apprises.
                      </p>
                      <div className="space-y-2 text-xs text-purple-600 dark:text-purple-400">
                        <div className="flex items-center gap-2">
                          <Settings2 className="h-4 w-4" />
                          <span><strong>Règles classiques</strong> : IBAN, mots-clés, contrepartie</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Bot className="h-4 w-4" />
                          <span><strong>AI (Claude)</strong> : fallback pour les cas difficiles</span>
                        </div>
                      </div>
                    </div>

                    {/* Stats des transactions */}
                    <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4">
                      <div className="text-sm text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">
                        <p><strong>{transactions.filter(t => !t.code_comptable && !t.is_parent).length}</strong> transactions sans code comptable</p>
                        <p><strong>{transactions.filter(t => t.code_comptable && !t.is_parent).length}</strong> transactions déjà catégorisées</p>
                        <p className="text-xs mt-1 text-gray-500 dark:text-dark-text-muted">
                          (Total: {transactions.filter(t => !t.is_parent).length} transactions)
                        </p>
                      </div>
                    </div>

                    {/* Options de configuration */}
                    <div className="space-y-3">
                      {/* Portée : quelles transactions traiter */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-2">
                          Quelles transactions analyser ?
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {/* Option Sélectionnées - visible seulement si des transactions sont sélectionnées */}
                          {selectedTransactionIds.size > 0 && (
                            <button
                              onClick={() => setAutoCategorizeScope('selected')}
                              className={cn(
                                "px-3 py-1.5 text-sm rounded-lg transition-colors",
                                autoCategorizeScope === 'selected'
                                  ? "bg-purple-600 text-white"
                                  : "border border-purple-300 dark:border-purple-500 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                              )}
                            >
                              Sélectionnées ({selectedTransactionIds.size})
                            </button>
                          )}
                          <button
                            onClick={() => setAutoCategorizeScope('uncategorized')}
                            className={cn(
                              "px-3 py-1.5 text-sm rounded-lg transition-colors",
                              autoCategorizeScope === 'uncategorized'
                                ? "bg-purple-600 text-white"
                                : "border border-gray-300 dark:border-dark-border text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary"
                            )}
                          >
                            Sans code ({transactions.filter(t => !t.code_comptable && !t.is_parent).length})
                          </button>
                          <button
                            onClick={() => setAutoCategorizeScope('all')}
                            className={cn(
                              "px-3 py-1.5 text-sm rounded-lg transition-colors",
                              autoCategorizeScope === 'all'
                                ? "bg-purple-600 text-white"
                                : "border border-gray-300 dark:border-dark-border text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary"
                            )}
                          >
                            Toutes ({transactions.filter(t => !t.is_parent).length})
                          </button>
                        </div>
                        {autoCategorizeScope === 'all' && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                            ⚠️ Les codes comptables existants seront remplacés si une règle correspond
                          </p>
                        )}
                        {autoCategorizeScope === 'selected' && (
                          <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                            Seules les {selectedTransactionIds.size} transactions sélectionnées seront traitées
                          </p>
                        )}
                      </div>

                      {/* Nombre de transactions */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-2">
                          Combien de transactions traiter ?
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {(['5', '10', '20', '50', 'all'] as const).map((limit) => (
                            <button
                              key={limit}
                              onClick={() => setAutoCategorizeLimit(limit)}
                              className={cn(
                                "px-3 py-1.5 text-sm rounded-lg transition-colors",
                                autoCategorizeLimit === limit
                                  ? "bg-purple-600 text-white"
                                  : "border border-gray-300 dark:border-dark-border text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary"
                              )}
                            >
                              {limit === 'all' ? 'Toutes' : limit}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
                          {autoCategorizeLimit === 'all'
                            ? `Toutes les ${autoCategorizeScope === 'uncategorized'
                                ? transactions.filter(t => !t.code_comptable && !t.is_parent).length
                                : transactions.filter(t => !t.is_parent).length} transactions seront traitées`
                            : `Les ${autoCategorizeLimit} premières transactions seront traitées`
                          }
                        </p>
                      </div>

                      {/* Option AI */}
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id="useAiFallback"
                          checked={autoCategorizeUseAi}
                          onChange={(e) => setAutoCategorizeUseAi(e.target.checked)}
                          className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 dark:border-dark-border rounded"
                        />
                        <label htmlFor="useAiFallback" className="text-sm text-gray-700 dark:text-dark-text-primary dark:text-gray-300">
                          Utiliser l'AI pour les transactions non reconnues par les règles
                        </label>
                      </div>
                    </div>

                    {/* Avertissement coût AI */}
                    {autoCategorizeUseAi && (
                      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            Les transactions non reconnues par les règles seront envoyées à l'AI (coût estimé: ~0.01€/transaction).
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Boutons */}
                  <div className="flex justify-between mt-6">
                    {/* Bouton supprimer les codes - à gauche */}
                    <button
                      onClick={async () => {
                        // Déterminer quelles transactions traiter
                        let toProcess: typeof transactions;
                        if (autoCategorizeScope === 'selected') {
                          toProcess = transactions.filter(t =>
                            selectedTransactionIds.has(t.id) && t.code_comptable && !t.is_parent
                          );
                        } else if (autoCategorizeScope === 'all') {
                          toProcess = transactions.filter(t => t.code_comptable && !t.is_parent);
                        } else {
                          // uncategorized - pas de sens de supprimer
                          toProcess = [];
                        }

                        if (toProcess.length === 0) {
                          toast.error('Aucune transaction avec un code comptable à supprimer');
                          return;
                        }

                        try {
                          const batch = writeBatch(db);
                          for (const tx of toProcess) {
                            const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', tx.id);
                            batch.update(txRef, {
                              code_comptable: deleteField(),
                              categorie: deleteField(),
                              categorization_source: deleteField(),
                              categorization_confidence: deleteField(),
                              categorization_batch_id: deleteField()
                            });
                          }
                          await batch.commit();
                          await loadTransactions();
                          toast.success(`${toProcess.length} code(s) comptable(s) supprimé(s)`);
                          setIsAutoCategorizeModalOpen(false);
                        } catch (error) {
                          logger.error('Error deleting codes:', error);
                          toast.error('Erreur lors de la suppression');
                        }
                      }}
                      disabled={
                        autoCategorizeScope === 'uncategorized' ||
                        (autoCategorizeScope === 'selected' && transactions.filter(t => selectedTransactionIds.has(t.id) && t.code_comptable && !t.is_parent).length === 0) ||
                        (autoCategorizeScope === 'all' && transactions.filter(t => t.code_comptable && !t.is_parent).length === 0)
                      }
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                        autoCategorizeScope === 'uncategorized' ||
                        (autoCategorizeScope === 'selected' && transactions.filter(t => selectedTransactionIds.has(t.id) && t.code_comptable && !t.is_parent).length === 0) ||
                        (autoCategorizeScope === 'all' && transactions.filter(t => t.code_comptable && !t.is_parent).length === 0)
                          ? "bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-800 text-gray-400 dark:text-dark-text-muted cursor-not-allowed"
                          : "border border-red-300 dark:border-red-600 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                      )}
                      title={autoCategorizeScope === 'uncategorized' ? "Sélectionnez 'Toutes' ou 'Sélectionnées' pour pouvoir supprimer les codes" : "Supprimer les codes comptables"}
                    >
                      <Trash2 className="h-4 w-4" />
                      Supprimer les codes
                      {autoCategorizeScope === 'selected' && (
                        <span className="text-xs">
                          ({transactions.filter(t => selectedTransactionIds.has(t.id) && t.code_comptable && !t.is_parent).length})
                        </span>
                      )}
                      {autoCategorizeScope === 'all' && (
                        <span className="text-xs">
                          ({transactions.filter(t => t.code_comptable && !t.is_parent).length})
                        </span>
                      )}
                    </button>

                    {/* Boutons à droite */}
                    <div className="flex gap-3">
                    <button
                      onClick={() => setIsAutoCategorizeModalOpen(false)}
                      className="px-4 py-2 text-sm text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted hover:text-gray-800 dark:hover:text-gray-200"
                    >
                      Annuler
                    </button>
                    {/* Bouton pour voir les transactions d'abord - caché si scope = selected */}
                    {autoCategorizeScope !== 'selected' && (
                      <button
                        onClick={() => {
                          // Filtrer les transactions selon le scope
                          const baseTransactions = autoCategorizeScope === 'all'
                            ? transactions.filter(t => !t.is_parent)
                            : transactions.filter(t => !t.code_comptable && !t.is_parent);
                          const limitNum = autoCategorizeLimit === 'all' ? baseTransactions.length : parseInt(autoCategorizeLimit);
                          const toSelect = baseTransactions.slice(0, limitNum);

                          // Sélectionner ces transactions
                          setSelectedTransactionIds(new Set(toSelect.map(t => t.id)));

                          // Fermer le modal
                          setIsAutoCategorizeModalOpen(false);

                          toast.success(`${toSelect.length} transactions sélectionnées. Utilisez le bouton "Auto-catégoriser" dans la barre d'actions.`, { duration: 4000 });
                        }}
                        disabled={transactions.filter(t => !t.code_comptable && !t.is_parent).length === 0}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                          transactions.filter(t => !t.code_comptable && !t.is_parent).length === 0
                            ? "bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-dark-text-muted cursor-not-allowed"
                            : "border border-purple-600 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                        )}
                      >
                        <Eye className="h-4 w-4" />
                        Voir d'abord ({autoCategorizeLimit === 'all' ? transactions.filter(t => !t.code_comptable && !t.is_parent).length : Math.min(parseInt(autoCategorizeLimit) || 0, transactions.filter(t => !t.code_comptable && !t.is_parent).length)})
                      </button>
                    )}
                    {/* Bouton pour lancer directement */}
                    <button
                      onClick={async () => {
                        setIsAutoCategorizing(true);
                        try {
                          // Filtrer les transactions selon le scope
                          let toProcess: typeof transactions;
                          if (autoCategorizeScope === 'selected') {
                            // Transactions sélectionnées (sans code comptable uniquement)
                            toProcess = transactions.filter(t =>
                              selectedTransactionIds.has(t.id) && !t.code_comptable && !t.is_parent
                            );
                          } else if (autoCategorizeScope === 'all') {
                            // Toutes les transactions
                            const all = transactions.filter(t => !t.is_parent);
                            const limitNum = autoCategorizeLimit === 'all' ? all.length : parseInt(autoCategorizeLimit);
                            toProcess = all.slice(0, limitNum);
                          } else {
                            // Sans code comptable uniquement
                            const uncategorized = transactions.filter(t => !t.code_comptable && !t.is_parent);
                            const limitNum = autoCategorizeLimit === 'all' ? uncategorized.length : parseInt(autoCategorizeLimit);
                            toProcess = uncategorized.slice(0, limitNum);
                          }

                          if (toProcess.length === 0) {
                            toast.error('Aucune transaction à traiter');
                            return;
                          }

                          const result = await CategorizationService.autoCategorizeAllWithAI(
                            clubId,
                            toProcess,
                            {
                              onlyUncategorized: autoCategorizeScope !== 'all',
                              useAiFallback: autoCategorizeUseAi,
                              rulesThreshold: 45,
                              aiConfidenceThreshold: 50,
                              dryRun: false,
                              userId: appUser?.id,
                              userName: appUser?.displayName || appUser?.email || 'Utilisateur inconnu'
                            }
                          );

                          // Collecter les IDs des transactions qui ont été catégorisées
                          const categorizedIds = result.details
                            .filter(d => d.code !== null && (d.source === 'rules' || d.source === 'ai'))
                            .map(d => d.transactionId);

                          setAutoCategorizeResult({
                            total: result.total,
                            byRules: result.byRules,
                            byAi: result.byAi,
                            needsReview: result.needsReview,
                            noMatch: result.noMatch,
                            processedIds: categorizedIds
                          });
                          await loadTransactions();

                          // Si scope = selected, retirer les transactions catégorisées de la sélection
                          if (autoCategorizeScope === 'selected') {
                            const categorizedSet = new Set(categorizedIds);
                            setSelectedTransactionIds(prev => {
                              const newSet = new Set(prev);
                              categorizedSet.forEach(id => newSet.delete(id));
                              return newSet;
                            });
                          }

                          toast.success(`${result.byRules + result.byAi} transactions catégorisées`);
                        } catch (error) {
                          logger.error('Auto-categorization error:', error);
                          toast.error('Erreur lors de l\'auto-catégorisation');
                        } finally {
                          setIsAutoCategorizing(false);
                        }
                      }}
                      disabled={isAutoCategorizing || (autoCategorizeScope === 'selected' ? selectedTransactionIds.size === 0 : transactions.filter(t => !t.code_comptable && !t.is_parent).length === 0)}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                        isAutoCategorizing || (autoCategorizeScope === 'selected' ? selectedTransactionIds.size === 0 : transactions.filter(t => !t.code_comptable && !t.is_parent).length === 0)
                          ? "bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-dark-text-muted cursor-not-allowed"
                          : "bg-purple-600 hover:bg-purple-700 text-white"
                      )}
                    >
                      {isAutoCategorizing ? (
                        <>
                          <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                          Traitement...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          Lancer directement
                        </>
                      )}
                    </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Résultats */}
                  <div className="space-y-4">
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-green-700 dark:text-green-400 mb-3">
                        <Sparkles className="h-5 w-5" />
                        <span className="font-semibold">Auto-catégorisation terminée !</span>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">Transactions traitées</span>
                          <span className="font-medium text-gray-900 dark:text-dark-text-primary dark:text-gray-100">{autoCategorizeResult.total}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted flex items-center gap-1">
                            <Settings2 className="h-3 w-3 text-blue-500" /> Par règles
                          </span>
                          <span className="font-medium text-blue-600 dark:text-blue-400">{autoCategorizeResult.byRules}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted flex items-center gap-1">
                            <Bot className="h-3 w-3 text-purple-500" /> Par AI
                          </span>
                          <span className="font-medium text-purple-600 dark:text-purple-400">{autoCategorizeResult.byAi}</span>
                        </div>
                        {autoCategorizeResult.needsReview > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3 text-orange-500" /> À vérifier
                            </span>
                            <span className="font-medium text-orange-600 dark:text-orange-400">{autoCategorizeResult.needsReview}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">Non catégorisées</span>
                          <span className="font-medium text-gray-500 dark:text-dark-text-muted">{autoCategorizeResult.noMatch}</span>
                        </div>
                      </div>
                    </div>

                    {autoCategorizeResult.needsReview > 0 && (
                      <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-orange-700 dark:text-orange-300">
                            {autoCategorizeResult.needsReview} transaction(s) catégorisée(s) par AI avec une confiance basse.
                            Elles sont marquées avec un badge orange <AlertTriangle className="h-3 w-3 inline" /> pour révision.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Boutons d'action */}
                  <div className="flex justify-between items-center mt-6">
                    {/* Bouton pour voir les transactions catégorisées */}
                    {autoCategorizeResult.processedIds.length > 0 && (
                      <button
                        onClick={() => {
                          // Fermer le modal
                          setIsAutoCategorizeModalOpen(false);
                          // Sélectionner les transactions catégorisées pour les mettre en évidence
                          setSelectedTransactionIds(new Set(autoCategorizeResult.processedIds));
                          // Reset le résultat après un délai pour permettre la prochaine utilisation
                          setTimeout(() => setAutoCategorizeResult(null), 100);
                          toast.success(`${autoCategorizeResult.processedIds.length} transactions catégorisées sélectionnées`, { duration: 2000 });
                        }}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-colors"
                      >
                        <Eye className="h-4 w-4" />
                        Voir les {autoCategorizeResult.processedIds.length} transactions catégorisées
                      </button>
                    )}
                    <div className="flex-1" />
                    <button
                      onClick={() => {
                        setIsAutoCategorizeModalOpen(false);
                        setAutoCategorizeResult(null);
                      }}
                      className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium"
                    >
                      Fermer
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Panneau de liaison membre (mode single) */}
      <MemberLinkingPanel
        isOpen={isMemberPanelOpen}
        onClose={() => setIsMemberPanelOpen(false)}
        membres={membres}
        transactionIban={detailViewTransaction?.contrepartie_iban}
        linkedMemberId={detailViewTransaction?.matched_entities?.find(e => e.entity_type === 'member')?.entity_id}
        onSelectMember={(membre) => {
          setSelectedMemberForCotisation(membre);
        }}
        position="left"
      />

      {/* Modal de confirmation de date de cotisation (mode single) */}
      <CotisationDateConfirmModal
        isOpen={!!selectedMemberForCotisation}
        onClose={() => setSelectedMemberForCotisation(null)}
        membre={selectedMemberForCotisation}
        onConfirm={handleConfirmCotisation}
      />

      {/* Modal de liaison batch */}
      <BulkMemberLinkingModal
        isOpen={isBulkMemberModalOpen}
        onClose={() => setIsBulkMemberModalOpen(false)}
        transactions={selectedCotisationTransactions}
        membres={membres}
        onConfirm={handleBulkMemberCotisation}
      />
    </div>
  );
}
