import React, { useState, useEffect } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Save,
  AlertCircle,
  CheckCircle,
  Calendar,
  Euro,
  Building,
  Tag,
  User,
  FileText,
  Sparkles,
  ChevronDown,
  Info
} from 'lucide-react';
import { DocumentAnalysis } from '@/services/aiDocumentService';
import { Membre, Evenement, Categorie, AccountCode } from '@/types';
import { formatMontant, formatDate, cn } from '@/utils/utils';
import { CategorizationService } from '@/services/categorizationService';

interface DocumentReviewModalProps {
  files: File[];
  analyses: Map<string, DocumentAnalysis>;
  currentIndex: number;
  membres: Membre[];
  evenements: Evenement[];
  categories: Categorie[];
  onNavigate: (index: number) => void;
  onUpdateAnalysis: (fileName: string, updates: Partial<DocumentAnalysis>) => void;
  onCreateDemandes: () => Promise<void>;
  onClose: () => void;
}

export function DocumentReviewModal({
  files,
  analyses,
  currentIndex,
  membres,
  evenements,
  categories,
  onNavigate,
  onUpdateAnalysis,
  onCreateDemandes,
  onClose
}: DocumentReviewModalProps) {
  const currentFile = files[currentIndex];
  const currentAnalysis = currentFile ? analyses.get(currentFile.name) : undefined;
  const [localAnalysis, setLocalAnalysis] = useState<DocumentAnalysis | undefined>(currentAnalysis);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Charger les catégories et codes comptables depuis les paramètres
  const [accountCodes, setAccountCodes] = useState<AccountCode[]>([]);
  const [categoriesFromSettings, setCategoriesFromSettings] = useState<Categorie[]>([]);

  useEffect(() => {
    // Charger les codes comptables de dépenses
    const codes = CategorizationService.getAccountCodesByType(true); // true = dépenses
    setAccountCodes(codes);

    // Charger les catégories de dépenses
    const cats = CategorizationService.getCategoriesByType(true);
    setCategoriesFromSettings(cats);
  }, []);

  useEffect(() => {
    setLocalAnalysis(currentAnalysis);
  }, [currentAnalysis]);

  useEffect(() => {
    // Load file preview (images and PDFs)
    if (currentFile) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setFilePreview(e.target?.result as string);
      };
      reader.readAsDataURL(currentFile);
    } else {
      setFilePreview(null);
    }

    // Cleanup
    return () => {
      if (filePreview) {
        URL.revokeObjectURL(filePreview);
      }
    };
  }, [currentFile]);

  if (!currentFile || !localAnalysis) return null;

  const handleSaveAndNext = () => {
    if (localAnalysis) {
      onUpdateAnalysis(currentFile.name, localAnalysis);
    }
    
    if (currentIndex < files.length - 1) {
      onNavigate(currentIndex + 1);
    }
  };

  const handleSaveAndPrevious = () => {
    if (localAnalysis) {
      onUpdateAnalysis(currentFile.name, localAnalysis);
    }
    
    if (currentIndex > 0) {
      onNavigate(currentIndex - 1);
    }
  };

  const completedCount = Array.from(analyses.values()).filter(a => a.status === 'completed').length;
  const confidenceColor = localAnalysis.confiance > 80 ? 'text-green-600' : 
                          localAnalysis.confiance > 60 ? 'text-amber-600' : 
                          'text-red-600';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-xl w-full max-w-7xl h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-dark-border">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary">
                Révision des documents ({currentIndex + 1}/{files.length})
              </h2>
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                {currentFile.name}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600 dark:text-dark-text-secondary">
                <span className="font-medium">{completedCount}</span> / {files.length} validés
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 dark:bg-dark-bg-tertiary rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-4">
            <button
              onClick={handleSaveAndPrevious}
              disabled={currentIndex === 0}
              className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:bg-dark-bg-tertiary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
              Précédent
            </button>
            
            <div className="flex gap-1">
              {files.map((_, index) => {
                const analysis = analyses.get(files[index].name);
                return (
                  <button
                    key={index}
                    onClick={() => {
                      if (localAnalysis) {
                        onUpdateAnalysis(currentFile.name, localAnalysis);
                      }
                      onNavigate(index);
                    }}
                    className={cn(
                      "w-2 h-2 rounded-full transition-colors",
                      index === currentIndex 
                        ? "bg-calypso-blue" 
                        : analysis?.status === 'completed'
                        ? "bg-green-500"
                        : "bg-gray-300"
                    )}
                  />
                );
              })}
            </div>

            <button
              onClick={handleSaveAndNext}
              disabled={currentIndex === files.length - 1}
              className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:bg-dark-bg-tertiary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Suivant
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Document Preview */}
          <div className="w-1/2 p-6 border-r border-gray-200 dark:border-dark-border overflow-y-auto bg-gray-50 dark:bg-dark-bg-tertiary">
            <h3 className="font-medium text-gray-900 dark:text-dark-text-primary mb-4">Aperçu du document</h3>
            {currentFile.type.startsWith('image/') && filePreview ? (
              <img
                src={filePreview}
                alt={currentFile.name}
                className="w-full rounded-lg shadow-lg"
              />
            ) : currentFile.type === 'application/pdf' && filePreview ? (
              <iframe
                src={filePreview}
                className="w-full h-[calc(100vh-300px)] rounded-lg shadow-lg bg-white dark:bg-dark-bg-secondary"
                title={currentFile.name}
              />
            ) : (
              <div className="flex items-center justify-center h-64 bg-white dark:bg-dark-bg-secondary rounded-lg">
                <div className="text-center">
                  <FileText className="h-16 w-16 text-gray-400 dark:text-dark-text-muted mx-auto mb-2" />
                  <p className="text-gray-600 dark:text-dark-text-secondary">Chargement de l'aperçu...</p>
                </div>
              </div>
            )}
            
            {/* OCR Text if available */}
            {localAnalysis.texte_ocr && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">Texte extrait</h4>
                <pre className="text-xs bg-white dark:bg-dark-bg-secondary p-3 rounded border border-gray-200 dark:border-dark-border whitespace-pre-wrap">
                  {localAnalysis.texte_ocr}
                </pre>
              </div>
            )}
          </div>

          {/* Analysis Form */}
          <div className="w-1/2 p-6 overflow-y-auto">
            <div className="space-y-6">
              {/* Confidence Score */}
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-calypso-blue" />
                  <span className="text-sm font-medium">Confiance de l'analyse</span>
                </div>
                <span className={cn("font-bold", confidenceColor)}>
                  {localAnalysis.confiance}%
                </span>
              </div>

              {/* Basic Information */}
              <div>
                <h3 className="font-medium text-gray-900 dark:text-dark-text-primary mb-3">Informations extraites</h3>
                <div className="space-y-3">
                  {/* Amount */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                      <Euro className="h-4 w-4 inline mr-1" />
                      Montant
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={localAnalysis.montant}
                      onChange={(e) => setLocalAnalysis({
                        ...localAnalysis,
                        montant: parseFloat(e.target.value) || 0
                      })}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
                    />
                  </div>

                  {/* Date */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                      <Calendar className="h-4 w-4 inline mr-1" />
                      Date
                    </label>
                    <input
                      type="date"
                      value={localAnalysis.date ? formatDate(localAnalysis.date, 'yyyy-MM-dd') : ''}
                      onChange={(e) => setLocalAnalysis({
                        ...localAnalysis,
                        date: new Date(e.target.value)
                      })}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
                    />
                  </div>

                  {/* Supplier */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                      <Building className="h-4 w-4 inline mr-1" />
                      Fournisseur
                    </label>
                    <input
                      type="text"
                      value={localAnalysis.fournisseur.nom}
                      onChange={(e) => setLocalAnalysis({
                        ...localAnalysis,
                        fournisseur: { ...localAnalysis.fournisseur, nom: e.target.value }
                      })}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                      <FileText className="h-4 w-4 inline mr-1" />
                      Description
                    </label>
                    <textarea
                      value={localAnalysis.description}
                      onChange={(e) => setLocalAnalysis({
                        ...localAnalysis,
                        description: e.target.value
                      })}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent resize-none"
                    />
                  </div>

                  {/* Commentaire */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                      <FileText className="h-4 w-4 inline mr-1" />
                      Commentaire (optionnel)
                    </label>
                    <textarea
                      value={localAnalysis.commentaire || ''}
                      onChange={(e) => setLocalAnalysis({
                        ...localAnalysis,
                        commentaire: e.target.value
                      })}
                      rows={2}
                      placeholder="Ajoutez des notes ou précisions sur cette dépense..."
                      className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent resize-none"
                    />
                  </div>

                  {/* Category */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                      <Tag className="h-4 w-4 inline mr-1" />
                      Catégorie
                    </label>
                    <div className="relative">
                      <select
                        value={localAnalysis.categorie || ''}
                        onChange={(e) => {
                          const categoryId = e.target.value;
                          const category = categoriesFromSettings.find(c => c.id === categoryId);
                          setLocalAnalysis({
                            ...localAnalysis,
                            categorie: categoryId,
                            // Auto-sélectionner le code comptable par défaut de la catégorie
                            code_comptable: category?.compte_comptable || localAnalysis.code_comptable
                          });
                        }}
                        className="w-full pl-3 pr-10 py-2 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent appearance-none bg-white dark:bg-dark-bg-secondary"
                      >
                        <option value="">Sélectionner une catégorie</option>
                        {categoriesFromSettings.map(cat => (
                          <option key={cat.id} value={cat.id}>
                            {cat.nom}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-dark-text-muted pointer-events-none" />
                    </div>
                  </div>

                  {/* Code comptable */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                      <Info className="h-4 w-4 inline mr-1" />
                      Code comptable
                    </label>
                    <div className="relative">
                      <select
                        value={localAnalysis.code_comptable || ''}
                        onChange={(e) => setLocalAnalysis({
                          ...localAnalysis,
                          code_comptable: e.target.value
                        })}
                        className="w-full pl-3 pr-10 py-2 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent appearance-none bg-white dark:bg-dark-bg-secondary"
                      >
                        <option value="">Sélectionner un code comptable</option>

                        {/* Codes fréquemment utilisés */}
                        {accountCodes.filter(c => c.isFrequent).length > 0 && (
                          <>
                            <optgroup label="★ Fréquemment utilisés">
                              {accountCodes
                                .filter(code => code.isFrequent)
                                .map(code => (
                                  <option key={`freq-${code.code}`} value={code.code}>
                                    ★ {code.code} - {code.label}
                                  </option>
                                ))}
                            </optgroup>
                            {accountCodes.filter(c => !c.isFrequent).length > 0 && (
                              <option disabled>──────────────────</option>
                            )}
                          </>
                        )}

                        {/* Tous les autres codes */}
                        {accountCodes.filter(c => !c.isFrequent).length > 0 && (
                          <optgroup label="Tous les codes">
                            {accountCodes
                              .filter(code => !code.isFrequent)
                              .map(code => (
                                <option key={code.code} value={code.code}>
                                  {code.code} - {code.label}
                                </option>
                              ))}
                          </optgroup>
                        )}

                        {/* Si aucun code fréquent */}
                        {accountCodes.filter(c => c.isFrequent).length === 0 && (
                          accountCodes.map(code => (
                            <option key={code.code} value={code.code}>
                              {code.code} - {code.label}
                            </option>
                          ))
                        )}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-dark-text-muted pointer-events-none" />
                    </div>
                  </div>

                  {/* Requester */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                      <User className="h-4 w-4 inline mr-1" />
                      Demandeur suggéré
                    </label>
                    <select
                      value={localAnalysis.suggestions.demandeur || ''}
                      onChange={(e) => setLocalAnalysis({
                        ...localAnalysis,
                        suggestions: { ...localAnalysis.suggestions, demandeur: e.target.value }
                      })}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
                    >
                      <option value="">Sélectionner un demandeur</option>
                      {membres.map(membre => (
                        <option key={membre.id} value={membre.id}>
                          {membre.prenom} {membre.nom}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Event */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                      Événement lié (optionnel)
                    </label>
                    <select
                      value={localAnalysis.suggestions.evenement || ''}
                      onChange={(e) => setLocalAnalysis({
                        ...localAnalysis,
                        suggestions: { ...localAnalysis.suggestions, evenement: e.target.value }
                      })}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
                    >
                      <option value="">Aucune activité</option>
                      {evenements.map(evt => (
                        <option key={evt.id} value={evt.id}>
                          {evt.titre}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Articles if available */}
              {localAnalysis.articles && localAnalysis.articles.length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-dark-text-primary mb-3">Articles détectés</h3>
                  <div className="space-y-2">
                    {localAnalysis.articles.map((article, index) => (
                      <div key={index} className="p-3 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg text-sm">
                        <div className="flex justify-between">
                          <span className="font-medium">{article.description}</span>
                          <span>{formatMontant(article.prix_unitaire * article.quantite)}</span>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
                          Qté: {article.quantite} × {formatMontant(article.prix_unitaire)}
                          {article.tva && ` (TVA ${article.tva}%)`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Status */}
              <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="text-sm font-medium text-green-800">
                  Document prêt pour création de demande
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-dark-border">
          <div className="flex justify-between items-center">
            <button
              onClick={() => {
                if (localAnalysis) {
                  onUpdateAnalysis(currentFile.name, localAnalysis);
                }
              }}
              className="px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:bg-dark-bg-tertiary transition-colors"
            >
              <Save className="h-4 w-4 inline mr-2" />
              Sauvegarder les modifications
            </button>
            
            <button
              onClick={onCreateDemandes}
              disabled={completedCount === 0}
              className="px-6 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Créer {completedCount} demande{completedCount > 1 ? 's' : ''} de remboursement
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}