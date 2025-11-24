import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  Users,
  Euro,
  Plus,
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  Link2,
  Link2Off,
  X,
  Eye,
  MapPin,
  TrendingUp,
  TrendingDown,
  Search,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { formatMontant, formatDate, cn } from '@/utils/utils';
import { VPDiveParser } from '@/services/vpDiveParser';
import { EventTransactionMatcher } from '@/services/eventTransactionMatcher';
import { Evenement, TransactionBancaire, InscriptionEvenement, DemandeRemboursement, DocumentJustificatif, Operation } from '@/types';
import { EventFormModal } from '../evenements/EventFormModal';
import { SourceBadge } from '../evenements/SourceBadge';
import { TransactionLinkingPanel } from '@/components/commun/TransactionLinkingPanel';
import { ExpenseLinkingPanel } from '../evenements/ExpenseLinkingPanel';
import { AutoMatchDialog } from '../evenements/AutoMatchDialog';
import { InscriptionMatcher } from '../evenements/InscriptionMatcher';
import { OperationTypeSelector } from './OperationTypeSelector';
import { VPDiveImportModal } from './VPDiveImportModal';
import { OperationDetailView } from './OperationDetailView';
import { CotisationFormModal } from './CotisationFormModal';
import { VenteFormModal } from './VenteFormModal';
import { SubventionFormModal } from './SubventionFormModal';
import { AutreOperationFormModal } from './AutreOperationFormModal';
import { TransactionDetailView } from '../banque/TransactionDetailView';
import { DemandeDetailView } from '../depenses/DemandeDetailView';
import { CalendarView } from './CalendarView';
import {
  linkInscriptionToTransaction,
  unlinkInscriptionTransaction,
  markInscriptionPaidCash,
  markInscriptionUnpaid,
  updateInscriptionComment,
  autoMatchAllInscriptions,
  AutoMatchResult,
  MatchQuality
} from '@/services/inscriptionService';

// MatchItem type for auto-match dialog
interface MatchItem {
  inscription: InscriptionEvenement;
  transaction: TransactionBancaire;
  confidence: number;
  quality: MatchQuality;
}
import toast from 'react-hot-toast';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where, orderBy, serverTimestamp, setDoc } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useAuth } from '@/contexts/AuthContext';
import { useFiscalYear } from '@/contexts/FiscalYearContext';
import { useKeyboardNavigation, getNavigationPosition } from '@/hooks/useKeyboardNavigation';

// Données de démonstration - vide pour commencer avec des vraies données
const demoEvents: Evenement[] = [];

const demoInscriptions: Record<string, InscriptionEvenement[]> = {};

const demoLinkedTransactions: Record<string, TransactionBancaire[]> = {};

export function OperationsPage() {
  const { clubId, user, appUser } = useAuth();
  const { selectedFiscalYear, loading: fiscalYearLoading } = useFiscalYear();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [events, setEvents] = useState<Evenement[]>([]);
  const [inscriptions, setInscriptions] = useState<Record<string, InscriptionEvenement[]>>({});
  const [linkedTransactions, setLinkedTransactions] = useState<Record<string, TransactionBancaire[]>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatut, setFilterStatut] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('tous'); // Filtre par type d'opération
  const [detailViewEvent, setDetailViewEvent] = useState<Evenement | null>(null);
  const [lastViewedEventId, setLastViewedEventId] = useState<string | null>(null);
  const [formEvent, setFormEvent] = useState<Evenement | null>(null);
  const [showCotisationForm, setShowCotisationForm] = useState(false);
  const [editingCotisation, setEditingCotisation] = useState<Operation | null>(null);
  const [editingCaution, setEditingCaution] = useState<Operation | null>(null);
  const [showVenteForm, setShowVenteForm] = useState(false);
  const [editingVente, setEditingVente] = useState<Operation | null>(null);
  const [showSubventionForm, setShowSubventionForm] = useState(false);
  const [editingSubvention, setEditingSubvention] = useState<Operation | null>(null);
  const [showAutreForm, setShowAutreForm] = useState(false);
  const [editingAutreOp, setEditingAutreOp] = useState<Operation | null>(null);
  const [showTransactionLinking, setShowTransactionLinking] = useState(false);
  const [showExpenseLinking, setShowExpenseLinking] = useState(false);
  const [linkingEventId, setLinkingEventId] = useState<string | null>(null);
  const [allTransactions, setAllTransactions] = useState<TransactionBancaire[]>([]);
  const [allExpenses, setAllExpenses] = useState<DemandeRemboursement[]>([]);
  const [linkedExpenses, setLinkedExpenses] = useState<Record<string, DemandeRemboursement[]>>({});
  const [loading, setLoading] = useState(true);

  // Detail view states for navigation from OperationDetailView
  const [detailViewTransaction, setDetailViewTransaction] = useState<TransactionBancaire | null>(null);
  const [detailViewDemand, setDetailViewDemand] = useState<DemandeRemboursement | null>(null);

  // Inscription linking state
  const [linkingInscriptionId, setLinkingInscriptionId] = useState<string | null>(null);
  const [autoMatchResult, setAutoMatchResult] = useState<AutoMatchResult | null>(null);
  const [showAutoMatchDialog, setShowAutoMatchDialog] = useState(false);

  // AI matching state
  const [showAIMatchDialog, setShowAIMatchDialog] = useState(false);

  // Operation type selector state
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [selectedOperationType, setSelectedOperationType] = useState<string | null>(null);
  const [showVPDiveImport, setShowVPDiveImport] = useState(false);

  // Sort state
  type SortField = 'titre' | 'date_debut' | 'participants' | 'statut';
  type SortDirection = 'asc' | 'desc' | null;
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  // View mode state (table or calendar)
  const [viewMode, setViewMode] = useState<'table' | 'calendar'>('table');

  // Load events, transactions and expenses from Firestore on mount and when filter changes
  useEffect(() => {
    // ⚠️ CRITICAL: Wait for both selectedFiscalYear AND appUser before loading data
    // Without appUser, we don't know the role and can't apply correct filters
    if (selectedFiscalYear && appUser) {
      console.log(`🔄 [OperationsPage] Loading data with appUser role: ${appUser.app_role}`);
      loadEvents();
      loadAllTransactions();
      loadAllExpenses();
    } else if (selectedFiscalYear && !appUser) {
      console.log('⏸️ [OperationsPage] Waiting for appUser to load before fetching data...');
    }
  }, [clubId, filterType, selectedFiscalYear, appUser]); // Recharger quand le filtre de type, fiscal year, ou appUser change

  // Auto-open event if navigated from transaction detail or expense detail
  useEffect(() => {
    const eventIdToOpen = location.state?.openEventId || location.state?.selectedEventId;
    if (eventIdToOpen && events.length > 0 && !detailViewEvent) {
      const eventToOpen = events.find(e => e.id === eventIdToOpen);
      if (eventToOpen) {
        console.log('🔓 [OperationsPage] Opening event from navigation state:', eventIdToOpen);
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

  const loadEvents = async () => {
    if (!selectedFiscalYear) {
      console.log('⏸️ No fiscal year selected, skipping operations load');
      setEvents([]);
      setInscriptions({});
      return;
    }

    try {
      setLoading(true);
      // 🆕 MIGRATION: Lire depuis 'operations' au lieu de 'evenements'
      const operationsRef = collection(db, 'clubs', clubId, 'operations');

      // 🔒 USER ISOLATION: Filter by organisateur_id for 'user' role
      let q;
      if (appUser?.role === 'user') {
        // User role: only see own operations (type 'evenement' only enforced in create/update rules)
        console.log(`🔒 USER ISOLATION: Loading only own operations for user ${user?.uid}`);
        if (filterType === 'tous') {
          q = query(
            operationsRef,
            where('fiscal_year_id', '==', selectedFiscalYear.id),
            where('organisateur_id', '==', user?.uid),
            orderBy('date_debut', 'desc')
          );
        } else {
          q = query(
            operationsRef,
            where('fiscal_year_id', '==', selectedFiscalYear.id),
            where('type', '==', filterType),
            where('organisateur_id', '==', user?.uid),
            orderBy('date_debut', 'desc')
          );
        }
      } else {
        // Admin/validateur/superadmin: see all operations
        if (filterType === 'tous') {
          q = query(
            operationsRef,
            where('fiscal_year_id', '==', selectedFiscalYear.id),
            orderBy('date_debut', 'desc')
          );
        } else {
          q = query(
            operationsRef,
            where('fiscal_year_id', '==', selectedFiscalYear.id),
            where('type', '==', filterType),
            orderBy('date_debut', 'desc')
          );
        }
      }

      console.log(`📊 Loading operations for fiscal year: ${selectedFiscalYear.year}, type: ${filterType} (role: ${appUser?.role})`);
      const snapshot = await getDocs(q);

      const loadedEvents = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          date_debut: data.date_debut?.toDate?.() || new Date(data.date_debut),
          date_fin: data.date_fin?.toDate?.() || (data.date_fin ? new Date(data.date_fin) : null),
          date_limite_inscription: data.date_limite_inscription?.toDate?.() || (data.date_limite_inscription ? new Date(data.date_limite_inscription) : null),
          created_at: data.created_at?.toDate?.() || new Date(),
          updated_at: data.updated_at?.toDate?.() || new Date(),
          // 🆕 Mapper budget_prevu_revenus depuis montant_prevu si absent
          budget_prevu_revenus: data.budget_prevu_revenus || data.montant_prevu || 0,
          budget_prevu_depenses: data.budget_prevu_depenses || 0
        } as Evenement;
      });

      console.log(`✅ Loaded ${loadedEvents.length} operations for year ${selectedFiscalYear.year}`);
      setEvents(loadedEvents);


      // ✅ UNIFIED: Load inscriptions from subcollections for each event IN PARALLEL
      const allInscriptions: Record<string, InscriptionEvenement[]> = {};

      console.log(`🔍 Loading inscriptions for ${loadedEvents.length} events in parallel...`);

      // Load inscriptions for all events in parallel using Promise.all
      const inscriptionPromises = loadedEvents.map(async (event) => {
        try {
          const inscriptionsRef = collection(db, 'clubs', clubId, 'operations', event.id, 'inscriptions');
          const inscSnapshot = await getDocs(inscriptionsRef);

          console.log(`📊 Event "${event.titre}" (${event.id}): ${inscSnapshot.docs.length} inscriptions`);

          const eventInscriptions = inscSnapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id,
            date_inscription: doc.data().date_inscription?.toDate?.() || new Date(),
            date_paiement: doc.data().date_paiement?.toDate?.() || null,
            created_at: doc.data().created_at?.toDate?.() || new Date(),
            updated_at: doc.data().updated_at?.toDate?.() || new Date()
          } as InscriptionEvenement));

          if (eventInscriptions.length > 0) {
            console.log(`   ✅ Loaded ${eventInscriptions.length} inscriptions for event ${event.id}`);
            return { eventId: event.id, inscriptions: eventInscriptions };
          }
          return null;
        } catch (error) {
          console.error(`❌ Error loading inscriptions for event ${event.id}:`, error);
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

      console.log(`📦 Total inscriptions loaded:`, Object.keys(allInscriptions).length, 'events with inscriptions');
      console.log(`📋 Inscriptions by event:`, allInscriptions);

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
      console.error('Error loading events:', error);
      toast.error('Erreur lors du chargement des événements');
    } finally {
      setLoading(false);
    }
  };

  // Load all transactions from Firestore
  const loadAllTransactions = async () => {
    if (!selectedFiscalYear) {
      console.log('⏸️ No fiscal year selected, skipping transactions load');
      setAllTransactions([]);
      setLinkedTransactions({});
      return;
    }

    try {
      const transactionsRef = collection(db, 'clubs', clubId, 'transactions_bancaires');

      const q = query(
        transactionsRef,
        where('fiscal_year_id', '==', selectedFiscalYear.id),
        orderBy('date_execution', 'desc')
      );

      console.log(`📊 Loading transactions for fiscal year: ${selectedFiscalYear.year}`);
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
      setAllTransactions(loadedTransactions);

      // Build linked transactions map
      const linkedMap: Record<string, TransactionBancaire[]> = {};

      for (const tx of loadedTransactions) {
        // IMPORTANT : Exclure les transactions parent (ventilées) car elles sont non utilisables
        // Seules les transactions normales et les enfants sont comptabilisées
        if (tx.is_parent || tx.is_split) continue;

        if (tx.matched_entities) {
          for (const entity of tx.matched_entities) {
            if (entity.entity_type === 'event') {
              if (!linkedMap[entity.entity_id]) {
                linkedMap[entity.entity_id] = [];
              }
              linkedMap[entity.entity_id].push(tx);
            }
          }
        }
      }

      setLinkedTransactions(linkedMap);

      // ALSO need to load transactions linked via inscriptions
      // This will be called after inscriptions are loaded

    } catch (error) {
      console.error('Error loading transactions:', error);
      toast.error('Erreur lors du chargement des transactions');
    }
  };

  // Load all expense claims from Firestore
  const loadAllExpenses = async () => {
    if (!selectedFiscalYear) {
      console.log('⏸️ No fiscal year selected, skipping expenses load');
      setAllExpenses([]);
      return;
    }

    try {
      const expensesRef = collection(db, 'clubs', clubId, 'demandes_remboursement');

      const q = query(
        expensesRef,
        where('fiscal_year_id', '==', selectedFiscalYear.id),
        orderBy('date_depense', 'desc')
      );

      console.log(`📊 Loading expenses for fiscal year: ${selectedFiscalYear.year}`);
      const snapshot = await getDocs(q);

      const loadedExpenses = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          date_demande: data.date_demande?.toDate?.() || new Date(data.date_demande || Date.now()),
          date_depense: data.date_depense?.toDate?.() || (data.date_depense ? new Date(data.date_depense) : undefined),
          date_soumission: data.date_soumission?.toDate?.() || (data.date_soumission ? new Date(data.date_soumission) : undefined),
          date_approbation: data.date_approbation?.toDate?.() || (data.date_approbation ? new Date(data.date_approbation) : undefined),
          date_remboursement: data.date_remboursement?.toDate?.() || (data.date_remboursement ? new Date(data.date_remboursement) : undefined),
          created_at: data.created_at?.toDate?.() || new Date(),
          updated_at: data.updated_at?.toDate?.() || new Date()
        } as DemandeRemboursement;
      });

      console.log(`✅ Loaded ${loadedExpenses.length} expenses for year ${selectedFiscalYear.year}`);
      setAllExpenses(loadedExpenses);

      // Build linked expenses map by event
      const linkedMap: Record<string, DemandeRemboursement[]> = {};
      for (const expense of loadedExpenses) {
        // 🆕 MIGRATION: Use operation_id with fallback to evenement_id for backward compatibility
        const eventId = expense.operation_id || expense.evenement_id;
        if (eventId) {
          if (!linkedMap[eventId]) {
            linkedMap[eventId] = [];
          }
          linkedMap[eventId].push(expense);
        }
      }
      setLinkedExpenses(linkedMap);

    } catch (error) {
      console.error('Error loading expenses:', error);
      toast.error('Erreur lors du chargement des demandes');
    }
  };

  // Reload inscriptions for a specific event (called after AI validation)
  const loadInscriptions = async (eventId: string) => {
    try {
      // ✅ UNIFIED: Load from subcollection 'clubs/{clubId}/operations/{eventId}/inscriptions'
      const inscriptionsRef = collection(db, 'clubs', clubId, 'operations', eventId, 'inscriptions');
      const inscSnapshot = await getDocs(inscriptionsRef);
      const eventInscriptions = inscSnapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
        date_inscription: doc.data().date_inscription?.toDate?.() || new Date(),
        date_paiement: doc.data().date_paiement?.toDate?.() || null,
        created_at: doc.data().created_at?.toDate?.() || new Date(),
        updated_at: doc.data().updated_at?.toDate?.() || new Date()
      } as InscriptionEvenement));

      setInscriptions(prev => ({
        ...prev,
        [eventId]: eventInscriptions
      }));

      console.log(`✅ Loaded ${eventInscriptions.length} inscriptions for event ${eventId} from subcollection`);
    } catch (error) {
      console.error('Error loading inscriptions:', error);
    }
  };

  // Reload linked transactions for a specific event (called after AI validation)
  const loadLinkedTransactions = async (eventId: string) => {
    try {
      // ✅ UNIFIED: Get inscriptions from subcollection
      const inscriptionsRef = collection(db, 'clubs', clubId, 'operations', eventId, 'inscriptions');
      const inscSnapshot = await getDocs(inscriptionsRef);
      const eventInscriptions = inscSnapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      }));

      // Find all transaction IDs linked via inscriptions
      const transactionIds = eventInscriptions
        .map((i: any) => i.transaction_id)
        .filter(Boolean);

      // Find transactions with these IDs
      const linkedTxs: TransactionBancaire[] = [];
      for (const txId of transactionIds) {
        const tx = allTransactions.find(t => t.id === txId);
        if (tx && !tx.is_parent && !tx.is_split) {
          linkedTxs.push(tx);
        }
      }

      // Also include transactions linked via matched_entities
      for (const tx of allTransactions) {
        if (tx.is_parent || tx.is_split) continue;
        if (tx.matched_entities) {
          for (const entity of tx.matched_entities) {
            if (entity.entity_type === 'event' && entity.entity_id === eventId) {
              if (!linkedTxs.some(t => t.id === tx.id)) {
                linkedTxs.push(tx);
              }
            }
          }
        }
      }

      setLinkedTransactions(prev => ({
        ...prev,
        [eventId]: linkedTxs
      }));

      console.log(`✅ Reloaded ${linkedTxs.length} linked transactions for event ${eventId}`);
    } catch (error) {
      console.error('Error reloading linked transactions:', error);
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
  const filteredEvents = events
    .filter(event => {
      const matchesSearch = searchTerm === '' ||
        event.titre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.lieu?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.organisateur_nom?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatut = filterStatut === '' || event.statut === filterStatut;

      return matchesSearch && matchesStatut;
    })
    .sort((a, b) => {
      if (!sortField || !sortDirection) return 0;

      let comparison = 0;

      switch (sortField) {
        case 'titre':
          comparison = a.titre.localeCompare(b.titre, 'fr');
          break;
        case 'date_debut':
          comparison = a.date_debut.getTime() - b.date_debut.getTime();
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
          // Calculer le solde pour chaque opération
          const aInscriptions = inscriptions[a.id] || [];
          const bInscriptions = inscriptions[b.id] || [];
          const aTransactions = linkedTransactions[a.id] || [];
          const bTransactions = linkedTransactions[b.id] || [];
          const aExpenses = linkedExpenses[a.id] || [];
          const bExpenses = linkedExpenses[b.id] || [];

          const aHasParticipants = ['evenement', 'cotisation', 'caution'].includes(a.type || 'evenement');
          const bHasParticipants = ['evenement', 'cotisation', 'caution'].includes(b.type || 'evenement');

          // Calculer balance pour A
          let aBalance = 0;
          if (aHasParticipants) {
            const aRevenus = aInscriptions.filter(i => i.paye).reduce((sum, i) => sum + i.prix, 0);
            const aDepenses = aExpenses.reduce((sum, d) => sum + d.montant, 0);
            aBalance = aRevenus - aDepenses;
          } else {
            aBalance = aTransactions.reduce((sum, tx) => sum + tx.montant, 0);
          }

          // Calculer balance pour B
          let bBalance = 0;
          if (bHasParticipants) {
            const bRevenus = bInscriptions.filter(i => i.paye).reduce((sum, i) => sum + i.prix, 0);
            const bDepenses = bExpenses.reduce((sum, d) => sum + d.montant, 0);
            bBalance = bRevenus - bDepenses;
          } else {
            bBalance = bTransactions.reduce((sum, tx) => sum + tx.montant, 0);
          }

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

  // Calculer les statistiques
  const stats = {
    totalEvents: events.length,
    openEvents: events.filter(e => e.statut === 'ouvert').length,
    totalInscriptions: Object.values(inscriptions).flat().length,
    totalPaid: Object.values(inscriptions).flat().filter(i => i.paye).length
  };

  // Lier des transactions à un événement
  const handleLinkTransactions = async (transactionIds: string[]) => {
    if (!linkingEventId) return;

    const event = events.find(e => e.id === linkingEventId);
    if (!event) return;

    try {
      // Mettre à jour chaque transaction
      for (const txId of transactionIds) {
        const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', txId);
        const transaction = allTransactions.find(t => t.id === txId);
        if (!transaction) continue;

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
        const alreadyLinked = existingEntities.some(
          e => e.entity_type === 'event' && e.entity_id === linkingEventId
        );

        if (!alreadyLinked) {
          await updateDoc(txRef, {
            matched_entities: [...existingEntities, newEntity],
            reconcilie: true,
            updated_at: serverTimestamp()
          });
        }
      }

      // Recharger les transactions
      await loadAllTransactions();
      toast.success(`${transactionIds.length} transaction${transactionIds.length > 1 ? 's' : ''} liée${transactionIds.length > 1 ? 's' : ''} à l'événement`);
    } catch (error) {
      console.error('Error linking transactions:', error);
      toast.error('Erreur lors de la liaison des transactions');
      throw error;
    }
  };

  // Délier une transaction d'un événement
  const handleUnlinkTransaction = async (eventId: string, transactionId: string) => {
    try {
      const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', transactionId);
      const transaction = allTransactions.find(t => t.id === transactionId);
      if (!transaction) return;

      // Retirer l'entité de type 'event' avec cet eventId
      const updatedEntities = (transaction.matched_entities || []).filter(
        e => !(e.entity_type === 'event' && e.entity_id === eventId)
      );

      await updateDoc(txRef, {
        matched_entities: updatedEntities,
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
          ? { ...tx, matched_entities: updatedEntities, reconcilie: updatedEntities.length > 0 }
          : tx
      ));

      toast.success("Transaction déliée de l'événement");
    } catch (error) {
      console.error('Error unlinking transaction:', error);
      toast.error('Erreur lors de la suppression du lien');
    }
  };

  // Lier des dépenses à un événement
  const handleLinkExpenses = async (expenseIds: string[]) => {
    if (!linkingEventId) return;

    const event = events.find(e => e.id === linkingEventId);
    if (!event) return;

    try {
      // Mettre à jour chaque demande
      for (const expenseId of expenseIds) {
        const expenseRef = doc(db, 'clubs', clubId, 'demandes_remboursement', expenseId);
        const expense = allExpenses.find(e => e.id === expenseId);
        if (!expense) continue;

        // Mettre à jour la demande avec l'événement
        // 🆕 MIGRATION: Write to both operation_id and evenement_id for backward compatibility
        await updateDoc(expenseRef, {
          operation_id: linkingEventId,
          operation_titre: event.titre,
          evenement_id: linkingEventId,
          evenement_titre: event.titre,
          updated_at: serverTimestamp()
        });

        // Si la demande a une transaction bancaire liée, ajouter aussi l'événement à cette transaction
        if (expense.transaction_id) {
          const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', expense.transaction_id);
          const transaction = allTransactions.find(t => t.id === expense.transaction_id);

          if (transaction) {
            const existingEntities = transaction.matched_entities || [];

            // Vérifier si l'événement n'est pas déjà lié
            const alreadyLinked = existingEntities.some(
              e => e.entity_type === 'event' && e.entity_id === linkingEventId
            );

            if (!alreadyLinked) {
              const newEntity = {
                entity_type: 'event' as const,
                entity_id: linkingEventId,
                entity_name: event.titre,
                confidence: 100,
                matched_at: new Date(),
                matched_by: 'auto' as const // Auto car lié via la demande
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

      toast.success(`${expenseIds.length} demande${expenseIds.length > 1 ? 's' : ''} liée${expenseIds.length > 1 ? 's' : ''} à l'événement`);
    } catch (error) {
      console.error('Error linking expenses:', error);
      toast.error('Erreur lors de la liaison des demandes');
      throw error;
    }
  };

  // Délier une demande de remboursement d'un événement
  const handleUnlinkExpense = async (eventId: string, expenseId: string) => {
    try {
      const expenseRef = doc(db, 'clubs', clubId, 'demandes_remboursement', expenseId);
      const expense = allExpenses.find(e => e.id === expenseId);
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
        const transaction = allTransactions.find(t => t.id === expense.transaction_id);

        if (transaction) {
          // Retirer l'entité de type 'event' avec cet eventId
          const updatedEntities = (transaction.matched_entities || []).filter(
            e => !(e.entity_type === 'event' && e.entity_id === eventId)
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

      toast.success("Demande déliée de l'événement");
    } catch (error) {
      console.error('Error unlinking expense:', error);
      toast.error('Erreur lors de la suppression du lien');
    }
  };

  // ============================================================
  // INSCRIPTION LINKING HANDLERS
  // ============================================================

  /**
   * Link inscription to transaction - Opens transaction linking panel
   */
  const handleLinkInscriptionToTransaction = (inscriptionId: string) => {
    if (!detailViewEvent) return;

    setLinkingInscriptionId(inscriptionId);
    setLinkingEventId(detailViewEvent.id);
    setShowTransactionLinking(true);
  };

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
      console.error('Error linking inscription:', error);
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

      return result;
    } catch (error: any) {
      console.error('Error in direct inscription link:', error);
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
      return result;
    } catch (error: any) {
      console.error('Error unlinking inscription transaction:', error);
      throw error;
    }
  };

  /**
   * Reload inscriptions for a specific event from inscriptions subcollection
   */
  const handleRefreshInscriptions = async (eventId: string) => {
    try {
      console.log('🔄 Refreshing inscriptions for event:', eventId);

      // Query the inscriptions subcollection under the operation
      const inscriptionsRef = collection(db, 'clubs', clubId, 'operations', eventId, 'inscriptions');
      const inscriptionsSnap = await getDocs(inscriptionsRef);

      console.log('📊 Found inscriptions:', inscriptionsSnap.docs.length);

      const loadedInscriptions = inscriptionsSnap.docs.map(docSnap => ({
        ...docSnap.data(),
        id: docSnap.id,
        date_inscription: docSnap.data().date_inscription?.toDate?.() || new Date(),
        date_paiement: docSnap.data().date_paiement?.toDate?.() || null,
        created_at: docSnap.data().created_at?.toDate?.() || new Date(),
        updated_at: docSnap.data().updated_at?.toDate?.() || new Date()
      })) as InscriptionEvenement[];

      console.log('✅ Loaded inscriptions:', loadedInscriptions.map(i => `${i.membre_prenom} ${i.membre_nom}`));

      setInscriptions(prev => ({
        ...prev,
        [eventId]: loadedInscriptions
      }));

      console.log('✅ Inscriptions state updated');
    } catch (error) {
      console.error('❌ Error refreshing inscriptions:', error);
      throw error;
    }
  };

  /**
   * Unlink inscription from transaction
   */
  const handleUnlinkInscription = async (inscriptionId: string, keepAsPaid: boolean) => {
    if (!detailViewEvent) return;

    try {
      const result = await unlinkInscriptionTransaction(
        clubId,
        detailViewEvent.id,
        inscriptionId,
        !keepAsPaid // markUnpaid is opposite of keepAsPaid
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
      console.error('Error unlinking inscription:', error);
      toast.error(error.message || 'Erreur lors du délien');
    }
  };

  /**
   * Mark inscription as paid in cash
   */
  const handleMarkInscriptionCash = async (inscriptionId: string) => {
    if (!detailViewEvent) return;

    try {
      const result = await markInscriptionPaidCash(
        clubId,
        detailViewEvent.id,
        inscriptionId,
        'Marqué comme payé espèces par l\'utilisateur'
      );

      if (result.success) {
        toast.success(result.message);

        // Reload events to get updated inscriptions
        await loadEvents();
      } else {
        toast.error(result.message);
      }
    } catch (error: any) {
      console.error('Error marking as cash:', error);
      toast.error(error.message || 'Erreur lors du marquage');
    }
  };

  /**
   * Mark inscription as unpaid
   */
  const handleMarkInscriptionUnpaid = async (inscriptionId: string) => {
    if (!detailViewEvent) return;

    try {
      const result = await markInscriptionUnpaid(
        clubId,
        detailViewEvent.id,
        inscriptionId
      );

      if (result.success) {
        toast.success(result.message);

        // Reload events to get updated inscriptions
        await loadEvents();
      } else {
        toast.error(result.message);
      }
    } catch (error: any) {
      console.error('Error marking as unpaid:', error);
      toast.error(error.message || 'Erreur lors du marquage');
    }
  };

  /**
   * Update inscription comment
   */
  const handleUpdateInscriptionComment = async (inscriptionId: string, comment: string) => {
    if (!detailViewEvent) return;

    try {
      const result = await updateInscriptionComment(
        clubId,
        detailViewEvent.id,
        inscriptionId,
        comment
      );

      if (result.success) {
        toast.success(result.message);

        // Reload events to get updated inscriptions
        await loadEvents();
      } else {
        toast.error(result.message);
      }
    } catch (error: any) {
      console.error('Error updating comment:', error);
      toast.error(error.message || 'Erreur lors de la mise à jour');
    }
  };

  /**
   * Auto-match all inscriptions to transactions
   */
  const handleAutoMatchInscriptions = async () => {
    if (!detailViewEvent) return;

    try {
      console.log('🤖 Starting auto-match for event:', detailViewEvent.titre);

      const result = await autoMatchAllInscriptions(
        clubId,
        detailViewEvent.id,
        {
          autoMarkCashPayments: false, // Don't auto-mark yet, show dialog first
          dateTolerance: 45, // IMPROVED: 45 days tolerance
          amountTolerance: 0.50
        }
      );

      setAutoMatchResult(result);
      setShowAutoMatchDialog(true);

      console.log('✅ Auto-match results:', {
        matched: result.matched.length,
        needsSplit: result.needsSplit.length,
        cashSuggested: result.cashSuggested.length
      });
    } catch (error: any) {
      console.error('Error during auto-match:', error);
      toast.error('Erreur lors de la liaison automatique');
    }
  };

  /**
   * NEW: AI-powered matching for inscriptions
   * Opens AI matcher dialog with unmatched transactions and inscriptions
   */
  const handleAIMatchInscriptions = () => {
    if (!detailViewEvent) return;

    console.log('🧠 Opening AI matcher for event:', detailViewEvent.titre);
    setShowAIMatchDialog(true);
  };

  /**
   * Confirm auto-match results - NEW SIGNATURE
   * Now receives only accepted matches from the dialog
   */
  const handleConfirmAutoMatch = async (selectedMatches: MatchItem[], autoMarkCash: boolean) => {
    if (!detailViewEvent) return;

    try {
      console.log('✅ Confirming auto-match...', {
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
      console.error('Error confirming auto-match:', error);
      toast.error('Erreur lors de la confirmation');
    }
  };

  // ============================================================
  // END INSCRIPTION LINKING HANDLERS
  // ============================================================

  // Supprimer un événement et ses inscriptions
  const handleDeleteEvent = async (eventId: string) => {
    try {
      // ✅ UNIFIED: Delete inscriptions from subcollection
      // Note: Firestore does NOT automatically delete subcollections when parent is deleted
      const inscriptionsRef = collection(db, 'clubs', clubId, 'operations', eventId, 'inscriptions');
      const inscriptionsSnapshot = await getDocs(inscriptionsRef);

      for (const inscDoc of inscriptionsSnapshot.docs) {
        await deleteDoc(doc(db, 'clubs', clubId, 'operations', eventId, 'inscriptions', inscDoc.id));
      }


      // 2. Délier toutes les transactions associées
      const eventTransactions = linkedTransactions[eventId] || [];
      for (const transaction of eventTransactions) {
        const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', transaction.id);
        const updatedEntities = (transaction.matched_entities || []).filter(
          e => !(e.entity_type === 'event' && e.entity_id === eventId)
        );

        await updateDoc(txRef, {
          matched_entities: updatedEntities,
          reconcilie: updatedEntities.length > 0,
          updated_at: serverTimestamp()
        });
      }

      // 3. Délier toutes les dépenses associées
      const eventExpenses = linkedExpenses[eventId] || [];
      for (const expense of eventExpenses) {
        const expenseRef = doc(db, 'clubs', clubId, 'demandes_remboursement', expense.id);
        // 🆕 MIGRATION: Clear both operation_id and evenement_id
        await updateDoc(expenseRef, {
          operation_id: null,
          operation_titre: null,
          evenement_id: null,
          evenement_titre: null,
          updated_at: serverTimestamp()
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
      setLastViewedEventId(detailViewEvent.id);
      setDetailViewEvent(null);
      toast.success('Événement supprimé avec succès');

    } catch (error) {
      console.error('Error deleting event:', error);
      toast.error('Erreur lors de la suppression de l\'événement');
    }
  };

  // Document management handlers for operations (ventes, cautions, etc.)
  const handleAddDocumentToOperation = async (operationId: string, files: FileList) => {
    console.log('🔍 [DOC UPLOAD] Starting upload for operation:', operationId);
    console.log('📁 Files to upload:', files.length, 'files');
    console.log('👤 User:', user);
    console.log('🏢 ClubId:', clubId);

    if (!clubId || !user) {
      console.error('❌ No clubId or user available');
      return;
    }

    try {
      const storage = getStorage();
      console.log('✅ Firebase Storage initialized');

      const operation = events.find(e => e.id === operationId);
      console.log('🎯 Operation found:', operation);

      if (!operation) {
        console.error('❌ Operation not found in events array');
        toast.error('Activité non trouvée');
        return;
      }

      const uploadedDocs: DocumentJustificatif[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log(`📄 Processing file ${i + 1}/${files.length}:`, file.name, `(${file.size} bytes)`);

        // Check file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
          console.warn(`⚠️ File too large: ${file.name}`);
          toast.error(`${file.name}: fichier trop volumineux (max 10 Mo)`);
          continue;
        }

        // Upload to Firebase Storage
        const timestamp = Date.now();
        const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const storagePath = `clubs/${clubId}/operations/${operationId}/${timestamp}_${sanitizedFilename}`;
        console.log('📤 Uploading to path:', storagePath);

        const storageReference = storageRef(storage, storagePath);

        await uploadBytes(storageReference, file);
        console.log('✅ File uploaded to Storage');

        const downloadUrl = await getDownloadURL(storageReference);
        console.log('🔗 Download URL obtained:', downloadUrl);

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
        console.warn('⚠️ No documents uploaded (all too large or failed)');
        return;
      }

      console.log(`✅ ${uploadedDocs.length} document(s) uploaded to Storage, updating Firestore...`);

      // Update Firestore
      const operationRef = doc(db, 'clubs', clubId, 'operations', operationId);
      const existingDocs = operation.documents_justificatifs || [];
      console.log('📝 Existing documents:', existingDocs.length);

      await updateDoc(operationRef, {
        documents_justificatifs: [...existingDocs, ...uploadedDocs],
        updated_at: serverTimestamp()
      });
      console.log('✅ Firestore updated successfully');

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

      console.log('✅ Local state updated');

      toast.success(`${uploadedDocs.length} document(s) ajouté(s)`);
      console.log('🎉 Upload complete!');
    } catch (error) {
      console.error('💥 Error uploading documents:', error);
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
      console.error('Error deleting document:', error);
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
      console.error('Error updating document:', error);
      toast.error('Erreur lors de la mise à jour du document');
    }
  };

  // Sauvegarder un événement (créer ou modifier)
  const handleSaveEvent = async (eventData: Partial<Evenement>) => {
    try {
      // 🆕 MIGRATION: Write to 'operations' instead of 'evenements'
      const eventsRef = collection(db, 'clubs', clubId, 'operations');

      // Clean eventData to remove undefined/null/invalid values (Firestore doesn't accept them)
      const cleanedData: any = { type: 'evenement' };
      Object.keys(eventData).forEach(key => {
        const value = (eventData as any)[key];
        // Skip undefined and null
        if (value === undefined || value === null) {
          return;
        }
        // Skip invalid Date objects
        if (value instanceof Date && isNaN(value.getTime())) {
          return;
        }
        cleanedData[key] = value;
      });

      if (formEvent?.id) {
        // Mise à jour d'un événement existant
        const eventRef = doc(db, 'clubs', clubId, 'operations', formEvent.id);
        await updateDoc(eventRef, {
          ...cleanedData,
          updated_at: serverTimestamp()
        });

        // Mettre à jour l'état local
        setEvents(prev => prev.map(e =>
          e.id === formEvent.id ? { ...e, ...eventData, updated_at: new Date() } : e
        ));
        toast.success('Événement mis à jour');
      } else {
        // Création d'un nouvel événement
        const docRef = await addDoc(eventsRef, {
          ...cleanedData,
          club_id: clubId,
          fiscal_year_id: selectedFiscalYear?.id || null,  // ✅ Required by Firestore rules
          organisateur_id: appUser?.id || '',  // ✅ Required by Firestore rules
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
          created_by: 'manual'
        });

        // Ajouter à l'état local
        const newEvent = {
          ...eventData,
          id: docRef.id,
          club_id: clubId,
          created_at: new Date(),
          updated_at: new Date()
        } as Evenement;

        setEvents(prev => [newEvent, ...prev]);
        toast.success('Événement créé');
      }

      setFormEvent(null);
    } catch (error) {
      console.error('Error saving event:', error);
      toast.error('Erreur lors de la sauvegarde de l\'événement');
      throw error;
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
      const editingOp = editingCotisation || editingCaution || editingVente || editingSubvention || editingAutreOp;
      const operationId = editingOp?.id || (operationData.id && !operationData.id.startsWith('new-') ? operationData.id : null);

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
        const docRef = await addDoc(operationsRef, {
          ...cleanedData,
          club_id: clubId,
          fiscal_year_id: selectedFiscalYear?.id || null,  // Required by Firestore Rules
          organisateur_id: appUser?.id || '',  // ✅ Required by Firestore rules
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
          created_by: 'manual'
        });

        toast.success('Activité créée');

        // ✅ Invalidation du cache React Query - Dashboard & Stats (uniquement pour création)
        console.log('🔄 Invalidation du cache dashboard après création activité...');
        queryClient.invalidateQueries({ queryKey: ['countStats', clubId] });
        queryClient.invalidateQueries({ queryKey: ['pendingActions', clubId] });
        console.log('✅ Cache dashboard invalidé!');
      }

      // Recharger les opérations (only if not auto-save)
      if (!operationId || editingOp) {
        await loadEvents();
      }

      // Reset editing states
      setEditingCotisation(null);
      setEditingCaution(null);
      setEditingVente(null);
      setEditingSubvention(null);
      setEditingAutreOp(null);
    } catch (error) {
      console.error('Error saving operation:', error);
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
      console.error('Error saving caution:', error);
      toast.error('Erreur lors de la sauvegarde de la caution');
      throw error;
    }
  };

  // Gérer la sélection du type d'opération
  const handleSelectOperationType = (type: string, importVPDive?: boolean) => {
    setSelectedOperationType(type);
    setShowTypeSelector(false);

    if (type === 'evenement' && importVPDive) {
      // Ouvrir le modal d'import VP Dive
      setShowVPDiveImport(true);
    } else {
      // Ouvrir le formulaire correspondant au type
      switch (type) {
        case 'evenement':
          const newEvent: Evenement = {
            id: '',
            titre: '',
            description: '',
            date_debut: new Date(),
            date_fin: null,
            lieu: '',
            organisateur_id: '',
            organisateur_nom: '',
            statut: 'brouillon',
            created_at: new Date(),
            updated_at: new Date()
          };
          setFormEvent(newEvent);
          break;
        case 'cotisation':
          setShowCotisationForm(true);
          break;
        case 'caution':
          // Create empty caution and open detail view
          const newCaution: Operation = {
            id: 'new-caution-temp', // Temporary ID until saved
            type: 'caution',
            titre: 'Nouvelle caution',
            description: '',
            montant_prevu: 0,
            montant_reel: 0,
            date_debut: new Date(),
            statut: 'brouillon',
            created_at: new Date(),
            updated_at: new Date()
          };
          setDetailViewEvent(newCaution as any);
          break;
        case 'vente':
          setShowVenteForm(true);
          break;
        case 'subvention':
          setShowSubventionForm(true);
          break;
        case 'autre':
          setShowAutreForm(true);
          break;
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
                if (appUser?.role === 'user') {
                  // Directly open event form for users
                  setFormEvent({
                    id: '',
                    type: 'evenement',
                    nom: '',
                    description: '',
                    date_debut: new Date(),
                    date_fin: null,
                    lieu: '',
                    organisateur_id: user?.uid || '',
                    organisateur_nom: appUser?.displayName || appUser?.email || '',
                    budget_prevu_revenus: 0,
                    budget_prevu_depenses: 0,
                    nombre_places: null,
                    date_limite_inscription: null,
                    matched_entities: [],
                    fiscal_year_id: selectedFiscalYear?.id || '',
                    created_at: new Date(),
                    updated_at: new Date()
                  } as Evenement);
                } else {
                  // Admin/validateur/superadmin: show type selector
                  setShowTypeSelector(true);
                }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              {appUser?.role === 'user' ? 'Nouvel événement' : 'Nouvelle activité'}
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
              {appUser?.role !== 'user' && (
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
                  toast.success('Filtres réinitialisés', { duration: 1500 });
                }}
                className="flex items-center justify-center h-[30px] w-[30px] border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
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
              : "bg-white dark:bg-dark-bg-secondary text-gray-600 dark:text-dark-text-secondary border border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary"
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
              : "bg-white dark:bg-dark-bg-secondary text-gray-600 dark:text-dark-text-secondary border border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary"
          )}
        >
          <Calendar className="h-4 w-4" />
          Calendrier
        </button>
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
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:bg-dark-bg-tertiary transition-colors"
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
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:bg-dark-bg-tertiary transition-colors"
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
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:bg-dark-bg-tertiary transition-colors"
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
                    <th
                      className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:bg-dark-bg-tertiary transition-colors"
                      onClick={() => handleSort('participants')}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <span>Participants</span>
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
                      className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:bg-dark-bg-tertiary transition-colors"
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
                    <th
                      className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:bg-dark-bg-tertiary transition-colors"
                      onClick={() => handleSort('statut')}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <span>Statut</span>
                        {sortField === 'statut' ? (
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
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredEvents.map((event) => {
                    const eventInscriptions = inscriptions[event.id] || [];
                    const eventTransactions = linkedTransactions[event.id] || [];
                    const inscriptionsPaid = eventInscriptions.filter(i => i.paye).length;
                    const totalRevenus = eventInscriptions.reduce((sum, i) => sum + (i.paye ? i.prix : 0), 0);
                    const totalDepenses = eventTransactions
                      .filter(t => t.montant < 0)
                      .reduce((sum, t) => sum + Math.abs(t.montant), 0);

                    // Calculer le solde selon le type d'opération
                    const hasParticipants = ['evenement', 'cotisation', 'caution'].includes(event.type || 'evenement');

                    let balance = 0;
                    if (hasParticipants) {
                      // REVENUS: Inscriptions payées (transactions bancaires + espèces)
                      const revenus = eventInscriptions.filter(i => i.paye).reduce((sum, i) => sum + i.prix, 0);

                      // DÉPENSES: Demandes de remboursement liées
                      const depenses = (linkedExpenses[event.id] || []).reduce((sum, d) => sum + d.montant, 0);

                      balance = revenus - depenses;
                    } else {
                      // Pour autres types: somme des transactions liées (pas de montant_prevu)
                      balance = eventTransactions.reduce((sum, tx) => sum + tx.montant, 0);
                    }

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
                        case 'autre': return 'bg-gray-100 dark:bg-gray-700/30 text-gray-700 dark:text-gray-300';
                        default: return 'bg-gray-100 dark:bg-gray-700/30 text-gray-700 dark:text-gray-300';
                      }
                    };

                    return (
                      <tr
                        key={event.id}
                        id={`event-${event.id}`}
                        className={cn(
                          "hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary transition-colors",
                          lastViewedEventId === event.id && "bg-blue-100 dark:bg-blue-900/30"
                        )}
                      >
                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-2 py-1 text-xs rounded-full font-medium whitespace-nowrap",
                            getTypeColor(event.type || 'evenement')
                          )}>
                            {getTypeLabel(event.type || 'evenement')}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-gray-900 dark:text-dark-text-primary">{event.titre}</p>
                              <SourceBadge operation={event} showLock={true} />
                            </div>
                            <p className="text-sm text-gray-500 dark:text-dark-text-muted">{event.organisateur_nom}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm">
                            <p className="text-gray-900 dark:text-dark-text-primary">{formatDate(event.date_debut, 'dd MMM yyyy')}</p>
                            {event.date_fin && event.date_fin.getTime() !== event.date_debut.getTime() && (
                              <p className="text-gray-500 dark:text-dark-text-muted">→ {formatDate(event.date_fin, 'dd MMM')}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-center">
                            <div className="flex items-center justify-center gap-2">
                              <Users className="h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
                              <span className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                                {eventInscriptions.length}
                                {event.capacite_max && (
                                  <span className="text-gray-500 dark:text-dark-text-muted">/{event.capacite_max}</span>
                                )}
                              </span>
                            </div>
                            {event.capacite_max && (
                              <div className="mt-1 w-20 mx-auto bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                                <div
                                  className="bg-calypso-blue dark:bg-calypso-aqua h-1.5 rounded-full"
                                  style={{ width: `${Math.min(100, (eventInscriptions.length / event.capacite_max) * 100)}%` }}
                                />
                              </div>
                            )}
                            <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
                              {inscriptionsPaid} payé{inscriptionsPaid > 1 ? 's' : ''}
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={cn(
                            "px-3 py-1.5 text-sm rounded-lg font-semibold",
                            balance >= 0
                              ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                              : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                          )}>
                            {formatMontant(balance)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={cn(
                            "px-2 py-1 text-xs rounded-full font-medium",
                            event.statut === 'ouvert' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                              event.statut === 'ferme' ? 'bg-gray-100 dark:bg-gray-700/30 text-gray-700 dark:text-gray-300' :
                                event.statut === 'annule' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                                  'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                          )}>
                            {event.statut}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => {
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

      {/* Modal d'import VP Dive */}
      <VPDiveImportModal
        isOpen={showVPDiveImport}
        onClose={() => setShowVPDiveImport(false)}
        clubId={clubId}
        fiscalYearId={selectedFiscalYear?.id}
        onSuccess={() => {
          loadEvents();
          loadAllTransactions();
        }}
      />

      {/* Sélecteur de type d'opération */}
      <OperationTypeSelector
        isOpen={showTypeSelector}
        onClose={() => setShowTypeSelector(false)}
        onSelectType={handleSelectOperationType}
      />

      {/* Formulaire de création/édition d'événement */}
      <EventFormModal
        event={formEvent}
        isOpen={!!formEvent}
        onClose={() => setFormEvent(null)}
        onSave={handleSaveEvent}
      />

      {/* Formulaire cotisation */}
      <CotisationFormModal
        isOpen={showCotisationForm}
        onClose={() => {
          setShowCotisationForm(false);
          setEditingCotisation(null);
        }}
        onSave={handleSaveOperation}
        cotisation={editingCotisation}
      />

      {/* Formulaire vente */}
      <VenteFormModal
        isOpen={showVenteForm}
        onClose={() => setShowVenteForm(false)}
        onSave={handleSaveOperation}
      />

      {/* Formulaire subvention */}
      <SubventionFormModal
        isOpen={showSubventionForm}
        onClose={() => setShowSubventionForm(false)}
        onSave={handleSaveOperation}
      />

      {/* Formulaire autre */}
      <AutreOperationFormModal
        isOpen={showAutreForm}
        onClose={() => setShowAutreForm(false)}
        onSave={handleSaveOperation}
      />

      {/* Panel de liaison des transactions */}
      {linkingEventId && showTransactionLinking && (() => {
        const linkedEvent = events.find(e => e.id === linkingEventId);
        console.log('🔍 entityDate passed to panel:', linkedEvent?.date_debut, 'Type:', typeof linkedEvent?.date_debut);
        return (
          <TransactionLinkingPanel
            isOpen={showTransactionLinking}
            onClose={() => {
              setShowTransactionLinking(false);
              setLinkingEventId(null);
              setLinkingInscriptionId(null);
            }}
            transactions={allTransactions}
            linkedTransactionIds={(linkedTransactions[linkingEventId] || []).map(tx => tx.id)}
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
          expenses={allExpenses}
          linkedExpenseIds={(linkedExpenses[linkingEventId] || []).map(e => e.id)}
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
          linkedTransactions={linkedTransactions[detailViewEvent.id] || []}
          linkedDemands={linkedExpenses[detailViewEvent.id] || []}
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
            setDetailViewTransaction(transaction);
          }}
          onViewDemand={(demand) => {
            setDetailViewDemand(demand);
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
            lieu: detailViewEvent.lieu,
            date_debut: detailViewEvent.date_debut,
            date_fin: detailViewEvent.date_fin || detailViewEvent.date_debut
          }}
          onMatchesValidated={async (validatedMatches) => {
            console.log('🎯 ÉVÉNEMENTS PAGE - onMatchesValidated appelé');
            console.log('  📊 Nombre de matches reçus:', validatedMatches.size);

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
                console.error(`Erreur liaison ${transactionId}:`, error);
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

      {/* Transaction Detail View (opened from Operation liaisons) */}
      {detailViewTransaction && (
        <TransactionDetailView
          transaction={detailViewTransaction}
          isOpen={!!detailViewTransaction}
          onClose={() => setDetailViewTransaction(null)}
          operations={events}
          demands={allExpenses}
        />
      )}

      {/* Demand Detail View (opened from Operation liaisons) */}
      {detailViewDemand && (
        <DemandeDetailView
          demande={detailViewDemand}
          isOpen={!!detailViewDemand}
          onClose={() => setDetailViewDemand(null)}
          onSave={async (updatedDemand) => {
            // Save the demand
            const demandRef = doc(db, 'clubs', clubId, 'demandes_remboursement', updatedDemand.id);
            await updateDoc(demandRef, {
              ...updatedDemand,
              updated_at: serverTimestamp()
            });

            // Reload expenses
            await loadAllExpenses();

            // Close detail view
            setDetailViewDemand(null);
          }}
          onDelete={async () => {
            if (detailViewDemand) {
              const demandRef = doc(db, 'clubs', clubId, 'demandes_remboursement', detailViewDemand.id);
              await deleteDoc(demandRef);

              // Reload expenses
              await loadAllExpenses();

              // Close detail view
              setDetailViewDemand(null);
            }
          }}
          allOperations={events}
        />
      )}
    </div>
  );
}