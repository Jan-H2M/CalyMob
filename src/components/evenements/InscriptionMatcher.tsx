/**
 * Composant de matching algorithmique inscriptions → transactions
 *
 * Remplace AIInscriptionMatcher par une approche déterministe
 */

import React, { useState } from 'react';
import {
  X,
  Search,
  CheckCircle,
  AlertCircle,
  Sparkles
} from 'lucide-react';
import { InscriptionMatchingService, InscriptionMatch } from '@/services/inscriptionMatchingService';
import { TransactionBancaire, InscriptionEvenement } from '@/types';
import { formatMontant, formatDate } from '@/utils/utils';

interface InscriptionMatcherProps {
  isOpen: boolean;
  onClose: () => void;
  unmatchedTransactions: TransactionBancaire[];
  unmatchedInscriptions: InscriptionEvenement[];
  eventContext?: { titre: string; lieu: string; date_debut: Date; date_fin: Date };
  onMatchesValidated: (matches: Map<string, InscriptionMatch>) => Promise<void>;
}

export function InscriptionMatcher({
  isOpen,
  onClose,
  unmatchedTransactions,
  unmatchedInscriptions,
  eventContext,
  onMatchesValidated
}: InscriptionMatcherProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<Map<string, InscriptionMatch>>(new Map());
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set());

  if (!isOpen) return null;

  const handleAnalyze = () => {
    setIsAnalyzing(true);

    try {
      console.log('🔍 Démarrage du matching algorithmique...');

      // Lancer le matching
      const matches = InscriptionMatchingService.findMatches(
        unmatchedInscriptions,
        unmatchedTransactions
      );

      setResults(matches);

      // Auto-sélectionner les matches avec score ≥ 85%
      const highConfidence = new Set<string>();
      matches.forEach((match, txId) => {
        if (match.score >= 85) {
          highConfidence.add(txId);
        }
      });
      setSelectedMatches(highConfidence);

      console.log(`✅ ${matches.size} matches trouvés`);
    } catch (error) {
      console.error('Erreur lors du matching:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleValidate = async () => {
    const validatedMatches = new Map<string, InscriptionMatch>();
    selectedMatches.forEach(txId => {
      const match = results.get(txId);
      if (match) {
        validatedMatches.set(txId, match);
      }
    });

    await onMatchesValidated(validatedMatches);
    onClose();
  };

  const toggleMatch = (txId: string) => {
    setSelectedMatches(prev => {
      const next = new Set(prev);
      if (next.has(txId)) {
        next.delete(txId);
      } else {
        next.add(txId);
      }
      return next;
    });
  };

  const matchesArray = Array.from(results.entries()).map(([txId, match]) => {
    const transaction = unmatchedTransactions.find(t => t.id === txId);
    const inscription = unmatchedInscriptions.find(i => i.id === match.inscription_id);
    return { txId, match, transaction, inscription };
  });

  const highConfidenceCount = matchesArray.filter(m => m.match.score >= 85).length;
  const mediumConfidenceCount = matchesArray.filter(m => m.match.score >= 70 && m.match.score < 85).length;

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
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border bg-gradient-to-r from-blue-600 to-green-600">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Search className="h-6 w-6 text-white" />
              <div>
                <h2 className="text-xl font-bold text-white">Matching Automatique</h2>
                <p className="text-blue-100 text-sm mt-1">
                  Algorithme déterministe - Instantané et gratuit
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
          {results.size === 0 ? (
            <div className="text-center py-12">
              <div className="bg-gradient-to-r from-blue-50 to-green-50 border-2 border-blue-300 rounded-lg p-6 mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <Sparkles className="h-6 w-6 text-blue-600 flex-shrink-0" />
                  <p className="text-sm text-blue-900 font-medium text-left">
                    Matching algorithmique basé sur nom + montant + date
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="bg-white dark:bg-dark-bg-secondary rounded-lg p-3 border border-blue-200">
                    <p className="text-blue-600 font-medium">Inscriptions</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">{unmatchedInscriptions.length}</p>
                  </div>
                  <div className="bg-white dark:bg-dark-bg-secondary rounded-lg p-3 border border-blue-200">
                    <p className="text-blue-600 font-medium">Transactions</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">{unmatchedTransactions.length}</p>
                  </div>
                  <div className="bg-white dark:bg-dark-bg-secondary rounded-lg p-3 border border-blue-200">
                    <p className="text-blue-600 font-medium">Durée</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">&lt;1s</p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing || unmatchedTransactions.length === 0 || unmatchedInscriptions.length === 0}
                className="px-6 py-3 text-white bg-gradient-to-r from-blue-600 to-green-600 rounded-lg hover:from-blue-700 hover:to-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
              >
                <Search className="h-5 w-5" />
                {isAnalyzing ? 'Analyse en cours...' : 'Lancer le matching'}
              </button>
            </div>
          ) : (
            <>
              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-white dark:bg-dark-bg-secondary rounded-lg p-3 border border-gray-200 dark:border-dark-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Total trouvé</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">{matchesArray.length}</p>
                    </div>
                    <Search className="h-8 w-8 text-blue-400" />
                  </div>
                </div>

                <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-green-600">Haute confiance (≥85%)</p>
                      <p className="text-2xl font-bold text-green-900">{highConfidenceCount}</p>
                    </div>
                    <CheckCircle className="h-8 w-8 text-green-400" />
                  </div>
                </div>

                <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-yellow-600">À vérifier (70-84%)</p>
                      <p className="text-2xl font-bold text-yellow-900">{mediumConfidenceCount}</p>
                    </div>
                    <AlertCircle className="h-8 w-8 text-yellow-400" />
                  </div>
                </div>
              </div>

              {/* Matches list */}
              <div className="space-y-3">
                {matchesArray.map(({ txId, match, transaction, inscription }) => {
                  if (!transaction || !inscription) return null;

                  const isSelected = selectedMatches.has(txId);
                  const isHighConfidence = match.score >= 85;

                  return (
                    <div
                      key={txId}
                      className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                        isSelected
                          ? 'border-green-500 bg-green-50'
                          : 'border-gray-200 hover:border-blue-300'
                      }`}
                      onClick={() => toggleMatch(txId)}
                    >
                      {/* Checkbox + Score */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="w-5 h-5 rounded border-gray-300 dark:border-dark-border"
                          />
                          <span className={`text-2xl font-bold ${
                            isHighConfidence ? 'text-green-600' : 'text-yellow-600'
                          }`}>
                            {match.score}%
                          </span>
                        </div>
                        {isHighConfidence && (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-medium">
                            Haute confiance
                          </span>
                        )}
                      </div>

                      {/* Transaction vs Inscription */}
                      <div className="grid grid-cols-2 gap-4">
                        {/* Transaction */}
                        <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                          <p className="text-xs text-blue-600 font-medium mb-2">💳 Transaction</p>
                          <p className="font-semibold text-gray-900 dark:text-dark-text-primary">{transaction.contrepartie_nom}</p>
                          <p className="text-lg font-bold text-blue-600 mt-1">{formatMontant(transaction.montant)}</p>
                          <p className="text-xs text-gray-600 dark:text-dark-text-secondary mt-1">{formatDate(transaction.date_execution)}</p>
                        </div>

                        {/* Inscription */}
                        <div className="bg-orange-50 rounded-lg p-3 border border-orange-200">
                          <p className="text-xs text-orange-600 font-medium mb-2">📝 Inscription</p>
                          <p className="font-semibold text-gray-900 dark:text-dark-text-primary">
                            {inscription.membre_prenom} {inscription.membre_nom}
                          </p>
                          <p className="text-lg font-bold text-orange-600 mt-1">{formatMontant(inscription.prix)}</p>
                          <p className="text-xs text-gray-600 dark:text-dark-text-secondary mt-1">{formatDate(inscription.date_inscription)}</p>
                        </div>
                      </div>

                      {/* Reasoning */}
                      <div className="mt-3 px-3 py-2 bg-gray-50 dark:bg-dark-bg-tertiary rounded text-xs text-gray-700 dark:text-dark-text-primary border border-gray-200 dark:border-dark-border">
                        <span className="font-medium">🧠 Analyse:</span> {match.reasoning}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {results.size > 0 && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600 dark:text-dark-text-secondary">
                {selectedMatches.size > 0 ? (
                  <span className="font-medium text-green-600">
                    ✓ {selectedMatches.size} correspondance(s) sélectionnée(s)
                  </span>
                ) : (
                  <span className="text-orange-600">
                    ⚠ Aucune sélection
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-dark-text-primary bg-white dark:bg-dark-bg-secondary border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:bg-dark-bg-tertiary transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleValidate}
                  disabled={selectedMatches.size === 0}
                  className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-green-600 to-blue-600 rounded-lg hover:from-green-700 hover:to-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <CheckCircle className="h-4 w-4" />
                  Valider ({selectedMatches.size})
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
