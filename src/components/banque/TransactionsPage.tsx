import React, { useState, useEffect } from 'react';
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
  X
} from 'lucide-react';
import { formatMontant, formatDate, cn, CATEGORY_COLORS, findIncompleteMatch, isIncompleteSequenceNumber } from '@/utils/utils';
import { parseCSVFile, exportTransactionsToCSV } from '@/services/csvParser';
import { migrateFiscalYearIds } from '@/utils/migrateFiscalYear';
import { migrateOperationsAndDemands } from '@/utils/migrateAllCollections';
import { TransactionBancaire, TransactionSplit, Categorie, DemandeRemboursement, Evenement, VPDiveParticipant, Operation, FiscalYear } from '@/types';
import { TransactionSplitModal } from './TransactionSplitModal';
import { OperationLinkingPanel } from './OperationLinkingPanel';
import { ExpenseFromTransactionLinkingPanel } from './ExpenseFromTransactionLinkingPanel';
import { TransactionDetailView } from './TransactionDetailView';
import { MultiFileImportModal, ImportProgress } from './MultiFileImportModal';
import toast from 'react-hot-toast';
import { CategorizationService } from '@/services/categorizationService';
import { ClaudeSkillsService } from '@/services/claudeSkillsService';
import { db, storage } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where, orderBy, serverTimestamp, deleteField } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useAuth } from '@/contexts/AuthContext';
import { useFiscalYear } from '@/contexts/FiscalYearContext';
import { ArchiveBanner } from '@/components/commun/ArchiveBanner';
import { ProtectedAction } from '@/components/commun/ProtectedAction';
import { useKeyboardNavigation, getNavigationPosition } from '@/hooks/useKeyboardNavigation';
import { FilterAccordionWithTabs } from '@/components/common/FilterAccordionWithTabs';
import { ComboBox } from '@/components/common/ComboBox';
import { Tooltip } from '@/components/common/Tooltip';
import { calypsoAccountCodes } from '@/config/calypso-accounts';

// Données de démonstration - vide pour commencer avec des vraies données
const demoTransactions: TransactionBancaire[] = [];


// Données de démonstration pour les demandes de remboursement
const demoDemands: DemandeRemboursement[] = [];

// Données de démonstration pour les participants VP Dive
const demoVPDiveParticipants: VPDiveParticipant[] = [
  {
    nom: 'MARTIN Jean-Pierre',
    numero_licence: 'LIFRAS-2025-001234',
    pratique: 'P3',
    etat_paiement: 'Payé',
    plan_tarifaire: 'Membre',
    telephone: '+32 475 12 34 56',
    contact_urgence: 'Marie Martin - +32 475 98 76 54'
  },
  {
    nom: 'DUBOIS Sophie',
    numero_licence: 'LIFRAS-2025-001235',
    pratique: 'P2',
    etat_paiement: 'Payé',
    plan_tarifaire: 'Membre',
    telephone: '+32 486 45 67 89',
    contact_urgence: 'Luc Dubois - +32 486 11 22 33'
  },
  {
    nom: 'LEROY Michel',
    numero_licence: 'LIFRAS-2025-001236',
    pratique: 'P1',
    etat_paiement: 'Non payé',
    plan_tarifaire: 'Membre',
    telephone: '+32 491 78 90 12',
    contact_urgence: 'Anne Leroy - +32 491 44 55 66'
  },
  {
    nom: 'MOREAU Catherine',
    numero_licence: 'LIFRAS-2025-001237',
    pratique: 'P2',
    etat_paiement: 'Payé',
    plan_tarifaire: 'Membre',
    telephone: '+32 495 23 45 67',
    contact_urgence: 'Pierre Moreau - +32 495 77 88 99'
  },
  {
    nom: 'PETIT Lucas',
    numero_licence: 'LIFRAS-2025-001238',
    pratique: 'P3',
    etat_paiement: 'Non payé',
    plan_tarifaire: 'Invité',
    telephone: '+32 499 34 56 78',
    contact_urgence: 'Emma Petit - +32 499 00 11 22'
  },
  {
    nom: 'ROUX Amélie',
    numero_licence: 'LIFRAS-2025-001239',
    pratique: 'P1',
    etat_paiement: 'Payé',
    plan_tarifaire: 'Membre',
    telephone: '+32 472 45 67 89',
    contact_urgence: 'Thomas Roux - +32 472 33 44 55'
  },
  {
    nom: 'SIMON David',
    numero_licence: 'LIFRAS-2025-001240',
    pratique: 'P4',
    etat_paiement: 'Payé',
    plan_tarifaire: 'Moniteur',
    telephone: '+32 477 56 78 90',
    contact_urgence: 'Julie Simon - +32 477 66 77 88'
  },
  {
    nom: 'LAURENT Marie',
    numero_licence: 'LIFRAS-2025-001241',
    pratique: 'P2',
    etat_paiement: 'Payé',
    plan_tarifaire: 'Membre',
    telephone: '+32 483 67 89 01',
    contact_urgence: 'Paul Laurent - +32 483 99 00 11'
  }
];

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
  const { selectedFiscalYear, allFiscalYears } = useFiscalYear();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [transactions, setTransactions] = useState<TransactionBancaire[]>([]);
  const [splits, setSplits] = useState<TransactionSplit[]>(demoSplits);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [demands, setDemands] = useState<DemandeRemboursement[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [accountCodeFilter, setAccountCodeFilter] = useState<'all' | 'with' | 'without'>('all');
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
  const [lastViewedTransactionId, setLastViewedTransactionId] = useState<string | null>(null);
  const [expandedTransactions, setExpandedTransactions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof TransactionBancaire | null;
    direction: 'asc' | 'desc';
  }>({ key: 'date_execution', direction: 'desc' });

  // TEMPORARY: Expose migration functions to browser console
  useEffect(() => {
    (window as any).runFiscalYearMigration = () => migrateFiscalYearIds(clubId);
    (window as any).migrateOperationsAndDemands = () => migrateOperationsAndDemands(clubId);
    console.log('💡 Migration functions available:');
    console.log('   - window.runFiscalYearMigration() (transactions)');
    console.log('   - window.migrateOperationsAndDemands() (operations + demands)');
  }, [clubId]);

  // Load data from Firestore on mount and when fiscal year changes
  useEffect(() => {
    if (selectedFiscalYear) {
      loadTransactions();
      loadOperations();
      loadDemands();
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
        console.log('🔓 [TransactionsPage] Opening transaction from navigation state:', transactionIdToOpen);
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
    if (!selectedFiscalYear) {
      console.log('⏸️ No fiscal year selected, skipping transaction load');
      setTransactions([]);
      return;
    }

    try {
      setLoading(true);
      const transactionsRef = collection(db, 'clubs', clubId, 'transactions_bancaires');

      // Query with fiscal year filter
      const q = query(
        transactionsRef,
        where('fiscal_year_id', '==', selectedFiscalYear.id),
        orderBy('date_execution', 'desc')
      );

      console.log(`📊 Loading transactions for fiscal year: ${selectedFiscalYear.year} (ID: ${selectedFiscalYear.id})`);
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

      console.log(`✅ Loaded ${loadedTransactions.length} transactions for year ${selectedFiscalYear.year}`);
      setTransactions(loadedTransactions);
    } catch (error) {
      console.error('❌ Error loading transactions:', error);
      toast.error('Erreur lors du chargement des transactions');
    } finally {
      setLoading(false);
    }
  };

  const loadOperations = async () => {
    if (!selectedFiscalYear) {
      console.log('⏸️ No fiscal year selected, skipping operations load');
      setOperations([]);
      return;
    }

    try {
      const operationsRef = collection(db, 'clubs', clubId, 'operations');

      // Query with fiscal year filter
      const q = query(
        operationsRef,
        where('fiscal_year_id', '==', selectedFiscalYear.id),
        orderBy('date_debut', 'desc')
      );

      console.log(`📊 Loading operations for fiscal year: ${selectedFiscalYear.year}`);
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

      console.log(`✅ Loaded ${loadedOperations.length} operations for year ${selectedFiscalYear.year}`);

      // Count by type
      const typeCounts = loadedOperations.reduce((acc, op) => {
        acc[op.type] = (acc[op.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      console.log(`📊 Operations by type:`, typeCounts);

      setOperations(loadedOperations);
    } catch (error) {
      console.error('❌ Error loading operations:', error);
    }
  };

  const loadDemands = async () => {
    if (!selectedFiscalYear) {
      console.log('⏸️ No fiscal year selected, skipping demands load');
      setDemands([]);
      return;
    }

    try {
      const demandsRef = collection(db, 'clubs', clubId, 'demandes_remboursement');

      // Query with fiscal year filter
      const q = query(
        demandsRef,
        where('fiscal_year_id', '==', selectedFiscalYear.id),
        orderBy('date_depense', 'desc')
      );

      console.log(`📊 Loading demands for fiscal year: ${selectedFiscalYear.year}`);
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

      console.log(`✅ Loaded ${loadedDemands.length} demands for year ${selectedFiscalYear.year}`);
      setDemands(loadedDemands);
    } catch (error) {
      console.error('❌ Error loading demands:', error);
      toast.error('Erreur lors du chargement des demandes');
    }
  };

  // Fonction pour obtenir les transactions enfants d'une transaction parent
  const getChildTransactions = (parentId: string) => {
    return transactions.filter(tx => tx.parent_transaction_id === parentId)
      .sort((a, b) => (a.child_index || 0) - (b.child_index || 0));
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
    const matchesAccountCode = accountCodeFilter === 'all' ||
      (accountCodeFilter === 'with' && tx.code_comptable && tx.code_comptable.trim() !== '') ||
      (accountCodeFilter === 'without' && (!tx.code_comptable || tx.code_comptable.trim() === ''));

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

    return matchesTab && matchesSearch && matchesCategory && matchesAccountCode &&
           matchesReconciliation && matchesAmount && matchesStatus && matchesAttachments &&
           matchesParentChild && matchesDateRange && matchesCounterparty && matchesIban &&
           matchesCommunication && matchesSequenceRange && matchesLinkedEntity &&
           matchesSpecificCode && matchesComment;
  });

  // Keyboard navigatie voor detail view (pijltjestoetsen ← →)
  useKeyboardNavigation({
    items: filteredTransactions,
    currentItem: detailViewTransaction,
    onNavigate: setDetailViewTransaction,
    isOpen: !!detailViewTransaction
  });

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

  // Appliquer le tri aux transactions filtrées
  const sortedTransactions = [...filteredTransactions].sort((a, b) => {
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
          console.error(`Erreurs dans ${file.name}:`, result.errors);
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
        console.log(`\n📊 Import CSV: ${file.name}`);
        console.log(`📊 Transactions dans le CSV: ${result.transactions.length}`);
        console.log(`📊 Transactions en base: ${existingTransactions.length} (dont ${incompleteCount} avec numéros incomplets)`);

        // DEBUG: Afficher les transactions avec numéros incomplets
        if (incompleteCount > 0) {
          console.log(`\n🔍 Transactions avec numéros incomplets en base:`);
          incompleteTransactions.forEach(tx => {
            const date = tx.date_execution instanceof Date ? tx.date_execution : new Date(tx.date_execution);
            const dateStr = !isNaN(date.getTime()) ? date.toISOString().split('T')[0] : 'INVALID_DATE';
            console.log(`  - ${tx.numero_sequence} | ${dateStr} | ${tx.montant}€ | ${tx.contrepartie_nom} | "${tx.communication}"`);
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
            console.log(`🔄 Match incomplet: ${tx.numero_sequence} - ${tx.contrepartie_nom} (${tx.montant}€) → Update ${incompleteMatch.id.substring(0, 8)}...`);
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
              console.log(`🎨 Enrichissement détecté: ${tx.numero_sequence} → "${tx.contrepartie_nom}"`);
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
              console.log(`🎨 Enrichissement détecté (hash): ${tx.numero_sequence} → "${tx.contrepartie_nom}"`);
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
        console.log(`📊 Résultat du tri: ${toUpdate.length} à mettre à jour, ${newTransactions.length} nouvelles, ${duplicates.length} duplicates`);

        // NOUVEAU: Mettre à jour les transactions (numéros incomplets + enrichissement)
        for (const { newTx, existingId } of toUpdate) {
          try {
            const docRef = doc(db, 'clubs', clubId, 'transactions_bancaires', existingId);
            const existingTx = existingTransactions.find(tx => tx.id === existingId);

            // Préparer les champs à mettre à jour
            const updateData: any = {
              updated_at: serverTimestamp()
            };

            // Cas 1: Update numéro incomplet (toujours mettre à jour numero + hash)
            if (existingTx && isIncompleteSequenceNumber(existingTx.numero_sequence)) {
              updateData.numero_sequence = newTx.numero_sequence;
              updateData.hash_dedup = newTx.hash_dedup;
              console.log(`🔄 Update numéro incomplet: ${existingTx.numero_sequence} → ${newTx.numero_sequence}`);
            }

            // Cas 2: Enrichissement contrepartie (seulement si vide)
            if (existingTx && (!existingTx.contrepartie_nom || existingTx.contrepartie_nom.trim() === '') && newTx.contrepartie_nom) {
              updateData.contrepartie_nom = newTx.contrepartie_nom;
              console.log(`🎨 Enrichissement contrepartie: ${existingId.substring(0, 8)}... → "${newTx.contrepartie_nom}"`);
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
            console.log(`✓ Mise à jour: ${existingId.substring(0, 8)}...${numeroNote}${enrichmentNote}`);
          } catch (error) {
            console.error('Error updating transaction:', error);
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
            console.error('Error saving transaction:', error);
            totalErrors++;
          }
        }

        setTransactions(prev => [...prev, ...savedTransactions]);

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
        console.error(`Error processing ${file.name}:`, error);
        totalErrors++;
      }
    }

    // Log final
    console.log(`\n✅ Import terminé: ${totalUpdated} mises à jour, ${totalImported} nouvelles, ${totalDuplicates} duplicates, ${totalErrors} erreurs\n`);

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
              <h3 class="text-lg font-semibold text-gray-900">Toutes les transactions existent déjà!</h3>
              <p class="text-sm text-gray-600 mt-1">
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
              <h3 class="text-lg font-semibold text-gray-900">Import réussi!</h3>
              <p class="text-sm text-gray-600 mt-1">
                Les transactions ont été importées avec succès depuis ${files.length} fichier${files.length > 1 ? 's' : ''}.
              </p>
            </div>
          </div>

          <div class="bg-gray-50 rounded-lg p-4 space-y-2">
            <div class="flex justify-between text-sm">
              <span class="text-gray-600">Fichiers traités:</span>
              <span class="font-semibold">${files.length}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-600">Transactions importées:</span>
              <span class="font-semibold text-green-600">${totalImported}</span>
            </div>
            ${totalUpdated > 0 ? `
            <div class="flex justify-between text-sm">
              <span class="text-gray-600">Mises à jour:</span>
              <span class="font-semibold text-blue-600">${totalUpdated}</span>
            </div>
            ` : ''}
            ${totalDuplicates > 0 ? `
            <div class="flex justify-between text-sm">
              <span class="text-gray-600">Doublons ignorés:</span>
              <span class="font-semibold text-amber-600">${totalDuplicates}</span>
            </div>
            ` : ''}
            ${totalErrors > 0 ? `
            <div class="flex justify-between text-sm">
              <span class="text-gray-600">Erreurs:</span>
              <span class="font-semibold text-red-600">${totalErrors}</span>
            </div>
            ` : ''}
          </div>

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
      console.log('🔄 Invalidation du cache dashboard après import transactions...');
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
      console.log('✅ Cache dashboard invalidé!');
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
      console.error('Error generating AI report:', error);
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
        const firestoreData: any = {
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
        if (parentTx.vp_dive_import_id) firestoreData.vp_dive_import_id = parentTx.vp_dive_import_id;
        if (parentTx.matched_entities) firestoreData.matched_entities = parentTx.matched_entities;
        if (parentTx.commentaire) firestoreData.commentaire = parentTx.commentaire;

        // Priorité aux valeurs du split pour categorie et code_comptable
        if (split.notes) firestoreData.details = split.notes;
        if (split.categorie) firestoreData.categorie = split.categorie;
        else if (parentTx.categorie) firestoreData.categorie = parentTx.categorie;
        if (split.code_comptable) firestoreData.code_comptable = split.code_comptable;
        else if (parentTx.code_comptable) firestoreData.code_comptable = parentTx.code_comptable;

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
      console.error('Error saving splits:', error);
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
      console.error('Error deleting child transaction:', error);
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
      console.error('Error uploading documents:', error);
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
        console.warn('Could not delete file from storage (it may have already been deleted):', storageError);
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
      console.error('Error deleting document:', error);
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
      console.error('Error deleting transaction:', error);
      toast.error('Erreur lors de la suppression de la transaction');
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

      {/* Archive Banner */}
      <ArchiveBanner />

      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text-primary">Transactions bancaires</h1>
            <p className="text-gray-600 dark:text-dark-text-secondary mt-1">Gérez et réconciliez les transactions du club</p>
          </div>
          <div className="flex gap-2">
            <ProtectedAction requireModify>
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 dark:border-dark-border text-gray-600 dark:text-dark-text-secondary rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary transition-colors"
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
                            (transactionStatus !== 'all' ? 1 : 0) +
                            (hasAttachments !== 'all' ? 1 : 0) +
                            (parentChildFilter !== 'all' ? 1 : 0),
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
                          : "border border-gray-300 dark:border-dark-border text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary"
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
                          : "border border-gray-300 dark:border-dark-border text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary"
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
                          : "border border-gray-300 dark:border-dark-border text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary"
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
                    value={transactionStatus}
                    onChange={(e) => setTransactionStatus(e.target.value as any)}
                  >
                    <option value="all">Statut: Tous</option>
                    <option value="accepte">Accepté</option>
                    <option value="refuse">Refusé</option>
                    <option value="en_attente">En attente</option>
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
                    options={calypsoAccountCodes
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
                          <span className="text-gray-400 text-sm">-</span>
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
                  <span className="text-sm text-gray-500">-</span>
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
                        console.log('Changing linkedEntityType to:', e.target.value);
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
                      <span className="mx-1 text-sm text-gray-500">-</span>
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
                  </div>
                )
              }
            ]}
        />


      {/* Table des transactions */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border">
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
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider w-36 cursor-pointer hover:bg-gray-100 dark:bg-dark-bg-tertiary select-none"
                  onClick={() => handleSort('numero_sequence')}
                >
                  <div className="flex items-center gap-1">
                    N° Trans.
                    {sortConfig.key === 'numero_sequence' && (
                      <span className="text-calypso-blue">
                        {sortConfig.direction === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider w-36 cursor-pointer hover:bg-gray-100 dark:bg-dark-bg-tertiary select-none"
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
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:bg-dark-bg-tertiary select-none"
                  onClick={() => handleSort('contrepartie_nom')}
                >
                  <div className="flex items-center gap-1">
                    Contrepartie & Liaisons
                    {sortConfig.key === 'contrepartie_nom' && (
                      <span className="text-calypso-blue">
                        {sortConfig.direction === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider w-36 cursor-pointer hover:bg-gray-100 dark:bg-dark-bg-tertiary select-none"
                  onClick={() => handleSort('categorie')}
                >
                  <div className="flex items-center gap-1">
                    Catégorie
                    {sortConfig.key === 'categorie' && (
                      <span className="text-calypso-blue">
                        {sortConfig.direction === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </th>
                <th
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider w-36 cursor-pointer hover:bg-gray-100 dark:bg-dark-bg-tertiary select-none"
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
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider w-auto">
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
                        "hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary transition-colors",
                        isParent && "bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-400 dark:border-orange-600",
                        lastViewedTransactionId === transaction.id && "bg-blue-100 dark:bg-blue-900/30"
                      )}
                    >
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-dark-text-primary">
                        <span className={cn("font-mono text-xs", isParent ? "text-orange-700 dark:text-orange-400" : "text-gray-600 dark:text-dark-text-secondary")}>
                          {transaction.numero_sequence || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-dark-text-primary">
                        <div className="flex items-center space-x-1.5">
                          {isParent && (
                            <button
                              onClick={() => toggleExpanded(transaction.id)}
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
                      <td className="px-4 py-2">
                        <div>
                          {/* Contrepartie + Communication sur même ligne */}
                          <div className="flex items-center gap-2">
                            <p className={cn("text-sm font-medium truncate max-w-xs", isParent ? "text-orange-900 dark:text-orange-400" : "text-gray-900 dark:text-dark-text-primary")}>
                              {transaction.contrepartie_nom}
                            </p>
                            {isParent && (
                              <span className="inline-flex items-center gap-0.5 px-1 py-0.5 text-xs rounded bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 whitespace-nowrap">
                                <Split className="h-2.5 w-2.5" />
                                Ventilée
                              </span>
                            )}
                          </div>

                          {/* Communication + Liaisons inline */}
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-600 dark:text-dark-text-secondary">
                            <span className={cn("truncate max-w-sm", isParent && "text-gray-500 dark:text-dark-text-muted")}>
                              {transaction.communication}
                            </span>

                            {/* Liaisons inline */}
                            {transaction.matched_entities && transaction.matched_entities.length > 0 && (
                              <>
                                <span className="text-gray-300 dark:text-dark-border">•</span>
                                {transaction.matched_entities.filter(e => e.entity_type === 'event' || e.entity_type === 'operation').map((entity, idx) => (
                                  <span key={idx} className="text-blue-600 dark:text-blue-400 whitespace-nowrap">
                                    📅 {entity.entity_name}
                                  </span>
                                ))}
                                {transaction.matched_entities.filter(e => e.entity_type === 'expense' || e.entity_type === 'demand').map((entity, idx) => (
                                  <span key={idx} className="text-orange-600 dark:text-orange-400 whitespace-nowrap">
                                    💳 {entity.entity_name}
                                  </span>
                                ))}
                              </>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="space-y-0.5">
                          {!transaction.is_split && transaction.categorie && (() => {
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
                            return (
                              <span className="text-xs text-gray-700 dark:text-dark-text-secondary">
                                {categoryNames[transaction.categorie] || transaction.categorie}
                              </span>
                            );
                          })()}
                          {!transaction.is_split && transaction.code_comptable && (
                            <div>
                              <span className="px-2 py-0.5 text-xs font-mono bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary rounded">
                                {transaction.code_comptable}
                              </span>
                            </div>
                          )}
                          {transaction.is_split && (
                            <span className="text-xs text-gray-500 dark:text-dark-text-muted italic">Ventilé</span>
                          )}
                        </div>
                      </td>
                      <td className={cn(
                        "px-6 py-4 whitespace-nowrap text-sm font-semibold text-right",
                        transaction.montant > 0 ? "text-green-600" : "text-red-600"
                      )}>
                        {formatMontant(transaction.montant)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-2">
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
                                    ? "bg-gray-50 dark:bg-gray-700 text-gray-300 dark:text-gray-600"
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
                            onClick={() => {
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
                          "hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors",
                          lastViewedTransactionId === child.id && "bg-blue-200 dark:bg-blue-900/40"
                        )}
                      >
                        <td className="px-4 py-1.5 whitespace-nowrap text-sm bg-blue-50/50 dark:bg-blue-900/20">
                          <span className="font-mono text-xs text-blue-600 dark:text-blue-400">
                            {child.numero_sequence || '-'}
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
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-1.5 whitespace-nowrap bg-blue-50/50 dark:bg-blue-900/20">
                          <div className="space-y-0.5">
                            {child.categorie && (
                              <span className={cn(
                                "px-1.5 py-0.5 text-xs rounded-full",
                                CATEGORY_COLORS[child.categorie] || CATEGORY_COLORS.autre
                              )}>
                                {CategorizationService.getAllCategories().find(c => c.id === child.categorie)?.nom || child.categorie}
                              </span>
                            )}
                            {child.code_comptable && (
                              <div>
                                <span className="px-1.5 py-0.5 text-xs font-mono bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary rounded">
                                  {child.code_comptable}
                                </span>
                              </div>
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
                              onClick={() => {
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
                            {split.categorie && (
                              <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary">
                                {CategorizationService.getAllCategories().find(c => c.id === split.categorie)?.nom}
                              </span>
                            )}
                            {split.code_comptable && (
                              <div>
                                <span className="px-1.5 py-0.5 text-xs font-mono bg-gray-50 dark:bg-dark-bg-tertiary text-gray-600 dark:text-dark-text-secondary rounded">
                                  {split.code_comptable}
                                </span>
                              </div>
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
                                : "bg-gray-100 text-gray-400"
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
        />
      )}
      
      {/* Panel de liaison des opérations */}
      {operationLinkingTransaction && (
        <OperationLinkingPanel
          isOpen={!!operationLinkingTransaction}
          onClose={() => setOperationLinkingTransaction(null)}
          transaction={operationLinkingTransaction}
          operations={operations}
          linkedOperationIds={
            operationLinkingTransaction.matched_entities
              ?.filter(e => e.entity_type === 'event')
              .map(e => e.entity_id) || []
          }
          onLinkOperations={async (operationIds: string[]) => {
            try {
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

              await updateDoc(txRef, {
                reconcilie: true,
                matched_entities: allEntities,
                updated_at: serverTimestamp()
              });

              // Mettre à jour l'état local
              const updatedTransaction = {
                ...operationLinkingTransaction,
                reconcilie: true,
                matched_entities: allEntities
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
            } catch (error) {
              console.error('Error linking operations:', error);
              toast.error('Erreur lors de la liaison des activités');
            }
          }}
        />
      )}

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

              await updateDoc(txRef, {
                reconcilie: true,
                matched_entities: allEntities,
                updated_at: serverTimestamp()
              });

              // Mettre à jour toutes les demandes de remboursement
              for (const expenseId of expenseIds) {
                const demandeRef = doc(db, 'clubs', clubId, 'demandes_remboursement', expenseId);
                await updateDoc(demandeRef, {
                  transaction_id: expenseLinkingTransaction.id,
                  statut: 'rembourse',
                  date_remboursement: new Date(),
                  updated_at: serverTimestamp()
                });
              }

              // Mettre à jour l'état local
              const updatedTransaction = {
                ...expenseLinkingTransaction,
                reconcilie: true,
                matched_entities: allEntities
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
              console.error('Error linking expenses:', error);
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
          events={operations}
          splits={splits}
          childTransactions={getChildTransactions(detailViewTransaction.id)}
          vpDiveParticipants={
            // Pass participants if the transaction is linked to Plongée Zélande event
            detailViewTransaction.matched_entities?.some(e => e.entity_id === 'zeeland-avril')
              ? demoVPDiveParticipants
              : []
          }
          isOpen={!!detailViewTransaction}
          onClose={() => {
            if (detailViewTransaction) {
              setLastViewedTransactionId(detailViewTransaction.id);
            }
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
          onUnlink={async (entityId: string) => {
            // Délier une entité (demande, événement ou inscription) de la transaction
            try {
              const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', detailViewTransaction.id);

              // Trouver le type d'entité
              const entity = detailViewTransaction.matched_entities?.find(e => e.entity_id === entityId);
              if (!entity) {
                toast.error('Entité non trouvée');
                return;
              }

              // 1. Supprimer l'entité liée de la transaction
              const updatedEntities = detailViewTransaction.matched_entities?.filter(
                e => e.entity_id !== entityId
              ) || [];

              // Préparer les updates - utiliser deleteField() pour supprimer les champs
              const updates: any = {
                matched_entities: updatedEntities.length > 0 ? updatedEntities : deleteField(),
                reconcilie: updatedEntities.length > 0,
                updated_at: serverTimestamp()
              };

              // Si c'est une dépense, supprimer expense_claim_id
              if (entity.entity_type === 'expense' || entity.entity_type === 'demand') {
                updates.expense_claim_id = deleteField();
              }

              await updateDoc(txRef, updates);

              // 2. Mettre à jour l'entité selon son type
              if (entity.entity_type === 'expense' || entity.entity_type === 'demand') {
                // Demande de remboursement - supprimer transaction_id et date_remboursement
                const demandeRef = doc(db, 'clubs', clubId, 'demandes_remboursement', entityId);
                await updateDoc(demandeRef, {
                  transaction_id: deleteField(),
                  statut: 'approuve',
                  date_remboursement: deleteField(),
                  updated_at: serverTimestamp()
                });

                setDemands(prev => prev.map(d =>
                  d.id === entityId
                    ? { ...d, transaction_id: null, statut: 'approuve' as const, date_remboursement: null }
                    : d
                ));
                toast.success('Dépense déliée de la transaction');
              } else if (entity.entity_type === 'event') {
                // Événement - juste retirer de matched_entities
                toast.success('Événement délié de la transaction');
              } else if (entity.entity_type === 'inscription') {
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
              if (entity.entity_type === 'expense' || entity.entity_type === 'demand') {
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
              console.error('Error unlinking entity:', error);
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

              const updates: any = {
                matched_entities: updatedEntities.length > 0 ? updatedEntities : deleteField(),
                reconcilie: updatedEntities.length > 0,
                updated_at: serverTimestamp()
              };

              await updateDoc(txRef, updates);

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
              console.error('Error unlinking event:', error);
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
            // Fermer le modal de transaction AVANT de naviguer
            setDetailViewTransaction(null);
            navigate('/operations', { state: { openEventId: eventId, fromTransactionId: detailViewTransaction.id } });
          }}
          onNavigateToDemand={(demandId) => {
            // Fermer le modal de transaction AVANT de naviguer
            setDetailViewTransaction(null);
            navigate('/depenses', { state: { openDemandId: demandId, fromTransactionId: detailViewTransaction.id } });
          }}
          onUpdateTransaction={async (updates) => {
            try {
              // Mettre à jour dans Firestore
              const transactionRef = doc(db, 'clubs', clubId, 'transactions_bancaires', detailViewTransaction.id);
              await updateDoc(transactionRef, {
                ...updates,
                updated_at: serverTimestamp()
              });

              // Mettre à jour la transaction dans la liste locale
              setTransactions(prev =>
                prev.map(t => t.id === detailViewTransaction.id
                  ? { ...t, ...updates }
                  : t
                )
              );
              // Mettre à jour la transaction dans le modal
              setDetailViewTransaction(prev => prev ? { ...prev, ...updates } : null);

              // Message de succès spécifique selon le type de mise à jour
              if (updates.commentaire !== undefined) {
                toast.success('Commentaire mis à jour');
              } else if (updates.categorie || updates.code_comptable) {
                toast.success('Catégorisation mise à jour');
              } else {
                toast.success('Transaction mise à jour');
              }
            } catch (error) {
              console.error('Error updating transaction:', error);
              toast.error('Erreur lors de la mise à jour de la transaction');
            }
          }}
          onUpdateChildTransaction={async (childId: string, updates: Partial<TransactionBancaire>) => {
            try {
              // Mettre à jour dans Firestore
              const childRef = doc(db, 'clubs', clubId, 'transactions_bancaires', childId);
              await updateDoc(childRef, {
                ...updates,
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
              console.error('Error updating child transaction:', error);
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
          navigationPosition={getNavigationPosition(filteredTransactions, detailViewTransaction)}
          onNavigatePrevious={() => {
            const currentIndex = filteredTransactions.findIndex(t => t.id === detailViewTransaction.id);
            if (currentIndex > 0) {
              setDetailViewTransaction(filteredTransactions[currentIndex - 1]);
            } else {
              // Wrap to end
              setDetailViewTransaction(filteredTransactions[filteredTransactions.length - 1]);
            }
          }}
          onNavigateNext={() => {
            const currentIndex = filteredTransactions.findIndex(t => t.id === detailViewTransaction.id);
            if (currentIndex < filteredTransactions.length - 1) {
              setDetailViewTransaction(filteredTransactions[currentIndex + 1]);
            } else {
              // Wrap to start
              setDetailViewTransaction(filteredTransactions[0]);
            }
          }}
          returnContext={returnContext}
        />
      )}

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
                            index % 2 === 0 ? 'bg-white dark:bg-dark-bg-secondary' : 'bg-gray-100 dark:bg-dark-bg-primary'
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
    </div>
  );
}