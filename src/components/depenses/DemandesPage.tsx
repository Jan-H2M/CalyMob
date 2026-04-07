import React, { useState, useEffect } from 'react';
import { logger } from '@/utils/logger';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Clock,
  CheckCircle,
  XCircle,
  FileText,
  Euro,
  Link2,
  Users,
  Eye,
  Search,
  Link2Off,
  X,
  UserCheck,
  Shield,
  AlertCircle,
  AlertTriangle,
  TrendingDown,
  Check,
  ArrowUp,
  ArrowDown,
  ArrowUpDown
} from 'lucide-react';
import { formatMontant, formatDate, cn, STATUS_COLORS } from '@/utils/utils';
import { TransactionBancaire, DemandeRemboursement, ClubSettings, Membre, DocumentJustificatif, Evenement, Operation } from '@/types';
import { ReconciliationService } from '@/services/reconciliationService';
import { SettingsService } from '@/services/settingsService';
import { PermissionService } from '@/services/permissionService';
import { UserService } from '@/services/userService';
import { ApprovalBadge } from './ApprovalBadge';
import { DemandeDetailView } from './DemandeDetailView';
import { TransactionLinkingPanel } from '@/components/commun/TransactionLinkingPanel';
import { OperationLinkingPanel } from '@/components/banque/OperationLinkingPanel';
import { TransactionDetailView } from '@/components/banque/TransactionDetailView';
import { OperationDetailView } from '@/components/operations/OperationDetailView';
import { useAuth } from '@/contexts/AuthContext';
import { useFiscalYear } from '@/contexts/FiscalYearContext';
import { aiDocumentService } from '@/services/aiDocumentService';
import toast from 'react-hot-toast';
import { getFirstName, getLastName, getRole } from '@/utils/fieldMapper';
import { db, storage } from '@/lib/firebase';
import { collection, addDoc, getDocs, getDoc, doc, updateDoc, deleteDoc, query, orderBy, serverTimestamp, where, Timestamp, deleteField } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { linkCleanupService } from '@/services/linkCleanupService';
import { useKeyboardNavigation, getNavigationPosition } from '@/hooks/useKeyboardNavigation';
import { useLinkedEntityQuickViewStack } from '@/hooks/useLinkedEntityQuickViewStack';
import { getExpenseLinkedEventId, getTransactionEventLinkIds } from '@/utils/operationFinancials';
// Email notifications are now handled by Firebase Cloud Functions (onExpenseCreated, onExpenseStatusChange)
// See functions/src/index.ts for the trigger implementation

// Settings du club par défaut (sera mis à jour avec les valeurs Firebase)
const DEFAULT_CLUB_SETTINGS: ClubSettings = {
  id: 'calypso',
  nom: 'Calypso Diving Club',
  adresse: 'Rue de la Plongée 1, 5000 Namur',
  iban: 'BE26210016070629',
  bic: 'GEBABEBB',
  email_contact: 'tresorier@calypso.be',
  annee_fiscale_courante: new Date().getFullYear(),
  categories: [],
  approval_threshold: 650,
  enable_double_approval: true
};

// Transactions de dépense pour démonstration - vide
const demoExpenseTransactions: TransactionBancaire[] = [];

const demoDemandes: DemandeRemboursement[] = [];

export function DemandesPage() {
  const { appUser, clubId, user } = useAuth();

  // ✅ Use real authenticated Membre from AuthContext (not Firebase Auth user)
  const currentUser = appUser;

  const { selectedFiscalYear, disableFiscalYearFilter } = useFiscalYear();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState<'demandes' | 'matching' | 'transactions'>('demandes');
  const [filterStatut, setFilterStatut] = useState<string>('');
  const [filterReconcilie, setFilterReconcilie] = useState<string>(''); // '' | 'oui' | 'non'
  const [filterMontantModified, setFilterMontantModified] = useState<boolean>(false); // Filter for modified amounts
  const [selectedDemande, setSelectedDemande] = useState<DemandeRemboursement | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionBancaire | null>(null);
  const [expenseTransactions, setExpenseTransactions] = useState<TransactionBancaire[]>([]);
  const [allDemandes, setAllDemandes] = useState<DemandeRemboursement[]>([]);
  const [showRefusalModal, setShowRefusalModal] = useState<string | null>(null);
  const [refusalReason, setRefusalReason] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [detailViewDemand, setDetailViewDemand] = useState<DemandeRemboursement | null>(null);
  const { quickViews, openQuickView, closeQuickViewsFrom, closeAllQuickViews } = useLinkedEntityQuickViewStack();
  const [lastViewedDemandId, setLastViewedDemandId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTransactionLinking, setShowTransactionLinking] = useState(false);
  const [linkingDemandId, setLinkingDemandId] = useState<string | null>(null);
  const [showOperationLinking, setShowOperationLinking] = useState(false);
  const [linkingOperationDemandId, setLinkingOperationDemandId] = useState<string | null>(null);

  // Tri
  const [sortField, setSortField] = useState<'date' | 'montant' | 'demandeur' | 'statut'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Load membres and evenements from Firestore
  const [membres, setMembres] = useState<Membre[]>([]);
  const [evenements, setEvenements] = useState<Evenement[]>([]);

  // Club settings state (chargés depuis Firebase)
  const [clubSettings, setClubSettings] = useState<ClubSettings>(DEFAULT_CLUB_SETTINGS);

  // Load demands from Firestore on mount and fiscal year change
  useEffect(() => {
    // Load settings from Firebase
    SettingsService.getGeneralSettingsAsync(clubId)
      .then(settings => {
        setClubSettings({
          ...DEFAULT_CLUB_SETTINGS,
          nom: settings.clubName,
          annee_fiscale_courante: settings.fiscalYear,
          approval_threshold: settings.doubleApprovalThreshold,
          enable_double_approval: settings.enableDoubleApproval
        });
      })
      .catch(err => {
        logger.error('Error loading settings:', err);
      });

    // ⚠️ CRITICAL: Wait for both selectedFiscalYear AND appUser before loading data
    // Without appUser, we don't know the role and can't apply correct filters
    if (selectedFiscalYear && appUser) {
      logger.debug(`🔄 [DemandesPage] Loading data with appUser role: ${appUser.app_role}`);
      loadDemandes();
      loadExpenseTransactions();
      loadMembres();
      loadEvenements();
    } else if (selectedFiscalYear && !appUser) {
      logger.debug('⏸️ [DemandesPage] Waiting for appUser to load before fetching data...');
    }
  }, [clubId, selectedFiscalYear, appUser]);

  // Auto-open demand if navigated from transaction detail
  useEffect(() => {
    if (location.state?.openDemandId && allDemandes.length > 0 && !detailViewDemand) {
      const demandToOpen = allDemandes.find(d => d.id === location.state.openDemandId);
      if (demandToOpen) {
        logger.debug('🔓 [DemandesPage] Opening demand from navigation state:', location.state.openDemandId);
        setDetailViewDemand(demandToOpen);
        // Clear the state to prevent re-opening when modal closes
        navigate(location.pathname, { replace: true, state: {} });
      }
    }
  }, [location.state, allDemandes, detailViewDemand, navigate, location.pathname]);

  // Restore scroll position and highlight when closing detail view
  useEffect(() => {
    if (!detailViewDemand && lastViewedDemandId) {
      // Modal closed, scroll to the viewed demand
      const element = document.getElementById(`demand-${lastViewedDemandId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      // Clear highlight after 3 seconds
      const timer = setTimeout(() => setLastViewedDemandId(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [detailViewDemand, lastViewedDemandId]);

  const loadDemandes = async () => {
    // 🔧 TEMPORAIRE: Si le filtre est désactivé, on n'attend pas selectedFiscalYear
    if (!disableFiscalYearFilter && !selectedFiscalYear) {
      logger.debug('⏸️ No fiscal year selected, skipping demands load');
      setAllDemandes([]);
      return;
    }

    // ⚠️ CRITICAL: Don't run query if appUser not loaded yet (prevents permission errors)
    if (!appUser) {
      logger.debug('⏸️ [loadDemandes] Waiting for appUser to load...');
      setAllDemandes([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const demandesRef = collection(db, 'clubs', clubId, 'demandes_remboursement');

      // 🔒 USER ISOLATION: Filter by demandeur_id for 'user' role
      let q;
      if (currentUser?.app_role === 'user' && user) {
        logger.debug(`🔒 USER ISOLATION: Loading only own demands for user ${user.uid}`, {
          user_email: user.email,
          user_uid: user.uid,
          fiscal_year_id: disableFiscalYearFilter ? 'ALL' : selectedFiscalYear?.id,
          fiscal_year: disableFiscalYearFilter ? 'ALL' : selectedFiscalYear?.year
        });
        q = disableFiscalYearFilter
          ? query(demandesRef, where('demandeur_id', '==', user.uid), orderBy('created_at', 'desc'))
          : query(demandesRef, where('fiscal_year_id', '==', selectedFiscalYear!.id), where('demandeur_id', '==', user.uid), orderBy('created_at', 'desc'));
      } else {
        // Admin/validateur/superadmin see all
        logger.debug(`📊 Loading ALL demands (admin role: ${currentUser?.app_role})`);
        q = disableFiscalYearFilter
          ? query(demandesRef, orderBy('date_depense', 'desc'))
          : query(demandesRef, where('fiscal_year_id', '==', selectedFiscalYear!.id), orderBy('date_depense', 'desc'));
      }

      logger.debug(`📊 Loading demands for fiscal year: ${disableFiscalYearFilter ? 'ALL' : selectedFiscalYear?.year} (role: ${currentUser?.app_role})`);
      const snapshot = await getDocs(q);

      // Load all demandes with date conversions
      const loadedDemandes = await Promise.all(snapshot.docs.map(async (docSnap) => {
        const data = docSnap.data();

        // Enrichir avec le displayName depuis members si demandeur_id existe
        let demandeurNom = data.demandeur_nom;
        if (data.demandeur_id) {
          try {
            const memberRef = doc(db, 'clubs', clubId, 'members', data.demandeur_id);
            const memberSnap = await getDoc(memberRef);
            if (memberSnap.exists()) {
              const memberData = memberSnap.data();
              demandeurNom = memberData.displayName || getLastName(memberData) || memberData.email || data.demandeur_nom;
            }
          } catch (error) {
            logger.warn(`Could not load member ${data.demandeur_id}:`, error);
          }
        }

        return {
          ...data,
          id: docSnap.id,
          demandeur_nom: demandeurNom, // Use enriched display name
          date_demande: data.date_demande?.toDate?.() || new Date(data.date_demande),
          date_depense: data.date_depense?.toDate?.() || new Date(data.date_depense),
          date_approbation: data.date_approbation?.toDate?.() || null,
          date_paiement: data.date_paiement?.toDate?.() || null,
          created_at: data.created_at?.toDate?.() || new Date(),
          updated_at: data.updated_at?.toDate?.() || new Date()
        } as DemandeRemboursement;
      }));

      logger.debug(`✅ Loaded ${loadedDemandes.length} demands for year ${selectedFiscalYear.year}`);
      setAllDemandes(loadedDemandes);
    } catch (error) {
      logger.error('Error loading demands:', error);
      toast.error('Erreur lors du chargement des demandes');
    } finally {
      setLoading(false);
    }
  };

  const loadExpenseTransactions = async () => {
    // 🔧 TEMPORAIRE: Si le filtre est désactivé, on n'attend pas selectedFiscalYear
    if (!disableFiscalYearFilter && !selectedFiscalYear) {
      logger.debug('⏸️ No fiscal year selected, skipping transactions load');
      setExpenseTransactions([]);
      return;
    }

    // ⚠️ CRITICAL: Users (role 'user') cannot access transactions - skip query
    if (appUser?.app_role === 'user') {
      logger.debug('⏸️ [loadExpenseTransactions] User role cannot access transactions, skipping');
      setExpenseTransactions([]);
      return;
    }

    // Wait for appUser to load for other roles
    if (!appUser) {
      logger.debug('⏸️ [loadExpenseTransactions] Waiting for appUser to load...');
      setExpenseTransactions([]);
      return;
    }

    try {
      const transactionsRef = collection(db, 'clubs', clubId, 'transactions_bancaires');

      // Query with fiscal year filter (or all if disabled)
      const q = disableFiscalYearFilter
        ? query(transactionsRef, orderBy('date_execution', 'desc'))
        : query(transactionsRef, where('fiscal_year_id', '==', selectedFiscalYear!.id), orderBy('date_execution', 'desc'));

      logger.debug(`📊 Loading transactions for fiscal year: ${disableFiscalYearFilter ? 'ALL' : selectedFiscalYear?.year}`);
      const snapshot = await getDocs(q);

      const loadedTransactions = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          date_execution: data.date_execution?.toDate?.() || new Date(data.date_execution),
          date_valeur: data.date_valeur?.toDate?.() || new Date(data.date_valeur),
          created_at: data.created_at?.toDate?.() || new Date(),
          updated_at: data.updated_at?.toDate?.() || new Date()
        } as TransactionBancaire;
      });

      logger.debug(`✅ Loaded ${loadedTransactions.length} transactions for year ${disableFiscalYearFilter ? 'ALL' : selectedFiscalYear?.year}`);
      setExpenseTransactions(loadedTransactions);
    } catch (error) {
      logger.error('Error loading transactions:', error);
    }
  };

  // NEW: Load membres from Firestore
  const loadMembres = async () => {
    try {
      const membresRef = collection(db, 'clubs', clubId, 'members');
      const snapshot = await getDocs(membresRef);

      const loadedMembres = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as Membre[];

      logger.debug('📋 Membres loaded:', loadedMembres.length, 'members');
      logger.debug('📋 Members data:', loadedMembres);
      setMembres(loadedMembres);
    } catch (error) {
      logger.error('Error loading membres:', error);
    }
  };

  // NEW: Load evenements from Firestore
  const loadEvenements = async () => {
    // ⚠️ CRITICAL: Wait for appUser to load before running query
    if (!appUser) {
      logger.debug('⏸️ [loadEvenements] Waiting for appUser to load...');
      setEvenements([]);
      return;
    }

    try {
      // 🆕 MIGRATION: Load from 'operations' collection with type filter
      const evenementsRef = collection(db, 'clubs', clubId, 'operations');

      // 🔒 USER ISOLATION: Filter by organisateur_id for user role
      let eventsQuery;
      if (appUser?.app_role === 'user' && user) {
        eventsQuery = query(
          evenementsRef,
          where('type', '==', 'evenement'),
          where('organisateur_id', '==', user.uid)
        );
      } else {
        eventsQuery = query(evenementsRef, where('type', '==', 'evenement'));
      }

      const snapshot = await getDocs(eventsQuery);

      const loadedEvenements = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          date: data.date?.toDate?.() || new Date(data.date),
          created_at: data.created_at?.toDate?.() || new Date(),
          updated_at: data.updated_at?.toDate?.() || new Date()
        } as Evenement;
      });

      setEvenements(loadedEvenements);
    } catch (error) {
      logger.error('Error loading evenements:', error);
    }
  };

  const getOperationById = (operationId: string): Evenement | null => {
    return evenements.find(operation => operation.id === operationId) || null;
  };

  const getLinkedTransactionsForOperation = (operationId: string): TransactionBancaire[] => {
    return expenseTransactions.filter(transaction => getTransactionEventLinkIds(transaction).includes(operationId));
  };

  const getLinkedDemandsForOperation = (operationId: string): DemandeRemboursement[] => {
    return allDemandes.filter(demand => getExpenseLinkedEventId(demand) === operationId);
  };

  // Handler for quick expense creation (creates directly in Firestore)
  const handleNewExpense = async () => {
    try {
      const demandesRef = collection(db, 'clubs', clubId, 'demandes_remboursement');
      const newDemande = {
        titre: '',
        description: '',
        montant: 0,
        date_depense: new Date().toISOString().split('T')[0],
        demandeur_id: user?.uid,
        demandeur_nom: user?.displayName || appUser?.displayName || 'Utilisateur',
        demandeur_email: user?.email || '',
        statut: 'brouillon',
        club_id: clubId,
        fiscal_year_id: selectedFiscalYear?.id || null,
        date_soumission: serverTimestamp(),
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      };

      const docRef = await addDoc(demandesRef, newDemande);

      // Reload demands and open the new one
      await loadDemandes();

      // Find and open the newly created demand
      const newDemandeWithId: DemandeRemboursement = {
        ...newDemande,
        id: docRef.id,
        date_soumission: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      } as DemandeRemboursement;

      setDetailViewDemand(newDemandeWithId);
      toast.success('Nouvelle dépense créée');
    } catch (error) {
      logger.error('Error creating expense:', error);
      toast.error('Erreur lors de la création de la dépense');
    }
  };

  // Handler for creating expenses with files (used by DemandeDetailView)
  const handleCreateExpense = async (newDemand: Partial<DemandeRemboursement>, files?: File[]): Promise<string> => {
    try {
      // Upload files to Firebase Storage first
      const uploadedDocs: DocumentJustificatif[] = [];
      if (files && files.length > 0) {
        // Import hash function
        const { hashFile } = await import('@/services/documentDeduplicationService');

        for (const file of files) {
          // Calculate hash BEFORE upload
          let fileHash: string | undefined;
          try {
            fileHash = await hashFile(file);
          } catch (error) {
            logger.error(`Error calculating hash for ${file.name}:`, error);
          }

          const storageRef = ref(storage, `clubs/${clubId}/justificatifs/${Date.now()}_${file.name}`);
          await uploadBytes(storageRef, file);
          const url = await getDownloadURL(storageRef);

          uploadedDocs.push({
            url,
            nom_original: file.name,
            nom_affichage: file.name,
            type: file.type,
            taille: file.size,
            date_upload: new Date(),
            file_hash: fileHash  // ✨ NEW: Store hash for future duplicate detection
          });
        }
      }

      // Create demand in Firestore
      // Filter out undefined and empty string values (Firestore doesn't accept undefined)
      const cleanedDemand: any = {};
      Object.entries(newDemand).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          cleanedDemand[key] = value;
        }
      });

      const demandesRef = collection(db, 'clubs', clubId, 'demandes_remboursement');
      const demandData = {
        ...cleanedDemand,
        club_id: clubId,
        fiscal_year_id: selectedFiscalYear?.id || null,  // Required by Firestore Rules
        demandeur_id: newDemand.demandeur_id || user?.uid,
        demandeur_nom: newDemand.demandeur_nom || user?.displayName || 'Utilisateur',
        statut: 'brouillon',
        ...(uploadedDocs.length > 0 && {
          documents_justificatifs: uploadedDocs,
          urls_justificatifs: uploadedDocs.map(d => d.url)
        }),
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      };

      logger.debug('📝 Creating demand with data:', {
        demandeur_id: demandData.demandeur_id,
        fiscal_year_id: demandData.fiscal_year_id,
        user_uid: user?.uid,
        user_email: user?.email,
        appUser_role: getRole(appUser)
      });

      const docRef = await addDoc(demandesRef, demandData);

      toast.success('Dépense créée avec succès');

      // Send email notification to submitter (non-blocking)
      // Email notification is now handled by Firebase Cloud Function (onExpenseCreated)
      logger.debug('📧 Expense submitted - email will be sent by Cloud Function');

      // Close the create modal
      setShowNewFormModal(false);

      // Reload both demands AND transactions (important for auto-linking visibility)
      await loadDemandes();
      await loadExpenseTransactions();

      // Wait a bit for state to update, then fetch and open the newly created expense
      setTimeout(async () => {
        try {
          const demandeDoc = await getDoc(doc(db, 'clubs', clubId, 'demandes_remboursement', docRef.id));
          if (demandeDoc.exists()) {
            const newDemande = {
              id: demandeDoc.id,
              ...demandeDoc.data()
            } as DemandeRemboursement;
            setDetailViewDemand(newDemande);
          }
        } catch (error) {
          logger.error('Error fetching newly created demand:', error);
        }
      }, 500);

      // Return the created demande ID for auto-linking
      return docRef.id;
    } catch (error) {
      logger.error('Error creating expense:', error);
      toast.error('Erreur lors de la création de la dépense');
      throw error; // Re-throw to allow caller to handle
    }
  };

  // NEW: Handler for AI analysis
  const handleAnalyzeWithAI = async (files: File[]): Promise<Partial<DemandeRemboursement> | null> => {
    try {
      if (files.length === 0) return null;

      // Analyze the first file
      const result = await aiDocumentService.analyzeDocument(files[0], { useAI: true });

      if (result.status === 'completed') {
        const extracted: Partial<DemandeRemboursement> = {
          montant: result.montant || 0,
          description: result.description || '',
          fournisseur: result.fournisseur?.nom || '',
          categorie: result.categorie || undefined,
          code_comptable: result.code_comptable || undefined,
          date_depense: result.date || new Date()
        };

        toast.success('Document analysé avec succès');
        return extracted;
      }

      return null;
    } catch (error) {
      logger.error('AI analysis error:', error);
      toast.error('Erreur lors de l\'analyse IA');
      return null;
    }
  };

  // Handler pour le tri
  const handleSort = (field: 'date' | 'montant' | 'demandeur' | 'statut') => {
    if (sortField === field) {
      // Toggle direction si même champ
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Nouveau champ, direction par défaut
      setSortField(field);
      setSortDirection(field === 'date' || field === 'montant' ? 'desc' : 'asc');
    }
  };

  // Filtrer et trier les demandes
  const filteredDemandes = allDemandes
    .filter(demande => {
      const matchesSearch = searchTerm === '' ||
        demande.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        demande.demandeur_nom?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatut = filterStatut === '' || demande.statut === filterStatut;

      // Check if demand is reconciled (linked to a transaction)
      const isReconciled = expenseTransactions.some(t =>
        t.matched_entities?.some(e => (e.entity_type === 'expense' || e.entity_type === 'demand') && e.entity_id === demande.id)
      );
      const matchesReconcilie = filterReconcilie === '' ||
        (filterReconcilie === 'oui' && isReconciled) ||
        (filterReconcilie === 'non' && !isReconciled);

      const matchesMontantModified = !filterMontantModified || demande.montant_modified === true;

      return matchesSearch && matchesStatut && matchesReconcilie && matchesMontantModified;
    })
    .sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'date':
          const dateA = a.date_depense ? new Date(a.date_depense).getTime() : 0;
          const dateB = b.date_depense ? new Date(b.date_depense).getTime() : 0;
          comparison = dateA - dateB;
          break;
        case 'montant':
          comparison = a.montant - b.montant;
          break;
        case 'demandeur':
          comparison = (a.demandeur_nom || '').localeCompare(b.demandeur_nom || '');
          break;
        case 'statut':
          comparison = (a.statut || '').localeCompare(b.statut || '');
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

  // Keyboard navigatie voor detail view (pijltjestoetsen ← →)
  useKeyboardNavigation({
    items: filteredDemandes,
    currentItem: detailViewDemand,
    onNavigate: setDetailViewDemand,
    isOpen: !!detailViewDemand
  });

  // Synchronize lastViewedDemandId with detailViewDemand (for blue highlight)
  useEffect(() => {
    if (detailViewDemand) {
      setLastViewedDemandId(detailViewDemand.id);
    }
  }, [detailViewDemand]);

  // Statistiques
  const stats = {
    totalDemandes: allDemandes.length,
    enAttente: allDemandes.filter(d => d.statut === 'en_attente_validation').length,
    approuvees: allDemandes.filter(d => d.statut === 'approuve').length,
    remboursees: allDemandes.filter(d => d.statut === 'rembourse').length,
    refusees: allDemandes.filter(d => d.statut === 'refuse').length,
    montantTotal: allDemandes.reduce((sum, d) => sum + d.montant, 0),
    montantApprouve: allDemandes
      .filter(d => d.statut === 'approuve' || d.statut === 'rembourse')
      .reduce((sum, d) => sum + d.montant, 0)
  };
  
  const unmatchedTransactions = expenseTransactions.filter(t => !t.reconcilie && !t.expense_claim_id);
  const matchedTransactions = expenseTransactions.filter(t => t.reconcilie || t.expense_claim_id);

  const canApprove = PermissionService.hasPermission(currentUser, 'demands.approve');

  const handleApproveDemand = async (demandId: string) => {
    const demande = allDemandes.find(d => d.id === demandId);
    if (!demande) return;

    // Super admin can approve their own demands
    const isSuperAdmin = getRole(currentUser) === 'super_admin';
    if (demande.demandeur_id === currentUser.id && !isSuperAdmin) {
      toast.error('Vous ne pouvez pas approuver votre propre demande');
      return;
    }

    if (demande.approuve_par === currentUser.id) {
      toast.error('Vous avez déjà approuvé cette demande');
      return;
    }

    const needsDoubleApproval = SettingsService.requiresDoubleApproval(demande.montant);
    // isSecondApproval = true seulement si double approbation requise ET première approbation déjà faite
    const isSecondApproval = needsDoubleApproval && !!demande.approuve_par;

    // Nouveau statut: 'approuve' si pas besoin de double approbation, OU si c'est la 2ème approbation
    const newStatus = (!needsDoubleApproval || isSecondApproval) ? 'approuve' : 'en_attente_validation';

    try {
      // ✅ CRITICAL FIX: Save approval to Firestore
      const demandeRef = doc(db, 'clubs', clubId, 'demandes_remboursement', demandId);

      const currentUserFirstName = getFirstName(currentUser) || '';
      const currentUserLastName = getLastName(currentUser) || '';
      const currentUserFullName = `${currentUserFirstName} ${currentUserLastName}`.trim();

      // ✅ Status audit trail entry
      const statusAuditEntry = {
        old_statut: demande.statut,
        new_statut: newStatus,
        changed_by: currentUser.id,
        changed_by_name: currentUserFullName,
        changed_at: new Date(),
        approval_type: isSecondApproval ? 'second' : 'first'
      };

      const firestoreUpdates: any = {
        statut: newStatus,
        requires_double_approval: needsDoubleApproval,
        updated_at: serverTimestamp(),
        status_history: [...(demande.status_history || []), statusAuditEntry]
      };

      if (isSecondApproval) {
        firestoreUpdates.approuve_par_2 = currentUser.id;
        firestoreUpdates.approuve_par_2_nom = currentUserFullName;
        // Use Timestamp.now() instead of serverTimestamp() - Firestore rules validate these fields
        // before serverTimestamp() is resolved, causing "Missing or insufficient permissions"
        firestoreUpdates.date_approbation_2 = Timestamp.now();
      } else {
        firestoreUpdates.approuve_par = currentUser.id;
        firestoreUpdates.approuve_par_nom = currentUserFullName;
        // Use Timestamp.now() instead of serverTimestamp() - Firestore rules validate these fields
        // before serverTimestamp() is resolved, causing "Missing or insufficient permissions"
        firestoreUpdates.date_approbation = Timestamp.now();
      }

      await updateDoc(demandeRef, firestoreUpdates);

      // Update local state for immediate UI feedback
      const updatedDemande: DemandeRemboursement = {
        ...demande,
        ...firestoreUpdates,
        // Convert serverTimestamp to Date for local state
        date_approbation: isSecondApproval ? demande.date_approbation : new Date(),
        date_approbation_2: isSecondApproval ? new Date() : undefined,
        updated_at: new Date()
      };

      setAllDemandes(prev => prev.map(d => d.id === demandId ? updatedDemande : d));

      // Update detail view if it's open
      if (detailViewDemand && detailViewDemand.id === demandId) {
        setDetailViewDemand(updatedDemande);
      }

      if (newStatus === 'approuve') {
        toast.success('✅ Demande approuvée complètement');
        // Email notification is now handled by Firebase Cloud Function (onExpenseStatusChange)
        logger.debug('📧 Expense approved - email will be sent by Cloud Function');
      } else {
        toast.success('✅ Première approbation effectuée, en attente de deuxième validation');
      }

      logger.debug('✅ Approval saved to Firestore:', { demandId, newStatus, isSecondApproval });

      // ✅ Audit logging - track who approved and when
      try {
        await UserService.createAuditLog(clubId, {
          userId: currentUser?.id || '',
          userEmail: currentUser?.email || '',
          userName: currentUserFullName,
          action: 'DEMAND_APPROVED',
          targetId: demandId,
          targetType: 'demand',
          targetName: demande.description || demande.titre || `Demande ${demandId}`,
          previousValue: { statut: demande.statut },
          newValue: {
            statut: newStatus,
            isSecondApproval,
            montant: demande.montant
          },
          details: {
            demandeur: demande.demandeur_nom,
            montant: demande.montant,
            approvalType: isSecondApproval ? 'second_approval' : 'first_approval'
          },
          timestamp: new Date(),
          clubId: clubId,
          severity: 'info'
        });
        logger.debug('📝 Audit log created for approval');
      } catch (auditError) {
        logger.error('⚠️ Failed to create audit log (non-blocking):', auditError);
      }

      // ✅ Invalidation du cache React Query - Dashboard & Stats
      logger.debug('🔄 Invalidation du cache dashboard après approbation dépense...');
      queryClient.invalidateQueries({ queryKey: ['countStats', clubId] });
      queryClient.invalidateQueries({ queryKey: ['pendingActions', clubId] });
      logger.debug('✅ Cache dashboard invalidé!');

    } catch (error) {
      logger.error('❌ Error approving demand:', error);
      toast.error('Erreur lors de l\'approbation de la demande');
    }
  };

  const handleRefuseDemand = async (demandId: string) => {
    if (!refusalReason.trim()) {
      toast.error('Veuillez indiquer un motif de refus');
      return;
    }

    try {
      // ✅ CRITICAL FIX: Save refusal to Firestore
      const demandeRef = doc(db, 'clubs', clubId, 'demandes_remboursement', demandId);

      const refuserFirstName = getFirstName(currentUser) || '';
      const refuserLastName = getLastName(currentUser) || '';
      const refuserFullName = `${refuserFirstName} ${refuserLastName}`.trim();

      // Get current demande for status history
      const demande = allDemandes.find(d => d.id === demandId);

      // ✅ Status audit trail entry
      const statusAuditEntry = {
        old_statut: demande?.statut || 'en_attente_validation',
        new_statut: 'refuse',
        changed_by: currentUser.id,
        changed_by_name: refuserFullName,
        changed_at: new Date(),
        reason: refusalReason
      };

      await updateDoc(demandeRef, {
        statut: 'refuse',
        refuse_par: currentUser.id,
        refuse_par_nom: refuserFullName,
        date_refus: serverTimestamp(),
        motif_refus: refusalReason,
        updated_at: serverTimestamp(),
        status_history: [...(demande?.status_history || []), statusAuditEntry]
      });

      // Update local state for immediate UI feedback
      const updatedDemande = {
        statut: 'refuse' as const,
        refuse_par: currentUser.id,
        refuse_par_nom: refuserFullName,
        date_refus: new Date(),
        motif_refus: refusalReason,
        updated_at: new Date()
      };

      setAllDemandes(prev => prev.map(d =>
        d.id === demandId ? { ...d, ...updatedDemande } : d
      ));

      // Update detail view if it's open
      if (detailViewDemand && detailViewDemand.id === demandId) {
        setDetailViewDemand(prev => prev ? { ...prev, ...updatedDemande } : null);
      }

      toast.success('✅ Demande refusée');
      setShowRefusalModal(null);
      setRefusalReason('');

      logger.debug('✅ Refusal saved to Firestore:', { demandId, refusalReason });

      // ✅ Audit logging - track who rejected and why (reuse demande from above)
      try {
        await UserService.createAuditLog(clubId, {
          userId: currentUser?.id || '',
          userEmail: currentUser?.email || '',
          userName: refuserFullName,
          action: 'DEMAND_REJECTED',
          targetId: demandId,
          targetType: 'demand',
          targetName: demande?.description || demande?.titre || `Demande ${demandId}`,
          previousValue: { statut: demande?.statut },
          newValue: {
            statut: 'refuse',
            motif_refus: refusalReason
          },
          details: {
            demandeur: demande?.demandeur_nom,
            montant: demande?.montant,
            motif_refus: refusalReason
          },
          timestamp: new Date(),
          clubId: clubId,
          severity: 'warning'
        });
        logger.debug('📝 Audit log created for rejection');
      } catch (auditError) {
        logger.error('⚠️ Failed to create audit log (non-blocking):', auditError);
      }

      // ✅ Invalidation du cache React Query - Dashboard & Stats
      logger.debug('🔄 Invalidation du cache dashboard après refus dépense...');
      queryClient.invalidateQueries({ queryKey: ['countStats', clubId] });
      queryClient.invalidateQueries({ queryKey: ['pendingActions', clubId] });
      logger.debug('✅ Cache dashboard invalidé!');

    } catch (error) {
      logger.error('❌ Error refusing demand:', error);
      toast.error('Erreur lors du refus de la demande');
    }
  };

  const handleLinkTransaction = async (transaction: TransactionBancaire, demande: DemandeRemboursement) => {
    try {
      // Créer l'entité liée
      const matchedEntity = {
        entity_type: 'expense' as const,
        entity_id: demande.id,
        entity_name: demande.description,
        confidence: 100,
        matched_at: new Date(),
        matched_by: 'manual' as const
      };

      // 1. Mettre à jour la transaction dans Firestore
      const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', transaction.id);
      await updateDoc(txRef, {
        expense_claim_id: demande.id,
        reconcilie: true,
        matched_entities: [matchedEntity],
        updated_at: serverTimestamp()
      });

      // 2. Mettre à jour la demande dans Firestore
      const demandeRef = doc(db, 'clubs', clubId, 'demandes_remboursement', demande.id);

      const linkerFirstName = getFirstName(currentUser) || '';
      const linkerLastName = getLastName(currentUser) || '';
      const linkerFullName = `${linkerFirstName} ${linkerLastName}`.trim();

      // ✅ Status audit trail entry for linking to transaction
      const statusAuditEntry = {
        old_statut: demande.statut,
        new_statut: 'rembourse',
        changed_by: currentUser.id,
        changed_by_name: linkerFullName,
        changed_at: new Date()
      };

      await updateDoc(demandeRef, {
        transaction_id: transaction.id,
        statut: 'rembourse',
        date_remboursement: new Date(),
        updated_at: serverTimestamp(),
        status_history: [...(demande.status_history || []), statusAuditEntry]
      });

      // 3. Mettre à jour l'état local
      const updatedTransaction: TransactionBancaire = {
        ...transaction,
        expense_claim_id: demande.id,
        reconcilie: true,
        matched_entities: [matchedEntity]
      };

      setExpenseTransactions(prev =>
        prev.map(t => t.id === transaction.id ? updatedTransaction : t)
      );

      setAllDemandes(prev =>
        prev.map(d => d.id === demande.id
          ? {
              ...d,
              statut: 'rembourse' as const,
              transaction_id: transaction.id,
              date_remboursement: new Date(),
              status_history: [...(d.status_history || []), statusAuditEntry]
            }
          : d
        )
      );

      toast.success(`Transaction liée à la demande "${demande.description}"`);
      setSelectedTransaction(null);
      setSelectedDemande(null);
    } catch (error) {
      logger.error('Error linking transaction:', error);
      toast.error('Erreur lors de la liaison de la transaction');
    }
  };

  const handleUnlinkDemand = async (demandId: string) => {
    const demande = allDemandes.find(d => d.id === demandId);
    if (!demande || !demande.transaction_id) return;

    try {
      // 1. Mettre à jour la demande dans Firestore
      const demandeRef = doc(db, 'clubs', clubId, 'demandes_remboursement', demandId);
      await updateDoc(demandeRef, {
        transaction_id: deleteField(),
        statut: 'approuve',
        date_remboursement: deleteField(),
        updated_at: serverTimestamp()
      });

      // 2. Mettre à jour la transaction dans Firestore
      const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', demande.transaction_id);
      await updateDoc(txRef, {
        expense_claim_id: deleteField(),
        reconcilie: false,
        matched_entities: deleteField(),
        updated_at: serverTimestamp()
      });

      // 3. Mettre à jour l'état local
      setAllDemandes(prev => prev.map(d =>
        d.id === demandId
          ? { ...d, transaction_id: undefined, statut: 'approuve' as const, date_remboursement: undefined }
          : d
      ));

      setExpenseTransactions(prev => prev.map(t =>
        t.id === demande.transaction_id
          ? { ...t, expense_claim_id: undefined, reconcilie: false, matched_entities: undefined }
          : t
      ));

      toast.success('Demande déliée de la transaction');
    } catch (error) {
      logger.error('Error unlinking demand:', error);
      toast.error('Erreur lors du délien de la demande');
    }
  };

  const handleAutoMatch = async () => {
    const results = await ReconciliationService.performAutoReconciliation(
      expenseTransactions,
      allDemandes.filter(d => d.statut === 'approuve')
    );

    if (results.autoReconciled.length > 0) {
      results.autoReconciled.forEach(match => {
        const transaction = expenseTransactions.find(t => t.id === match.transaction_id);
        const demande = allDemandes.find(d => d.id === match.matched_with.id);

        if (transaction && demande) {
          handleLinkTransaction(transaction, demande);
        }
      });

      toast.success(`${results.autoReconciled.length} correspondances automatiques trouvées`);
    } else {
      toast('Aucune correspondance automatique trouvée', {
        icon: 'ℹ️',
        style: {
          background: '#EFF6FF',
          color: '#1E40AF',
          border: '1px solid #BFDBFE'
        }
      });
    }
  };

  const handleLinkTransactions = async (transactionIds: string[]) => {
    if (!linkingDemandId) return;

    const demande = allDemandes.find(d => d.id === linkingDemandId);
    if (!demande) return;

    try {
      for (const txId of transactionIds) {
        const transaction = expenseTransactions.find(t => t.id === txId);
        if (!transaction) continue;

        // Ajouter ou mettre à jour l'entité liée
        const existingEntities = transaction.matched_entities || [];
        const newEntity = {
          entity_type: 'demand' as const,
          entity_id: demande.id,
          entity_name: demande.description,
          confidence: 100,
          matched_at: new Date(),
          matched_by: 'manual' as const
        };

        // Vérifier si cette demande n'est pas déjà liée
        const alreadyLinked = existingEntities.some(
          e => (e.entity_type === 'expense' || e.entity_type === 'demand') && e.entity_id === demande.id
        );

        if (!alreadyLinked) {
          const transactionRef = doc(db, 'clubs', clubId, 'transactions_bancaires', txId);
          await updateDoc(transactionRef, {
            reconcilie: true,
            matched_entities: [...existingEntities, newEntity],
            updated_at: serverTimestamp()
          });
        }
      }

      // ✅ AUTO-UPDATE: If demand is 'approuve', automatically mark as 'rembourse'
      if (demande.statut === 'approuve') {
        const demandeRef = doc(db, 'clubs', clubId, 'demandes_remboursement', linkingDemandId);
        await updateDoc(demandeRef, {
          statut: 'rembourse',
          date_remboursement: serverTimestamp(),
          updated_at: serverTimestamp()
        });
        logger.debug('✅ [AUTO-UPDATE] Demand status updated: approuve → rembourse');
        // Email notification is now handled by Firebase Cloud Function (onExpenseStatusChange)
        logger.debug('📧 Expense reimbursed - email will be sent by Cloud Function');
      }

      // Reload transactions AND demands to get fresh data
      await loadExpenseTransactions();
      await loadDemandes();

      // Refresh the detail view to show the newly linked transaction
      if (detailViewDemand && detailViewDemand.id === linkingDemandId) {
        // Fetch the updated demand from Firestore to get the fresh linked transactions
        const demandeDoc = await getDoc(doc(db, 'clubs', clubId, 'demandes_remboursement', linkingDemandId));
        if (demandeDoc.exists()) {
          const updatedDemande = {
            id: demandeDoc.id,
            ...demandeDoc.data()
          } as DemandeRemboursement;

          setDetailViewDemand(null); // Close
          setTimeout(() => {
            setDetailViewDemand(updatedDemande); // Reopen with fresh data from Firestore
          }, 100);
        }
      }

      // Show appropriate success message
      if (demande.statut === 'approuve') {
        toast.success(`Transaction(s) liée(s) → Demande marquée comme remboursée ✓`);
      } else {
        toast.success(`${transactionIds.length} transaction(s) liée(s) à la dépense`);
      }
    } catch (error) {
      logger.error('Error linking transactions:', error);
      toast.error('Erreur lors de la liaison des transactions');
    }
  };

  const handleLinkOperation = async (operationIds: string[]) => {
    if (!linkingOperationDemandId) return;

    const demande = allDemandes.find(d => d.id === linkingOperationDemandId);
    if (!demande) return;

    try {
      const demandeRef = doc(db, 'clubs', clubId, 'demandes_remboursement', linkingOperationDemandId);

      // Une dépense ne peut être liée qu'à UNE seule opération
      // On prend la première opération sélectionnée
      const operationId = operationIds.length > 0 ? operationIds[0] : null;

      if (operationId) {
        // Link to operation
        const operation = evenements.find(e => e.id === operationId);
        await updateDoc(demandeRef, {
          evenement_id: operationId,
          evenement_titre: operation?.titre || 'Activité',
          updated_at: serverTimestamp()
        });
        toast.success('Activité liée à la dépense');
      } else {
        // Unlink operation
        await updateDoc(demandeRef, {
          evenement_id: null,
          evenement_titre: null,
          updated_at: serverTimestamp()
        });
        toast.success('Activité déliée de la dépense');
      }

      // Close panel and reload demands
      setShowOperationLinking(false);
      setLinkingOperationDemandId(null);
      await loadDemandes();
    } catch (error) {
      logger.error('Error linking operation:', error);
      toast.error('Erreur lors de la liaison de l\'activité');
    }
  };

  const handleUnlinkEvent = async () => {
    if (!detailViewDemand) return;

    try {
      const demandeRef = doc(db, 'clubs', clubId, 'demandes_remboursement', detailViewDemand.id);

      await updateDoc(demandeRef, {
        evenement_id: null,
        evenement_titre: null,
        updated_at: serverTimestamp()
      });

      toast.success('Activité déliée de la dépense');
      await loadDemandes();
    } catch (error) {
      logger.error('Error unlinking operation:', error);
      toast.error('Erreur lors du déliaison de l\'activité');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text-primary">Gestion des dépenses</h1>
            <p className="text-gray-600 dark:text-dark-text-secondary mt-1">Dépenses et réconciliation bancaire</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleNewExpense}
              className="flex items-center gap-2 px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue-dark transition-colors"
            >
              <Plus className="h-4 w-4" />
              Nouvelle dépense
            </button>
          </div>
        </div>
      </div>


      {/* Header - Removed tabs, keeping only title */}

      {/* Vue Demandes */}
      {activeView === 'demandes' && (
        <>
          {/* Barre de recherche et filtres */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border mb-6">
            <div className="p-4">
              <div className="flex flex-col lg:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-dark-text-muted" />
                    <input
                      type="text"
                      placeholder="Rechercher par description ou demandeur..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
                <select
                  className="px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  value={filterStatut}
                  onChange={(e) => setFilterStatut(e.target.value)}
                >
                  <option value="">Tous les statuts</option>
                  <option value="brouillon">Brouillon</option>
                  <option value="en_attente_validation">En attente de validation</option>
                  <option value="approuve">Approuvé</option>
                  <option value="cree_banque_attente_validation">Créé dans banque</option>
                  <option value="paiement_effectue">Paiement effectué</option>
                  <option value="rembourse">Remboursé</option>
                  <option value="refuse">Refusé</option>
                </select>
                <select
                  className="px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  value={filterReconcilie}
                  onChange={(e) => setFilterReconcilie(e.target.value)}
                >
                  <option value="">Tous (réconciliation)</option>
                  <option value="oui">Réconcilié</option>
                  <option value="non">Non réconcilié</option>
                </select>
                {/* Filter for modified amounts */}
                <button
                  onClick={() => setFilterMontantModified(!filterMontantModified)}
                  className={cn(
                    "px-4 py-2 border rounded-lg flex items-center gap-2 transition-colors",
                    filterMontantModified
                      ? "bg-amber-100 border-amber-500 text-amber-700 dark:bg-amber-900/30 dark:border-amber-500 dark:text-amber-400"
                      : "border-gray-300 dark:border-dark-border text-gray-600 dark:text-dark-text-secondary hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary"
                  )}
                  title="Afficher uniquement les demandes avec montant modifié"
                >
                  <AlertTriangle className="h-4 w-4" />
                  <span className="hidden sm:inline">Montants modifiés</span>
                  {filterMontantModified && (
                    <span className="text-xs bg-amber-200 dark:bg-amber-800 px-1.5 py-0.5 rounded">
                      {allDemandes.filter(d => d.montant_modified).length}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Table des demandes */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-dark-bg-tertiary border-b border-gray-200 dark:border-dark-border">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                      Description & Liaisons
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-secondary"
                      onClick={() => handleSort('date')}
                    >
                      <div className="flex items-center gap-1">
                        Date
                        {sortField === 'date' ? (
                          sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-secondary"
                      onClick={() => handleSort('montant')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Montant
                        {sortField === 'montant' ? (
                          sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-secondary"
                      onClick={() => handleSort('statut')}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Statut
                        {sortField === 'statut' ? (
                          sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider w-20">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredDemandes.map((demande) => {
                    // Check if any transaction has this demand in its matched_entities
                    const linkedTransaction = expenseTransactions.find(t =>
                      t.matched_entities?.some(e => (e.entity_type === 'expense' || e.entity_type === 'demand') && e.entity_id === demande.id)
                    );

                    return (
                      <tr
                        key={demande.id}
                        id={`demand-${demande.id}`}
                        className={cn(
                          "hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors cursor-pointer",
                          lastViewedDemandId === demande.id && "bg-blue-100"
                        )}
                        onClick={() => {
                          setLastViewedDemandId(demande.id);
                          setDetailViewDemand(demande);
                        }}
                      >
                        <td className="px-6 py-4">
                          <div>
                            {/* Description principale */}
                            <p className="font-medium text-gray-900 dark:text-dark-text-primary">{demande.description}</p>
                            <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-0.5">
                              {demande.demandeur_nom || '-'}
                            </p>

                            {/* Liaisons (Transaction + Opération) - Compact */}
                            {(linkedTransaction || demande.evenement_titre || demande.operation_titre) && (
                              <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-dark-text-muted">
                                {/* Transaction liée */}
                                {linkedTransaction && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded">
                                    #{linkedTransaction.numero_sequence} {formatMontant(linkedTransaction.montant)}
                                  </span>
                                )}

                                {/* Opération liée */}
                                {(demande.evenement_titre || demande.operation_titre) && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 rounded truncate max-w-xs">
                                    <Users className="h-3 w-3 flex-shrink-0" />
                                    {demande.operation_titre || demande.evenement_titre}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Double approbation */}
                            {demande.requires_double_approval && (
                              <div className="mt-1 flex items-center gap-1 text-xs text-orange-600">
                                <Shield className="h-3 w-3" />
                                <span>Double approbation</span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-dark-text-secondary">
                          {demande.date_depense ? formatDate(demande.date_depense) : '-'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {demande.montant_modified && (
                              <AlertTriangle
                                className="h-4 w-4 text-amber-500"
                                title="Montant modifié après création"
                              />
                            )}
                            <p className="font-semibold text-red-600 dark:text-red-400">-{formatMontant(demande.montant)}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <ApprovalBadge demand={demande} showDetails={false} />
                        </td>
                        <td className="px-6 py-4 text-center whitespace-nowrap">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setLastViewedDemandId(demande.id);
                              setDetailViewDemand(demande);
                            }}
                            className="inline-flex items-center justify-center p-2 text-calypso-blue hover:bg-calypso-blue hover:text-white rounded transition-colors"
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
          </div>
        </>
      )}

      {/* Vue Matching */}
      {activeView === 'matching' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Colonne Demandes approuvées */}
          <div>
            <h3 className="font-medium text-gray-900 dark:text-dark-text-primary mb-4">Demandes approuvées en attente</h3>
            <div className="space-y-3">
              {allDemandes.filter(d => d.statut === 'approuve' && !d.transaction_id).map(demande => (
                <div 
                  key={demande.id}
                  className={cn(
                    "p-4 bg-white border rounded-lg cursor-pointer transition-colors",
                    selectedDemande?.id === demande.id 
                      ? "border-purple-500 bg-purple-50" 
                      : "border-gray-200 dark:border-dark-border hover:border-gray-300 dark:border-dark-border"
                  )}
                  onClick={() => setSelectedDemande(demande)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{demande.description}</p>
                      <p className="text-sm text-gray-600 dark:text-dark-text-secondary">{demande.demandeur_nom}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {demande.montant_modified && (
                        <AlertTriangle className="h-4 w-4 text-amber-500" title="Montant modifié" />
                      )}
                      <p className="font-bold text-red-600 dark:text-red-400">-{formatMontant(demande.montant)}</p>
                    </div>
                  </div>
                </div>
              ))}
              {allDemandes.filter(d => d.statut === 'approuve' && !d.transaction_id).length === 0 && (
                <p className="text-gray-500 dark:text-dark-text-muted text-center py-8">Aucune demande approuvée en attente</p>
              )}
            </div>
          </div>

          {/* Colonne Transactions non réconciliées */}
          <div>
            <h3 className="font-medium text-gray-900 dark:text-dark-text-primary mb-4">Transactions bancaires non réconciliées</h3>
            <div className="space-y-3">
              {unmatchedTransactions.map(transaction => (
                <div 
                  key={transaction.id}
                  className={cn(
                    "p-4 bg-white border rounded-lg cursor-pointer transition-colors",
                    selectedTransaction?.id === transaction.id 
                      ? "border-orange-500 bg-orange-50" 
                      : "border-gray-200 dark:border-dark-border hover:border-gray-300 dark:border-dark-border"
                  )}
                  onClick={() => setSelectedTransaction(transaction)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{transaction.contrepartie_nom}</p>
                      <p className="text-sm text-gray-600 dark:text-dark-text-secondary">{transaction.communication}</p>
                      <p className="text-xs text-gray-500 dark:text-dark-text-muted">{formatDate(transaction.date_execution)}</p>
                    </div>
                    <p className="font-bold text-red-600 dark:text-red-400">{formatMontant(transaction.montant)}</p>
                  </div>
                </div>
              ))}
              {unmatchedTransactions.length === 0 && (
                <p className="text-gray-500 dark:text-dark-text-muted text-center py-8">Toutes les transactions sont réconciliées</p>
              )}
            </div>
          </div>

          {/* Bouton de liaison */}
          {selectedDemande && selectedTransaction && (
            <div className="col-span-2 flex justify-center">
              <button
                onClick={() => handleLinkTransaction(selectedTransaction, selectedDemande)}
                className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <Link2 className="h-5 w-5" />
                Lier la transaction à la demande
              </button>
            </div>
          )}
        </div>
      )}

      {/* Vue Transactions */}
      {activeView === 'transactions' && (
        <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-dark-bg-tertiary">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">Bénéficiaire</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">Communication</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">Montant</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">Statut</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">Lié à</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                {expenseTransactions.map(transaction => (
                  <tr key={transaction.id} className="hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary">
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-dark-text-primary">{formatDate(transaction.date_execution)}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-dark-text-primary">{transaction.contrepartie_nom}</td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-dark-text-primary">{transaction.communication}</td>
                    <td className="px-6 py-4 text-sm font-bold text-red-600 dark:text-red-400 text-right">
                      {formatMontant(transaction.montant)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {transaction.reconcilie ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs rounded-full">
                          <Check className="h-3 w-3" />
                          Réconcilié
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-xs rounded-full">
                          En attente
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {transaction.matched_entities && transaction.matched_entities.length > 0 ? (
                        <div className="space-y-1">
                          {transaction.matched_entities.map((entity, idx) => (
                            <div key={idx} className="text-xs">
                              <span className="font-medium">{entity.entity_name}</span>
                              <span className="text-gray-500 dark:text-dark-text-muted ml-1">({entity.confidence}%)</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400 dark:text-dark-text-muted">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de refus */}
      {showRefusalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary mb-4">Refuser la demande</h2>
            
            <p className="text-sm text-gray-600 dark:text-dark-text-secondary mb-4">
              Veuillez indiquer le motif du refus pour cette dépense.
            </p>

            <textarea
              value={refusalReason}
              onChange={(e) => setRefusalReason(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              rows={4}
              placeholder="Motif du refus..."
            />

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowRefusalModal(null);
                  setRefusalReason('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={() => handleRefuseDemand(showRefusalModal)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Confirmer le refus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vue détaillée de la demande */}
      {detailViewDemand && (
        <DemandeDetailView
          demand={allDemandes.find(d => d.id === detailViewDemand.id) || detailViewDemand}
          linkedTransactions={expenseTransactions.filter(t =>
            t.id === detailViewDemand.transaction_id ||
            t.matched_entities?.some(e => (e.entity_type === 'expense' || e.entity_type === 'demand') && e.entity_id === detailViewDemand.id)
          )}
          clubSettings={clubSettings}
          currentUser={currentUser || undefined}
          membres={membres}
          evenements={evenements}
          isOpen={!!detailViewDemand}
          onClose={() => {
            if (detailViewDemand) {
              setLastViewedDemandId(detailViewDemand.id);
            }
            closeAllQuickViews();
            setDetailViewDemand(null);
          }}
          fromTransactionId={location.state?.fromTransactionId}
          navigationPosition={getNavigationPosition(filteredDemandes, detailViewDemand)}
          onNavigatePrevious={() => {
            const currentIndex = filteredDemandes.findIndex(d => d.id === detailViewDemand.id);
            if (currentIndex > 0) {
              setDetailViewDemand(filteredDemandes[currentIndex - 1]);
            } else {
              // Wrap to end
              setDetailViewDemand(filteredDemandes[filteredDemandes.length - 1]);
            }
          }}
          onNavigateNext={() => {
            const currentIndex = filteredDemandes.findIndex(d => d.id === detailViewDemand.id);
            if (currentIndex < filteredDemandes.length - 1) {
              setDetailViewDemand(filteredDemandes[currentIndex + 1]);
            } else {
              // Wrap to start
              setDetailViewDemand(filteredDemandes[0]);
            }
          }}
          onApprove={() => {
            handleApproveDemand(detailViewDemand.id);
            setLastViewedDemandId(detailViewDemand.id);
            setDetailViewDemand(null);
          }}
          onReject={(reason) => {
            setRefusalReason(reason);
            handleRefuseDemand(detailViewDemand.id);
            setLastViewedDemandId(detailViewDemand.id);
            setDetailViewDemand(null);
          }}
          onLinkTransaction={() => {
            setLinkingDemandId(detailViewDemand.id);
            setShowTransactionLinking(true);
          }}
          onLinkEvent={() => {
            setLinkingOperationDemandId(detailViewDemand.id);
            setShowOperationLinking(true);
          }}
          onViewTransaction={(transaction) => {
            openQuickView({ kind: 'transaction', transaction });
          }}
          onViewOperation={(operation) => {
            openQuickView({ kind: 'operation', operation: operation as unknown as Operation });
          }}
          onUnlinkEvent={handleUnlinkEvent}
          onUnlinkTransaction={async (transactionId) => {
            if (!transactionId) return;

            try {
              const transactionRef = doc(db, 'clubs', clubId, 'transactions_bancaires', transactionId);
              const transaction = expenseTransactions.find(t => t.id === transactionId);

              if (transaction) {
                // Retirer cette dépense des matched_entities
                const updatedEntities = transaction.matched_entities?.filter(
                  e => !((e.entity_type === 'expense' || e.entity_type === 'demand') && e.entity_id === detailViewDemand.id)
                ) || [];

                await updateDoc(transactionRef, {
                  matched_entities: updatedEntities.length > 0 ? updatedEntities : [],
                  reconcilie: updatedEntities.length > 0,
                  updated_at: serverTimestamp()
                });

                // Recharger les transactions AND demands to get fresh data
                await loadExpenseTransactions();
                await loadDemandes();

                // Refresh the detail view to update the transaction count
                if (detailViewDemand) {
                  // Fetch the updated demand from Firestore to get the fresh linked transactions
                  const demandeDoc = await getDoc(doc(db, 'clubs', clubId, 'demandes_remboursement', detailViewDemand.id));
                  if (demandeDoc.exists()) {
                    const updatedDemande = {
                      id: demandeDoc.id,
                      ...demandeDoc.data()
                    } as DemandeRemboursement;

                    setDetailViewDemand(null); // Close
                    setTimeout(() => {
                      setDetailViewDemand(updatedDemande); // Reopen with fresh data from Firestore
                    }, 100);
                  }
                }

                toast.success('Transaction déliée de la dépense');
              }
            } catch (error) {
              logger.error('Error unlinking transaction:', error);
              toast.error('Erreur lors du déliaison de la transaction');
            }
          }}
          onAddDocument={async (files) => {
            // Handle document upload to Firebase Storage with duplicate detection
            try {
              const demandId = detailViewDemand.id;
              const newFiles = Array.from(files);

              // Check for duplicates
              const { checkDuplicatesInAllExpenses, hashFile } = await import('@/services/documentDeduplicationService');
              const duplicates = await checkDuplicatesInAllExpenses(newFiles, clubId);

              let filesToUpload: File[] = newFiles;

              if (duplicates.length > 0) {
                // Build duplicate list for user dialog
                const duplicateList = duplicates
                  .map(d => `• ${d.file.name}\n  → Dépense "${d.demande.description}" (${d.demande.montant}€)`)
                  .join('\n');

                // Filter out duplicate files
                const duplicateFileNames = new Set(duplicates.map(d => d.file.name));
                const nonDuplicateFiles = newFiles.filter(f => !duplicateFileNames.has(f.name));

                // First dialog: Add duplicates?
                const addDuplicates = window.confirm(
                  `⚠️ ${duplicates.length} doublon(s) détecté(s):\n\n${duplicateList}\n\n` +
                  `Voulez-vous ajouter les doublons ?\n\n` +
                  `OK = Tout ajouter | Annuler = Voir les options`
                );

                logger.debug(`[DEBUG] addDuplicates decision: ${addDuplicates}`);
                logger.debug(`[DEBUG] Duplicates found: ${duplicates.length}`);
                logger.debug(`[DEBUG] Non-duplicate files: ${nonDuplicateFiles.length}`);
                logger.debug(`[DEBUG] Total files: ${newFiles.length}`);

                if (!addDuplicates && nonDuplicateFiles.length > 0) {
                  // Second dialog: Add only new files?
                  const addNew = window.confirm(
                    `Ajouter uniquement les ${nonDuplicateFiles.length} nouveau(x) fichier(s) ?`
                  );
                  if (!addNew) {
                    logger.debug('[DEBUG] User cancelled adding new files');
                    toast.info('Aucun fichier ajouté');
                    return;
                  }
                  logger.debug('[DEBUG] Adding only non-duplicate files');
                  filesToUpload = nonDuplicateFiles;
                } else if (!addDuplicates && nonDuplicateFiles.length === 0) {
                  logger.debug('[DEBUG] No new files to add, all are duplicates');
                  toast.info('Aucun nouveau fichier à ajouter');
                  return;
                } else if (!addDuplicates) {
                  logger.debug('[DEBUG] User cancelled, no files will be added');
                  toast.info('Aucun fichier ajouté');
                  return;
                } else {
                  // addDuplicates is true: user wants to add ALL files (including duplicates)
                  logger.debug('[DEBUG] User chose to add ALL files (including duplicates)');
                  filesToUpload = newFiles; // Explicitly set to all files
                }
              }

              if (filesToUpload.length === 0) {
                toast.info('Aucun fichier à ajouter');
                return;
              }

              // Upload selected files
              const newDocuments: DocumentJustificatif[] = [];

              for (const file of filesToUpload) {
                // Calculate hash BEFORE upload
                let fileHash: string | undefined;
                try {
                  fileHash = await hashFile(file);
                } catch (error) {
                  logger.error(`Error calculating hash for ${file.name}:`, error);
                }

                // Use justificatifs path which has the correct permissions
                const fileName = `${demandId}_${Date.now()}_${file.name}`;
                const storageRef = ref(storage, `clubs/${clubId}/justificatifs/${fileName}`);

                // Upload the file
                const snapshot = await uploadBytes(storageRef, file);
                const downloadURL = await getDownloadURL(snapshot.ref);

                // Create document object with metadata + hash
                const uploaderName = getLastName(appUser) || appUser?.email || 'Utilisateur';
                const document: DocumentJustificatif = {
                  url: downloadURL,
                  nom_original: file.name,
                  nom_affichage: file.name,
                  type: file.type,
                  taille: file.size,
                  date_upload: new Date(),
                  uploaded_by: appUser?.id,
                  uploaded_by_nom: uploaderName,
                  file_hash: fileHash  // ✨ NEW: Store hash for future duplicate detection
                };

                newDocuments.push(document);
              }

              // Update the demand with new documents in Firestore
              const demandRef = doc(db, 'clubs', clubId, 'demandes_remboursement', demandId);
              const existingDocs = detailViewDemand.documents_justificatifs || [];

              await updateDoc(demandRef, {
                documents_justificatifs: [...existingDocs, ...newDocuments],
                updated_at: serverTimestamp()
              });

              // Update local state
              setAllDemandes(prev => prev.map(d =>
                d.id === demandId
                  ? { ...d, documents_justificatifs: [...existingDocs, ...newDocuments] }
                  : d
              ));

              // Update detailViewDemand to show the new documents immediately
              setDetailViewDemand(prev => prev ? {
                ...prev,
                documents_justificatifs: [...existingDocs, ...newDocuments]
              } : null);

              // Show success message with duplicate info
              const skippedCount = newFiles.length - filesToUpload.length;
              let message = `${filesToUpload.length} document${filesToUpload.length > 1 ? 's' : ''} téléversé${filesToUpload.length > 1 ? 's' : ''}`;
              if (skippedCount > 0) {
                message += ` (${skippedCount} doublon${skippedCount > 1 ? 's' : ''} ignoré${skippedCount > 1 ? 's' : ''})`;
              }
              toast.success(message);
            } catch (error) {
              logger.error('Error uploading documents:', error);
              toast.error('Erreur lors du téléversement des documents');
            }
          }}
          onDelete={async () => {
            try {
              // 1. Nettoyer les liaisons AVANT de supprimer
              logger.debug(`🧹 Nettoyage des liaisons pour dépense ${detailViewDemand.id}...`);
              const cleanupStats = await linkCleanupService.cleanAfterExpenseDelete(
                detailViewDemand.id,
                clubId
              );

              // 2. Supprimer la dépense
              const demandeRef = doc(db, 'clubs', clubId, 'demandes_remboursement', detailViewDemand.id);
              await deleteDoc(demandeRef);

              // 3. Update local state
              setAllDemandes(prev => prev.filter(d => d.id !== detailViewDemand.id));

              // 4. Afficher message de succès avec stats
              if (cleanupStats.linksRemoved > 0) {
                toast.success(
                  `Dépense supprimée (${cleanupStats.linksRemoved} liaison(s) nettoyée(s))`
                );
              } else {
                toast.success('Demande supprimée avec succès');
              }

              setLastViewedDemandId(detailViewDemand.id);
              setDetailViewDemand(null);
            } catch (error) {
              logger.error('Error deleting demand:', error);
              toast.error('Erreur lors de la suppression de la demande');
            }
          }}
          onUpdate={async (updates) => {
            try {
              const demandeRef = doc(db, 'clubs', clubId, 'demandes_remboursement', detailViewDemand.id);
              await updateDoc(demandeRef, {
                ...updates,
                updated_at: serverTimestamp()
              });

              // Update local state
              setAllDemandes(prev => prev.map(d =>
                d.id === detailViewDemand.id
                  ? { ...d, ...updates }
                  : d
              ));

              // Update detailViewDemand to reflect changes
              setDetailViewDemand(prev => prev ? { ...prev, ...updates } : prev);

              toast.success('Dépense mise à jour avec succès');
            } catch (error) {
              logger.error('Error updating demand:', error);
              toast.error('Erreur lors de la mise à jour de la dépense');
            }
          }}
        />
      )}

      {/* Panel de liaison des transactions */}
      {linkingDemandId && showTransactionLinking && (
        <TransactionLinkingPanel
          isOpen={showTransactionLinking}
          onClose={() => {
            setShowTransactionLinking(false);
            setLinkingDemandId(null);
          }}
          transactions={expenseTransactions}
          linkedTransactionIds={
            expenseTransactions
              .filter(t => t.matched_entities?.some(e => (e.entity_type === 'expense' || e.entity_type === 'demand') && e.entity_id === linkingDemandId))
              .map(t => t.id)
          }
          onLinkTransactions={handleLinkTransactions}
          mode="expense"
          entityId={linkingDemandId}
          entityName={allDemandes.find(d => d.id === linkingDemandId)?.description || ''}
          entityDate={allDemandes.find(d => d.id === linkingDemandId)?.date_depense}
          theme="orange"
          onViewTransaction={(transaction) => {
            openQuickView({ kind: 'transaction', transaction });
          }}
        />
      )}

      {/* Panel de liaison des opérations - position left car detail panel est à droite */}
      {linkingOperationDemandId && showOperationLinking && (
        <OperationLinkingPanel
          isOpen={showOperationLinking}
          onClose={() => {
            setShowOperationLinking(false);
            setLinkingOperationDemandId(null);
          }}
          demande={allDemandes.find(d => d.id === linkingOperationDemandId) || null}
          operations={evenements as unknown as Operation[]}
          linkedOperationIds={allDemandes.find(d => d.id === linkingOperationDemandId)?.evenement_id ? [allDemandes.find(d => d.id === linkingOperationDemandId)!.evenement_id!] : []}
          onLinkOperations={handleLinkOperation}
          position="left"
        />
      )}

      {quickViews.map((quickView, index) => {
        const stackLevel = index + 2;

        if (quickView.kind === 'transaction') {
          return (
            <TransactionDetailView
              key={`quick-transaction-${quickView.transaction.id}-${index}`}
              transaction={quickView.transaction}
              demands={allDemandes}
              events={evenements as unknown as Evenement[]}
              membres={membres}
              isOpen={true}
              stackLevel={stackLevel}
              onClose={() => closeQuickViewsFrom(index)}
              onNavigateToEvent={(eventId) => {
                const operation = getOperationById(eventId);
                if (operation) {
                  openQuickView({ kind: 'operation', operation: operation as unknown as Operation });
                  return;
                }

                navigate('/operations', { state: { openEventId: eventId } });
              }}
              onNavigateToDemand={(demandId) => {
                const demand = allDemandes.find(item => item.id === demandId);
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
              linkedTransactions={expenseTransactions.filter(transaction =>
                transaction.id === quickView.demand.transaction_id ||
                transaction.matched_entities?.some(entity =>
                  (entity.entity_type === 'expense' || entity.entity_type === 'demand') && entity.entity_id === quickView.demand.id
                )
              )}
              clubSettings={clubSettings}
              currentUser={currentUser || undefined}
              membres={membres}
              evenements={evenements}
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

    </div>
  );
}
