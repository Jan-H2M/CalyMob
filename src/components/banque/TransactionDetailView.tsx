import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Calendar,
  Euro,
  Building,
  FileText,
  Users,
  Download,
  Eye,
  Split,
  Link2,
  Link2Off,
  CheckCircle,
  AlertCircle,
  Clock,
  ChevronRight,
  ChevronLeft,
  Paperclip,
  Tag,
  BookOpen,
  Upload,
  Image as ImageIcon,
  File,
  ExternalLink,
  Trash2
} from 'lucide-react';
import {
  TransactionBancaire,
  DemandeRemboursement,
  Evenement,
  TransactionSplit,
  VPDiveParticipant,
  Categorie,
  DocumentJustificatif
} from '@/types';
import { formatMontant, formatDate, cn, getCategoryColorClasses } from '@/utils/utils';
import { CategoryAccountSelector } from './CategoryAccountSelector';
import { CategorizationService } from '@/services/categorizationService';
import { TransactionSummaryCard } from './TransactionSummaryCard';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

interface TransactionDetailViewProps {
  transaction: TransactionBancaire;
  demands?: DemandeRemboursement[];
  events?: Evenement[];
  splits?: TransactionSplit[];
  vpDiveParticipants?: VPDiveParticipant[];
  childTransactions?: TransactionBancaire[]; // Transactions enfants si c'est un parent
  isOpen: boolean;
  onClose: () => void;
  onLinkEvent?: () => void;
  onLinkExpense?: () => void;
  onUnlink?: (demandId: string) => void; // Now accepts demandId to unlink specific demand
  onUnlinkEvent?: (eventId: string) => void;
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
}

// Composant pour une ligne enfant éditable
interface EditableChildLineProps {
  child: TransactionBancaire;
  onUpdateChildTransaction?: (childId: string, updates: Partial<TransactionBancaire>) => Promise<void>;
}

function EditableChildLine({ child, onUpdateChildTransaction }: EditableChildLineProps) {
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
            className="text-sm font-medium text-gray-900 dark:text-dark-text-primary bg-transparent border-b border-dashed border-gray-300 dark:border-gray-600 hover:border-gray-400 focus:border-orange-500 focus:outline-none w-full px-1 py-0.5 transition-colors"
            placeholder="Description"
          />
          <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-0.5">{child.communication}</p>
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
  vpDiveParticipants = [],
  childTransactions = [],
  isOpen,
  onClose,
  onLinkEvent,
  onLinkExpense,
  onUnlink,
  onUnlinkEvent,
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
  returnContext = null
}: TransactionDetailViewProps) {
  const { appUser, clubId } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'categorization' | 'liaisons' | 'splits' | 'documents'>('overview');
  const [selectedDocumentUrl, setSelectedDocumentUrl] = useState<string | null>(null);
  const [localTransaction, setLocalTransaction] = useState(transaction);
  const [isEditingDocName, setIsEditingDocName] = useState(false);
  const [editedDocName, setEditedDocName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const commentDebounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Helper function to get documents with backward compatibility
  const getDocuments = (source: TransactionBancaire | DemandeRemboursement): DocumentJustificatif[] => {
    // New format: use documents_justificatifs if available
    if (source.documents_justificatifs && source.documents_justificatifs.length > 0) {
      return source.documents_justificatifs;
    }

    // Legacy format: convert urls_justificatifs to DocumentJustificatif objects
    if (source.urls_justificatifs && source.urls_justificatifs.length > 0) {
      return source.urls_justificatifs.map((url, index) => {
        // Détection du type de fichier depuis l'URL
        let type = 'application/octet-stream'; // Type par défaut
        const urlLower = url.toLowerCase();

        // Extraire le nom du fichier depuis l'URL (avant les query params)
        const urlWithoutParams = url.split('?')[0];

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

        return {
          url,
          nom_original: `Document ${index + 1}`,
          nom_affichage: `Document ${index + 1}`,
          type,
          taille: 0,
          date_upload: source.created_at || new Date(),
        };
      });
    }

    return [];
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
      console.error('Error uploading documents:', error);
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
        console.error('Error deleting document:', error);
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
        className="fixed inset-0 bg-black bg-opacity-30 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Slide-out Panel */}
      <div className={cn(
        "fixed right-0 top-0 h-full w-full md:w-2/3 lg:w-1/2 bg-white dark:bg-dark-bg-secondary shadow-xl z-50",
        "transform transition-transform duration-300 ease-in-out flex flex-col",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}>
        {/* Compact Header */}
        <div className="flex-shrink-0 bg-gray-50 dark:bg-dark-bg-tertiary border-b border-gray-200 dark:border-dark-border px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">Transaction</h2>
              <span className="text-sm text-gray-500 dark:text-dark-text-muted">•</span>
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                {formatDate(transaction.date_execution)} • {transaction.numero_sequence}
              </p>
              {/* Navigation counter (keyboard navigation) */}
              {navigationPosition && (
                <>
                  <span className="text-sm text-gray-500 dark:text-dark-text-muted">•</span>
                  <div className="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/20 rounded">
                    <button
                      onClick={onNavigatePrevious}
                      disabled={!onNavigatePrevious}
                      className="p-1 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-l transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Transaction précédente (←)"
                    >
                      <ChevronLeft className="h-3 w-3 text-blue-700 dark:text-blue-400" />
                    </button>
                    <span className="px-1 text-blue-700 dark:text-blue-400 text-xs font-medium">
                      {navigationPosition.current} / {navigationPosition.total}
                    </span>
                    <button
                      onClick={onNavigateNext}
                      disabled={!onNavigateNext}
                      className="p-1 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-r transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Transaction suivante (→)"
                    >
                      <ChevronRight className="h-3 w-3 text-blue-700 dark:text-blue-400" />
                    </button>
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!transaction.reconcilie && !transaction.matched_entities && !transaction.is_parent && !transaction.is_split && !transaction.parent_transaction_id && onSplit && (
                <button
                  onClick={onSplit}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-md hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                  title="Ventiler la transaction"
                >
                  <Split className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Ventiler</span>
                </button>
              )}
              {(transaction.is_parent || transaction.is_split) && !transaction.parent_transaction_id && onSplit && (
                <button
                  onClick={onSplit}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-md hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors"
                  title="Modifier la ventilation"
                >
                  <Split className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Modifier</span>
                </button>
              )}
              {appUser?.role === 'superadmin' && onDelete && (
                <button
                  onClick={onDelete}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-md hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                  title="Supprimer définitivement cette transaction"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Supprimer</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-gray-200 dark:hover:bg-dark-bg-tertiary rounded-md transition-colors"
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
              <div>
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
                  : "border-transparent text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:hover:text-dark-text-primary hover:border-gray-300 dark:hover:border-dark-border"
              )}
            >
              Vue d'ensemble
            </button>
            <button
              onClick={() => setActiveTab('liaisons')}
              className={cn(
                "py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 whitespace-nowrap",
                activeTab === 'liaisons'
                  ? "border-calypso-blue dark:border-calypso-aqua text-calypso-blue dark:text-calypso-aqua"
                  : "border-transparent text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:hover:text-dark-text-primary hover:border-gray-300 dark:hover:border-dark-border"
              )}
            >
              <Link2 className="h-4 w-4" />
              Liaisons ({linkedEvents.length + linkedDemands.length})
            </button>
            {showSplits && (
              <button
                onClick={() => setActiveTab('splits')}
                className={cn(
                  "py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 whitespace-nowrap",
                  activeTab === 'splits'
                    ? "border-calypso-blue dark:border-calypso-aqua text-calypso-blue dark:text-calypso-aqua"
                    : "border-transparent text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:hover:text-dark-text-primary hover:border-gray-300 dark:hover:border-dark-border"
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
                  : "border-transparent text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:hover:text-dark-text-primary hover:border-gray-300 dark:hover:border-dark-border"
              )}
            >
              <Paperclip className="h-4 w-4" />
              Documents ({totalDocumentsCount})
            </button>
          </nav>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* Liaisons Tab */}
          {activeTab === 'liaisons' && (
            <div className="space-y-6">
              {/* Actions de liaison - Version compacte */}
              <div className="border-b border-gray-200 dark:border-dark-border pb-4">
                <div className="flex gap-2">
                  {onLinkEvent && (
                    <button
                      onClick={onLinkEvent}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                      <Users className="h-4 w-4" />
                      <span>Lier à une activité</span>
                    </button>
                  )}

                  {onLinkExpense && (
                    <button
                      onClick={onLinkExpense}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium"
                    >
                      <FileText className="h-4 w-4" />
                      <span>Lier à une dépense</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Activités liées */}
              {linkedEvents.length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-dark-text-primary mb-4 flex items-center gap-2">
                    <Users className="h-5 w-5 text-blue-600" />
                    Activités liées ({linkedEvents.length})
                  </h3>
                  <div className="space-y-3">
                    {linkedEvents.map(event => (
                      <div
                        key={event.id}
                        className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 dark:text-dark-text-primary">{event.titre}</p>
                            <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                              {formatDate(event.date_debut)} • {event.lieu}
                            </p>
                            <div className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                              Budget: <span className="font-bold text-blue-600">{formatMontant(event.budget_prevu_depenses)}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => onNavigateToEvent?.(event.id)}
                              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                              title="Voir l'activité"
                            >
                              <Eye className="h-4 w-4" />
                              <span>Voir</span>
                            </button>
                            {onUnlinkEvent && (
                              <button
                                onClick={() => onUnlinkEvent(event.id)}
                                className="p-2 text-gray-400 dark:text-dark-text-muted hover:text-calypso-blue hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary rounded transition-colors"
                                title="Délier cette activité"
                              >
                                <Link2Off className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Dépenses liées */}
              {linkedDemands.length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-dark-text-primary mb-4 flex items-center gap-2">
                    <FileText className="h-5 w-5 text-orange-600" />
                    Dépenses liées ({linkedDemands.length})
                  </h3>
                  <div className="space-y-3">
                    {linkedDemands.map(demand => (
                      <div
                        key={demand.id}
                        className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-700"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 dark:text-dark-text-primary">{demand.description}</p>
                            <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                              Demandeur: {demand.demandeur_nom} • {formatDate(demand.date_demande)}
                            </p>
                            <div className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                              Montant: <span className="font-bold text-orange-600">{formatMontant(demand.montant)}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => onNavigateToDemand?.(demand.id)}
                              className="flex items-center gap-1.5 px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium"
                              title="Voir la dépense"
                            >
                              <Eye className="h-4 w-4" />
                              <span>Voir</span>
                            </button>
                            {onUnlink && (
                              <button
                                onClick={() => onUnlink(demand.id)}
                                className="p-2 text-gray-400 dark:text-dark-text-muted hover:text-calypso-blue hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary rounded transition-colors"
                                title="Délier cette dépense"
                              >
                                <Link2Off className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Message si aucune liaison */}
              {linkedEvents.length === 0 && linkedDemands.length === 0 && (
                <div className="text-center py-8">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-dark-bg-tertiary mb-4">
                    <Link2Off className="h-8 w-8 text-gray-400 dark:text-dark-text-muted" />
                  </div>
                  <p className="text-gray-500 dark:text-dark-text-muted text-sm">Aucune liaison pour le moment</p>
                  <p className="text-gray-400 dark:text-dark-text-muted text-xs mt-1">Utilisez les boutons ci-dessus pour lier des activités ou dépenses</p>
                </div>
              )}
            </div>
          )}

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-medium text-gray-900 dark:text-dark-text-primary mb-4 flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Informations complètes
                </h3>
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm text-gray-700 dark:text-dark-text-primary">Date d'exécution</dt>
                    <dd className="mt-1 text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                      {formatDate(transaction.date_execution, 'dd/MM/yyyy HH:mm')}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-700 dark:text-dark-text-primary">Date de valeur</dt>
                    <dd className="mt-1 text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                      {transaction.date_valeur ? formatDate(transaction.date_valeur) : '-'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-700 dark:text-dark-text-primary">Type de transaction</dt>
                    <dd className="mt-1 text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                      {transaction.type_transaction || '-'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-700 dark:text-dark-text-primary">Compte</dt>
                    <dd className="mt-1 text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                      {transaction.numero_compte}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-sm text-gray-700 dark:text-dark-text-primary mb-2">Code comptable</dt>
                    <dd>
                      <CategoryAccountSelector
                        transaction={localTransaction}
                        clubId={clubId}
                        onCategoryChange={(categoryId) => {
                          const updatedTransaction = { ...localTransaction, categorie: categoryId };
                          setLocalTransaction(updatedTransaction);
                          if (onUpdateTransaction) {
                            onUpdateTransaction({ categorie: categoryId });
                          }
                          // Apprendre de cette catégorisation
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
                          const updatedTransaction = { ...localTransaction, code_comptable: accountCode };
                          setLocalTransaction(updatedTransaction);
                          if (onUpdateTransaction) {
                            onUpdateTransaction({ code_comptable: accountCode });
                          }
                          // Apprendre de cette catégorisation (même sans catégorie)
                          if (accountCode) {
                            CategorizationService.learnFromUserInput(
                              clubId,
                              localTransaction,
                              localTransaction.categorie || 'autre',
                              accountCode
                            );
                          }
                          // Auto-navigation vers la prochaine transaction après ajout du code comptable
                          // Permet de remplir rapidement plusieurs transactions (workflow: filtrer "Sans code comptable" → remplir une par une)
                          if (accountCode && onNavigateNext) {
                            setTimeout(() => {
                              onNavigateNext();
                            }, 500); // Petit délai pour voir le toast de confirmation
                          }
                        }}
                      />
                    </dd>
                  </div>
                  {transaction.details && (
                    <div className="col-span-2">
                      <dt className="text-sm text-gray-700 dark:text-dark-text-primary">Détails de la transaction</dt>
                      <dd className="mt-1">
                        <div className="px-3 py-2 text-xs bg-gray-50 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary border border-gray-200 dark:border-dark-border rounded-lg font-mono whitespace-pre-wrap break-words">
                          {transaction.details}
                        </div>
                      </dd>
                    </div>
                  )}
                  <div className="col-span-2">
                    <dt className="text-sm text-gray-700 dark:text-dark-text-primary">Commentaire</dt>
                    <dd className="mt-1">
                      <textarea
                        value={localTransaction.commentaire || ''}
                        onChange={(e) => {
                          const newComment = e.target.value;
                          const updatedTransaction = { ...localTransaction, commentaire: newComment };
                          setLocalTransaction(updatedTransaction);

                          // Debounce: annuler le timer précédent
                          if (commentDebounceTimer.current) {
                            clearTimeout(commentDebounceTimer.current);
                          }

                          // Définir un nouveau timer pour mettre à jour après 1 seconde d'inactivité
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
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Linked Entities Summary */}
              {(showDemands || showEvents) && (
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-dark-text-primary mb-4 flex items-center gap-2">
                    <Link2 className="h-5 w-5" />
                    Entités liées
                  </h3>
                  <div className="space-y-3">
                    {linkedDemands.map(demand => (
                      <button
                        key={demand.id}
                        onClick={() => onNavigateToDemand?.(demand.id)}
                        className="w-full p-4 bg-purple-50 rounded-lg border border-purple-200 hover:bg-purple-100 hover:border-purple-300 transition-colors text-left group"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-gray-900 dark:text-dark-text-primary">{demand.description}</p>
                              <ChevronRight className="h-4 w-4 text-purple-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                              Demandeur: {demand.demandeur_nom} • {formatDate(demand.date_demande)}
                            </p>
                          </div>
                          <p className="font-bold text-purple-600">{formatMontant(demand.montant)}</p>
                        </div>
                      </button>
                    ))}
                    {linkedEvents.map(event => (
                      <button
                        key={event.id}
                        onClick={() => onNavigateToEvent?.(event.id)}
                        className="w-full p-4 bg-blue-50 rounded-lg border border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition-colors text-left group"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-gray-900 dark:text-dark-text-primary">{event.titre}</p>
                              <ChevronRight className="h-4 w-4 text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                              {formatDate(event.date_debut)} • {event.lieu}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Budget</p>
                            <p className="font-bold text-blue-600">
                              {formatMontant(event.budget_prevu_depenses)}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
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
                                  demand.statut === 'soumis' && "bg-yellow-100 text-yellow-700"
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
                              <div className="grid grid-cols-2 gap-3">
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
                                      className="flex items-center gap-2 p-2 border rounded hover:bg-gray-50 dark:bg-dark-bg-tertiary transition-colors text-left"
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
          <div className="fixed left-0 top-0 h-full w-1/2 bg-white dark:bg-dark-bg-secondary shadow-xl z-[60] border-r border-gray-200 dark:border-dark-border">
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
                            className="px-3 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-50 dark:bg-dark-bg-tertiary transition-colors"
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
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-50 dark:bg-dark-bg-tertiary transition-colors"
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
    <div className="border rounded-lg p-3 hover:bg-gray-50 dark:bg-dark-bg-tertiary transition-colors">
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