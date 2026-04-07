import { useState, useEffect, useRef } from 'react';
import { logger } from '@/utils/logger';
import {
  X,
  FileText,
  Users,
  Download,
  Eye,
  Split,
  Link2,
  Link2Off,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  Paperclip,
  Tag,
  Upload,
  Image as ImageIcon,
  File,
  ExternalLink,
  Trash2,
  MessageCircle,
  UserCheck,
  Flag,
  Plus,
  Wand2,
  RotateCcw
} from 'lucide-react';
import {
  TransactionBancaire,
  DemandeRemboursement,
  Evenement,
  TransactionSplit,
  DocumentJustificatif,
  Membre
} from '@/types';
import { formatMontant, formatDate, cn, getCategoryColorClasses } from '@/utils/utils';
import { CategoryAccountSelector } from './CategoryAccountSelector';
import { CategorizationService } from '@/services/categorizationService';
import { AccountCodeService } from '@/services/accountCodeService';
import { TransactionSummaryCard } from './TransactionSummaryCard';
import { CodeComptableAuditTrail } from './CodeComptableAuditTrail';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { CommunicationModal } from '@/components/common/CommunicationModal';
import type { SMSContextData } from '@/types/sms';
import { canAutoMatch, autoMatchByEventNumber, resetAutoMatch } from '@/services/eventNumberMatchingService';

interface TransactionDetailViewProps {
  transaction: TransactionBancaire;
  demands?: DemandeRemboursement[];
  events?: Evenement[];
  splits?: TransactionSplit[];
  childTransactions?: TransactionBancaire[]; // Transactions enfants si c'est un parent
  isOpen: boolean;
  onClose: () => void;
  onLinkEvent?: () => void;
  onLinkExpense?: () => void;
  onCreateReimbursement?: () => void; // NEW: Create expense to refund this transaction
  onUnlink?: (demandId: string) => void; // Now accepts demandId to unlink specific demand
  onUnlinkEvent?: (eventId: string) => void;
  onLinkMember?: () => void; // NEW: Open member linking panel
  onUnlinkMember?: (memberId: string) => void; // NEW: Unlink member from transaction
  onNavigateToMember?: (memberId: string) => void; // NEW: Navigate to member detail
  onSplit?: () => void;
  onUpdateTransaction?: (updates: Partial<TransactionBancaire>) => void;
  onUpdateChildTransaction?: (childId: string, updates: Partial<TransactionBancaire>) => Promise<void>; // NEW: Update child transaction with auto-save
  onNavigateToEvent?: (eventId: string) => void;
  onNavigateToDemand?: (demandId: string) => void;
  onAddDocument?: (files: FileList) => Promise<void>;
  onDeleteDocument?: (url: string) => Promise<void>;
  onDelete?: () => Promise<void>; // NEW: Delete transaction (superadmin only)
  navigationPosition?: { current: number; total: number } | null; // NEW: Keyboard navigation position (X van Y)
  onNavigatePrevious?: () => void; // NEW: Navigate to previous transaction
  onNavigateNext?: () => void; // NEW: Navigate to next transaction
  returnContext?: { type: string; id: string; name: string } | null; // NEW: Return navigation context
  selectedTransactionIds?: Set<string>; // NEW: Selected transactions for bulk operations
  onBulkCodeAssigned?: () => Promise<void>; // NEW: Callback after bulk code assignment
  membres?: Membre[]; // For CommunicationModal
  onOpenContext?: () => void;
  contextActionLabel?: string;
  stackLevel?: number;
}

// Composant pour une ligne enfant éditable
interface EditableChildLineProps {
  child: TransactionBancaire;
  onUpdateChildTransaction?: (childId: string, updates: Partial<TransactionBancaire>) => Promise<void>;
  membres?: Membre[];
}

function EditableChildLine({ child, onUpdateChildTransaction, membres = [] }: EditableChildLineProps) {
  // Chercher le membre lié dans matched_entities
  const linkedMemberEntity = child.matched_entities?.find(me => me.entity_type === 'member');
  const linkedMember = linkedMemberEntity
    ? membres.find(m => m.id === linkedMemberEntity.entity_id)
    : null;
  const [editedDescription, setEditedDescription] = useState(child.contrepartie_nom);

  const handleSaveDescription = async () => {
    if (!onUpdateChildTransaction) return;
    if (editedDescription === child.contrepartie_nom) return; // Pas de changement

    if (!editedDescription || !editedDescription.trim()) {
      toast.error('La description ne peut pas être vide');
      setEditedDescription(child.contrepartie_nom); // Reset
      return;
    }

    await onUpdateChildTransaction(child.id, {
      contrepartie_nom: editedDescription.trim()
    });
  };

  return (
    <div className="flex items-center justify-between p-2 bg-white dark:bg-dark-bg-secondary rounded border border-orange-100 dark:border-orange-800">
      <div className="flex items-center gap-2 flex-1">
        <span className="text-blue-600 dark:text-blue-400 font-bold">└─</span>
        <div className="flex-1">
          {/* Description éditable */}
          <input
            type="text"
            value={editedDescription}
            onChange={(e) => setEditedDescription(e.target.value)}
            onBlur={handleSaveDescription}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur(); // Trigger onBlur to save
              }
            }}
            className="text-sm font-medium text-gray-900 dark:text-dark-text-primary bg-transparent border-b border-dashed border-gray-300 dark:border-dark-border dark:border-gray-600 hover:border-gray-400 focus:border-orange-500 focus:outline-none w-full px-1 py-0.5 transition-colors"
            placeholder="Description"
          />
          {/* Code comptable */}
          {child.code_comptable && (() => {
            const accountCode = AccountCodeService.getByCode(child.code_comptable);
            return (
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                <span className="font-mono">{child.code_comptable}</span>
                {accountCode?.label && (
                  <span className="text-gray-500 dark:text-dark-text-muted ml-1">- {accountCode.label}</span>
                )}
              </p>
            );
          })()}
          {/* Membre lié */}
          {linkedMember && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-0.5 flex items-center gap-1">
              <UserCheck className="h-3 w-3" />
              <span>{linkedMember.prenom} {linkedMember.nom}</span>
            </p>
          )}
        </div>
      </div>
      <div className="text-right">
        <p className={cn(
          "text-sm font-semibold",
          child.montant > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
        )}>
          {formatMontant(child.montant)}
        </p>
        {child.categorie && (() => {
          const categories = CategorizationService.getAllCategories();
          const category = categories.find(c => c.id === child.categorie);
          const colorClasses = getCategoryColorClasses(child.categorie, categories);
          return (
            <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", colorClasses)}>
              <Tag className="h-3 w-3" />
              {category?.nom}
            </span>
          );
        })()}
      </div>
    </div>
  );
}

export function TransactionDetailView({
  transaction,
  demands = [],
  events = [],
  splits = [],
  childTransactions = [],
  isOpen,
  onClose,
  onLinkEvent,
  onLinkExpense,
  onCreateReimbursement,
  onUnlink,
  onUnlinkEvent,
  onLinkMember,
  onUnlinkMember,
  onNavigateToMember,
  onSplit,
  onUpdateTransaction,
  onUpdateChildTransaction,
  onNavigateToEvent,
  onNavigateToDemand,
  onAddDocument,
  onDeleteDocument,
  onDelete,
  navigationPosition,
  onNavigatePrevious,
  onNavigateNext,
  returnContext = null,
  selectedTransactionIds,
  onBulkCodeAssigned,
  membres = [],
  onOpenContext,
  contextActionLabel = 'Aller aux transactions',
  stackLevel = 0
}: TransactionDetailViewProps) {
  const { appUser, clubId } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'categorization' | 'splits' | 'documents'>('overview');
  const [selectedDocumentUrl, setSelectedDocumentUrl] = useState<string | null>(null);
  const [localTransaction, setLocalTransaction] = useState(transaction);
  const [isEditingDocName, setIsEditingDocName] = useState(false);
  const [editedDocName, setEditedDocName] = useState('');
  const [isBulkCodeModalOpen, setIsBulkCodeModalOpen] = useState(false);
  const [showCommunicationModal, setShowCommunicationModal] = useState(false);
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [flagReason, setFlagReason] = useState('');
  const [isAutoMatching, setIsAutoMatching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const commentDebounceTimer = useRef<NodeJS.Timeout | null>(null);
  const zIndexOffset = stackLevel * 40;
  const backdropZIndex = 40 + zIndexOffset;
  const panelZIndex = 50 + zIndexOffset;
  const auxiliaryZIndex = 60 + zIndexOffset;
  const modalZIndex = 70 + zIndexOffset;

  // Auto-match par event_number
  const detectedEventNumber = canAutoMatch(localTransaction);

  const handleAutoMatch = async () => {
    if (!clubId || !detectedEventNumber) return;
    setIsAutoMatching(true);
    try {
      const result = await autoMatchByEventNumber(clubId, localTransaction);
      if (result.success) {
        toast.success(result.message, { duration: 5000 });
        // Mettre à jour l'UI locale immédiatement
        if (result.transactionUpdates) {
          setLocalTransaction(prev => ({ ...prev, ...result.transactionUpdates }));
        }
        // Syncer le parent (liste + détail) — Firestore est déjà à jour,
        // le double-write est idempotent et garantit le refresh de la liste
        if (onUpdateTransaction && result.transactionUpdates) {
          onUpdateTransaction(result.transactionUpdates);
        }
      } else {
        toast.error(result.message);
      }
    } catch (error: any) {
      toast.error(error.message || 'Erreur auto-match');
    } finally {
      setIsAutoMatching(false);
    }
  };

  // Reset auto-match (délier tout — pour test)
  // TEMP: visible dès qu'il y a des liaisons (pas seulement auto), pour faciliter les tests
  const hasAutoMatchEntities = (localTransaction.matched_entities || []).length > 0;

  const handleResetAutoMatch = async () => {
    if (!clubId) return;
    setIsAutoMatching(true);
    try {
      const result = await resetAutoMatch(clubId, localTransaction);
      if (result.success) {
        toast.success(result.message, { duration: 4000 });
        if (result.transactionUpdates) {
          setLocalTransaction(prev => ({ ...prev, ...result.transactionUpdates }));
        }
        if (onUpdateTransaction && result.transactionUpdates) {
          onUpdateTransaction(result.transactionUpdates);
        }
      } else {
        toast.error(result.message);
      }
    } catch (error: any) {
      toast.error(error.message || 'Erreur reset');
    } finally {
      setIsAutoMatching(false);
    }
  };

  // Helper function to get documents — merges both new and legacy formats
  // to avoid losing documents uploaded via mobile (urls_justificatifs)
  // when web admin later adds documents (documents_justificatifs)
  const getDocuments = (source: TransactionBancaire | DemandeRemboursement): DocumentJustificatif[] => {
    const docs: DocumentJustificatif[] = [];

    // New format documents
    if (source.documents_justificatifs && source.documents_justificatifs.length > 0) {
      docs.push(...source.documents_justificatifs);
    }

    // Legacy format: convert urls_justificatifs and add any that aren't already present
    if (source.urls_justificatifs && source.urls_justificatifs.length > 0) {
      const existingUrls = new Set(docs.map(d => d.url));

      for (const url of source.urls_justificatifs) {
        if (existingUrls.has(url)) continue; // skip duplicates

        // Détection du type de fichier depuis l'URL
        let type = 'application/octet-stream';
        const urlLower = url.toLowerCase();

        if (urlLower.includes('.pdf')) {
          type = 'application/pdf';
        } else if (urlLower.includes('.jpg') || urlLower.includes('.jpeg')) {
          type = 'image/jpeg';
        } else if (urlLower.includes('.png')) {
          type = 'image/png';
        } else if (urlLower.includes('.gif')) {
          type = 'image/gif';
        } else if (urlLower.includes('.webp')) {
          type = 'image/webp';
        }

        docs.push({
          url,
          nom_original: `Photo (mobile)`,
          nom_affichage: `Photo (mobile)`,
          type,
          taille: 0,
          date_upload: source.created_at || new Date(),
        });
      }
    }

    return docs;
  };

  // Update local transaction when prop changes
  useEffect(() => {
    setLocalTransaction(transaction);
  }, [transaction]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (commentDebounceTimer.current) {
        clearTimeout(commentDebounceTimer.current);
      }
    };
  }, []);

  // Handle file upload
  const handleFileUpload = async () => {
    if (!fileInputRef.current?.files || !onAddDocument) return;

    const files = fileInputRef.current.files;
    if (files.length === 0) return;

    try {
      await onAddDocument(files);
      if (fileInputRef.current) {
        fileInputRef.current.value = ''; // Reset file input
      }
    } catch (error) {
      logger.error('Error uploading documents:', error);
    }
  };

  // Handle document deletion
  const handleDeleteDocument = async (urlToDelete: string) => {
    if (!confirm('Voulez-vous vraiment supprimer ce document ?')) {
      return;
    }

    if (onDeleteDocument) {
      try {
        await onDeleteDocument(urlToDelete);
      } catch (error) {
        logger.error('Error deleting document:', error);
      }
    }
  };

  // Handle document name save
  const handleSaveDocumentName = () => {
    if (!selectedDocumentUrl || !editedDocName.trim() || !onUpdateTransaction) return;

    const transactionDocs = getDocuments(localTransaction);
    const selectedDoc = transactionDocs.find(doc => doc.url === selectedDocumentUrl);

    if (!selectedDoc) return;

    // Update the document name in the documents array
    const updatedDocs = transactionDocs.map(doc =>
      doc.url === selectedDocumentUrl
        ? { ...doc, nom_affichage: editedDocName.trim() }
        : doc
    );

    // Update transaction with new documents array
    onUpdateTransaction({ documents_justificatifs: updatedDocs });
    setIsEditingDocName(false);

    toast.success('Nom du document mis à jour');
  };

  // Get linked entities
  const linkedDemands = demands.filter(d => {
    const matchByTransactionId = d.transaction_id === transaction.id;
    const matchByEntity = transaction.matched_entities?.some(e => {
      // Support both 'expense' and legacy 'demand' type for backwards compatibility
      if (e.entity_type !== 'expense' && e.entity_type !== 'demand') return false;

      // Essayer de matcher par ID OU par description (fallback)
      const matchById = e.entity_id === d.id;

      // Normaliser les chaînes pour le match : supprimer tous les espaces blancs (espaces, retours à la ligne, tabs)
      const normalizeString = (str: string) => str.replace(/\s+/g, '').toLowerCase();
      const matchByDescription = e.entity_name && d.description &&
        normalizeString(e.entity_name) === normalizeString(d.description);

      const matches = matchById || matchByDescription;
      return matches;
    });
    return matchByTransactionId || matchByEntity;
  });

  const linkedEvents = events.filter(e =>
    transaction.matched_entities?.some(me => me.entity_type === 'event' && me.entity_id === e.id)
  );

  // Get linked member from matched_entities
  const linkedMemberEntity = transaction.matched_entities?.find(me => me.entity_type === 'member');
  const linkedMember = linkedMemberEntity
    ? membres.find(m => m.id === linkedMemberEntity.entity_id)
    : null;

  // Helper: check if code comptable is cotisation family (730-00-7xx ou 493-00-719)
  const isCotisationCode = (code: string | undefined): boolean => {
    if (!code) return false;
    return code.startsWith('730-00-7') || code === '493-00-719';
  };

  const showMemberLinkButton = isCotisationCode(localTransaction.code_comptable);

  const transactionSplits = splits.filter(s => s.bank_transaction_id === transaction.id);

  // Determine which tabs to show
  // Toujours montrer l'onglet Demandes si la transaction a matched_entities de type 'expense' ou 'demand' (legacy)
  const hasExpenseEntities = transaction.matched_entities?.some(e => e.entity_type === 'expense' || e.entity_type === 'demand') || false;
  const hasEventEntities = transaction.matched_entities?.some(e => e.entity_type === 'event') || false;

  // IMPORTANT: Montrer l'onglet même si l'entité n'est pas chargée, pour permettre la déliaison
  const showDemands = linkedDemands.length > 0 || hasExpenseEntities;
  const showEvents = linkedEvents.length > 0 || hasEventEntities;
  const showSplits = transactionSplits.length > 0;
  // Documents tab is always shown (unlike demands/events which are conditional)

  // Calculate total documents count (transaction + linked demands)
  const transactionDocs = getDocuments(localTransaction);
  const demandsDocs = linkedDemands.flatMap(d => getDocuments(d));
  const totalDocumentsCount = transactionDocs.length + demandsDocs.length;

  useEffect(() => {
    if (isOpen) {
      // Always start on overview tab when opening
      setActiveTab('overview');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-30 transition-opacity"
        style={{ zIndex: backdropZIndex }}
        onClick={onClose}
      />

      {/* Slide-out Panel */}
      <div className={cn(
        "fixed right-0 top-0 h-full w-full md:w-2/3 lg:w-1/2 bg-white dark:bg-dark-bg-secondary shadow-xl",
        "transform transition-transform duration-300 ease-in-out flex flex-col",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}
      style={{ zIndex: panelZIndex }}>
        {/* Compact Header */}
        <div className="flex-shrink-0 bg-gray-50 dark:bg-dark-bg-tertiary border-b border-gray-200 dark:border-dark-border px-4 py-2">
          <div className="flex items-center justify-between gap-2">
            {/* Left: Title and info */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <h2 className="text-base font-semibold text-gray-900 dark:text-dark-text-primary whitespace-nowrap">Transaction</h2>
              <span className="text-gray-400 dark:text-dark-text-muted hidden sm:inline">•</span>
              <p className="text-sm text-gray-500 dark:text-dark-text-muted truncate hidden sm:block">
                {formatDate(transaction.date_execution)} • {transaction.numero_sequence}
              </p>
            </div>

            {/* Right: Navigation + Actions */}
            <div className="flex items-center gap-1">
              {onOpenContext && (
                <button
                  onClick={onOpenContext}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border text-sm font-medium text-gray-700 dark:text-dark-text-primary rounded-md hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary transition-colors"
                  title={contextActionLabel}
                >
                  <ExternalLink className="h-4 w-4" />
                  <span className="hidden sm:inline">{contextActionLabel}</span>
                </button>
              )}
              {/* Navigation counter (compact) */}
              {navigationPosition && (
                <div className="flex items-center bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-800 rounded-md mr-1">
                  <button
                    onClick={onNavigatePrevious}
                    disabled={!onNavigatePrevious}
                    className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-l-md transition-colors disabled:opacity-30"
                    title="← Précédente"
                  >
                    <ChevronLeft className="h-4 w-4 text-gray-600 dark:text-dark-text-secondary" />
                  </button>
                  <span className="px-2 text-xs font-medium text-gray-600 dark:text-dark-text-secondary tabular-nums">
                    {navigationPosition.current}/{navigationPosition.total}
                  </span>
                  <button
                    onClick={onNavigateNext}
                    disabled={!onNavigateNext}
                    className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-r-md transition-colors disabled:opacity-30"
                    title="Suivante →"
                  >
                    <ChevronRight className="h-4 w-4 text-gray-600 dark:text-dark-text-secondary" />
                  </button>
                </div>
              )}

              {/* Action buttons */}
              {!transaction.reconcilie && !transaction.is_parent && !transaction.is_split && !transaction.parent_transaction_id && onSplit && (
                <button
                  onClick={onSplit}
                  className="p-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-md hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                  title="Ventiler"
                >
                  <Split className="h-4 w-4" />
                </button>
              )}
              {(transaction.is_parent || transaction.is_split) && !transaction.parent_transaction_id && onSplit && (
                <button
                  onClick={onSplit}
                  className="p-1.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-md hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors"
                  title="Modifier ventilation"
                >
                  <Split className="h-4 w-4" />
                </button>
              )}
              {/* TEMP: Supprimer visible pour admin si aucune liaison (pour tests import) */}
              {onDelete && (!localTransaction.matched_entities || localTransaction.matched_entities.length === 0) && (
                <button
                  onClick={onDelete}
                  className="p-1.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-md hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                  title="Supprimer la transaction"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              {/* Flag as problematic button */}
              <button
                onClick={() => {
                  if (localTransaction.flagged_problematic) {
                    // Unflag directly
                    onUpdateTransaction?.({
                      flagged_problematic: false,
                      flagged_at: null as any,
                      flagged_by: null as any,
                      flagged_by_name: null as any,
                      flagged_reason: null as any
                    });
                    setLocalTransaction(prev => ({
                      ...prev,
                      flagged_problematic: false,
                      flagged_at: undefined,
                      flagged_by: undefined,
                      flagged_by_name: undefined,
                      flagged_reason: undefined
                    }));
                    toast.success('Signalement retiré');
                  } else {
                    // Show modal to capture reason
                    setFlagReason('');
                    setShowFlagModal(true);
                  }
                }}
                className={cn(
                  "p-1.5 rounded-md transition-colors",
                  localTransaction.flagged_problematic
                    ? "bg-red-500 text-white hover:bg-red-600"
                    : "bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-800 text-gray-600 dark:text-dark-text-secondary hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600"
                )}
                title={localTransaction.flagged_problematic ? "Retirer le signalement" : "Signaler comme problématique"}
              >
                <Flag className="h-4 w-4" />
              </button>
              {clubId && membres.length > 0 && (
                <button
                  onClick={() => setShowCommunicationModal(true)}
                  className="p-1.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-md hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
                  title="Message"
                >
                  <MessageCircle className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-gray-200 dark:hover:bg-dark-bg-tertiary rounded-md transition-colors ml-1"
                title="Fermer"
              >
                <X className="h-4 w-4 text-gray-500 dark:text-dark-text-muted" />
              </button>
            </div>
          </div>
        </div>

        {/* Transaction Summary Card - Always Visible */}
        <div className="flex-shrink-0 px-6 py-4 bg-gray-50 dark:bg-dark-bg-tertiary border-b border-gray-200 dark:border-dark-border">
          <TransactionSummaryCard
            transaction={localTransaction}
          />

          {/* Statut de réconciliation - Toujours visible */}
          <div className="mt-4 p-4 bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">Statut de réconciliation</p>
                {transaction.matched_entities && transaction.matched_entities.length > 0 ? (
                  <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                    Lié à {transaction.matched_entities.length} entité{transaction.matched_entities.length > 1 ? 's' : ''}
                  </p>
                ) : (
                  <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                    {transaction.statut_reconciliation === 'pas_trouve'
                      ? "Vérifié - Aucune correspondance trouvée"
                      : "Cliquez sur le bouton pour changer le statut"}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* Bouton auto-match par event_number */}
                {/* Bouton auto-match (baguette magique) — visible si event_number détecté et pas encore lié */}
                {detectedEventNumber && (
                  <button
                    onClick={handleAutoMatch}
                    disabled={isAutoMatching}
                    title={`Auto-match: code ${detectedEventNumber} détecté`}
                    className={cn(
                      "px-3 py-2 text-sm rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm",
                      isAutoMatching
                        ? "bg-purple-200 dark:bg-purple-900/40 text-purple-400 cursor-wait"
                        : "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/40"
                    )}
                  >
                    <Wand2 className={cn("h-4 w-4", isAutoMatching && "animate-spin")} />
                    <span className="font-mono text-xs">{detectedEventNumber}</span>
                  </button>
                )}
                {/* Bouton délier tout (reset) — visible si des entités auto-matchées existent */}
                {hasAutoMatchEntities && (
                  <button
                    onClick={handleResetAutoMatch}
                    disabled={isAutoMatching}
                    title="Délier tout (reset auto-match)"
                    className={cn(
                      "px-3 py-2 text-sm rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm",
                      isAutoMatching
                        ? "bg-red-200 dark:bg-red-900/40 text-red-400 cursor-wait"
                        : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/40"
                    )}
                  >
                    <RotateCcw className={cn("h-4 w-4", isAutoMatching && "animate-spin")} />
                  </button>
                )}
                {transaction.matched_entities && transaction.matched_entities.length > 0 ? (
                  // Non éditable si des entités sont liées
                  <div className="px-4 py-2 text-sm rounded-lg font-medium flex items-center gap-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                    <CheckCircle className="h-4 w-4" />
                    Réconcilié
                  </div>
                ) : (
                  // Éditable si aucune entité liée - 3 états
                  <button
                    onClick={() => {
                      // Cycle à travers 3 états: non_verifie → pas_trouve → reconcilie → non_verifie
                      const currentStatus = transaction.statut_reconciliation || 'non_verifie';
                      let newStatus: 'non_verifie' | 'pas_trouve' | 'reconcilie';
                      let newReconcilie: boolean;

                      if (currentStatus === 'non_verifie') {
                        newStatus = 'pas_trouve';
                        newReconcilie = false;
                      } else if (currentStatus === 'pas_trouve') {
                        newStatus = 'reconcilie';
                        newReconcilie = true;
                      } else {
                        newStatus = 'non_verifie';
                        newReconcilie = false;
                      }

                      if (onUpdateTransaction) {
                        onUpdateTransaction({
                          statut_reconciliation: newStatus,
                          reconcilie: newReconcilie
                        });
                      }
                    }}
                    className={cn(
                      "px-4 py-2 text-sm rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm",
                      transaction.statut_reconciliation === 'reconcilie'
                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/40"
                        : transaction.statut_reconciliation === 'pas_trouve'
                        ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/40"
                        : "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-900/40"
                    )}
                  >
                    {transaction.statut_reconciliation === 'reconcilie' ? (
                      <>
                        <CheckCircle className="h-4 w-4" />
                        Réconcilié
                      </>
                    ) : transaction.statut_reconciliation === 'pas_trouve' ? (
                      <>
                        <X className="h-4 w-4" />
                        Pas trouvé
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-4 w-4" />
                        Non vérifié
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Flagged as problematic indicator */}
          {localTransaction.flagged_problematic && (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg flex-shrink-0">
                  <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-red-800 dark:text-red-200">
                    Transaction signalée comme problématique
                  </h4>
                  {localTransaction.flagged_reason && (
                    <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                      {localTransaction.flagged_reason}
                    </p>
                  )}
                  <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                    Signalée par {localTransaction.flagged_by_name || 'Inconnu'}
                    {localTransaction.flagged_at && ` le ${formatDate(localTransaction.flagged_at)}`}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Afficher les enfants si c'est une transaction parent */}
          {(transaction.is_parent || transaction.is_split) && childTransactions.length > 0 && (
            <div className="mt-4 p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <Split className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                <p className="text-sm font-semibold text-orange-900 dark:text-orange-400">Transaction ventilée en {childTransactions.length} lignes</p>
              </div>
              <div className="space-y-2">
                {childTransactions.map((child) => (
                  <EditableChildLine
                    key={child.id}
                    child={child}
                    onUpdateChildTransaction={onUpdateChildTransaction}
                    membres={membres}
                  />
                ))}
              </div>
              <p className="text-xs text-orange-700 dark:text-orange-400 mt-3 font-medium">
                🔒 Cette transaction mère ne peut pas être utilisée directement. Utilisez les lignes ci-dessus.
              </p>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex-shrink-0 border-b border-gray-200 dark:border-dark-border px-6 bg-white dark:bg-dark-bg-secondary">
          <nav className="flex space-x-6 -mb-px overflow-x-auto">
            <button
              onClick={() => setActiveTab('overview')}
              className={cn(
                "py-3 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap",
                activeTab === 'overview'
                  ? "border-calypso-blue dark:border-calypso-aqua text-calypso-blue dark:text-calypso-aqua"
                  : "border-transparent text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:text-dark-text-primary dark:hover:text-dark-text-primary hover:border-gray-300 dark:border-dark-border dark:hover:border-dark-border"
              )}
            >
              Vue d'ensemble
            </button>
            {showSplits && (
              <button
                onClick={() => setActiveTab('splits')}
                className={cn(
                  "py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 whitespace-nowrap",
                  activeTab === 'splits'
                    ? "border-calypso-blue dark:border-calypso-aqua text-calypso-blue dark:text-calypso-aqua"
                    : "border-transparent text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:text-dark-text-primary dark:hover:text-dark-text-primary hover:border-gray-300 dark:border-dark-border dark:hover:border-dark-border"
                )}
              >
                <Split className="h-4 w-4" />
                Ventilation ({transactionSplits.length})
              </button>
            )}
            {/* Always show Documents tab */}
            <button
              onClick={() => setActiveTab('documents')}
              className={cn(
                "py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 whitespace-nowrap",
                activeTab === 'documents'
                  ? "border-calypso-blue text-calypso-blue"
                  : "border-transparent text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:text-dark-text-primary dark:hover:text-dark-text-primary hover:border-gray-300 dark:border-dark-border dark:hover:border-dark-border"
              )}
            >
              <Paperclip className="h-4 w-4" />
              Documents ({totalDocumentsCount})
            </button>
          </nav>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* 1. Code comptable */}
              <div>
                <h3 className="font-medium text-gray-900 dark:text-dark-text-primary mb-3 flex items-center gap-2">
                  <Tag className="h-5 w-5" />
                  Code comptable
                </h3>
                <CategoryAccountSelector
                  transaction={localTransaction}
                  clubId={clubId}
                  enableLearning={true}
                  userId={appUser?.id}
                  onLearnPattern={async (pattern) => {
                    await CategorizationService.learnPattern(clubId, pattern);
                  }}
                  onCategoryChange={(categoryId) => {
                    const updatedTransaction = { ...localTransaction, categorie: categoryId };
                    setLocalTransaction(updatedTransaction);
                    if (onUpdateTransaction) {
                      onUpdateTransaction({ categorie: categoryId });
                    }
                    if (categoryId && localTransaction.code_comptable) {
                      CategorizationService.learnFromUserInput(
                        clubId,
                        localTransaction,
                        categoryId,
                        localTransaction.code_comptable
                      );
                    }
                  }}
                  onAccountCodeChange={(accountCode) => {
                    // Créer l'entrée audit trail
                    const auditEntry: import('@/types').CodeComptableAudit = {
                      code_comptable: accountCode,
                      categorie: localTransaction.categorie,
                      assigned_by: appUser?.id || 'unknown',
                      assigned_by_name: appUser?.displayName || appUser?.email || 'Utilisateur inconnu',
                      assigned_at: new Date(),
                      previous_code: localTransaction.code_comptable,
                      previous_categorie: localTransaction.categorie,
                      source: 'manual'
                    };

                    // Nettoyer l'entry - verwijder undefined velden
                    Object.keys(auditEntry).forEach(key => {
                      if (auditEntry[key as keyof typeof auditEntry] === undefined) {
                        delete auditEntry[key as keyof typeof auditEntry];
                      }
                    });

                    // Ajouter à l'historique existant
                    const updatedHistory = [
                      ...(localTransaction.code_comptable_history || []),
                      auditEntry
                    ];

                    const updatedTransaction = {
                      ...localTransaction,
                      code_comptable: accountCode,
                      code_comptable_history: updatedHistory,
                      code_comptable_not_found: false // Reset flag when code is selected
                    };
                    setLocalTransaction(updatedTransaction);

                    if (onUpdateTransaction) {
                      onUpdateTransaction({
                        code_comptable: accountCode,
                        code_comptable_history: updatedHistory,
                        code_comptable_not_found: false // Reset flag when code is selected
                      });
                    }

                    if (accountCode) {
                      // Check if this is a correction (previous code exists and is different)
                      const previousCode = localTransaction.code_comptable;
                      if (previousCode && previousCode !== accountCode) {
                        // This is a correction - learn from the mistake
                        CategorizationService.learnFromCorrection(
                          clubId,
                          localTransaction,
                          previousCode,
                          accountCode,
                          localTransaction.categorie || 'autre'
                        );
                      } else {
                        // Regular assignment - learn pattern
                        CategorizationService.learnFromUserInput(
                          clubId,
                          localTransaction,
                          localTransaction.categorie || 'autre',
                          accountCode
                        );
                      }
                    }
                  }}
                  onCodeNotFound={() => {
                    const updatedTransaction = {
                      ...localTransaction,
                      code_comptable_not_found: true,
                      code_comptable: undefined
                    };
                    setLocalTransaction(updatedTransaction);
                    if (onUpdateTransaction) {
                      onUpdateTransaction({
                        code_comptable_not_found: true,
                        code_comptable: null as any // Clear any existing code
                      });
                    }
                  }}
                />

                {/* Audit Trail - Historique des modifications */}
                <CodeComptableAuditTrail
                  history={localTransaction.code_comptable_history}
                  currentCode={localTransaction.code_comptable}
                  currentCategorie={localTransaction.categorie}
                />
              </div>

              {/* 2. Liaisons */}
              <div>
                <h3 className="font-medium text-gray-900 dark:text-dark-text-primary mb-3 flex items-center gap-2">
                  <Link2 className="h-5 w-5" />
                  Liaisons
                </h3>
                <div className="flex gap-2 mb-4 flex-wrap">
                  {onLinkEvent && (
                    <button
                      onClick={onLinkEvent}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium min-w-[140px]"
                    >
                      <Users className="h-4 w-4" />
                      <span>Lier à une activité</span>
                    </button>
                  )}
                  {onLinkExpense && (
                    <button
                      onClick={onLinkExpense}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium min-w-[140px]"
                    >
                      <FileText className="h-4 w-4" />
                      <span>Lier à une dépense</span>
                    </button>
                  )}
                  {showMemberLinkButton && onLinkMember && !linkedMember && (
                    <button
                      onClick={onLinkMember}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium min-w-[140px]"
                    >
                      <UserCheck className="h-4 w-4" />
                      <span>Lier à un membre</span>
                    </button>
                  )}
                  {/* Bouton créer remboursement - uniquement pour transactions entrantes */}
                  {transaction.montant > 0 && onCreateReimbursement && (
                    <button
                      onClick={onCreateReimbursement}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm font-medium min-w-[140px]"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Créer un remboursement</span>
                    </button>
                  )}
                </div>
                {(linkedDemands.length > 0 || linkedEvents.length > 0 || linkedMember) ? (
                  <div className="space-y-3">
                    {/* Membre lié */}
                    {linkedMember && (
                      <div
                        className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-700"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <UserCheck className="h-4 w-4 text-green-600" />
                              <p className="font-medium text-gray-900 dark:text-dark-text-primary">
                                {linkedMember.displayName || `${linkedMember.prenom} ${linkedMember.nom}`}
                              </p>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                              {linkedMemberEntity?.cotisation_date ? (
                                <>Cotisation jusqu'au {formatDate(linkedMemberEntity.cotisation_date as Date)}</>
                              ) : linkedMember.cotisation_validite ? (
                                <>Cotisation jusqu'au {formatDate(linkedMember.cotisation_validite as Date)}</>
                              ) : (
                                'Membre du club'
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {onNavigateToMember && (
                              <button
                                onClick={() => onNavigateToMember(linkedMember.id)}
                                className="p-2 text-green-600 hover:bg-green-100 dark:hover:bg-green-800/30 rounded transition-colors"
                                title="Voir le membre"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                            )}
                            {onUnlinkMember && (
                              <button
                                onClick={() => onUnlinkMember(linkedMember.id)}
                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded transition-colors"
                                title="Délier"
                              >
                                <Link2Off className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Événements liés */}
                    {linkedEvents.map(event => (
                      <div
                        key={event.id}
                        className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 dark:text-dark-text-primary">{event.titre}</p>
                            <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                              {formatDate(event.date_debut)} • {event.lieu}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => onNavigateToEvent?.(event.id)}
                              className="p-2 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-800/30 rounded transition-colors"
                              title="Voir l'activité"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            {onUnlinkEvent && (
                              <button
                                onClick={() => onUnlinkEvent(event.id)}
                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded transition-colors"
                                title="Délier"
                              >
                                <Link2Off className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {linkedDemands.map(demand => (
                      <div
                        key={demand.id}
                        className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-700"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 dark:text-dark-text-primary">{demand.description}</p>
                            <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                              {demand.demandeur_nom} • {formatMontant(demand.montant)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => onNavigateToDemand?.(demand.id)}
                              className="p-2 text-orange-600 hover:bg-orange-100 dark:hover:bg-orange-800/30 rounded transition-colors"
                              title="Voir la dépense"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            {onUnlink && (
                              <button
                                onClick={() => onUnlink(demand.id)}
                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded transition-colors"
                                title="Délier"
                              >
                                <Link2Off className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg">
                    <p className="text-gray-500 dark:text-dark-text-muted text-sm">Aucune liaison</p>
                  </div>
                )}
              </div>

              {/* 3. Commentaire */}
              <div>
                <h3 className="font-medium text-gray-900 dark:text-dark-text-primary mb-3 flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Commentaire
                </h3>
                <textarea
                  value={localTransaction.commentaire || ''}
                  onChange={(e) => {
                    const newComment = e.target.value;
                    const updatedTransaction = { ...localTransaction, commentaire: newComment };
                    setLocalTransaction(updatedTransaction);
                    if (commentDebounceTimer.current) {
                      clearTimeout(commentDebounceTimer.current);
                    }
                    commentDebounceTimer.current = setTimeout(() => {
                      if (onUpdateTransaction) {
                        onUpdateTransaction({ commentaire: newComment });
                      }
                    }, 1000);
                  }}
                  placeholder="Ajouter un commentaire..."
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue dark:focus:ring-calypso-aqua focus:border-transparent resize-none placeholder:text-gray-400 dark:placeholder:text-dark-text-muted"
                  rows={2}
                />
              </div>

              {/* 4. Informations complètes */}
              <div>
                <h3 className="font-medium text-gray-900 dark:text-dark-text-primary mb-3 flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Informations complètes
                </h3>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-gray-500 dark:text-dark-text-muted">Date d'exécution</dt>
                    <dd className="font-medium text-gray-900 dark:text-dark-text-primary">
                      {formatDate(transaction.date_execution, 'dd/MM/yyyy HH:mm')}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 dark:text-dark-text-muted">Date de valeur</dt>
                    <dd className="font-medium text-gray-900 dark:text-dark-text-primary">
                      {transaction.date_valeur ? formatDate(transaction.date_valeur) : '-'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 dark:text-dark-text-muted">Type</dt>
                    <dd className="font-medium text-gray-900 dark:text-dark-text-primary">
                      {transaction.type_transaction || '-'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 dark:text-dark-text-muted">Compte</dt>
                    <dd className="font-medium text-gray-900 dark:text-dark-text-primary">
                      {transaction.numero_compte}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* 5. Détails de la transaction */}
              {transaction.details && (
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-dark-text-primary mb-3 flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Détails de la transaction
                  </h3>
                  <div className="px-3 py-2 text-xs bg-gray-50 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary border border-gray-200 dark:border-dark-border rounded-lg font-mono whitespace-pre-wrap break-words">
                    {transaction.details}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Splits Tab */}
          {activeTab === 'splits' && (
            <SplitsTab splits={transactionSplits} />
          )}

          {/* Documents Tab */}
          {activeTab === 'documents' && (
            <div className="space-y-6">
              {/* Section 1: Documents de la transaction */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium text-gray-900 dark:text-dark-text-primary flex items-center gap-2">
                    <Paperclip className="h-5 w-5" />
                    Documents de la transaction ({transactionDocs.length})
                  </h3>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Upload className="h-4 w-4" />
                    Ajouter des documents
                  </button>
                </div>

                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.gif"
                  onChange={handleFileUpload}
                  className="hidden"
                />

                {/* Documents Grid */}
                {transactionDocs.length > 0 ? (
                  <div className="grid grid-cols-3 gap-3">
                    {transactionDocs.map((doc, index) => {
                      const fileExt = doc.nom_affichage.split('.').pop()?.toLowerCase() || '';
                      const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt);
                      const isPDF = fileExt === 'pdf';

                      // Tronquer le nom si trop long
                      const displayName = doc.nom_affichage.length > 30
                        ? doc.nom_affichage.substring(0, 27) + '...'
                        : doc.nom_affichage;

                      // Format file size
                      const formatSize = (bytes: number) => {
                        if (bytes === 0) return '';
                        if (bytes < 1024) return `${bytes} B`;
                        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
                        return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
                      };

                      return (
                        <div key={index} className="relative group">
                          <button
                            onClick={() => {
                              setSelectedDocumentUrl(doc.url);
                              setEditedDocName(doc.nom_affichage);
                              setIsEditingDocName(false);
                            }}
                            className={cn(
                              "w-full border rounded-lg p-3 hover:border-calypso-blue transition-all",
                              selectedDocumentUrl === doc.url
                                ? "border-calypso-blue bg-blue-50 dark:bg-blue-900/20 ring-2 ring-calypso-blue ring-opacity-50"
                                : "border-gray-200 dark:border-dark-border hover:shadow-md"
                            )}
                            title={doc.nom_affichage}
                          >
                            <div className="flex flex-col items-center gap-2">
                              {isPDF ? (
                                <File className="h-12 w-12 text-red-500" />
                              ) : isImage ? (
                                <ImageIcon className="h-12 w-12 text-blue-500" />
                              ) : (
                                <FileText className="h-12 w-12 text-gray-500 dark:text-dark-text-muted" />
                              )}
                              <span className="text-xs text-gray-700 dark:text-dark-text-primary text-center break-all font-medium">
                                {displayName}
                              </span>
                              {doc.taille > 0 && (
                                <span className="text-xs text-gray-500 dark:text-dark-text-muted">
                                  {formatSize(doc.taille)}
                                </span>
                              )}
                            </div>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteDocument(doc.url);
                            }}
                            className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700 dark:hover:bg-red-800 flex items-center justify-center"
                            title="Supprimer le document"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500 dark:text-dark-text-muted bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg border-2 border-dashed border-gray-300 dark:border-dark-border">
                    <FileText className="h-12 w-12 mx-auto mb-2 text-gray-400 dark:text-dark-text-muted" />
                    <p>Aucun document pour cette transaction</p>
                    <p className="text-sm mt-1">Cliquez sur "Ajouter des documents" pour en ajouter</p>
                  </div>
                )}
              </div>

              {/* Section 2: Documents des demandes liées */}
              {linkedDemands.length > 0 && (
                <div className="border-t pt-6">
                  <h3 className="font-medium text-gray-900 dark:text-dark-text-primary flex items-center gap-2 mb-4">
                    <Paperclip className="h-5 w-5" />
                    Documents des demandes de remboursement liées
                  </h3>

                  <div className="space-y-4">
                    {linkedDemands.map((demand) => {
                      return (
                        <div key={demand.id} className="border rounded-lg p-4 bg-purple-50">
                          {/* En-tête de la demande */}
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900 dark:text-dark-text-primary">{demand.description}</h4>
                              <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                                Par {demand.demandeur_nom} • {formatDate(demand.date_soumission || demand.date_demande)}
                              </p>
                            </div>
                            <div className="text-right ml-4">
                              <p className="font-bold text-lg">{formatMontant(demand.montant)}</p>
                              <div className="flex items-center gap-2 mt-1 justify-end">
                                <span className={cn(
                                  "inline-flex px-2 py-1 text-xs rounded-full",
                                  demand.statut === 'approuve' && "bg-green-100 text-green-700",
                                  demand.statut === 'rembourse' && "bg-blue-100 text-blue-700",
                                  demand.statut === 'refuse' && "bg-red-100 text-red-700",
                                  demand.statut === 'en_attente_validation' && "bg-amber-100 text-amber-700",
                                  demand.statut === 'brouillon' && "bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary"
                                )}>
                                  {demand.statut}
                                </span>
                                {onUnlink && (
                                  <button
                                    onClick={() => onUnlink(demand.id)}
                                    className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary rounded-md hover:bg-gray-200 dark:hover:bg-dark-bg-secondary transition-colors"
                                    title="Délier cette dépense de la transaction"
                                  >
                                    <X className="h-3 w-3" />
                                    Délier
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Documents de cette demande */}
                          {(() => {
                            const demandDocs = getDocuments(demand);
                            return demandDocs.length > 0 ? (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {demandDocs.map((doc, index) => {
                                  const fileExt = doc.nom_affichage.split('.').pop()?.toLowerCase() || '';
                                  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt);
                                  const isPDF = fileExt === 'pdf';

                                  const displayName = doc.nom_affichage.length > 25
                                    ? doc.nom_affichage.substring(0, 22) + '...'
                                    : doc.nom_affichage;

                                  return (
                                    <button
                                      key={index}
                                      onClick={() => setSelectedDocumentUrl(doc.url)}
                                      className="flex items-center gap-2 p-2 border rounded hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary transition-colors text-left"
                                      title={doc.nom_affichage}
                                    >
                                      {isPDF ? (
                                        <File className="h-8 w-8 text-red-500 flex-shrink-0" />
                                      ) : isImage ? (
                                        <ImageIcon className="h-8 w-8 text-blue-500 flex-shrink-0" />
                                      ) : (
                                        <FileText className="h-8 w-8 text-gray-500 dark:text-dark-text-muted flex-shrink-0" />
                                      )}
                                      <span className="text-xs text-gray-700 dark:text-dark-text-primary font-medium">
                                        {displayName}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500 dark:text-dark-text-muted italic">Aucun document pour cette demande</p>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Document Preview Panel - Left Side */}
      {selectedDocumentUrl && (() => {
        // Chercher le document dans les docs de la transaction ET dans les docs des demandes liées
        const transactionDocs = getDocuments(localTransaction);
        const demandsDocs = linkedDemands.flatMap(d => getDocuments(d));
        const allDocs = [...transactionDocs, ...demandsDocs];
        const selectedDoc = allDocs.find(doc => doc.url === selectedDocumentUrl);

        return (
          <div
            className="fixed left-0 top-0 h-full w-1/2 bg-white dark:bg-dark-bg-secondary shadow-xl border-r border-gray-200 dark:border-dark-border"
            style={{ zIndex: auxiliaryZIndex }}
          >
            <div className="h-full flex flex-col">
              {/* Header with editable name */}
              <div className="bg-gray-50 dark:bg-dark-bg-tertiary border-b border-gray-200 dark:border-dark-border px-6 py-4 flex-shrink-0">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3 flex-1">
                      <FileText className="h-6 w-6 text-blue-600" />
                      {!isEditingDocName ? (
                        <button
                          onClick={() => {
                            setIsEditingDocName(true);
                            setEditedDocName(selectedDoc?.nom_affichage || '');
                          }}
                          className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary hover:text-blue-600 transition-colors flex items-center gap-2 group"
                        >
                          <span>{selectedDoc?.nom_affichage || 'Document'}</span>
                          <FileText className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="text"
                            value={editedDocName}
                            onChange={(e) => setEditedDocName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveDocumentName();
                              if (e.key === 'Escape') setIsEditingDocName(false);
                            }}
                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
                            autoFocus
                          />
                          <button
                            onClick={handleSaveDocumentName}
                            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setIsEditingDocName(false)}
                            className="px-3 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary transition-colors"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setSelectedDocumentUrl(null);
                        setIsEditingDocName(false);
                      }}
                      className="p-2 hover:bg-gray-200 rounded-lg transition-colors ml-4"
                    >
                      <X className="h-5 w-5 text-gray-500 dark:text-dark-text-muted" />
                    </button>
                  </div>
                  {selectedDoc && selectedDoc.taille > 0 && (
                    <p className="text-sm text-gray-500 dark:text-dark-text-muted">
                      Taille: {selectedDoc.taille < 1024 ? `${selectedDoc.taille} B` :
                        selectedDoc.taille < 1024 * 1024 ? `${(selectedDoc.taille / 1024).toFixed(1)} Ko` :
                        `${(selectedDoc.taille / (1024 * 1024)).toFixed(1)} Mo`}
                    </p>
                  )}
                </div>

              {/* Document Preview */}
              <div className="flex-1 p-6 overflow-auto bg-gray-100 dark:bg-dark-bg-tertiary">
                {selectedDoc?.type === 'application/pdf' || selectedDocumentUrl.toLowerCase().includes('.pdf') ? (
                  <iframe
                    src={selectedDocumentUrl}
                    className="w-full bg-white dark:bg-dark-bg-secondary rounded-lg shadow-lg"
                    style={{ height: 'calc(100vh - 180px)' }}
                    title="Document PDF"
                  />
                ) : selectedDoc?.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(selectedDocumentUrl) ? (
                  <img
                    src={selectedDocumentUrl}
                    alt="Document"
                    className="w-full h-auto rounded-lg shadow-lg"
                  />
                ) : (
                  <div className="text-center py-12 text-gray-500 dark:text-dark-text-muted">
                    <FileText className="h-16 w-16 mx-auto mb-4 text-gray-400 dark:text-dark-text-muted" />
                    <p>Prévisualisation non disponible pour ce type de fichier</p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex-shrink-0 bg-white dark:bg-dark-bg-secondary border-t border-gray-200 dark:border-dark-border px-6 py-4">
                <div className="flex gap-3">
                  <a
                    href={selectedDocumentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Ouvrir dans un nouvel onglet
                  </a>
                  <a
                    href={selectedDocumentUrl}
                    download
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    Télécharger
                  </a>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Communication Modal (SMS/WhatsApp/Email) */}
      {showCommunicationModal && clubId && (
        <CommunicationModal
          isOpen={showCommunicationModal}
          onClose={() => setShowCommunicationModal(false)}
          context={{
            type: 'transactions',
            nom: transaction.contrepartie_nom || 'Inconnu',
            date: formatDate(transaction.date_execution),
            montant: transaction.montant,
            reference: transaction.numero_sequence || transaction.id.slice(-6).toUpperCase(),
            description: transaction.communication || '',
          } as SMSContextData}
          membres={membres}
          clubId={clubId}
          onSuccess={() => {
            setShowCommunicationModal(false);
          }}
        />
      )}

      {/* Flag as Problematic Modal */}
      {showFlagModal && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-50"
            style={{ zIndex: auxiliaryZIndex }}
            onClick={() => setShowFlagModal(false)}
          />
          <div
            className="fixed inset-0 flex items-center justify-center p-4"
            style={{ zIndex: modalZIndex }}
          >
            <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-xl max-w-md w-full p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                  <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                  Signaler comme problématique
                </h3>
              </div>

              <p className="text-sm text-gray-600 dark:text-dark-text-secondary mb-4">
                Décrivez brièvement le problème avec cette transaction. Les autres administrateurs verront ce signalement.
              </p>

              <textarea
                value={flagReason}
                onChange={(e) => setFlagReason(e.target.value)}
                placeholder="Ex: Montant incorrect, doublon possible, contrepartie inconnue..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                rows={3}
                autoFocus
              />

              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setShowFlagModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={() => {
                    const now = new Date();
                    onUpdateTransaction?.({
                      flagged_problematic: true,
                      flagged_at: now,
                      flagged_by: appUser?.id || '',
                      flagged_by_name: appUser?.displayName || appUser?.email || 'Inconnu',
                      flagged_reason: flagReason.trim() || undefined
                    });
                    setLocalTransaction(prev => ({
                      ...prev,
                      flagged_problematic: true,
                      flagged_at: now,
                      flagged_by: appUser?.id || '',
                      flagged_by_name: appUser?.displayName || appUser?.email || 'Inconnu',
                      flagged_reason: flagReason.trim() || undefined
                    }));
                    setShowFlagModal(false);
                    toast.success('Transaction signalée comme problématique');
                  }}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Flag className="h-4 w-4" />
                  Signaler
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// Splits Tab Component
function SplitsTab({ splits }: { splits: TransactionSplit[] }) {
  const total = splits.reduce((sum, split) => sum + split.amount, 0);

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-900">
          Cette transaction a été ventilée en {splits.length} lignes
        </p>
        <p className="text-lg font-bold text-blue-900 mt-1">
          Total: {formatMontant(total)}
        </p>
      </div>

      <div className="space-y-3">
        {splits.map((split, index) => (
          <div key={split.id} className="border rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-dark-text-muted mb-1">Ligne {index + 1}</p>
                <p className="font-medium text-gray-900 dark:text-dark-text-primary">{split.description}</p>
                {split.notes && (
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">{split.notes}</p>
                )}
              </div>
              <div className="text-right">
                <p className="font-bold text-lg">{formatMontant(split.amount)}</p>
                {split.categorie && (() => {
                  const categories = CategorizationService.getAllCategories();
                  const category = categories.find(c => c.id === split.categorie);
                  const colorClasses = getCategoryColorClasses(split.categorie, categories);
                  return (
                    <span className={cn("inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-medium", colorClasses)}>
                      <Tag className="h-3 w-3" />
                      {category?.nom || split.categorie}
                    </span>
                  );
                })()}
              </div>
            </div>
            
            {split.reconcilie && (
              <div className="mt-3 pt-3 border-t">
                <span className="flex items-center gap-1 text-xs text-green-600">
                  <CheckCircle className="h-3 w-3" />
                  Réconcilié
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Document Card Component
function DocumentCard({
  url,
  index,
  onClick,
  showPreview = true
}: {
  url: string;
  index: number;
  onClick?: (url: string) => void;
  showPreview?: boolean;
}) {
  const fileName = url.split('/').pop() || `Document ${index + 1}`;
  const fileExt = fileName.split('.').pop()?.toLowerCase();
  const isImage = ['jpg', 'jpeg', 'png', 'gif'].includes(fileExt || '');
  const isPDF = fileExt === 'pdf';

  return (
    <div className="border rounded-lg p-3 hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-8 w-8 text-gray-400 dark:text-dark-text-muted flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary truncate">{fileName}</p>
            <p className="text-xs text-gray-500 dark:text-dark-text-muted">
              {isPDF ? 'PDF' : isImage ? 'Image' : 'Document'}
            </p>
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {showPreview && (
            <button
              className="p-1 hover:bg-gray-200 rounded"
              title="Aperçu"
              onClick={() => onClick?.(url)}
            >
              <Eye className="h-4 w-4 text-gray-600 dark:text-dark-text-secondary" />
            </button>
          )}
          <a
            href={url}
            download
            className="p-1 hover:bg-gray-200 rounded"
            title="Télécharger"
          >
            <Download className="h-4 w-4 text-gray-600 dark:text-dark-text-secondary" />
          </a>
        </div>
      </div>
    </div>
  );
}
