import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Upload,
  FileText,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
  Save,
  FolderCheck
} from 'lucide-react';
import { DocumentReviewView } from './DocumentReviewView';
import { useAuth } from '@/contexts/AuthContext';
import { db, storage } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { extractSequenceFromFilename, findTransactionBySequence, autoLinkExpenseToTransaction } from '@/services/transactionMatchingService';
import { analyzeBatchForDuplicates } from '@/services/documentDeduplicationService';
import { extractDateFromFilename } from '@/services/aiDocumentService';
import { Membre, Evenement, Categorie, DemandeRemboursement } from '@/types';
import toast from 'react-hot-toast';
import { cn } from '@/utils/utils';

interface FileWithAnalysis {
  file: File;
  sequence: string | null;
  transactionFound: boolean;
  transactionId?: string;
  demandeId?: string; // ID de la dépense créée
  status: 'pending' | 'uploading' | 'created' | 'error' | 'duplicate';
  error?: string;
  documentHash?: string; // Hash pour déduplication
  isDuplicate?: boolean; // Doublon dans Firestore
  duplicateInBatch?: boolean; // Doublon dans le batch actuel
}

export function DocumentReviewPage() {
  const navigate = useNavigate();
  const { clubId } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<FileWithAnalysis[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showReviewView, setShowReviewView] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [isLoadingFromFirestore, setIsLoadingFromFirestore] = useState(false);

  // Données pour les suggestions
  const [membres, setMembres] = useState<Membre[]>([]);
  const [evenements, setEvenements] = useState<Evenement[]>([]);

  // Charger membres et événements
  useEffect(() => {
    const fetchData = async () => {
      if (!clubId) return;

      try {
        // Charger les membres
        const membresRef = collection(db, 'clubs', clubId, 'members');
        const membresSnapshot = await getDocs(query(membresRef));
        const membresData = membresSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Membre[];
        setMembres(membresData);

        // Charger les événements
        // 🆕 MIGRATION: Read from 'operations' collection with type filter
        const evenementsRef = collection(db, 'clubs', clubId, 'operations');
        const eventsQuery = query(evenementsRef, where('type', '==', 'evenement'));
        const evenementsSnapshot = await getDocs(eventsQuery);
        const evenementsData = evenementsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Evenement[];
        setEvenements(evenementsData);
      } catch (error) {
        console.error('Erreur chargement données:', error);
      }
    };

    fetchData();
  }, [clubId]);

  // Fonction pour charger les dépenses existantes depuis Firestore
  // Affiche les dépenses "A compléter" sur cette page pour révision
  const loadExistingDemandes = async () => {
    if (!clubId) return;

    setIsLoadingFromFirestore(true);

    try {
      // Charger les dépenses incomplètes (description = "A compléter")
      const demandesRef = collection(db, 'clubs', clubId, 'demandes_remboursement');
      const q = query(demandesRef, where('description', '==', 'A compléter'));
      const snapshot = await getDocs(q);

      console.log(`📥 Chargement de ${snapshot.docs.length} dépense(s) à réviser depuis Firestore...`);

      if (snapshot.docs.length === 0) {
        toast('Aucune dépense à compléter trouvée', {
          icon: 'ℹ️',
          style: {
            background: '#EFF6FF',
            color: '#1E40AF',
            border: '1px solid #BFDBFE'
          }
        });
        setIsLoadingFromFirestore(false);
        return;
      }

      // Convertir les dépenses Firestore en FileWithAnalysis pour affichage
      const demandesAsFiles: FileWithAnalysis[] = [];

      for (const doc of snapshot.docs) {
        const data = doc.data();

        // Récupérer l'URL du document (nouveau format ou legacy)
        let documentUrl: string | null = null;
        let fileName = 'document.pdf';

        if (data.documents_justificatifs && data.documents_justificatifs.length > 0) {
          // Nouveau format avec métadonnées
          documentUrl = data.documents_justificatifs[0].url;
          fileName = data.documents_justificatifs[0].nom || fileName;
        } else if (data.urls_justificatifs && data.urls_justificatifs.length > 0) {
          // Format legacy
          documentUrl = data.urls_justificatifs[0];
          // Extraire le nom du fichier depuis l'URL
          const urlParts = documentUrl.split('/');
          const lastPart = urlParts[urlParts.length - 1];
          const fileNameMatch = lastPart.match(/[^?]+/); // Enlever les query params
          if (fileNameMatch) {
            fileName = decodeURIComponent(fileNameMatch[0].split('_').slice(1).join('_') || fileName);
          }
        }

        if (!documentUrl) {
          console.warn(`❌ Pas de document trouvé pour la dépense ${doc.id}`);
          continue; // Ignorer les dépenses sans document
        }

        try {
          // Télécharger le fichier depuis Firebase Storage
          console.log(`📥 Téléchargement de ${fileName}...`);
          const response = await fetch(documentUrl);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const blob = await response.blob();

          // Convertir le blob en File object
          const file = new File([blob], fileName, { type: blob.type || 'application/pdf' });

          demandesAsFiles.push({
            file,
            sequence: null,
            transactionFound: false,
            status: 'created' as const,
            demandeId: doc.id
          });
        } catch (error) {
          console.error(`❌ Erreur téléchargement document pour ${doc.id}:`, error);
          toast.error(`Impossible de charger ${fileName}`);
        }
      }

      if (demandesAsFiles.length === 0) {
        toast.error('Aucun document valide trouvé');
        setIsLoadingFromFirestore(false);
        return;
      }

      setFiles(demandesAsFiles);

      // Ouvrir automatiquement la vue de révision sur le premier document
      setReviewIndex(0);
      setShowReviewView(true);

      toast.success(`${demandesAsFiles.length} document(s) chargé(s) pour révision`);
    } catch (error) {
      console.error('Erreur chargement dépenses existantes:', error);
      toast.error('Erreur lors du chargement des dépenses');
    } finally {
      setIsLoadingFromFirestore(false);
    }
  };

  // Charger automatiquement les dépenses "À compléter" au montage du composant
  useEffect(() => {
    loadExistingDemandes();
  }, [clubId]);

  // Gestion drag & drop
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    const validFiles = droppedFiles.filter(file =>
      file.type.startsWith('image/') || file.type === 'application/pdf'
    );

    if (validFiles.length !== droppedFiles.length) {
      toast.error('Seuls les images et PDF sont acceptés');
    }

    addFiles(validFiles);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
    }
  };

  // Ajouter fichiers et analyser pour liaison automatique
  const addFiles = async (newFiles: File[]) => {
    if (!clubId) return;

    console.log(`📥 Ajout de ${newFiles.length} fichier(s)`);

    // 🔒 ÉTAPE 1: Analyse des doublons
    const duplicateInfo = await analyzeBatchForDuplicates(newFiles, clubId);

    const filesWithAnalysis: FileWithAnalysis[] = [];

    for (const file of newFiles) {
      const dupInfo = duplicateInfo.get(file.name);

      // Si c'est un doublon, marquer comme tel et passer au suivant
      if (dupInfo && (dupInfo.isDuplicate || dupInfo.duplicateInBatch)) {
        const hashPreview = dupInfo.hash.substring(0, 12);
        const reason = dupInfo.isDuplicate
          ? `Doublon détecté: Le contenu de ce fichier (hash: ${hashPreview}...) existe déjà dans les dépenses importées. Cliquez sur "Forcer" pour l'importer quand même.`
          : `Doublon dans le batch: Ce fichier apparaît plusieurs fois dans ce lot (hash: ${hashPreview}...). Seule la première occurrence sera importée, sauf si vous forcez.`;

        filesWithAnalysis.push({
          file,
          sequence: null,
          transactionFound: false,
          status: 'duplicate',
          documentHash: dupInfo.hash,
          isDuplicate: dupInfo.isDuplicate,
          duplicateInBatch: dupInfo.duplicateInBatch,
          error: reason
        });
        continue;
      }

      // 🔍 ÉTAPE 2: Extraire le numéro de séquence
      const sequence = extractSequenceFromFilename(file.name);

      let transactionFound = false;
      let transactionId: string | undefined;

      if (sequence && clubId) {
        // 🔍 ÉTAPE 3: Chercher la transaction correspondante
        console.log(`🔍 Recherche transaction pour ${sequence}...`);
        const transaction = await findTransactionBySequence(sequence, clubId);

        if (transaction) {
          transactionFound = true;
          transactionId = transaction.id;
          console.log(`✅ Transaction trouvée: ${transaction.id} (${transaction.montant}€)`);
        } else {
          console.log(`⚠️ Aucune transaction trouvée pour ${sequence}`);
        }
      }

      filesWithAnalysis.push({
        file,
        sequence,
        transactionFound,
        transactionId,
        status: 'pending',
        documentHash: dupInfo?.hash
      });
    }

    setFiles(prev => {
      const existingNames = new Set(prev.map(f => f.file.name));
      const uniqueNew = filesWithAnalysis.filter(f => !existingNames.has(f.file.name));
      return [...prev, ...uniqueNew];
    });

    // Toast selon le résultat
    const duplicateCount = filesWithAnalysis.filter(f => f.status === 'duplicate').length;
    const validCount = filesWithAnalysis.filter(f => f.status === 'pending').length;

    if (duplicateCount > 0) {
      toast(`${validCount} fichier(s) ajouté(s), ${duplicateCount} doublon(s) ignoré(s)`, {
        icon: '⚠️',
        style: {
          background: '#FEF3C7',
          color: '#92400E',
          border: '1px solid #FCD34D'
        }
      });
    } else {
      toast.success(`${filesWithAnalysis.length} fichier(s) ajouté(s)`);
    }
  };

  const removeFile = (fileName: string) => {
    setFiles(prev => prev.filter(f => f.file.name !== fileName));
  };

  // Créer toutes les dépenses immédiatement
  const handleCreateAllDemandes = async () => {
    if (!clubId || files.length === 0) return;

    // Filtrer les doublons
    const validFiles = files.filter(f => f.status === 'pending');
    if (validFiles.length === 0) {
      toast.error('Aucun fichier valide à importer (tous sont des doublons)');
      return;
    }

    setIsCreating(true);

    try {
      console.log(`🚀 Création de ${validFiles.length} dépense(s)...`);

      for (let i = 0; i < validFiles.length; i++) {
        const fileData = validFiles[i];

        // Mise à jour statut
        setFiles(prev =>
          prev.map(f =>
            f.file.name === fileData.file.name
              ? { ...f, status: 'uploading' as const }
              : f
          )
        );

        try {
          // Upload du fichier dans Storage
          const timestamp = Date.now();
          const safeName = fileData.file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
          const storageRef = ref(storage, `clubs/${clubId}/justificatifs/${timestamp}_${safeName}`);

          console.log(`📤 Upload fichier: ${fileData.file.name}`);
          const snapshot = await uploadBytes(storageRef, fileData.file);
          const downloadUrl = await getDownloadURL(snapshot.ref);

          // 📅 Extraire la date du nom de fichier (format YYMMDD)
          const extractedDate = extractDateFromFilename(fileData.file.name);

          // Préparer les données de la dépense
          let demandeData: any = {
            club_id: clubId,
            fiscal_year_id: selectedFiscalYear?.id || null,  // Required by Firestore Rules
            titre: fileData.file.name.replace(/\.(pdf|jpg|jpeg|png)$/i, ''),
            montant: 0, // À remplir manuellement
            date_depense: extractedDate || new Date(), // Date extraite ou aujourd'hui
            description: 'A compléter',
            statut: 'en_attente',
            urls_justificatifs: [downloadUrl],
            document_hash: fileData.documentHash, // Hash pour déduplication
            created_at: serverTimestamp(),
            updated_at: serverTimestamp(),
            created_by: 'manual_upload'
          };

          // 🔗 Si transaction trouvée, pré-remplir les données
          if (fileData.transactionFound && fileData.transactionId) {
            const transaction = await findTransactionBySequence(fileData.sequence!, clubId);
            if (transaction) {
              demandeData = {
                ...demandeData,
                montant: Math.abs(transaction.montant),
                description: `Dépense liée à ${transaction.contrepartie_nom}`,
                date_depense: transaction.date_execution,
                // Lien avec la transaction
                transaction_link: {
                  transaction_id: transaction.id,
                  sequence: fileData.sequence,
                  auto_linked: true
                }
              };
              console.log(`✅ Pré-remplissage avec transaction ${fileData.sequence}`);
            }
          }

          // Créer la dépense dans Firestore
          const demandesRef = collection(db, 'clubs', clubId, 'demandes_remboursement');
          const docRef = await addDoc(demandesRef, demandeData);

          console.log(`✅ Dépense créée: ${docRef.id}`);

          // 🔗 IMPORTANT: Créer la liaison dans matched_entities de la transaction
          if (fileData.transactionFound && fileData.transactionId && fileData.sequence) {
            try {
              await autoLinkExpenseToTransaction(
                docRef.id, // ID de la dépense
                demandeData.titre, // Nom pour affichage
                fileData.transactionId, // ID de la transaction
                clubId
              );
              console.log(`✅ Liaison créée dans matched_entities pour transaction ${fileData.sequence}`);
            } catch (linkError) {
              console.error(`⚠️ Erreur liaison matched_entities:`, linkError);
              // On continue quand même, la dépense est créée
            }
          }

          // Mise à jour statut succès
          setFiles(prev =>
            prev.map(f =>
              f.file.name === fileData.file.name
                ? { ...f, status: 'created' as const, demandeId: docRef.id }
                : f
            )
          );
        } catch (error) {
          console.error(`❌ Erreur pour ${fileData.file.name}:`, error);

          // Mise à jour statut erreur
          setFiles(prev =>
            prev.map(f =>
              f.file.name === fileData.file.name
                ? {
                    ...f,
                    status: 'error' as const,
                    error: error instanceof Error ? error.message : 'Erreur inconnue'
                  }
                : f
            )
          );
        }
      }

      const successCount = files.filter(f => f.status === 'created').length;
      toast.success(`✅ ${successCount} dépense(s) créée(s) avec succès !`);

      // Passer à la vue de révision
      setReviewIndex(0);
      setShowReviewView(true);
    } catch (error) {
      console.error('Erreur création dépenses:', error);
      toast.error('Erreur lors de la création des dépenses');
    } finally {
      setIsCreating(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Si vue révision, afficher le composant de révision
  if (showReviewView) {
    // Filtrer uniquement les fichiers avec demandeId (dépenses créées)
    const filesWithDemandes = files.filter(f => f.demandeId);

    if (filesWithDemandes.length === 0) {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
          <div className="max-w-7xl mx-auto">
            <button
              onClick={() => setShowReviewView(false)}
              className="flex items-center gap-2 text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:text-dark-text-primary mb-4"
            >
              <ArrowLeft className="h-5 w-5" />
              Retour à l'upload
            </button>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-amber-800">
                ⚠️ Aucune dépense à réviser
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <DocumentReviewView
        files={filesWithDemandes.map(f => ({
          file: f.file,
          sequence: f.sequence,
          transactionFound: f.transactionFound,
          transactionId: f.transactionId,
          demandeId: f.demandeId!
        }))}
        currentIndex={reviewIndex}
        membres={membres}
        evenements={evenements}
        onNavigate={(index) => setReviewIndex(index)}
        onClose={() => setShowReviewView(false)}
      />
    );
  }

  // Si en cours de chargement depuis Firestore, afficher uniquement le loader
  if (isLoadingFromFirestore) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <button
              onClick={() => navigate('/parametres/import-batch')}
              className="flex items-center gap-2 text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:text-dark-text-primary transition-colors mb-4"
            >
              <ArrowLeft className="h-5 w-5" />
              Retour à l'import batch
            </button>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text-primary">Révision des documents</h1>
            <p className="text-gray-600 dark:text-dark-text-secondary mt-2">
              Chargement des dépenses à réviser...
            </p>
          </div>

          {/* Loading indicator */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
              <div className="text-sm text-blue-800">
                <p className="font-medium">Chargement des dépenses existantes...</p>
                <p className="text-xs mt-0.5">Recherche des dépenses à réviser dans Firestore</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/parametres/import-batch')}
            className="flex items-center gap-2 text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:text-dark-text-primary transition-colors mb-4"
          >
            <ArrowLeft className="h-5 w-5" />
            Retour à l'import batch
          </button>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text-primary">Révision des documents</h1>
          <p className="text-gray-600 dark:text-dark-text-secondary mt-2">
            Uploadez vos documents, créez les dépenses immédiatement, puis révisez-les une par une
          </p>
        </div>

        {/* Bouton pour aller voir les dépenses à compléter */}
        {files.length === 0 && !isLoadingFromFirestore && (
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-6 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex gap-3">
                <AlertCircle className="h-6 w-6 text-purple-600 flex-shrink-0" />
                <div>
                  <p className="font-medium text-purple-900 mb-1">
                    Dépenses déjà créées à compléter ?
                  </p>
                  <p className="text-sm text-purple-700">
                    Vérifiez s'il y a des dépenses en attente de complétion et accédez-y directement.
                  </p>
                </div>
              </div>
              <button
                onClick={loadExistingDemandes}
                disabled={isLoadingFromFirestore}
                className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
              >
                {isLoadingFromFirestore ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Vérification...
                  </>
                ) : (
                  <>
                    <FolderCheck className="h-4 w-4" />
                    Voir les dépenses
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Info box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">💡 Astuce : Nommage intelligent</p>
              <p>
                Nommez vos fichiers avec le numéro de transaction (ex: <code className="bg-blue-100 px-1 rounded">2025-00302-00312_facture.pdf</code>)
                pour une liaison automatique avec la transaction bancaire correspondante.
              </p>
            </div>
          </div>
        </div>

        {/* Upload zone */}
        <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-4">1. Upload des documents</h2>

          <div
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all',
              isDragging
                ? 'border-calypso-blue bg-blue-50'
                : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
            )}
          >
            <Upload className="h-12 w-12 text-gray-400 dark:text-dark-text-muted mx-auto mb-3" />
            <p className="text-gray-700 dark:text-dark-text-primary font-medium mb-1">
              {isDragging ? 'Déposez les fichiers ici' : 'Glissez-déposez vos documents ici'}
            </p>
            <p className="text-gray-500 dark:text-dark-text-muted text-sm">
              ou <span className="text-calypso-blue font-medium">parcourez</span> pour sélectionner
            </p>
            <p className="text-xs text-gray-400 dark:text-dark-text-muted mt-2">Formats acceptés: Images (JPG, PNG) et PDF</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Files list */}
          {files.length > 0 && (
            <div className="mt-6">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-medium text-gray-900 dark:text-dark-text-primary">Documents ({files.length})</h3>
                <button
                  onClick={() => setFiles([])}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Tout supprimer
                </button>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {files.map((fileData) => (
                  <div
                    key={fileData.file.name}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-lg',
                      fileData.status === 'created' ? 'bg-green-50 border border-green-200' :
                      fileData.status === 'error' ? 'bg-red-50 border border-red-200' :
                      fileData.status === 'duplicate' ? 'bg-amber-50 border border-amber-200' :
                      fileData.status === 'uploading' ? 'bg-blue-50 border border-blue-200' :
                      'bg-gray-50 border border-gray-200'
                    )}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <FileText className="h-5 w-5 text-gray-400 dark:text-dark-text-muted flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary truncate">
                          {fileData.file.name}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                            {formatFileSize(fileData.file.size)}
                          </p>
                          {/* Badge transaction trouvée */}
                          {fileData.transactionFound && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                              <CheckCircle className="h-3 w-3" />
                              Transaction {fileData.sequence} liée
                            </span>
                          )}
                          {/* Badge numéro détecté mais pas trouvé */}
                          {fileData.sequence && !fileData.transactionFound && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-dark-bg-tertiary text-gray-600 dark:text-dark-text-secondary rounded-full text-xs">
                              <AlertCircle className="h-3 w-3" />
                              {fileData.sequence} non trouvée
                            </span>
                          )}
                          {/* Badge statut */}
                          {fileData.status === 'created' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                              <CheckCircle className="h-3 w-3" />
                              Dépense créée
                            </span>
                          )}
                          {fileData.status === 'duplicate' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                              <AlertCircle className="h-3 w-3" />
                              {fileData.duplicateInBatch ? 'Doublon dans ce batch' : 'Déjà importé'}
                            </span>
                          )}
                          {fileData.status === 'error' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs">
                              <X className="h-3 w-3" />
                              Erreur
                            </span>
                          )}
                        </div>
                        {/* Message explicatif détaillé pour les doublons */}
                        {fileData.status === 'duplicate' && fileData.error && (
                          <p className="text-xs text-amber-700 mt-1.5 leading-relaxed">
                            ℹ️ {fileData.error}
                          </p>
                        )}
                        {/* Message d'erreur pour les autres erreurs */}
                        {fileData.status === 'error' && fileData.error && (
                          <p className="text-xs text-red-700 mt-1">
                            {fileData.error}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {fileData.status === 'uploading' && (
                        <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                      )}
                      {fileData.status === 'duplicate' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Forcer l'insertion en changeant le statut
                            setFiles(prev =>
                              prev.map(f =>
                                f.file.name === fileData.file.name
                                  ? { ...f, status: 'pending' as const, isDuplicate: false, duplicateInBatch: false }
                                  : f
                              )
                            );
                            toast.success(`✅ ${fileData.file.name} sera maintenant importé`);
                          }}
                          className="px-2 py-1 text-xs bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors"
                          title="Forcer l'insertion malgré le doublon"
                        >
                          Forcer
                        </button>
                      )}
                      {fileData.status === 'pending' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(fileData.file.name);
                          }}
                          className="p-1 hover:bg-gray-200 rounded transition-colors"
                        >
                          <X className="h-4 w-4 text-gray-500 dark:text-dark-text-muted" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        {files.length > 0 && (
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-4">
              2. Créer les dépenses
            </h2>
            <p className="text-sm text-gray-600 dark:text-dark-text-secondary mb-4">
              Les dépenses seront créées immédiatement avec les informations disponibles.
              Vous pourrez ensuite les réviser une par une.
            </p>
            <button
              onClick={handleCreateAllDemandes}
              disabled={isCreating || files.filter(f => f.status === 'pending').length === 0}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Création en cours...
                </>
              ) : (
                <>
                  <Save className="h-5 w-5" />
                  Créer {files.filter(f => f.status === 'pending').length} dépense{files.filter(f => f.status === 'pending').length > 1 ? 's' : ''} maintenant
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
