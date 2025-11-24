import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Loader2,
  CheckCircle,
  AlertCircle,
  Brain,
  TrendingUp
} from 'lucide-react';
import { AIInscriptionMatchingService, AIInscriptionMatchAnalysis } from '@/services/aiInscriptionMatchingService';
import { TransactionBancaire, InscriptionEvenement } from '@/types';
import { formatMontant, formatDate, cn } from '@/utils/utils';
import { AIMatchValidationDialog } from './AIMatchValidationDialog';
import toast from 'react-hot-toast';

interface AIInscriptionMatcherProps {
  isOpen: boolean;
  onClose: () => void;
  clubId: string;
  eventId: string;
  userId: string;
  unmatchedTransactions: TransactionBancaire[];
  unmatchedInscriptions: InscriptionEvenement[];
  eventContext?: { titre: string; lieu: string; date_debut: Date; date_fin: Date };
  onMatchesValidated: (matches: Map<string, AIInscriptionMatchAnalysis>) => void;
}

/**
 * Composant UI pour l'analyse IA des inscriptions
 * OPTIMISÉ: Batch API call (1 appel au lieu de 20) + validation manuelle
 */
export function AIInscriptionMatcher({
  isOpen,
  onClose,
  clubId,
  eventId,
  userId,
  unmatchedTransactions,
  unmatchedInscriptions,
  eventContext,
  onMatchesValidated
}: AIInscriptionMatcherProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, message: '' });
  const [results, setResults] = useState<Map<string, AIInscriptionMatchAnalysis>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [showValidationDialog, setShowValidationDialog] = useState(false);

  const aiService = new AIInscriptionMatchingService();

  if (!isOpen) return null;

  const handleAnalyze = async () => {
    if (!aiService.isAvailable()) {
      setError('API IA non configurée. Allez dans Settings → IA pour configurer votre clé API.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setResults(new Map());

    try {
      // Nouvelle méthode batch optimisée (1 seul appel API)
      const matches = await aiService.hybridMatching(
        clubId,
        eventId,
        userId,
        unmatchedTransactions,
        unmatchedInscriptions,
        eventContext,
        100, // Max 100 transactions après filtrage intelligent
        (current, total, message) => {
          setProgress({ current, total, message });
        }
      );

      setResults(matches);

      if (matches.size > 0) {
        // Ouvrir le dialog de validation au lieu de sauvegarder automatiquement
        setShowValidationDialog(true);
        toast.success(`✨ ${matches.size} correspondance(s) trouvée(s) - vérifiez et validez`);
      } else {
        toast('Aucune correspondance trouvée par l\'IA', { icon: 'ℹ️' });
      }
    } catch (error: any) {
      console.error('Erreur analyse IA:', error);
      setError(error.message || 'Erreur lors de l\'analyse IA');
      toast.error('Erreur lors de l\'analyse IA');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleValidation = (validatedMatches: Map<string, AIInscriptionMatchAnalysis>) => {
    setShowValidationDialog(false);
    onMatchesValidated(validatedMatches);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-[80]"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[90] bg-white dark:bg-dark-bg-secondary rounded-lg shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border bg-gradient-to-r from-purple-600 to-blue-600">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Brain className="h-6 w-6 text-white" />
              <div>
                <h2 className="text-xl font-bold text-white">Analyse IA - Inscriptions</h2>
                <p className="text-purple-100 text-sm mt-1">
                  Intelligence artificielle pour le matching automatique
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white dark:bg-dark-bg-secondary/10 rounded-lg transition-colors"
            >
              <X className="h-5 w-5 text-white" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-600 font-medium">Transactions non-matchées</p>
                  <p className="text-2xl font-bold text-blue-900 mt-1">{unmatchedTransactions.length}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-blue-400" />
              </div>
            </div>

            <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-orange-600 font-medium">Inscriptions non-payées</p>
                  <p className="text-2xl font-bold text-orange-900 mt-1">{unmatchedInscriptions.length}</p>
                </div>
                <Sparkles className="h-8 w-8 text-orange-400" />
              </div>
            </div>
          </div>

          {/* Info Box */}
          {!isAnalyzing && results.size === 0 && (
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-300 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-3">
                <Sparkles className="h-6 w-6 text-purple-600 flex-shrink-0" />
                <p className="text-sm text-purple-900 font-medium">
                  L'IA va analyser les transactions et proposer des correspondances automatiques
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-red-900 mb-1">Erreur</h3>
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Progress */}
          {isAnalyzing && (
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-300 rounded-lg p-6 mb-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="relative">
                  <Loader2 className="h-8 w-8 text-purple-600 animate-spin" />
                  <Sparkles className="h-4 w-4 text-blue-600 absolute -top-1 -right-1" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-purple-900 text-lg">{progress.message}</p>
                  <p className="text-sm text-purple-600 mt-1 font-medium">
                    ⚡ Analyse batch optimisée - Toutes les transactions en une seule requête
                  </p>
                  <p className="text-xs text-purple-500 mt-1">
                    {progress.total} transactions → 1 appel API → 2-3 secondes
                  </p>
                </div>
              </div>
              {progress.total > 0 && (
                <div className="w-full bg-purple-200 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-purple-600 to-blue-600 h-3 rounded-full transition-all duration-300 flex items-center justify-end px-2"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  >
                    {progress.current === progress.total && (
                      <span className="text-xs text-white font-bold">✓</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Results with button to open validation dialog */}
          {results.size > 0 && !showValidationDialog && (
            <div className="bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-300 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-6 w-6 text-green-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-bold text-green-900 text-lg">
                    ✨ {results.size} correspondance(s) trouvée(s)
                  </p>
                  <p className="text-sm text-green-700 mt-1">
                    Cliquez sur le bouton ci-dessous pour valider les correspondances
                  </p>
                </div>
                <button
                  onClick={() => setShowValidationDialog(true)}
                  className="px-6 py-3 bg-gradient-to-r from-green-600 to-blue-600 text-white font-bold rounded-lg hover:from-green-700 hover:to-blue-700 transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
                >
                  <CheckCircle className="h-5 w-5" />
                  Voir et valider ({results.size})
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary">
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-dark-text-primary bg-white dark:bg-dark-bg-secondary border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:bg-dark-bg-tertiary transition-colors"
            >
              Fermer
            </button>
            {!isAnalyzing && results.size === 0 && (
              <button
                onClick={handleAnalyze}
                disabled={unmatchedTransactions.length === 0 || unmatchedInscriptions.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg hover:from-purple-700 hover:to-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Brain className="h-4 w-4" />
                Lancer l'analyse IA
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Validation Dialog */}
      {showValidationDialog && (
        <AIMatchValidationDialog
          isOpen={showValidationDialog}
          onClose={() => {
            setShowValidationDialog(false);
            onClose();
          }}
          matches={results}
          transactions={unmatchedTransactions}
          inscriptions={unmatchedInscriptions}
          eventTitle={eventContext?.titre}
          onValidate={handleValidation}
        />
      )}
    </>
  );
}
