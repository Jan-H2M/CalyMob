import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Edit2,
  Trash2,
  FileText,
  Upload,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Tag,
  AlertCircle,
  Link2,
  Link2Off,
  Download,
  Eye,
  Save,
  Users,
  DollarSign,
  Search
} from 'lucide-react';
import { Operation, TransactionBancaire, DemandeRemboursement, DocumentJustificatif, InscriptionEvenement, Membre } from '@/types';
import { SourceBadge } from '../evenements/SourceBadge';
import { MemberSelectionPanel } from '../evenements/MemberSelectionPanel';
import { CategoryAccountSelector } from '@/components/banque/CategoryAccountSelector';
import { formatMontant, formatDate, cn } from '@/utils/utils';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { db } from '@/lib/firebase';
import { doc, updateDoc, serverTimestamp, collection, addDoc, deleteDoc, getDoc } from 'firebase/firestore';

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
}

export function OperationDetailView({
  operation,
  isOpen,
  onClose,
  onEdit,
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
  onNavigateNext
}: OperationDetailViewProps) {
  // Get clubId for smart categorization
  const { clubId } = useAuth();

  // Determine which tabs to show based on operation type
  const showInscriptions = operation.type === 'evenement';
  // Balance is now always visible for all operation types

  type Tab = 'overview' | 'categorization' | 'liaisons' | 'inscriptions' | 'balance' | 'documents';

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [selectedDocument, setSelectedDocument] = useState<DocumentJustificatif | null>(null);
  const [editingDocName, setEditingDocName] = useState<{ url: string; name: string } | null>(null);
  const [isEditing, setIsEditing] = useState(operation.id.startsWith('new-'));
  const [editedOperation, setEditedOperation] = useState<Operation>(operation);
  const [isSaving, setIsSaving] = useState(false);
  const [showMemberSelection, setShowMemberSelection] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddParticipant = async (member: Membre) => {
    if (!clubId) {
      console.error('❌ No clubId available');
      toast.error('Erreur: clubId manquant');
      return;
    }

    if (!operation.id || operation.id.startsWith('new-')) {
      console.error('❌ Cannot add participants to unsaved event');
      toast.error('Veuillez d\'abord sauvegarder l\'événement');
      return;
    }

    // ✅ Check for duplicates
    const isAlreadyRegistered = linkedInscriptions.some(i => i.membre_id === member.id);
    if (isAlreadyRegistered) {
      console.warn('⚠️ Member already registered:', member.id);
      toast.error(`${member.prenom} ${member.nom} est déjà inscrit(e) à cet événement`);
      return;
    }

    try {
      console.log('📝 Adding participant:', {
        memberId: member.id,
        memberName: `${member.prenom} ${member.nom}`,
        operationId: operation.id,
        clubId
      });

      // Create new inscription
      const newInscription: Omit<InscriptionEvenement, 'id'> = {
        membre_id: member.id,
        membre_nom: member.nom || member.lastName || '',
        membre_prenom: member.prenom || member.firstName || '',
        date_inscription: new Date(),
        statut: 'inscrit',
        paye: false,
        prix: operation.prix_membre || 0, // Default to member price
        formule: 'standard',
        options: {},
        repas_inclus: false,
        hebergement_inclus: false,
        transport_inclus: false,
        remarques: '',
        mode_paiement: 'virement' // Default
      };

      // Add to Firestore subcollection
      const docRef = await addDoc(collection(db, 'clubs', clubId, 'operations', operation.id, 'inscriptions'), {
        ...newInscription,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      });

      console.log('✅ Inscription saved to Firestore:', docRef.id);
      console.log('📍 Path:', `clubs/${clubId}/operations/${operation.id}/inscriptions/${docRef.id}`);

      // Verify it was written by reading it back
      const verifyDoc = await getDoc(docRef);
      if (verifyDoc.exists()) {
        console.log('✅ Verified: Document exists in Firestore:', verifyDoc.data());
      } else {
        console.error('❌ WARNING: Document was not found after write!');
      }

      toast.success('Participant ajouté avec succès');

      // Refresh inscriptions
      if (onRefreshInscriptions) {
        await onRefreshInscriptions();
      }
    } catch (error) {
      console.error('❌ Error adding participant:', error);
      toast.error('Erreur lors de l\'ajout du participant');
    }
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
      console.log('⏸️ Deletion already in progress, ignoring');
      return;
    }

    if (!clubId) {
      console.error('❌ No clubId available');
      setDeleteConfirmation(null);
      return;
    }

    console.log('🗑️ Deleting inscription:', {
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

      console.log('✅ Inscription deleted from Firestore');
      toast.success('Inscription supprimée');

      // Refresh inscriptions
      if (onRefreshInscriptions) {
        console.log('🔄 Calling onRefreshInscriptions...');
        await onRefreshInscriptions();
      } else {
        console.warn('⚠️ onRefreshInscriptions is not defined');
      }
    } catch (error) {
      console.error('❌ Error deleting inscription:', error);
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
      console.log('🔑 [OperationDetailView] ESC key pressed:', event.key);
      if (event.key === 'Escape' && !deleteConfirmation) {
        console.log('✅ [OperationDetailView] Calling onClose from ESC');
        onClose();
      } else if (event.key === 'Escape' && deleteConfirmation) {
        console.log('⏸️ [OperationDetailView] ESC pressed - closing confirm dialog');
        cancelDelete();
      }
    };

    if (isOpen) {
      console.log('👂 [OperationDetailView] Adding ESC listener');
      document.addEventListener('keydown', handleEscKey);
    }

    return () => {
      console.log('🧹 [OperationDetailView] Removing ESC listener');
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [isOpen, onClose, deleteConfirmation]);

  if (!isOpen) return null;

  // Get documents from new or legacy format
  const documents: DocumentJustificatif[] = operation.documents_justificatifs ||
    (operation.urls_justificatifs?.map(url => ({
      url,
      nom_original: url.split('/').pop() || 'Document',
      nom_affichage: url.split('/').pop() || 'Document',
      date_upload: operation.created_at || new Date(),
    })) || []);

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
      let totalUnpaid = 0;

      // Get unpaid inscriptions
      const unpaidInscriptions = linkedInscriptions.filter(i => !i.paye);
      totalUnpaid = unpaidInscriptions.length;

      if (totalUnpaid === 0) {
        toast('Toutes les inscriptions sont déjà payées');
        return;
      }

      if (linkedTransactions.length === 0) {
        toast.error('Aucune transaction liée à cet événement');
        return;
      }

      // Get available transactions (not already linked, not parent, positive amount)
      const availableTransactions = linkedTransactions.filter(tx => {
        const hasInscriptionLink = tx.matched_entities?.some(e => e.entity_type === 'inscription');
        return !tx.is_parent && !hasInscriptionLink && tx.montant > 0;
      });

      if (availableTransactions.length === 0) {
        toast.error('Aucune transaction disponible pour le matching');
        return;
      }

      toast(`Analyse de ${totalUnpaid} inscription(s) non payée(s)...`);

      // Try to match each unpaid inscription
      for (const inscription of unpaidInscriptions) {
        const inscriptionName = `${inscription.membre_prenom || ''} ${inscription.membre_nom || ''}`.trim();

        let bestMatch: { transaction: TransactionBancaire; score: number } | null = null;

        // Find best matching transaction
        for (const transaction of availableTransactions) {
          // Try matching against contrepartie_nom
          let score = calculateNameSimilarity(inscriptionName, transaction.contrepartie_nom || '');

          // Also try matching against communication
          const commScore = calculateNameSimilarity(inscriptionName, transaction.communication || '');
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
            console.error(`Failed to link inscription ${inscription.id}:`, error);
          }
        }
      }

      // Refresh inscriptions to show updated status
      await onRefreshInscriptions();

      // Show results
      const unmatched = totalUnpaid - matchedCount;
      if (matchedCount > 0) {
        toast.success(
          `✅ ${matchedCount} inscription(s) liée(s) automatiquement${unmatched > 0 ? ` • ${unmatched} à lier manuellement` : ''}`
        );
      } else {
        toast(`Aucun match automatique trouvé • ${totalUnpaid} à lier manuellement`);
      }
    } catch (error: any) {
      console.error('Error during payment control:', error);
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
      console.error('Error saving operation:', error);
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
    } catch (error) {
      console.error('Error auto-saving:', error);
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  const getStatusBadge = (statut: string) => {
    const styles = {
      brouillon: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
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

  // Build tabs array dynamically
  const tabs = [
    { id: 'overview', label: 'Vue d\'ensemble', icon: FileText },
    { id: 'liaisons', label: `Liaisons (${linkedTransactions.length + linkedDemands.length})`, icon: Link2 },
  ];

  if (showInscriptions) {
    tabs.push({ id: 'inscriptions', label: `Inscriptions (${linkedInscriptions.length})`, icon: Users });
  }

  // Balance tab is now always visible for all operation types
  tabs.push({ id: 'balance', label: 'Balance', icon: DollarSign });

  tabs.push({ id: 'documents', label: `Documents (${documents.length})`, icon: Upload });

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 flex items-end justify-end z-[100]"
        onClick={(e) => {
          console.log('🖱️ [OperationDetailView] Overlay clicked');
          onClose();
        }}
      >
        <div
          className="bg-white dark:bg-dark-bg-primary h-full w-full md:w-[800px] flex flex-col shadow-2xl"
          onClick={(e) => {
            console.log('🚫 [OperationDetailView] Content clicked - stopPropagation');
            e.stopPropagation();
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-dark-border">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
                  {operation.titre}
                </h2>
                {getStatusBadge(operation.statut)}
                <SourceBadge operation={operation} showLock={true} />
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-dark-text-secondary">
                <span className="flex items-center gap-1">
                  <Tag className="h-4 w-4" />
                  {getTypeLabel(operation.type)}
                </span>
                <span className="flex items-center gap-1">
                  <DollarSign className="h-4 w-4" />
                  {formatMontant(operation.montant_prevu)}
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
                  className="p-2 hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                  className="p-2 hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Activité suivante (→)"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-2">
              {onDelete && (
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
              <button
                onClick={() => {
                  console.log('❌ [OperationDetailView] X button clicked');
                  onClose();
                }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-secondary">
            <div className="flex overflow-x-auto">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as Tab)}
                    className={cn(
                      "flex items-center gap-2 px-6 py-3 border-b-2 font-medium text-sm whitespace-nowrap transition-colors",
                      activeTab === tab.id
                        ? "border-purple-600 text-purple-600 dark:text-purple-400"
                        : "border-transparent text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text-primary"
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

                {/* Description */}
                <div>
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

                {/* Code Comptable */}
                <div>
                  <CategoryAccountSelector
                    isExpense={editedOperation.montant_prevu < 0}
                    selectedCategory={editedOperation.categorie || ''}
                    selectedAccountCode={editedOperation.code_comptable || ''}
                    clubId={clubId}
                    counterpartyName={editedOperation.titre}
                    onCategoryChange={(cat) => {
                      setEditedOperation({ ...editedOperation, categorie: cat });
                      handleAutoSave({ categorie: cat });
                    }}
                    onAccountCodeChange={(code) => {
                      setEditedOperation({ ...editedOperation, code_comptable: code });
                      handleAutoSave({ code_comptable: code });
                    }}
                  />
                </div>

                {/* Montant prévu */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Montant prévu
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editedOperation.montant_prevu}
                    onChange={(e) => setEditedOperation({ ...editedOperation, montant_prevu: parseFloat(e.target.value) })}
                    onBlur={() => handleAutoSave({ montant_prevu: editedOperation.montant_prevu })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

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

                {/* Type-specific fields will go here */}
                {operation.type === 'evenement' && (
                  <>
                    {/* Date début/fin, lieu, capacité, prix */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                          Date début
                        </label>
                        <input
                          type="date"
                          value={operation.date_debut ? new Date(operation.date_debut).toISOString().split('T')[0] : ''}
                          onChange={(e) => {
                            const newDate = e.target.value ? new Date(e.target.value) : undefined;
                            setEditedOperation({ ...editedOperation, date_debut: newDate });
                            handleAutoSave({ date_debut: newDate });
                          }}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                          Date fin
                        </label>
                        <input
                          type="date"
                          value={operation.date_fin ? new Date(operation.date_fin).toISOString().split('T')[0] : ''}
                          onChange={(e) => {
                            const newDate = e.target.value ? new Date(e.target.value) : undefined;
                            setEditedOperation({ ...editedOperation, date_fin: newDate });
                            handleAutoSave({ date_fin: newDate });
                          }}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                        Lieu
                      </label>
                      <input
                        type="text"
                        value={operation.lieu || ''}
                        onChange={(e) => setEditedOperation({ ...editedOperation, lieu: e.target.value })}
                        onBlur={() => handleAutoSave({ lieu: editedOperation.lieu })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
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
                {/* Transactions Section */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                      Transactions bancaires
                    </h3>
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

                  {linkedTransactions.length === 0 ? (
                    <p className="text-gray-500 dark:text-dark-text-muted text-sm">
                      Aucune transaction liée
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {linkedTransactions.map(tx => (
                        <div
                          key={tx.id}
                          className="p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded"
                        >
                          {/* Ligne 1: Numéro + Nom + Date + Montant + Badge + Actions */}
                          <div className="flex items-center justify-between gap-2">
                            {/* Gauche: Numéro + Nom + Date + Communication */}
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              {/* Numéro */}
                              {tx.numero_sequence && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-600 text-white text-xs font-medium rounded whitespace-nowrap">
                                  <CreditCard className="h-2.5 w-2.5" />
                                  {tx.numero_sequence}
                                </span>
                              )}

                              {/* Nom */}
                              <p className="font-medium text-sm text-gray-900 dark:text-dark-text-primary truncate">
                                {tx.contrepartie_nom}
                              </p>

                              {/* Date */}
                              <span className="flex items-center gap-0.5 text-xs text-gray-600 dark:text-dark-text-secondary whitespace-nowrap">
                                <Calendar className="h-3 w-3" />
                                {formatDate(tx.date_execution)}
                              </span>

                              {/* Communication inline */}
                              {tx.communication && (
                                <>
                                  <span className="text-gray-300 dark:text-dark-border">•</span>
                                  <span className="text-xs text-gray-500 dark:text-dark-text-muted italic truncate">
                                    {tx.communication}
                                  </span>
                                </>
                              )}
                            </div>

                            {/* Droite: Badge + Montant + Actions */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {/* Badge Recette/Dépense */}
                              <span className={cn(
                                "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap",
                                tx.montant >= 0
                                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                                  : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                              )}>
                                {tx.montant >= 0 ? "Recette" : "Dépense"}
                              </span>

                              {/* Montant */}
                              <span className={cn(
                                "font-bold text-sm whitespace-nowrap",
                                tx.montant >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
                              )}>
                                {formatMontant(tx.montant)}
                              </span>

                              {/* Actions */}
                              {onViewTransaction && (
                                <button
                                  onClick={() => onViewTransaction(tx)}
                                  className="flex items-center gap-1 px-2 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 transition-colors"
                                  title="Voir les détails"
                                >
                                  <Eye className="h-3 w-3" />
                                  Voir
                                </button>
                              )}
                              {onUnlinkTransaction && (
                                <button
                                  onClick={() => onUnlinkTransaction(tx.id)}
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
                    </div>
                  )}
                </div>

                {/* Demands Section */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                      Dépenses
                    </h3>
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
                          className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg"
                        >
                          <div
                            className={cn(
                              "flex-1",
                              onViewDemand && "cursor-pointer hover:text-orange-700 dark:hover:text-orange-400"
                            )}
                            onClick={() => onViewDemand?.(demand)}
                          >
                            <p className="font-medium text-gray-900 dark:text-dark-text-primary">
                              {demand.description}
                            </p>
                            <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                              {demand.demandeur_nom} • {formatMontant(demand.montant)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {onViewDemand && (
                              <button
                                onClick={() => onViewDemand(demand)}
                                className="p-2 text-orange-600 hover:bg-orange-100 dark:hover:bg-orange-900/20 rounded-lg transition-colors"
                                title="Voir les détails"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                            )}
                            {onUnlinkDemand && (
                              <button
                                onClick={() => onUnlinkDemand(demand.id)}
                                className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                title="Délier"
                              >
                                <Link2Off className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
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
                    <Users className="h-12 w-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-2">
                      Gestion des inscriptions
                    </h3>
                    <p className="text-gray-500 dark:text-dark-text-secondary max-w-sm mx-auto">
                      Veuillez sauvegarder l'événement pour commencer à ajouter des participants.
                    </p>
                  </div>
                );
              }
              // Calculate detailed statistics
              const totalInscriptions = linkedInscriptions.length;
              const paidViaBank = linkedInscriptions.filter(i => i.transaction_id && i.paye).length;
              const paidCash = linkedInscriptions.filter(i => !i.transaction_id && i.paye && i.mode_paiement === 'cash').length;
              const unpaid = linkedInscriptions.filter(i => !i.paye).length;
              const totalPaid = paidViaBank + paidCash;
              const unpaidAmount = linkedInscriptions.filter(i => !i.paye).reduce((sum, i) => sum + i.prix, 0);

              // Calculate available transactions for manual linking
              const availableTransactions = linkedTransactions.filter(tx => {
                const hasInscriptionLink = tx.matched_entities?.some(e => e.entity_type === 'inscription');
                return !tx.is_parent && !hasInscriptionLink && tx.montant > 0;
              });

              // Manual linking handler
              const handleManualLink = async (inscriptionId: string, transactionId: string) => {
                if (!transactionId || !onLinkInscriptionToTransaction) return;

                try {
                  await onLinkInscriptionToTransaction(inscriptionId, transactionId);
                  if (onRefreshInscriptions) {
                    await onRefreshInscriptions();
                  }
                  toast.success('Inscription liée à la transaction');
                } catch (error: any) {
                  toast.error(error.message || 'Erreur lors de la liaison');
                }
              };

              // Mark as paid cash handler
              const handleMarkPaidCash = async (inscriptionId: string) => {
                if (!operation) return;

                try {
                  const inscriptionRef = doc(db, 'clubs', operation.club_id, 'operations', operation.id, 'inscriptions', inscriptionId);
                  await updateDoc(inscriptionRef, {
                    paye: true,
                    mode_paiement: 'cash',
                    date_paiement: new Date(),
                    updated_at: serverTimestamp()
                  });

                  if (onRefreshInscriptions) {
                    await onRefreshInscriptions();
                  }
                  toast.success('Inscription marquée comme payée en espèces');
                } catch (error: any) {
                  console.error('Error marking as paid cash:', error);
                  toast.error(error.message || 'Erreur lors de la mise à jour');
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
                      const inscriptionRef = doc(db, 'clubs', operation.club_id, 'operations', operation.id, 'inscriptions', inscriptionId);
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
                  const inscriptionRef = doc(db, 'clubs', operation.club_id, 'operations', operation.id, 'inscriptions', inscriptionId);
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
                  console.error(`Error saving ${field}:`, error);
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
                  console.error('Error unlinking transaction:', error);
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
                  const inscriptionRef = doc(db, 'clubs', operation.club_id, 'operations', operation.id, 'inscriptions', inscriptionId);
                  await updateDoc(inscriptionRef, {
                    paye: false,
                    mode_paiement: null,
                    date_paiement: null,
                    transaction_id: null,
                    transaction_montant: 0,
                    montant_paye_especes: 0,
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
                  console.error('Error marking unpaid:', error);
                  toast.error('Erreur lors de la mise à jour');
                }
              };

              return (
                <div className="p-6">
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                          Participants ({totalInscriptions})
                        </h3>
                        <button
                          onClick={() => setShowMemberSelection(true)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm"
                        >
                          <Users className="h-4 w-4" />
                          Ajouter un participant
                        </button>
                      </div>
                      <div className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                        {totalPaid} payé(s) / {totalInscriptions} • Reste à payer: {formatMontant(unpaidAmount)}
                      </div>
                    </div>
                    <div className="flex gap-3 text-sm">
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400 rounded">
                        <CreditCard className="h-3.5 w-3.5" />
                        Banque: {paidViaBank}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 rounded">
                        💶 Espèces: {paidCash}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400 rounded">
                        ⏱ Impayés: {unpaid}
                      </span>
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
                      {linkedInscriptions.map((inscription) => {
                        // Determine payment status and background color
                        const isLinkedToBank = inscription.transaction_id && inscription.paye;
                        const isPaidCash = !inscription.transaction_id && inscription.paye && inscription.mode_paiement === 'cash';
                        const isUnpaid = !inscription.paye;

                        const bgColor = isLinkedToBank
                          ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
                          : isUnpaid
                            ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
                            : isPaidCash
                              ? 'bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-800'
                              : 'border-gray-200 dark:border-dark-border';

                        // Get default date value (without useState to avoid hook violation)
                        const getDefaultDate = () => {
                          if (!inscription.date_inscription) return '';
                          try {
                            const date = inscription.date_inscription.seconds
                              ? new Date(inscription.date_inscription.seconds * 1000)
                              : new Date(inscription.date_inscription);

                            // Check if date is valid
                            if (isNaN(date.getTime())) return '';

                            return date.toISOString().split('T')[0];
                          } catch (error) {
                            console.error('Invalid date_inscription:', inscription.date_inscription);
                            return '';
                          }
                        };

                        return (
                          <div
                            key={inscription.id}
                            className={cn("p-2 border rounded hover:shadow-sm transition-shadow", bgColor)}
                          >
                            {/* Ligne 1: Nom + Badge + Date + Prix + Montant payé */}
                            <div className="flex items-center justify-between gap-3">
                              {/* Nom + Badge + Date */}
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <p className="font-medium text-sm text-gray-900 dark:text-dark-text-primary truncate">
                                  {inscription.membre_prenom} {inscription.membre_nom}
                                </p>
                                {inscription.paye ? (
                                  <span className="px-1.5 py-0.5 bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 rounded text-xs font-medium whitespace-nowrap">
                                    ✓ Payé
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 rounded text-xs font-medium whitespace-nowrap">
                                    Non payé
                                  </span>
                                )}
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3 text-gray-400" />
                                  <input
                                    type="date"
                                    defaultValue={getDefaultDate()}
                                    onBlur={(e) => handleInscriptionFieldSave(inscription.id, 'date_inscription', e.target.value)}
                                    className="px-1.5 py-0.5 border border-gray-300 dark:border-dark-border rounded focus:ring-1 focus:ring-blue-500 text-xs bg-white dark:bg-dark-bg-tertiary"
                                  />
                                </div>
                              </div>

                              {/* Prix + Montant payé */}
                              <div className="flex items-center gap-3 text-right">
                                <div className="text-sm font-bold text-gray-900 dark:text-dark-text-primary whitespace-nowrap">
                                  {formatMontant(inscription.prix)}
                                </div>

                                {/* Montant payé VIREMENT */}
                                {inscription.transaction_id && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs text-gray-500 dark:text-dark-text-muted">Payé:</span>
                                    <span className="text-sm font-semibold text-gray-900 dark:text-dark-text-primary whitespace-nowrap">
                                      {formatMontant(inscription.transaction_montant || 0)}
                                    </span>
                                    {inscription.transaction_montant && Math.abs(inscription.transaction_montant - inscription.prix) > 0.01 && (
                                      <span className="text-xs text-orange-600 dark:text-orange-400 whitespace-nowrap">
                                        (⚠️ {formatMontant(Math.abs(inscription.prix - inscription.transaction_montant))})
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
                                      defaultValue={inscription.montant_paye_especes || inscription.prix}
                                      onBlur={(e) => handleInscriptionFieldSave(inscription.id, 'montant_paye_especes', e.target.value)}
                                      className="w-16 px-1.5 py-0.5 text-xs text-right border border-gray-300 dark:border-dark-border rounded focus:ring-1 focus:ring-blue-500 bg-white dark:bg-dark-bg-tertiary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                    <span className="text-xs text-gray-500 dark:text-dark-text-muted">€</span>
                                    {inscription.montant_paye_especes && Math.abs(inscription.montant_paye_especes - inscription.prix) > 0.01 && (
                                      <span className="text-xs text-orange-600 dark:text-orange-400 whitespace-nowrap">
                                        (⚠️ {formatMontant(Math.abs(inscription.prix - inscription.montant_paye_especes))})
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Ligne 2: Actions */}
                            <div className="flex items-center gap-2 mt-1.5">
                              {/* Dropdown + Bouton Espèces pour non payés */}
                              {isUnpaid && (
                                <>
                                  {availableTransactions.length > 0 && onLinkInscriptionToTransaction && (
                                    <select
                                      onChange={(e) => handleManualLink(inscription.id, e.target.value)}
                                      className="flex-1 px-2 py-1 border border-gray-300 dark:border-dark-border rounded text-xs bg-white dark:bg-dark-bg-tertiary"
                                      defaultValue=""
                                    >
                                      <option value="">-- Sélectionner transaction --</option>
                                      {availableTransactions.map(tx => (
                                        <option key={tx.id} value={tx.id}>
                                          {tx.contrepartie_nom || 'Inconnu'} - {formatMontant(tx.montant)} - {formatDate(tx.date_execution)}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                  <button
                                    onClick={() => handleMarkPaidCash(inscription.id)}
                                    className="px-2 py-1 bg-orange-600 hover:bg-orange-700 text-white rounded text-xs font-medium whitespace-nowrap"
                                  >
                                    💳 Espèces
                                  </button>
                                </>
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
                                  console.log('🖱️ Delete button clicked', {
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
                          {formatMontant(linkedInscriptions.reduce((sum, i) => sum + i.prix, 0))}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-sm mt-2">
                        <span className="text-gray-600 dark:text-dark-text-secondary">Total payé:</span>
                        <span className="font-bold text-green-600 dark:text-green-400">
                          {formatMontant(linkedInscriptions.filter(i => i.paye).reduce((sum, i) => sum + i.prix, 0))}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-sm mt-2">
                        <span className="text-gray-600 dark:text-dark-text-secondary">En attente:</span>
                        <span className="font-bold text-orange-600 dark:text-orange-400">
                          {formatMontant(linkedInscriptions.filter(i => !i.paye).reduce((sum, i) => sum + i.prix, 0))}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {activeTab === 'balance' && (() => {
              // Determine if operation type has participants (inscriptions)
              const hasParticipants = ['evenement', 'cotisation', 'caution'].includes(operation.type);

              // Calculate totals
              const totalCollected = linkedInscriptions.filter(i => i.paye).reduce((sum, i) => sum + i.prix, 0);
              const totalTransactions = linkedTransactions.reduce((sum, tx) => sum + tx.montant, 0);

              // Calculate balance (revenus réels - dépenses réelles)
              let balance = 0;
              if (hasParticipants) {
                // REVENUS: Inscriptions payées (transactions bancaires + espèces)
                const revenus = totalCollected;

                // DÉPENSES: Demandes de remboursement liées
                const depenses = linkedDemands.reduce((sum, d) => sum + d.montant, 0);

                balance = revenus - depenses;
              } else {
                // Pour autres types: somme des transactions liées
                balance = totalTransactions;
              }

              // Get label for collected amount based on operation type
              const getCollectedLabel = () => {
                switch (operation.type) {
                  case 'caution': return 'Cautions collectées';
                  case 'cotisation': return 'Cotisations payées';
                  case 'evenement': return 'Inscriptions payées';
                  default: return 'Montant collecté';
                }
              };

              return (
                <div className="p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-6">
                    Balance financière
                  </h3>

                  {/* Accounting-Style Balance Table */}
                  {hasParticipants && linkedInscriptions.length > 0 && (() => {
                    const paidInscriptions = linkedInscriptions.filter(i => i.paye);
                    const paidByTransfer = paidInscriptions.filter(i => i.mode_paiement !== 'cash');
                    const paidByCash = paidInscriptions.filter(i => i.mode_paiement === 'cash');
                    const unpaidInscriptions = linkedInscriptions.filter(i => !i.paye);
                    const totalPaidByTransfer = paidByTransfer.reduce((sum, i) => sum + i.prix, 0);
                    const totalPaidByCash = paidByCash.reduce((sum, i) => sum + i.prix, 0);
                    const totalPaid = totalPaidByTransfer + totalPaidByCash;
                    const totalUnpaid = unpaidInscriptions.reduce((sum, i) => sum + i.prix, 0);
                    const totalExpenses = linkedDemands.reduce((sum, d) => sum + d.montant, 0);

                    return (
                      <div className="border border-gray-300 dark:border-dark-border rounded-lg overflow-hidden mb-6">
                        {/* Table Header */}
                        <div className="bg-gray-100 dark:bg-dark-bg-tertiary border-b border-gray-300 dark:border-dark-border px-4 py-2">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-semibold text-gray-700 dark:text-dark-text-secondary">Libellé</span>
                            <span className="text-sm font-semibold text-gray-700 dark:text-dark-text-secondary">Montant</span>
                          </div>
                        </div>

                        {/* Table Body */}
                        <div className="divide-y divide-gray-200 dark:divide-dark-border">
                          {/* Revenue Section Header */}
                          <div className="bg-gray-50 dark:bg-dark-bg-secondary px-4 py-1">
                            <span className="text-xs font-semibold text-gray-600 dark:text-dark-text-muted uppercase tracking-wider">Revenus</span>
                          </div>

                          {/* Inscriptions payées par virement */}
                          {paidByTransfer.length > 0 && (
                            <div className="px-4 py-2 hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary">
                              <div className="flex justify-between items-center">
                                <div>
                                  <span className="text-sm text-gray-900 dark:text-dark-text-primary">Inscriptions par virement</span>
                                  <span className="text-xs text-gray-500 dark:text-dark-text-muted ml-2">({paidByTransfer.length})</span>
                                </div>
                                <span className="text-sm font-medium text-green-600 dark:text-green-400">+ {formatMontant(totalPaidByTransfer)}</span>
                              </div>
                            </div>
                          )}

                          {/* Inscriptions payées en espèces */}
                          {paidByCash.length > 0 && (
                            <div className="px-4 py-2 hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary">
                              <div className="flex justify-between items-center">
                                <div>
                                  <span className="text-sm text-gray-900 dark:text-dark-text-primary">Inscriptions en espèces</span>
                                  <span className="text-xs text-gray-500 dark:text-dark-text-muted ml-2">({paidByCash.length})</span>
                                </div>
                                <span className="text-sm font-medium text-green-600 dark:text-green-400">+ {formatMontant(totalPaidByCash)}</span>
                              </div>
                            </div>
                          )}

                          {/* Inscriptions en attente */}
                          {unpaidInscriptions.length > 0 && (
                            <div className="px-4 py-2 hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary">
                              <div className="flex justify-between items-center">
                                <div>
                                  <span className="text-sm text-gray-500 dark:text-dark-text-muted italic">Inscriptions en attente</span>
                                  <span className="text-xs text-gray-400 dark:text-dark-text-muted ml-2">({unpaidInscriptions.length})</span>
                                </div>
                                <span className="text-sm text-gray-400 dark:text-dark-text-muted italic">{formatMontant(totalUnpaid)}</span>
                              </div>
                            </div>
                          )}

                          {/* Subtotal Revenus */}
                          <div className="px-4 py-2 bg-green-50 dark:bg-green-900/10">
                            <div className="flex justify-between items-center">
                              <span className="text-sm font-semibold text-gray-900 dark:text-dark-text-primary">Total Revenus</span>
                              <span className="text-sm font-bold text-green-700 dark:text-green-400">+ {formatMontant(totalPaid)}</span>
                            </div>
                          </div>

                          {/* Expenses Section Header */}
                          {linkedDemands.length > 0 && (
                            <>
                              <div className="bg-gray-50 dark:bg-dark-bg-secondary px-4 py-1">
                                <span className="text-xs font-semibold text-gray-600 dark:text-dark-text-muted uppercase tracking-wider">Dépenses</span>
                              </div>

                              {/* Dépenses */}
                              <div className="px-4 py-2 hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary">
                                <div className="flex justify-between items-center">
                                  <div>
                                    <span className="text-sm text-gray-900 dark:text-dark-text-primary">Demandes de remboursement</span>
                                    <span className="text-xs text-gray-500 dark:text-dark-text-muted ml-2">({linkedDemands.length})</span>
                                  </div>
                                  <span className="text-sm font-medium text-red-600 dark:text-red-400">- {formatMontant(totalExpenses)}</span>
                                </div>
                              </div>

                              {/* Subtotal Dépenses */}
                              <div className="px-4 py-2 bg-red-50 dark:bg-red-900/10">
                                <div className="flex justify-between items-center">
                                  <span className="text-sm font-semibold text-gray-900 dark:text-dark-text-primary">Total Dépenses</span>
                                  <span className="text-sm font-bold text-red-700 dark:text-red-400">- {formatMontant(totalExpenses)}</span>
                                </div>
                              </div>
                            </>
                          )}

                          {/* Balance finale */}
                          <div className={cn(
                            "px-4 py-3 font-bold border-t-2",
                            balance >= 0
                              ? "bg-green-50 dark:bg-green-900/10 border-green-300 dark:border-green-700"
                              : "bg-red-50 dark:bg-red-900/10 border-red-300 dark:border-red-700"
                          )}>
                            <div className="flex justify-between items-center">
                              <span className={cn(
                                "text-base",
                                balance >= 0
                                  ? "text-green-900 dark:text-green-100"
                                  : "text-red-900 dark:text-red-100"
                              )}>
                                BALANCE
                              </span>
                              <span className={cn(
                                "text-lg",
                                balance >= 0
                                  ? "text-green-900 dark:text-green-100"
                                  : "text-red-900 dark:text-red-100"
                              )}>
                                {balance >= 0 ? '+ ' : '- '}{formatMontant(Math.abs(balance))}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Simple summary for operations without participants */}
                  {!hasParticipants && (
                    <div className="space-y-3 mb-6">
                      {/* Transactions */}
                      <div className="p-4 border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Transactions liées</p>
                            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                              {linkedTransactions.length} transaction(s)
                            </p>
                          </div>
                          <p className="text-xl font-bold text-blue-900 dark:text-blue-100">
                            {formatMontant(totalTransactions)}
                          </p>
                        </div>
                      </div>

                      {/* Balance */}
                      <div className={cn(
                        "p-4 border rounded-lg",
                        balance >= 0
                          ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20"
                          : "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20"
                      )}>
                        <div className="flex justify-between items-center">
                          <div>
                            <p className={cn(
                              "text-sm font-medium",
                              balance >= 0
                                ? "text-green-700 dark:text-green-300"
                                : "text-red-700 dark:text-red-300"
                            )}>
                              Balance
                            </p>
                            <p className={cn(
                              "text-xs mt-1",
                              balance >= 0
                                ? "text-green-600 dark:text-green-400"
                                : "text-red-600 dark:text-red-400"
                            )}>
                              Total des transactions
                            </p>
                          </div>
                          <p className={cn(
                            "text-2xl font-bold",
                            balance >= 0
                              ? "text-green-900 dark:text-green-100"
                              : "text-red-900 dark:text-red-100"
                          )}>
                            {formatMontant(balance)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Empty State */}
                  {hasParticipants && linkedInscriptions.length === 0 && (
                    <div className="text-center py-8 text-gray-500 dark:text-dark-text-muted">
                      <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>Aucun participant enregistré</p>
                    </div>
                  )}

                  {!hasParticipants && linkedTransactions.length === 0 && (
                    <div className="text-center py-8 text-gray-500 dark:text-dark-text-muted">
                      <DollarSign className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>Aucune transaction liée</p>
                    </div>
                  )}
                </div>
              );
            })()}

            {activeTab === 'documents' && (
              <div className="p-6">
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
                    className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary transition-colors w-full justify-center"
                  >
                    <Upload className="h-5 w-5 text-gray-400" />
                    <span className="text-gray-600 dark:text-dark-text-muted">
                      Ajouter des documents
                    </span>
                  </button>
                </div>

                {/* Document list */}
                {documents.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-dark-text-muted">
                    <Upload className="h-12 w-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                    <p>Aucun document</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {documents.map((doc, index) => (
                      <div
                        key={doc.url}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-bg-tertiary border border-gray-200 dark:border-dark-border rounded-lg"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <FileText className="h-5 w-5 text-gray-400 flex-shrink-0" />
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
                            className="p-2 text-gray-600 hover:bg-gray-200 dark:hover:bg-dark-bg-secondary rounded-lg transition-colors"
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
            )}
          </div>
        </div>

        {/* Document Preview Panel */}
        {selectedDocument && (
          <div className="fixed left-0 top-0 h-full w-1/2 bg-white dark:bg-dark-bg-secondary shadow-xl z-[60] border-r border-gray-200 dark:border-dark-border flex flex-col">
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
                        <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
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
        onSelectMember={handleAddParticipant}
        existingParticipantIds={linkedInscriptions.map(i => i.membre_id).filter(Boolean) as string[]}
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
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-dark-text">
              Confirmer la suppression
            </h3>
            <p className="text-gray-700 dark:text-dark-text-muted mb-6">
              Êtes-vous sûr de vouloir supprimer l'inscription de <strong>{deleteConfirmation?.memberName}</strong> ?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={cancelDelete}
                className="px-4 py-2 bg-gray-200 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text rounded hover:bg-gray-300 dark:hover:bg-dark-border transition-colors"
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
    </>
  );
}
