import React from 'react';
import { X, Calendar, User, MessageSquare, Hash, CreditCard } from 'lucide-react';
import { TransactionBancaire } from '@/types';
import { formatMontant, formatDate, cn } from '@/utils/utils';

interface TransactionDetailModalProps {
  transaction: TransactionBancaire | null;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Modal to display transaction details when viewing from inscription
 */
export function TransactionDetailModal({
  transaction,
  isOpen,
  onClose
}: TransactionDetailModalProps) {
  if (!isOpen || !transaction) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-[80] transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[90] bg-white dark:bg-dark-bg-secondary rounded-lg shadow-2xl max-w-2xl w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-dark-border bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="flex items-center gap-3">
            <CreditCard className="h-6 w-6 text-white" />
            <div>
              <h3 className="text-lg font-semibold text-white">Détails de la transaction</h3>
              <p className="text-blue-100 text-sm">
                {formatDate(transaction.date_execution, 'dd MMMM yyyy')}
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

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Amount - Prominent Display */}
          <div className="flex items-center justify-center py-4 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg">
            <div className="text-center">
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary mb-1">Montant</p>
              <p className={cn(
                "text-3xl font-bold",
                transaction.montant > 0 ? "text-green-600" : "text-red-600"
              )}>
                {formatMontant(transaction.montant)}
              </p>
            </div>
          </div>

          {/* Transaction Details Grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Date d'exécution */}
            <div className="col-span-2 md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                <Calendar className="inline h-4 w-4 mr-1" />
                Date d'exécution
              </label>
              <div className="bg-gray-50 dark:bg-dark-bg-tertiary px-3 py-2 rounded-lg">
                <p className="text-gray-900 dark:text-dark-text-primary">
                  {formatDate(transaction.date_execution, 'dd/MM/yyyy')}
                </p>
              </div>
            </div>

            {/* Date de valeur */}
            <div className="col-span-2 md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                <Calendar className="inline h-4 w-4 mr-1" />
                Date de valeur
              </label>
              <div className="bg-gray-50 dark:bg-dark-bg-tertiary px-3 py-2 rounded-lg">
                <p className="text-gray-900 dark:text-dark-text-primary">
                  {formatDate(transaction.date_valeur, 'dd/MM/yyyy')}
                </p>
              </div>
            </div>

            {/* Contrepartie */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                <User className="inline h-4 w-4 mr-1" />
                Contrepartie
              </label>
              <div className="bg-gray-50 dark:bg-dark-bg-tertiary px-3 py-2 rounded-lg">
                <p className="text-gray-900 dark:text-dark-text-primary font-medium">{transaction.contrepartie_nom}</p>
                {transaction.contrepartie_iban && (
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1 font-mono">
                    {transaction.contrepartie_iban}
                  </p>
                )}
              </div>
            </div>

            {/* Communication */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                <MessageSquare className="inline h-4 w-4 mr-1" />
                Communication
              </label>
              <div className="bg-gray-50 dark:bg-dark-bg-tertiary px-3 py-2 rounded-lg">
                <p className="text-gray-900 dark:text-dark-text-primary">
                  {transaction.communication || 'Aucune communication'}
                </p>
              </div>
            </div>

            {/* Numéro de séquence */}
            <div className="col-span-2 md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                <Hash className="inline h-4 w-4 mr-1" />
                Numéro de séquence
              </label>
              <div className="bg-gray-50 dark:bg-dark-bg-tertiary px-3 py-2 rounded-lg">
                <p className="text-gray-900 dark:text-dark-text-primary font-mono text-sm">
                  {transaction.numero_sequence}
                </p>
              </div>
            </div>

            {/* Type de transaction */}
            <div className="col-span-2 md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                Type
              </label>
              <div className="bg-gray-50 dark:bg-dark-bg-tertiary px-3 py-2 rounded-lg">
                <p className="text-gray-900 dark:text-dark-text-primary">{transaction.type_transaction}</p>
              </div>
            </div>
          </div>

          {/* Catégorie et Code comptable */}
          {(transaction.categorie || transaction.code_comptable) && (
            <div className="grid grid-cols-2 gap-4 pt-2 border-t">
              {transaction.categorie && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Catégorie
                  </label>
                  <span className="inline-block px-2.5 py-1 bg-blue-100 text-blue-700 text-sm rounded-full">
                    {transaction.categorie}
                  </span>
                </div>
              )}
              {transaction.code_comptable && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Code comptable
                  </label>
                  <span className="inline-block px-2.5 py-1 bg-purple-100 text-purple-700 text-sm rounded-full font-mono">
                    {transaction.code_comptable}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Commentaire */}
          {transaction.commentaire && (
            <div className="pt-2 border-t">
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                Commentaire
              </label>
              <div className="bg-yellow-50 border border-yellow-200 px-3 py-2 rounded-lg">
                <p className="text-gray-900 dark:text-dark-text-primary text-sm">{transaction.commentaire}</p>
              </div>
            </div>
          )}

          {/* Child transaction indicator */}
          {transaction.parent_transaction_id && (
            <div className="pt-2 border-t">
              <div className="bg-blue-50 border border-blue-200 px-3 py-2 rounded-lg">
                <p className="text-sm text-blue-900">
                  <strong>Transaction enfant</strong>
                  {transaction.child_index && transaction.child_count && (
                    <span className="ml-2">
                      (Ligne {transaction.child_index}/{transaction.child_count})
                    </span>
                  )}
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  Cette transaction provient d'une ventilation
                </p>
              </div>
            </div>
          )}

          {/* Reconciliation status */}
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-dark-text-secondary">Statut de réconciliation</span>
              <span className={cn(
                "px-2.5 py-1 rounded-full text-sm font-medium",
                transaction.reconcilie
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-700"
              )}>
                {transaction.reconcilie ? 'Réconciliée' : 'Non réconciliée'}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </>
  );
}
