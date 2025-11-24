import React, { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { TransactionBancaire, AccountCode } from '@/types';
import { CategorizationService } from '@/services/categorizationService';
import { AccountCodeSelectorModal } from '@/components/commun/AccountCodeSelectorModal';
import { cn } from '@/utils/utils';

interface CategoryAccountSelectorProps {
  transaction?: TransactionBancaire;
  isExpense?: boolean;
  selectedCategory?: string;
  selectedAccountCode?: string;
  onCategoryChange: (categoryId: string) => void;
  onAccountCodeChange: (accountCode: string) => void;
  className?: string;
  clubId?: string; // Voor smart suggesties
  counterpartyName?: string; // Voor smart suggesties
}

export function CategoryAccountSelector({
  transaction,
  isExpense: isExpenseProp,
  selectedCategory: selectedCategoryProp,
  selectedAccountCode: selectedAccountCodeProp,
  onCategoryChange,
  onAccountCodeChange,
  className,
  clubId,
  counterpartyName
}: CategoryAccountSelectorProps) {
  // Support both transaction-based mode and direct props mode
  const initialAccountCode = selectedAccountCodeProp ?? transaction?.code_comptable ?? '';
  const isExpense = isExpenseProp ?? (transaction ? transaction.montant < 0 : false);

  // Extract counterparty from transaction if not provided
  const effectiveCounterparty = counterpartyName ?? transaction?.contrepartie_nom ?? '';

  const [selectedAccountCode, setSelectedAccountCode] = useState<string>(initialAccountCode);
  const [isModalOpen, setIsModalOpen] = useState(false);

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
  const selectedCodeObj = selectedAccountCode
    ? CategorizationService.getAccountCodesByType(isExpense).find(c => c.code === selectedAccountCode)
    : null;

  // Handle code selection from modal
  const handleCodeSelect = (code: string) => {
    setSelectedAccountCode(code);
    onAccountCodeChange(code);
    setIsModalOpen(false);

    // Auto-update category based on selected code
    const codeObj = CategorizationService.getAccountCodesByType(isExpense).find(c => c.code === code);
    if (codeObj) {
      // Find the category that matches this code's prefix
      const category = CategorizationService.getCategoriesByType(isExpense).find(cat =>
        code.startsWith(cat.compte_comptable)
      );
      if (category) {
        onCategoryChange(category.id);
      }
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      {/* Code comptable - Clickable field that opens modal */}
      <div>
        <label htmlFor="accountCode" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
          Code comptable
        </label>
        <div
          onClick={() => setIsModalOpen(true)}
          className="relative w-full pl-3 pr-10 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-secondary cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
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
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-dark-text-muted pointer-events-none" />
        </div>
      </div>

      {/* Account Code Selector Modal */}
      <AccountCodeSelectorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSelect={handleCodeSelect}
        initialCode={selectedAccountCode}
        isExpense={isExpense}
        counterpartyName={effectiveCounterparty}
        clubId={clubId}
        transaction={transaction} // NEW: Pass full transaction for keyword-based suggestions
      />
    </div>
  );
}