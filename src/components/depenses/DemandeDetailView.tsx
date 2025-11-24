import React, { useState, useRef, useMemo, useEffect } from 'react';
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
  Tag
} from 'lucide-react';
import { DemandeRemboursement, TransactionBancaire, ClubSettings, Membre, DocumentJustificatif, Evenement } from '@/types';
import { formatMontant, formatDate, cn } from '@/utils/utils';
import { ApprovalBadge } from './ApprovalBadge';
import { CategorizationService } from '@/services/categorizationService';
import { CategoryAccountSelector } from '@/components/banque/CategoryAccountSelector';
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
import { ExpenseReportModal } from './ExpenseReportModal';

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
  console.log('🔽 [DOWNLOAD] Tentative de téléchargement:', newFilename);
  console.log('🔗 [DOWNLOAD] URL:', url);

  try {
    // Extraire le chemin du fichier depuis l'URL Firebase Storage
    const urlObj = new URL(url);

    // Le chemin est après /o/ et avant le ? (ou jusqu'à la fin si pas de ?)
    const pathMatch = urlObj.pathname.match(/\/o\/(.+)$/);

    if (!pathMatch) {
      throw new Error('Impossible d\'extraire le chemin du fichier');
    }

    const filePath = decodeURIComponent(pathMatch[1]);
    console.log('📁 [DOWNLOAD] Chemin du fichier:', filePath);

    // Télécharger le blob via Firebase Storage SDK
    const storage = getStorage();
    const fileRef = storageRef(storage, filePath);

    console.log('⬇️ [DOWNLOAD] Téléchargement du blob...');
    const blob = await getBlob(fileRef);
    console.log('✅ [DOWNLOAD] Blob téléchargé:', blob.size, 'bytes');

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

    console.log('💾 [DOWNLOAD] Téléchargement déclenché');

    // Libérer la mémoire après un court délai
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
      console.log('🧹 [DOWNLOAD] Object URL libéré');
    }, 100);

  } catch (error) {
    console.error('❌ [DOWNLOAD] Erreur:', error);
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
  onCreate?: (newDemand: Partial<DemandeRemboursement>, files?: File[]) => Promise<string>; // NEW: Returns demandeId for auto-linking
  onAnalyzeWithAI?: (files: File[]) => Promise<Partial<DemandeRemboursement> | null>; // NEW: For AI analysis
  onRefreshTransactions?: () => Promise<void>; // NEW: Reload transactions after auto-linking
  fromTransactionId?: string; // ID of the transaction we came from (for back navigation)
  navigationPosition?: { current: number; total: number } | null; // NEW: Keyboard navigation position (X van Y)
  onNavigatePrevious?: () => void; // NEW: Navigate to previous demand
  onNavigateNext?: () => void; // NEW: Navigate to next demand
}

// Helper function to get documents with backward compatibility
function getDocuments(demand: DemandeRemboursement): DocumentJustificatif[] {
  // New format: use documents_justificatifs if available
  if (demand.documents_justificatifs && demand.documents_justificatifs.length > 0) {
    return demand.documents_justificatifs;
  }

  // Legacy format: convert urls_justificatifs to DocumentJustificatif objects
  if (demand.urls_justificatifs && demand.urls_justificatifs.length > 0) {
    return demand.urls_justificatifs.map((url, index) => {
      // Détection du type de fichier depuis l'URL
      let type = 'application/octet-stream'; // Type par défaut
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

      return {
        url,
        nom_original: `Document ${index + 1}`,
        nom_affichage: `Document ${index + 1}`,
        type,
        taille: 0,
        date_upload: demand.created_at || new Date(),
      };
    });
  }

  return [];
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
  onCreate,
  onAnalyzeWithAI,
  onRefreshTransactions,
  fromTransactionId,
  navigationPosition,
  onNavigatePrevious,
  onNavigateNext
}: DemandeDetailViewProps) {
  const { hasPermission, clubId, user, appUser } = useAuth();
  const navigate = useNavigate();

  // Find linked operation from evenements prop
  const linkedOperation = evenements?.find(evt => evt.id === demand?.evenement_id) || null;

  // Debug logging for membres prop
  useEffect(() => {
    console.log('👥 DemandeDetailView - membres prop:', membres?.length || 0, 'members');
    if (membres && membres.length > 0) {
      console.log('👥 First member:', membres[0]);
    }
  }, [membres]);

  // Helper function to get member display name
  const getMemberDisplayName = (membre: Membre): string => {
    // Try prenom + nom first
    if (membre.prenom && membre.nom) {
      return `${membre.prenom} ${membre.nom}`;
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
  const [editedMontant, setEditedMontant] = useState(demand?.montant.toString() || '0');
  const [editedDescription, setEditedDescription] = useState(demand?.description || '');
  const [editedCommentaire, setEditedCommentaire] = useState(demand?.titre || '');
  const [editedCategorie, setEditedCategorie] = useState(demand?.categorie || '');
  const [editedCodeComptable, setEditedCodeComptable] = useState(demand?.code_comptable || '');
  const [editedDateDepense, setEditedDateDepense] = useState(() => {
    if (!demand?.date_depense) return new Date().toISOString().split('T')[0];

    const date = new Date(demand.date_depense);
    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.warn('⚠️ Invalid date_depense:', demand.date_depense, '- using today');
      return new Date().toISOString().split('T')[0];
    }

    return date.toISOString().split('T')[0];
  });

  // State pour le modal de création de note de frais
  const [showExpenseReportModal, setShowExpenseReportModal] = useState(false);

  // Reset form fields when demand changes or when entering create mode
  useEffect(() => {
    if (isCreateMode) {
      // Reset to empty values for create mode
      setEditedMontant('0');
      setEditedDescription('');
      setEditedCommentaire('');
      setEditedCategorie('');
      setEditedCodeComptable('');
      setEditedDateDepense(new Date().toISOString().split('T')[0]);
      setEditedStatut('en_attente_validation');
    } else if (demand) {
      // Load values from demand in edit mode
      setEditedMontant(demand.montant.toString());
      setEditedDescription(demand.description || '');
      setEditedCommentaire(demand.titre || '');
      setEditedCategorie(demand.categorie || '');
      setEditedCodeComptable(demand.code_comptable || '');
      setEditedStatut(demand.statut || 'en_attente_validation');

      // Safe date handling
      if (demand.date_depense) {
        const date = new Date(demand.date_depense);
        if (isNaN(date.getTime())) {
          console.warn('⚠️ Invalid date_depense in useEffect:', demand.date_depense, '- using today');
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
        const montant = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : value;
        if (isNaN(montant) || montant <= 0) {
          toast.error('Le montant doit être un nombre valide supérieur à 0');
          return;
        }
        value = montant;
      } else if (field === 'description' && (!value || !value.trim())) {
        toast.error('La description est obligatoire');
        return;
      } else if (field === 'date_depense') {
        value = new Date(value);
      }

      // Save to Firestore
      await onUpdate({ [field]: value });

      // Success feedback
      toast.success('✓ Sauvegardé', {
        duration: 1500,
        position: 'bottom-right'
      });
    } catch (error) {
      console.error(`Error saving ${field}:`, error);
      toast.error('Erreur lors de la sauvegarde');
    }
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
      console.error('Error saving demandeur:', error);
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  // NEW: Additional fields for creation mode
  const [editedFournisseur, setEditedFournisseur] = useState(demand?.fournisseur || '');
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
        console.error('Erreur chargement settings téléchargement:', error);
      }
    };

    loadDownloadSettings();
  }, [clubId]);

  if (!isOpen) return null;

  // Permission check using PermissionService (not legacy can_approve_expenses field)
  const hasApprovalPermission = currentUser ? PermissionService.hasPermission(currentUser, 'demands.approve') : false;
  const isRequester = currentUser?.id === demand?.demandeur_id;
  const alreadyApproved = demand?.approuve_par === currentUser?.id;

  const canApprove = !isCreateMode &&
                     hasApprovalPermission &&
                     !isRequester &&
                     !alreadyApproved;

  const needsDoubleApproval = !isCreateMode && demand &&
                               SettingsService.requiresDoubleApproval(demand.montant);

  const isAwaitingSecondApproval = demand?.statut === 'en_attente_validation';
  const hasFirstApproval = !!demand?.approuve_par;

  const handleReject = () => {
    if (rejectReason.trim() && onReject) {
      onReject(rejectReason);
      setShowRejectModal(false);
      setRejectReason('');
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
        if (result.montant) setEditedMontant(result.montant.toString());
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
      console.error('AI analysis error:', error);
      alert('Erreur lors de l\'analyse IA');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveEdit = async () => {
    // Prevent double submission
    if (isSaving) {
      console.log('⚠️ Déjà en train de sauvegarder, ignoring click');
      return;
    }

    // Validation - Support both comma and period as decimal separator
    const montant = parseFloat(editedMontant.replace(',', '.'));

    // REMOVED VALIDATION BLOCKS - Allow creation with montant = 0 and empty description
    // The user can edit these fields after creation

    // Update the display state with the parsed value to prevent display issues
    if (!isNaN(montant)) {
      setEditedMontant(montant.toString());
    }

    setIsSaving(true);

    try {
      if (isCreateMode && onCreate) {
      // Creation mode
      const newDemand: Partial<DemandeRemboursement> = {
        montant,
        description: editedDescription,
        titre: editedCommentaire,
        categorie: editedCategorie,
        code_comptable: editedCodeComptable,
        date_depense: new Date(editedDateDepense),
        fournisseur: editedFournisseur,
        demandeur_id: showOtherDemandeur ? undefined : editedDemandeurId,
        demandeur_nom: showOtherDemandeur ? editedDemandeurNom : undefined,
        evenement_id: editedEvenementId || undefined
      };

      // Create the demand and get the ID
      console.log('🔍 DEBUG onCreate avant appel');
      const createdDemandeId = await onCreate(newDemand, pendingFiles);
      console.log('🔍 DEBUG onCreate après appel, ID reçu:', createdDemandeId);
      console.log('🔍 DEBUG foundTransactionId:', foundTransactionId);
      console.log('🔍 DEBUG clubId:', clubId);

      // 🔗 Auto-link transaction if found during file analysis
      if (foundTransactionId && clubId && createdDemandeId) {
        try {
          console.log(`🔗 Linking dépense ${createdDemandeId} to transaction ${foundTransactionId}`);
          await autoLinkExpenseToTransaction(
            createdDemandeId,
            editedDescription,
            foundTransactionId,
            clubId
          );
          console.log('✅ Auto-linking complété avec succès!');
          toast.success('✅ Dépense créée et transaction liée automatiquement!', {
            icon: '🔗',
            duration: 5000
          });

          // Don't close modal - let user see the result and close manually
        } catch (linkError) {
          console.error('❌ Erreur lors de la liaison automatique:', linkError);
          // Non-bloquant - la dépense est déjà créée
          toast.error('Dépense créée mais liaison échouée');
        }
      } else {
        console.log('⚠️ DEBUG Auto-linking skipped:', {
          foundTransactionId,
          clubId,
          createdDemandeId
        });
      }

      // Don't auto-close - let user close manually
      // onClose();
    } else if (onUpdate) {
      // Edit mode - Filter out undefined values for Firestore
      const updates: any = {
        montant,
        description: editedDescription,
        titre: editedCommentaire,
        categorie: editedCategorie,
        code_comptable: editedCodeComptable,
        date_depense: new Date(editedDateDepense),
        fournisseur: editedFournisseur,
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

      // No need to set editing state in edit mode - auto-save is always active
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
      setEditedMontant(demand.montant.toString());
      setEditedDescription(demand.description);
      setEditedCommentaire(demand.titre || '');
      setEditedCategorie(demand.categorie || '');
      setEditedCodeComptable(demand.code_comptable || '');
      setEditedFournisseur(demand.fournisseur || '');
      setEditedDemandeurId(demand.demandeur_id || '');
      setEditedDemandeurNom(demand.demandeur_nom || '');
      setEditedEvenementId(demand.evenement_id || '');
      setEditedDateDepense(
        demand.date_depense ? new Date(demand.date_depense).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
      );
    }
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
        console.log(`🔍 Analyse automatique du fichier: ${file.name}`);

        // STEP 1: Extract sequence from filename
        const sequence = extractSequenceFromFilename(file.name);
        let transactionFound = false;
        let foundTransaction: TransactionBancaire | null = null;

        if (sequence && clubId) {
          console.log(`✅ Numéro de séquence détecté: ${sequence}`);
          foundTransaction = await findTransactionBySequence(sequence, clubId);

          if (foundTransaction) {
            transactionFound = true;
            console.log(`✅ Transaction trouvée! Montant: ${foundTransaction.montant}€`);

            // 🔗 Opslaan transaction ID voor automatische linking na creatie
            setFoundTransactionId(foundTransaction.id);

            toast.success(`Transaction ${sequence} trouvée automatiquement!`, {
              icon: '🔗',
              duration: 4000
            });

            // Pre-fill expense data from transaction
            setEditedMontant(Math.abs(foundTransaction.montant).toString());

            // Use transaction date if no date in filename
            if (foundTransaction.date_execution) {
              // Handle both Date objects and Firestore Timestamps
              const transactionDate = foundTransaction.date_execution instanceof Date
                ? foundTransaction.date_execution
                : foundTransaction.date_execution.toDate();

              const dateStr = transactionDate.toISOString().split('T')[0];
              setEditedDateDepense(dateStr);
              console.log(`📅 Date de la transaction utilisée: ${transactionDate.toLocaleDateString('fr-FR')}`);
            }

            // Use counterparty name as fournisseur if available
            if (foundTransaction.contrepartie_nom && !editedFournisseur) {
              setEditedFournisseur(foundTransaction.contrepartie_nom);
              console.log(`🏢 Contrepartie utilisée comme fournisseur: ${foundTransaction.contrepartie_nom}`);
            }
          } else {
            console.log(`⚠️ Aucune transaction trouvée pour ${sequence}`);
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
          console.log(`📝 Description extraite du fichier: ${fileDescription}`);
        }

        // STEP 3: Extract date from filename
        const extractedDate = extractDateFromFilename(file.name);
        if (extractedDate) {
          const dateStr = extractedDate.toISOString().split('T')[0];
          setEditedDateDepense(dateStr);
          console.log(`📅 Date extraite: ${extractedDate.toLocaleDateString('fr-FR')}`);
        }

        // STEP 4: Optional AI analysis (if configured and enabled)
        if (aiDocumentService.isAIAvailable() && onAnalyzeWithAI) {
          console.log('🤖 Analyse IA disponible, lancement de l\'analyse approfondie...');
          const aiResult = await aiDocumentService.analyzeDocument(file, {
            clubId,
            useAI: true
          });

          if (aiResult.status === 'completed') {
            // Apply AI results (will override basic extraction)
            if (aiResult.montant && aiResult.montant > 0) {
              setEditedMontant(aiResult.montant.toString());
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

        // 🚀 AUTO-CREATE: Always create expense immediately after file upload
        if (isCreateMode && onCreate) {
          console.log('🚀 Création automatique de la dépense...');

          // Wait for all state updates to complete
          await new Promise(resolve => setTimeout(resolve, 800));

          try {
            // Prepare expense data with defaults for missing fields
            let expenseDate: Date;
            let expenseMontant: number;
            let expenseFournisseur: string;

            if (foundTransaction) {
              // Use transaction data if found
              expenseDate = foundTransaction.date_execution
                ? (foundTransaction.date_execution instanceof Date
                    ? foundTransaction.date_execution
                    : foundTransaction.date_execution.toDate())
                : new Date();
              expenseMontant = Math.abs(foundTransaction.montant);
              expenseFournisseur = foundTransaction.contrepartie_nom || '';
            } else {
              // Use extracted/default data if no transaction found
              // Safe date handling: validate extractedDate
              if (extractedDate && extractedDate instanceof Date && !isNaN(extractedDate.getTime())) {
                expenseDate = extractedDate;
              } else {
                expenseDate = new Date();
              }
              expenseMontant = parseFloat(editedMontant) || 0;
              expenseFournisseur = editedFournisseur || '';
            }

            const autoCreatedDemand: Partial<DemandeRemboursement> = {
              description: editedDescription || fileDescription || 'xxxxx',
              montant: expenseMontant,
              date_depense: expenseDate,
              fournisseur: expenseFournisseur,
              demandeur_id: user?.uid,
              demandeur_nom: user?.displayName || user?.email || 'Utilisateur',
              categorie: editedCategorie || undefined,
              code_comptable: editedCodeComptable || undefined,
              evenement_id: editedEvenementId || undefined
            };

            console.log('📋 Création automatique avec:', autoCreatedDemand);

            const createdId = await onCreate(autoCreatedDemand, newFiles);

            // Auto-link transaction if found
            if (createdId && foundTransaction && foundTransaction.id && clubId) {
              console.log(`🔗 Auto-linking dépense ${createdId} to transaction ${foundTransaction.id}`);
              await autoLinkExpenseToTransaction(
                createdId,
                autoCreatedDemand.description || 'Dépense',
                foundTransaction.id,
                clubId
              );

              // Refresh transactions to show the linked transaction
              if (onRefreshTransactions) {
                console.log('🔄 Reloading transactions after auto-linking...');
                await onRefreshTransactions();
              }

              toast.success('✅ Dépense créée et liée automatiquement!', {
                icon: '🚀',
                duration: 5000
              });
            } else {
              // No transaction found, but expense still created
              toast.success('✅ Dépense créée! Vous pouvez maintenant la modifier.', {
                icon: '📄',
                duration: 4000
              });
            }

            // Close modal and trigger reload to reopen in edit mode
            onClose();
          } catch (createError) {
            console.error('❌ Erreur lors de la création automatique:', createError);
            toast.error('Erreur lors de la création automatique');
          }
        }

      } catch (error) {
        console.error('❌ Erreur lors de l\'analyse:', error);
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
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />
      
      {/* Panel - Right side */}
      <div className={cn(
        "fixed right-0 top-0 h-full bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300",
        isOpen ? "translate-x-0" : "translate-x-full",
        "w-full max-w-3xl"
      )}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border bg-gradient-to-r from-orange-600 to-orange-700">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <button
                  onClick={() => {
                    if (fromTransactionId) {
                      navigate('/transactions', { state: { fromTransactionId } });
                    } else {
                      navigate(-1);
                    }
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-white/10 hover:bg-white dark:bg-dark-bg-secondary/20 text-white rounded-lg transition-colors text-sm font-medium"
                  title="Retour à la page précédente"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Retour
                </button>
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
              onClick={onClose}
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

            {/* Create mode buttons - in header (auto-save mode for edit) */}
            {isCreateMode && onCreate && (
              <button
                onClick={handleSaveEdit}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Création en cours...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    Créer la dépense
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Status Bar */}
        {!isCreateMode && demand && (
          <div className="px-6 py-3 bg-gray-50 dark:bg-dark-bg-tertiary border-b border-gray-200 dark:border-dark-border">
            <ApprovalBadge demand={demand} showDetails={true} />
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-secondary">
          <nav className="flex -mb-px px-6 overflow-x-auto">
            {[
              { id: 'overview', label: 'Vue d\'ensemble', icon: FileText, showInCreate: true },
              { id: 'liaisons', label: `Liaisons (${linkedTransactions.length})`, icon: Link2, showInCreate: true, hideForUser: true },
              { id: 'approval', label: 'Approbation', icon: UserCheck, showInCreate: true },
              { id: 'documents', label: `Documents (${isCreateMode ? pendingFiles.length : documents.length})`, icon: Upload, showInCreate: true }
            ]
              .filter(tab => !isCreateMode || tab.showInCreate)
              .filter(tab => !(tab.hideForUser && appUser?.role === 'user'))
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
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
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
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4">
                    <p className="text-sm text-gray-600 dark:text-dark-text-secondary mb-1 flex items-center gap-1">
                      <Euro className="h-3.5 w-3.5" />
                      Montant
                    </p>
                    <input
                      type="text"
                      value={editedMontant}
                      onChange={(e) => setEditedMontant(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onBlur={() => handleFieldSave('montant', editedMontant)}
                      className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary bg-white dark:bg-dark-bg-secondary border border-gray-300 dark:border-dark-border rounded px-2 py-1 w-full"
                      placeholder="0.00"
                    />
                    {needsDoubleApproval && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-orange-600">
                        <Shield className="h-3.5 w-3.5" />
                        <span>Double approbation requise</span>
                      </div>
                    )}
                  </div>
                  <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4">
                    <p className="text-sm text-gray-600 dark:text-dark-text-secondary mb-1 flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      Date de la dépense
                    </p>
                    <input
                      type="date"
                      value={editedDateDepense}
                      onChange={(e) => setEditedDateDepense(e.target.value)}
                      onBlur={() => handleFieldSave('date_depense', editedDateDepense)}
                      className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary bg-white dark:bg-dark-bg-secondary border border-gray-300 dark:border-dark-border rounded px-2 py-1 w-full"
                    />
                  </div>
                </div>
              </div>

              {/* NEW: Fournisseur field */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-dark-text-muted mb-2 flex items-center gap-1">
                  🏢 Fournisseur
                </h3>
                <input
                  type="text"
                  value={editedFournisseur}
                  onChange={(e) => setEditedFournisseur(e.target.value)}
                  onBlur={() => handleFieldSave('fournisseur', editedFournisseur)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="Nom du fournisseur..."
                />
              </div>


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
                      .filter(m => m.status === 'active')
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
                      className="px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:bg-dark-bg-tertiary text-sm"
                    >
                      Revenir à la liste
                    </button>
                  </div>
                )}
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
                              onClose(); // Close modal first
                              setTimeout(() => {
                                navigate('/operations', {
                                  state: {
                                    selectedEventId: demand.evenement_id,
                                    fromExpense: true
                                  }
                                });
                              }, 100);
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

              {/* Catégorie et Code comptable */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-dark-text-muted mb-2 flex items-center gap-1">
                  <Tag className="h-3.5 w-3.5" />
                  Catégorie et Code comptable
                </h3>
                <CategoryAccountSelector
                  isExpense={true}
                  selectedCategory={editedCategorie}
                  selectedAccountCode={editedCodeComptable}
                  clubId={clubId}
                  counterpartyName={demand?.description || ''}
                  onCategoryChange={(cat) => {
                    setEditedCategorie(cat);
                    if (!isCreateMode) handleFieldSave('categorie', cat);
                  }}
                  onAccountCodeChange={(code) => {
                    setEditedCodeComptable(code);
                    if (!isCreateMode) handleFieldSave('code_comptable', code);
                  }}
                />
              </div>

              {/* Statut */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-dark-text-muted mb-2 flex items-center gap-1">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Statut
                </h3>
                <select
                  value={editedStatut}
                  onChange={(e) => {
                    const newStatut = e.target.value as DemandeRemboursement['statut'];
                    setEditedStatut(newStatut);
                    if (!isCreateMode) handleFieldSave('statut', newStatut);
                  }}
                  disabled={isCreateMode}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white dark:bg-dark-bg-secondary"
                >
                  <option value="brouillon">Brouillon</option>
                  <option value="soumis">Soumis</option>
                  <option value="en_attente_validation">En attente de validation</option>
                  <option value="approuve">Approuvé</option>
                  <option value="rembourse">Remboursé</option>
                  <option value="refuse">Refusé</option>
                </select>
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
                                onClose();
                                setTimeout(() => {
                                  navigate('/transactions', {
                                    state: { selectedTransactionId: tx.id, fromExpense: true }
                                  });
                                }, 100);
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
                            onClose();
                            setTimeout(() => {
                              navigate('/operations', {
                                state: { selectedOperationId: linkedOperation.id, fromExpense: true }
                              });
                            }, 100);
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
                            "w-full border rounded-lg p-3 cursor-pointer hover:bg-gray-50 transition-colors",
                            selectedPendingFileIndex === index ? "border-purple-500 bg-purple-50" : "border-gray-200"
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
                      : "border-gray-300 dark:border-dark-border hover:border-orange-400 hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary"
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

              {/* Bouton Créer Note de frais - MODE CRÉATION SEULEMENT */}
              {isCreateMode && (
                <div className="mt-6">
                  <button
                    onClick={() => setShowExpenseReportModal(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition-colors shadow-sm"
                  >
                    <FileText className="h-5 w-5" />
                    Créer une Note de frais
                  </button>
                  <p className="text-xs text-gray-500 dark:text-dark-text-muted text-center mt-2">
                    Créer une note de frais qui générera automatiquement la demande
                  </p>
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
                      : "border-gray-300 dark:border-dark-border hover:border-orange-400 hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary"
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
                          "w-full border rounded-lg p-4 text-left hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary transition-colors",
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
                            <Eye className="h-4 w-4 text-gray-400" />
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
                      <span className="font-medium">1ère approbation:</span>
                      <span>{demand?.approuve_par_nom}</span>
                      {demand?.date_approbation && (
                        <span className="text-gray-500 dark:text-gray-400 text-sm ml-auto">
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
                          <span className="text-gray-500 dark:text-gray-400 text-sm ml-auto">
                            le {formatDate(demand.date_approbation_2)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {demand && <ApprovalBadge demand={demand} showDetails={true} />}
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
                        <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">Première approbation</p>
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

                {/* CAS 1: User is the requester AND demand is pending approval */}
                {isRequester && demand && (demand.statut === 'soumis' || demand.statut === 'en_attente_validation') && (
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
                {!hasApprovalPermission && !isRequester && demand && (demand.statut === 'soumis' || demand.statut === 'en_attente_validation') && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-200 dark:border-yellow-700 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-400">Autorisation insuffisante</p>
                        <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                          Votre rôle{currentUser?.role && <> <strong>{currentUser.role}</strong></>} ne permet pas d'approuver les demandes de remboursement.
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
                {canApprove && demand && demand.statut === 'soumis' && (
                  <div className="bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-700 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-green-800 dark:text-green-400">
                          Vous pouvez approuver cette demande
                        </p>
                        <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                          Cette demande créée par <strong>{demand.demandeur_nom || 'un membre'}</strong> attend votre première approbation.
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

                {/* Approval buttons - grayed out if user can't approve */}
                {(demand.statut === 'soumis' || isAwaitingSecondApproval) && (
                  <div className="flex gap-3">
                    <button
                      onClick={canApprove ? onApprove : undefined}
                      disabled={!canApprove}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium transition-all shadow-md",
                        canApprove
                          ? "bg-green-600 hover:bg-green-700 text-white cursor-pointer hover:shadow-lg"
                          : "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed opacity-60"
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
                          : "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed opacity-60"
                      )}
                    >
                      <XCircle className="h-5 w-5" />
                      Refuser
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
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
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:bg-dark-bg-tertiary transition-colors"
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
        <div className="fixed left-0 top-0 h-full w-1/2 bg-white dark:bg-dark-bg-secondary shadow-xl z-[60] border-r border-gray-200 dark:border-dark-border flex flex-col">
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
                      className="px-3 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-50 dark:bg-dark-bg-tertiary transition-colors"
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
                          parent.innerHTML = '<div class="flex items-center justify-center h-64 text-gray-400"><p>Erreur de chargement de l\'image</p></div>';
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
                              console.error('Erreur téléchargement:', error);
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
                        className="px-4 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-primary rounded hover:bg-gray-50 dark:bg-dark-bg-tertiary transition-colors flex items-center gap-2"
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
                              console.error('Erreur téléchargement:', error);
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
                        className="px-4 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-primary rounded hover:bg-gray-50 dark:bg-dark-bg-tertiary transition-colors flex items-center gap-2"
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
                              console.error('Erreur téléchargement:', error);
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
                        className="px-4 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-primary rounded hover:bg-gray-50 dark:bg-dark-bg-tertiary transition-colors flex items-center gap-2"
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

      {/* Modal Expense Report - Mode création uniquement */}
      {isCreateMode && showExpenseReportModal && (
        <ExpenseReportModal
          isOpen={showExpenseReportModal}
          onClose={() => setShowExpenseReportModal(false)}
          onCreate={onCreate}
          currentUser={currentUser}
          clubId={clubId}
        />
      )}

    </>
  );
}