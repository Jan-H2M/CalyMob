import React, { useState, useEffect } from 'react';
import { logger } from '@/utils/logger';
import {
  X,
  CheckCircle,
  AlertCircle,
  Sparkles,
  Check,
  XCircle,
  Info
} from 'lucide-react';
import { AIInscriptionMatchAnalysis } from '@/services/aiInscriptionMatchingService';
import { TransactionBancaire, InscriptionEvenement } from '@/types';
import { formatMontant, formatDate, cn } from '@/utils/utils';

interface MatchWithDetails {
  transactionId: string;
  analysis: AIInscriptionMatchAnalysis;
  transaction: TransactionBancaire;
  inscription: InscriptionEvenement;
}

interface AIMatchValidationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  matches: Map<string, AIInscriptionMatchAnalysis>;
  transactions: TransactionBancaire[];
  inscriptions: InscriptionEvenement[];
  eventTitle?: string;
  onValidate: (validatedMatches: Map<string, AIInscriptionMatchAnalysis>) => void;
}

/**
 * Dialog de validation manuelle des résultats IA
 * Permet de valider/rejeter chaque match avant sauvegarde
 */
export function AIMatchValidationDialog({
  isOpen,
  onClose,
  matches,
  transactions,
  inscriptions,
  eventTitle,
  onValidate
}: AIMatchValidationDialogProps) {
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set());

  if (!isOpen) return null;

  // Préparer les détails de chaque match
  const matchesWithDetails: MatchWithDetails[] = Array.from(matches.entries())
    .map(([transactionId, analysis]) => {
      const transaction = transactions.find(t => t.id === transactionId);
      const inscription = inscriptions.find(i => i.id === analysis.inscription_id);

      logger.debug('🔍 DEBUG Match validation:', {
        transactionId,
        inscriptionId: analysis.inscription_id,
        foundTransaction: !!transaction,
        foundInscription: !!inscription,
        availableTransactions: transactions.length,
        availableInscriptions: inscriptions.length
      });

      if (!transaction || !inscription) {
        logger.warn('⚠️ Match ignoré - Transaction ou Inscription non trouvée:', {
          transactionId,
          inscriptionId: analysis.inscription_id,
          hasTransaction: !!transaction,
          hasInscription: !!inscription
        });
        return null;
      }

      return {
        transactionId,
        analysis,
        transaction,
        inscription
      };
    })
    .filter(Boolean) as MatchWithDetails[];

  logger.debug('✅ matchesWithDetails prepared:', {
    totalMatches: matches.size,
    matchesWithDetails: matchesWithDetails.length,
    details: matchesWithDetails
  });

  // Initialiser les sélections avec SEULEMENT les matches valides haute confiance
  useEffect(() => {
    const initial = new Set<string>();
    matchesWithDetails.forEach(({ transactionId, analysis }) => {
      if (analysis.confidence >= 80) {
        initial.add(transactionId);
      }
    });
    logger.debug('🔄 Initialisation sélections:', {
      total: matchesWithDetails.length,
      highConfidence: initial.size,
      ids: Array.from(initial)
    });
    setSelectedMatches(initial);
  }, [matchesWithDetails.length, matches]); // Re-run quand matches change

  // Statistiques
  const highConfidence = matchesWithDetails.filter(m => m.analysis.confidence >= 80).length;
  const mediumConfidence = matchesWithDetails.filter(m => m.analysis.confidence >= 50 && m.analysis.confidence < 80).length;

  const handleToggleMatch = (transactionId: string) => {
    logger.debug('🔘 Toggle match:', transactionId);
    setSelectedMatches(prev => {
      const next = new Set(prev);
      const wasSelected = next.has(transactionId);

      if (wasSelected) {
        next.delete(transactionId);
        logger.debug(`  ❌ Désélectionné ${transactionId}, reste: ${next.size}`);
      } else {
        next.add(transactionId);
        logger.debug(`  ✅ Sélectionné ${transactionId}, total: ${next.size}`);
      }

      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedMatches(new Set(matchesWithDetails.map(m => m.transactionId)));
  };

  const handleSelectHighConfidence = () => {
    setSelectedMatches(new Set(
      matchesWithDetails
        .filter(m => m.analysis.confidence >= 80)
        .map(m => m.transactionId)
    ));
  };

  const handleDeselectAll = () => {
    setSelectedMatches(new Set());
  };

  const handleValidate = () => {
    logger.debug('✅ VALIDATION DÉMARRÉE');
    logger.debug(`  📊 Sélectionnés: ${selectedMatches.size}`);
    logger.debug(`  📋 IDs sélectionnés:`, Array.from(selectedMatches));

    const validatedMatches = new Map<string, AIInscriptionMatchAnalysis>();
    selectedMatches.forEach(txId => {
      const analysis = matches.get(txId);
      if (analysis) {
        validatedMatches.set(txId, analysis);
        logger.debug(`  ✅ Match validé: ${txId} → inscription ${analysis.inscription_id}`);
      } else {
        logger.warn(`  ⚠️ Analysis non trouvée pour transaction ${txId}`);
      }
    });

    logger.debug(`  💾 Total à sauvegarder: ${validatedMatches.size}`);
    logger.debug('  🔄 Appel de onValidate...');
    onValidate(validatedMatches);
    logger.debug('  ✅ onValidate appelé');
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-[80]"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[90] bg-white dark:bg-dark-bg-secondary rounded-lg shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border bg-gradient-to-r from-purple-600 to-blue-600">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="h-6 w-6 text-white" />
              <div>
                <h2 className="text-xl font-bold text-white">Validation des correspondances IA</h2>
                <p className="text-purple-100 text-sm mt-1">
                  Vérifiez et validez les matches avant sauvegarde
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

        {/* Stats */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white dark:bg-dark-bg-secondary rounded-lg p-3 border border-gray-200 dark:border-dark-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Total trouvé</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">{matchesWithDetails.length}</p>
                </div>
                <Sparkles className="h-8 w-8 text-purple-400" />
              </div>
            </div>

            <div className="bg-green-50 rounded-lg p-3 border border-green-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-600">Haute confiance (≥80%)</p>
                  <p className="text-2xl font-bold text-green-900">{highConfidence}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-400" />
              </div>
            </div>

            <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-yellow-600">À vérifier (50-79%)</p>
                  <p className="text-2xl font-bold text-yellow-900">{mediumConfidence}</p>
                </div>
                <AlertCircle className="h-8 w-8 text-yellow-400" />
              </div>
            </div>
          </div>

          {/* Selection actions */}
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={handleSelectHighConfidence}
              className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
            >
              Sélectionner haute confiance
            </button>
            <button
              onClick={handleSelectAll}
              className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
            >
              Tout sélectionner
            </button>
            <button
              onClick={handleDeselectAll}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-dark-text-primary bg-gray-50 dark:bg-dark-bg-tertiary border border-gray-200 dark:border-dark-border rounded-lg hover:bg-gray-100 dark:bg-dark-bg-tertiary transition-colors"
            >
              Tout désélectionner
            </button>
            <div className="ml-auto text-sm text-gray-600 dark:text-dark-text-secondary">
              {selectedMatches.size} / {matchesWithDetails.length} sélectionné(s)
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {matchesWithDetails.length === 0 ? (
            <div className="text-center py-12">
              <Info className="h-12 w-12 text-gray-400 dark:text-dark-text-muted mx-auto mb-3" />
              <p className="text-gray-600 dark:text-dark-text-secondary">Aucune correspondance trouvée</p>
            </div>
          ) : (
            <div className="space-y-3">
              {matchesWithDetails.map(({ transactionId, analysis, transaction, inscription }) => {
                const isSelected = selectedMatches.has(transactionId);
                const isHighConfidence = analysis.confidence >= 80;

                return (
                  <div
                    key={transactionId}
                    className={cn(
                      "border-2 rounded-lg transition-all cursor-pointer overflow-hidden",
                      isSelected
                        ? isHighConfidence
                          ? "border-green-400 bg-green-50"
                          : "border-yellow-400 bg-yellow-50"
                        : "border-gray-200 dark:border-dark-border bg-white hover:border-gray-300 dark:border-dark-border"
                    )}
                    onClick={() => handleToggleMatch(transactionId)}
                  >
                    {/* Header avec checkbox et score */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-dark-bg-tertiary border-b border-gray-200 dark:border-dark-border">
                      <div className="flex items-center gap-3">
                        {/* Checkbox */}
                        <div
                          className={cn(
                            "w-6 h-6 rounded border-2 flex items-center justify-center transition-colors",
                            isSelected
                              ? "border-green-600 bg-green-600"
                              : "border-gray-300 dark:border-dark-border bg-white"
                          )}
                        >
                          {isSelected && <Check className="h-4 w-4 text-white" />}
                        </div>
                        <span className="font-semibold text-gray-700 dark:text-dark-text-primary">Correspondance trouvée</span>
                      </div>
                      {/* Score de confiance */}
                      <div
                        className={cn(
                          "px-3 py-1 rounded-full text-sm font-bold",
                          isHighConfidence
                            ? "bg-green-600 text-white"
                            : "bg-yellow-600 text-white"
                        )}
                      >
                        {analysis.confidence}%
                      </div>
                    </div>

                    {/* Comparaison côte-à-côte */}
                    <div className="grid grid-cols-2 divide-x divide-gray-200">
                      {/* TRANSACTION (Gauche) */}
                      <div className="p-4 bg-blue-50/30">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                            <span className="text-white font-bold text-sm">T</span>
                          </div>
                          <h4 className="font-bold text-blue-900">Transaction Bancaire</h4>
                        </div>

                        <div className="space-y-2 text-sm">
                          <div>
                            <p className="text-xs text-blue-600 font-medium">Nom</p>
                            <p className="font-semibold text-gray-900 dark:text-dark-text-primary">{transaction.contrepartie_nom}</p>
                          </div>

                          <div>
                            <p className="text-xs text-blue-600 font-medium">Montant</p>
                            <p className="font-bold text-lg text-blue-900">{formatMontant(transaction.montant)}</p>
                          </div>

                          <div>
                            <p className="text-xs text-blue-600 font-medium">Date</p>
                            <p className="text-gray-900 dark:text-dark-text-primary">{formatDate(transaction.date_execution)}</p>
                          </div>

                          <div>
                            <p className="text-xs text-blue-600 font-medium">Communication</p>
                            <p className="text-gray-700 dark:text-dark-text-primary text-xs">{transaction.communication || 'N/A'}</p>
                          </div>
                        </div>
                      </div>

                      {/* INSCRIPTION (Droite) */}
                      <div className="p-4 bg-orange-50/30">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-8 h-8 rounded-full bg-orange-600 flex items-center justify-center">
                            <span className="text-white font-bold text-sm">I</span>
                          </div>
                          <h4 className="font-bold text-orange-900">Inscription Événement</h4>
                        </div>

                        <div className="space-y-2 text-sm">
                          <div>
                            <p className="text-xs text-orange-600 font-medium">Nom</p>
                            <p className="font-semibold text-gray-900 dark:text-dark-text-primary">
                              {inscription.membre_prenom || inscription.prenom || ''} {inscription.membre_nom || inscription.nom || ''}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs text-orange-600 font-medium">Montant</p>
                            <p className="font-bold text-lg text-orange-900">{formatMontant(inscription.prix)}</p>
                          </div>

                          <div>
                            <p className="text-xs text-orange-600 font-medium">Date d'inscription</p>
                            <p className="text-gray-900 dark:text-dark-text-primary">
                              {inscription.date_inscription
                                ? formatDate(inscription.date_inscription)
                                : 'Non disponible'}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs text-orange-600 font-medium">Événement</p>
                            <p className="text-gray-900 dark:text-dark-text-primary font-semibold">{eventTitle || inscription.evenement_titre || 'N/A'}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Raisonnement IA en bas */}
                    <div className="px-4 py-3 bg-purple-50/50 border-t border-gray-200 dark:border-dark-border">
                      <p className="text-xs font-semibold text-purple-900 mb-1">🧠 Raisonnement IA :</p>
                      <p className="text-xs text-gray-700 dark:text-dark-text-primary">{analysis.reasoning}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-dark-text-secondary">
              {selectedMatches.size > 0 ? (
                <span className="font-medium text-green-600">
                  ✓ {selectedMatches.size} correspondance(s) sélectionnée(s)
                </span>
              ) : (
                <span className="text-orange-600">
                  ⚠ Aucune sélection - rien ne sera sauvegardé
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-dark-text-primary bg-white dark:bg-dark-bg-secondary border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleValidate}
                disabled={selectedMatches.size === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-green-600 to-blue-600 rounded-lg hover:from-green-700 hover:to-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <CheckCircle className="h-4 w-4" />
                Valider la sélection ({selectedMatches.size})
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
