import React, { useState, useRef, useMemo, useEffect } from 'react';
import { logger } from '@/utils/logger';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Calendar,
  Euro,
  User,
  Users,
  FileText,
  Download,
  ExternalLink,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  CreditCard,
  Link2,
  Link2Off,
  Shield,
  UserCheck,
  Plus,
  Upload,
  Trash2,
  Eye,
  Image as ImageIcon,
  Sparkles,
  ArrowLeft,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Tag,
  Send,
  Building2,
  QrCode,
  MessageCircle,
  RefreshCcw
} from 'lucide-react';
import { DemandeRemboursement, TransactionBancaire, ClubSettings, Membre, DocumentJustificatif, Evenement, Fournisseur } from '@/types';
import { getActiveFournisseurs, createFournisseur } from '@/services/fournisseurService';
import { formatMontant, formatDate, cn } from '@/utils/utils';
import { getFirstName, getLastName, getRole } from '@/utils/fieldMapper';
import { ApprovalBadge } from './ApprovalBadge';
import { CategorizationService } from '@/services/categorizationService';
import { PermissionService } from '@/services/permissionService';
import { SettingsService } from '@/services/settingsService';
import { useAuth } from '@/contexts/AuthContext';
import { FirebaseSettingsService } from '@/services/firebaseSettingsService';
import type { DownloadSettings } from '@/types/settings.types';
import toast from 'react-hot-toast';
import { getStorage, ref as storageRef, getBlob } from 'firebase/storage';
import { aiDocumentService, extractDateFromFilename, extractDescriptionFromFilename, DocumentAnalysis } from '@/services/aiDocumentService';
import {
  extractSequenceFromFilename,
  findTransactionBySequence,
  autoLinkExpenseToTransaction
} from '@/services/transactionMatchingService';
import { sendExpenseSubmittedEmail } from '@/services/expenseEmailService';
import { MontantEditModal } from './MontantEditModal';
import { MontantAuditTrail } from './MontantAuditTrail';
import { EpcQrCode } from './EpcQrCode';
import { CommunicationModal } from '@/components/common/CommunicationModal';
import type { SMSContextData } from '@/types/sms';

/**
 * Format IBAN for display (groups of 4)
 */
function formatIBAN(iban: string): string {
  if (!iban) return '';
  return iban.replace(/(.{4})/g, '$1 ').trim();
}

function formatEditableAmount(montant: number): string {
  if (!Number.isFinite(montant)) return '0,00';

  return new Intl.NumberFormat('fr-BE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(montant)
    .replace(/[\u202f\u00a0]/g, ' ');
}

function parseAmountInput(value: string | number): number {
  if (typeof value === 'number') {
    return value;
  }

  const sanitized = value
    .replace(/eur/gi, '')
    .replace(/€/g, '')
    .replace(/\s/g, '')
    .trim();

  if (!sanitized) {
    return Number.NaN;
  }

  const commaCount = (sanitized.match(/,/g) || []).length;
  const dotCount = (sanitized.match(/\./g) || []).length;
  let normalized = sanitized;

  if (commaCount > 0 && dotCount > 0) {
    normalized = sanitized.lastIndexOf(',') > sanitized.lastIndexOf('.')
      ? sanitized.replace(/\./g, '').replace(',', '.')
      : sanitized.replace(/,/g, '');
  } else if (commaCount > 0) {
    const decimalDigits = sanitized.length - sanitized.lastIndexOf(',') - 1;
    normalized = commaCount === 1 && decimalDigits !== 3
      ? sanitized.replace(',', '.')
      : sanitized.replace(/,/g, '');
  } else if (dotCount > 0) {
    const decimalDigits = sanitized.length - sanitized.lastIndexOf('.') - 1;
    normalized = dotCount === 1 && decimalDigits !== 3
      ? sanitized
      : sanitized.replace(/\./g, '');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/**
 * Génère un nom de fichier formaté selon le pattern CalyCompta
 * Pattern: {JAAR}-{NUM_DEMANDE} - {YYYY MM DD} {DESCRIPTION}.{ext}
 * Exemple: 2025-00175 - 2025 10 22 Coltri liée à LEMAITRE GEOFFROY.pdf
 */
function generateFormattedFilename(
  demand: DemandeRemboursement,
  linkedTransactions: TransactionBancaire[],
  originalFilename: string,
  index: number = 0,
  useTransactionNumber: boolean = false,
  filenamePattern: string = '{ANNÉE}-{NUMÉRO} - {DATE} {DESCRIPTION}.{ext}'
): string {
  // Extraction de l'extension
  const extension = originalFilename.split('.').pop()?.toLowerCase() || 'pdf';

  // Année depuis date_depense
  const year = demand.date_depense
    ? new Date(demand.date_depense).getFullYear()
    : new Date().getFullYear();

  // Numéro : utiliser numero_sequence de transaction si activé et disponible
  let numeroFormate = '00000';
  if (useTransactionNumber && linkedTransactions.length > 0) {
    const tx = linkedTransactions[0];
    if (tx.numero_sequence) {
      // Extraire uniquement la partie après le tiret (ex: "2025-00005" → "00005")
      const parts = tx.numero_sequence.split('-');
      if (parts.length > 1) {
        numeroFormate = parts[1].padStart(5, '0');
      } else {
        // Si pas de tiret, utiliser tel quel
        numeroFormate = tx.numero_sequence.padStart(5, '0');
      }
    }
  }
  // Sinon, rester à '00000' (pas de fallback sur demande ID)

  // Date formatée "YYYY MM DD"
  const dateDepense = demand.date_depense
    ? new Date(demand.date_depense)
    : new Date();
  const dateStr = `${dateDepense.getFullYear()} ${String(dateDepense.getMonth() + 1).padStart(2, '0')} ${String(dateDepense.getDate()).padStart(2, '0')}`;

  // Description nettoyée (enlever caractères spéciaux)
  const description = demand.description
    .replace(/[/\\?%*:|"<>]/g, '-')  // Remplacer caractères interdits
    .trim()
    .substring(0, 100);  // Limiter longueur

  // Si plusieurs fichiers, ajouter suffixe A, B, C avant l'extension
  const suffix = index > 0 ? ` ${String.fromCharCode(65 + index)}` : '';

  // Appliquer le pattern personnalisé
  let filename = filenamePattern
    .replace(/{ANNÉE}/g, year.toString())
    .replace(/{NUMÉRO}/g, numeroFormate)
    .replace(/{DATE}/g, dateStr)
    .replace(/{DESCRIPTION}/g, description)
    .replace(/{ext}/g, extension);

  // Ajouter le suffixe avant l'extension si nécessaire
  if (suffix) {
    const lastDotIndex = filename.lastIndexOf('.');
    if (lastDotIndex > 0) {
      filename = filename.substring(0, lastDotIndex) + suffix + filename.substring(lastDotIndex);
    } else {
      filename += suffix;
    }
  }

  return filename;
}

/**
 * Télécharge un fichier avec renommage automatique
 * Utilise Firebase Storage SDK pour télécharger le blob puis créer un Object URL local
 */
async function downloadRenamedFile(
  url: string,
  newFilename: string
): Promise<void> {
  logger.debug('🔽 [DOWNLOAD] Tentative de téléchargement:', newFilename);
  logger.debug('🔗 [DOWNLOAD] URL:', url);

  try {
    // Extraire le chemin du fichier depuis l'URL Firebase Storage
    const urlObj = new URL(url);

    // Le chemin est après /o/ et avant le ? (ou jusqu'à la fin si pas de ?)
    const pathMatch = urlObj.pathname.match(/\/o\/(.+)$/);

    if (!pathMatch) {
      throw new Error('Impossible d\'extraire le chemin du fichier');
    }

    const filePath = decodeURIComponent(pathMatch[1]);
    logger.debug('📁 [DOWNLOAD] Chemin du fichier:', filePath);

    // Télécharger le blob via Firebase Storage SDK
    const storage = getStorage();
    const fileRef = storageRef(storage, filePath);

    logger.debug('⬇️ [DOWNLOAD] Téléchargement du blob...');
    const blob = await getBlob(fileRef);
    logger.debug('✅ [DOWNLOAD] Blob téléchargé:', blob.size, 'bytes');

    // Créer un Object URL local
    const blobUrl = URL.createObjectURL(blob);

    // Créer un lien de téléchargement
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = newFilename;
    a.style.display = 'none';

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    logger.debug('💾 [DOWNLOAD] Téléchargement déclenché');

    // Libérer la mémoire après un court délai
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
      logger.debug('🧹 [DOWNLOAD] Object URL libéré');
    }, 100);

  } catch (error) {
    logger.error('❌ [DOWNLOAD] Erreur:', error);
    throw error;
  }
}

interface DemandeDetailViewProps {
  demand?: DemandeRemboursement | null; // Made optional for creation mode
  linkedTransaction?: TransactionBancaire | null;
  linkedTransactions?: TransactionBancaire[];
  clubSettings?: ClubSettings;
  currentUser?: Membre;
  membres?: Membre[]; // NEW: For demandeur dropdown
  evenements?: Evenement[]; // NEW: For event linking
  isOpen: boolean;
  onClose: () => void;
  onApprove?: () => void;
  onReject?: (reason: string) => void;
  onLinkTransaction?: () => void;
  onUnlinkTransaction?: (transactionId?: string) => void;
  onLinkEvent?: () => void; // NEW: For event linking panel
  onUnlinkEvent?: () => void; // NEW: For unlinking event
  onAddDocument?: (files: FileList) => void;
  onDelete?: () => void;
  onUpdate?: (updates: Partial<DemandeRemboursement>) => void;
  onAnalyzeWithAI?: (files: File[]) => Promise<Partial<DemandeRemboursement> | null>; // NEW: For AI analysis
  onRefreshTransactions?: () => Promise<void>; // NEW: Reload transactions after auto-linking
  fromTransactionId?: string; // ID of the transaction we came from (for back navigation)
  navigationPosition?: { current: number; total: number } | null; // NEW: Keyboard navigation position (X van Y)
  onNavigatePrevious?: () => void; // NEW: Navigate to previous demand
  onNavigateNext?: () => void; // NEW: Navigate to next demand
  onViewTransaction?: (transaction: TransactionBancaire) => void;
  onViewOperation?: (operation: Evenement) => void;
  onOpenContext?: () => void;
  contextActionLabel?: string;
  stackLevel?: number;
}

// Helper function to get documents — merges both new and legacy formats
// to avoid losing documents uploaded via mobile (urls_justificatifs)
// when web admin later adds documents (documents_justificatifs)
function getDocuments(demand: DemandeRemboursement): DocumentJustificatif[] {
  const docs: DocumentJustificatif[] = [];

  // New format documents
  if (demand.documents_justificatifs && demand.documents_justificatifs.length > 0) {
    docs.push(...demand.documents_justificatifs);
  }

  // Legacy format: convert urls_justificatifs and add any that aren't already present
  if (demand.urls_justificatifs && demand.urls_justificatifs.length > 0) {
    const existingUrls = new Set(docs.map(d => d.url));

    for (const url of demand.urls_justificatifs) {
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
        date_upload: demand.created_at || new Date(),
      });
    }
  }

  return docs;
}

export function DemandeDetailView({
  demand,
  linkedTransaction,
  linkedTransactions = [],
  clubSettings = { approval_threshold: 100, enable_double_approval: true } as any,
  currentUser,
  membres = [],
  evenements = [],
  isOpen,
  onClose,
  onApprove,
  onReject,
  onLinkTransaction,
  onUnlinkTransaction,
  onLinkEvent,
  onUnlinkEvent,
  onAddDocument,
  onDelete,
  onUpdate,
  onAnalyzeWithAI,
  onRefreshTransactions,
  fromTransactionId,
  navigationPosition,
  onNavigatePrevious,
  onNavigateNext,
  onViewTransaction,
  onViewOperation,
  onOpenContext,
  contextActionLabel = 'Aller aux dépenses',
  stackLevel = 0
}: DemandeDetailViewProps) {
  const { hasPermission, clubId, user, appUser } = useAuth();
  const navigate = useNavigate();

  // Find linked operation from evenements prop
  const linkedOperation = evenements?.find(evt => evt.id === demand?.evenement_id) || null;

  // Debug logging for membres prop
  useEffect(() => {
    logger.debug('👥 DemandeDetailView - membres prop:', membres?.length || 0, 'members');
    if (membres && membres.length > 0) {
      logger.debug('👥 First member:', membres[0]);
    }
  }, [membres]);

  // Helper function to get member display name
  const getMemberDisplayName = (membre: Membre): string => {
    // Use Field Mapper for consistent field access
    const firstName = getFirstName(membre);
    const lastName = getLastName(membre);

    if (firstName && lastName) {
      return `${firstName} ${lastName}`;
    }
    // Fall back to displayName (Firebase Auth field)
    if (membre.displayName) {
      return membre.displayName;
    }
    // Fall back to email or 'Utilisateur'
    return membre.email || 'Utilisateur';
  };

  // Mode detection
  const isCreateMode = !demand;
  const isQuickView = !!onOpenContext || stackLevel > 0;
  const zIndexOffset = stackLevel * 40;
  const backdropZIndex = 40 + zIndexOffset;
  const panelZIndex = 50 + zIndexOffset;
  const modalBackdropZIndex = 60 + zIndexOffset;

  // Paramètres de téléchargement
  const [downloadSettings, setDownloadSettings] = useState<DownloadSettings | null>(null);

  // Start on 'documents' tab in create mode, 'overview' in view/edit mode
  const [activeTab, setActiveTab] = useState<'overview' | 'documents' | 'approval' | 'transaction'>(
    isCreateMode ? 'documents' : 'overview'
  );
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedDocument, setSelectedDocument] = useState<DocumentJustificatif | null>(null);
  const [isEditingDocName, setIsEditingDocName] = useState(false);
  const [editedDocName, setEditedDocName] = useState('');
  // REMOVED: isEditing - fields are now always editable with auto-save
  const [editedMontant, setEditedMontant] = useState(formatEditableAmount(demand?.montant ?? 0));
  const [editedDescription, setEditedDescription] = useState(demand?.description || '');
  const [editedCommentaire, setEditedCommentaire] = useState(demand?.titre || '');
  const [editedCategorie, setEditedCategorie] = useState(demand?.categorie || '');
  const [editedCodeComptable, setEditedCodeComptable] = useState(demand?.code_comptable || '');
  const [editedCommunicationQr, setEditedCommunicationQr] = useState(
    demand?.communication_qr || demand?.description?.substring(0, 140) || ''
  );
  const [editedDateDepense, setEditedDateDepense] = useState(() => {
    if (!demand?.date_depense) return new Date().toISOString().split('T')[0];

    const date = new Date(demand.date_depense);
    // Check if date is valid
    if (isNaN(date.getTime())) {
      logger.warn('⚠️ Invalid date_depense:', demand.date_depense, '- using today');
      return new Date().toISOString().split('T')[0];
    }

    return date.toISOString().split('T')[0];
  });

  // State pour le modal de modification de montant (audit trail)
  const [showMontantEditModal, setShowMontantEditModal] = useState(false);
  const [pendingMontantChange, setPendingMontantChange] = useState<{ oldMontant: number; newMontant: number } | null>(null);

  // State pour l'envoi d'email de confirmation
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [confirmationEmailSent, setConfirmationEmailSent] = useState(demand?.confirmation_email_sent || false);

  // State pour SMS modal
  const [showSMSModal, setShowSMSModal] = useState(false);

  // State pour modal d'avertissement brouillon
  const [showBrouillonWarningModal, setShowBrouillonWarningModal] = useState(false);

  // Reset form fields when demand changes or when entering create mode
  useEffect(() => {
    if (isCreateMode) {
      // Reset to empty values for create mode
      setEditedMontant('0,00');
      setEditedDescription('');
      setEditedCommentaire('');
      setEditedCategorie('');
      setEditedCodeComptable('');
      setEditedCommunicationQr('');
      setEditedDateDepense(new Date().toISOString().split('T')[0]);
      setEditedStatut('en_attente_validation');
    } else if (demand) {
      // Load values from demand in edit mode
      setEditedMontant(formatEditableAmount(demand.montant));
      setEditedDescription(demand.description || '');
      setEditedCommentaire(demand.titre || '');
      setEditedCategorie(demand.categorie || '');
      setEditedCodeComptable(demand.code_comptable || '');
      setEditedCommunicationQr(demand.communication_qr || demand.description?.substring(0, 140) || '');
      setEditedStatut(demand.statut || 'en_attente_validation');

      // Safe date handling
      if (demand.date_depense) {
        const date = new Date(demand.date_depense);
        if (isNaN(date.getTime())) {
          logger.warn('⚠️ Invalid date_depense in useEffect:', demand.date_depense, '- using today');
          setEditedDateDepense(new Date().toISOString().split('T')[0]);
        } else {
          setEditedDateDepense(date.toISOString().split('T')[0]);
        }
      } else {
        setEditedDateDepense(new Date().toISOString().split('T')[0]);
      }
    }
  }, [demand, isCreateMode]);

  // Auto-save handler for individual fields
  const handleFieldSave = async (field: string, value: any) => {
    if (isCreateMode || !onUpdate) return; // Don't auto-save in create mode

    try {
      // Validate before saving
      if (field === 'montant') {
        const montant = parseAmountInput(value);
        if (isNaN(montant) || montant <= 0) {
          toast.error('Le montant doit être un nombre valide supérieur à 0');
          return;
        }
        // Check if montant actually changed
        const oldMontant = demand?.montant || 0;
        if (montant !== oldMontant) {
          // Skip modal for initial entry (from 0 to new value)
          if (oldMontant === 0) {
            // Direct save without confirmation for initial entry
            await onUpdate({ montant });
            toast.success('Montant enregistré');
            return;
          }
          // Open modal for justification for actual modifications
          setPendingMontantChange({ oldMontant, newMontant: montant });
          setShowMontantEditModal(true);
          return; // Don't save here, wait for modal confirmation
        }
        return; // No change, nothing to save
      } else if (field === 'description' && (!value || !value.trim())) {
        toast.error('La description est obligatoire');
        return;
      } else if (field === 'date_depense') {
        value = new Date(value);
      }

      // Build update object
      let updateData: Record<string, any> = { [field]: value };

      // ✅ Status audit trail for all status changes
      if (field === 'statut' && value !== demand?.statut) {
        const currentUserFullName = `${currentUser?.prenom || ''} ${currentUser?.nom || ''}`.trim() || currentUser?.email || 'Unknown';

        const statusAuditEntry = {
          old_statut: demand?.statut || 'brouillon',
          new_statut: value,
          changed_by: currentUser?.id || '',
          changed_by_name: currentUserFullName,
          changed_at: new Date()
        };

        updateData.status_history = [...(demand?.status_history || []), statusAuditEntry];
      }

      // CRITICAL: When changing status to 'approuve', add approval metadata
      if (field === 'statut' && value === 'approuve') {
        if (!currentUser) {
          toast.error('Utilisateur non connecté - impossible d\'approuver');
          return;
        }
        // Check if already has approval metadata (e.g., reverting from rembourse)
        if (!demand?.approuve_par) {
          const currentUserFullName = `${currentUser.prenom || ''} ${currentUser.nom || ''}`.trim() || currentUser.email || 'Unknown';

          updateData = {
            ...updateData,
            approuve_par: currentUser.id,
            approuve_par_nom: currentUserFullName,
            date_approbation: new Date(),
          };
          logger.debug('📝 Adding approval metadata for status change to approuve:', updateData);
        }
      }

      // CRITICAL: When changing status to 'refuse', add refusal metadata
      if (field === 'statut' && value === 'refuse') {
        if (!currentUser) {
          toast.error('Utilisateur non connecté - impossible de refuser');
          return;
        }
        if (!demand?.refuse_par) {
          const currentUserFullName = `${currentUser.prenom || ''} ${currentUser.nom || ''}`.trim() || currentUser.email || 'Unknown';

          updateData = {
            ...updateData,
            refuse_par: currentUser.id,
            refuse_par_nom: currentUserFullName,
            date_refus: new Date(),
          };
          logger.debug('📝 Adding refusal metadata for status change to refuse:', updateData);
        }
      }

      // Save to Firestore
      await onUpdate(updateData);

      // Success feedback
      toast.success('✓ Sauvegardé', {
        duration: 1500,
        position: 'bottom-right'
      });
    } catch (error) {
      logger.error(`Error saving ${field}:`, error);
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  // Handler for montant change confirmation (with audit trail)
  const handleMontantChangeConfirm = async (justification: string) => {
    if (!pendingMontantChange || !onUpdate || !currentUser) {
      setShowMontantEditModal(false);
      setPendingMontantChange(null);
      return;
    }

    try {
      const { oldMontant, newMontant } = pendingMontantChange;
      const currentUserFullName = `${currentUser.prenom || ''} ${currentUser.nom || ''}`.trim() || currentUser.email || 'Unknown';

      // Check if demand was already approved - if so, reset approval
      const wasApproved = demand?.statut === 'approuve' || demand?.statut === 'rembourse' || demand?.statut === 'en_attente_validation';

      // Create audit trail entry with approval reset info if applicable
      const auditEntry = {
        old_montant: oldMontant,
        new_montant: newMontant,
        changed_by: currentUser.id,
        changed_by_name: currentUserFullName,
        changed_at: new Date(),
        ...(justification && { justification }),
        ...(wasApproved && {
          approval_reset: true,
          previous_statut: demand?.statut,
        }),
      };

      // Get existing history or create new array
      const existingHistory = demand?.montant_history || [];

      // Update with new montant, history, and modified flag
      // If was approved, reset approval status and clear approval metadata
      const updateData: Record<string, any> = {
        montant: newMontant,
        montant_history: [...existingHistory, auditEntry],
        montant_modified: true,
      };

      if (wasApproved) {
        updateData.statut = 'en_attente_validation';
        updateData.approuve_par = null;
        updateData.approuve_par_nom = null;
        updateData.date_approbation = null;
        updateData.approuve_par_2 = null;
        updateData.approuve_par_2_nom = null;
        updateData.date_approbation_2 = null;
        updateData.requires_double_approval = false;
      }

      await onUpdate(updateData);

      // Update local state to reflect new value
      setEditedMontant(formatEditableAmount(newMontant));

      // Show appropriate message
      if (wasApproved) {
        toast.success('Montant modifié - demande à réapprouver', {
          duration: 3000,
          position: 'bottom-right'
        });
      } else {
        toast.success('✓ Montant modifié', {
          duration: 1500,
          position: 'bottom-right'
        });
      }
    } catch (error) {
      logger.error('Error saving montant change:', error);
      toast.error('Erreur lors de la sauvegarde du montant');
      // Revert the input to the original value
      setEditedMontant(formatEditableAmount(demand?.montant ?? 0));
    } finally {
      setShowMontantEditModal(false);
      setPendingMontantChange(null);
    }
  };

  // Handler for montant change cancellation
  const handleMontantChangeCancel = () => {
    // Revert the input to the original value
    setEditedMontant(formatEditableAmount(demand?.montant ?? 0));
    setShowMontantEditModal(false);
    setPendingMontantChange(null);
  };

  // Auto-save for demandeur (special handling for dropdown vs free text)
  const handleDemandeurSave = async (demandeurId?: string, demandeurNom?: string, isOther?: boolean) => {
    if (isCreateMode || !onUpdate) return;

    try {
      const updates: any = {};
      const useOther = isOther !== undefined ? isOther : showOtherDemandeur;
      const finalDemandeurId = demandeurId !== undefined ? demandeurId : editedDemandeurId;
      const finalDemandeurNom = demandeurNom !== undefined ? demandeurNom : editedDemandeurNom;

      if (useOther && finalDemandeurNom) {
        updates.demandeur_nom = finalDemandeurNom;
        updates.demandeur_id = null;
      } else if (!useOther && finalDemandeurId) {
        updates.demandeur_id = finalDemandeurId;
        const selectedMember = membres.find(m => m.id === finalDemandeurId);
        updates.demandeur_nom = selectedMember ? getMemberDisplayName(selectedMember) : undefined;
      }

      await onUpdate(updates);
      toast.success('✓ Sauvegardé', { duration: 1500, position: 'bottom-right' });
    } catch (error) {
      logger.error('Error saving demandeur:', error);
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  // NEW: Additional fields for creation mode
  // ✅ FIX: Only auto-fill current user in CREATE mode (not for existing expenses with NULL demandeur)
  const [editedDemandeurId, setEditedDemandeurId] = useState(
    demand?.demandeur_id || (isCreateMode && currentUser?.id) || ''
  );
  const [editedDemandeurNom, setEditedDemandeurNom] = useState(
    demand?.demandeur_nom || (isCreateMode && currentUser ? getMemberDisplayName(currentUser) : '')
  );
  const [showOtherDemandeur, setShowOtherDemandeur] = useState(!!(demand?.demandeur_nom && !demand?.demandeur_id));
  const [editedEvenementId, setEditedEvenementId] = useState(demand?.evenement_id || '');
  const [editedStatut, setEditedStatut] = useState<DemandeRemboursement['statut']>(
    demand?.statut || 'en_attente_validation'
  );

  // Bénéficiaire du remboursement (nieuw voor QR-code betalingen)
  const [beneficiaireType, setBeneficiaireType] = useState<'demandeur' | 'fournisseur'>(
    demand?.beneficiaire_type || 'demandeur'
  );
  const [selectedFournisseurId, setSelectedFournisseurId] = useState(demand?.fournisseur_id || '');
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);

  // Quick create fournisseur inline
  const [showQuickCreateFournisseur, setShowQuickCreateFournisseur] = useState(false);
  const [newFournisseurNom, setNewFournisseurNom] = useState('');
  const [newFournisseurIban, setNewFournisseurIban] = useState('');
  const [isCreatingFournisseur, setIsCreatingFournisseur] = useState(false);

  // Paiement manuel (betaald via QR maar nog niet geboekt)
  const [isPaiementManuel, setIsPaiementManuel] = useState(demand?.paiement_manuel || false);
  const paiementManuelDate = demand?.paiement_manuel_date;

  // NEW: For file uploads in create mode
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedPendingFileIndex, setSelectedPendingFileIndex] = useState<number | null>(null);
  const [pendingFilePreviewUrls, setPendingFilePreviewUrls] = useState<Map<number, string>>(new Map());

  // NEW: For automatic file analysis
  const [isAnalyzingFile, setIsAnalyzingFile] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<DocumentAnalysis | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [foundTransactionId, setFoundTransactionId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Obtenir les documents avec compatibilité arrière
  const documents = demand ? getDocuments(demand) : [];

  // Charger les catégories et codes comptables de dépenses
  const expenseCategories = useMemo(() => CategorizationService.getCategoriesByType(true), []);
  const expenseAccountCodes = useMemo(() => CategorizationService.getAccountCodesByType(true), []);

  // Séparer les catégories en favoris et autres
  const { frequentCategories, otherCategories } = useMemo(() => {
    const frequent = expenseCategories.filter(cat => cat.isFrequent);
    const others = expenseCategories.filter(cat => !cat.isFrequent);
    return { frequentCategories: frequent, otherCategories: others };
  }, [expenseCategories]);

  // Séparer les codes en favoris et autres
  const { frequentCodes, otherCodes } = useMemo(() => {
    const frequent = expenseAccountCodes.filter(code => code.isFrequent);
    const others = expenseAccountCodes.filter(code => !code.isFrequent);
    return { frequentCodes: frequent, otherCodes: others };
  }, [expenseAccountCodes]);

  // Cleanup preview URLs when component unmounts or files change
  useEffect(() => {
    return () => {
      // Revoke all preview URLs on unmount
      pendingFilePreviewUrls.forEach((url) => {
        URL.revokeObjectURL(url);
      });
    };
  }, [pendingFilePreviewUrls]);

  // Cleanup URLs when files are removed
  useEffect(() => {
    // Remove URLs for files that no longer exist
    const newUrls = new Map(pendingFilePreviewUrls);
    let hasChanges = false;

    pendingFilePreviewUrls.forEach((url, index) => {
      if (!pendingFiles[index]) {
        URL.revokeObjectURL(url);
        newUrls.delete(index);
        hasChanges = true;
      }
    });

    if (hasChanges) {
      setPendingFilePreviewUrls(newUrls);
    }
  }, [pendingFiles]);

  // Charger les paramètres de téléchargement
  useEffect(() => {
    const loadDownloadSettings = async () => {
      if (!clubId) return;
      try {
        const settings = await FirebaseSettingsService.loadDownloadSettings(clubId);
        setDownloadSettings(settings);
      } catch (error) {
        logger.error('Erreur chargement settings téléchargement:', error);
      }
    };

    loadDownloadSettings();
  }, [clubId]);

  // Charger les fournisseurs pour la sélection bénéficiaire
  useEffect(() => {
    const loadFournisseurs = async () => {
      if (!clubId) return;
      try {
        const data = await getActiveFournisseurs(clubId);
        setFournisseurs(data);
      } catch (error) {
        logger.error('Erreur chargement fournisseurs:', error);
      }
    };

    loadFournisseurs();
  }, [clubId]);

  if (!isOpen) return null;

  // Permission check using PermissionService (not legacy can_approve_expenses field)
  const hasApprovalPermission = currentUser ? PermissionService.hasPermission(currentUser, 'demands.approve') : false;
  const isRequester = currentUser?.id === demand?.demandeur_id;
  const alreadyApproved = demand?.approuve_par === currentUser?.id;
  const isSuperAdmin = currentUser ? getRole(currentUser) === 'super_admin' : false;

  // Super admin can approve their own demands
  const canApprove = !isCreateMode &&
                     hasApprovalPermission &&
                     (!isRequester || isSuperAdmin) &&
                     !alreadyApproved;

  const needsDoubleApproval = !isCreateMode && demand &&
                               SettingsService.requiresDoubleApproval(demand.montant);

  const hasFirstApproval = !!demand?.approuve_par;
  const isAwaitingFirstApproval = demand?.statut === 'en_attente_validation' && !hasFirstApproval;
  const isAwaitingSecondApproval = demand?.statut === 'en_attente_validation' && hasFirstApproval && needsDoubleApproval;
  const currentApprovalLabel = needsDoubleApproval ? '1ère approbation' : 'Approbation';
  const historyApprovalLabel = needsDoubleApproval ? 'Première approbation' : 'Approbation';

  const handleReject = () => {
    if (rejectReason.trim() && onReject) {
      onReject(rejectReason);
      setShowRejectModal(false);
      setRejectReason('');
    }
  };

  // Handler for sending confirmation email
  const handleSendConfirmationEmail = async () => {
    if (!demand || !clubId) return;

    setIsSendingEmail(true);
    try {
      const result = await sendExpenseSubmittedEmail(clubId, demand);

      if (result.success) {
        // Update local state
        setConfirmationEmailSent(true);

        // Update in Firestore via onUpdate
        if (onUpdate) {
          onUpdate({
            confirmation_email_sent: true,
            confirmation_email_sent_at: new Date(),
          });
        }

        toast.success('Email de confirmation envoyé avec succès');
      } else {
        toast.error(result.error || 'Erreur lors de l\'envoi de l\'email');
      }
    } catch (error: any) {
      logger.error('Error sending confirmation email:', error);
      toast.error(error.message || 'Erreur lors de l\'envoi de l\'email');
    } finally {
      setIsSendingEmail(false);
    }
  };

  // NEW: Handler for AI analysis
  const handleAnalyzeWithAI = async () => {
    if (pendingFiles.length === 0 || !onAnalyzeWithAI) {
      alert('Veuillez d\'abord ajouter des fichiers à analyser');
      return;
    }

    setIsAnalyzing(true);
    try {
      const result = await onAnalyzeWithAI(pendingFiles);
      if (result) {
        // Apply AI results to fields
        if (result.montant) setEditedMontant(formatEditableAmount(result.montant));
        if (result.description) setEditedDescription(result.description);
        if (result.fournisseur) setEditedFournisseur(result.fournisseur);
        if (result.categorie) setEditedCategorie(result.categorie);
        if (result.code_comptable) setEditedCodeComptable(result.code_comptable);
        if (result.date_depense) {
          const dateStr = new Date(result.date_depense).toISOString().split('T')[0];
          setEditedDateDepense(dateStr);
        }
      }
    } catch (error) {
      logger.error('AI analysis error:', error);
      alert('Erreur lors de l\'analyse IA');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveEdit = async () => {
    // Prevent double submission
    if (isSaving) {
      logger.debug('⚠️ Déjà en train de sauvegarder, ignoring click');
      return;
    }

    // Validation - Support both comma and period as decimal separator
    const montant = parseAmountInput(editedMontant);

    // REMOVED VALIDATION BLOCKS - Allow creation with montant = 0 and empty description
    // The user can edit these fields after creation

    // Update the display state with the parsed value to prevent display issues
    if (!isNaN(montant)) {
      setEditedMontant(formatEditableAmount(montant));
    }

    setIsSaving(true);

    try {
      if (onUpdate) {
        // Edit mode - Filter out undefined values for Firestore
        const updates: any = {
          montant,
          description: editedDescription,
          titre: editedCommentaire,
          categorie: editedCategorie,
          code_comptable: editedCodeComptable,
          date_depense: new Date(editedDateDepense),
        };

        // Add demandeur fields only if they have values
        if (showOtherDemandeur && editedDemandeurNom) {
          updates.demandeur_nom = editedDemandeurNom;
          // Remove demandeur_id when using free text
          updates.demandeur_id = null;
        } else if (!showOtherDemandeur && editedDemandeurId) {
          updates.demandeur_id = editedDemandeurId;
          // Find membre and set demandeur_nom
          const membre = membres.find(m => m.id === editedDemandeurId);
          if (membre) {
            updates.demandeur_nom = getMemberDisplayName(membre);
          }
        }

        // Add evenement_id only if set
        if (editedEvenementId) {
          updates.evenement_id = editedEvenementId;
        }

        onUpdate(updates);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (isCreateMode) {
      // In create mode, close the modal
      onClose();
    } else if (demand) {
      // In edit mode, revert changes
      setEditedMontant(formatEditableAmount(demand.montant));
      setEditedDescription(demand.description);
      setEditedCommentaire(demand.titre || '');
      setEditedCategorie(demand.categorie || '');
      setEditedCodeComptable(demand.code_comptable || '');
      setEditedDemandeurId(demand.demandeur_id || '');
      setEditedDemandeurNom(demand.demandeur_nom || '');
      setEditedEvenementId(demand.evenement_id || '');
      setEditedDateDepense(
        demand.date_depense ? new Date(demand.date_depense).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
      );
    }
  };

  // Quick create fournisseur handler
  const handleQuickCreateFournisseur = async () => {
    if (!newFournisseurNom.trim()) {
      toast.error('Le nom du fournisseur est requis');
      return;
    }
    if (!newFournisseurIban.trim()) {
      toast.error('L\'IBAN est requis');
      return;
    }

    const cleanIban = newFournisseurIban.replace(/\s/g, '').toUpperCase();
    if (cleanIban.length < 15 || cleanIban.length > 34) {
      toast.error('IBAN invalide: longueur incorrecte (15-34 caractères)');
      return;
    }

    setIsCreatingFournisseur(true);
    try {
      const newFournisseurId = await createFournisseur(
        clubId,
        {
          nom: newFournisseurNom.trim(),
          iban: cleanIban,
        },
        currentUser?.id || 'unknown'
      );

      // Refresh fournisseurs list
      const updatedFournisseurs = await getActiveFournisseurs(clubId);
      setFournisseurs(updatedFournisseurs);

      // Auto-select the newly created fournisseur
      setSelectedFournisseurId(newFournisseurId);
      if (!isCreateMode) {
        handleFieldSave('fournisseur_id', newFournisseurId);
        handleFieldSave('fournisseur_nom', newFournisseurNom.trim());
      }

      // Reset form
      setShowQuickCreateFournisseur(false);
      setNewFournisseurNom('');
      setNewFournisseurIban('');

      toast.success(`Fournisseur "${newFournisseurNom.trim()}" créé!`);
    } catch (error) {
      logger.error('Error creating fournisseur:', error);
      toast.error('Erreur lors de la création du fournisseur');
    } finally {
      setIsCreatingFournisseur(false);
    }
  };

  // Gestion de la fermeture avec avertissement brouillon
  const handleCloseWithWarning = () => {
    if (demand?.statut === 'brouillon') {
      setShowBrouillonWarningModal(true);
    } else {
      onClose();
    }
  };

  // Changer le statut en "en_attente_validation" et fermer
  const handleSubmitBrouillon = async () => {
    if (onUpdate) {
      await onUpdate({ statut: 'en_attente_validation' });
    }
    setShowBrouillonWarningModal(false);
    onClose();
  };

  const handleDeleteDocument = (urlToDelete: string) => {
    if (!confirm('Voulez-vous vraiment supprimer ce document ?')) {
      return;
    }

    // Filter out the document to delete
    const updatedDocs = documents.filter(doc => doc.url !== urlToDelete);

    if (onUpdate) {
      onUpdate({
        documents_justificatifs: updatedDocs.length > 0 ? updatedDocs : undefined,
        // Also update legacy field for backward compatibility
        urls_justificatifs: updatedDocs.length > 0 ? updatedDocs.map(d => d.url) : undefined
      });
    }

    // Si le document supprimé était sélectionné, réinitialiser la sélection
    if (selectedDocument?.url === urlToDelete) {
      setSelectedDocument(null);
    }
  };

  const handleSaveDocumentName = () => {
    if (!selectedDocument || !editedDocName.trim() || !onUpdate) return;

    // Update the document name in Firestore
    const updatedDocs = documents.map(doc =>
      doc.url === selectedDocument.url
        ? { ...doc, nom_affichage: editedDocName.trim() }
        : doc
    );

    onUpdate({ documents_justificatifs: updatedDocs });
    setIsEditingDocName(false);

    // Update selected document with new name
    setSelectedDocument({ ...selectedDocument, nom_affichage: editedDocName.trim() });
  };

  // NEW: Handler for file uploads in create mode
  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newFiles = Array.from(files);

    // Check for duplicates in all expenses
    if (clubId) {
      const { checkDuplicatesInAllExpenses } = await import('@/services/documentDeduplicationService');
      const duplicates = await checkDuplicatesInAllExpenses(newFiles, clubId);

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

        if (!addDuplicates && nonDuplicateFiles.length > 0) {
          // Second dialog: Add only new files?
          const addNew = window.confirm(
            `Ajouter uniquement les ${nonDuplicateFiles.length} nouveau(x) fichier(s) ?`
          );
          if (!addNew) {
            toast.info('Aucun fichier ajouté');
            return;
          }
          // Add only non-duplicates
          setPendingFiles(prev => [...prev, ...nonDuplicateFiles]);
          toast.success(`${nonDuplicateFiles.length} fichier(s) ajouté(s) (${duplicates.length} doublon(s) ignoré(s))`);
        } else if (!addDuplicates && nonDuplicateFiles.length === 0) {
          toast.info('Aucun nouveau fichier à ajouter');
          return;
        } else if (addDuplicates) {
          // Add everything (including duplicates)
          setPendingFiles(prev => [...prev, ...newFiles]);
          toast.warning(`${newFiles.length} fichier(s) ajouté(s) (dont ${duplicates.length} doublon(s))`);
        }
      } else {
        // No duplicates, add all files
        setPendingFiles(prev => [...prev, ...newFiles]);
      }
    } else {
      // No clubId, just add files (fallback)
      setPendingFiles(prev => [...prev, ...newFiles]);
    }
  };

  // NEW: Handler for file uploads WITH automatic analysis
  const handleFileUploadWithAnalysis = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newFiles = Array.from(files);

    // 🔍 Check for duplicates BEFORE processing
    if (clubId) {
      const { checkDuplicatesInAllExpenses } = await import('@/services/documentDeduplicationService');
      const duplicates = await checkDuplicatesInAllExpenses(newFiles, clubId);

      if (duplicates.length > 0) {
        const duplicateList = duplicates
          .map(d => `• ${d.file.name}\n  → Dépense "${d.demande.description}" (${d.demande.montant}€)`)
          .join('\n\n');

        const duplicateFileNames = new Set(duplicates.map(d => d.file.name));
        const nonDuplicateFiles = newFiles.filter(f => !duplicateFileNames.has(f.name));

        const addDuplicates = window.confirm(
          `⚠️ ${duplicates.length} doublon(s) détecté(s):\n\n${duplicateList}\n\n` +
          `Voulez-vous ajouter les doublons ?\n\n` +
          `OK = Tout ajouter | Annuler = Voir les options`
        );

        if (!addDuplicates) {
          // User clicked Cancel - show options
          const skipDuplicates = window.confirm(
            `Options:\n\n` +
            `OK = Ajouter uniquement les fichiers non-doublons (${nonDuplicateFiles.length})\n` +
            `Annuler = Ne rien ajouter`
          );

          if (skipDuplicates) {
            // Only add non-duplicates
            if (nonDuplicateFiles.length === 0) {
              toast.error('Tous les fichiers sont des doublons. Aucun fichier ajouté.');
              return;
            }
            // Continue with non-duplicate files only
            newFiles.length = 0;
            newFiles.push(...nonDuplicateFiles);
            toast.success(`${nonDuplicateFiles.length} fichier(s) ajouté(s), ${duplicates.length} doublon(s) ignoré(s)`);
          } else {
            // Cancel everything
            toast.info('Aucun fichier ajouté');
            return;
          }
        } else {
          // User clicked OK on first dialog - add everything including duplicates
          toast(`⚠️ ${duplicates.length} doublon(s) seront ajouté(s)`, {
            icon: '⚠️',
            duration: 3000
          });
        }
      }
    }

    // Add files to pending list first (for preview)
    setPendingFiles(prev => [...prev, ...newFiles]);

    // Only analyze first file for now (to avoid overwhelming the user)
    if (newFiles.length > 0) {
      const file = newFiles[0];
      setIsAnalyzingFile(true);

      try {
        logger.debug(`🔍 Analyse automatique du fichier: ${file.name}`);

        // STEP 1: Extract sequence from filename
        const sequence = extractSequenceFromFilename(file.name);
        let transactionFound = false;
        let foundTransaction: TransactionBancaire | null = null;

        if (sequence && clubId) {
          logger.debug(`✅ Numéro de séquence détecté: ${sequence}`);
          foundTransaction = await findTransactionBySequence(sequence, clubId);

          if (foundTransaction) {
            transactionFound = true;
            logger.debug(`✅ Transaction trouvée! Montant: ${foundTransaction.montant}€`);

            // 🔗 Opslaan transaction ID voor automatische linking na creatie
            setFoundTransactionId(foundTransaction.id);

            toast.success(`Transaction ${sequence} trouvée automatiquement!`, {
              icon: '🔗',
              duration: 4000
            });

            // Pre-fill expense data from transaction
            setEditedMontant(formatEditableAmount(Math.abs(foundTransaction.montant)));

            // Use transaction date if no date in filename
            if (foundTransaction.date_execution) {
              // Handle both Date objects and Firestore Timestamps
              const transactionDate = foundTransaction.date_execution instanceof Date
                ? foundTransaction.date_execution
                : foundTransaction.date_execution.toDate();

              const dateStr = transactionDate.toISOString().split('T')[0];
              setEditedDateDepense(dateStr);
              logger.debug(`📅 Date de la transaction utilisée: ${transactionDate.toLocaleDateString('fr-FR')}`);
            }

          } else {
            logger.debug(`⚠️ Aucune transaction trouvée pour ${sequence}`);
            toast('Aucune transaction correspondante trouvée', {
              icon: 'ℹ️',
              duration: 3000
            });
          }
        }

        // STEP 2: Extract description from filename (PRIORITY - before transaction data)
        const fileDescription = extractDescriptionFromFilename(file.name);
        if (fileDescription && !editedDescription) {
          setEditedDescription(fileDescription);
          logger.debug(`📝 Description extraite du fichier: ${fileDescription}`);
        }

        // STEP 3: Extract date from filename
        const extractedDate = extractDateFromFilename(file.name);
        if (extractedDate) {
          const dateStr = extractedDate.toISOString().split('T')[0];
          setEditedDateDepense(dateStr);
          logger.debug(`📅 Date extraite: ${extractedDate.toLocaleDateString('fr-FR')}`);
        }

        // STEP 4: Optional AI analysis (if configured and enabled)
        if (aiDocumentService.isAIAvailable() && onAnalyzeWithAI) {
          logger.debug('🤖 Analyse IA disponible, lancement de l\'analyse approfondie...');
          const aiResult = await aiDocumentService.analyzeDocument(file, {
            clubId,
            useAI: true
          });

          if (aiResult.status === 'completed') {
            // Apply AI results (will override basic extraction)
            if (aiResult.montant && aiResult.montant > 0) {
              setEditedMontant(formatEditableAmount(aiResult.montant));
            }
            if (aiResult.fournisseur?.nom) {
              setEditedFournisseur(aiResult.fournisseur.nom);
            }
            if (aiResult.description) {
              setEditedDescription(aiResult.description);
            }
            if (aiResult.categorie) {
              setEditedCategorie(aiResult.categorie);
            }
            if (aiResult.code_comptable) {
              setEditedCodeComptable(aiResult.code_comptable);
            }

            setAnalysisResults(aiResult);
            toast.success('Analyse IA terminée avec succès!', {
              icon: '✨',
              duration: 3000
            });
          }
        } else {
          toast.success('Extraction basique effectuée', {
            icon: '✅',
            duration: 2000
          });
        }

      } catch (error) {
        logger.error('❌ Erreur lors de l\'analyse:', error);
        toast.error('Erreur lors de l\'analyse du fichier');
      } finally {
        setIsAnalyzingFile(false);
      }
    }
  };

  const handleRemovePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/30"
        style={{ zIndex: backdropZIndex }}
        onClick={handleCloseWithWarning}
      />
      
      {/* Panel - Right side */}
      <div className={cn(
        "fixed right-0 top-0 h-full bg-white shadow-2xl flex flex-col transition-transform duration-300",
        isOpen ? "translate-x-0" : "translate-x-full",
        "w-full max-w-3xl"
      )}
      style={{ zIndex: panelZIndex }}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border bg-gradient-to-r from-orange-600 to-orange-700">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <button
                  onClick={() => {
                    if (isQuickView) {
                      onClose();
                    } else if (fromTransactionId) {
                      navigate('/transactions', { state: { fromTransactionId } });
                    } else {
                      navigate(-1);
                    }
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-white/10 hover:bg-white dark:bg-dark-bg-secondary/20 text-white rounded-lg transition-colors text-sm font-medium"
                  title={isQuickView ? 'Fermer cette vue' : 'Retour à la page précédente'}
                >
                  <ArrowLeft className="h-4 w-4" />
                  {isQuickView ? 'Fermer' : 'Retour'}
                </button>
                {onOpenContext && !isCreateMode && (
                  <button
                    onClick={onOpenContext}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-white/15 hover:bg-white/25 text-white rounded-lg transition-colors text-sm font-medium"
                    title={contextActionLabel}
                  >
                    <ExternalLink className="h-4 w-4" />
                    {contextActionLabel}
                  </button>
                )}
                <input
                  type="text"
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  onBlur={() => handleFieldSave('description', editedDescription)}
                  className="text-xl font-bold bg-white/10 border border-white/30 text-white placeholder-white/60 rounded px-3 py-1.5 w-full focus:outline-none focus:ring-2 focus:ring-white/50"
                  placeholder="Titre de la demande de remboursement..."
                />
              </div>
              {!isCreateMode && demand && (
                <div className="flex items-center gap-4 text-orange-100 text-sm">
                  <span className="flex items-center gap-1">
                    <User className="h-3.5 w-3.5" />
                    {demand.demandeur_nom}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {demand.date_soumission ? formatDate(demand.date_soumission) : '-'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Euro className="h-3.5 w-3.5" />
                    {formatMontant(demand.montant)}
                  </span>
                </div>
              )}
            </div>

            {/* Navigation counter (keyboard navigation) */}
            {!isCreateMode && navigationPosition && (
              <div className="flex items-center gap-1 bg-white/10 rounded-lg text-white text-sm font-medium mr-2">
                <button
                  onClick={onNavigatePrevious}
                  disabled={!onNavigatePrevious}
                  className="p-2 hover:bg-white/20 rounded-l-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Dépense précédente (←)"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-1">{navigationPosition.current} / {navigationPosition.total}</span>
                <button
                  onClick={onNavigateNext}
                  disabled={!onNavigateNext}
                  className="p-2 hover:bg-white/20 rounded-r-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Dépense suivante (→)"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}

            <button
              onClick={handleCloseWithWarning}
              className="p-2 hover:bg-white dark:bg-dark-bg-secondary/10 rounded-lg transition-colors"
            >
              <X className="h-5 w-5 text-white" />
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 mt-4">
            {/* NEW: AI Analysis button in create mode */}
            {isCreateMode && onAnalyzeWithAI && (
              <button
                onClick={handleAnalyzeWithAI}
                disabled={isAnalyzing || pendingFiles.length === 0}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAnalyzing ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Analyse en cours...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Analyser avec IA
                  </>
                )}
              </button>
            )}

            {!isCreateMode && linkedTransaction && onUnlinkTransaction && (
              <button
                onClick={onUnlinkTransaction}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white/20 text-white rounded-lg hover:bg-white dark:bg-dark-bg-secondary/30 transition-colors"
              >
                <Link2 className="h-4 w-4" />
                Délier la transaction
              </button>
            )}
            {!isCreateMode && !linkedTransaction && demand?.statut === 'approuve' && onLinkTransaction && (
              <button
                onClick={onLinkTransaction}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white/20 text-white rounded-lg hover:bg-white dark:bg-dark-bg-secondary/30 transition-colors"
              >
                <Link2 className="h-4 w-4" />
                Lier une transaction
              </button>
            )}
            {/* Bouton Envoyer message - toujours visible */}
            {!isCreateMode && demand && (
              <button
                onClick={() => setShowSMSModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors"
              >
                <MessageCircle className="h-4 w-4" />
                Envoyer message
              </button>
            )}

            {/* Bouton supprimer - visible pour les utilisateurs avec permission */}
            {!isCreateMode && onDelete && hasPermission('demands.delete') && (
              <button
                onClick={() => {
                  if (window.confirm('Êtes-vous sûr de vouloir supprimer cette dépense ?')) {
                    onDelete();
                  }
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-red-500/20 text-white rounded-lg hover:bg-red-500/30 transition-colors ml-auto"
              >
                <Trash2 className="h-4 w-4" />
                Supprimer
              </button>
            )}

          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-dark-bg-secondary">
          <nav className="flex -mb-px px-6 overflow-x-auto">
            {[
              { id: 'overview', label: 'Vue d\'ensemble', icon: FileText, showInCreate: true },
              { id: 'liaisons', label: `Liaisons (${linkedTransactions.length})`, icon: Link2, showInCreate: true, hideForUser: true },
              { id: 'approval', label: 'Approbation', icon: UserCheck, showInCreate: true },
              { id: 'documents', label: `Documents (${isCreateMode ? pendingFiles.length : documents.length})`, icon: Upload, showInCreate: true }
            ]
              .filter(tab => !isCreateMode || tab.showInCreate)
              .filter(tab => !(tab.hideForUser && appUser && getRole(appUser) === 'user'))
              .map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={cn(
                    "px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2",
                    activeTab === tab.id
                      ? "border-orange-600 text-orange-600"
                      : "border-transparent text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:text-dark-text-primary hover:border-gray-300 dark:border-dark-border"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="p-6 space-y-6">
              {/* Informations principales */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-dark-text-muted mb-3">Informations de la demande</h3>
                <div className="flex gap-3">
                  {/* Montant - compact */}
                  <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-3 w-44 md:w-48 flex-shrink-0">
                    <p className="text-xs text-gray-600 dark:text-dark-text-secondary mb-1 flex items-center gap-1">
                      <Euro className="h-3 w-3" />
                      Montant
                    </p>
                    <input
                      type="text"
                      value={editedMontant}
                      onChange={(e) => setEditedMontant(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onBlur={() => handleFieldSave('montant', editedMontant)}
                      inputMode="decimal"
                      className="text-xl font-bold font-mono text-gray-900 dark:text-dark-text-primary bg-white dark:bg-dark-bg-secondary border border-gray-300 dark:border-dark-border rounded px-2 py-1 w-full"
                      placeholder="0,00"
                    />
                    {needsDoubleApproval && (
                      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-orange-600">
                        <Shield className="h-3 w-3" />
                        <span>Double appro.</span>
                      </div>
                    )}
                    {/* Audit trail for montant modifications */}
                    {demand?.montant_modified && (
                      <MontantAuditTrail
                        history={demand.montant_history}
                        currentMontant={demand.montant}
                      />
                    )}
                  </div>
                  {/* Date - compact */}
                  <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-3 w-40 flex-shrink-0">
                    <p className="text-xs text-gray-600 dark:text-dark-text-secondary mb-1 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Date de la dépense
                    </p>
                    <input
                      type="date"
                      value={editedDateDepense}
                      onChange={(e) => setEditedDateDepense(e.target.value)}
                      onBlur={() => handleFieldSave('date_depense', editedDateDepense)}
                      className="text-sm font-semibold text-gray-900 dark:text-dark-text-primary bg-white dark:bg-dark-bg-secondary border border-gray-300 dark:border-dark-border rounded px-2 py-1.5 w-full"
                    />
                  </div>
                  {/* Communication - takes remaining space */}
                  <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-3 flex-1 min-w-0">
                    <p className="text-xs text-gray-600 dark:text-dark-text-secondary mb-1 flex items-center gap-1">
                      <MessageCircle className="h-3 w-3" />
                      Communication
                    </p>
                    <input
                      type="text"
                      value={editedCommunicationQr}
                      onChange={(e) => setEditedCommunicationQr(e.target.value.substring(0, 140))}
                      onBlur={() => handleFieldSave('communication_qr', editedCommunicationQr)}
                      className="text-sm font-medium text-gray-900 dark:text-dark-text-primary bg-white dark:bg-dark-bg-secondary border border-gray-300 dark:border-dark-border rounded px-2 py-1.5 w-full font-mono"
                      placeholder="Communication bancaire..."
                      maxLength={140}
                    />
                    <p className="text-[10px] text-gray-400 dark:text-dark-text-muted mt-0.5 text-right">{editedCommunicationQr.length}/140</p>
                  </div>
                </div>
              </div>

              {/* Source Transaction (if created from a bank transaction to refund it) */}
              {demand?.source_transaction_id && (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                    <RefreshCcw className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      Remboursement de la transaction {demand.source_transaction_ref || demand.source_transaction_id}
                    </span>
                  </div>
                </div>
              )}

              {/* NEW: Demandeur field */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-dark-text-muted mb-2 flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  Demandeur
                </h3>
                {!showOtherDemandeur ? (
                  <select
                    value={editedDemandeurId}
                    onChange={(e) => {
                      if (e.target.value === 'autre') {
                        setShowOtherDemandeur(true);
                        setEditedDemandeurId('');
                      } else {
                        const newId = e.target.value;
                        setEditedDemandeurId(newId);
                        const membre = membres.find(m => m.id === newId);
                        const newNom = membre ? getMemberDisplayName(membre) : '';
                        if (membre) {
                          setEditedDemandeurNom(newNom);
                        }
                        if (!isCreateMode) handleDemandeurSave(newId, newNom, false);
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white dark:bg-dark-bg-secondary"
                  >
                    <option value="">Sélectionner un membre</option>
                    {membres
                      .sort((a, b) => getMemberDisplayName(a).localeCompare(getMemberDisplayName(b)))
                      .map(membre => (
                        <option key={membre.id} value={membre.id}>
                          {getMemberDisplayName(membre)}
                        </option>
                      ))}
                    <option value="autre">--- Autre (texte libre) ---</option>
                  </select>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editedDemandeurNom}
                      onChange={(e) => setEditedDemandeurNom(e.target.value)}
                      onBlur={() => !isCreateMode && handleDemandeurSave()}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      placeholder="Nom du demandeur..."
                    />
                    <button
                      onClick={() => {
                        setShowOtherDemandeur(false);
                        setEditedDemandeurNom('');
                        setEditedDemandeurId(currentUser?.id || '');
                      }}
                      className="px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary text-sm"
                    >
                      Revenir à la liste
                    </button>
                  </div>
                )}
              </div>

              {/* Bénéficiaire du remboursement */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-dark-text-muted mb-2 flex items-center gap-1">
                  <CreditCard className="h-3.5 w-3.5" />
                  Bénéficiaire du remboursement
                </h3>
                <div className="space-y-3">
                  {/* Toggle between demandeur and fournisseur */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setBeneficiaireType('demandeur');
                        setSelectedFournisseurId('');
                        if (!isCreateMode) {
                          handleFieldSave('beneficiaire_type', 'demandeur');
                          handleFieldSave('fournisseur_id', null);
                          handleFieldSave('fournisseur_nom', null);
                        }
                      }}
                      className={cn(
                        'flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
                        beneficiaireType === 'demandeur'
                          ? 'bg-calypso-blue text-white border-calypso-blue'
                          : 'bg-white dark:bg-dark-bg-secondary border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-primary hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary'
                      )}
                    >
                      <User className="h-4 w-4 inline mr-2" />
                      Demandeur
                    </button>
                    <button
                      onClick={() => {
                        setBeneficiaireType('fournisseur');
                        if (!isCreateMode) {
                          handleFieldSave('beneficiaire_type', 'fournisseur');
                        }
                      }}
                      className={cn(
                        'flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
                        beneficiaireType === 'fournisseur'
                          ? 'bg-calypso-blue text-white border-calypso-blue'
                          : 'bg-white dark:bg-dark-bg-secondary border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-primary hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary'
                      )}
                    >
                      <Building2 className="h-4 w-4 inline mr-2" />
                      Fournisseur
                    </button>
                  </div>

                  {/* Show current beneficiary info */}
                  {beneficiaireType === 'demandeur' ? (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
                      <p className="text-sm text-blue-800 dark:text-blue-300">
                        Remboursement vers: <span className="font-medium">{editedDemandeurNom || 'Non spécifié'}</span>
                      </p>
                      {editedDemandeurId && membres.find(m => m.id === editedDemandeurId)?.iban && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 font-mono">
                          IBAN: {formatIBAN(membres.find(m => m.id === editedDemandeurId)?.iban || '')}
                        </p>
                      )}
                      {editedDemandeurId && !membres.find(m => m.id === editedDemandeurId)?.iban && (
                        <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                          ⚠️ IBAN non renseigné pour ce membre
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {!showQuickCreateFournisseur ? (
                        <>
                          <div className="flex gap-2">
                            <select
                              value={selectedFournisseurId}
                              onChange={(e) => {
                                const newId = e.target.value;
                                setSelectedFournisseurId(newId);
                                const selectedFournisseur = fournisseurs.find(f => f.id === newId);
                                if (!isCreateMode) {
                                  handleFieldSave('fournisseur_id', newId || null);
                                  handleFieldSave('fournisseur_nom', selectedFournisseur?.nom || null);
                                }
                              }}
                              className="flex-1 px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent bg-white dark:bg-dark-bg-secondary"
                            >
                              <option value="">Sélectionner un fournisseur</option>
                              {fournisseurs
                                .sort((a, b) => a.nom.localeCompare(b.nom))
                                .map(f => (
                                  <option key={f.id} value={f.id}>
                                    {f.nom}
                                  </option>
                                ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => setShowQuickCreateFournisseur(true)}
                              className="px-3 py-2 text-sm font-medium text-calypso-blue border border-calypso-blue rounded-lg hover:bg-calypso-blue hover:text-white transition-colors flex items-center gap-1"
                              title="Créer un nouveau fournisseur"
                            >
                              <Plus className="h-4 w-4" />
                              Nouveau
                            </button>
                          </div>
                          {selectedFournisseurId && (
                            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg p-3">
                              <p className="text-sm text-orange-800 dark:text-orange-300">
                                Remboursement vers: <span className="font-medium">{fournisseurs.find(f => f.id === selectedFournisseurId)?.nom}</span>
                              </p>
                              <p className="text-xs text-orange-600 dark:text-orange-400 mt-1 font-mono">
                                IBAN: {formatIBAN(fournisseurs.find(f => f.id === selectedFournisseurId)?.iban || '')}
                              </p>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="bg-gray-50 dark:bg-dark-bg-tertiary border border-gray-200 dark:border-dark-border rounded-lg p-3 space-y-3">
                          <p className="text-sm font-medium text-gray-700 dark:text-dark-text-primary">
                            Nouveau fournisseur
                          </p>
                          <input
                            type="text"
                            value={newFournisseurNom}
                            onChange={(e) => setNewFournisseurNom(e.target.value)}
                            placeholder="Nom du fournisseur *"
                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent bg-white dark:bg-dark-bg-secondary"
                            autoFocus
                          />
                          <input
                            type="text"
                            value={newFournisseurIban}
                            onChange={(e) => setNewFournisseurIban(e.target.value.toUpperCase())}
                            placeholder="IBAN *"
                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent bg-white dark:bg-dark-bg-secondary font-mono"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={handleQuickCreateFournisseur}
                              disabled={isCreatingFournisseur || !newFournisseurNom.trim() || !newFournisseurIban.trim()}
                              className="flex-1 px-3 py-2 text-sm font-medium text-white bg-calypso-blue rounded-lg hover:bg-calypso-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                            >
                              {isCreatingFournisseur ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Création...
                                </>
                              ) : (
                                'Créer'
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowQuickCreateFournisseur(false);
                                setNewFournisseurNom('');
                                setNewFournisseurIban('');
                              }}
                              className="px-3 py-2 text-sm font-medium text-gray-600 dark:text-dark-text-secondary border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-secondary transition-colors"
                            >
                              Annuler
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* NEW: Activité liée field with linking panel button */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-dark-text-muted mb-2 flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Activité liée (optionnel)
                </h3>
                {demand?.evenement_titre ? (
                  <div className="space-y-2">
                    <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg p-3">
                      <p className="font-medium text-purple-900 dark:text-purple-400">{demand.evenement_titre}</p>
                    </div>
                    {!isCreateMode && (
                      <div className="flex items-center gap-2">
                        {demand.evenement_id && (
                          <button
                            onClick={() => {
                              if (linkedOperation && onViewOperation) {
                                onViewOperation(linkedOperation);
                                return;
                              }

                              navigate('/operations', {
                                state: {
                                  openEventId: demand.evenement_id,
                                  fromExpense: true
                                }
                              });
                            }}
                            className="inline-flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm"
                          >
                            <ExternalLink className="h-4 w-4" />
                            Voir l'activité
                          </button>
                        )}
                        {onLinkEvent && (
                          <button
                            onClick={onLinkEvent}
                            className="text-sm text-purple-600 hover:text-purple-800 underline"
                          >
                            Modifier l'activité liée
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-dark-text-muted">Aucune activité liée</p>
                )}
              </div>

              {/* Statut */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-dark-text-muted mb-2 flex items-center gap-1">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Statut
                </h3>
                <div className="relative">
                  <select
                    value={editedStatut}
                    onChange={(e) => {
                      const newStatut = e.target.value as DemandeRemboursement['statut'];
                      setEditedStatut(newStatut);
                      if (!isCreateMode) handleFieldSave('statut', newStatut);
                    }}
                    disabled={isCreateMode}
                    className={cn(
                      "w-full pl-8 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent appearance-none cursor-pointer",
                      editedStatut === 'brouillon' && "bg-gray-100 dark:bg-dark-bg-tertiary border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-primary dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300",
                      editedStatut === 'en_attente_validation' && "bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-900/30 dark:border-amber-600 dark:text-amber-300",
                      editedStatut === 'approuve' && "bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-600 dark:text-emerald-300",
                      editedStatut === 'cree_banque_attente_validation' && "bg-indigo-50 border-indigo-300 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-600 dark:text-indigo-300",
                      editedStatut === 'paiement_effectue' && "bg-cyan-50 border-cyan-300 text-cyan-700 dark:bg-cyan-900/30 dark:border-cyan-600 dark:text-cyan-300",
                      editedStatut === 'rembourse' && "bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-600 dark:text-blue-300",
                      editedStatut === 'refuse' && "bg-red-50 border-red-300 text-red-700 dark:bg-red-900/30 dark:border-red-600 dark:text-red-300"
                    )}
                  >
                    <option value="brouillon">Brouillon</option>
                    <option value="en_attente_validation">En attente de validation</option>
                    <option value="approuve">Approuvé</option>
                    <option value="cree_banque_attente_validation">Créé dans banque</option>
                    <option value="paiement_effectue">Paiement effectué</option>
                    <option value="rembourse">Remboursé</option>
                    <option value="refuse">Refusé</option>
                  </select>
                  {/* Status indicator dot */}
                  <div className={cn(
                    "absolute left-3 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full pointer-events-none",
                    editedStatut === 'brouillon' && "bg-gray-400",
                    editedStatut === 'en_attente_validation' && "bg-amber-500",
                    editedStatut === 'approuve' && "bg-emerald-500",
                    editedStatut === 'cree_banque_attente_validation' && "bg-indigo-500",
                    editedStatut === 'paiement_effectue' && "bg-cyan-500",
                    editedStatut === 'rembourse' && "bg-blue-500",
                    editedStatut === 'refuse' && "bg-red-500"
                  )} />
                </div>
              </div>

              {/* Notes additionnelles */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-dark-text-muted mb-2 flex items-center gap-1">
                  💬 Notes additionnelles (optionnel)
                </h3>
                <textarea
                  value={editedCommentaire}
                  onChange={(e) => setEditedCommentaire(e.target.value)}
                  onBlur={() => handleFieldSave('titre', editedCommentaire)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="Notes, remarques, informations complémentaires..."
                />
              </div>

              {/* EPC QR Code voor betaling */}
              {!isCreateMode && demand && (
                <EpcQrCode
                  beneficiaryName={
                    beneficiaireType === 'fournisseur' && selectedFournisseurId
                      ? fournisseurs.find(f => f.id === selectedFournisseurId)?.nom || ''
                      : editedDemandeurNom || ''
                  }
                  iban={
                    beneficiaireType === 'fournisseur' && selectedFournisseurId
                      ? fournisseurs.find(f => f.id === selectedFournisseurId)?.iban
                      : editedDemandeurId
                        ? membres.find(m => m.id === editedDemandeurId)?.iban
                        : undefined
                  }
                  amount={demand.montant}
                  communicationQr={editedCommunicationQr}
                  fallbackReference={editedDescription || `Demande ${demand.id?.substring(0, 8)}`}
                  status={demand.statut}
                  isAlreadyPaid={demand.statut === 'rembourse' || !!demand.transaction_id}
                  isPaiementManuel={isPaiementManuel}
                  paiementManuelDate={paiementManuelDate}
                  onPaiementManuelChange={async (checked) => {
                    setIsPaiementManuel(checked);
                    if (onUpdate) {
                      // Si on coche, passer automatiquement au statut 'paiement_effectue'
                      // Sauf si déjà 'rembourse' (priorité au remboursement)
                      const shouldChangeStatus = checked && demand.statut !== 'rembourse';
                      const newStatut = shouldChangeStatus ? 'paiement_effectue' : demand.statut;

                      if (shouldChangeStatus) {
                        setEditedStatut('paiement_effectue');
                      }

                      await onUpdate({
                        paiement_manuel: checked,
                        paiement_manuel_date: checked ? new Date() : undefined,
                        paiement_manuel_par: checked ? appUser?.id : undefined,
                        ...(shouldChangeStatus && { statut: 'paiement_effectue' }),
                      });
                      toast.success(checked ? 'Paiement marqué comme effectué' : 'Marquage paiement retiré');
                    }
                  }}
                />
              )}

              {/* ID de la demande - tout en bas */}
              {demand?.id && (
                <p className="text-xs text-gray-400 dark:text-dark-text-muted font-mono pt-4 border-t border-gray-100 dark:border-dark-border">
                  ID: {demand.id}
                </p>
              )}

            </div>
          )}

          {/* Liaisons Tab */}
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
                  <div className="space-y-3">
                    {linkedTransactions.map(tx => (
                      <div
                        key={tx.id}
                        className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            {/* Numéro de transaction */}
                            {tx.numero_sequence && (
                              <div className="mb-2">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-600 text-white text-xs font-medium rounded">
                                  <CreditCard className="h-3 w-3" />
                                  {tx.numero_sequence}
                                </span>
                              </div>
                            )}

                            {/* Contrepartie */}
                            <p className="font-medium text-gray-900 dark:text-dark-text-primary text-base">
                              {tx.contrepartie_nom}
                            </p>

                            {/* Date et montant */}
                            <div className="flex items-center gap-3 mt-1 text-sm text-gray-600 dark:text-dark-text-secondary">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5" />
                                {formatDate(tx.date_execution)}
                              </span>
                              <span className={cn(
                                "font-bold text-base",
                                tx.montant >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
                              )}>
                                {formatMontant(tx.montant)}
                              </span>
                            </div>

                            {/* Communication */}
                            {tx.communication && (
                              <p className="text-sm text-gray-500 dark:text-dark-text-muted mt-2 italic line-clamp-2">
                                {tx.communication}
                              </p>
                            )}

                            {/* Type de transaction */}
                            <div className="flex items-center gap-2 mt-2">
                              <span className={cn(
                                "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                                tx.montant >= 0
                                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                                  : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                              )}>
                                {tx.montant >= 0 ? "Recette" : "Dépense"}
                              </span>
                            </div>
                          </div>

                          {/* Action buttons */}
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => {
                                if (onViewTransaction) {
                                  onViewTransaction(tx);
                                  return;
                                }

                                navigate('/transactions', {
                                  state: { selectedTransactionId: tx.id, fromExpense: true }
                                });
                              }}
                              className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                              title="Voir les détails"
                            >
                              <Eye className="h-4 w-4" />
                              <span>Voir</span>
                            </button>
                            {onUnlinkTransaction && (
                              <button
                                onClick={() => onUnlinkTransaction(tx.id)}
                                className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors"
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
                )}
              </div>

              {/* Activités Section */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                    Activités
                  </h3>
                  {onLinkEvent && (
                    <button
                      onClick={onLinkEvent}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                    >
                      <Link2 className="h-4 w-4" />
                      Lier à une activité
                    </button>
                  )}
                </div>

                {linkedOperation ? (
                  <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-dark-text-primary">
                          {linkedOperation.titre}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                          {formatDate(linkedOperation.date_debut)} • {linkedOperation.lieu || 'Lieu non spécifié'}
                        </p>
                        <div className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                          Budget: <span className="font-bold text-purple-600">{formatMontant(linkedOperation.budget_prevu_depenses || 0)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => {
                            if (onViewOperation) {
                              onViewOperation(linkedOperation);
                              return;
                            }

                            navigate('/operations', {
                              state: { openEventId: linkedOperation.id, fromExpense: true }
                            });
                          }}
                          className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
                          title="Voir l'activité"
                        >
                          <ExternalLink className="h-4 w-4" />
                          <span>Voir</span>
                        </button>
                        {onUnlinkEvent && (
                          <button
                            onClick={onUnlinkEvent}
                            className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                            title="Délier"
                          >
                            <Link2Off className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-dark-text-muted text-sm">
                    Aucune activité liée
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Documents Tab */}
          {activeTab === 'documents' && (
            <div className="p-6">
              {/* Hidden file input - used by drag & drop zone */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.gif"
                onChange={(e) => {
                  const files = e.target.files;
                  if (files && files.length > 0) {
                    if (isCreateMode) {
                      // Use automatic analysis in create mode
                      handleFileUploadWithAnalysis(files);
                    } else if (onAddDocument) {
                      // Simple upload for existing demands
                      onAddDocument(files);
                    }
                    // Reset the input so the same file can be selected again
                    e.target.value = '';
                  }
                }}
                className="hidden"
              />

              {/* Documents Grid */}
              {isCreateMode && pendingFiles.length > 0 && (
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {pendingFiles.map((file, index) => {
                    const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
                    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt);
                    const isPDF = fileExt === 'pdf';

                    // Tronquer le nom si trop long
                    const displayName = file.name.length > 30
                      ? file.name.substring(0, 27) + '...'
                      : file.name;

                    // Format file size
                    const formatSize = (bytes: number) => {
                      if (bytes === 0) return '';
                      if (bytes < 1024) return `${bytes} B`;
                      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
                      return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
                    };

                    return (
                      <div key={index} className="relative group">
                        <div
                          onClick={() => {
                            // Create preview URL if not exists
                            if (!pendingFilePreviewUrls.has(index)) {
                              const url = URL.createObjectURL(file);
                              setPendingFilePreviewUrls(prev => new Map(prev).set(index, url));
                            }
                            setSelectedPendingFileIndex(index);
                          }}
                          className={cn(
                            "w-full border rounded-lg p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary transition-colors",
                            selectedPendingFileIndex === index ? "border-purple-500 bg-purple-50" : "border-gray-200 dark:border-dark-border"
                          )}
                          title={file.name}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemovePendingFile(index);
                            }}
                            className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full hover:bg-red-700 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                          >
                            <X className="h-3 w-3" />
                          </button>
                          <div className="flex flex-col items-center gap-2">
                            {isPDF ? (
                              <FileText className="h-8 w-8 text-red-600" />
                            ) : isImage ? (
                              <ImageIcon className="h-8 w-8 text-blue-600" />
                            ) : (
                              <FileText className="h-8 w-8 text-gray-600 dark:text-dark-text-secondary" />
                            )}
                            <span className="text-xs text-gray-700 dark:text-dark-text-primary text-center font-medium break-all">
                              {displayName}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-dark-text-muted">
                              {formatSize(file.size)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Drag & Drop Zone - Always visible for new documents - NOW AT TOP */}
              {isCreateMode && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragging(false);
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                      handleFileUploadWithAnalysis(e.dataTransfer.files);
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all",
                    isDragging
                      ? "border-orange-500 bg-orange-50 dark:bg-orange-900/10"
                      : "border-gray-300 dark:border-dark-border hover:border-orange-400 hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary"
                  )}
                >
                  {isAnalyzingFile ? (
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="h-12 w-12 text-orange-600 animate-spin" />
                      <p className="text-sm font-medium text-orange-600">Analyse du document en cours...</p>
                      <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                        Extraction des données (montant, date, fournisseur...)
                      </p>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-12 w-12 mx-auto mb-3 text-gray-400 dark:text-dark-text-muted" />
                      <p className="text-base font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                        {isDragging ? "Déposez vos documents ici" : "Glissez vos justificatifs ici"}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-dark-text-muted mb-3">
                        ou cliquez pour parcourir vos fichiers
                      </p>
                      <div className="flex items-center justify-center gap-2 text-xs text-gray-400 dark:text-dark-text-muted">
                        <Sparkles className="h-4 w-4" />
                        <span>Analyse automatique : montant, date, fournisseur</span>
                      </div>
                      <p className="text-xs text-gray-400 dark:text-dark-text-muted mt-2">
                        PDF, JPG, PNG • Max 10 Mo
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* Drag & Drop Zone for existing demands - Always visible - NOW AT TOP */}
              {!isCreateMode && onAddDocument && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragging(false);
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                      onAddDocument(e.dataTransfer.files);
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all mb-6",
                    isDragging
                      ? "border-orange-500 bg-orange-50 dark:bg-orange-900/10"
                      : "border-gray-300 dark:border-dark-border hover:border-orange-400 hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary"
                  )}
                >
                  <div className="flex items-center justify-center gap-3">
                    <Upload className="h-8 w-8 text-orange-400 dark:text-orange-500" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-700 dark:text-dark-text-primary">
                        {isDragging ? "Déposez vos documents ici" : documents.length === 0 ? "Aucun justificatif attaché" : "Ajouter d'autres documents"}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                        <span className="font-semibold">Cliquez pour parcourir</span> ou glissez vos fichiers • PDF, JPG, PNG • Max 10 Mo
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Existing documents as vertical list - NOW AT BOTTOM */}
              {!isCreateMode && documents.length > 0 && (
                <div className="space-y-2">
                  {documents.map((doc, index) => {
                    const fileExt = doc.nom_affichage.split('.').pop()?.toLowerCase() || '';
                    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt);
                    const isPDF = fileExt === 'pdf';

                    // Format file size
                    const formatSize = (bytes: number) => {
                      if (bytes === 0) return '';
                      if (bytes < 1024) return `${bytes} B`;
                      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
                      return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
                    };

                    return (
                      <button
                        key={index}
                        onClick={() => {
                          setSelectedDocument(doc);
                          setEditedDocName(doc.nom_affichage);
                          setIsEditingDocName(false);
                        }}
                        className={cn(
                          "w-full border rounded-lg p-4 text-left hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors",
                          selectedDocument?.url === doc.url ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20" : "border-gray-200 dark:border-dark-border"
                        )}
                        title={doc.nom_affichage}
                      >
                        <div className="flex items-center gap-3">
                          {/* Icon */}
                          {isPDF ? (
                            <FileText className="h-6 w-6 text-red-600 flex-shrink-0" />
                          ) : isImage ? (
                            <ImageIcon className="h-6 w-6 text-blue-600 flex-shrink-0" />
                          ) : (
                            <FileText className="h-6 w-6 text-gray-600 dark:text-dark-text-secondary flex-shrink-0" />
                          )}

                          {/* File info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary truncate">
                              {doc.nom_affichage}
                            </p>
                            {doc.taille > 0 && (
                              <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                                {formatSize(doc.taille)}
                              </p>
                            )}
                          </div>

                          {/* Action buttons */}
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Eye className="h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Approval Tab */}
          {activeTab === 'approval' && (
            <div className="p-6 space-y-6">
              {/* État d'approbation actuel */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-dark-text-muted mb-3">État d'approbation</h3>

                {/* Show approval history if approved */}
                {hasFirstApproval && (
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                      <CheckCircle className="h-4 w-4 flex-shrink-0" />
                      <span className="font-medium">{currentApprovalLabel}:</span>
                      <span>{demand?.approuve_par_nom}</span>
                      {demand?.date_approbation && (
                        <span className="text-gray-500 dark:text-dark-text-muted text-sm ml-auto">
                          le {formatDate(demand.date_approbation)}
                        </span>
                      )}
                    </div>

                    {isAwaitingSecondApproval && (
                      <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg">
                        <Clock className="h-4 w-4 flex-shrink-0" />
                        <span className="font-medium">En attente de 2ème approbation</span>
                      </div>
                    )}

                    {demand?.approuve_par_2 && (
                      <div className="flex items-center gap-2 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                        <CheckCircle className="h-4 w-4 flex-shrink-0" />
                        <span className="font-medium">2ème approbation:</span>
                        <span>{demand?.approuve_par_2_nom}</span>
                        {demand?.date_approbation_2 && (
                          <span className="text-gray-500 dark:text-dark-text-muted text-sm ml-auto">
                            le {formatDate(demand.date_approbation_2)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {demand && <ApprovalBadge demand={{ ...demand, statut: editedStatut }} showDetails={true} />}
              </div>

              {/* Historique d'approbation */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-dark-text-muted mb-3">Historique</h3>
                <div className="space-y-3">
                  {/* Soumission */}
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 bg-gray-100 dark:bg-dark-bg-tertiary rounded-full">
                      <Clock className="h-3.5 w-3.5 text-gray-600 dark:text-dark-text-secondary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">Soumission</p>
                      <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                        {demand?.date_soumission ? formatDate(demand.date_soumission, 'dd/MM/yyyy HH:mm') : '-'} par {demand?.demandeur_nom || '-'}
                      </p>
                    </div>
                  </div>

                  {/* Première approbation */}
                  {demand?.approuve_par && (
                    <div className="flex items-start gap-3">
                      <div className="p-1.5 bg-green-100 dark:bg-green-900/30 rounded-full">
                        <CheckCircle className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">{historyApprovalLabel}</p>
                        <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                          {formatDate(demand.date_approbation!, 'dd/MM/yyyy HH:mm')} par {demand.approuve_par_nom}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Deuxième approbation */}
                  {demand?.approuve_par_2 && (
                    <div className="flex items-start gap-3">
                      <div className="p-1.5 bg-green-100 dark:bg-green-900/30 rounded-full">
                        <CheckCircle className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">Deuxième approbation</p>
                        <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                          {formatDate(demand.date_approbation_2!, 'dd/MM/yyyy HH:mm')} par {demand.approuve_par_2_nom}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Refus */}
                  {demand?.statut === 'refuse' && (
                    <div className="flex items-start gap-3">
                      <div className="p-1.5 bg-red-100 dark:bg-red-900/30 rounded-full">
                        <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">Refusé</p>
                        <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                          {formatDate(demand.date_refus!, 'dd/MM/yyyy HH:mm')} par {demand.refuse_par_nom}
                        </p>
                        {demand.motif_refus && (
                          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{demand.motif_refus}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Remboursement */}
                  {demand?.date_remboursement && (
                    <div className="flex items-start gap-3">
                      <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                        <Euro className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">Remboursé</p>
                        <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                          {formatDate(demand.date_remboursement, 'dd/MM/yyyy HH:mm')}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions section - always show, but messages & buttons vary */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-dark-text-muted mb-3">Actions disponibles</h3>

                {/* CAS 1: User is the requester AND demand is pending approval (except super_admin) */}
                {isRequester && demand && demand.statut === 'en_attente_validation' && currentUser && getRole(currentUser) !== 'super_admin' && (
                  <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-700 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-red-800 dark:text-red-400">Vous ne pouvez pas approuver votre propre demande</p>
                        <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                          Pour des raisons de contrôle interne, vous ne pouvez pas approuver vos propres demandes de remboursement.
                          {' '}Un autre utilisateur avec le rôle <strong>admin</strong> ou <strong>validateur</strong> doit l'approuver.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* CAS 2: User doesn't have permission AND demand is pending approval */}
                {!hasApprovalPermission && !isRequester && demand && demand.statut === 'en_attente_validation' && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-200 dark:border-yellow-700 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-400">Autorisation insuffisante</p>
                        <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                          Votre rôle{currentUser && <> <strong>{getRole(currentUser)}</strong></>} ne permet pas d'approuver les demandes de remboursement.
                          {' '}Seuls les utilisateurs <strong>admin</strong> ou <strong>validateur</strong> peuvent effectuer cette action.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* CAS 3: User already approved (waiting for 2nd approval) */}
                {alreadyApproved && isAwaitingSecondApproval && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-blue-800 dark:text-blue-400">Vous avez déjà approuvé cette demande</p>
                        <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                          Vous avez effectué la première approbation. Une deuxième validation par un <strong>autre</strong> utilisateur
                          <strong> admin</strong> ou <strong>validateur</strong> est nécessaire (montant: {formatMontant(demand.montant)}).
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* CAS 4: User CAN approve - First approval needed */}
                {canApprove && demand && isAwaitingFirstApproval && (
                  <div className="bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-700 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-green-800 dark:text-green-400">
                          Vous pouvez approuver cette demande
                        </p>
                        <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                          Cette demande créée par <strong>{demand.demandeur_nom || 'un membre'}</strong> attend votre {needsDoubleApproval ? 'première approbation' : 'approbation'}.
                        </p>
                        {needsDoubleApproval ? (
                          <p className="text-sm text-green-700 dark:text-green-300 mt-2">
                            ⚠️ <strong>Montant élevé</strong> ({formatMontant(demand.montant)}) : une deuxième approbation sera requise après la vôtre.
                          </p>
                        ) : (
                          <p className="text-sm text-green-700 dark:text-green-300 mt-2">
                            ✓ Votre approbation suffit pour valider cette demande (montant: {formatMontant(demand.montant)}).
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* CAS 5: User CAN approve - Second approval needed */}
                {canApprove && isAwaitingSecondApproval && (
                  <div className="bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-700 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-3">
                      <UserCheck className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-green-800 dark:text-green-400">Vous pouvez effectuer la deuxième approbation</p>
                        <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                          ✓ 1ère approbation par <strong>{demand.approuve_par_nom}</strong>
                          {demand.date_approbation && ` le ${formatDate(demand.date_approbation)}`}
                        </p>
                        <p className="text-sm text-green-700 dark:text-green-300 mt-2">
                          Demande créée par <strong>{demand.demandeur_nom || 'un membre'}</strong>.
                          Votre validation finale permettra d'approuver cette demande (montant: {formatMontant(demand.montant)}).
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* CAS 6: Demand is approved - Ready for payment */}
                {demand && demand.statut === 'approuve' && (
                  <div className="bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-700 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-green-800 dark:text-green-400">Demande approuvée - Prête pour le paiement</p>

                        {/* Show approvers */}
                        <div className="mt-2 space-y-1">
                          {demand.approuve_par && (
                            <p className="text-sm text-green-700 dark:text-green-300">
                              ✓ Approuvée par <strong>{demand.approuve_par_nom || demand.approuve_par}</strong>
                              {demand.date_approbation && ` le ${formatDate(demand.date_approbation)}`}
                            </p>
                          )}
                          {demand.approuve_par_2 && (
                            <p className="text-sm text-green-700 dark:text-green-300">
                              ✓ 2e approbation par <strong>{demand.approuve_par_2_nom || demand.approuve_par_2}</strong>
                              {demand.date_approbation_2 && ` le ${formatDate(demand.date_approbation_2)}`}
                            </p>
                          )}
                        </div>

                        <p className="text-sm text-green-700 dark:text-green-300 mt-3">
                          📌 <strong>Prochaine étape:</strong> Liez cette demande à une transaction bancaire pour la marquer comme remboursée.
                        </p>

                        {/* Button to mark as created in bank - visible for admin/superadmin */}
                        {currentUser && (getRole(currentUser) === 'admin' || getRole(currentUser) === 'super_admin') && onUpdate && (
                          <div className="mt-4 pt-3 border-t border-green-200 dark:border-green-600">
                            <button
                              onClick={() => {
                                onUpdate({
                                  statut: 'cree_banque_attente_validation',
                                  status_history: [
                                    ...(demand.status_history || []),
                                    {
                                      old_statut: demand.statut,
                                      new_statut: 'cree_banque_attente_validation',
                                      changed_by: currentUser.id,
                                      changed_by_name: `${getFirstName(currentUser)} ${getLastName(currentUser)}`.trim() || currentUser.email,
                                      changed_at: new Date(),
                                    }
                                  ]
                                } as Partial<DemandeRemboursement>);
                                toast.success('Statut mis à jour: Créé dans banque');
                              }}
                              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
                            >
                              <Building2 className="h-4 w-4" />
                              Marquer créé dans banque
                            </button>
                            <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                              Utilisez ce bouton après avoir créé le paiement dans votre application bancaire.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* CAS 7: Demand is reimbursed (paid) */}
                {demand && demand.statut === 'rembourse' && (
                  <div className="bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-700 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-green-800 dark:text-green-400">✓ Demande remboursée</p>

                        {demand.date_remboursement && (
                          <p className="text-sm text-green-700 dark:text-green-300 mt-2">
                            ✓ Payée le <strong>{formatDate(demand.date_remboursement)}</strong>
                          </p>
                        )}

                        {/* Show linked transactions */}
                        {linkedTransactions && linkedTransactions.length > 0 && (
                          <div className="mt-2">
                            <p className="text-sm text-green-700 dark:text-green-300">
                              💳 Transaction{linkedTransactions.length > 1 ? 's' : ''}:
                            </p>
                            {linkedTransactions.map((tx, idx) => (
                              <p key={idx} className="text-sm text-green-700 dark:text-green-300 ml-4">
                                #{tx.numero_sequence} - {formatMontant(tx.montant)}
                              </p>
                            ))}
                          </div>
                        )}

                        {/* Show approvers */}
                        <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-700">
                          <p className="text-xs text-green-600 dark:text-green-400">
                            Approuvée par <strong>{demand.approuve_par_nom || demand.approuve_par}</strong>
                            {demand.approuve_par_2 && <> + <strong>{demand.approuve_par_2_nom || demand.approuve_par_2}</strong></>}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* CAS 8: Awaiting second approval - For non-approvers */}
                {isAwaitingSecondApproval && !canApprove && !alreadyApproved && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-3">
                      <Users className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-blue-800 dark:text-blue-400">En attente de deuxième approbation</p>
                        <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                          ✓ 1ère approbation par <strong>{demand.approuve_par_nom || demand.approuve_par}</strong>
                          {demand.date_approbation && ` le ${formatDate(demand.date_approbation)}`}
                        </p>
                        <p className="text-sm text-blue-700 dark:text-blue-300 mt-2">
                          Cette demande attend une deuxième validation avant d'être approuvée (montant: {formatMontant(demand.montant)}).
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* CAS 9: Demand is created in bank - awaiting bank validation */}
                {demand && demand.statut === 'cree_banque_attente_validation' && (
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-200 dark:border-indigo-700 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-3">
                      <Building2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-400">Créé dans banque - En attente de validation bancaire</p>

                        {/* Show approvers */}
                        <div className="mt-2 space-y-1">
                          {demand.approuve_par && (
                            <p className="text-sm text-indigo-700 dark:text-indigo-300">
                              ✓ Approuvée par <strong>{demand.approuve_par_nom || demand.approuve_par}</strong>
                              {demand.date_approbation && ` le ${formatDate(demand.date_approbation)}`}
                            </p>
                          )}
                          {demand.approuve_par_2 && (
                            <p className="text-sm text-indigo-700 dark:text-indigo-300">
                              ✓ 2e approbation par <strong>{demand.approuve_par_2_nom || demand.approuve_par_2}</strong>
                              {demand.date_approbation_2 && ` le ${formatDate(demand.date_approbation_2)}`}
                            </p>
                          )}
                        </div>

                        <p className="text-sm text-indigo-700 dark:text-indigo-300 mt-3">
                          🏦 <strong>Action requise:</strong> Ce paiement a été créé dans l'application bancaire et attend une validation. Connectez-vous à votre espace bancaire pour l'approuver.
                        </p>

                        {/* Button to link transaction after bank validation */}
                        {onLinkTransaction && (
                          <div className="mt-4 pt-3 border-t border-indigo-200 dark:border-indigo-600">
                            <button
                              onClick={onLinkTransaction}
                              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
                            >
                              <Link2 className="h-4 w-4" />
                              Lier à une transaction bancaire
                            </button>
                            <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-2">
                              Une fois le paiement validé dans votre banque, liez-le à une transaction pour finaliser.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Approval buttons - grayed out if user can't approve */}
                {demand.statut === 'en_attente_validation' && (
                  <div className="flex gap-3">
                    <button
                      onClick={canApprove ? onApprove : undefined}
                      disabled={!canApprove}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium transition-all shadow-md",
                        canApprove
                          ? "bg-green-600 hover:bg-green-700 text-white cursor-pointer hover:shadow-lg"
                          : "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-dark-text-muted cursor-not-allowed opacity-60"
                      )}
                    >
                      <CheckCircle className="h-5 w-5" />
                      Approuver
                    </button>
                    <button
                      onClick={canApprove ? () => setShowRejectModal(true) : undefined}
                      disabled={!canApprove}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium transition-all shadow-md",
                        canApprove
                          ? "bg-red-600 hover:bg-red-700 text-white cursor-pointer hover:shadow-lg"
                          : "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-dark-text-muted cursor-not-allowed opacity-60"
                      )}
                    >
                      <XCircle className="h-5 w-5" />
                      Refuser
                    </button>
                  </div>
                )}

                {/* Send confirmation email button */}
                {demand && demand.statut === 'en_attente_validation' && (
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-dark-border">
                    {confirmationEmailSent ? (
                      <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                        <CheckCircle className="h-4 w-4" />
                        <span>Email de confirmation envoyé</span>
                        {demand?.confirmation_email_sent_at && (
                          <span className="text-gray-500 dark:text-dark-text-muted">
                            le {formatDate(demand.confirmation_email_sent_at)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={handleSendConfirmationEmail}
                        disabled={isSendingEmail}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSendingEmail ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Envoi en cours...
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4" />
                            Envoyer l'email de confirmation
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/50"
          style={{ zIndex: modalBackdropZIndex }}
        >
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-gray-900 dark:text-dark-text-primary mb-4">Refuser la demande</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Motif du refus..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg resize-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              rows={4}
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectReason('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleReject}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Preview Panel - Left Side */}
      {selectedDocument && (
        <div
          className="fixed left-0 top-0 h-full w-1/2 bg-white dark:bg-dark-bg-secondary shadow-xl border-r border-gray-200 dark:border-dark-border flex flex-col"
          style={{ zIndex: modalBackdropZIndex }}
        >
          {/* Header with editable name */}
          <div className="bg-gray-50 dark:bg-dark-bg-tertiary border-b border-gray-200 dark:border-dark-border px-6 py-4 flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3 flex-1">
                <FileText className="h-6 w-6 text-purple-600" />
                {!isEditingDocName ? (
                  <button
                    onClick={() => {
                      setIsEditingDocName(true);
                      setEditedDocName(selectedDocument.nom_affichage);
                    }}
                    className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary hover:text-purple-600 transition-colors flex items-center gap-2 group"
                  >
                    <span>{selectedDocument.nom_affichage}</span>
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
                      className="flex-1 px-3 py-2 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveDocumentName}
                      className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
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
                  setSelectedDocument(null);
                  setIsEditingDocName(false);
                }}
                className="p-2 hover:bg-gray-200 rounded-lg transition-colors ml-4"
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
              // Détection du type de fichier: priorité au MIME type, puis extension
              let isImage = false;
              let isPdf = false;

              // Vérifier d'abord le MIME type (plus fiable)
              if (selectedDocument.type) {
                isPdf = selectedDocument.type === 'application/pdf';
                isImage = selectedDocument.type.startsWith('image/');
              } else {
                // Fallback: détection depuis le nom OU depuis l'URL
                let fileExt = selectedDocument.nom_affichage.split('.').pop()?.toLowerCase() || '';

                // Si pas d'extension dans le nom, essayer de détecter depuis l'URL
                if (!fileExt || fileExt === selectedDocument.nom_affichage.toLowerCase()) {
                  // Extraire le nom du fichier depuis l'URL Firebase Storage
                  const urlParts = selectedDocument.url.split('?')[0]; // Enlever les query params
                  const matches = urlParts.match(/justificatifs%2F([^?]+)/);
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

                isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt);
                isPdf = fileExt === 'pdf';
              }

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
                        const parent = target.parentElement;
                        if (parent) {
                          parent.innerHTML = '<div class="flex items-center justify-center h-64 text-gray-400 dark:text-dark-text-muted"><p>Erreur de chargement de l\'image</p></div>';
                        }
                      }}
                    />
                    <div className="flex items-center gap-3">
                      <a
                        href={selectedDocument.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors flex items-center gap-2"
                      >
                        <Eye className="h-4 w-4" />
                        Ouvrir dans un nouvel onglet
                      </a>
                      <button
                        onClick={async () => {
                          if (!demand) return;

                          // Vérifier si le renommage automatique est activé
                          if (downloadSettings?.autoRenameFiles) {
                            try {
                              const docIndex = documents.findIndex(d => d.url === selectedDocument.url);
                              const newFilename = generateFormattedFilename(
                                demand,
                                linkedTransactions,
                                selectedDocument.nom_affichage,
                                docIndex,
                                downloadSettings.useTransactionNumber,
                                downloadSettings.filenamePattern
                              );
                              await downloadRenamedFile(selectedDocument.url, newFilename);
                              toast.success(`Téléchargé: ${newFilename}`);
                            } catch (error) {
                              logger.error('Erreur téléchargement:', error);
                              toast.error('Erreur lors du téléchargement');
                            }
                          } else {
                            // Téléchargement classique sans renommage
                            const a = document.createElement('a');
                            a.href = selectedDocument.url;
                            a.download = selectedDocument.nom_affichage;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                          }
                        }}
                        className="px-4 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-primary rounded hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary transition-colors flex items-center gap-2"
                      >
                        <Download className="h-4 w-4" />
                        Télécharger
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Voulez-vous vraiment supprimer ce document ?')) {
                            handleDeleteDocument(selectedDocument.url);
                          }
                        }}
                        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors flex items-center gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        Supprimer
                      </button>
                    </div>
                  </div>
                );
              } else if (isPdf) {
                return (
                  <div className="space-y-4">
                    <iframe
                      src={selectedDocument.url}
                      className="w-full rounded border border-gray-300 dark:border-dark-border"
                      style={{ height: 'calc(100vh - 240px)' }}
                      title="Prévisualisation PDF"
                    />
                    <div className="flex items-center gap-3">
                      <a
                        href={selectedDocument.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors flex items-center gap-2"
                      >
                        <Eye className="h-4 w-4" />
                        Ouvrir dans un nouvel onglet
                      </a>
                      <button
                        onClick={async () => {
                          if (!demand) return;

                          // Vérifier si le renommage automatique est activé
                          if (downloadSettings?.autoRenameFiles) {
                            try {
                              const docIndex = documents.findIndex(d => d.url === selectedDocument.url);
                              const newFilename = generateFormattedFilename(
                                demand,
                                linkedTransactions,
                                selectedDocument.nom_affichage,
                                docIndex,
                                downloadSettings.useTransactionNumber,
                                downloadSettings.filenamePattern
                              );
                              await downloadRenamedFile(selectedDocument.url, newFilename);
                              toast.success(`Téléchargé: ${newFilename}`);
                            } catch (error) {
                              logger.error('Erreur téléchargement:', error);
                              toast.error('Erreur lors du téléchargement');
                            }
                          } else {
                            // Téléchargement classique sans renommage
                            const a = document.createElement('a');
                            a.href = selectedDocument.url;
                            a.download = selectedDocument.nom_affichage;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                          }
                        }}
                        className="px-4 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-primary rounded hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary transition-colors flex items-center gap-2"
                      >
                        <Download className="h-4 w-4" />
                        Télécharger
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Voulez-vous vraiment supprimer ce document ?')) {
                            handleDeleteDocument(selectedDocument.url);
                          }
                        }}
                        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors flex items-center gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        Supprimer
                      </button>
                    </div>
                  </div>
                );
              } else {
                return (
                  <div className="flex flex-col items-center justify-center h-64 space-y-4">
                    <FileText className="h-16 w-16 text-gray-400 dark:text-dark-text-muted" />
                    <p className="text-gray-600 dark:text-dark-text-secondary">Prévisualisation non disponible pour ce type de fichier</p>
                    <div className="flex items-center gap-3">
                      <a
                        href={selectedDocument.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors flex items-center gap-2"
                      >
                        <Eye className="h-4 w-4" />
                        Ouvrir
                      </a>
                      <button
                        onClick={async () => {
                          if (!demand) return;

                          // Vérifier si le renommage automatique est activé
                          if (downloadSettings?.autoRenameFiles) {
                            try {
                              const docIndex = documents.findIndex(d => d.url === selectedDocument.url);
                              const newFilename = generateFormattedFilename(
                                demand,
                                linkedTransactions,
                                selectedDocument.nom_affichage,
                                docIndex,
                                downloadSettings.useTransactionNumber,
                                downloadSettings.filenamePattern
                              );
                              await downloadRenamedFile(selectedDocument.url, newFilename);
                              toast.success(`Téléchargé: ${newFilename}`);
                            } catch (error) {
                              logger.error('Erreur téléchargement:', error);
                              toast.error('Erreur lors du téléchargement');
                            }
                          } else {
                            // Téléchargement classique sans renommage
                            const a = document.createElement('a');
                            a.href = selectedDocument.url;
                            a.download = selectedDocument.nom_affichage;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                          }
                        }}
                        className="px-4 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-primary rounded hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary transition-colors flex items-center gap-2"
                      >
                        <Download className="h-4 w-4" />
                        Télécharger
                      </button>
                    </div>
                  </div>
                );
              }
            })()}
          </div>
        </div>
      )}

      {/* Preview Panel for Pending Files (Create Mode) */}
      {selectedPendingFileIndex !== null && pendingFiles[selectedPendingFileIndex] && (
        <div className="fixed left-0 top-0 h-full w-1/2 bg-white dark:bg-dark-bg-secondary shadow-xl z-[60] border-r border-gray-200 dark:border-dark-border flex flex-col">
          {/* Header */}
          <div className="bg-gray-50 dark:bg-dark-bg-tertiary border-b border-gray-200 dark:border-dark-border px-6 py-4 flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3 flex-1">
                <FileText className="h-6 w-6 text-purple-600" />
                <span className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                  {pendingFiles[selectedPendingFileIndex].name}
                </span>
              </div>
              <button
                onClick={() => setSelectedPendingFileIndex(null)}
                className="p-2 hover:bg-gray-200 rounded-lg transition-colors ml-4"
              >
                <X className="h-5 w-5 text-gray-500 dark:text-dark-text-muted" />
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-dark-text-muted">
              Taille: {pendingFiles[selectedPendingFileIndex].size < 1024
                ? `${pendingFiles[selectedPendingFileIndex].size} B`
                : pendingFiles[selectedPendingFileIndex].size < 1024 * 1024
                  ? `${(pendingFiles[selectedPendingFileIndex].size / 1024).toFixed(1)} Ko`
                  : `${(pendingFiles[selectedPendingFileIndex].size / (1024 * 1024)).toFixed(1)} Mo`}
            </p>
          </div>

          {/* Document Content */}
          <div className="flex-1 overflow-auto p-4">
            {(() => {
              const file = pendingFiles[selectedPendingFileIndex];
              const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
              const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt);
              const isPdf = fileExt === 'pdf';
              const previewUrl = pendingFilePreviewUrls.get(selectedPendingFileIndex) || URL.createObjectURL(file);

              if (isImage) {
                return (
                  <div className="space-y-4">
                    <img
                      src={previewUrl}
                      alt={file.name}
                      className="w-full h-auto rounded border border-gray-300 dark:border-dark-border"
                    />
                    <div className="flex items-center gap-3">
                      <a
                        href={previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors flex items-center gap-2"
                      >
                        <Eye className="h-4 w-4" />
                        Ouvrir dans un nouvel onglet
                      </a>
                      <button
                        onClick={() => {
                          if (confirm('Voulez-vous vraiment supprimer ce document ?')) {
                            handleRemovePendingFile(selectedPendingFileIndex);
                            setSelectedPendingFileIndex(null);
                          }
                        }}
                        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors flex items-center gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        Supprimer
                      </button>
                    </div>
                  </div>
                );
              } else if (isPdf) {
                return (
                  <div className="space-y-4">
                    <iframe
                      src={previewUrl}
                      className="w-full rounded border border-gray-300 dark:border-dark-border"
                      style={{ height: 'calc(100vh - 240px)' }}
                      title="Prévisualisation PDF"
                    />
                    <div className="flex items-center gap-3">
                      <a
                        href={previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors flex items-center gap-2"
                      >
                        <Eye className="h-4 w-4" />
                        Ouvrir dans un nouvel onglet
                      </a>
                      <button
                        onClick={() => {
                          if (confirm('Voulez-vous vraiment supprimer ce document ?')) {
                            handleRemovePendingFile(selectedPendingFileIndex);
                            setSelectedPendingFileIndex(null);
                          }
                        }}
                        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors flex items-center gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        Supprimer
                      </button>
                    </div>
                  </div>
                );
              } else {
                return (
                  <div className="flex items-center justify-center h-64 text-gray-400 dark:text-dark-text-muted">
                    <p>Aperçu non disponible pour ce type de fichier</p>
                  </div>
                );
              }
            })()}
          </div>
        </div>
      )}

      {/* Modal for montant modification with justification */}
      {showMontantEditModal && pendingMontantChange && (
        <MontantEditModal
          isOpen={showMontantEditModal}
          onClose={handleMontantChangeCancel}
          onConfirm={handleMontantChangeConfirm}
          oldMontant={pendingMontantChange.oldMontant}
          newMontant={pendingMontantChange.newMontant}
        />
      )}

      {/* Communication Modal (SMS/WhatsApp/Email) */}
      {showSMSModal && demand && clubId && (
        <CommunicationModal
          isOpen={showSMSModal}
          onClose={() => setShowSMSModal(false)}
          context={{
            type: 'demandes',
            nom: `${demand.demandeur_prenom || ''} ${demand.demandeur_nom || ''}`.trim() || 'Inconnu',
            date: (() => {
              // Probeer meerdere datumvelden: date_depense > date_soumission > date_demande > vandaag
              const dateToUse = demand.date_depense || demand.date_soumission || demand.date_demande;
              if (dateToUse) {
                const formatted = formatDate(dateToUse);
                if (formatted !== 'Date invalide' && formatted !== 'Date non disponible') {
                  return formatted;
                }
              }
              return formatDate(new Date());
            })(),
            montant: demand.montant,
            reference: demand.id.slice(-6).toUpperCase(),
            description: demand.description || demand.titre || '',
          } as SMSContextData}
          membres={membres}
          clubId={clubId}
          onSuccess={() => {
            setShowSMSModal(false);
          }}
        />
      )}

      {/* Modal d'avertissement pour brouillon */}
      {showBrouillonWarningModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center"
          style={{ zIndex: modalBackdropZIndex }}
        >
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
                  <AlertCircle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                    Demande en brouillon
                  </h3>
                  <p className="mt-2 text-sm text-gray-600 dark:text-dark-text-secondary">
                    Cette demande est toujours en brouillon. Voulez-vous la mettre en attente de validation ?
                  </p>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 dark:bg-dark-bg-tertiary flex flex-col gap-2">
              <button
                onClick={handleSubmitBrouillon}
                className="w-full px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors"
              >
                Mettre en attente de validation
              </button>
              <button
                onClick={() => {
                  setShowBrouillonWarningModal(false);
                  onClose();
                }}
                className="w-full px-4 py-2.5 bg-gray-200 dark:bg-dark-bg-secondary hover:bg-gray-300 dark:hover:bg-dark-border text-gray-700 dark:text-dark-text-primary rounded-lg font-medium transition-colors"
              >
                Garder en brouillon
              </button>
              <button
                onClick={() => setShowBrouillonWarningModal(false)}
                className="w-full px-4 py-2.5 text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:text-dark-text-primary dark:hover:text-dark-text-secondary font-medium transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
