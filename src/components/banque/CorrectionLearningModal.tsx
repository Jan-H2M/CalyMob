import React, { useState, useMemo } from 'react';
import { X, Trash2, GraduationCap, Check } from 'lucide-react';
import { TransactionBancaire, LearnedPattern } from '@/types';
import { AccountCodeSelectorModal } from '@/components/commun/AccountCodeSelectorModal';
import { CategorizationService } from '@/services/categorizationService';
import { cn } from '@/utils/utils';
import { logger } from '@/utils/logger';

interface CorrectionLearningModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: TransactionBancaire;
  currentCode?: string;
  clubId: string;
  onDelete: () => void;
  onLearn: (pattern: Omit<LearnedPattern, 'id' | 'created_at' | 'use_count'>) => Promise<void>;
}

type Step = 'choice' | 'selectCode' | 'selectCriteria';

export function CorrectionLearningModal({
  isOpen,
  onClose,
  transaction,
  currentCode,
  clubId,
  onDelete,
  onLearn
}: CorrectionLearningModalProps) {
  const [step, setStep] = useState<Step>('choice');
  const [selectedCode, setSelectedCode] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Criteria selection
  const [useCounterparty, setUseCounterparty] = useState(true);
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState('');

  // Extract keywords from transaction communication
  const extractedKeywords = useMemo(() => {
    if (!transaction.communication) return [];

    // Get keywords from CategorizationService
    const keywords = CategorizationService.extractKeywordsForLearning(transaction.communication);
    return keywords;
  }, [transaction.communication]);

  // Reset state when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setStep('choice');
      setSelectedCode('');
      setSelectedCategory('');
      setUseCounterparty(true);
      setSelectedKeywords(new Set());
      setComment('');
    }
  }, [isOpen]);

  const handleDelete = () => {
    onDelete();
    onClose();
  };

  const handleStartLearning = () => {
    setIsCodeModalOpen(true);
  };

  const handleCodeSelected = (code: string) => {
    setSelectedCode(code);
    setIsCodeModalOpen(false);

    // Find category for this code
    const codeObj = CategorizationService.getAccountCodeByCode(code);
    if (codeObj?.categories?.[0]) {
      // Use the first category linked to this account code
      setSelectedCategory(codeObj.categories[0]);
    }

    // Pre-select first 2 keywords if any
    if (extractedKeywords.length > 0) {
      const initialKeywords = new Set(extractedKeywords.slice(0, 2).map(k => k.keyword));
      setSelectedKeywords(initialKeywords);
    }

    setStep('selectCriteria');
  };

  const toggleKeyword = (keyword: string) => {
    setSelectedKeywords(prev => {
      const newSet = new Set(prev);
      if (newSet.has(keyword)) {
        newSet.delete(keyword);
      } else {
        newSet.add(keyword);
      }
      return newSet;
    });
  };

  const handleSavePattern = async () => {
    if (!selectedCode) return;

    // Must have at least counterparty or one keyword
    if (!useCounterparty && selectedKeywords.size === 0) {
      return;
    }

    setIsSaving(true);
    try {
      const pattern: Omit<LearnedPattern, 'id' | 'created_at' | 'use_count'> = {
        code_comptable: selectedCode,
        categorie: selectedCategory,
        confidence: 90, // High confidence for manually learned patterns
        created_by: '', // Will be set by the service
        source_transaction_id: transaction.id,
        original_wrong_code: currentCode,
        comment: comment || undefined
      };

      // Add counterparty if selected
      if (useCounterparty && transaction.contrepartie_nom) {
        pattern.contrepartie_nom = transaction.contrepartie_nom;
        pattern.contrepartie_normalized = transaction.contrepartie_nom
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim();
      }

      // Add keywords if selected
      if (selectedKeywords.size > 0) {
        pattern.keywords = Array.from(selectedKeywords);
      }

      await onLearn(pattern);
      onClose();
    } catch (error) {
      logger.error('Error saving pattern:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const canSave = selectedCode && (useCounterparty || selectedKeywords.size > 0);

  if (!isOpen) return null;

  return (
    <>
      {/* Main Modal */}
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-dark-border">
            <h3 className="font-semibold text-gray-900 dark:text-dark-text-primary">
              {step === 'choice' && 'Ce code est incorrect ?'}
              {step === 'selectCriteria' && 'Que doit retenir le système ?'}
            </h3>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 dark:text-dark-text-secondary dark:hover:text-dark-text-primary rounded transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4">
            {step === 'choice' && (
              <div className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                  Code actuel : <span className="font-mono font-semibold text-red-600 dark:text-red-400">{currentCode || '(aucun)'}</span>
                </p>

                <div className="flex gap-3">
                  <button
                    onClick={handleDelete}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-dark-text-primary hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                    Supprimer
                  </button>
                  <button
                    onClick={handleStartLearning}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                  >
                    <GraduationCap className="h-4 w-4" />
                    Corriger & Apprendre
                  </button>
                </div>
              </div>
            )}

            {step === 'selectCriteria' && (
              <div className="space-y-4">
                {/* Selected code display */}
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <p className="text-sm text-green-700 dark:text-green-300">
                    Nouveau code : <span className="font-mono font-semibold">{selectedCode}</span>
                  </p>
                </div>

                {/* Counterparty checkbox */}
                {transaction.contrepartie_nom && (
                  <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={useCounterparty}
                      onChange={(e) => setUseCounterparty(e.target.checked)}
                      className="mt-0.5 h-4 w-4 text-purple-600 rounded border-gray-300 dark:border-dark-border focus:ring-purple-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                        Contrepartie
                      </span>
                      <p className="text-sm text-gray-500 dark:text-dark-text-muted mt-0.5">
                        "{transaction.contrepartie_nom}"
                      </p>
                    </div>
                  </label>
                )}

                {/* Keywords checkboxes */}
                {extractedKeywords.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700 dark:text-dark-text-primary">
                      Mots-clés détectés :
                    </p>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {extractedKeywords.map((kw) => (
                        <label
                          key={kw.keyword}
                          className="flex items-center gap-3 p-2 rounded-lg border border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={selectedKeywords.has(kw.keyword)}
                            onChange={() => toggleKeyword(kw.keyword)}
                            className="h-4 w-4 text-purple-600 rounded border-gray-300 dark:border-dark-border focus:ring-purple-500"
                          />
                          <span className="text-sm text-gray-900 dark:text-dark-text-primary">
                            {kw.keyword}
                          </span>
                          {kw.category && (
                            <span className="text-xs text-gray-400 dark:text-dark-text-muted">
                              ({kw.category})
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Comment field */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Commentaire (optionnel)
                  </label>
                  <input
                    type="text"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Ex: Factures téléphone du club"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text-primary placeholder-gray-400 dark:placeholder-dark-text-muted"
                  />
                </div>

                {/* Validation message */}
                {!canSave && (
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    Sélectionnez au moins la contrepartie ou un mot-clé
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          {step === 'selectCriteria' && (
            <div className="flex justify-end gap-3 px-4 py-3 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary">
              <button
                onClick={() => setStep('choice')}
                className="px-4 py-2 text-sm text-gray-600 dark:text-dark-text-secondary hover:text-gray-800 dark:hover:text-dark-text-primary transition-colors"
              >
                Retour
              </button>
              <button
                onClick={handleSavePattern}
                disabled={!canSave || isSaving}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                  canSave && !isSaving
                    ? "bg-purple-600 hover:bg-purple-700 text-white"
                    : "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-dark-text-muted cursor-not-allowed"
                )}
              >
                {isSaving ? (
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Enregistrer
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Account Code Selector Modal */}
      <AccountCodeSelectorModal
        isOpen={isCodeModalOpen}
        onClose={() => {
          setIsCodeModalOpen(false);
          setStep('choice');
        }}
        onSelect={handleCodeSelected}
        isExpense={transaction.montant < 0}
        clubId={clubId}
        transaction={transaction}
      />
    </>
  );
}
