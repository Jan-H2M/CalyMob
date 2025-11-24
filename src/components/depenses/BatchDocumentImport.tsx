import React, { useState, useRef } from 'react';
import {
  Upload,
  FileText,
  X,
  AlertCircle,
  CheckCircle,
  Loader2,
  Eye,
  ChevronRight,
  ChevronLeft,
  Save,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { aiDocumentService, DocumentAnalysis } from '@/services/aiDocumentService';
import { DemandeRemboursement, Membre, Evenement, Categorie } from '@/types';
import { formatMontant, formatDate, cn } from '@/utils/utils';
import { DocumentReviewModal } from './DocumentReviewModal';
import toast from 'react-hot-toast';

interface BatchDocumentImportProps {
  membres: Membre[];
  evenements: Evenement[];
  categories: Categorie[];
  clubId: string; // 🆕 Ajout du clubId
  onCreateDemandes: (demandes: Partial<DemandeRemboursement>[], files?: File[]) => Promise<void>;
  isOpen: boolean;
  onClose: () => void;
}

export function BatchDocumentImport({
  membres,
  evenements,
  categories,
  clubId, // 🆕
  onCreateDemandes,
  isOpen,
  onClose
}: BatchDocumentImportProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [analyses, setAnalyses] = useState<Map<string, DocumentAnalysis>>(new Map());
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const aiConfig = aiDocumentService.getConfig();

  if (!isOpen) return null;

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

  const addFiles = (newFiles: File[]) => {
    setFiles(prev => {
      const existingNames = new Set(prev.map(f => f.name));
      const uniqueNewFiles = newFiles.filter(f => !existingNames.has(f.name));
      return [...prev, ...uniqueNewFiles];
    });
  };

  const removeFile = (fileName: string) => {
    setFiles(prev => prev.filter(f => f.name !== fileName));
    setAnalyses(prev => {
      const newAnalyses = new Map(prev);
      newAnalyses.delete(fileName);
      return newAnalyses;
    });
  };

  const analyzeDocuments = async () => {
    if (files.length === 0) return;

    setIsAnalyzing(true);
    try {
      const results = await aiDocumentService.analyzeBatch(files, {
        categories,
        evenements_recents: evenements,
        membres,
        useAI: aiConfig.isConfigured,
        clubId // 🆕 Passer le clubId pour le matching automatique
      });

      setAnalyses(results);
      setShowReview(true);

      toast.success(`${files.length} documents analysés avec succès`);
    } catch (error) {
      console.error('Analysis error:', error);
      toast.error('Erreur lors de l\'analyse des documents');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const currentFile = files[currentFileIndex];
  const currentAnalysis = currentFile ? analyses.get(currentFile.name) : undefined;

  return (
    <>
      {/* Main Import Modal */}
      {!showReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-dark-border">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary">Import intelligent de documents</h2>
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                    Importez vos factures et reçus pour créer automatiquement des demandes
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 dark:bg-dark-bg-tertiary rounded-lg transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 p-6 overflow-y-auto">
              {/* AI Status */}
              {!aiConfig.isConfigured && (
                <div className="mb-4 p-4 bg-amber-50 rounded-lg">
                  <div className="flex gap-2">
                    <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-amber-800">Mode démonstration</p>
                      <p className="text-amber-600">
                        L'analyse IA n'est pas configurée. Les documents seront analysés avec des données de démonstration.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Drop zone */}
              <div
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all",
                  isDragging 
                    ? "border-calypso-blue bg-blue-50" 
                    : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
                )}
              >
                <Upload className="h-12 w-12 text-gray-400 dark:text-dark-text-muted mx-auto mb-3" />
                <p className="text-gray-700 dark:text-dark-text-primary font-medium mb-1">
                  {isDragging ? "Déposez les fichiers ici" : "Glissez-déposez vos documents ici"}
                </p>
                <p className="text-gray-500 dark:text-dark-text-muted text-sm">
                  ou <span className="text-calypso-blue font-medium">parcourez</span> pour sélectionner
                </p>
                <p className="text-xs text-gray-400 dark:text-dark-text-muted mt-2">
                  Formats acceptés: Images (JPG, PNG) et PDF
                </p>
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
                    <h3 className="font-medium text-gray-900 dark:text-dark-text-primary">
                      Documents sélectionnés ({files.length})
                    </h3>
                    <button
                      onClick={() => {
                        setFiles([]);
                        setAnalyses(new Map());
                      }}
                      className="text-sm text-red-600 hover:text-red-700"
                    >
                      Tout supprimer
                    </button>
                  </div>
                  
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {files.map((file) => {
                      const analysis = analyses.get(file.name);
                      return (
                        <div
                          key={file.name}
                          className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg"
                        >
                          <div className="flex items-center gap-3 flex-1">
                            <FileText className="h-5 w-5 text-gray-400 dark:text-dark-text-muted" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">{file.name}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <p className="text-xs text-gray-500 dark:text-dark-text-muted">{formatFileSize(file.size)}</p>
                                {/* 🆕 Badge transaction trouvée */}
                                {analysis && analysis.transaction_found && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                    <CheckCircle className="h-3 w-3" />
                                    Transaction {analysis.transaction_sequence} liée
                                  </span>
                                )}
                                {/* 🆕 Badge numéro détecté mais pas trouvé */}
                                {analysis && analysis.transaction_sequence && !analysis.transaction_found && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-dark-bg-tertiary text-gray-600 dark:text-dark-text-secondary rounded-full text-xs">
                                    <AlertCircle className="h-3 w-3" />
                                    {analysis.transaction_sequence} non trouvée
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {analysis && (
                              <div className="flex items-center gap-1">
                                {analysis.status === 'completed' && (
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                )}
                                {analysis.status === 'error' && (
                                  <AlertCircle className="h-4 w-4 text-red-500" />
                                )}
                                {analysis.status === 'analyzing' && (
                                  <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                                )}
                              </div>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFile(file.name);
                              }}
                              className="p-1 hover:bg-gray-200 rounded transition-colors"
                            >
                              <X className="h-4 w-4 text-gray-500 dark:text-dark-text-muted" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200 dark:border-dark-border">
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:bg-dark-bg-tertiary transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={analyzeDocuments}
                  disabled={files.length === 0 || isAnalyzing}
                  className="flex-1 px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analyse en cours...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Analyser {files.length} document{files.length > 1 ? 's' : ''}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {showReview && currentFile && (
        <DocumentReviewModal
          files={files}
          analyses={analyses}
          currentIndex={currentFileIndex}
          membres={membres}
          evenements={evenements}
          categories={categories}
          onNavigate={(index) => setCurrentFileIndex(index)}
          onUpdateAnalysis={(fileName, updates) => {
            setAnalyses(prev => {
              const newAnalyses = new Map(prev);
              const current = newAnalyses.get(fileName);
              if (current) {
                newAnalyses.set(fileName, { ...current, ...updates });
              }
              return newAnalyses;
            });
          }}
          onCreateDemandes={async () => {
            // Convert analyses to demandes
            const demandes: Partial<DemandeRemboursement>[] = [];
            
            analyses.forEach((analysis, fileName) => {
              if (analysis.status === 'completed') {
                // Construire la description complète avec le commentaire si présent
                let fullDescription = analysis.description || `Facture du ${formatDate(analysis.date)}`;
                if (analysis.commentaire) {
                  fullDescription += `\n\nCommentaire: ${analysis.commentaire}`;
                }

                demandes.push({
                  titre: `Remboursement - ${analysis.fournisseur.nom}`,
                  description: fullDescription,
                  montant: analysis.montant,
                  date_depense: analysis.date,
                  categorie: analysis.categorie,
                  code_comptable: analysis.code_comptable, // Ajouter le code comptable
                  statut: 'brouillon',
                  pieces_jointes: [fileName],
                  // Will be completed by the parent component
                  demandeur_id: analysis.suggestions.demandeur || membres[0]?.id,
                  evenement_id: analysis.suggestions.evenement
                });
              }
            });
            
            if (demandes.length > 0) {
              await onCreateDemandes(demandes, files);
              toast.success(`${demandes.length} demande(s) créée(s) avec succès`);
              onClose();
            } else {
              toast.error('Aucune demande à créer');
            }
          }}
          onClose={() => {
            setShowReview(false);
            setCurrentFileIndex(0);
          }}
        />
      )}
    </>
  );
}