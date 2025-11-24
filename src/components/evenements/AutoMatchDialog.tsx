import React, { useState } from 'react';
import {
  X, CheckCircle, AlertTriangle, Banknote, Check, XIcon, ChevronDown,
  TrendingUp, Calendar, User, Euro, FileText
} from 'lucide-react';
import { InscriptionEvenement, TransactionBancaire } from '@/types';
import { formatMontant, formatDate, cn } from '@/utils/utils';
import { MatchQuality } from '@/services/inscriptionService';

interface MatchItem {
  inscription: InscriptionEvenement;
  transaction: TransactionBancaire;
  confidence: number;
  quality: MatchQuality;
}

interface AutoMatchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  matched: MatchItem[];
  needsSplit: Array<{
    inscription: InscriptionEvenement;
    transaction: TransactionBancaire;
    suggestedSplits: number;
    message: string;
  }>;
  cashSuggested: InscriptionEvenement[];
  availableTransactions: TransactionBancaire[];
  onConfirm: (selectedMatches: MatchItem[], autoMarkCash: boolean) => Promise<void>;
}

/**
 * Interactive Auto-Match Review Dialog
 *
 * Allows user to:
 * - Review each suggested match
 * - Accept/reject individual matches
 * - Change transaction selection
 * - See warnings for name/date mismatches
 * - Batch approve good matches
 */
export function AutoMatchDialog({
  isOpen,
  onClose,
  matched,
  needsSplit,
  cashSuggested,
  availableTransactions,
  onConfirm
}: AutoMatchDialogProps) {
  // IMPROVED: Filter out low-quality matches (< 50%)
  const MIN_QUALITY_THRESHOLD = 50;
  const qualityMatches = matched.filter(m => m.quality.overall >= MIN_QUALITY_THRESHOLD);

  console.log(`🎯 Auto-match quality filter: ${matched.length} total → ${qualityMatches.length} kept (≥${MIN_QUALITY_THRESHOLD}%)`);

  // Track status of each match: 'pending' | 'accepted' | 'rejected'
  const [matchStatus, setMatchStatus] = useState<Record<string, 'pending' | 'accepted' | 'rejected'>>(() => {
    const initial: Record<string, 'pending' | 'accepted' | 'rejected'> = {};
    qualityMatches.forEach(m => {
      initial[m.inscription.id] = 'pending';
    });
    return initial;
  });

  // Track selected transaction for each inscription
  const [selectedTransactions, setSelectedTransactions] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    qualityMatches.forEach(m => {
      initial[m.inscription.id] = m.transaction.id;
    });
    return initial;
  });

  // Expanded state for dropdown selectors
  const [expandedSelectors, setExpandedSelectors] = useState<Set<string>>(new Set());

  const [autoMarkCash, setAutoMarkCash] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const toggleStatus = (inscriptionId: string, status: 'accepted' | 'rejected') => {
    setMatchStatus(prev => ({
      ...prev,
      [inscriptionId]: prev[inscriptionId] === status ? 'pending' : status
    }));
  };

  const toggleSelector = (inscriptionId: string) => {
    setExpandedSelectors(prev => {
      const next = new Set(prev);
      if (next.has(inscriptionId)) {
        next.delete(inscriptionId);
      } else {
        next.add(inscriptionId);
      }
      return next;
    });
  };

  const selectTransaction = (inscriptionId: string, transactionId: string) => {
    setSelectedTransactions(prev => ({
      ...prev,
      [inscriptionId]: transactionId
    }));
    // Close selector
    setExpandedSelectors(prev => {
      const next = new Set(prev);
      next.delete(inscriptionId);
      return next;
    });
  };

  const acceptAllGood = () => {
    const updates: Record<string, 'accepted'> = {};
    qualityMatches.forEach(m => {
      if (m.quality.overall >= 70) {  // Good quality threshold
        updates[m.inscription.id] = 'accepted';
      }
    });
    setMatchStatus(prev => ({ ...prev, ...updates }));
  };

  const rejectAllWarnings = () => {
    const updates: Record<string, 'rejected'> = {};
    qualityMatches.forEach(m => {
      if (m.quality.overall < 70 || m.quality.warnings.length > 0) {
        updates[m.inscription.id] = 'rejected';
      }
    });
    setMatchStatus(prev => ({ ...prev, ...updates }));
  };

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      // Build final list of accepted matches with selected transactions
      const finalMatches: MatchItem[] = [];

      for (const match of qualityMatches) {
        if (matchStatus[match.inscription.id] === 'accepted') {
          const selectedTxId = selectedTransactions[match.inscription.id];
          const selectedTx = availableTransactions.find(tx => tx.id === selectedTxId);

          if (selectedTx) {
            finalMatches.push({
              ...match,
              transaction: selectedTx
            });
          }
        }
      }

      await onConfirm(finalMatches, autoMarkCash);
      onClose();
    } catch (error) {
      console.error('Error confirming auto-match:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const acceptedCount = Object.values(matchStatus).filter(s => s === 'accepted').length;
  const totalToProcess = acceptedCount + (autoMarkCash ? cashSuggested.length : 0);

  // Helper to get quality color
  const getQualityColor = (quality: MatchQuality) => {
    if (quality.overall >= 80) return 'text-green-600 bg-green-50 border-green-200';
    if (quality.overall >= 60) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  const getQualityIcon = (quality: MatchQuality) => {
    if (quality.overall >= 80) return <CheckCircle className="h-5 w-5" />;
    return <AlertTriangle className="h-5 w-5" />;
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-[80]"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[90] bg-white dark:bg-dark-bg-secondary rounded-lg shadow-2xl max-w-5xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Vérification des correspondances</h2>
              <p className="text-blue-100 text-sm mt-1">
                {qualityMatches.length > 0 ? (
                  <>Vérifiez chaque suggestion avant de valider • {qualityMatches.length} correspondance{qualityMatches.length > 1 ? 's' : ''} trouvée{qualityMatches.length > 1 ? 's' : ''}</>
                ) : (
                  <>Aucune correspondance fiable trouvée</>
                )}
              </p>
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
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* No Matches Message */}
          {qualityMatches.length === 0 && needsSplit.length === 0 && cashSuggested.length === 0 && (
            <div className="text-center py-12 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg border-2 border-dashed border-gray-300 dark:border-dark-border">
              <AlertTriangle className="h-16 w-16 mx-auto mb-4 text-gray-400 dark:text-dark-text-muted" />
              <h3 className="text-lg font-semibold text-gray-700 dark:text-dark-text-primary mb-2">Aucune correspondance trouvée</h3>
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary mb-4">
                Le système n'a pas trouvé de transactions correspondant aux inscriptions avec une qualité suffisante (≥ {MIN_QUALITY_THRESHOLD}%).
              </p>
              <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                Vous pouvez lier manuellement les inscriptions depuis l'onglet Inscriptions de l'événement.
              </p>
            </div>
          )}

          {/* Matched Section */}
          {qualityMatches.length > 0 && (
            <div className="space-y-3">
              {qualityMatches.map((match) => {
                const status = matchStatus[match.inscription.id];
                const selectedTxId = selectedTransactions[match.inscription.id];
                const selectedTx = availableTransactions.find(tx => tx.id === selectedTxId) || match.transaction;
                const isExpanded = expandedSelectors.has(match.inscription.id);
                const quality = match.quality;

                const inscriptionName = `${match.inscription.membre_prenom || ''} ${match.inscription.membre_nom || ''}`.trim();

                return (
                  <div
                    key={match.inscription.id}
                    className={cn(
                      "border-2 rounded-lg p-4 transition-all",
                      status === 'accepted' && "bg-green-50 border-green-400",
                      status === 'rejected' && "bg-gray-100 border-gray-400 opacity-60",
                      status === 'pending' && quality.overall >= 80 && "border-green-200",
                      status === 'pending' && quality.overall < 80 && quality.overall >= 60 && "border-yellow-200",
                      status === 'pending' && quality.overall < 60 && "border-red-200"
                    )}
                  >
                    {/* Header with quality badge */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {getQualityIcon(quality)}
                        <div>
                          <h3 className="font-semibold text-gray-900 dark:text-dark-text-primary">{inscriptionName}</h3>
                          <div className={cn("text-xs px-2 py-1 rounded inline-block mt-1", getQualityColor(quality))}>
                            Qualité: {quality.overall}% • {quality.overall >= 80 ? 'Excellente' : quality.overall >= 60 ? 'Moyenne' : 'Faible'}
                          </div>
                        </div>
                      </div>

                      {/* Accept/Reject buttons */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleStatus(match.inscription.id, 'accepted')}
                          className={cn(
                            "px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 text-sm font-medium",
                            status === 'accepted'
                              ? "bg-green-600 text-white"
                              : "bg-gray-100 text-gray-700 hover:bg-green-100 hover:text-green-700"
                          )}
                        >
                          <Check className="h-4 w-4" />
                          {status === 'accepted' ? 'Accepté' : 'Accepter'}
                        </button>
                        <button
                          onClick={() => toggleStatus(match.inscription.id, 'rejected')}
                          className={cn(
                            "px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 text-sm font-medium",
                            status === 'rejected'
                              ? "bg-red-600 text-white"
                              : "bg-gray-100 text-gray-700 hover:bg-red-100 hover:text-red-700"
                          )}
                        >
                          <XIcon className="h-4 w-4" />
                          {status === 'rejected' ? 'Rejeté' : 'Rejeter'}
                        </button>
                      </div>
                    </div>

                    {/* Warnings */}
                    {quality.warnings.length > 0 && (
                      <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                          <div className="text-sm text-yellow-800">
                            {quality.warnings.map((warning, idx) => (
                              <div key={idx}>• {warning}</div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Inscription info */}
                    <div className="grid grid-cols-2 gap-4 mb-3 text-sm">
                      <div>
                        <span className="text-gray-600 dark:text-dark-text-secondary">Inscription:</span>
                        <div className="font-medium">{formatMontant(match.inscription.prix)}</div>
                        <div className="text-gray-500 dark:text-dark-text-muted text-xs flex items-center gap-1 mt-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(match.inscription.date_inscription)}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-600 dark:text-dark-text-secondary">Scores de correspondance:</span>
                        <div className="text-xs space-y-1 mt-1">
                          <div>Montant: {quality.amountMatch}%</div>
                          <div>Nom: {quality.nameMatch}%</div>
                          <div>Date: {quality.dateProximity}%</div>
                        </div>
                      </div>
                    </div>

                    {/* Transaction selector */}
                    <div className="border border-gray-300 dark:border-dark-border rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggleSelector(match.inscription.id)}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-bg-tertiary hover:bg-gray-100 dark:bg-dark-bg-tertiary transition-colors flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2 text-sm">
                          <Euro className="h-4 w-4 text-gray-500 dark:text-dark-text-muted" />
                          <span className="font-medium">{selectedTx.contrepartie_nom}</span>
                          <span className="text-gray-600 dark:text-dark-text-secondary">• {formatMontant(selectedTx.montant)}</span>
                          <span className="text-gray-500 dark:text-dark-text-muted">• {formatDate(selectedTx.date_execution)}</span>
                        </div>
                        <ChevronDown className={cn("h-4 w-4 text-gray-500 transition-transform", isExpanded && "rotate-180")} />
                      </button>

                      {/* Dropdown list */}
                      {isExpanded && (
                        <div className="max-h-48 overflow-y-auto border-t border-gray-300 dark:border-dark-border">
                          {availableTransactions.map(tx => (
                            <button
                              key={tx.id}
                              onClick={() => selectTransaction(match.inscription.id, tx.id)}
                              className={cn(
                                "w-full px-3 py-2 text-left hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-0",
                                tx.id === selectedTxId && "bg-blue-100"
                              )}
                            >
                              <div className="flex items-center justify-between text-sm">
                                <div className="flex-1">
                                  <div className="font-medium">{tx.contrepartie_nom}</div>
                                  <div className="text-xs text-gray-600 dark:text-dark-text-secondary mt-1">{tx.communication || 'Pas de communication'}</div>
                                </div>
                                <div className="text-right ml-4">
                                  <div className="font-semibold text-green-600">{formatMontant(tx.montant)}</div>
                                  <div className="text-xs text-gray-500 dark:text-dark-text-muted">{formatDate(tx.date_execution)}</div>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Needs Split Section */}
          {needsSplit.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                <h3 className="font-semibold text-gray-900 dark:text-dark-text-primary text-lg">
                  Transactions à ventiler ({needsSplit.length})
                </h3>
              </div>
              <div className="space-y-2">
                {needsSplit.map((item, idx) => (
                  <div key={idx} className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                    <div className="text-sm">
                      <div className="font-medium text-gray-900 dark:text-dark-text-primary">
                        {item.inscription.membre_prenom} {item.inscription.membre_nom} ({formatMontant(item.inscription.prix)})
                      </div>
                      <div className="text-orange-700 mt-1 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        {item.message}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cash Suggested Section */}
          {cashSuggested.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-3">
                <Banknote className="h-5 w-5 text-blue-600" />
                <h3 className="font-semibold text-gray-900 dark:text-dark-text-primary text-lg">
                  Paiements espèces suggérés ({cashSuggested.length})
                </h3>
              </div>
              <div className="space-y-2 mb-3">
                {cashSuggested.map((inscription) => (
                  <div key={inscription.id} className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium">{inscription.membre_prenom} {inscription.membre_nom}</span>
                        <span className="text-gray-600 dark:text-dark-text-secondary ml-2">• {formatMontant(inscription.prix)}</span>
                      </div>
                      <span className="text-blue-700 text-xs">Aucune transaction correspondante</span>
                    </div>
                  </div>
                ))}
              </div>
              <label className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg cursor-pointer hover:bg-blue-100 transition-colors">
                <input
                  type="checkbox"
                  checked={autoMarkCash}
                  onChange={(e) => setAutoMarkCash(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                  Marquer automatiquement ces inscriptions comme "Payé espèces"
                </span>
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-gray-600 dark:text-dark-text-secondary">
              <span className="font-semibold text-gray-900 dark:text-dark-text-primary">{totalToProcess}</span> inscription{totalToProcess > 1 ? 's' : ''} {totalToProcess > 1 ? 'seront traitées' : 'sera traitée'}
              <span className="ml-3">
                ({acceptedCount} acceptée{acceptedCount > 1 ? 's' : ''}{autoMarkCash ? ` + ${cashSuggested.length} espèces` : ''})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={acceptAllGood}
                className="px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
              >
                Accepter les bonnes
              </button>
              <button
                onClick={rejectAllWarnings}
                className="px-3 py-1.5 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200 transition-colors"
              >
                Rejeter les doutes
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-dark-text-primary bg-white dark:bg-dark-bg-secondary border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:bg-dark-bg-tertiary transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleConfirm}
              disabled={isProcessing || totalToProcess === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isProcessing ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Traitement...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Confirmer ({totalToProcess})
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
