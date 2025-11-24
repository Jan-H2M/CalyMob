import { CheckCircle, AlertCircle, Tag, Building, FileText } from 'lucide-react';
import { TransactionBancaire } from '@/types';
import { formatMontant, cn, getCategoryColorClasses } from '@/utils/utils';
import { CategorizationService } from '@/services/categorizationService';

interface TransactionSummaryCardProps {
  transaction: TransactionBancaire;
}

export function TransactionSummaryCard({
  transaction
}: TransactionSummaryCardProps) {
  const isReconciled = transaction.reconcilie || (transaction.matched_entities && transaction.matched_entities.length > 0);
  const categories = CategorizationService.getAllCategories();
  const category = transaction.categorie
    ? categories.find(c => c.id === transaction.categorie)
    : null;
  const categoryColorClasses = transaction.categorie
    ? getCategoryColorClasses(transaction.categorie, categories)
    : '';

  return (
    <div className={cn(
      "bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border-l-4 p-6 space-y-4",
      isReconciled ? "border-l-green-500 dark:border-l-green-400" : "border-l-orange-500 dark:border-l-orange-400"
    )}>
      {/* Row 1: Amount + Status Badges */}
      <div className="flex items-start justify-between gap-4">
        {/* Amount */}
        <div>
          <p className="text-sm text-gray-600 dark:text-dark-text-secondary mb-1">Montant</p>
          <p className={cn(
            "text-3xl font-bold leading-none",
            transaction.montant > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
          )}>
            {formatMontant(transaction.montant)}
          </p>
        </div>

        {/* Status Badges */}
        <div className="flex flex-wrap gap-2 justify-end">
          {/* Reconciliation Status */}
          <div className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold",
            isReconciled
              ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
              : "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400"
          )}>
            {isReconciled ? (
              <>
                <CheckCircle className="h-3.5 w-3.5" />
                Réconcilié
              </>
            ) : (
              <>
                <AlertCircle className="h-3.5 w-3.5" />
                Non réconcilié
              </>
            )}
          </div>

          {/* Category Badge */}
          {category && (
            <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold", categoryColorClasses)}>
              <Tag className="h-3.5 w-3.5" />
              {category.nom}
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Counterparty + Communication */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-100 dark:border-dark-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building className="h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
            <p className="text-xs text-gray-600 dark:text-dark-text-secondary font-medium">Contrepartie</p>
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-dark-text-primary">{transaction.contrepartie_nom}</p>
          <p className="text-xs text-gray-500 dark:text-dark-text-muted font-mono mt-0.5">{transaction.contrepartie_iban}</p>
        </div>

        {transaction.communication && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
              <p className="text-xs text-gray-600 dark:text-dark-text-secondary font-medium">Communication</p>
            </div>
            <p className="text-sm text-gray-700 dark:text-dark-text-primary line-clamp-2">{transaction.communication}</p>
          </div>
        )}
      </div>

    </div>
  );
}
