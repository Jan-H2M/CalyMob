import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Upload,
  FileText,
  Sparkles,
  Loader2,
  AlertCircle,
  CheckCircle,
  Image as ImageIcon
} from 'lucide-react';
import { aiDocumentService, DocumentAnalysis } from '@/services/aiDocumentService';
import { formatMontant, formatDate } from '@/utils/utils';
import toast from 'react-hot-toast';

export function AITestPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<DocumentAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const aiConfig = aiDocumentService.getConfig();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setAnalysis(null);

    // Generate preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
    };
    reader.readAsDataURL(selectedFile);
  };

  const handleAnalyze = async () => {
    if (!file) return;

    setIsAnalyzing(true);
    console.log('=== Starting AI Analysis ===');
    console.log('File:', file.name, file.type, file.size);
    console.log('AI Config:', aiConfig);

    try {
      const result = await aiDocumentService.analyzeDocument(file, {
        useAI: aiConfig.isConfigured,
        categories: [
          { id: 'materiel', nom: 'Matériel', type: 'depense', couleur: '', description: '' },
          { id: 'transport', nom: 'Transport', type: 'depense', couleur: '', description: '' },
          { id: 'alimentation', nom: 'Alimentation', type: 'depense', couleur: '', description: '' },
          { id: 'restaurant', nom: 'Restaurant', type: 'depense', couleur: '', description: '' },
          { id: 'autre', nom: 'Autre', type: 'depense', couleur: '', description: '' }
        ]
      });

      console.log('=== Analysis Result ===');
      console.log(result);

      setAnalysis(result);

      if (result.status === 'completed') {
        toast.success('Analyse terminée avec succès');
      } else if (result.status === 'error') {
        toast.error(`Erreur: ${result.error}`);
      }
    } catch (error) {
      console.error('Analysis error:', error);
      toast.error('Erreur lors de l\'analyse');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/parametres')}
            className="flex items-center gap-2 text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:text-dark-text-primary transition-colors mb-4"
          >
            <ArrowLeft className="h-5 w-5" />
            Retour aux paramètres
          </button>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text-primary">Test de l'analyse IA</h1>
          <p className="text-gray-600 dark:text-dark-text-secondary mt-2">Testez l'analyse automatique de documents</p>
        </div>

        {/* AI Status */}
        <div className="mb-6 p-4 bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="h-6 w-6 text-purple-600" />
              <div>
                <p className="font-medium text-gray-900 dark:text-dark-text-primary">
                  Statut: {aiConfig.isConfigured ? 'IA configurée' : 'Mode démonstration'}
                </p>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                  Provider: {aiConfig.provider}
                </p>
              </div>
            </div>
            {!aiConfig.isConfigured && (
              <div className="flex items-center gap-2 text-amber-600">
                <AlertCircle className="h-5 w-5" />
                <span className="text-sm">Générera des données de démo</span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Left Panel - Upload & Preview */}
          <div className="space-y-4">
            {/* Upload */}
            <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-4">1. Sélectionner un document</h2>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                onChange={handleFileSelect}
                className="hidden"
                id="test-file-upload"
              />

              <label
                htmlFor="test-file-upload"
                className="block w-full p-8 border-2 border-dashed border-gray-300 dark:border-dark-border rounded-lg hover:border-calypso-blue cursor-pointer transition-colors text-center"
              >
                <Upload className="h-12 w-12 text-gray-400 dark:text-dark-text-muted mx-auto mb-3" />
                <p className="text-gray-700 dark:text-dark-text-primary font-medium">
                  {file ? file.name : 'Cliquez pour sélectionner un fichier'}
                </p>
                <p className="text-sm text-gray-500 dark:text-dark-text-muted mt-1">
                  Images (JPG, PNG) ou PDF
                </p>
              </label>

              {file && (
                <div className="mt-4 p-3 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-gray-500 dark:text-dark-text-muted" />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">{file.name}</p>
                      <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                        {file.type} • {(file.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Preview */}
            {preview && (
              <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-4">Aperçu</h2>
                {file?.type.startsWith('image/') ? (
                  <img
                    src={preview}
                    alt="Preview"
                    className="w-full rounded-lg border border-gray-200 dark:border-dark-border"
                  />
                ) : file?.type === 'application/pdf' ? (
                  <iframe
                    src={preview}
                    className="w-full h-96 rounded-lg border border-gray-200 dark:border-dark-border"
                    title="PDF Preview"
                  />
                ) : null}
              </div>
            )}

            {/* Analyze Button */}
            {file && (
              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="w-full px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Analyse en cours...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    Analyser le document
                  </>
                )}
              </button>
            )}
          </div>

          {/* Right Panel - Results */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-4">2. Résultat de l'analyse</h2>

            {!analysis ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400 dark:text-dark-text-muted">
                <Sparkles className="h-16 w-16 mb-3" />
                <p>Les résultats apparaîtront ici</p>
              </div>
            ) : analysis.status === 'error' ? (
              <div className="p-4 bg-red-50 rounded-lg">
                <div className="flex items-center gap-2 text-red-800">
                  <AlertCircle className="h-5 w-5" />
                  <p className="font-medium">Erreur lors de l'analyse</p>
                </div>
                <p className="text-sm text-red-600 mt-2">{analysis.error}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Confidence */}
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg">
                  <span className="text-sm font-medium text-gray-700 dark:text-dark-text-primary">Confiance</span>
                  <span className={`font-bold ${
                    analysis.confiance > 80 ? 'text-green-600' :
                    analysis.confiance > 60 ? 'text-amber-600' :
                    'text-red-600'
                  }`}>
                    {analysis.confiance}%
                  </span>
                </div>

                {/* Extracted Data */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">Montant</label>
                    <div className="p-2 bg-gray-50 dark:bg-dark-bg-tertiary rounded border border-gray-200 dark:border-dark-border">
                      {formatMontant(analysis.montant)}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">Date</label>
                    <div className="p-2 bg-gray-50 dark:bg-dark-bg-tertiary rounded border border-gray-200 dark:border-dark-border">
                      {formatDate(analysis.date)}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">Fournisseur</label>
                    <div className="p-2 bg-gray-50 dark:bg-dark-bg-tertiary rounded border border-gray-200 dark:border-dark-border">
                      {analysis.fournisseur.nom}
                      {analysis.fournisseur.tva && (
                        <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">TVA: {analysis.fournisseur.tva}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">Description</label>
                    <div className="p-2 bg-gray-50 dark:bg-dark-bg-tertiary rounded border border-gray-200 dark:border-dark-border">
                      {analysis.description}
                    </div>
                  </div>

                  {analysis.categorie && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">Catégorie</label>
                      <div className="p-2 bg-gray-50 dark:bg-dark-bg-tertiary rounded border border-gray-200 dark:border-dark-border">
                        {analysis.categorie}
                      </div>
                    </div>
                  )}
                </div>

                {/* Articles */}
                {analysis.articles && analysis.articles.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">Articles détectés</label>
                    <div className="space-y-2">
                      {analysis.articles.map((article, idx) => (
                        <div key={idx} className="p-3 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg text-sm">
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

                {/* OCR Text */}
                {analysis.texte_ocr && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">Texte extrait (OCR)</label>
                    <pre className="p-3 bg-gray-50 dark:bg-dark-bg-tertiary rounded border border-gray-200 dark:border-dark-border text-xs whitespace-pre-wrap">
                      {analysis.texte_ocr}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
