import { useState, useEffect } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { TransactionBancaire, LearnedPattern } from '@/types';
import { CategorizationService } from '@/services/categorizationService';
import { AccountCodeService } from '@/services/accountCodeService';
import { AccountCodeSelectorModal } from '@/components/commun/AccountCodeSelectorModal';
import { CorrectionLearningModal } from './CorrectionLearningModal';
import { cn } from '@/utils/utils';

interface CategoryAccountSelectorProps {
  transaction?: TransactionBancaire;
  isExpense?: boolean;
  selectedCategory?: string;
  selectedAccountCode?: string;
  onCategoryChange: (categoryId: string) => void;
  onAccountCodeChange: (accountCode: string) => void;
  onCodeNotFound?: () => void; // NEW: Called when user indicates no appropriate code found
  className?: string;
  clubId?: string; // Voor smart suggesties
  counterpartyName?: string; // Voor smart suggesties
  hideAccountCode?: boolean; // Cacher le code comptable (mais garder les données)
  enableLearning?: boolean; // Activer la modale d'apprentissage sur suppression
  userId?: string; // ID de l'utilisateur pour l'apprentissage
  onLearnPattern?: (pattern: Omit<LearnedPattern, 'id' | 'created_at' | 'use_count'>) => Promise<void>;
}

export function CategoryAccountSelector({
  transaction,
  isExpense: isExpenseProp,
  selectedCategory: selectedCategoryProp,
  selectedAccountCode: selectedAccountCodeProp,
  onCategoryChange,
  onAccountCodeChange,
  onCodeNotFound,
  className,
  clubId,
  counterpartyName,
  hideAccountCode = false,
  enableLearning = false,
  userId,
  onLearnPattern
}: CategoryAccountSelectorProps) {
  // Support both transaction-based mode and direct props mode
  const initialAccountCode = selectedAccountCodeProp ?? transaction?.code_comptable ?? '';
  const isExpense = isExpenseProp ?? (transaction ? transaction.montant < 0 : false);

  // Extract counterparty from transaction if not provided
  const effectiveCounterparty = counterpartyName ?? transaction?.contrepartie_nom ?? '';

  const [selectedAccountCode, setSelectedAccountCode] = useState<string>(initialAccountCode);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);

  // Sync state with props when they change (important for create mode)
  useEffect(() => {
    if (selectedAccountCodeProp !== undefined) {
      setSelectedAccountCode(selectedAccountCodeProp);
    }
  }, [selectedAccountCodeProp]);

  // Sync state when transaction changes (important for navigation arrows)
  useEffect(() => {
    if (transaction) {
      setSelectedAccountCode(transaction.code_comptable ?? '');
    }
  }, [transaction?.id, transaction?.code_comptable]);

  // Get the label for the selected code
  // Use AccountCodeService.getByCode() directly - this is the same method used in TransactionsPage list view
  // It searches the full cache and finds both active and inactive codes
  let selectedCodeObj: AccountCode | null = null;

  if (selectedAccountCode) {
    // First try AccountCodeService which has access to all codes (including custom ones)
    const fromService = AccountCodeService.getByCode(selectedAccountCode);
    if (fromService) {
      selectedCodeObj = fromService;
    } else {
      // Fallback to CategorizationService for codes by type (in case AccountCodeService isn't ready)
      const codesForType = CategorizationService.getAccountCodesByType(isExpense);
      selectedCodeObj = codesForType.find(c => c.code === selectedAccountCode) || null;

      // If still not found, try the other type
      if (!selectedCodeObj) {
        const otherTypeCodes = CategorizationService.getAccountCodesByType(!isExpense);
        selectedCodeObj = otherTypeCodes.find(c => c.code === selectedAccountCode) || null;
      }
    }
  }

  // Handle code selection from modal
  const handleCodeSelect = (code: string) => {
    setSelectedAccountCode(code);
    onAccountCodeChange(code);
    setIsModalOpen(false);

    // Auto-update category based on selected code
    const codeObj = CategorizationService.getAccountCodesByType(isExpense).find(c => c.code === code);
    if (codeObj?.categories?.[0]) {
      // Use the first category linked to this account code
      onCategoryChange(codeObj.categories[0]);
    }
  };

  // Get categories for the dropdown when hideAccountCode is true
  const categories = hideAccountCode ? CategorizationService.getCategoriesByType(isExpense) : [];

  return (
    <div className={cn("space-y-3", className)}>
      {/* Category selector - shown when hideAccountCode is true */}
      {hideAccountCode ? (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
            Catégorie
          </label>
          <select
            value={selectedCategoryProp || ''}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary"
          >
            <option value="">Sélectionner une catégorie...</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>
                {cat.nom}
              </option>
            ))}
          </select>
        </div>
      ) : (
        /* Code comptable - Clickable field that opens modal */
        <div>
          <label htmlFor="accountCode" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
            Code comptable
          </label>
          <div className="relative flex items-center">
            <div
              onClick={() => setIsModalOpen(true)}
              className={cn(
                "flex-1 pl-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-secondary cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 transition-colors",
                selectedCodeObj ? "pr-16" : "pr-10"
              )}
            >
              {selectedCodeObj ? (
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "font-mono font-semibold text-sm",
                    isExpense ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                  )}>
                    {selectedCodeObj.code}
                  </span>
                  <span className="text-sm text-gray-700 dark:text-dark-text-primary truncate">
                    {selectedCodeObj.label}
                  </span>
                </div>
              ) : (
                <span className="text-sm text-gray-400 dark:text-dark-text-muted">
                  Sélectionner un code comptable...
                </span>
              )}
            </div>
            {/* Clear button - opens correction modal if learning is enabled */}
            {selectedCodeObj && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (enableLearning && transaction && clubId && onLearnPattern) {
                    // Open correction/learning modal
                    setIsCorrectionModalOpen(true);
                  } else {
                    // Direct delete (legacy behavior)
                    setSelectedAccountCode('');
                    onAccountCodeChange('');
                  }
                }}
                className="absolute right-8 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded transition-colors"
                title={enableLearning ? "Corriger ou supprimer le code" : "Effacer le code comptable"}
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-dark-text-muted pointer-events-none" />
          </div>
        </div>
      )}

      {/* Account Code Selector Modal - only needed when not hiding */}
      {!hideAccountCode && (
        <AccountCodeSelectorModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSelect={handleCodeSelect}
          onNotFound={onCodeNotFound}
          initialCode={selectedAccountCode}
          isExpense={isExpense}
          counterpartyName={effectiveCounterparty}
          clubId={clubId}
          transaction={transaction} // NEW: Pass full transaction for keyword-based suggestions
        />
      )}

      {/* Correction Learning Modal - when learning is enabled */}
      {enableLearning && transaction && clubId && onLearnPattern && (
        <CorrectionLearningModal
          isOpen={isCorrectionModalOpen}
          onClose={() => setIsCorrectionModalOpen(false)}
          transaction={transaction}
          currentCode={selectedAccountCode}
          clubId={clubId}
          onDelete={() => {
            setSelectedAccountCode('');
            onAccountCodeChange('');
          }}
          onLearn={async (pattern) => {
            // Add userId to pattern
            const patternWithUser = {
              ...pattern,
              created_by: userId || 'unknown'
            };
            await onLearnPattern(patternWithUser);
            // Also update the transaction with the new code
            setSelectedAccountCode(pattern.code_comptable);
            onAccountCodeChange(pattern.code_comptable);
            if (pattern.categorie) {
              onCategoryChange(pattern.categorie);
            }
          }}
        />
      )}
    </div>
  );
}