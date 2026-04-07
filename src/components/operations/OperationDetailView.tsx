import React, { useState, useRef, useEffect, useMemo } from 'react';
import { logger } from '@/utils/logger';
import {
  X,
  Trash2,
  FileText,
  Upload,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Tag,
  Link2,
  Link2Off,
  Download,
  Eye,
  Save,
  Users,
  DollarSign,
  Search,
  UserPlus,
  Check,
  MessageCircle,
  Package
} from 'lucide-react';
import { Operation, TransactionBancaire, DemandeRemboursement, DocumentJustificatif, InscriptionEvenement, Membre, EventCategory } from '@/types';
import { getFirstName, getLastName } from '@/utils/fieldMapper';
import { SourceBadge } from '../evenements/SourceBadge';
import { FonctionBadge } from '../evenements/FonctionBadge';
import { MemberSelectionPanel, type MemberWithFonction, type GuestData } from '../evenements/MemberSelectionPanel';

// Lazy-load PalanqueeBuilder (heavy component met @dnd-kit)
const PalanqueeBuilder = React.lazy(() => import('@/components/evenements/PalanqueeBuilder'));
import { MemberSearchSelect } from '@/components/common/MemberSearchSelect';
import { formatMontant, formatDate, cn } from '@/utils/utils';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { db, storage } from '@/lib/firebase';
import { doc, updateDoc, serverTimestamp, collection, addDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { getMembres } from '@/services/membreService';
import { EventMessagesTab } from '../evenements/EventMessagesTab';
import { getValueList, sortValueListItems } from '@/services/valueListService';
import { OperationService } from '@/services/operationService';
import type { ValueListItem } from '@/types/valueList.types';
import { CommunicationModal } from '@/components/common/CommunicationModal';
import { summarizeOperationTransactions } from '@/utils/operationFinancials';
import { lifrasService } from '@/services/lifrasService';
import { ExerciceLIFRAS } from '@/types/lifras.types';
import { MemberObservationService } from '@/services/memberObservationService';
import type { MemberObservation, ObservationResult } from '@/types/memberObservation.types';
import { OBSERVATION_RESULTS } from '@/types/memberObservation.types';

// Helper: title-case a name string
function titleCaseName(s: string): string {
  return s.replace(/\b\w+/g, w =>
    w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  );
}

// Helper: normalize a string for name matching (remove accents, non-alpha chars)
function normalizeName(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');
}

// Helper: build a lookup to resolve bank transaction names to member names
// Matches by IBAN first (most reliable), then by normalized name
function buildMemberNameLookup(members: Membre[]): {
  byIban: Map<string, string>;
  byNormalizedName: Map<string, string>;
} {
  const byIban = new Map<string, string>();
  const byNormalizedName = new Map<string, string>();

  for (const m of members) {
    const firstName = getFirstName(m);
    const lastName = getLastName(m);
    if (!firstName && !lastName) continue;
    const displayName = `${firstName} ${lastName}`.trim();

    // Index by IBAN (normalized: no spaces)
    if (m.iban) {
      byIban.set(m.iban.replace(/\s/g, '').toUpperCase(), displayName);
    }

    // Index by normalized name variants (for name-based matching)
    // "Firstname Lastname" and "Lastname Firstname"
    const norm1 = normalizeName(`${firstName}${lastName}`);
    const norm2 = normalizeName(`${lastName}${firstName}`);
    if (norm1) byNormalizedName.set(norm1, displayName);
    if (norm2 && norm2 !== norm1) byNormalizedName.set(norm2, displayName);
  }

  return { byIban, byNormalizedName };
}

// Resolve a transaction's counterparty to a proper "Firstname Lastname" display
function resolveTransactionDisplayName(
  tx: { contrepartie_nom: string; contrepartie_iban?: string },
  lookup: ReturnType<typeof buildMemberNameLookup>
): string {
  const name = tx.contrepartie_nom || '';

  // 1. Try IBAN match (most reliable)
  if (tx.contrepartie_iban) {
    const ibanKey = tx.contrepartie_iban.replace(/\s/g, '').toUpperCase();
    const match = lookup.byIban.get(ibanKey);
    if (match) return match;
  }

  // 2. Try normalized name match
  const stripped = name.replace(/^(MME|MLE|MR|DR|M)\s+/i, '').trim();
  const nameNorm = normalizeName(stripped);
  if (nameNorm) {
    const match = lookup.byNormalizedName.get(nameNorm);
    if (match) return match;
  }

  // 3. Fallback: title-case the raw bank name (strip title prefix)
  return titleCaseName(stripped);
}

// Interface for auto-inscribe candidates
interface AutoInscribeCandidate {
  transaction: TransactionBancaire;
  matchedMember: Membre | null;
  matchConfidence: number;
  selectedMemberId: string | null;
  useExternalName: boolean; // True if using transaction name instead of member
  externalName: { prenom: string; nom: string }; // Parsed name from transaction
  price: number;
  isSelected: boolean;
  isAlreadyInscribed: boolean;
}

type LinkedOperationTransaction = TransactionBancaire & {
  __link_reasons?: string[];
  __can_unlink_operation?: boolean;
};

// Import inscription service for name similarity calculation
function calculateNameSimilarity(name1: string, name2: string): number {
  if (!name1 || !name2) return 0;

  const normalize = (s: string) => s.toLowerCase()
    .replace(/\b(mr|mme|mlle|dr|prof|m\.|mme\.|dr\.)\b/g, '')
    .replace(/\s+/g, '')
    .replace(/-/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const n1 = normalize(name1);
  const n2 = normalize(name2);

  if (n1 === n2) return 100;
  if (n1.includes(n2) || n2.includes(n1)) return 90;

  const extractWords = (s: string) => s.toLowerCase()
    .replace(/\b(mr|mme|mlle|dr|prof|m\.|mme\.|dr\.)\b/g, '')
    .split(/[\s-]+/)
    .filter(w => w.length > 1);

  const words1 = extractWords(name1);
  const words2 = extractWords(name2);

  let matchingWords = 0;
  for (const w1 of words1) {
    for (const w2 of words2) {
      if (w1 === w2 || w1.includes(w2) || w2.includes(w1)) {
        matchingWords++;
        break;
      }
    }
  }

  if (matchingWords > 0) {
    const ratio = matchingWords / Math.max(words1.length, words2.length);
    return Math.round(ratio * 100);
  }

  return 0;
}

interface OperationDetailViewProps {
  operation: Operation;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onSave?: (operation: Operation) => Promise<void>;
  onDelete?: () => void;
  onAddDocument?: (files: FileList) => void;
  onDeleteDocument?: (docUrl: string) => void;
  onUpdateDocument?: (updates: Partial<Operation>) => void;

  // Liaisons
  linkedTransactions?: TransactionBancaire[];
  linkedDemands?: DemandeRemboursement[];
  linkedInscriptions?: InscriptionEvenement[];
  onLinkTransaction?: () => void;
  onUnlinkTransaction?: (transactionId: string) => void;
  onViewTransaction?: (transaction: TransactionBancaire) => void;
  onLinkDemand?: () => void;
  onUnlinkDemand?: (demandId: string) => void;
  onViewDemand?: (demand: DemandeRemboursement) => void;
  onLinkInscriptionToTransaction?: (inscriptionId: string, transactionId: string) => Promise<void>;
  onUnlinkInscriptionTransaction?: (inscriptionId: string) => Promise<void>;
  onRefreshInscriptions?: () => Promise<void>;

  navigationPosition?: { current: number; total: number } | null;
  onNavigatePrevious?: () => void;
  onNavigateNext?: () => void;
  onOpenContext?: () => void;
  contextActionLabel?: string;
  stackLevel?: number;
}

export function OperationDetailView({
  operation,
  isOpen,
  onClose,
  onEdit: _onEdit,
  onSave,
  onDelete,
  onAddDocument,
  onDeleteDocument,
  onUpdateDocument,
  linkedTransactions = [],
  linkedDemands = [],
  linkedInscriptions = [],
  onLinkTransaction,
  onUnlinkTransaction,
  onViewTransaction,
  onLinkDemand,
  onUnlinkDemand,
  onViewDemand,
  onLinkInscriptionToTransaction,
  onUnlinkInscriptionTransaction,
  onRefreshInscriptions,
  navigationPosition,
  onNavigatePrevious,
  onNavigateNext,
  onOpenContext,
  contextActionLabel = 'Aller aux activités',
  stackLevel = 0
}: OperationDetailViewProps) {
  // Get clubId and user for smart categorization and messages
  const { clubId, user } = useAuth();

  // Determine which tabs to show based on operation type
  const showInscriptions = operation.type === 'evenement';
  // Balance is now always visible for all operation types
  const plannedAmount = (() => {
    const primaryAmount = Number(operation.montant_prevu);
    if (Number.isFinite(primaryAmount)) {
      return primaryAmount;
    }

    const legacyAmount = Number((operation as Operation & { budget_prevu_revenus?: number }).budget_prevu_revenus);
    if (Number.isFinite(legacyAmount)) {
      return legacyAmount;
    }

    return 0;
  })();

  const canUnlinkOperationTransaction = (transaction: TransactionBancaire) =>
    (transaction as LinkedOperationTransaction).__can_unlink_operation !== false;

  const getAvailableInscriptionTransactions = () =>
    linkedTransactions.filter(tx => {
      const linkedTransaction = tx as LinkedOperationTransaction;
      const hasInscriptionLink = tx.matched_entities?.some(e => e.entity_type === 'inscription')
        || linkedTransaction.__link_reasons?.includes('inscription_payment');
      return !tx.is_parent && tx.montant > 0 && !hasInscriptionLink;
    });
  const accountingSummary = useMemo(
    () => summarizeOperationTransactions(linkedTransactions),
    [linkedTransactions]
  );

  type Tab = 'overview' | 'categorization' | 'liaisons' | 'inscriptions' | 'messages' | 'balance' | 'documents';

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [selectedDocument, setSelectedDocument] = useState<DocumentJustificatif | null>(null);
  const [editingDocName, setEditingDocName] = useState<{ url: string; name: string } | null>(null);
  const [isEditing, setIsEditing] = useState(operation.id.startsWith('new-'));
  const [editedOperation, setEditedOperation] = useState<Operation>(operation);
  const [isSaving, setIsSaving] = useState(false);
  const [showMemberSelection, setShowMemberSelection] = useState(false);
  const [encadrants, setEncadrants] = useState<Membre[]>([]);
  const [showOrganisateurDropdown, setShowOrganisateurDropdown] = useState(false);
  const [showPalanqueeBuilder, setShowPalanqueeBuilder] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const infoDocInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingInfoDoc, setIsUploadingInfoDoc] = useState(false);

  // Auto-inscribe modal state
  const [isAutoInscribeModalOpen, setIsAutoInscribeModalOpen] = useState(false);
  const [autoInscribeCandidates, setAutoInscribeCandidates] = useState<AutoInscribeCandidate[]>([]);
  const [allMembers, setAllMembers] = useState<Membre[]>([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [isAutoInscribing, setIsAutoInscribing] = useState(false);

  // Build member lookup for resolving bank names → "Firstname Lastname"
  const memberNameLookup = useMemo(
    () => buildMemberNameLookup(allMembers),
    [allMembers]
  );

  // Fonction options for tariff dropdown
  const [fonctionOptions, setFonctionOptions] = useState<ValueListItem[]>([]);

  // Communication modal state
  const [showCommunicationModal, setShowCommunicationModal] = useState(false);
  const zIndexOffset = stackLevel * 40;
  const overlayZIndex = 100 + zIndexOffset;
  const auxiliaryZIndex = 110 + zIndexOffset;

  // Load LIFRAS exercise catalog for displaying exercises on inscriptions
  const [exerciceCatalog, setExerciceCatalog] = useState<Map<string, ExerciceLIFRAS>>(new Map());

  useEffect(() => {
    if (!clubId) return;
    lifrasService.getAllExercices(clubId).then(exercices => {
      const map = new Map<string, ExerciceLIFRAS>();
      exercices.forEach(ex => map.set(ex.id, ex));
      setExerciceCatalog(map);
    });
  }, [clubId]);

  // Exercise observations for this operation (memberId -> exerciceCode -> observation)
  const [exerciceObservations, setExerciceObservations] = useState<Map<string, Map<string, MemberObservation>>>(new Map());
  const [evaluationTarget, setEvaluationTarget] = useState<{
    memberId: string;
    memberName: string;
    exerciceCode: string;
    exerciceDescription: string;
    existing?: MemberObservation;
  } | null>(null);
  const [evaluationResult, setEvaluationResult] = useState<ObservationResult | null>(null);
  const [evaluationNote, setEvaluationNote] = useState('');
  const [isSavingEvaluation, setIsSavingEvaluation] = useState(false);

  // Load exercise observations for this operation
  useEffect(() => {
    if (!clubId || !operation?.id) return;
    const unsubscribe = MemberObservationService.subscribeToObservationsForSession(
      clubId,
      operation.id,
      (observations) => {
        const map = new Map<string, Map<string, MemberObservation>>();
        observations.forEach(obs => {
          if (obs.category === 'exercice_lifras' && obs.exerciceCode) {
            if (!map.has(obs.memberId)) map.set(obs.memberId, new Map());
            map.get(obs.memberId)!.set(obs.exerciceCode, obs);
          }
        });
        setExerciceObservations(map);
      }
    );
    return () => unsubscribe();
  }, [clubId, operation?.id]);

  // Load all members for CommunicationModal
  useEffect(() => {
    if (clubId && isOpen && allMembers.length === 0) {
      getMembres(clubId).then(members => {
        setAllMembers(members);
      }).catch(err => {
        logger.error('Error loading members for communication:', err);
      });
    }
  }, [clubId, isOpen]);
  useEffect(() => {
    setEditedOperation(operation);
    setIsEditing(operation.id.startsWith('new-'));
  }, [operation.id]);

  // Charger les encadrants pour la liste de suggestions
  useEffect(() => {
    if (clubId && operation.type === 'evenement') {
      // Charger tous les membres sans filtre pour éviter les erreurs d'index Firestore
      getMembres(clubId).then(members => {
        // Filtrer côté client : tous les membres avec "Encadrants" dans clubStatuten (actifs ou inactifs)
        const encadrantsList = members.filter(m =>
          m.clubStatuten?.includes('Encadrants')
        );
        logger.debug('Encadrants trouvés', {
          count: encadrantsList.length,
          names: encadrantsList.map(m => `${getFirstName(m)} ${getLastName(m)}`)
        });
        setEncadrants(encadrantsList);
      }).catch(err => {
        logger.error('Erreur chargement encadrants:', err);
      });
    }
  }, [clubId, operation.type]);

  // Load fonction options for tariff dropdown
  useEffect(() => {
    if (clubId && operation.type === 'evenement') {
      getValueList(clubId, 'fonction').then(list => {
        if (list) {
          setFonctionOptions(sortValueListItems(list.items));
        }
      }).catch(err => {
        logger.error('Erreur chargement fonctions:', err);
      });
    }
  }, [clubId, operation.type]);

  const handleAddParticipants = async (membersWithFonction: MemberWithFonction[]) => {
    if (!clubId) {
      logger.error('❌ No clubId available');
      toast.error('Erreur: clubId manquant');
      return;
    }

    if (!operation.id || operation.id.startsWith('new-')) {
      logger.error('❌ Cannot add participants to unsaved event');
      toast.error('Veuillez d\'abord sauvegarder l\'événement');
      return;
    }

    try {
      logger.debug('📝 Adding participants:', {
        membersWithFonction,
        operationId: operation.id,
        clubId
      });

      // Fetch full member data for the selected IDs
      const membersToAdd: Array<{ member: Membre; fonction: string }> = [];
      for (const { memberId, fonction } of membersWithFonction) {
        // Check for duplicates
        const isAlreadyRegistered = linkedInscriptions.some(i => i.membre_id === memberId);
        if (isAlreadyRegistered) {
          logger.warn('⚠️ Member already registered, skipping', { memberId });
          continue;
        }

        // Get member data from Firestore
        const memberRef = doc(db, 'clubs', clubId, 'members', memberId);
        const memberSnap = await getDoc(memberRef);
        if (memberSnap.exists()) {
          membersToAdd.push({
            member: { id: memberSnap.id, ...memberSnap.data() } as Membre,
            fonction
          });
        }
      }

      if (membersToAdd.length === 0) {
        toast.error('Aucun membre à ajouter (déjà inscrits ou introuvables)');
        return;
      }

      // Add all members
      const promises = membersToAdd.map(async ({ member, fonction }) => {
        // ✅ NOUVEAU : Calcul automatique du prix selon la fonction
        const { computeRegistrationPrice } = await import('@/utils/tariffUtils');
        const calculatedPrice = computeRegistrationPrice(operation, fonction);

        const newInscription: Omit<InscriptionEvenement, 'id'> = {
          evenement_id: operation.id,
          evenement_titre: operation.titre,
          membre_id: member.id,
          membre_nom: getLastName(member) || '',
          membre_prenom: getFirstName(member) || '',
          fonction: fonction, // Store selected fonction
          date_inscription: new Date(),
          paye: false,
          prix: calculatedPrice, // ✅ Prix calculé automatiquement selon la fonction
          mode_paiement: 'bank'
        };

        const docRef = await addDoc(collection(db, 'clubs', clubId, 'operations', operation.id, 'inscriptions'), {
          ...newInscription,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp()
        });

        logger.debug('✅ Inscription saved', {
          inscriptionId: docRef.id,
          firstName: getFirstName(member),
          lastName: getLastName(member),
          fonction
        });
        return docRef;
      });

      await Promise.all(promises);

      logger.debug('✅ All participants added successfully');

      // Refresh inscriptions
      if (onRefreshInscriptions) {
        await onRefreshInscriptions();
      }
    } catch (error) {
      logger.error('❌ Error adding participants:', error);
      toast.error('Erreur lors de l\'ajout des participants');
    }
  };

  // Handle adding a guest (non-member) to the operation
  const handleAddGuest = async (guest: GuestData) => {
    if (!clubId) {
      logger.error('❌ No clubId available');
      toast.error('Erreur: clubId manquant');
      return;
    }

    if (!operation.id || operation.id.startsWith('new-')) {
      logger.error('❌ Cannot add guest to unsaved event');
      toast.error('Veuillez d\'abord sauvegarder l\'événement');
      return;
    }

    try {
      logger.debug('📝 Adding guest:', {
        guest,
        operationId: operation.id,
        clubId
      });

      // Generate unique guest ID
      const guestId = `guest_${Date.now()}`;

      const newInscription: Omit<InscriptionEvenement, 'id'> = {
        evenement_id: operation.id,
        evenement_titre: operation.titre,
        membre_id: guestId,
        membre_nom: guest.nom,
        membre_prenom: guest.prenom,
        fonction: 'non_membre',
        date_inscription: new Date(),
        paye: false,
        prix: guest.prix,
        mode_paiement: 'bank',
        // Guest-specific fields
        is_guest: true,
        added_by: user?.uid || '',
        added_by_name: user?.displayName || user?.email || 'Admin'
      };

      const docRef = await addDoc(collection(db, 'clubs', clubId, 'operations', operation.id, 'inscriptions'), {
        ...newInscription,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      });

      logger.debug('✅ Guest inscription saved', {
        inscriptionId: docRef.id,
        firstName: guest.prenom,
        lastName: guest.nom
      });

      // Refresh inscriptions
      if (onRefreshInscriptions) {
        await onRefreshInscriptions();
      }
    } catch (error) {
      logger.error('❌ Error adding guest:', error);
      toast.error('Erreur lors de l\'ajout de l\'invité');
      throw error; // Re-throw to let MemberSelectionPanel handle it
    }
  };

  // Generate auto-inscribe candidates from linked transactions
  const generateAutoInscribeCandidates = async () => {
    if (!clubId) return;

    setIsLoadingCandidates(true);
    try {
      // Load all members if not already loaded
      let members = allMembers;
      if (members.length === 0) {
        members = await getMembres(clubId);
        setAllMembers(members);
      }

      // Get existing inscription member IDs to check for duplicates
      const existingMemberIds = new Set(linkedInscriptions.map(i => i.membre_id));

      // Filter linked transactions: only positive amounts not already linked to an inscription
      const incomeTransactions = getAvailableInscriptionTransactions();

      // Helper function to parse name from transaction contrepartie_nom
      const parseName = (fullName: string): { prenom: string; nom: string } => {
        if (!fullName) return { prenom: '', nom: '' };

        // Remove common prefixes like M, Mme, Mr, etc.
        const cleaned = fullName
          .replace(/^(M\.|Mme\.|Mr\.|Mlle\.|Dr\.|Prof\.|M |Mme |Mr |Mlle )/i, '')
          .trim();

        const parts = cleaned.split(/\s+/);
        if (parts.length === 1) {
          return { prenom: '', nom: parts[0] };
        }
        // Assume first word is last name (Belgian bank format: NOM PRENOM)
        // So we reverse: first part = nom, rest = prenom
        return {
          nom: parts[0],
          prenom: parts.slice(1).join(' ')
        };
      };

      // Generate candidates
      const candidates: AutoInscribeCandidate[] = incomeTransactions.map(tx => {
        // Try to find matching member by name
        let bestMatch: Membre | null = null;
        let bestConfidence = 0;

        const txName = tx.contrepartie_nom || '';
        const parsedName = parseName(txName);

        for (const member of members) {
          const memberFullName = `${getFirstName(member) || ''} ${getLastName(member) || ''}`.trim();
          const memberReverseName = `${getLastName(member) || ''} ${getFirstName(member) || ''}`.trim();

          // Calculate similarity for both name orders
          const similarity1 = calculateNameSimilarity(txName, memberFullName);
          const similarity2 = calculateNameSimilarity(txName, memberReverseName);
          const maxSimilarity = Math.max(similarity1, similarity2);

          if (maxSimilarity > bestConfidence) {
            bestConfidence = maxSimilarity;
            bestMatch = member;
          }
        }

        // Only consider it a match if confidence >= 50%
        if (bestConfidence < 50) {
          bestMatch = null;
          bestConfidence = 0;
        }

        const isAlreadyInscribed = bestMatch ? existingMemberIds.has(bestMatch.id) : false;

        return {
          transaction: tx,
          matchedMember: bestMatch,
          matchConfidence: bestConfidence,
          selectedMemberId: bestMatch?.id || null,
          useExternalName: false,
          externalName: parsedName,
          price: tx.montant,
          isSelected: bestMatch !== null && !isAlreadyInscribed && bestConfidence >= 70,
          isAlreadyInscribed
        };
      });

      setAutoInscribeCandidates(candidates);
      setIsAutoInscribeModalOpen(true);
    } catch (error) {
      logger.error('Error generating auto-inscribe candidates:', error);
      toast.error('Erreur lors de la génération des candidats');
    } finally {
      setIsLoadingCandidates(false);
    }
  };

  // Handle auto-inscribe: create inscriptions for selected candidates
  const handleAutoInscribe = async () => {
    if (!clubId) return;

    // Filter: selected AND (has member OR uses external name) AND not already inscribed
    const selectedCandidates = autoInscribeCandidates.filter(
      c => c.isSelected && (c.selectedMemberId || c.useExternalName) && !c.isAlreadyInscribed
    );

    if (selectedCandidates.length === 0) {
      toast.error('Aucun candidat sélectionné');
      return;
    }

    setIsAutoInscribing(true);
    try {
      let successCount = 0;
      let errorCount = 0;

      for (const candidate of selectedCandidates) {
        try {
          let membre_id = '';
          let membre_nom = '';
          let membre_prenom = '';
          let displayName = '';

          if (candidate.useExternalName) {
            // External: use parsed name from transaction, no membre_id
            membre_nom = candidate.externalName.nom;
            membre_prenom = candidate.externalName.prenom;
            displayName = `${membre_prenom} ${membre_nom}`.trim() || candidate.transaction.contrepartie_nom || 'Externe';
          } else {
            // Member: get from allMembers
            const member = allMembers.find(m => m.id === candidate.selectedMemberId);
            if (!member) {
              errorCount++;
              continue;
            }
            membre_id = member.id;
            membre_nom = getLastName(member) || '';
            membre_prenom = getFirstName(member) || '';
            displayName = `${membre_prenom} ${membre_nom}`.trim();
          }

          // Create inscription with transaction link
          const newInscription: Omit<InscriptionEvenement, 'id'> = {
            evenement_id: operation.id,
            evenement_titre: operation.titre,
            membre_id: membre_id, // Empty string for external
            membre_nom: membre_nom,
            membre_prenom: membre_prenom,
            fonction: candidate.useExternalName ? 'externe' : 'membre',
            date_inscription: new Date(),
            paye: true,
            prix: candidate.price,
            commentaire: candidate.useExternalName ? 'Externe (pas membre du club)' : '',
            mode_paiement: 'bank',
            transaction_id: candidate.transaction.id,
            transaction_montant: candidate.transaction.montant,
            date_paiement: new Date()
          };

          // Add inscription to Firestore
          const docRef = await addDoc(
            collection(db, 'clubs', clubId, 'operations', operation.id, 'inscriptions'),
            {
              ...newInscription,
              created_at: serverTimestamp(),
              updated_at: serverTimestamp()
            }
          );

          // Update transaction matched_entities to add inscription link
          const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', candidate.transaction.id);
          const txSnap = await getDoc(txRef);
          if (txSnap.exists()) {
            const txData = txSnap.data();
            const existingEntities = txData.matched_entities || [];
            const newEntity = {
              entity_type: 'inscription' as const,
              entity_id: docRef.id,
              entity_name: displayName,
              confidence: 100,
              matched_at: new Date(),
              matched_by: 'manual' as const
            };
            await updateDoc(txRef, {
              matched_entities: [...existingEntities, newEntity],
              reconcilie: true,
              updated_at: serverTimestamp()
            });
          }

          successCount++;
        } catch (err) {
          logger.error('Error creating inscription for candidate:', {
            candidate,
            selectedMemberId: candidate.selectedMemberId,
            useExternalName: candidate.useExternalName,
            isSelected: candidate.isSelected,
            error: err
          });
          errorCount++;
        }
      }

      // Show result
      if (successCount > 0 && errorCount === 0) {
        toast.success(`${successCount} inscription(s) créée(s) avec succès`);
      } else if (successCount > 0 && errorCount > 0) {
        toast.success(`${successCount} inscription(s) créée(s), ${errorCount} erreur(s)`);
      } else {
        toast.error('Erreur lors de la création des inscriptions');
      }

      // Close modal and refresh
      setIsAutoInscribeModalOpen(false);
      if (onRefreshInscriptions) {
        await onRefreshInscriptions();
      }
    } catch (error) {
      logger.error('Error in handleAutoInscribe:', error);
      toast.error('Erreur lors de l\'inscription automatique');
    } finally {
      setIsAutoInscribing(false);
    }
  };

  // Update candidate selection
  const updateCandidateSelection = (index: number, isSelected: boolean) => {
    setAutoInscribeCandidates(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], isSelected };
      return updated;
    });
  };

  // Update candidate member selection (memberId can be 'externe' for external)
  const updateCandidateMember = (index: number, value: string | null) => {
    setAutoInscribeCandidates(prev => {
      const updated = [...prev];
      const isExternal = value === 'externe';
      const memberId = isExternal ? null : value;
      const member = memberId ? allMembers.find(m => m.id === memberId) : null;
      const existingMemberIds = new Set(linkedInscriptions.map(i => i.membre_id));
      const isAlreadyInscribed = member ? existingMemberIds.has(member.id) : false;
      updated[index] = {
        ...updated[index],
        selectedMemberId: memberId,
        matchedMember: member || null,
        useExternalName: isExternal,
        isAlreadyInscribed: isExternal ? false : isAlreadyInscribed,
        isSelected: (memberId !== null || isExternal) && !isAlreadyInscribed
      };
      return updated;
    });
  };

  // Update candidate price
  const updateCandidatePrice = (index: number, price: number) => {
    setAutoInscribeCandidates(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], price };
      return updated;
    });
  };

  // Update candidate external name (prenom/nom)
  const updateCandidateExternalName = (index: number, field: 'prenom' | 'nom', value: string) => {
    setAutoInscribeCandidates(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        externalName: {
          ...updated[index].externalName,
          [field]: value
        }
      };
      return updated;
    });
  };

  const [deleteConfirmation, setDeleteConfirmation] = useState<{ inscriptionId: string; memberName: string } | null>(null);
  const isDeletingRef = useRef(false);

  const handleDeleteInscription = async (inscriptionId: string, memberName: string) => {
    // Show confirmation dialog
    setDeleteConfirmation({ inscriptionId, memberName });
  };

  const confirmDelete = async () => {
    if (!deleteConfirmation) return;

    const { inscriptionId } = deleteConfirmation;

    // Guard against multiple simultaneous calls
    if (isDeletingRef.current) {
      logger.debug('⏸️ Deletion already in progress, ignoring');
      return;
    }

    if (!clubId) {
      logger.error('❌ No clubId available');
      setDeleteConfirmation(null);
      return;
    }

    logger.debug('🗑️ Deleting inscription:', {
      inscriptionId,
      operationId: operation.id,
      clubId,
      path: `clubs/${clubId}/operations/${operation.id}/inscriptions/${inscriptionId}`
    });

    // Set guard
    isDeletingRef.current = true;

    try {
      // Delete from Firestore subcollection
      await deleteDoc(doc(db, 'clubs', clubId, 'operations', operation.id, 'inscriptions', inscriptionId));

      logger.debug('✅ Inscription deleted from Firestore');
      toast.success('Inscription supprimée');

      // Refresh inscriptions
      if (onRefreshInscriptions) {
        logger.debug('🔄 Calling onRefreshInscriptions...');
        await onRefreshInscriptions();
      } else {
        logger.warn('⚠️ onRefreshInscriptions is not defined');
      }
    } catch (error) {
      logger.error('❌ Error deleting inscription:', error);
      toast.error('Erreur lors de la suppression');
    } finally {
      // Release guard and close dialog
      isDeletingRef.current = false;
      setDeleteConfirmation(null);
    }
  };

  const cancelDelete = () => {
    setDeleteConfirmation(null);
  };

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      logger.debug('🔑 [OperationDetailView] ESC key pressed:', event.key);
      if (event.key === 'Escape' && !deleteConfirmation) {
        logger.debug('✅ [OperationDetailView] Calling onClose from ESC');
        onClose();
      } else if (event.key === 'Escape' && deleteConfirmation) {
        logger.debug('⏸️ [OperationDetailView] ESC pressed - closing confirm dialog');
        cancelDelete();
      }
    };

    if (isOpen) {
      logger.debug('👂 [OperationDetailView] Adding ESC listener');
      document.addEventListener('keydown', handleEscKey);
    }

    return () => {
      logger.debug('🧹 [OperationDetailView] Removing ESC listener');
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [isOpen, onClose, deleteConfirmation]);

  if (!isOpen) return null;

  // Get documents
  const documents: DocumentJustificatif[] = operation.documents_justificatifs || [];

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && onAddDocument) {
      onAddDocument(e.target.files);
    }
  };

  const handleDocumentRename = async (docUrl: string, newName: string) => {
    if (!onUpdateDocument) return;

    const updatedDocs = documents.map(doc =>
      doc.url === docUrl ? { ...doc, nom_affichage: newName } : doc
    );

    await onUpdateDocument({ documents_justificatifs: updatedDocs });
    setEditingDocName(null);
    toast.success('Document renommé');
  };

  const handleDeleteDocument = async (docUrl: string) => {
    if (!onDeleteDocument) return;

    if (window.confirm('Êtes-vous sûr de vouloir supprimer ce document ?')) {
      await onDeleteDocument(docUrl);
    }
  };

  // Handle payment control - auto-match inscriptions to transactions by name
  const handleControlePaiements = async () => {
    if (!onLinkInscriptionToTransaction || !onRefreshInscriptions) {
      toast.error('Fonctionnalité non disponible');
      return;
    }

    try {
      let matchedCount = 0;

      // Get inscriptions that need a bank transaction link:
      // 1. Unpaid inscriptions (paye=false) — "Non payé"
      // 2. Paid but not yet linked to bank transaction (paye=true, no transaction_id) — "En attente bancaire"
      const unmatchedInscriptions = linkedInscriptions.filter(i => !i.transaction_id);
      const totalUnmatched = unmatchedInscriptions.length;

      if (totalUnmatched === 0) {
        toast('Toutes les inscriptions sont déjà liées à une transaction');
        return;
      }

      if (linkedTransactions.length === 0) {
        toast.error('Aucune transaction liée à cet événement');
        return;
      }

      // Get available transactions (not already linked, not parent, positive amount)
      const availableTransactions = getAvailableInscriptionTransactions();

      if (availableTransactions.length === 0) {
        toast.error('Aucune transaction disponible pour le matching');
        return;
      }

      toast(`Analyse de ${totalUnmatched} inscription(s) sans transaction...`);

      // Try to match each unmatched inscription
      for (const inscription of unmatchedInscriptions) {
        const inscriptionName = `${inscription.membre_prenom || ''} ${inscription.membre_nom || ''}`.trim();
        logger.debug(`🔍 Trying to match inscription: ${inscriptionName}`);

        let bestMatch: { transaction: TransactionBancaire; score: number } | null = null;

        // Find best matching transaction
        for (const transaction of availableTransactions) {
          // Try matching against contrepartie_nom
          let score = calculateNameSimilarity(inscriptionName, transaction.contrepartie_nom || '');

          // Log high scores for debugging
          if (score > 50) {
            logger.debug(`  📊 Score ${score} with transaction: ${transaction.contrepartie_nom}`);
          }

          // Also try matching against communication
          const commScore = calculateNameSimilarity(inscriptionName, transaction.communication || '');
          if (commScore > 50) {
            logger.debug(`  📝 Score ${commScore} with communication: ${transaction.communication}`);
          }
          score = Math.max(score, commScore);

          if (score >= 80 && (!bestMatch || score > bestMatch.score)) {
            bestMatch = { transaction, score };
          }
        }

        // If good match found, link it
        if (bestMatch && bestMatch.score >= 80) {
          try {
            await onLinkInscriptionToTransaction(inscription.id, bestMatch.transaction.id);
            matchedCount++;

            // Remove transaction from available pool
            const txIndex = availableTransactions.findIndex(t => t.id === bestMatch!.transaction.id);
            if (txIndex !== -1) {
              availableTransactions.splice(txIndex, 1);
            }
          } catch (error) {
            logger.error(`Failed to link inscription ${inscription.id}:`, error);
          }
        }
      }

      // Refresh inscriptions to show updated status
      await onRefreshInscriptions();

      // Show results
      const unmatched = totalUnmatched - matchedCount;
      if (matchedCount > 0) {
        toast.success(
          `✅ ${matchedCount} inscription(s) liée(s) automatiquement${unmatched > 0 ? ` • ${unmatched} à lier manuellement` : ''}`
        );
      } else {
        toast(`Aucun match automatique trouvé • ${totalUnmatched} à lier manuellement`);
      }
    } catch (error: any) {
      logger.error('Error during payment control:', error);
      toast.error(error.message || 'Erreur lors du contrôle des paiements');
    }
  };

  const handleSave = async () => {
    if (!onSave) return;

    if (!editedOperation.titre?.trim()) {
      toast.error('Le titre est obligatoire');
      return;
    }

    setIsSaving(true);
    try {
      await onSave(editedOperation);
      setIsEditing(false);
      toast.success('Activité sauvegardée');
    } catch (error) {
      logger.error('Error saving operation:', error);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  // Auto-save helper
  const handleAutoSave = async (updates: Partial<Operation>) => {
    if (!onSave || operation.id.startsWith('new-')) return;

    try {
      await onSave({ ...operation, ...updates });
      toast.success('Sauvegardé');
    } catch (error: unknown) {
      logger.error('Error auto-saving:', error);

      // Parse Firestore permission errors for better user feedback
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('permission-denied') || errorMessage.includes('PERMISSION_DENIED')) {
        toast.error('Permission refusée. Vérifiez votre rôle ou reconnectez-vous.', { duration: 5000 });
      } else if (errorMessage.includes('not-found')) {
        toast.error('Document non trouvé. Il a peut-être été supprimé.');
      } else if (errorMessage.includes('unavailable') || errorMessage.includes('network')) {
        toast.error('Erreur réseau. Vérifiez votre connexion.');
      } else {
        toast.error(`Erreur: ${errorMessage.slice(0, 100)}`, { duration: 5000 });
      }
    }
  };

  // Handler for uploading info document (single document next to description)
  const handleUploadInfoDocument = async (file: File) => {
    if (!clubId || !user || operation.id.startsWith('new-')) {
      toast.error('Impossible de télécharger le document');
      return;
    }

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Fichier trop volumineux (max 10 Mo)');
      return;
    }

    setIsUploadingInfoDoc(true);
    try {
      const timestamp = Date.now();
      const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storagePath = `clubs/${clubId}/operations/${operation.id}/info_${timestamp}_${sanitizedFilename}`;

      const storageReference = storageRef(storage, storagePath);
      await uploadBytes(storageReference, file);
      const downloadUrl = await getDownloadURL(storageReference);

      const infoDoc: DocumentJustificatif = {
        url: downloadUrl,
        nom_original: file.name,
        nom_affichage: file.name,
        type: file.type,
        taille: file.size,
        date_upload: new Date(),
        uploaded_by: user.uid,
        uploaded_by_nom: user.displayName || user.email || 'Utilisateur',
      };

      // Update Firestore
      const operationRef = doc(db, 'clubs', clubId, 'operations', operation.id);
      await updateDoc(operationRef, {
        info_document: infoDoc,
        updated_at: serverTimestamp(),
      });

      // Update local state
      setEditedOperation({ ...editedOperation, info_document: infoDoc });
      toast.success('Document ajouté');
    } catch (error) {
      logger.error('Error uploading info document:', error);
      toast.error('Erreur lors du téléchargement');
    } finally {
      setIsUploadingInfoDoc(false);
    }
  };

  // Handler for deleting info document
  const handleDeleteInfoDocument = async () => {
    if (!clubId || !editedOperation.info_document) return;

    try {
      // Delete from Storage
      const url = editedOperation.info_document.url;
      if (url.includes('firebase')) {
        const pathMatch = url.match(/o\/(.+?)\?/);
        if (pathMatch) {
          const storagePath = decodeURIComponent(pathMatch[1]);
          const storageReference = storageRef(storage, storagePath);
          await deleteObject(storageReference).catch(() => {
            // File might not exist, ignore error
          });
        }
      }

      // Update Firestore
      const operationRef = doc(db, 'clubs', clubId, 'operations', operation.id);
      await updateDoc(operationRef, {
        info_document: null,
        updated_at: serverTimestamp(),
      });

      // Update local state
      setEditedOperation({ ...editedOperation, info_document: undefined });
      toast.success('Document supprimé');
    } catch (error) {
      logger.error('Error deleting info document:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  // Handler for category change - also updates event_number prefix (2=plongee, 3=sortie)
  const handleCategoryChange = async (newCategory: EventCategory) => {
    if (!onSave || operation.id.startsWith('new-') || !clubId) return;

    // Check if category actually changed
    if (operation.event_category === newCategory) return;

    try {
      const isDiveEvent = newCategory === 'plongee';

      // Generate new event_number with correct prefix
      const newEventNumber = await OperationService.generateEventNumber(clubId, isDiveEvent);
      logger.debug(`📝 Category changed to ${newCategory}, new event_number: ${newEventNumber}`);

      const updates = {
        event_category: newCategory,
        event_number: newEventNumber
      };

      setEditedOperation({ ...editedOperation, ...updates });
      await onSave({ ...operation, ...updates });
      toast.success(`Catégorie changée - nouveau numéro: ${newEventNumber}`);
    } catch (error) {
      logger.error('Error changing category:', error);
      toast.error('Erreur lors du changement de catégorie');
    }
  };

  const getStatusBadge = (statut: string) => {
    const styles = {
      brouillon: 'bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary dark:bg-gray-800 dark:text-gray-300',
      ouvert: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
      ferme: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
      annule: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
    };

    const labels = {
      brouillon: 'Brouillon',
      ouvert: 'En cours',
      ferme: 'Clôturé',
      annule: 'Annulé'
    };

    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${styles[statut as keyof typeof styles] || styles.brouillon}`}>
        {labels[statut as keyof typeof labels] || statut}
      </span>
    );
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      evenement: 'Événement',
      cotisation: 'Cotisation',
      caution: 'Caution',
      vente: 'Vente',
      subvention: 'Subvention',
      autre: 'Autre'
    };
    return labels[type] || type;
  };

  // Collect documents from linked expenses
  const linkedDemandsDocuments = linkedDemands.flatMap(demand =>
    (demand.documents_justificatifs || []).map(doc => ({
      ...doc,
      source: 'expense' as const,
      sourceName: demand.description || 'Dépense',
      sourceId: demand.id
    }))
  );

  // Total documents count (activity + linked expenses)
  // Helper: get observation color based on result
  const getObservationColor = (result?: ObservationResult | null): string => {
    switch (result) {
      case 'acquis': return 'green';
      case 'en_progres': return 'amber';
      case 'a_revoir': return 'red';
      default: return 'teal';
    }
  };

  // Helper: get observation icon based on result
  const getObservationIcon = (result?: ObservationResult | null): string => {
    switch (result) {
      case 'acquis': return '✓';
      case 'en_progres': return '⏳';
      case 'a_revoir': return '↻';
      default: return '';
    }
  };

  // Open evaluation dialog for an exercise
  const handleOpenEvaluation = (
    memberId: string,
    memberName: string,
    exerciceCode: string,
    exerciceDescription: string,
    existing?: MemberObservation,
  ) => {
    setEvaluationTarget({ memberId, memberName, exerciceCode, exerciceDescription, existing });
    setEvaluationResult((existing?.result as ObservationResult) || null);
    setEvaluationNote(existing?.note || '');
  };

  // Save evaluation (create or update observation)
  const handleSaveEvaluation = async () => {
    if (!evaluationTarget || !evaluationResult || !clubId || !user?.uid) return;
    setIsSavingEvaluation(true);
    try {
      if (evaluationTarget.existing) {
        await MemberObservationService.updateObservation(clubId, evaluationTarget.existing.id, {
          result: evaluationResult,
          note: evaluationNote,
        });
      } else {
        await MemberObservationService.createObservation(clubId, {
          memberId: evaluationTarget.memberId,
          memberName: evaluationTarget.memberName,
          memberNiveau: '',
          contextType: operation.event_category === 'plongee' ? 'plongee' : 'piscine',
          contextId: operation.id,
          contextDate: (operation.date_debut as any)?.toDate?.() || operation.date_debut || new Date(),
          contextTitle: operation.titre || '',
          category: 'exercice_lifras',
          exerciceCode: evaluationTarget.exerciceCode,
          exerciceDescription: evaluationTarget.exerciceDescription,
          result: evaluationResult,
          note: evaluationNote,
          observerId: user.uid,
          observerName: '',
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any);
      }
      setEvaluationTarget(null);
      toast.success('Évaluation enregistrée');
    } catch (err) {
      console.error('Error saving evaluation:', err);
      toast.error('Erreur lors de l\'enregistrement');
    } finally {
      setIsSavingEvaluation(false);
    }
  };

  const totalDocumentsCount = documents.length + linkedDemandsDocuments.length;

  // Build tabs array dynamically
  const tabs = [
    { id: 'overview', label: 'Vue d\'ensemble', icon: FileText },
    { id: 'liaisons', label: `Liaisons (${linkedTransactions.length + linkedDemands.length})`, icon: Link2 },
  ];

  if (showInscriptions) {
    tabs.push({ id: 'inscriptions', label: `Inscriptions (${linkedInscriptions.length})`, icon: Users });
    tabs.push({ id: 'messages', label: 'Messages', icon: MessageCircle });
  }

  tabs.push({ id: 'documents', label: `Documents (${totalDocumentsCount})`, icon: Upload });

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 flex items-end justify-end"
        style={{ zIndex: overlayZIndex }}
        onClick={() => {
          logger.debug('🖱️ [OperationDetailView] Overlay clicked');
          onClose();
        }}
      >
        <div
          className="bg-white dark:bg-dark-bg-primary h-full w-full md:w-[800px] flex flex-col shadow-2xl"
          onClick={(e) => {
            logger.debug('🚫 [OperationDetailView] Content clicked - stopPropagation');
            e.stopPropagation();
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-dark-border">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
                  {isEditing ? (editedOperation.titre || 'Nouvel événement') : operation.titre}
                </h2>
                {/* Event number badge for bank reconciliation */}
                {operation.event_number && (
                  <span className="px-2 py-1 rounded-md text-sm font-mono font-medium bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary dark:bg-dark-bg-tertiary dark:text-dark-text-secondary" title="Numéro unique pour réconciliation bancaire">
                    {operation.event_number}
                  </span>
                )}
                {getStatusBadge(isEditing ? editedOperation.statut : operation.statut)}
                <SourceBadge operation={operation} showLock={true} />
                {/* Badge catégorie d'événement */}
                {operation.type === 'evenement' && operation.event_category && (
                  <span className={cn(
                    "px-2 py-1 rounded-full text-xs font-medium",
                    operation.event_category === 'plongee'
                      ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                      : operation.event_category === 'piscine'
                      ? "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300"
                      : "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300"
                  )}>
                    {operation.event_category === 'plongee' ? '🤿 Plongée' : operation.event_category === 'piscine' ? '🏊 Piscine' : '🎉 Sortie'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
                <span className="flex items-center gap-1">
                  <Tag className="h-4 w-4" />
                  {getTypeLabel(operation.type)}
                </span>
                <span className="flex items-center gap-1">
                  <DollarSign className="h-4 w-4" />
                  {formatMontant(plannedAmount)}
                </span>
                {operation.date_debut && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {formatDate(operation.date_debut)}
                  </span>
                )}
              </div>
            </div>

            {/* Navigation arrows */}
            {navigationPosition && (
              <div className="flex items-center gap-2 mr-4">
                <button
                  onClick={onNavigatePrevious}
                  disabled={!onNavigatePrevious}
                  className="p-2 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Activité précédente (←)"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="text-sm text-gray-600 dark:text-dark-text-secondary">
                  {navigationPosition.current} / {navigationPosition.total}
                </span>
                <button
                  onClick={onNavigateNext}
                  disabled={!onNavigateNext}
                  className="p-2 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Activité suivante (→)"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-2">
              {onOpenContext && (
                <button
                  onClick={onOpenContext}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg font-medium border border-gray-200 dark:border-dark-border text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary transition-colors"
                  title={contextActionLabel}
                >
                  <Eye className="h-4 w-4" />
                  {contextActionLabel}
                </button>
              )}
              {/* Bouton Créer pour les nouveaux événements */}
              {operation.id.startsWith('new-') && onSave && (
                <button
                  onClick={handleSave}
                  disabled={isSaving || !editedOperation.titre?.trim()}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors",
                    isSaving || !editedOperation.titre?.trim()
                      ? "bg-gray-300 text-gray-500 dark:text-dark-text-muted cursor-not-allowed"
                      : "bg-green-600 text-white hover:bg-green-700"
                  )}
                  title="Créer l'activité"
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? 'Création...' : 'Créer'}
                </button>
              )}
              {onDelete && !operation.id.startsWith('new-') && (
                <button
                  onClick={() => {
                    if (window.confirm('Êtes-vous sûr de vouloir supprimer cette activité ?')) {
                      onDelete();
                    }
                  }}
                  className="p-2 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors text-red-600"
                  title="Supprimer l'activité"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              )}
              {/* Bouton Envoyer message */}
              {!operation.id.startsWith('new-') && clubId && allMembers.length > 0 && (
                <button
                  onClick={() => setShowCommunicationModal(true)}
                  className="p-2 hover:bg-purple-100 dark:hover:bg-purple-900/20 rounded-lg transition-colors text-purple-600"
                  title="Envoyer un message"
                >
                  <MessageCircle className="h-5 w-5" />
                </button>
              )}
              <button
                onClick={() => {
                  logger.debug('❌ [OperationDetailView] X button clicked');
                  onClose();
                }}
                className="p-2 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-dark-bg-secondary">
            <div className="flex overflow-x-auto">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as Tab)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2.5 border-b-2 font-medium text-sm whitespace-nowrap transition-colors",
                      activeTab === tab.id
                        ? "border-purple-600 text-purple-600 dark:text-purple-400"
                        : "border-transparent text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:text-dark-text-primary dark:hover:text-dark-text-primary"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'overview' && (
              <div className="p-6 space-y-6">
                {/* Titre */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Titre
                  </label>
                  <input
                    type="text"
                    value={editedOperation.titre}
                    onChange={(e) => setEditedOperation({ ...editedOperation, titre: e.target.value })}
                    onBlur={() => handleAutoSave({ titre: editedOperation.titre })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                {/* Description + Info Document */}
                <div className="flex gap-4">
                  {/* Description textarea */}
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                      Description
                    </label>
                    <textarea
                      value={editedOperation.description || ''}
                      onChange={(e) => setEditedOperation({ ...editedOperation, description: e.target.value })}
                      onBlur={() => handleAutoSave({ description: editedOperation.description })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                    />
                  </div>

                  {/* Info Document upload zone */}
                  <div className="w-28 flex-shrink-0 flex flex-col">
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1 text-center">
                      Document
                    </label>
                    <input
                      ref={infoDocInputRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUploadInfoDocument(file);
                        e.target.value = '';
                      }}
                    />
                    {editedOperation.info_document ? (
                      /* Document uploaded - show preview */
                      <div className="relative w-full flex-1 min-h-[76px] border border-gray-300 dark:border-dark-border rounded-lg overflow-hidden group bg-gray-50 dark:bg-dark-bg-tertiary">
                        {editedOperation.info_document.type.startsWith('image/') ? (
                          <img
                            src={editedOperation.info_document.url}
                            alt="Info document"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <FileText className="h-8 w-8 text-red-500" />
                          </div>
                        )}
                        {/* Hover overlay with actions */}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <button
                            onClick={() => window.open(editedOperation.info_document!.url, '_blank')}
                            className="p-1 bg-white rounded-full hover:bg-gray-100"
                            title="Voir"
                          >
                            <Eye className="h-4 w-4 text-gray-700" />
                          </button>
                          <button
                            onClick={handleDeleteInfoDocument}
                            className="p-1 bg-white rounded-full hover:bg-gray-100"
                            title="Supprimer"
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* No document - show upload zone */
                      <div
                        onClick={() => infoDocInputRef.current?.click()}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const file = e.dataTransfer.files?.[0];
                          if (file) handleUploadInfoDocument(file);
                        }}
                        className={cn(
                          "w-full flex-1 min-h-[76px] border-2 border-dashed border-gray-300 dark:border-dark-border rounded-lg",
                          "flex flex-col items-center justify-center cursor-pointer",
                          "hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors",
                          isUploadingInfoDoc && "opacity-50 pointer-events-none"
                        )}
                      >
                        {isUploadingInfoDoc ? (
                          <div className="animate-spin h-5 w-5 border-2 border-purple-500 border-t-transparent rounded-full" />
                        ) : (
                          <>
                            <Upload className="h-5 w-5 text-gray-400" />
                            <span className="text-xs text-gray-400 mt-1">PDF/Image</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Dates avec heures pour les événements - EN HAUT */}
                {operation.type === 'evenement' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                        <Calendar className="inline h-4 w-4 mr-1" />
                        Date et heure de début
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="date"
                          value={editedOperation.date_debut ? new Date(editedOperation.date_debut).toISOString().split('T')[0] : ''}
                          onChange={(e) => {
                            if (e.target.value) {
                              const currentDate = editedOperation.date_debut ? new Date(editedOperation.date_debut) : new Date();
                              const [year, month, day] = e.target.value.split('-').map(Number);
                              const newDate = new Date(year, month - 1, day, currentDate.getHours(), currentDate.getMinutes());
                              setEditedOperation({ ...editedOperation, date_debut: newDate });
                              handleAutoSave({ date_debut: newDate });
                            }
                          }}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                        <input
                          type="time"
                          value={(() => {
                            if (!editedOperation.date_debut) return '14:00';
                            const date = new Date(editedOperation.date_debut);
                            if (!isNaN(date.getTime())) {
                              const hours = date.getHours().toString().padStart(2, '0');
                              const minutes = date.getMinutes().toString().padStart(2, '0');
                              return `${hours}:${minutes}`;
                            }
                            return '14:00';
                          })()}
                          onChange={(e) => {
                            if (e.target.value) {
                              const [hours, minutes] = e.target.value.split(':').map(Number);
                              const currentDate = editedOperation.date_debut ? new Date(editedOperation.date_debut) : new Date();
                              const newDate = new Date(currentDate);
                              newDate.setHours(hours, minutes, 0, 0);
                              setEditedOperation({ ...editedOperation, date_debut: newDate });
                              handleAutoSave({ date_debut: newDate });
                            }
                          }}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                        Date et heure de fin
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="date"
                          value={editedOperation.date_fin ? new Date(editedOperation.date_fin).toISOString().split('T')[0] : ''}
                          onChange={(e) => {
                            if (e.target.value) {
                              const currentDate = editedOperation.date_fin ? new Date(editedOperation.date_fin) : new Date();
                              const [year, month, day] = e.target.value.split('-').map(Number);
                              const newDate = new Date(year, month - 1, day, currentDate.getHours() || 18, currentDate.getMinutes() || 0);
                              setEditedOperation({ ...editedOperation, date_fin: newDate });
                              handleAutoSave({ date_fin: newDate });
                            } else {
                              setEditedOperation({ ...editedOperation, date_fin: undefined });
                              handleAutoSave({ date_fin: undefined });
                            }
                          }}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                        <input
                          type="time"
                          value={(() => {
                            if (!editedOperation.date_fin) return '';
                            const date = new Date(editedOperation.date_fin);
                            if (!isNaN(date.getTime())) {
                              const hours = date.getHours().toString().padStart(2, '0');
                              const minutes = date.getMinutes().toString().padStart(2, '0');
                              return `${hours}:${minutes}`;
                            }
                            return '';
                          })()}
                          onChange={(e) => {
                            if (e.target.value && editedOperation.date_fin) {
                              const [hours, minutes] = e.target.value.split(':').map(Number);
                              const currentDate = new Date(editedOperation.date_fin);
                              const newDate = new Date(currentDate);
                              newDate.setHours(hours, minutes, 0, 0);
                              setEditedOperation({ ...editedOperation, date_fin: newDate });
                              handleAutoSave({ date_fin: newDate });
                            }
                          }}
                          disabled={!editedOperation.date_fin}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Statut et Catégorie sur une ligne */}
                <div className={cn("grid gap-4", operation.type === 'evenement' ? "grid-cols-2" : "grid-cols-1")}>
                  {/* Statut */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                      Statut
                    </label>
                    <select
                      value={editedOperation.statut}
                      onChange={(e) => {
                        const newStatut = e.target.value as Operation['statut'];
                        setEditedOperation({ ...editedOperation, statut: newStatut });
                        handleAutoSave({ statut: newStatut });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                      <option value="brouillon">Brouillon</option>
                      <option value="ouvert">En cours</option>
                      <option value="ferme">Clôturé</option>
                      <option value="annule">Annulé</option>
                    </select>
                  </div>

                  {/* Catégorie d'événement (uniquement pour les événements) */}
                  {operation.type === 'evenement' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                        Catégorie
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleCategoryChange('plongee')}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors",
                            editedOperation.event_category === 'plongee'
                              ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30"
                              : "border-gray-200 dark:border-dark-border hover:border-gray-300 dark:border-dark-border dark:hover:border-gray-600"
                          )}
                        >
                          <span>🤿</span>
                          <span className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">Plongée</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCategoryChange('sortie')}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors",
                            editedOperation.event_category === 'sortie'
                              ? "border-orange-500 bg-orange-50 dark:bg-orange-900/30"
                              : "border-gray-200 dark:border-dark-border hover:border-gray-300 dark:border-dark-border dark:hover:border-gray-600"
                          )}
                        >
                          <span>🎉</span>
                          <span className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">Sortie</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Champs spécifiques aux événements */}
                {operation.type === 'evenement' && (
                  <>
                    {/* Lieu + Type de lieu */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                          Lieu
                        </label>
                        <input
                          type="text"
                          value={editedOperation.lieu || ''}
                          onChange={(e) => setEditedOperation({ ...editedOperation, lieu: e.target.value })}
                          onBlur={() => handleAutoSave({ lieu: editedOperation.lieu })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                          Type de lieu
                        </label>
                        <select
                          value={editedOperation.lieu_type || ''}
                          onChange={(e) => {
                            const val = (e.target.value || undefined) as Operation['lieu_type'];
                            setEditedOperation({ ...editedOperation, lieu_type: val });
                            handleAutoSave({ lieu_type: val });
                          }}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent appearance-none cursor-pointer"
                        >
                          <option value="">-- Sélectionner --</option>
                          <option value="Carrière">⛏️ Carrière</option>
                          <option value="Zélande">🌊 Zélande</option>
                          <option value="Mer du Nord">🚢 Mer du Nord</option>
                          <option value="Mer">🏖️ Mer</option>
                          <option value="Lac">🏞️ Lac</option>
                          <option value="Piscine">🏊 Piscine</option>
                          <option value="Autre">📍 Autre</option>
                        </select>
                      </div>
                    </div>

                    {/* Capacité et Organisateur sur la même ligne */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                          <Users className="inline h-4 w-4 mr-1" />
                          Capacité maximale
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={editedOperation.capacite_max || ''}
                          onChange={(e) => setEditedOperation({ ...editedOperation, capacite_max: e.target.value ? parseInt(e.target.value) : undefined })}
                          onBlur={() => handleAutoSave({ capacite_max: editedOperation.capacite_max })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          placeholder="Illimité"
                        />
                      </div>
                      <div className="relative">
                        <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                          Organisateur
                        </label>
                        <input
                          type="text"
                          value={editedOperation.organisateur_nom || ''}
                          onChange={(e) => {
                            setEditedOperation({ ...editedOperation, organisateur_nom: e.target.value });
                            setShowOrganisateurDropdown(true);
                          }}
                          onBlur={() => {
                            setTimeout(() => {
                              setShowOrganisateurDropdown(false);
                              handleAutoSave({ organisateur_nom: editedOperation.organisateur_nom });
                            }, 150);
                          }}
                          onFocus={() => setShowOrganisateurDropdown(true)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          placeholder="Taper ou sélectionner..."
                        />
                        {showOrganisateurDropdown && encadrants.length > 0 && (
                          <div className="absolute z-50 w-full mt-1 bg-white dark:bg-dark-bg-secondary border border-gray-300 dark:border-dark-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            {encadrants
                              .sort((a, b) => `${getFirstName(a)} ${getLastName(a)}`.localeCompare(`${getFirstName(b)} ${getLastName(b)}`))
                              .filter(m => {
                                const name = `${getFirstName(m)} ${getLastName(m)}`.toLowerCase();
                                const search = (editedOperation.organisateur_nom || '').toLowerCase();
                                return !search || name.includes(search);
                              })
                              .map(m => (
                                <div
                                  key={m.id}
                                  className="px-3 py-2 cursor-pointer hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    const name = `${getFirstName(m)} ${getLastName(m)}`;
                                    setEditedOperation({ ...editedOperation, organisateur_nom: name });
                                    handleAutoSave({ organisateur_nom: name });
                                    setShowOrganisateurDropdown(false);
                                  }}
                                >
                                  {getFirstName(m)} {getLastName(m)}
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Tarifs de l'événement */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                        Tarifs de l'événement
                      </label>
                      <div className="space-y-2">
                        {(editedOperation.event_tariffs || []).map((tariff, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <select
                              value={tariff.label}
                              onChange={(e) => {
                                const newTariffs = [...(editedOperation.event_tariffs || [])];
                                newTariffs[idx] = { ...newTariffs[idx], label: e.target.value };
                                setEditedOperation({ ...editedOperation, event_tariffs: newTariffs });
                                handleAutoSave({ event_tariffs: newTariffs });
                              }}
                              className="flex-1 px-3 py-2 border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                            >
                              <option value="">Sélectionner une fonction</option>
                              {fonctionOptions.map(option => (
                                <option key={option.value} value={option.label}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <div className="relative">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={tariff.price}
                                onChange={(e) => {
                                  const newTariffs = [...(editedOperation.event_tariffs || [])];
                                  newTariffs[idx] = { ...newTariffs[idx], price: parseFloat(e.target.value) || 0 };
                                  setEditedOperation({ ...editedOperation, event_tariffs: newTariffs });
                                }}
                                onBlur={() => handleAutoSave({ event_tariffs: editedOperation.event_tariffs })}
                                className="w-24 px-3 py-2 border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                                placeholder="Prix"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-dark-text-muted text-sm">€</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const newTariffs = (editedOperation.event_tariffs || []).filter((_, i) => i !== idx);
                                setEditedOperation({ ...editedOperation, event_tariffs: newTariffs });
                                handleAutoSave({ event_tariffs: newTariffs });
                              }}
                              className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                              title="Supprimer ce tarif"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            const existingTariffs = editedOperation.event_tariffs || [];
                            const newTariff = {
                              id: `tariff_${Date.now()}`,
                              label: '',
                              category: 'membre',
                              price: 0,
                              is_default: existingTariffs.length === 0,
                              display_order: existingTariffs.length
                            };
                            setEditedOperation({ ...editedOperation, event_tariffs: [...existingTariffs, newTariff] });
                          }}
                          className="w-full px-3 py-2 border border-dashed border-gray-300 dark:border-dark-border text-gray-600 dark:text-dark-text-secondary rounded-lg hover:border-purple-500 hover:text-purple-500 transition-colors text-sm"
                        >
                          + Ajouter un tarif
                        </button>
                      </div>
                    </div>

                    {/* Suppléments optionnels */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                        <Package className="inline h-4 w-4 mr-1" />
                        Suppléments optionnels
                      </label>
                      <p className="text-xs text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary mb-2">
                        Options additionnelles que les membres peuvent sélectionner lors de l'inscription (ex: location de combinaison)
                      </p>
                      <div className="space-y-2">
                        {(editedOperation.supplements || []).map((supplement, idx) => (
                          <div key={supplement.id || idx} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={supplement.name}
                              onChange={(e) => {
                                const newSupplements = [...(editedOperation.supplements || [])];
                                newSupplements[idx] = { ...newSupplements[idx], name: e.target.value };
                                setEditedOperation({ ...editedOperation, supplements: newSupplements });
                              }}
                              onBlur={() => handleAutoSave({ supplements: editedOperation.supplements })}
                              className="flex-1 px-3 py-2 border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                              placeholder="Nom du supplément"
                            />
                            <div className="relative">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={supplement.price === 0 ? '' : supplement.price}
                                onChange={(e) => {
                                  const newSupplements = [...(editedOperation.supplements || [])];
                                  newSupplements[idx] = { ...newSupplements[idx], price: e.target.value === '' ? 0 : parseFloat(e.target.value) };
                                  setEditedOperation({ ...editedOperation, supplements: newSupplements });
                                }}
                                onBlur={() => handleAutoSave({ supplements: editedOperation.supplements })}
                                className="w-24 px-3 py-2 border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                                placeholder="Prix"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-dark-text-muted text-sm">€</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const newSupplements = (editedOperation.supplements || []).filter((_, i) => i !== idx);
                                setEditedOperation({ ...editedOperation, supplements: newSupplements });
                                handleAutoSave({ supplements: newSupplements });
                              }}
                              className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                              title="Supprimer ce supplément"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            const newSupplements = [...(editedOperation.supplements || []), { id: crypto.randomUUID(), name: '', price: 0, display_order: (editedOperation.supplements?.length || 0) }];
                            setEditedOperation({ ...editedOperation, supplements: newSupplements });
                          }}
                          className="w-full px-3 py-2 border border-dashed border-gray-300 dark:border-dark-border text-gray-600 dark:text-dark-text-secondary rounded-lg hover:border-purple-500 hover:text-purple-500 transition-colors text-sm"
                        >
                          + Ajouter un supplément
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {operation.type === 'cotisation' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                        Période début
                      </label>
                      <input
                        type="date"
                        value={operation.periode_debut ? new Date(operation.periode_debut).toISOString().split('T')[0] : ''}
                        onChange={(e) => {
                          const newDate = e.target.value ? new Date(e.target.value) : undefined;
                          setEditedOperation({ ...editedOperation, periode_debut: newDate });
                          handleAutoSave({ periode_debut: newDate });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                        Période fin
                      </label>
                      <input
                        type="date"
                        value={operation.periode_fin ? new Date(operation.periode_fin).toISOString().split('T')[0] : ''}
                        onChange={(e) => {
                          const newDate = e.target.value ? new Date(e.target.value) : undefined;
                          setEditedOperation({ ...editedOperation, periode_fin: newDate });
                          handleAutoSave({ periode_fin: newDate });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'liaisons' && (
              <div className="p-6 space-y-6">
                {/* Résumé compact - basé sur les codes comptables */}
                {(() => {
                  const revenueTransactions = accountingSummary.revenueTransactions;
                  const expenseTransactions = accountingSummary.expenseTransactions;
                  const uncategorizedTransactions = accountingSummary.uncategorizedTransactions;
                  const totalVentes = accountingSummary.revenueTotal;
                  const totalAchats = accountingSummary.expenseTotal;
                  const balance = accountingSummary.balance;

                  return (
                    <>
                      <div className="flex items-center gap-6 pb-4 border-b border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500 dark:text-dark-text-muted">Ventes:</span>
                          <span className="font-semibold text-green-600 dark:text-green-400 tabular-nums">{formatMontant(totalVentes)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500 dark:text-dark-text-muted">Achats:</span>
                          <span className="font-semibold text-red-600 dark:text-red-400 tabular-nums">{formatMontant(totalAchats)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500 dark:text-dark-text-muted">Balance:</span>
                          <span className={cn(
                            "font-semibold tabular-nums",
                            balance >= 0 ? "text-blue-600 dark:text-blue-400" : "text-orange-600 dark:text-orange-400"
                          )}>{formatMontant(balance)}</span>
                        </div>
                        {uncategorizedTransactions.length > 0 && (
                          <div className="flex items-center gap-2 ml-auto">
                            <span className="text-xs text-gray-400 dark:text-dark-text-muted italic">
                              {uncategorizedTransactions.length} non catégorisée{uncategorizedTransactions.length > 1 ? 's' : ''}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Section Ventes (code comptable revenue) */}
                      {revenueTransactions.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-base font-semibold text-green-700 dark:text-green-400">
                              Ventes ({revenueTransactions.length})
                            </h3>
                            <span className={cn(
                              "text-sm font-semibold tabular-nums",
                              totalVentes >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                            )}>
                              {formatMontant(totalVentes)}
                            </span>
                          </div>
                          <div className="space-y-2">
                            {(() => {
                              // Fonction pour extraire le numéro de mvmt référencé dans "annule mvmt XXX" ou "Remb. tr. 2026-00312"
                              const getReferencedMvmt = (comm: string) => {
                                const c = comm || '';
                                // Pattern 1: "Remb. tr. 2026-00312" → extract short number "312"
                                const rembMatch = c.match(/remb\.?\s*tr\.?\s*(\d{4})-0*(\d+)/i);
                                if (rembMatch) return rembMatch[2];
                                // Pattern 2: "annule mvmt 312"
                                const annuleMatch = c.match(/annul\w*\s+(?:mvmt|mouvement)?\s*[-:]?\s*(\d+)/i);
                                return annuleMatch ? annuleMatch[1] : null;
                              };

                              // Créer une map des numéros de séquence vers les transactions
                              const seqMap = new Map<string, typeof revenueTransactions[0]>();
                              revenueTransactions.forEach(tx => {
                                if (tx.numero_sequence) {
                                  // Extraire le numéro court (ex: "2025-00592" -> "592")
                                  const parts = tx.numero_sequence.split('-');
                                  const lastPart = parts[parts.length - 1] || tx.numero_sequence;
                                  const seqNum = lastPart.replace(/^0+/, '') || '0';
                                  seqMap.set(seqNum, tx);
                                }
                              });

                              // Normaliser le nom: extraire le mot le plus long (probablement le nom de famille)
                              const normalizeName = (name: string) => {
                                const cleaned = (name || '')
                                  .toLowerCase()
                                  .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // enlève accents
                                  .replace(/^(m|mr|mme|mlle|dr)\s+/i, ''); // enlève titre
                                // Extraire les mots et prendre le plus long (nom de famille probable)
                                const words = cleaned.split(/[^a-z]+/).filter(w => w.length > 1);
                                const longestWord = words.reduce((a, b) => b.length > a.length ? b : a, '');
                                return longestWord.substring(0, 6); // premiers 6 caractères
                              };

                              // Créer une clé de groupement pour chaque transaction
                              const getGroupKey = (tx: typeof revenueTransactions[0]) => {
                                // 1. Si référence à un autre mouvement, utiliser cette référence
                                const refMvmt = getReferencedMvmt(tx.communication);
                                if (refMvmt) {
                                  const originalTx = seqMap.get(refMvmt);
                                  if (originalTx) {
                                    return originalTx.contrepartie_iban || originalTx.numero_sequence || refMvmt;
                                  }
                                }
                                // 2. Sinon utiliser l'IBAN
                                if (tx.contrepartie_iban) return tx.contrepartie_iban;
                                // 3. Sinon utiliser montant absolu + nom normalisé (6 premiers caractères)
                                const nameNorm = normalizeName(tx.contrepartie_nom);
                                return `${Math.abs(tx.montant).toFixed(2)}-${nameNorm}`;
                              };

                              // Calculer les totaux par groupe pour détecter les paires qui s'annulent
                              const groupTotals = new Map<string, number>();
                              revenueTransactions.forEach(tx => {
                                const key = getGroupKey(tx);
                                groupTotals.set(key, (groupTotals.get(key) || 0) + tx.montant);
                              });

                              // Un groupe "s'annule" si son total est proche de 0 ET il a plus d'une transaction
                              const groupCounts = new Map<string, number>();
                              revenueTransactions.forEach(tx => {
                                const key = getGroupKey(tx);
                                groupCounts.set(key, (groupCounts.get(key) || 0) + 1);
                              });

                              const isNeutralGroup = (key: string) => {
                                const total = groupTotals.get(key) || 0;
                                const count = groupCounts.get(key) || 0;
                                return count > 1 && Math.abs(total) < 0.01;
                              };

                              const sorted = [...revenueTransactions]
                                .sort((a, b) => {
                                  const nameA = resolveTransactionDisplayName(a, memberNameLookup);
                                  const nameB = resolveTransactionDisplayName(b, memberNameLookup);
                                  const nameCompare = nameA.localeCompare(nameB, 'fr');
                                  if (nameCompare !== 0) return nameCompare;
                                  if (a.montant >= 0 && b.montant < 0) return -1;
                                  if (a.montant < 0 && b.montant >= 0) return 1;
                                  const dateA = a.date_execution instanceof Date ? a.date_execution : new Date(a.date_execution);
                                  const dateB = b.date_execution instanceof Date ? b.date_execution : new Date(b.date_execution);
                                  return dateA.getTime() - dateB.getTime();
                                });

                              return sorted.map(tx => ({ tx, isNeutral: isNeutralGroup(getGroupKey(tx)) }));
                            })().map(({ tx, isNeutral }) => (
                              <div
                                key={tx.id}
                                className={cn(
                                  "px-3 py-2 border rounded-lg",
                                  isNeutral
                                    ? "bg-green-50/50 dark:bg-green-900/10 border-green-100 dark:border-green-800"
                                    : "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700"
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-sm text-gray-900 dark:text-dark-text-primary truncate flex-1 min-w-0">
                                    {resolveTransactionDisplayName(tx, memberNameLookup)}
                                  </p>
                                  <span className="text-xs text-gray-500 dark:text-dark-text-secondary w-[70px] text-right flex-shrink-0">
                                    {formatDate(tx.date_execution)}
                                  </span>
                                  <span className={cn(
                                    "font-bold text-sm w-[65px] text-right flex-shrink-0",
                                    tx.montant >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
                                  )}>
                                    {formatMontant(tx.montant)}
                                  </span>
                                  {onViewTransaction && (
                                    <button
                                      onClick={() => onViewTransaction(tx)}
                                      className="flex items-center gap-1 px-2 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 transition-colors flex-shrink-0"
                                      title="Voir les détails"
                                    >
                                      <Eye className="h-3 w-3" />
                                      Voir
                                    </button>
                                  )}
                                  {onUnlinkTransaction && canUnlinkOperationTransaction(tx) && (
                                    <button
                                      onClick={() => onUnlinkTransaction(tx.id)}
                                      className="p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 rounded transition-colors flex-shrink-0"
                                      title="Délier"
                                    >
                                      <Link2Off className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Section Achats (code comptable expense) */}
                      {expenseTransactions.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-base font-semibold text-red-700 dark:text-red-400">
                              Achats ({expenseTransactions.length})
                            </h3>
                            <span className="text-sm font-semibold text-red-600 dark:text-red-400 tabular-nums">
                              {formatMontant(totalAchats)}
                            </span>
                          </div>
                          <div className="space-y-2">
                            {(() => {
                              // Fonction pour extraire le numéro de mvmt référencé
                              const getReferencedMvmt = (comm: string) => {
                                const c = comm || '';
                                const rembMatch = c.match(/remb\.?\s*tr\.?\s*(\d{4})-0*(\d+)/i);
                                if (rembMatch) return rembMatch[2];
                                const annuleMatch = c.match(/annul\w*\s+(?:mvmt|mouvement)?\s*[-:]?\s*(\d+)/i);
                                return annuleMatch ? annuleMatch[1] : null;
                              };

                              // Map des numéros de séquence (utilise linkedTransactions pour trouver les refs cross-section)
                              const seqMap = new Map<string, typeof linkedTransactions[0]>();
                              linkedTransactions.forEach(tx => {
                                if (tx.numero_sequence) {
                                  const parts = tx.numero_sequence.split('-');
                                  const lastPart = parts[parts.length - 1] || tx.numero_sequence;
                                  const seqNum = lastPart.replace(/^0+/, '') || '0';
                                  seqMap.set(seqNum, tx);
                                }
                              });

                              const normalizeName = (name: string) => {
                                const cleaned = (name || '')
                                  .toLowerCase()
                                  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                                  .replace(/^(m|mr|mme|mlle|dr)\s+/i, '');
                                const words = cleaned.split(/[^a-z]+/).filter(w => w.length > 1);
                                const longestWord = words.reduce((a, b) => b.length > a.length ? b : a, '');
                                return longestWord.substring(0, 6);
                              };

                              const getGroupKey = (tx: typeof expenseTransactions[0]) => {
                                const refMvmt = getReferencedMvmt(tx.communication);
                                if (refMvmt) {
                                  const originalTx = seqMap.get(refMvmt);
                                  if (originalTx) {
                                    return originalTx.contrepartie_iban || originalTx.numero_sequence || refMvmt;
                                  }
                                }
                                if (tx.contrepartie_iban) return tx.contrepartie_iban;
                                const nameNorm = normalizeName(tx.contrepartie_nom);
                                return `${Math.abs(tx.montant).toFixed(2)}-${nameNorm}`;
                              };

                              // Calculer les totaux par groupe
                              const groupTotals = new Map<string, number>();
                              expenseTransactions.forEach(tx => {
                                const key = getGroupKey(tx);
                                groupTotals.set(key, (groupTotals.get(key) || 0) + tx.montant);
                              });

                              const groupCounts = new Map<string, number>();
                              expenseTransactions.forEach(tx => {
                                const key = getGroupKey(tx);
                                groupCounts.set(key, (groupCounts.get(key) || 0) + 1);
                              });

                              const isNeutralGroup = (key: string) => {
                                const total = groupTotals.get(key) || 0;
                                const count = groupCounts.get(key) || 0;
                                return count > 1 && Math.abs(total) < 0.01;
                              };

                              const sorted = [...expenseTransactions]
                                .sort((a, b) => {
                                  const nameA = resolveTransactionDisplayName(a, memberNameLookup);
                                  const nameB = resolveTransactionDisplayName(b, memberNameLookup);
                                  const nameCompare = nameA.localeCompare(nameB, 'fr');
                                  if (nameCompare !== 0) return nameCompare;
                                  if (a.montant >= 0 && b.montant < 0) return -1;
                                  if (a.montant < 0 && b.montant >= 0) return 1;
                                  const dateA = a.date_execution instanceof Date ? a.date_execution : new Date(a.date_execution);
                                  const dateB = b.date_execution instanceof Date ? b.date_execution : new Date(b.date_execution);
                                  return dateA.getTime() - dateB.getTime();
                                });

                              return sorted.map(tx => ({ tx, isNeutral: isNeutralGroup(getGroupKey(tx)) }));
                            })().map(({ tx, isNeutral }) => (
                              <div
                                key={tx.id}
                                className={cn(
                                  "px-3 py-2 border rounded-lg",
                                  isNeutral
                                    ? "bg-red-50/50 dark:bg-red-900/10 border-red-100 dark:border-red-800"
                                    : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700"
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-sm text-gray-900 dark:text-dark-text-primary truncate flex-1 min-w-0">
                                    {resolveTransactionDisplayName(tx, memberNameLookup)}
                                  </p>
                                  <span className="text-xs text-gray-500 dark:text-dark-text-secondary w-[70px] text-right flex-shrink-0">
                                    {formatDate(tx.date_execution)}
                                  </span>
                                  <span className={cn(
                                    "font-bold text-sm w-[65px] text-right flex-shrink-0",
                                    tx.montant >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
                                  )}>
                                    {formatMontant(tx.montant)}
                                  </span>
                                  {onViewTransaction && (
                                    <button
                                      onClick={() => onViewTransaction(tx)}
                                      className="flex items-center gap-1 px-2 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 transition-colors flex-shrink-0"
                                      title="Voir les détails"
                                    >
                                      <Eye className="h-3 w-3" />
                                      Voir
                                    </button>
                                  )}
                                  {onUnlinkTransaction && canUnlinkOperationTransaction(tx) && (
                                    <button
                                      onClick={() => onUnlinkTransaction(tx.id)}
                                      className="p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 rounded transition-colors flex-shrink-0"
                                      title="Délier"
                                    >
                                      <Link2Off className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Section Non catégorisées */}
                      {uncategorizedTransactions.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-base font-semibold text-gray-600 dark:text-gray-400">
                              Non catégorisées ({uncategorizedTransactions.length})
                            </h3>
                            <span className="text-xs text-gray-500 dark:text-gray-400 italic">
                              Non comptées dans la balance
                            </span>
                          </div>
                          <div className="space-y-2">
                            {(() => {
                              const getReferencedMvmt = (comm: string) => {
                                const c = comm || '';
                                const rembMatch = c.match(/remb\.?\s*tr\.?\s*(\d{4})-0*(\d+)/i);
                                if (rembMatch) return rembMatch[2];
                                const annuleMatch = c.match(/annul\w*\s+(?:mvmt|mouvement)?\s*[-:]?\s*(\d+)/i);
                                return annuleMatch ? annuleMatch[1] : null;
                              };

                              const seqMap = new Map<string, typeof linkedTransactions[0]>();
                              linkedTransactions.forEach(tx => {
                                if (tx.numero_sequence) {
                                  const parts = tx.numero_sequence.split('-');
                                  const lastPart = parts[parts.length - 1] || tx.numero_sequence;
                                  const seqNum = lastPart.replace(/^0+/, '') || '0';
                                  seqMap.set(seqNum, tx);
                                }
                              });

                              const normalizeName = (name: string) => {
                                const cleaned = (name || '')
                                  .toLowerCase()
                                  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                                  .replace(/^(m|mr|mme|mlle|dr)\s+/i, '');
                                const words = cleaned.split(/[^a-z]+/).filter(w => w.length > 1);
                                const longestWord = words.reduce((a, b) => b.length > a.length ? b : a, '');
                                return longestWord.substring(0, 6);
                              };

                              const getGroupKey = (tx: typeof uncategorizedTransactions[0]) => {
                                const refMvmt = getReferencedMvmt(tx.communication);
                                if (refMvmt) {
                                  const originalTx = seqMap.get(refMvmt);
                                  if (originalTx) {
                                    return originalTx.contrepartie_iban || originalTx.numero_sequence || refMvmt;
                                  }
                                }
                                if (tx.contrepartie_iban) return tx.contrepartie_iban;
                                const nameNorm = normalizeName(tx.contrepartie_nom);
                                return `${Math.abs(tx.montant).toFixed(2)}-${nameNorm}`;
                              };

                              // Calculer les totaux par groupe
                              const groupTotals = new Map<string, number>();
                              uncategorizedTransactions.forEach(tx => {
                                const key = getGroupKey(tx);
                                groupTotals.set(key, (groupTotals.get(key) || 0) + tx.montant);
                              });

                              const groupCounts = new Map<string, number>();
                              uncategorizedTransactions.forEach(tx => {
                                const key = getGroupKey(tx);
                                groupCounts.set(key, (groupCounts.get(key) || 0) + 1);
                              });

                              const isNeutralGroup = (key: string) => {
                                const total = groupTotals.get(key) || 0;
                                const count = groupCounts.get(key) || 0;
                                return count > 1 && Math.abs(total) < 0.01;
                              };

                              const sorted = [...uncategorizedTransactions]
                                .sort((a, b) => {
                                  const nameA = resolveTransactionDisplayName(a, memberNameLookup);
                                  const nameB = resolveTransactionDisplayName(b, memberNameLookup);
                                  const nameCompare = nameA.localeCompare(nameB, 'fr');
                                  if (nameCompare !== 0) return nameCompare;
                                  if (a.montant >= 0 && b.montant < 0) return -1;
                                  if (a.montant < 0 && b.montant >= 0) return 1;
                                  const dateA = a.date_execution instanceof Date ? a.date_execution : new Date(a.date_execution);
                                  const dateB = b.date_execution instanceof Date ? b.date_execution : new Date(b.date_execution);
                                  return dateA.getTime() - dateB.getTime();
                                });

                              return sorted.map(tx => ({ tx, isNeutral: isNeutralGroup(getGroupKey(tx)) }));
                            })().map(({ tx, isNeutral }) => (
                              <div
                                key={tx.id}
                                className={cn(
                                  "px-3 py-2 border rounded-lg",
                                  isNeutral
                                    ? "bg-gray-200 dark:bg-gray-700/50 border-gray-400 dark:border-gray-500"
                                    : "bg-gray-100 dark:bg-gray-800/50 border-gray-300 dark:border-gray-600"
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-sm text-gray-900 dark:text-dark-text-primary truncate flex-1 min-w-0">
                                    {resolveTransactionDisplayName(tx, memberNameLookup)}
                                  </p>
                                  <span className="text-xs text-gray-500 dark:text-dark-text-secondary w-[70px] text-right flex-shrink-0">
                                    {formatDate(tx.date_execution)}
                                  </span>
                                  <span className={cn(
                                    "font-bold text-sm w-[65px] text-right flex-shrink-0",
                                    tx.montant >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
                                  )}>
                                    {formatMontant(tx.montant)}
                                  </span>
                                  {onViewTransaction && (
                                    <button
                                      onClick={() => onViewTransaction(tx)}
                                      className="flex items-center gap-1 px-2 py-1 bg-gray-500 text-white rounded text-xs font-medium hover:bg-gray-600 transition-colors flex-shrink-0"
                                      title="Voir les détails"
                                    >
                                      <Eye className="h-3 w-3" />
                                      Voir
                                    </button>
                                  )}
                                  {onUnlinkTransaction && canUnlinkOperationTransaction(tx) && (
                                    <button
                                      onClick={() => onUnlinkTransaction(tx.id)}
                                      className="p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 rounded transition-colors flex-shrink-0"
                                      title="Délier"
                                    >
                                      <Link2Off className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Message si aucune transaction */}
                      {linkedTransactions.length === 0 && (
                        <p className="text-gray-500 dark:text-dark-text-muted text-sm py-4">
                          Aucune transaction liée
                        </p>
                      )}
                    </>
                  );
                })()}

                {/* Actions buttons */}
                <div className="flex items-center justify-end gap-2 pt-2">
                  {/* Auto-inscribe button - only show for events with linked transactions */}
                  {showInscriptions && getAvailableInscriptionTransactions().length > 0 && (
                    <button
                      onClick={generateAutoInscribeCandidates}
                      disabled={isLoadingCandidates}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      {isLoadingCandidates ? (
                        <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                      ) : (
                        <UserPlus className="h-4 w-4" />
                      )}
                      Inscrire les payants
                    </button>
                  )}
                  {onLinkTransaction && (
                    <button
                      onClick={onLinkTransaction}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <Link2 className="h-4 w-4" />
                      Lier à une transaction
                    </button>
                  )}
                </div>

                {/* Demands Section - Information only, not counted in balance */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                        Dépenses liées
                      </h3>
                      <span className="text-xs text-gray-500 dark:text-gray-400 italic">
                        (non comptées dans la balance)
                      </span>
                    </div>
                    {onLinkDemand && (
                      <button
                        onClick={onLinkDemand}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                      >
                        <Link2 className="h-4 w-4" />
                        Lier à une dépense
                      </button>
                    )}
                  </div>

                  {linkedDemands.length === 0 ? (
                    <p className="text-gray-500 dark:text-dark-text-muted text-sm">
                      Aucune dépense liée
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {linkedDemands.map(demand => (
                        <div
                          key={demand.id}
                          className="p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg"
                        >
                          <div className="flex items-center justify-between gap-2">
                            {/* Gauche: Description + Demandeur */}
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <p className="font-medium text-sm text-gray-900 dark:text-dark-text-primary truncate">
                                {demand.description}
                              </p>
                              <span className="text-gray-300 dark:text-dark-border">•</span>
                              <span className="text-xs text-gray-500 dark:text-dark-text-muted whitespace-nowrap">
                                {demand.demandeur_nom}
                              </span>
                            </div>

                            {/* Droite: Montant + Actions */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="font-bold text-sm text-red-700 dark:text-red-400 whitespace-nowrap">
                                {formatMontant(demand.montant)}
                              </span>
                              {onViewDemand && (
                                <button
                                  onClick={() => onViewDemand(demand)}
                                  className="flex items-center gap-1 px-2 py-1 bg-orange-600 text-white rounded text-xs font-medium hover:bg-orange-700 transition-colors"
                                  title="Voir les détails"
                                >
                                  <Eye className="h-3 w-3" />
                                  Voir
                                </button>
                              )}
                              {onUnlinkDemand && (
                                <button
                                  onClick={() => onUnlinkDemand(demand.id)}
                                  className="p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 rounded transition-colors"
                                  title="Délier"
                                >
                                  <Link2Off className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}

                      {/* Total des dépenses */}
                      <div className="mt-4 pt-4 border-t border-orange-200 dark:border-orange-700">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-semibold text-gray-700 dark:text-dark-text-secondary">
                            Total dépenses
                          </span>
                          <span className="text-lg font-bold text-red-600 dark:text-red-400">
                            {formatMontant(linkedDemands.reduce((sum, d) => sum + d.montant, 0))}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'inscriptions' && showInscriptions && (() => {
              // Check for new event
              if (operation.id.startsWith('new-')) {
                return (
                  <div className="p-12 text-center">
                    <Users className="h-12 w-12 mx-auto mb-4 text-gray-300 dark:text-dark-text-secondary" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-2">
                      Gestion des inscriptions
                    </h3>
                    <p className="text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary max-w-sm mx-auto">
                      Veuillez sauvegarder l'événement pour commencer à ajouter des participants.
                    </p>
                  </div>
                );
              }
              // Calculate detailed statistics
              const totalInscriptions = linkedInscriptions.length;
              const paidViaBank = linkedInscriptions.filter(i => i.transaction_id && i.paye).length;
              const paidCash = linkedInscriptions.filter(i => !i.transaction_id && i.paye && i.mode_paiement === 'cash').length;
              const paidViaCalyMob = linkedInscriptions.filter(i => !i.transaction_id && i.paye && i.mode_paiement !== 'cash').length;
              const unpaid = linkedInscriptions.filter(i => !i.paye).length;
              const totalPaid = paidViaBank + paidCash + paidViaCalyMob;
              const unpaidAmount = linkedInscriptions.filter(i => !i.paye).reduce((sum, i) => sum + i.prix + (i.supplement_total || 0), 0);

              // Calculate available transactions for manual linking
              const availableTransactions = getAvailableInscriptionTransactions();


              // Manual linking handler
              const handleManualLink = async (inscriptionId: string, transactionId: string, selectElement?: HTMLSelectElement) => {
                if (!transactionId || !onLinkInscriptionToTransaction) return;

                try {
                  await onLinkInscriptionToTransaction(inscriptionId, transactionId);
                  // Reset the select element after successful linking
                  if (selectElement) {
                    selectElement.value = "";
                  }
                  if (onRefreshInscriptions) {
                    await onRefreshInscriptions();
                  }
                  toast.success('Inscription liée à la transaction');
                } catch (error: any) {
                  toast.error(error.message || 'Erreur lors de la liaison');
                  // Reset the select element on error too
                  if (selectElement) {
                    selectElement.value = "";
                  }
                }
              };

              // Auto-save inscription field handler
              const handleInscriptionFieldSave = async (inscriptionId: string, field: string, value: any) => {
                if (!operation) return;

                try {
                  // Validation
                  if (field === 'prix') {
                    const montant = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : value;
                    if (isNaN(montant) || montant <= 0) {
                      toast.error('Le prix doit être un nombre valide supérieur à 0');
                      return;
                    }
                    value = montant;
                  } else if (field === 'date_inscription') {
                    if (!value) {
                      toast.error('La date d\'inscription est obligatoire');
                      return;
                    }
                    // Convert to Firestore Timestamp
                    value = new Date(value);
                  } else if (field === 'montant_paye_especes') {
                    // Validation pour montant payé en espèces (transaction_montant n'est plus éditable)
                    const montant = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : value;
                    if (isNaN(montant) || montant < 0) {
                      toast.error('Le montant doit être un nombre valide positif');
                      return;
                    }
                    value = montant;

                    // Si montant = 0, marquer automatiquement comme non payé
                    if (montant === 0) {
                      const inscriptionRef = doc(db, 'clubs', clubId!, 'operations', operation.id, 'inscriptions', inscriptionId);
                      await updateDoc(inscriptionRef, {
                        montant_paye_especes: 0,
                        paye: false,
                        mode_paiement: null,
                        date_paiement: null,
                        updated_at: serverTimestamp()
                      });

                      if (onRefreshInscriptions) {
                        await onRefreshInscriptions();
                      }

                      toast.success('✓ Montant mis à 0 - inscription marquée non payée', {
                        duration: 2000,
                        position: 'bottom-right'
                      });
                      return; // Ne pas continuer avec le save normal
                    }
                  }

                  // Save to Firestore
                  const inscriptionRef = doc(db, 'clubs', clubId!, 'operations', operation.id, 'inscriptions', inscriptionId);
                  await updateDoc(inscriptionRef, {
                    [field]: value,
                    updated_at: serverTimestamp()
                  });

                  if (onRefreshInscriptions) {
                    await onRefreshInscriptions();
                  }

                  // Success feedback
                  toast.success('✓ Sauvegardé', {
                    duration: 1500,
                    position: 'bottom-right'
                  });
                } catch (error: any) {
                  logger.error(`Error saving ${field}:`, error);
                  toast.error('Erreur lors de la sauvegarde');
                }
              };

              // Unlink transaction handler
              const handleUnlinkTransaction = async (inscriptionId: string) => {
                if (!operation || !onUnlinkInscriptionTransaction) {
                  toast.error('Fonction de déliage non disponible');
                  return;
                }

                if (!confirm('Êtes-vous sûr de vouloir délier cette transaction ? L\'inscription restera marquée comme payée.')) {
                  return;
                }

                try {
                  await onUnlinkInscriptionTransaction(inscriptionId);
                  if (onRefreshInscriptions) {
                    await onRefreshInscriptions();
                  }
                  toast.success('Transaction déliée avec succès');
                } catch (error: any) {
                  logger.error('Error unlinking transaction:', error);
                  toast.error(error.message || 'Erreur lors du déliage');
                }
              };

              // Mark unpaid handler (for orphaned paid inscriptions)
              const handleMarkUnpaid = async (inscriptionId: string) => {
                if (!operation) return;

                if (!confirm('Marquer cette inscription comme non payée ?')) {
                  return;
                }

                try {
                  const inscriptionRef = doc(db, 'clubs', clubId!, 'operations', operation.id, 'inscriptions', inscriptionId);
                  await updateDoc(inscriptionRef, {
                    paye: false,
                    mode_paiement: null,
                    date_paiement: null,
                    transaction_id: null,
                    transaction_matched: false,  // Sync with CalyMob
                    transaction_montant: 0,
                    montant_paye_especes: 0,
                    payment_status: null,  // Reset CalyMob payment status
                    updated_at: serverTimestamp()
                  });

                  if (onRefreshInscriptions) {
                    await onRefreshInscriptions();
                  }

                  toast.success('✓ Inscription marquée non payée', {
                    duration: 1500,
                    position: 'bottom-right'
                  });
                } catch (error: any) {
                  logger.error('Error marking unpaid:', error);
                  toast.error('Erreur lors de la mise à jour');
                }
              };

              return (
                <div className="p-6">
                  <div className="mb-4">
                    {/* Row 1: Title + action buttons + payment summary */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                          Participants
                        </h3>
                        <span className="text-sm text-gray-500 dark:text-dark-text-muted tabular-nums">
                          {totalPaid}/{totalInscriptions} payé{totalPaid !== 1 ? 's' : ''}
                          {unpaidAmount > 0 && <span className="text-orange-600 dark:text-orange-400 ml-1">· reste {formatMontant(unpaidAmount)}</span>}
                        </span>
                        <div className="flex items-center gap-1.5 ml-2">
                          <button
                            onClick={() => setShowMemberSelection(true)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-xs font-medium"
                            title="Ajouter un participant"
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                            Participant +
                          </button>
                          {operation.event_category === 'plongee' && linkedInscriptions.length > 0 && (
                            <button
                              onClick={() => setShowPalanqueeBuilder(true)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors text-xs font-medium"
                              title="Composer les palanquées (drag & drop)"
                            >
                              <Users className="h-3.5 w-3.5" />
                              Palanquées
                            </button>
                          )}
                        </div>
                      </div>
                      {/* Compact payment badges */}
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400 rounded">
                          <CreditCard className="h-3 w-3" />
                          {paidViaBank}
                        </span>
                        {paidCash > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 rounded">
                            💶 {paidCash}
                          </span>
                        )}
                        {paidViaCalyMob > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 rounded">
                            📱 {paidViaCalyMob}
                          </span>
                        )}
                        {unpaid > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400 rounded">
                            ⏱ {unpaid}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Payment Control Button */}
                  {unpaid > 0 && linkedTransactions.length > 0 && (
                    <div className="mt-4">
                      <button
                        onClick={handleControlePaiements}
                        disabled={!onLinkInscriptionToTransaction || !onRefreshInscriptions}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                      >
                        <Search className="h-4 w-4" />
                        🔍 Contrôler les paiements
                      </button>
                      <p className="text-xs text-gray-600 dark:text-dark-text-secondary mt-2">
                        Matching automatique par nom entre inscriptions et transactions de cet événement
                      </p>
                    </div>
                  )}

                  {linkedInscriptions.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 dark:text-dark-text-muted">
                      <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>Aucune inscription pour cet événement</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {[...linkedInscriptions].sort((a, b) => {
                        // Sort by first name (prénom) first, then last name as tiebreaker
                        const firstNameA = (a.membre_prenom || '').trim().toLowerCase();
                        const firstNameB = (b.membre_prenom || '').trim().toLowerCase();
                        const firstNameCompare = firstNameA.localeCompare(firstNameB, 'fr');
                        if (firstNameCompare !== 0) return firstNameCompare;
                        const lastNameA = (a.membre_nom || '').trim().toLowerCase();
                        const lastNameB = (b.membre_nom || '').trim().toLowerCase();
                        return lastNameA.localeCompare(lastNameB, 'fr');
                      }).map((inscription) => {
                        // Determine payment category and background color (matching CalyMob 6 states)
                        const hasTransaction = !!inscription.transaction_id;
                        const getPaymentCategory = () => {
                          if (inscription.paye && hasTransaction) return 'paid';
                          if (inscription.paye && !hasTransaction && inscription.mode_paiement === 'cash') return 'cash';
                          if (inscription.paye && !hasTransaction) return 'pending_bank';
                          switch (inscription.payment_status) {
                            case 'qr_email_sent': return 'qr_sent';
                            case 'qr_on_site': return 'on_site';
                            default: return 'unpaid';
                          }
                        };
                        const paymentCategory = getPaymentCategory();

                        const bgColor = {
                          paid: 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800',
                          pending_bank: 'bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-800',
                          qr_sent: 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800',
                          on_site: 'bg-slate-50 dark:bg-slate-900/10 border-slate-200 dark:border-slate-700',
                          cash: 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800',
                          unpaid: 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800',
                        }[paymentCategory] || 'border-gray-200 dark:border-dark-border';

                        // Get default date value (without useState to avoid hook violation)
                        const getDefaultDate = () => {
                          if (!inscription.date_inscription) return '';
                          try {
                            // Handle both Firestore Timestamp and Date objects
                            const dateValue = inscription.date_inscription as any;
                            const date = dateValue?.seconds
                              ? new Date(dateValue.seconds * 1000)
                              : new Date(dateValue);

                            // Check if date is valid
                            if (isNaN(date.getTime())) return '';

                            return date.toISOString().split('T')[0];
                          } catch (error) {
                            logger.error('Invalid date_inscription:', inscription.date_inscription);
                            return '';
                          }
                        };

                        return (
                          <div
                            key={inscription.id}
                            className={cn("p-2 border rounded hover:shadow-sm transition-shadow", bgColor)}
                          >
                            {/* Ligne 1: Nom + Prix */}
                            <div className="flex items-center justify-between gap-2">
                              {/* Nom + Badges */}
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                {/* Editable name for external participants (no membre_id) */}
                                {!inscription.membre_id ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="text"
                                      defaultValue={inscription.membre_prenom || ''}
                                      onBlur={(e) => {
                                        if (e.target.value !== (inscription.membre_prenom || '')) {
                                          handleInscriptionFieldSave(inscription.id, 'membre_prenom', e.target.value);
                                        }
                                      }}
                                      placeholder="Prénom"
                                      className="w-24 px-1.5 py-0.5 text-sm font-medium border border-purple-200 dark:border-purple-800 rounded focus:ring-1 focus:ring-purple-500 bg-purple-50 dark:bg-purple-900/20 text-gray-900 dark:text-dark-text-primary"
                                    />
                                    <input
                                      type="text"
                                      defaultValue={inscription.membre_nom || ''}
                                      onBlur={(e) => {
                                        if (e.target.value !== (inscription.membre_nom || '')) {
                                          handleInscriptionFieldSave(inscription.id, 'membre_nom', e.target.value);
                                        }
                                      }}
                                      placeholder="Nom"
                                      className="w-28 px-1.5 py-0.5 text-sm font-medium border border-purple-200 dark:border-purple-800 rounded focus:ring-1 focus:ring-purple-500 bg-purple-50 dark:bg-purple-900/20 text-gray-900 dark:text-dark-text-primary"
                                    />
                                  </div>
                                ) : (
                                  <p className="font-medium text-sm text-gray-900 dark:text-dark-text-primary truncate">
                                    {inscription.membre_prenom} {inscription.membre_nom}
                                  </p>
                                )}
                                {/* Badge Fonction */}
                                {inscription.fonction && (
                                  <FonctionBadge fonction={inscription.fonction} />
                                )}
                                {/* Badge Invité */}
                                {inscription.is_guest && (
                                  <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 rounded text-xs font-medium whitespace-nowrap flex-shrink-0">
                                    Invité
                                  </span>
                                )}
                              </div>

                              {/* Prix + Montant payé */}
                              <div className="flex items-center gap-3 text-right">
                                <div className="flex flex-col items-end">
                                  <div className="text-sm font-bold text-gray-900 dark:text-dark-text-primary whitespace-nowrap">
                                    {formatMontant(inscription.prix + (inscription.supplement_total || 0))}
                                  </div>
                                  {/* Supplement details */}
                                  {inscription.selected_supplements && inscription.selected_supplements.length > 0 && (
                                    <div className="relative group">
                                      <span className="text-xs text-blue-600 dark:text-blue-400 cursor-help">
                                        +{inscription.selected_supplements.length} suppl.
                                      </span>
                                      <div className="absolute hidden group-hover:block z-10 bg-white dark:bg-dark-bg-tertiary border border-gray-200 dark:border-dark-border rounded shadow-lg p-2 text-xs whitespace-nowrap right-0 mt-1">
                                        <div className="font-medium mb-1 text-gray-700 dark:text-dark-text-primary">Suppléments:</div>
                                        {inscription.selected_supplements.map((s, idx) => (
                                          <div key={idx} className="text-gray-600 dark:text-dark-text-secondary">
                                            {s.name}: {formatMontant(s.price)}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Montant payé VIREMENT */}
                                {inscription.transaction_id && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs text-gray-500 dark:text-dark-text-muted">Payé:</span>
                                    <span className="text-sm font-semibold text-gray-900 dark:text-dark-text-primary whitespace-nowrap">
                                      {formatMontant(inscription.transaction_montant || 0)}
                                    </span>
                                    {inscription.transaction_montant && Math.abs(inscription.transaction_montant - (inscription.prix + (inscription.supplement_total || 0))) > 0.01 && (
                                      <span className="text-xs text-orange-600 dark:text-orange-400 whitespace-nowrap">
                                        (⚠️ {formatMontant(Math.abs((inscription.prix + (inscription.supplement_total || 0)) - inscription.transaction_montant))})
                                      </span>
                                    )}
                                  </div>
                                )}

                                {/* Montant payé ESPÈCES */}
                                {inscription.mode_paiement === 'cash' && inscription.paye && !inscription.transaction_id && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs text-gray-500 dark:text-dark-text-muted">Payé:</span>
                                    <input
                                      type="number"
                                      step="0.01"
                                      defaultValue={inscription.montant_paye_especes || (inscription.prix + (inscription.supplement_total || 0))}
                                      onBlur={(e) => handleInscriptionFieldSave(inscription.id, 'montant_paye_especes', e.target.value)}
                                      className="w-16 px-1.5 py-0.5 text-xs text-right border border-gray-300 dark:border-dark-border rounded focus:ring-1 focus:ring-blue-500 bg-white dark:bg-dark-bg-tertiary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                    <span className="text-xs text-gray-500 dark:text-dark-text-muted">€</span>
                                    {inscription.montant_paye_especes && Math.abs(inscription.montant_paye_especes - (inscription.prix + (inscription.supplement_total || 0))) > 0.01 && (
                                      <span className="text-xs text-orange-600 dark:text-orange-400 whitespace-nowrap">
                                        (⚠️ {formatMontant(Math.abs((inscription.prix + (inscription.supplement_total || 0)) - inscription.montant_paye_especes))})
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Exercices souhaités (clickable for evaluation) */}
                            {inscription.exercices && inscription.exercices.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {inscription.exercices.map((exId) => {
                                  const ex = exerciceCatalog.get(exId);
                                  const code = ex?.code || exId;
                                  const obs = exerciceObservations.get(inscription.membre_id)?.get(code);
                                  const color = getObservationColor(obs?.result);
                                  const icon = getObservationIcon(obs?.result);
                                  return (
                                    <button
                                      key={exId}
                                      onClick={() => handleOpenEvaluation(
                                        inscription.membre_id,
                                        `${inscription.membre_prenom} ${inscription.membre_nom}`,
                                        code,
                                        ex?.description || '',
                                        obs,
                                      )}
                                      className={cn(
                                        "px-1.5 py-0.5 rounded text-xs font-medium border cursor-pointer hover:shadow-sm transition-shadow",
                                        !obs?.result && "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-700",
                                        obs?.result === 'acquis' && "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700",
                                        obs?.result === 'en_progres' && "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700",
                                        obs?.result === 'a_revoir' && "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700",
                                      )}
                                      title={`${ex?.description || exId}${obs?.note ? ` — ${obs.note}` : ''}`}
                                    >
                                      {icon && <>{icon} </>}{code}
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            {/* Ligne 2: Status Paiement + Actions */}
                            <div className="flex items-center gap-2 mt-1">
                              {/* Status Paiement - tekst alleen, zoals CalyMob */}
                              {(() => {
                                switch (paymentCategory) {
                                  case 'paid':
                                    return (
                                      <span className="text-xs text-green-600 dark:text-green-400 whitespace-nowrap">
                                        ✓ Payé
                                      </span>
                                    );
                                  case 'pending_bank':
                                    return (
                                      <span className="text-xs text-orange-600 dark:text-orange-400 whitespace-nowrap" title="Paiement reçu, en attente de confirmation bancaire">
                                        ✓ En attente bancaire
                                      </span>
                                    );
                                  case 'qr_sent':
                                    return (
                                      <span className="text-xs text-amber-600 dark:text-amber-400 whitespace-nowrap" title="QR code de paiement envoyé par email">
                                        ✉️ QR envoyé par email
                                      </span>
                                    );
                                  case 'on_site':
                                    return (
                                      <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap" title="Le participant paiera sur place">
                                        🕐 Paiement sur place
                                      </span>
                                    );
                                  case 'cash':
                                    return (
                                      <span className="text-xs text-blue-600 dark:text-blue-400 whitespace-nowrap">
                                        💵 Payé en espèces
                                      </span>
                                    );
                                  default:
                                    return (
                                      <span className="text-xs text-red-600 dark:text-red-400 whitespace-nowrap">
                                        ✗ Non payé
                                      </span>
                                    );
                                }
                              })()}

                              {/* Date inscription */}
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <Calendar className="h-3 w-3 text-gray-400 dark:text-dark-text-muted" />
                                <input
                                  type="date"
                                  defaultValue={getDefaultDate()}
                                  onBlur={(e) => handleInscriptionFieldSave(inscription.id, 'date_inscription', e.target.value)}
                                  className="px-1.5 py-0.5 border border-gray-300 dark:border-dark-border rounded focus:ring-1 focus:ring-blue-500 text-xs bg-white dark:bg-dark-bg-tertiary"
                                />
                              </div>

                              {/* Dropdown voor niet-betaalde inscripties */}
                              {(paymentCategory === 'unpaid' || paymentCategory === 'qr_sent' || paymentCategory === 'on_site') && availableTransactions.length > 0 && onLinkInscriptionToTransaction && (
                                <select
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    if (value) {
                                      handleManualLink(inscription.id, value, e.target as HTMLSelectElement);
                                    }
                                  }}
                                  className="flex-1 px-2 py-1 border border-gray-300 dark:border-dark-border rounded text-xs bg-white dark:bg-dark-bg-tertiary"
                                  defaultValue=""
                                  key={`select-${inscription.id}-${inscription.transaction_id || 'unpaid'}`}
                                >
                                  <option value="">-- Sélectionner transaction --</option>
                                  {availableTransactions.map(tx => (
                                    <option key={tx.id} value={tx.id}>
                                      {tx.contrepartie_nom || 'Inconnu'} - {formatMontant(tx.montant)} - {formatDate(tx.date_execution)}
                                    </option>
                                  ))}
                                </select>
                              )}

                              {/* Bouton Délier pour transactions liées */}
                              {inscription.transaction_id && (
                                <button
                                  onClick={() => handleUnlinkTransaction(inscription.id)}
                                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                  Délier
                                </button>
                              )}

                              {/* Bouton Marquer non payé pour orphelines */}
                              {inscription.paye && !inscription.transaction_id && (
                                inscription.mode_paiement !== 'cash' ||
                                (inscription.mode_paiement === 'cash' && (!inscription.montant_paye_especes || inscription.montant_paye_especes === 0))
                              ) && (
                                  <button
                                    onClick={() => handleMarkUnpaid(inscription.id)}
                                    className="text-xs text-orange-600 dark:text-orange-400 hover:underline"
                                  >
                                    ⚠️ Marquer non payé
                                  </button>
                                )}

                              {/* Bouton Supprimer - always visible */}
                              <button
                                onClick={(e) => {
                                  logger.debug('🖱️ Delete button clicked', {
                                    type: e.type,
                                    button: e.button,
                                    detail: e.detail,
                                    target: e.target
                                  });
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleDeleteInscription(inscription.id, `${inscription.membre_prenom} ${inscription.membre_nom}`);
                                }}
                                className="text-xs text-red-600 dark:text-red-400 hover:underline ml-auto"
                                title="Supprimer cette inscription"
                              >
                                <Trash2 className="h-3.5 w-3.5 inline" /> Supprimer
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Summary */}
                  {linkedInscriptions.length > 0 && (
                    <div className="mt-6 pt-4 border-t border-gray-200 dark:border-dark-border">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-600 dark:text-dark-text-secondary">Total des inscriptions:</span>
                        <span className="font-bold text-lg text-gray-900 dark:text-dark-text-primary">
                          {formatMontant(linkedInscriptions.reduce((sum, i) => sum + i.prix + (i.supplement_total || 0), 0))}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-sm mt-2">
                        <span className="text-gray-600 dark:text-dark-text-secondary">Total payé:</span>
                        <span className="font-bold text-green-600 dark:text-green-400">
                          {formatMontant(linkedInscriptions.filter(i => i.paye).reduce((sum, i) => sum + (i.transaction_montant || i.montant_paye_especes || i.prix) + (i.supplement_total || 0), 0))}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-sm mt-2">
                        <span className="text-gray-600 dark:text-dark-text-secondary">En attente:</span>
                        <span className="font-bold text-orange-600 dark:text-orange-400">
                          {formatMontant(linkedInscriptions.filter(i => !i.paye).reduce((sum, i) => sum + i.prix + (i.supplement_total || 0), 0))}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {activeTab === 'messages' && showInscriptions && (
              <div className="p-6">
                <EventMessagesTab
                  clubId={clubId || clubId!}
                  operationId={operation.id}
                  operationTitre={operation.titre}
                  isParticipant={linkedInscriptions.some(i => i.membre_id === user?.uid)}
                />
              </div>
            )}

            {activeTab === 'documents' && (
              <div className="p-6 space-y-6">
                {/* Activity Documents Section */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-dark-text-primary mb-3 uppercase tracking-wide">
                    Documents de l'activité
                  </h3>

                  {/* Upload button */}
                  <div className="mb-4">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors w-full justify-center"
                    >
                      <Upload className="h-5 w-5 text-gray-400 dark:text-dark-text-muted" />
                      <span className="text-gray-600 dark:text-dark-text-secondary">
                        Ajouter des documents
                      </span>
                    </button>
                  </div>

                  {/* Activity Document list */}
                  {documents.length === 0 ? (
                    <div className="text-center py-4 text-gray-500 dark:text-dark-text-muted text-sm">
                      Aucun document attaché à cette activité
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      {documents.map((doc) => (
                        <div
                          key={doc.url}
                          className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-bg-tertiary border border-gray-200 dark:border-dark-border rounded-lg"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <FileText className="h-5 w-5 text-gray-400 dark:text-dark-text-muted flex-shrink-0" />
                            {editingDocName?.url === doc.url ? (
                              <input
                                type="text"
                                value={editingDocName.name}
                                onChange={(e) => setEditingDocName({ ...editingDocName, name: e.target.value })}
                                onBlur={() => handleDocumentRename(doc.url, editingDocName.name)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleDocumentRename(doc.url, editingDocName.name);
                                  } else if (e.key === 'Escape') {
                                    setEditingDocName(null);
                                  }
                                }}
                                className="flex-1 px-2 py-1 border border-gray-300 dark:border-dark-border rounded focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                                autoFocus
                              />
                            ) : (
                              <span
                                className="flex-1 truncate text-sm text-gray-900 dark:text-dark-text-primary cursor-pointer hover:text-purple-600"
                                onClick={() => setEditingDocName({ url: doc.url, name: doc.nom_affichage })}
                              >
                                {doc.nom_affichage}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setSelectedDocument(doc)}
                              className="p-2 text-gray-600 dark:text-dark-text-secondary hover:bg-gray-200 dark:hover:bg-dark-bg-secondary rounded-lg transition-colors"
                              title="Voir"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteDocument(doc.url)}
                              className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                              title="Supprimer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Linked Expenses Documents Section */}
                {linkedDemandsDocuments.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-orange-700 dark:text-orange-400 mb-3 uppercase tracking-wide">
                      Documents des dépenses liées
                    </h3>
                    <div className="grid grid-cols-1 gap-3">
                      {linkedDemandsDocuments.map((doc) => (
                        <div
                          key={`${doc.sourceId}-${doc.url}`}
                          className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <FileText className="h-5 w-5 text-orange-500 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="block truncate text-sm text-gray-900 dark:text-dark-text-primary">
                                {doc.nom_affichage}
                              </span>
                              <span className="block truncate text-xs text-orange-600 dark:text-orange-400">
                                {doc.sourceName}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setSelectedDocument(doc)}
                              className="p-2 text-orange-600 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded-lg transition-colors"
                              title="Voir"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Document Preview Panel */}
        {selectedDocument && (
          <div
            className="fixed left-0 top-0 h-full w-1/2 bg-white dark:bg-dark-bg-secondary shadow-xl border-r border-gray-200 dark:border-dark-border flex flex-col"
            style={{ zIndex: auxiliaryZIndex }}
          >
            {/* Header */}
            <div className="bg-gray-50 dark:bg-dark-bg-tertiary border-b border-gray-200 dark:border-dark-border px-6 py-4 flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3 flex-1">
                  <FileText className="h-6 w-6 text-purple-600" />
                  <span className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                    {selectedDocument.nom_affichage}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedDocument(null)}
                  className="p-2 hover:bg-gray-200 dark:hover:bg-dark-bg-secondary rounded-lg transition-colors ml-4"
                >
                  <X className="h-5 w-5 text-gray-500 dark:text-dark-text-muted" />
                </button>
              </div>
              {selectedDocument.taille > 0 && (
                <p className="text-sm text-gray-500 dark:text-dark-text-muted">
                  Taille: {selectedDocument.taille < 1024 ? `${selectedDocument.taille} B` :
                    selectedDocument.taille < 1024 * 1024 ? `${(selectedDocument.taille / 1024).toFixed(1)} Ko` :
                      `${(selectedDocument.taille / (1024 * 1024)).toFixed(1)} Mo`}
                </p>
              )}
            </div>

            {/* Document Content */}
            <div className="flex-1 overflow-auto p-4">
              {(() => {
                // Détection du type de fichier depuis le nom OU depuis l'URL
                let fileExt = selectedDocument.nom_affichage.split('.').pop()?.toLowerCase() || '';

                // Si pas d'extension dans le nom, essayer de détecter depuis l'URL
                if (!fileExt || fileExt === selectedDocument.nom_affichage.toLowerCase()) {
                  // Extraire le nom du fichier depuis l'URL Firebase Storage
                  const urlParts = selectedDocument.url.split('?')[0]; // Enlever les query params
                  const matches = urlParts.match(/documents%2F([^?]+)/);
                  if (matches) {
                    const fileName = decodeURIComponent(matches[1]);
                    fileExt = fileName.split('.').pop()?.toLowerCase() || '';
                  } else {
                    // Fallback: regarder la fin du path
                    const pathParts = urlParts.split('/');
                    const fileName = decodeURIComponent(pathParts[pathParts.length - 1]);
                    fileExt = fileName.split('.').pop()?.toLowerCase() || '';
                  }
                }

                const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt);
                const isPdf = fileExt === 'pdf';

                if (isImage) {
                  return (
                    <div className="space-y-4">
                      <img
                        src={selectedDocument.url}
                        alt={selectedDocument.nom_affichage}
                        className="w-full h-auto rounded border border-gray-300 dark:border-dark-border"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                      />
                      <div className="flex gap-2">
                        <a
                          href={selectedDocument.url}
                          download={selectedDocument.nom_affichage}
                          className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                        >
                          <Download className="h-4 w-4" />
                          Télécharger
                        </a>
                      </div>
                    </div>
                  );
                } else if (isPdf) {
                  return (
                    <div className="space-y-4">
                      <iframe
                        src={selectedDocument.url}
                        className="w-full h-[calc(100vh-200px)] rounded border border-gray-300 dark:border-dark-border"
                        title={selectedDocument.nom_affichage}
                      />
                      <div className="flex gap-2">
                        <a
                          href={selectedDocument.url}
                          download={selectedDocument.nom_affichage}
                          className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                        >
                          <Download className="h-4 w-4" />
                          Télécharger
                        </a>
                      </div>
                    </div>
                  );
                } else {
                  return (
                    <div className="space-y-4">
                      <div className="bg-gray-100 dark:bg-dark-bg-tertiary rounded-lg p-8 text-center">
                        <FileText className="h-16 w-16 text-gray-400 dark:text-dark-text-muted mx-auto mb-4" />
                        <p className="text-gray-600 dark:text-dark-text-secondary mb-4">
                          Aperçu non disponible pour ce type de fichier
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <a
                          href={selectedDocument.url}
                          download={selectedDocument.nom_affichage}
                          className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                        >
                          <Download className="h-4 w-4" />
                          Télécharger
                        </a>
                      </div>
                    </div>
                  );
                }
              })()}
            </div>
          </div>
        )}
        {/* End of Main Content Div */}
      </div>
      {/* End of Overlay Div */}

    {/* Member Selection Panel - Rendered outside main overlay to prevent event bubbling */}
    <MemberSelectionPanel
        isOpen={showMemberSelection}
        onClose={() => setShowMemberSelection(false)}
        onSelectMembers={handleAddParticipants}
        onAddGuest={handleAddGuest}
        existingParticipantIds={linkedInscriptions.map(i => i.membre_id).filter(Boolean) as string[]}
        eventName={operation.titre}
        operation={operation}
      />

      {/* Delete Confirmation Dialog - Rendered outside main overlay */}
      {deleteConfirmation && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]"
          onClick={cancelDelete}
        >
          <div
            className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl p-6 max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-dark-text-primary dark:text-dark-text">
              Confirmer la suppression
            </h3>
            <p className="text-gray-700 dark:text-dark-text-primary mb-6">
              Êtes-vous sûr de vouloir supprimer l'inscription de <strong>{deleteConfirmation?.memberName}</strong> ?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={cancelDelete}
                className="px-4 py-2 bg-gray-200 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary dark:text-dark-text rounded hover:bg-gray-300 dark:hover:bg-dark-border transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-Inscribe Modal */}
      {isAutoInscribeModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]"
          onClick={() => setIsAutoInscribeModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                  Inscrire les payants
                </h3>
                <p className="text-sm text-gray-500 dark:text-dark-text-muted">
                  Créer des inscriptions à partir des transactions liées
                </p>
              </div>
              <button
                onClick={() => setIsAutoInscribeModalOpen(false)}
                className="p-2 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-gray-500 dark:text-dark-text-muted" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {autoInscribeCandidates.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-dark-text-muted">
                  Aucune transaction positive trouvée
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Header row */}
                  <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-gray-100 dark:bg-dark-bg-tertiary rounded-lg text-xs font-medium text-gray-600 dark:text-dark-text-secondary">
                    <div className="col-span-1"></div>
                    <div className="col-span-2">Transaction</div>
                    <div className="col-span-3">Contrepartie</div>
                    <div className="col-span-4">Membre</div>
                    <div className="col-span-2 text-right">Prix</div>
                  </div>

                  {/* Candidate rows */}
                  {autoInscribeCandidates.map((candidate, index) => {
                    const confidenceColor = candidate.isAlreadyInscribed
                      ? 'text-gray-400 dark:text-dark-text-muted'
                      : candidate.matchConfidence >= 70
                        ? 'text-green-600 dark:text-green-400'
                        : candidate.matchConfidence >= 50
                          ? 'text-orange-600 dark:text-orange-400'
                          : 'text-red-600 dark:text-red-400';

                    return (
                      <div
                        key={candidate.transaction.id}
                        className={cn(
                          "grid grid-cols-12 gap-2 px-3 py-3 rounded-lg border transition-colors",
                          candidate.isAlreadyInscribed
                            ? "bg-gray-50 dark:bg-dark-bg-tertiary border-gray-200 dark:border-dark-border opacity-60"
                            : candidate.isSelected
                              ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700"
                              : "bg-white dark:bg-dark-bg-secondary border-gray-200 dark:border-dark-border"
                        )}
                      >
                        {/* Checkbox */}
                        <div className="col-span-1 flex items-center">
                          <input
                            type="checkbox"
                            checked={candidate.isSelected}
                            disabled={candidate.isAlreadyInscribed || (!candidate.selectedMemberId && !candidate.useExternalName)}
                            onChange={(e) => updateCandidateSelection(index, e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 dark:border-dark-border text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                          />
                        </div>

                        {/* Transaction info */}
                        <div className="col-span-2 flex flex-col justify-center">
                          <span className="text-xs font-medium text-gray-900 dark:text-dark-text-primary">
                            {candidate.transaction.numero_sequence || '-'}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-dark-text-muted">
                            {formatDate(candidate.transaction.date_execution)}
                          </span>
                        </div>

                        {/* Contrepartie */}
                        <div className="col-span-3 flex items-center">
                          <span className="text-sm text-gray-900 dark:text-dark-text-primary truncate">
                            {candidate.transaction.contrepartie_nom || '-'}
                          </span>
                        </div>

                        {/* Member selection */}
                        <div className="col-span-4 flex flex-col gap-1">
                          {candidate.isAlreadyInscribed ? (
                            <span className="text-sm text-gray-500 dark:text-dark-text-muted italic">
                              Déjà inscrit
                            </span>
                          ) : (
                            <>
                              <MemberSearchSelect
                                members={allMembers}
                                value={candidate.useExternalName ? 'externe' : candidate.selectedMemberId}
                                onChange={(value) => updateCandidateMember(index, value)}
                                externalOption={candidate.externalName}
                                placeholder="Rechercher un membre..."
                                className="flex-1"
                                confidenceColor={confidenceColor}
                                showConfidence={!candidate.useExternalName}
                                confidenceValue={candidate.matchConfidence}
                              />
                              {/* Editable name fields for external participants */}
                              {candidate.useExternalName && (
                                <div className="flex gap-1">
                                  <input
                                    type="text"
                                    value={candidate.externalName.prenom}
                                    onChange={(e) => updateCandidateExternalName(index, 'prenom', e.target.value)}
                                    placeholder="Prénom"
                                    className="flex-1 px-2 py-1 text-xs border border-purple-200 dark:border-purple-800 rounded bg-purple-50 dark:bg-purple-900/20 text-purple-900 dark:text-purple-200 focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                                  />
                                  <input
                                    type="text"
                                    value={candidate.externalName.nom}
                                    onChange={(e) => updateCandidateExternalName(index, 'nom', e.target.value)}
                                    placeholder="Nom"
                                    className="flex-1 px-2 py-1 text-xs border border-purple-200 dark:border-purple-800 rounded bg-purple-50 dark:bg-purple-900/20 text-purple-900 dark:text-purple-200 focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                                  />
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        {/* Price */}
                        <div className="col-span-2 flex items-center justify-end">
                          {candidate.isAlreadyInscribed ? (
                            <span className="text-sm text-gray-400 dark:text-dark-text-muted">
                              {formatMontant(candidate.price)}
                            </span>
                          ) : (
                            <input
                              type="number"
                              step="0.01"
                              value={candidate.price}
                              onChange={(e) => updateCandidatePrice(index, parseFloat(e.target.value) || 0)}
                              className="w-24 text-sm text-right border rounded-lg px-2 py-1.5 dark:bg-dark-bg-tertiary dark:border-dark-border"
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 dark:border-dark-border flex items-center justify-between">
              <div className="text-sm text-gray-600 dark:text-dark-text-secondary">
                {autoInscribeCandidates.filter(c => c.isSelected && !c.isAlreadyInscribed).length} sur {autoInscribeCandidates.filter(c => !c.isAlreadyInscribed).length} sélectionné(s)
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsAutoInscribeModalOpen(false)}
                  className="px-4 py-2 bg-gray-200 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary dark:text-dark-text rounded-lg hover:bg-gray-300 dark:hover:bg-dark-border transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleAutoInscribe}
                  disabled={isAutoInscribing || autoInscribeCandidates.filter(c => c.isSelected && !c.isAlreadyInscribed).length === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {isAutoInscribing ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                      Inscription...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      Inscrire ({autoInscribeCandidates.filter(c => c.isSelected && !c.isAlreadyInscribed).length})
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Communication Modal (SMS/WhatsApp/Email) */}
      {showCommunicationModal && clubId && (() => {
        // Accounting summary (aligned with the Liaisons tab)
        const totalCollected = accountingSummary.revenueTotal;
        const totalExpenses = accountingSummary.expenseTotal;
        const eventBalance = accountingSummary.balance;

        // Participant/demand summary kept for informational templates
        const participantCollectedTotal = linkedInscriptions
          .filter(i => i.paye)
          .reduce((sum, i) => sum + (i.transaction_montant || i.montant_paye_especes || i.prix) + (i.supplement_total || 0), 0);
        const linkedDemandsTotal = linkedDemands.reduce((sum, d) => sum + d.montant, 0);
        const participantBalance = participantCollectedTotal - linkedDemandsTotal;

        // Calculate balance styling
        const getBalanceStyling = (balance: number) => {
          if (balance > 0) {
            return {
              balanceStatus: 'positive' as const,
              balanceColor: '#059669',
              balanceBgColor: '#D1FAE5',
              balanceBorderColor: '#10B981',
              balanceDisplay: `+${balance.toFixed(2)}`,
            };
          } else if (balance < 0) {
            return {
              balanceStatus: 'negative' as const,
              balanceColor: '#DC2626',
              balanceBgColor: '#FEE2E2',
              balanceBorderColor: '#F87171',
              balanceDisplay: balance.toFixed(2),
            };
          }
          return {
            balanceStatus: 'neutral' as const,
            balanceColor: '#F59E0B',
            balanceBgColor: '#FEF3C7',
            balanceBorderColor: '#FBBF24',
            balanceDisplay: '0.00',
          };
        };
        const balanceStyling = getBalanceStyling(eventBalance);

        // Build participants array with styling
        const participants = linkedInscriptions.map(inscription => {
          const member = allMembers.find(m => m.id === inscription.membre_id);
          const paidAmount = inscription.paye ? (inscription.transaction_montant || inscription.montant_paye_especes || inscription.prix) : 0;
          const expectedAmount = inscription.prix + (inscription.supplement_total || 0);
          const balance = paidAmount - expectedAmount;
          // Use membre_nom/prenom if available, else fallback to member lookup
          const displayName = member
            ? `${getFirstName(member)} ${getLastName(member)}`
            : `${inscription.membre_prenom || ''} ${inscription.membre_nom || ''}`.trim() || 'Inconnu';
          return {
            name: displayName,
            paidAmount: paidAmount,
            paymentMethod: inscription.mode_paiement || 'Non spécifié',
            expectedAmount: expectedAmount,
            balance: balance,
            balanceColor: balance > 0 ? '#059669' : balance < 0 ? '#DC2626' : '#6B7280',
            balanceDisplay: balance > 0 ? `+${balance.toFixed(2)}` : balance.toFixed(2),
          };
        });

        // Build expenses array with styling
        const expenses = linkedDemands.map(demand => ({
          date: formatDate(demand.date_soumission),
          demandeur: demand.demandeur_nom || 'Inconnu',
          description: demand.description || '',
          montant: demand.montant,
          status: demand.statut === 'rembourse' ? 'Remboursé' : 'À rembourser',
          statusBgColor: demand.statut === 'rembourse' ? '#D1FAE5' : '#FEF3C7',
          statusTextColor: demand.statut === 'rembourse' ? '#065F46' : '#92400E',
        }));

        return (
          <CommunicationModal
            isOpen={showCommunicationModal}
            onClose={() => setShowCommunicationModal(false)}
            context={{
              type: 'evenements',
              // Activity info
              activityId: operation.id,
              activityName: operation.titre || 'Activité',
              activityDate: operation.date_debut ? formatDate(operation.date_debut) : '',
              activityLocation: operation.lieu || '',
              // Financial summary
              participantsCount: linkedInscriptions.length,
              expectedPrice: operation.prix_membre || operation.event_tariffs?.[0]?.price || 0,
              totalCollected,
              totalExpenses,
              totalReimbursements: linkedDemandsTotal,
              eventBalance,
              ...balanceStyling,
              // Extra summaries for templates that distinguish accounting from participant cashflow
              participantCollectedTotal,
              linkedDemandsTotal,
              participantBalance,
              // Common
              clubName: 'Calypso Diving Club',
              logoUrl: 'https://caly.club/logo-horizontal.jpg',
              appUrl: 'https://caly.club',
              // Arrays for Handlebars templates (direct, not JSON strings)
              participants,
              expenses,
              // Legacy fields for backwards compatibility
              nom: operation.titre || 'Activité',
              date: operation.date_debut ? formatDate(operation.date_debut) : '',
              titre: operation.titre || 'Activité',
              lieu: operation.lieu,
            }}
            membres={allMembers}
            clubId={clubId}
            onSuccess={() => {
              setShowCommunicationModal(false);
            }}
          />
        );
      })()}
      {/* Palanquée Builder Modal */}
      {showPalanqueeBuilder && clubId && user && (
        <React.Suspense fallback={<div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50"><div className="bg-white rounded-xl p-8 text-gray-600">Chargement...</div></div>}>
          <PalanqueeBuilder
            operation={operation}
            inscriptions={linkedInscriptions}
            allMembers={allMembers}
            clubId={clubId}
            userId={user.uid}
            onClose={() => setShowPalanqueeBuilder(false)}
            onSaved={() => {
              // Optioneel: refresh inscriptions of andere data
            }}
          />
        </React.Suspense>
      )}

      {/* Exercise Evaluation Modal */}
      {evaluationTarget && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Évaluer exercice
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {evaluationTarget.memberName}
              </p>
            </div>

            {/* Content */}
            <div className="px-6 py-4 space-y-4">
              {/* Exercise Info */}
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded p-3">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {evaluationTarget.exerciceCode}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {evaluationTarget.exerciceDescription}
                </div>
              </div>

              {/* Result Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Résultat
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {OBSERVATION_RESULTS.map(res => (
                    <button
                      key={res.value}
                      onClick={() => setEvaluationResult(res.value)}
                      className={cn(
                        "px-3 py-2 rounded-lg text-sm font-medium transition-all border-2",
                        evaluationResult === res.value
                          ? "border-current shadow-sm"
                          : "border-transparent opacity-70 hover:opacity-100",
                        res.value === 'acquis' && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                        res.value === 'en_progres' && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                        res.value === 'a_revoir' && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                      )}
                    >
                      {res.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Remarques (optionnel)
                </label>
                <textarea
                  value={evaluationNote}
                  onChange={(e) => setEvaluationNote(e.target.value)}
                  placeholder="Ajouter des remarques sur l'exercice..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
              <button
                onClick={() => {
                  setEvaluationTarget(null);
                  setEvaluationResult(null);
                  setEvaluationNote('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSaveEvaluation}
                disabled={!evaluationResult || isSavingEvaluation}
                className={cn(
                  "flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors",
                  (!evaluationResult || isSavingEvaluation)
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700"
                )}
              >
                {isSavingEvaluation ? 'Sauvegarde...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
