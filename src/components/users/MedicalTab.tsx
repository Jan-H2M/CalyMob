import { useState, useRef, useCallback, useEffect } from 'react';
import { Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { storage, db } from '@/lib/firebase';
import { User, MedicalDocument, DocumentAuditEntry, MobileMedicalCertificate } from '@/types/user.types';
import { Heart, Upload, Eye, Trash2, X, Calendar, CheckCircle, AlertTriangle, Pencil, History, Smartphone, Clock, XCircle, Image } from 'lucide-react';
import { formatDate } from '@/utils/utils';
import toast from 'react-hot-toast';
import { PDFViewer } from '@/components/commun/PDFViewer';
import { MedicalCertificationService } from '@/services/medicalCertificationService';
import { logger } from '@/utils/logger';

interface MedicalTabProps {
  user: User;
  clubId: string;
  currentUserId?: string;
  currentUserName?: string;
  canEdit: boolean;
  onUpdate: (updates: Partial<User>) => void;
}

type EditableMedicalMemberDateField = 'certificat_medical_validite' | 'certificat_medical_date';

// Helper to convert any date format to Date object
function toDate(date: Date | Timestamp | { seconds: number; nanoseconds: number } | any): Date {
  if (!date) return new Date();
  if (date instanceof Date) return date;
  if (date instanceof Timestamp) return date.toDate();
  if (typeof date === 'object' && 'seconds' in date) {
    // Firestore Timestamp-like object (from JSON serialization)
    return new Date(date.seconds * 1000);
  }
  if (typeof date === 'string') return new Date(date);
  return new Date();
}

// Helper to check if a date is in the past
function isExpired(date: Date | Timestamp | any): boolean {
  const d = toDate(date);
  return d < new Date();
}

// Helper to format date for display
function formatValidityDate(date: Date | Timestamp | any): string {
  const d = toDate(date);
  return d.toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function toDateInputValue(date?: Date | Timestamp | { seconds: number; nanoseconds: number } | null): string {
  if (!date) return '';
  const parsedDate = toDate(date);
  if (Number.isNaN(parsedDate.getTime())) return '';
  return parsedDate.toISOString().split('T')[0];
}

// Helper to get default validity date (31 January of next year)
function getDefaultValidityDate(): Date {
  const now = new Date();
  const nextYear = now.getFullYear() + 1;
  return new Date(nextYear, 0, 31); // January 31 of next year
}

// Helper to format audit action for display
function formatAuditAction(action: string): string {
  const actionLabels: Record<string, string> = {
    'upload': 'Document uploadé',
    'modification': 'Document modifié',
    'suppression': 'Document supprimé',
    'date_modified': 'Date de validité modifiée',
    'name_modified': 'Nom modifié'
  };
  return actionLabels[action] || action;
}

// Generate SHA-256 hash of file content
async function generateFileHash(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function MedicalTab({
  user,
  clubId,
  currentUserId,
  currentUserName,
  canEdit,
  onUpdate
}: MedicalTabProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validityDate, setValidityDate] = useState<string>(
    getDefaultValidityDate().toISOString().split('T')[0]
  );
  const [isDragging, setIsDragging] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<MedicalDocument | null>(null);
  const [editingDocument, setEditingDocument] = useState<MedicalDocument | null>(null);
  const [editDate, setEditDate] = useState<string>('');
  const [editName, setEditName] = useState<string>('');
  const [editMode, setEditMode] = useState<'date' | 'name' | null>(null);
  const [historyDocument, setHistoryDocument] = useState<MedicalDocument | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mobile certificates state
  const [mobileCerts, setMobileCerts] = useState<MobileMedicalCertificate[]>([]);
  const [loadingMobileCerts, setLoadingMobileCerts] = useState(true);
  const [previewMobileCert, setPreviewMobileCert] = useState<MobileMedicalCertificate | null>(null);
  const [approvingCert, setApprovingCert] = useState<MobileMedicalCertificate | null>(null);
  const [rejectingCert, setRejectingCert] = useState<MobileMedicalCertificate | null>(null);
  const [approvalDate, setApprovalDate] = useState<string>(
    MedicalCertificationService.getDefaultValidityDate().toISOString().split('T')[0]
  );
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Mobile certificate editing state
  const [editingMobileCert, setEditingMobileCert] = useState<MobileMedicalCertificate | null>(null);
  const [editMobileCertMode, setEditMobileCertMode] = useState<'date' | 'name' | null>(null);
  const [editMobileCertDate, setEditMobileCertDate] = useState<string>('');
  const [editMobileCertName, setEditMobileCertName] = useState<string>('');
  const [historyMobileCert, setHistoryMobileCert] = useState<MobileMedicalCertificate | null>(null);
  const [memberMedicalDates, setMemberMedicalDates] = useState<Record<EditableMedicalMemberDateField, string>>({
    certificat_medical_validite: toDateInputValue(user.certificat_medical_validite),
    certificat_medical_date: toDateInputValue(user.certificat_medical_date)
  });
  const [savingMemberDateField, setSavingMemberDateField] = useState<EditableMedicalMemberDateField | null>(null);

  useEffect(() => {
    setMemberMedicalDates({
      certificat_medical_validite: toDateInputValue(user.certificat_medical_validite),
      certificat_medical_date: toDateInputValue(user.certificat_medical_date)
    });
  }, [user.certificat_medical_validite, user.certificat_medical_date]);

  // Load mobile certificates
  useEffect(() => {
    if (!clubId || !user.id) return;

    setLoadingMobileCerts(true);
    const unsubscribe = MedicalCertificationService.watchMemberCertifications(
      clubId,
      user.id,
      async (certs) => {
        setMobileCerts(certs);
        setLoadingMobileCerts(false);

        // Auto-sync the has_pending_medical flag if needed
        // This fixes certificates uploaded before the mobile app update
        const hasPending = certs.some(c => c.status === 'pending');
        if (hasPending !== user.has_pending_medical) {
          try {
            await MedicalCertificationService.syncPendingFlag(clubId, user.id, certs);
            // Update local state
            onUpdate({ has_pending_medical: hasPending });
          } catch (e) {
            logger.warn('Failed to sync pending flag:', e);
          }
        }
      }
    );

    return () => unsubscribe();
  }, [clubId, user.id]);

  // Mobile certificate action handlers
  const handleApproveCert = async () => {
    if (!approvingCert || !currentUserId || !currentUserName) return;

    setIsProcessing(true);
    const toastId = toast.loading('Approbation en cours...');

    try {
      await MedicalCertificationService.approveCertification(
        clubId,
        user.id,
        approvingCert.id,
        new Date(approvalDate),
        currentUserId,
        currentUserName
      );

      toast.success('Certificat approuvé', { id: toastId });
      setApprovingCert(null);
      setApprovalDate(MedicalCertificationService.getDefaultValidityDate().toISOString().split('T')[0]);
      setMemberMedicalDates(prev => ({
        ...prev,
        certificat_medical_validite: approvalDate
      }));

      // Update local user state with new validity date
      onUpdate({
        certificat_medical_validite: Timestamp.fromDate(new Date(approvalDate)),
        has_pending_medical: false
      });
    } catch (error) {
      logger.error('Error approving certificate:', error);
      toast.error('Erreur lors de l\'approbation', { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectCert = async () => {
    if (!rejectingCert || !currentUserId || !currentUserName || !rejectionReason.trim()) return;

    setIsProcessing(true);
    const toastId = toast.loading('Refus en cours...');

    try {
      await MedicalCertificationService.rejectCertification(
        clubId,
        user.id,
        rejectingCert.id,
        rejectionReason.trim(),
        currentUserId,
        currentUserName
      );

      toast.success('Certificat refusé', { id: toastId });
      setRejectingCert(null);
      setRejectionReason('');
    } catch (error) {
      logger.error('Error rejecting certificate:', error);
      toast.error('Erreur lors du refus', { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteMobileCert = async (cert: MobileMedicalCertificate) => {
    if (!currentUserId || !currentUserName) return;

    const confirmed = window.confirm('Êtes-vous sûr de vouloir supprimer ce certificat ?');
    if (!confirmed) return;

    const toastId = toast.loading('Suppression en cours...');

    try {
      await MedicalCertificationService.deleteCertification(
        clubId,
        user.id,
        cert.id,
        cert.document_url
      );
      toast.success('Certificat supprimé', { id: toastId });
    } catch (error) {
      logger.error('Error deleting certificate:', error);
      toast.error('Erreur lors de la suppression', { id: toastId });
    }
  };

  // Mobile certificate edit handlers
  const startEditMobileCertDate = (cert: MobileMedicalCertificate) => {
    const currentDate = cert.valid_until?.toDate?.() || new Date(cert.valid_until as any);
    setEditingMobileCert(cert);
    setEditMobileCertDate(currentDate.toISOString().split('T')[0]);
    setEditMobileCertMode('date');
  };

  const startEditMobileCertName = (cert: MobileMedicalCertificate) => {
    setEditingMobileCert(cert);
    setEditMobileCertName(getMobileCertDisplayName(cert));
    setEditMobileCertMode('name');
  };

  const handleSaveMobileCertDate = async () => {
    if (!editingMobileCert || !editMobileCertDate) return;

    const toastId = toast.loading('Mise à jour en cours...');

    try {
      await MedicalCertificationService.updateCertificateValidityDate(
        clubId,
        user.id,
        editingMobileCert.id,
        new Date(editMobileCertDate)
      );

      toast.success('Date de validité mise à jour', { id: toastId });
      setEditingMobileCert(null);
      setEditMobileCertDate('');
      setEditMobileCertMode(null);
    } catch (error) {
      logger.error('Error updating validity date:', error);
      toast.error('Erreur lors de la mise à jour', { id: toastId });
    }
  };

  const handleSaveMobileCertName = async () => {
    if (!editingMobileCert || !editMobileCertName.trim()) return;

    const toastId = toast.loading('Mise à jour en cours...');

    try {
      await MedicalCertificationService.updateCertificateName(
        clubId,
        user.id,
        editingMobileCert.id,
        editMobileCertName.trim()
      );

      toast.success('Nom mis à jour', { id: toastId });
      setEditingMobileCert(null);
      setEditMobileCertName('');
      setEditMobileCertMode(null);
    } catch (error) {
      logger.error('Error updating certificate name:', error);
      toast.error('Erreur lors de la mise à jour', { id: toastId });
    }
  };

  // Helper to get display name for mobile certificate
  const getMobileCertDisplayName = (cert: MobileMedicalCertificate): string => {
    if (cert.file_name && !cert.file_name.includes('scaled_') && !cert.file_name.match(/^[a-f0-9-]+\.(jpg|jpeg|png|pdf)$/i)) {
      return cert.file_name;
    }
    // Generate default name based on validity year
    const year = cert.valid_until?.toDate?.()?.getFullYear() || cert.uploaded_at?.toDate?.()?.getFullYear() || new Date().getFullYear();
    return `Certificat médical ${year}`;
  };

  // Helper to format mobile cert date
  const formatMobileCertDate = (timestamp: Timestamp | any): string => {
    if (!timestamp) return 'Date inconnue';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // Filter mobile certs by status
  const pendingMobileCerts = mobileCerts.filter(c => c.status === 'pending');
  const approvedMobileCerts = mobileCerts.filter(c => c.status === 'approved');
  const rejectedMobileCerts = mobileCerts.filter(c => c.status === 'rejected');

  // Get medical documents from user, sorted by validity date (newest first)
  // Use slice() to avoid mutating original array which could cause re-render loops
  const medicalDocs = [...(user.documents_medicaux || [])].sort((a, b) => {
    const dateA = toDate(a.date_validite);
    const dateB = toDate(b.date_validite);
    return dateB.getTime() - dateA.getTime();
  });

  // Get current validity status from the inline editor state
  const currentValidity = memberMedicalDates.certificat_medical_validite
    ? new Date(memberMedicalDates.certificat_medical_validite)
    : null;
  const hasValidCertificate = currentValidity && !isExpired(currentValidity);

  const handleMemberDateSave = async (field: EditableMedicalMemberDateField) => {
    if (!canEdit) return;

    const rawValue = memberMedicalDates[field];
    const previousValue = toDateInputValue(user[field]);
    if (rawValue === previousValue) return;

    const toastId = toast.loading('Sauvegarde en cours...');
    setSavingMemberDateField(field);

    try {
      const memberRef = doc(db, `clubs/${clubId}/members/${user.id}`);
      const firestoreValue = rawValue ? Timestamp.fromDate(new Date(rawValue)) : null;

      await updateDoc(memberRef, {
        [field]: firestoreValue
      });

      onUpdate({
        [field]: firestoreValue || null
      } as Partial<User>);

      toast.success('Date mise à jour', { id: toastId });
    } catch (error) {
      logger.error(`Error updating ${field}:`, error);
      toast.error('Erreur lors de la mise à jour', { id: toastId });
      setMemberMedicalDates({
        certificat_medical_validite: toDateInputValue(user.certificat_medical_validite),
        certificat_medical_date: toDateInputValue(user.certificat_medical_date)
      });
    } finally {
      setSavingMemberDateField(null);
    }
  };

  // Handle file selection
  const handleFileSelect = (file: File) => {
    if (file.type !== 'application/pdf') {
      toast.error('Seuls les fichiers PDF sont acceptés pour les certificats médicaux');
      return;
    }
    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      toast.error('Le fichier ne peut pas dépasser 10 MB');
      return;
    }
    setSelectedFile(file);
    setValidityDate(getDefaultValidityDate().toISOString().split('T')[0]);
    setShowUploadModal(true);
  };

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  }, []);

  // Upload file
  const handleUpload = async () => {
    if (!selectedFile || !currentUserId || !currentUserName) {
      toast.error('Informations manquantes pour l\'upload');
      return;
    }

    setIsUploading(true);
    const toastId = toast.loading('Upload en cours...');

    try {
      // Generate file hash for deduplication
      const fileHash = await generateFileHash(selectedFile);

      // Check for duplicate
      const existingDoc = medicalDocs.find(d => d.file_hash === fileHash);
      if (existingDoc) {
        toast.error('Ce document existe déjà', { id: toastId });
        setIsUploading(false);
        return;
      }

      // Create unique filename with timestamp
      const timestamp = Date.now();
      const fileName = `${timestamp}_${selectedFile.name}`;
      const storagePath = `clubs/${clubId}/members/${user.id}/medical/${fileName}`;

      // Upload to Firebase Storage
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, selectedFile);
      const downloadUrl = await getDownloadURL(storageRef);

      // Create document metadata
      const validityDateObj = new Date(validityDate);
      const now = new Date();

      // Create Firestore-compatible document (use Timestamp for dates)
      const auditEntry = {
        action: 'upload' as const,
        par: currentUserId,
        par_nom: currentUserName,
        date: Timestamp.fromDate(now)
      };

      const newDocumentForFirestore = {
        url: downloadUrl,
        nom_original: selectedFile.name,
        nom_affichage: `Certificat médical ${validityDateObj.getFullYear()}`,
        type: selectedFile.type,
        taille: selectedFile.size,
        date_upload: Timestamp.fromDate(now),
        uploaded_by: currentUserId,
        uploaded_by_nom: currentUserName,
        file_hash: fileHash,
        date_validite: Timestamp.fromDate(validityDateObj),
        historique: [auditEntry]
      };

      // Update Firestore - add document and update validity date if newer
      const memberRef = doc(db, `clubs/${clubId}/members/${user.id}`);

      // Check if new document has a later validity date
      const shouldUpdateValidity = !currentValidity || validityDateObj > currentValidity;

      const updateData: any = {
        documents_medicaux: arrayUnion(newDocumentForFirestore)
      };

      if (shouldUpdateValidity) {
        updateData.certificat_medical_validite = Timestamp.fromDate(validityDateObj);
      }

      await updateDoc(memberRef, updateData);

      // Update local state - use the Firestore document for consistency
      const updatedDocs = [...medicalDocs, newDocumentForFirestore as MedicalDocument];
      const updates: Partial<User> = {
        documents_medicaux: updatedDocs
      };
      if (shouldUpdateValidity) {
        setMemberMedicalDates(prev => ({
          ...prev,
          certificat_medical_validite: validityDateObj.toISOString().split('T')[0]
        }));
        updates.certificat_medical_validite = Timestamp.fromDate(validityDateObj);
      }
      onUpdate(updates);

      toast.success('Certificat médical ajouté', { id: toastId });
      setShowUploadModal(false);
      setSelectedFile(null);
    } catch (error) {
      logger.error('Error uploading medical document:', error);
      toast.error('Erreur lors de l\'upload', { id: toastId });
    } finally {
      setIsUploading(false);
    }
  };

  // Delete document
  const handleDelete = async (document: MedicalDocument) => {
    if (!currentUserId || !currentUserName) return;

    const confirmed = window.confirm('Êtes-vous sûr de vouloir supprimer ce certificat médical ?');
    if (!confirmed) return;

    const toastId = toast.loading('Suppression en cours...');

    try {
      // Delete from Storage
      const storageRef = ref(storage, document.url);
      try {
        await deleteObject(storageRef);
      } catch (e) {
        // File may not exist in storage, continue with Firestore cleanup
        logger.warn('File not found in storage:', e);
      }

      // Remove from Firestore
      const memberRef = doc(db, `clubs/${clubId}/members/${user.id}`);
      await updateDoc(memberRef, {
        documents_medicaux: arrayRemove(document)
      });

      // Update local state
      const updatedDocs = medicalDocs.filter(d => d.url !== document.url);

      // Recalculate validity date from remaining documents
      let newValidity: Date | null = null;
      if (updatedDocs.length > 0) {
        const sortedDocs = updatedDocs.sort((a, b) => {
          const dateA = a.date_validite instanceof Timestamp ? a.date_validite.toDate() : new Date(a.date_validite);
          const dateB = b.date_validite instanceof Timestamp ? b.date_validite.toDate() : new Date(b.date_validite);
          return dateB.getTime() - dateA.getTime();
        });
        const latestDate = sortedDocs[0].date_validite;
        newValidity = latestDate instanceof Timestamp ? latestDate.toDate() : new Date(latestDate);
      }

      // Update validity in Firestore
      await updateDoc(memberRef, {
        certificat_medical_validite: newValidity
      });
      setMemberMedicalDates(prev => ({
        ...prev,
        certificat_medical_validite: newValidity ? newValidity.toISOString().split('T')[0] : ''
      }));

      onUpdate({
        documents_medicaux: updatedDocs,
        certificat_medical_validite: newValidity || undefined
      });

      toast.success('Certificat supprimé', { id: toastId });
    } catch (error) {
      logger.error('Error deleting medical document:', error);
      toast.error('Erreur lors de la suppression', { id: toastId });
    }
  };

  // Start editing a document's validity date
  const startEditDate = (document: MedicalDocument) => {
    const currentDate = toDate(document.date_validite);
    setEditingDocument(document);
    setEditDate(currentDate.toISOString().split('T')[0]);
    setEditMode('date');
  };

  // Start editing a document's name
  const startEditName = (document: MedicalDocument) => {
    setEditingDocument(document);
    setEditName(document.nom_affichage);
    setEditMode('name');
  };

  // Save edited validity date
  const handleSaveDate = async () => {
    if (!editingDocument || !currentUserId || !currentUserName || !editDate) return;

    const toastId = toast.loading('Mise à jour en cours...');

    try {
      const newDateObj = new Date(editDate);
      const oldDateObj = toDate(editingDocument.date_validite);

      // Create audit entry for the change
      const auditEntry: DocumentAuditEntry = {
        action: 'date_modified',
        par: currentUserId,
        par_nom: currentUserName,
        date: Timestamp.fromDate(new Date()),
        details: `Date modifiée de ${formatValidityDate(oldDateObj)} à ${formatValidityDate(newDateObj)}`
      };

      // Create updated document with new date and audit entry
      // Keep the existing name (don't auto-update it)
      const updatedDocument: MedicalDocument = {
        ...editingDocument,
        date_validite: Timestamp.fromDate(newDateObj),
        historique: [...(editingDocument.historique || []), auditEntry]
      };

      // Update in Firestore - remove old, add updated
      const memberRef = doc(db, `clubs/${clubId}/members/${user.id}`);

      // First remove the old document
      await updateDoc(memberRef, {
        documents_medicaux: arrayRemove(editingDocument)
      });

      // Then add the updated document
      await updateDoc(memberRef, {
        documents_medicaux: arrayUnion(updatedDocument)
      });

      // Recalculate member's validity date (use the latest)
      const updatedDocs = medicalDocs.map(d =>
        d.url === editingDocument.url ? updatedDocument : d
      );
      const sortedDocs = [...updatedDocs].sort((a, b) => {
        const dateA = toDate(a.date_validite);
        const dateB = toDate(b.date_validite);
        return dateB.getTime() - dateA.getTime();
      });
      const latestValidity = sortedDocs.length > 0 ? toDate(sortedDocs[0].date_validite) : null;

      // Update member's validity if this is now the latest
      if (latestValidity) {
        await updateDoc(memberRef, {
          certificat_medical_validite: Timestamp.fromDate(latestValidity)
        });
      }
      setMemberMedicalDates(prev => ({
        ...prev,
        certificat_medical_validite: latestValidity ? latestValidity.toISOString().split('T')[0] : ''
      }));

      // Update local state
      onUpdate({
        documents_medicaux: updatedDocs,
        certificat_medical_validite: latestValidity || undefined
      });

      toast.success('Date de validité mise à jour', { id: toastId });
      setEditingDocument(null);
      setEditDate('');
      setEditMode(null);
    } catch (error) {
      logger.error('Error updating validity date:', error);
      toast.error('Erreur lors de la mise à jour', { id: toastId });
    }
  };

  // Save edited name
  const handleSaveName = async () => {
    if (!editingDocument || !currentUserId || !currentUserName || !editName.trim()) return;

    const toastId = toast.loading('Mise à jour en cours...');

    try {
      const oldName = editingDocument.nom_affichage;
      const newName = editName.trim();

      // Create audit entry for the change
      const auditEntry: DocumentAuditEntry = {
        action: 'name_modified',
        par: currentUserId,
        par_nom: currentUserName,
        date: Timestamp.fromDate(new Date()),
        details: `Nom modifié de "${oldName}" à "${newName}"`
      };

      // Create updated document with new name and audit entry
      const updatedDocument: MedicalDocument = {
        ...editingDocument,
        nom_affichage: newName,
        historique: [...(editingDocument.historique || []), auditEntry]
      };

      // Update in Firestore - remove old, add updated
      const memberRef = doc(db, `clubs/${clubId}/members/${user.id}`);

      // First remove the old document
      await updateDoc(memberRef, {
        documents_medicaux: arrayRemove(editingDocument)
      });

      // Then add the updated document
      await updateDoc(memberRef, {
        documents_medicaux: arrayUnion(updatedDocument)
      });

      // Update local state
      const updatedDocs = medicalDocs.map(d =>
        d.url === editingDocument.url ? updatedDocument : d
      );
      onUpdate({
        documents_medicaux: updatedDocs
      });

      toast.success('Nom mis à jour', { id: toastId });
      setEditingDocument(null);
      setEditName('');
      setEditMode(null);
    } catch (error) {
      logger.error('Error updating document name:', error);
      toast.error('Erreur lors de la mise à jour', { id: toastId });
    }
  };

  return (
    <div className="space-y-6">
      {/* Current validity status */}
      <div className={`p-4 rounded-lg border ${
        hasValidCertificate
          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
          : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
      }`}>
        <div className="flex items-center gap-3">
          {hasValidCertificate ? (
            <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
          ) : (
            <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
          )}
          <div>
            <h3 className={`font-medium ${
              hasValidCertificate
                ? 'text-green-800 dark:text-green-200'
                : 'text-amber-800 dark:text-amber-200'
            }`}>
              {hasValidCertificate
                ? `Certificat médical valide jusqu'au ${formatValidityDate(currentValidity!)}`
                : currentValidity
                  ? `Certificat médical expiré le ${formatValidityDate(currentValidity)}`
                  : 'Aucun certificat médical enregistré'
              }
            </h3>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-dark-text-primary">
              <Calendar className="h-4 w-4 flex-shrink-0" />
              <span>Validité LIFRAS</span>
            </label>
            <input
              type="date"
              value={memberMedicalDates.certificat_medical_validite}
              onChange={(e) => setMemberMedicalDates(prev => ({ ...prev, certificat_medical_validite: e.target.value }))}
              onBlur={() => handleMemberDateSave('certificat_medical_validite')}
              disabled={!canEdit || savingMemberDateField === 'certificat_medical_validite'}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-dark-border dark:bg-dark-bg-secondary dark:text-dark-text-primary dark:disabled:bg-dark-bg-tertiary"
            />
          </div>

          <div>
            <label className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-dark-text-primary">
              <Calendar className="h-4 w-4 flex-shrink-0" />
              <span>Date d'édition</span>
            </label>
            <input
              type="date"
              value={memberMedicalDates.certificat_medical_date}
              onChange={(e) => setMemberMedicalDates(prev => ({ ...prev, certificat_medical_date: e.target.value }))}
              onBlur={() => handleMemberDateSave('certificat_medical_date')}
              disabled={!canEdit || savingMemberDateField === 'certificat_medical_date'}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-dark-border dark:bg-dark-bg-secondary dark:text-dark-text-primary dark:disabled:bg-dark-bg-tertiary"
            />
          </div>
        </div>
      </div>

      {/* Pending validation section */}
      {pendingMobileCerts.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <h3 className="font-medium text-amber-800 dark:text-amber-200 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5" />
            En attente de validation ({pendingMobileCerts.length})
          </h3>
          <div className="space-y-3">
            {pendingMobileCerts.map((cert) => (
              <div
                key={cert.id}
                className="bg-white dark:bg-dark-bg-secondary rounded-lg p-4 border border-amber-200 dark:border-amber-700"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                      <Heart className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-dark-text-primary">
                        Certificat médical (en attente)
                      </h4>
                      <p className="text-sm text-gray-500 dark:text-dark-text-muted mt-1">
                        Uploadé le {formatMobileCertDate(cert.uploaded_at)} via l'app mobile
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPreviewMobileCert(cert)}
                      className="p-2 text-gray-500 dark:text-dark-text-muted hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                      title="Voir le document"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {canEdit && (
                      <>
                        <button
                          onClick={() => {
                            setApprovingCert(cert);
                            setApprovalDate(MedicalCertificationService.getDefaultValidityDate().toISOString().split('T')[0]);
                          }}
                          className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Approuver
                        </button>
                        <button
                          onClick={() => setRejectingCert(cert)}
                          className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors flex items-center gap-1"
                        >
                          <XCircle className="w-4 h-4" />
                          Refuser
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading state for mobile certs */}
      {loadingMobileCerts && (
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          <span className="ml-2 text-gray-500 dark:text-dark-text-muted text-sm">Chargement...</span>
        </div>
      )}

      {/* Unified documents list (mobile approved + admin uploaded) */}
      <div>
        <h3 className="font-medium text-gray-900 dark:text-dark-text-primary mb-4 flex items-center gap-2">
          <Heart className="w-5 h-5 text-red-500" />
          Certificats médicaux ({medicalDocs.length + approvedMobileCerts.length})
        </h3>

        {medicalDocs.length === 0 && approvedMobileCerts.length === 0 && rejectedMobileCerts.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-dark-text-muted">
            <Heart className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Aucun certificat médical enregistré</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Mobile approved certificates - displayed like admin certs */}
            {approvedMobileCerts.map((cert) => {
              const expired = cert.valid_until ? isExpired(cert.valid_until) : false;
              const displayName = getMobileCertDisplayName(cert);
              return (
                <div
                  key={`mobile-${cert.id}`}
                  className={`p-4 rounded-lg border ${
                    expired
                      ? 'bg-gray-50 dark:bg-dark-bg-tertiary border-gray-200 dark:border-dark-border'
                      : 'bg-white dark:bg-dark-bg-secondary border-gray-200 dark:border-dark-border'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${
                        expired
                          ? 'bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-dark-bg-secondary'
                          : 'bg-red-100 dark:bg-red-900/30'
                      }`}>
                        <Heart className={`w-5 h-5 ${
                          expired
                            ? 'text-gray-400 dark:text-dark-text-muted'
                            : 'text-red-600 dark:text-red-400'
                        }`} />
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-dark-text-primary flex items-center gap-1">
                          {displayName}
                          {canEdit && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditMobileCertName(cert);
                              }}
                              className="p-1 text-gray-400 dark:text-dark-text-muted hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                              title="Modifier le nom"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          )}
                          {expired && (
                            <span className="ml-1 text-xs font-normal text-amber-600 dark:text-amber-400">
                              (expiré)
                            </span>
                          )}
                          <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" title="Uploadé via l'app mobile">
                            <Smartphone className="w-3 h-3" />
                          </span>
                        </h4>
                        <div className="flex items-center gap-2 mt-1">
                          <Calendar className="w-3.5 h-3.5 text-gray-400 dark:text-dark-text-muted" />
                          <span className={`text-sm ${
                            expired
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-green-600 dark:text-green-400'
                          }`}>
                            Valide jusqu'au {formatMobileCertDate(cert.valid_until)}
                          </span>
                          {canEdit && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditMobileCertDate(cert);
                              }}
                              className="p-1 text-gray-400 dark:text-dark-text-muted hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                              title="Modifier la date"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
                          Approuvé par {cert.reviewed_by_nom || 'Admin'} le {formatMobileCertDate(cert.reviewed_at)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPreviewMobileCert(cert)}
                        className="p-2 text-gray-500 dark:text-dark-text-muted hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                        title="Voir"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setHistoryMobileCert(cert)}
                        className="p-2 text-gray-500 dark:text-dark-text-muted hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                        title="Historique"
                      >
                        <History className="w-4 h-4" />
                      </button>
                      {canEdit && (
                        <button
                          onClick={() => handleDeleteMobileCert(cert)}
                          className="p-2 text-gray-500 dark:text-dark-text-muted hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Rejected mobile certificates */}
            {rejectedMobileCerts.map((cert) => (
              <div
                key={`mobile-rejected-${cert.id}`}
                className="p-4 rounded-lg border bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                      <Heart className="w-5 h-5 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-dark-text-primary flex items-center gap-2">
                        Certificat médical
                        <span className="text-xs font-normal text-red-600 dark:text-red-400">(refusé)</span>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" title="Uploadé via l'app mobile">
                          <Smartphone className="w-3 h-3" />
                        </span>
                      </h4>
                      {cert.rejection_reason && (
                        <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                          Raison: {cert.rejection_reason}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
                        Refusé par {cert.reviewed_by_nom || 'Admin'} le {formatMobileCertDate(cert.reviewed_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPreviewMobileCert(cert)}
                      className="p-2 text-gray-500 dark:text-dark-text-muted hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                      title="Voir"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setHistoryMobileCert(cert)}
                      className="p-2 text-gray-500 dark:text-dark-text-muted hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                      title="Historique"
                    >
                      <History className="w-4 h-4" />
                    </button>
                    {canEdit && (
                      <button
                        onClick={() => handleDeleteMobileCert(cert)}
                        className="p-2 text-gray-500 dark:text-dark-text-muted hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Admin uploaded certificates */}
            {medicalDocs.map((document, index) => {
              const expired = isExpired(document.date_validite);
              return (
                <div
                  key={document.url}
                  className={`p-4 rounded-lg border ${
                    expired
                      ? 'bg-gray-50 dark:bg-dark-bg-tertiary border-gray-200 dark:border-dark-border'
                      : 'bg-white dark:bg-dark-bg-secondary border-gray-200 dark:border-dark-border'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${
                        expired
                          ? 'bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-dark-bg-secondary'
                          : 'bg-red-100 dark:bg-red-900/30'
                      }`}>
                        <Heart className={`w-5 h-5 ${
                          expired
                            ? 'text-gray-400 dark:text-dark-text-muted'
                            : 'text-red-600 dark:text-red-400'
                        }`} />
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-dark-text-primary flex items-center gap-1">
                          {document.nom_affichage}
                          {canEdit && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditName(document);
                              }}
                              className="p-1 text-gray-400 dark:text-dark-text-muted hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                              title="Modifier le nom"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          )}
                          {expired && (
                            <span className="ml-1 text-xs font-normal text-amber-600 dark:text-amber-400">
                              (expiré)
                            </span>
                          )}
                        </h4>
                        <div className="flex items-center gap-2 mt-1">
                          <Calendar className="w-3.5 h-3.5 text-gray-400 dark:text-dark-text-muted" />
                          <span className={`text-sm ${
                            expired
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-green-600 dark:text-green-400'
                          }`}>
                            Valide jusqu'au {formatValidityDate(document.date_validite)}
                          </span>
                          {canEdit && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditDate(document);
                              }}
                              className="p-1 text-gray-400 dark:text-dark-text-muted hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                              title="Modifier la date"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
                          Uploadé par {document.uploaded_by_nom} le {formatDate(document.date_upload)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPreviewDocument(document)}
                        className="p-2 text-gray-500 dark:text-dark-text-muted hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                        title="Voir"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setHistoryDocument(document)}
                        className="p-2 text-gray-500 dark:text-dark-text-muted hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                        title="Historique"
                      >
                        <History className="w-4 h-4" />
                      </button>
                      {canEdit && (
                        <button
                          onClick={() => handleDelete(document)}
                          className="p-2 text-gray-500 dark:text-dark-text-muted hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Mobile Certificate Edit Modal (Date or Name) */}
      {editingMobileCert && editMobileCertMode && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-[60]"
            onClick={() => {
              setEditingMobileCert(null);
              setEditMobileCertDate('');
              setEditMobileCertName('');
              setEditMobileCertMode(null);
            }}
          />
          <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
            <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl max-w-sm w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-dark-text-primary flex items-center gap-2">
                  {editMobileCertMode === 'date' ? (
                    <>
                      <Calendar className="w-5 h-5 text-blue-500" />
                      Modifier la date de validité
                    </>
                  ) : (
                    <>
                      <Pencil className="w-5 h-5 text-blue-500" />
                      Modifier le nom
                    </>
                  )}
                </h3>
                <button
                  onClick={() => {
                    setEditingMobileCert(null);
                    setEditMobileCertDate('');
                    setEditMobileCertName('');
                    setEditMobileCertMode(null);
                  }}
                  className="p-1 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-3">
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary font-medium">
                    {getMobileCertDisplayName(editingMobileCert)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
                    {editMobileCertMode === 'date'
                      ? `Date actuelle: ${formatMobileCertDate(editingMobileCert.valid_until)}`
                      : 'Uploadé via l\'app mobile'
                    }
                  </p>
                </div>

                {editMobileCertMode === 'date' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                      Nouvelle date de validité
                    </label>
                    <input
                      type="date"
                      value={editMobileCertDate}
                      onChange={(e) => setEditMobileCertDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                      Nouveau nom
                    </label>
                    <input
                      type="text"
                      value={editMobileCertName}
                      onChange={(e) => setEditMobileCertName(e.target.value)}
                      placeholder="Ex: Certificat médical 2026"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => {
                    setEditingMobileCert(null);
                    setEditMobileCertDate('');
                    setEditMobileCertName('');
                    setEditMobileCertMode(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-200 font-medium"
                >
                  Annuler
                </button>
                <button
                  onClick={editMobileCertMode === 'date' ? handleSaveMobileCertDate : handleSaveMobileCertName}
                  disabled={editMobileCertMode === 'date' ? !editMobileCertDate : !editMobileCertName.trim()}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
                >
                  Enregistrer
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Mobile Certificate History Modal */}
      {historyMobileCert && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-[60]"
            onClick={() => setHistoryMobileCert(null)}
          />
          <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
            <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl max-w-md w-full p-6 max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-dark-text-primary flex items-center gap-2">
                  <History className="w-5 h-5 text-purple-500" />
                  Historique
                </h3>
                <button
                  onClick={() => setHistoryMobileCert(null)}
                  className="p-1 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-3 mb-4">
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary font-medium">
                  {getMobileCertDisplayName(historyMobileCert)}
                </p>
                <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1 flex items-center gap-1">
                  <Smartphone className="w-3 h-3" />
                  Uploadé via l'app mobile
                </p>
              </div>

              <div className="flex-1 overflow-y-auto">
                <div className="space-y-3">
                  {/* Upload event */}
                  <div className="border-l-2 border-blue-300 dark:border-blue-700 pl-3 py-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                      Document uploadé via CalyMob
                    </p>
                    <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
                      Par {user.displayName} le {formatMobileCertDate(historyMobileCert.uploaded_at)}
                    </p>
                  </div>

                  {/* Review event (if reviewed) */}
                  {historyMobileCert.reviewed_at && (
                    <div className={`border-l-2 pl-3 py-1 ${
                      historyMobileCert.status === 'approved'
                        ? 'border-green-300 dark:border-green-700'
                        : 'border-red-300 dark:border-red-700'
                    }`}>
                      <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                        {historyMobileCert.status === 'approved' ? 'Certificat approuvé' : 'Certificat refusé'}
                      </p>
                      {historyMobileCert.status === 'approved' && historyMobileCert.valid_until && (
                        <p className="text-xs text-gray-600 dark:text-dark-text-secondary mt-0.5">
                          Validité fixée au {formatMobileCertDate(historyMobileCert.valid_until)}
                        </p>
                      )}
                      {historyMobileCert.status === 'rejected' && historyMobileCert.rejection_reason && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                          Raison: {historyMobileCert.rejection_reason}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
                        Par {historyMobileCert.reviewed_by_nom || 'Admin'} le {formatMobileCertDate(historyMobileCert.reviewed_at)}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-4 border-t dark:border-dark-border">
                <button
                  onClick={() => setHistoryMobileCert(null)}
                  className="w-full px-4 py-2 bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-200 font-medium"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Upload zone */}
      {canEdit && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragging
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-300 dark:border-dark-border hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
              e.target.value = '';
            }}
          />
          <Upload className={`w-10 h-10 mx-auto mb-3 ${
            isDragging ? 'text-blue-500' : 'text-gray-400 dark:text-dark-text-muted'
          }`} />
          <p className="text-gray-600 dark:text-dark-text-secondary">
            Glissez un PDF ici ou cliquez pour sélectionner
          </p>
          <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
            Fichiers PDF uniquement, max 10 MB
          </p>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && selectedFile && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-[60]"
            onClick={() => {
              setShowUploadModal(false);
              setSelectedFile(null);
            }}
          />
          <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
            <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-dark-text-primary flex items-center gap-2">
                  <Heart className="w-5 h-5 text-red-500" />
                  Nouveau certificat médical
                </h3>
                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    setSelectedFile(null);
                  }}
                  className="p-1 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-3">
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                    <span className="font-medium">Fichier:</span> {selectedFile.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    <Calendar className="w-4 h-4 inline mr-1" />
                    Date de validité
                  </label>
                  <input
                    type="date"
                    value={validityDate}
                    onChange={(e) => setValidityDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                  />
                  <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
                    Par défaut: 31 janvier de l'année suivante. Modifiable pour les cas exceptionnels.
                  </p>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    La date de validité du membre sera mise à jour automatiquement si ce certificat est plus récent.
                  </p>
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    setSelectedFile(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-200 font-medium"
                  disabled={isUploading}
                >
                  Annuler
                </button>
                <button
                  onClick={handleUpload}
                  disabled={isUploading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
                >
                  {isUploading ? 'Upload...' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Preview Modal */}
      {previewDocument && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-[60]"
            onClick={() => setPreviewDocument(null)}
          />
          <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
            <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl w-full max-w-4xl h-[85vh] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b dark:border-dark-border">
                <h3 className="text-lg font-bold text-gray-900 dark:text-dark-text-primary flex items-center gap-2">
                  <Heart className="w-5 h-5 text-red-500" />
                  {previewDocument.nom_affichage}
                </h3>
                <button
                  onClick={() => setPreviewDocument(null)}
                  className="p-1 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden p-4">
                <PDFViewer
                  fileUrl={previewDocument.url}
                  fileName={previewDocument.nom_original}
                  className="h-full"
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Edit Modal (Date or Name) */}
      {editingDocument && editMode && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-[60]"
            onClick={() => {
              setEditingDocument(null);
              setEditDate('');
              setEditName('');
              setEditMode(null);
            }}
          />
          <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
            <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl max-w-sm w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-dark-text-primary flex items-center gap-2">
                  {editMode === 'date' ? (
                    <>
                      <Calendar className="w-5 h-5 text-blue-500" />
                      Modifier la date de validité
                    </>
                  ) : (
                    <>
                      <Pencil className="w-5 h-5 text-blue-500" />
                      Modifier le nom
                    </>
                  )}
                </h3>
                <button
                  onClick={() => {
                    setEditingDocument(null);
                    setEditDate('');
                    setEditName('');
                    setEditMode(null);
                  }}
                  className="p-1 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-3">
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary font-medium">
                    {editingDocument.nom_affichage}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
                    {editMode === 'date'
                      ? `Date actuelle: ${formatValidityDate(editingDocument.date_validite)}`
                      : `Nom original: ${editingDocument.nom_original}`
                    }
                  </p>
                </div>

                {editMode === 'date' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                      Nouvelle date de validité
                    </label>
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                      Nouveau nom
                    </label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Ex: Certificat médical 2026"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => {
                    setEditingDocument(null);
                    setEditDate('');
                    setEditName('');
                    setEditMode(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-200 font-medium"
                >
                  Annuler
                </button>
                <button
                  onClick={editMode === 'date' ? handleSaveDate : handleSaveName}
                  disabled={editMode === 'date' ? !editDate : !editName.trim()}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
                >
                  Enregistrer
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* History Modal */}
      {historyDocument && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-[60]"
            onClick={() => setHistoryDocument(null)}
          />
          <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
            <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl max-w-md w-full p-6 max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-dark-text-primary flex items-center gap-2">
                  <History className="w-5 h-5 text-purple-500" />
                  Historique
                </h3>
                <button
                  onClick={() => setHistoryDocument(null)}
                  className="p-1 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-3 mb-4">
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary font-medium">
                  {historyDocument.nom_affichage}
                </p>
                <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
                  {historyDocument.nom_original}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto">
                {historyDocument.historique && historyDocument.historique.length > 0 ? (
                  <div className="space-y-3">
                    {[...historyDocument.historique].reverse().map((entry, index) => (
                      <div
                        key={index}
                        className="border-l-2 border-purple-300 dark:border-purple-700 pl-3 py-1"
                      >
                        <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                          {formatAuditAction(entry.action)}
                        </p>
                        {entry.details && (
                          <p className="text-xs text-gray-600 dark:text-dark-text-secondary mt-0.5">
                            {entry.details}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
                          Par {entry.par_nom} le {formatValidityDate(entry.date)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500 dark:text-dark-text-muted">
                    <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Aucun historique disponible</p>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t dark:border-dark-border">
                <button
                  onClick={() => setHistoryDocument(null)}
                  className="w-full px-4 py-2 bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-200 font-medium"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Mobile Certificate Preview Modal */}
      {previewMobileCert && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-[60]"
            onClick={() => setPreviewMobileCert(null)}
          />
          <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
            <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl w-full max-w-4xl h-[85vh] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b dark:border-dark-border">
                <h3 className="text-lg font-bold text-gray-900 dark:text-dark-text-primary flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-blue-500" />
                  {previewMobileCert.file_name || 'Certificat médical'}
                </h3>
                <button
                  onClick={() => setPreviewMobileCert(null)}
                  className="p-1 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden p-4">
                {previewMobileCert.document_type === 'pdf' ? (
                  <PDFViewer
                    fileUrl={previewMobileCert.document_url}
                    fileName={previewMobileCert.file_name || 'certificat.pdf'}
                    className="h-full"
                  />
                ) : (
                  <div className="h-full flex items-center justify-center bg-gray-100 dark:bg-dark-bg-tertiary rounded-lg">
                    <img
                      src={previewMobileCert.document_url}
                      alt="Certificat médical"
                      className="max-h-full max-w-full object-contain rounded-lg"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Approval Modal */}
      {approvingCert && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-[60]"
            onClick={() => !isProcessing && setApprovingCert(null)}
          />
          <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
            <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-dark-text-primary flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  Approuver le certificat
                </h3>
                <button
                  onClick={() => !isProcessing && setApprovingCert(null)}
                  className="p-1 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded"
                  disabled={isProcessing}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-3">
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                    <span className="font-medium">Membre:</span> {user.displayName}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                    <span className="font-medium">Document:</span> {approvingCert.file_name || 'Certificat médical'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
                    Uploadé le {formatMobileCertDate(approvingCert.uploaded_at)}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    <Calendar className="w-4 h-4 inline mr-1" />
                    Date de validité
                  </label>
                  <input
                    type="date"
                    value={approvalDate}
                    onChange={(e) => setApprovalDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                  />
                  <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
                    Par défaut: 31 janvier de l'année suivante
                  </p>
                </div>

                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                  <p className="text-sm text-green-800 dark:text-green-200">
                    La date de validité du membre sera mise à jour automatiquement.
                  </p>
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => setApprovingCert(null)}
                  className="flex-1 px-4 py-2 bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-200 font-medium"
                  disabled={isProcessing}
                >
                  Annuler
                </button>
                <button
                  onClick={handleApproveCert}
                  disabled={isProcessing || !approvalDate}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  Approuver
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Rejection Modal */}
      {rejectingCert && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-[60]"
            onClick={() => !isProcessing && setRejectingCert(null)}
          />
          <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
            <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-dark-text-primary flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-red-500" />
                  Refuser le certificat
                </h3>
                <button
                  onClick={() => !isProcessing && setRejectingCert(null)}
                  className="p-1 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded"
                  disabled={isProcessing}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-3">
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                    <span className="font-medium">Membre:</span> {user.displayName}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                    <span className="font-medium">Document:</span> {rejectingCert.file_name || 'Certificat médical'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
                    Uploadé le {formatMobileCertDate(rejectingCert.uploaded_at)}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Raison du refus *
                  </label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Ex: Document illisible, date non visible, document incomplet..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-red-500 dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                  />
                </div>

                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    Le membre pourra télécharger un nouveau document depuis l'application mobile.
                  </p>
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => setRejectingCert(null)}
                  className="flex-1 px-4 py-2 bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-200 font-medium"
                  disabled={isProcessing}
                >
                  Annuler
                </button>
                <button
                  onClick={handleRejectCert}
                  disabled={isProcessing || !rejectionReason.trim()}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  ) : (
                    <XCircle className="w-4 h-4" />
                  )}
                  Refuser
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
