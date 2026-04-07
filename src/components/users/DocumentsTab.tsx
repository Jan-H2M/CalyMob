import { useState, useRef, useCallback } from 'react';
import { Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { storage, db } from '@/lib/firebase';
import { User, GeneralDocument, DocumentAuditEntry } from '@/types/user.types';
import { FileText, Upload, Eye, Trash2, X, File, Image, FileSpreadsheet } from 'lucide-react';
import { formatDate } from '@/utils/utils';
import toast from 'react-hot-toast';
import { PDFViewer } from '@/components/commun/PDFViewer';
import { ImageViewer } from '@/components/commun/ImageViewer';
import { logger } from '@/utils/logger';

interface DocumentsTabProps {
  user: User;
  clubId: string;
  currentUserId?: string;
  currentUserName?: string;
  canEdit: boolean;
  onUpdate: (updates: Partial<User>) => void;
}

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

// Helper to format file size
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Get icon for file type
function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) {
    return <Image className="w-5 h-5" />;
  }
  if (mimeType === 'application/pdf') {
    return <FileText className="w-5 h-5" />;
  }
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
    return <FileSpreadsheet className="w-5 h-5" />;
  }
  return <File className="w-5 h-5" />;
}

// Get file type label
function getFileTypeLabel(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'Image';
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'Excel';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'Word';
  return 'Document';
}

// Generate SHA-256 hash of file content
async function generateFileHash(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Accepted file types
const ACCEPTED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel'
];

const ACCEPTED_EXTENSIONS = '.pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx';

export function DocumentsTab({
  user,
  clubId,
  currentUserId,
  currentUserName,
  canEdit,
  onUpdate
}: DocumentsTabProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentName, setDocumentName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<GeneralDocument | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get general documents from user, sorted by upload date (newest first)
  // Use spread to avoid mutating original array which could cause re-render loops
  const generalDocs = [...(user.documents_generaux || [])].sort((a, b) => {
    const dateA = toDate(a.date_upload);
    const dateB = toDate(b.date_upload);
    return dateB.getTime() - dateA.getTime();
  });

  // Handle file selection
  const handleFileSelect = (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type) && !file.name.match(/\.(pdf|jpg|jpeg|png|webp|gif|doc|docx|xls|xlsx)$/i)) {
      toast.error('Type de fichier non supporté');
      return;
    }
    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      toast.error('Le fichier ne peut pas dépasser 10 MB');
      return;
    }
    setSelectedFile(file);
    // Default name: filename without extension
    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
    setDocumentName(nameWithoutExt);
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

    if (!documentName.trim()) {
      toast.error('Veuillez donner un nom au document');
      return;
    }

    setIsUploading(true);
    const toastId = toast.loading('Upload en cours...');

    try {
      // Generate file hash for deduplication
      const fileHash = await generateFileHash(selectedFile);

      // Check for duplicate
      const existingDoc = generalDocs.find(d => d.file_hash === fileHash);
      if (existingDoc) {
        toast.error('Ce document existe déjà', { id: toastId });
        setIsUploading(false);
        return;
      }

      // Create unique filename with timestamp
      const timestamp = Date.now();
      const fileName = `${timestamp}_${selectedFile.name}`;
      const storagePath = `clubs/${clubId}/members/${user.id}/documents/${fileName}`;

      // Upload to Firebase Storage
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, selectedFile);
      const downloadUrl = await getDownloadURL(storageRef);

      // Create document metadata with Firestore Timestamps
      const now = new Date();
      const auditEntry = {
        action: 'upload' as const,
        par: currentUserId,
        par_nom: currentUserName,
        date: Timestamp.fromDate(now)
      };

      const newDocumentForFirestore = {
        url: downloadUrl,
        nom_original: selectedFile.name,
        nom_affichage: documentName.trim(),
        type: selectedFile.type,
        taille: selectedFile.size,
        date_upload: Timestamp.fromDate(now),
        uploaded_by: currentUserId,
        uploaded_by_nom: currentUserName,
        file_hash: fileHash,
        historique: [auditEntry]
      };

      // Update Firestore
      const memberRef = doc(db, `clubs/${clubId}/members/${user.id}`);
      await updateDoc(memberRef, {
        documents_generaux: arrayUnion(newDocumentForFirestore)
      });

      // Update local state
      const updatedDocs = [...generalDocs, newDocumentForFirestore as GeneralDocument];
      onUpdate({
        documents_generaux: updatedDocs
      });

      toast.success('Document ajouté', { id: toastId });
      setShowUploadModal(false);
      setSelectedFile(null);
      setDocumentName('');
    } catch (error) {
      logger.error('Error uploading document:', error);
      toast.error('Erreur lors de l\'upload', { id: toastId });
    } finally {
      setIsUploading(false);
    }
  };

  // Delete document
  const handleDelete = async (document: GeneralDocument) => {
    if (!currentUserId || !currentUserName) return;

    const confirmed = window.confirm('Êtes-vous sûr de vouloir supprimer ce document ?');
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
        documents_generaux: arrayRemove(document)
      });

      // Update local state
      const updatedDocs = generalDocs.filter(d => d.url !== document.url);
      onUpdate({
        documents_generaux: updatedDocs
      });

      toast.success('Document supprimé', { id: toastId });
    } catch (error) {
      logger.error('Error deleting document:', error);
      toast.error('Erreur lors de la suppression', { id: toastId });
    }
  };

  return (
    <div className="space-y-6">
      {/* Documents list */}
      <div>
        <h3 className="font-medium text-gray-900 dark:text-dark-text-primary mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-500" />
          Documents ({generalDocs.length})
        </h3>

        {generalDocs.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-dark-text-muted">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Aucun document enregistré</p>
          </div>
        ) : (
          <div className="space-y-3">
            {generalDocs.map((document, index) => (
              <div
                key={document.url}
                className="p-4 rounded-lg border bg-white dark:bg-dark-bg-secondary border-gray-200 dark:border-dark-border"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                      {getFileIcon(document.type)}
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-dark-text-primary">
                        {document.nom_affichage}
                      </h4>
                      <div className="flex items-center gap-2 mt-1 text-sm text-gray-500 dark:text-dark-text-muted">
                        <span>{getFileTypeLabel(document.type)}</span>
                        <span>•</span>
                        <span>{formatFileSize(document.taille)}</span>
                        <span>•</span>
                        <span>{formatDate(document.date_upload)}</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
                        Uploadé par {document.uploaded_by_nom}
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
            ))}
          </div>
        )}
      </div>

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
            accept={ACCEPTED_EXTENSIONS}
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
            Glissez un fichier ici ou cliquez pour sélectionner
          </p>
          <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
            PDF, images, Word, Excel - max 10 MB
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
              setDocumentName('');
            }}
          />
          <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
            <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-dark-text-primary flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-500" />
                  Nouveau document
                </h3>
                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    setSelectedFile(null);
                    setDocumentName('');
                  }}
                  className="p-1 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    {getFileIcon(selectedFile.type)}
                    <span className="text-sm text-gray-600 dark:text-dark-text-secondary font-medium">
                      {selectedFile.name}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
                    {getFileTypeLabel(selectedFile.type)} • {formatFileSize(selectedFile.size)}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Nom du document *
                  </label>
                  <input
                    type="text"
                    value={documentName}
                    onChange={(e) => setDocumentName(e.target.value)}
                    placeholder="Ex: Attestation assurance 2025"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                  />
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    setSelectedFile(null);
                    setDocumentName('');
                  }}
                  className="flex-1 px-4 py-2 bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-200 font-medium"
                  disabled={isUploading}
                >
                  Annuler
                </button>
                <button
                  onClick={handleUpload}
                  disabled={isUploading || !documentName.trim()}
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
                  {getFileIcon(previewDocument.type)}
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
                {previewDocument.type === 'application/pdf' ? (
                  <PDFViewer
                    fileUrl={previewDocument.url}
                    fileName={previewDocument.nom_original}
                    className="h-full"
                  />
                ) : previewDocument.type.startsWith('image/') ? (
                  <ImageViewer
                    fileUrl={previewDocument.url}
                    fileName={previewDocument.nom_original}
                    className="h-full"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-dark-text-muted">
                    <FileText className="w-16 h-16 mb-4 opacity-50" />
                    <p className="text-lg mb-2">Aperçu non disponible</p>
                    <p className="text-sm text-gray-400 dark:text-dark-text-muted mb-4">
                      Ce type de fichier ne peut pas être prévisualisé
                    </p>
                    <a
                      href={previewDocument.url}
                      download={previewDocument.nom_original}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Télécharger le fichier
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
