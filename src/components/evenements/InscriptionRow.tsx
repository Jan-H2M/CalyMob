import React, { useState } from 'react';
import { Link2, Unlock, Eye, Banknote, XCircle, Edit2, Check, X } from 'lucide-react';
import { InscriptionEvenement, TransactionBancaire } from '@/types';
import { InscriptionPaymentBadge } from './InscriptionPaymentBadge';
import { formatMontant, formatDate, cn } from '@/utils/utils';

interface InscriptionRowProps {
  inscription: InscriptionEvenement;
  linkedTransaction?: TransactionBancaire;
  onLinkTransaction: () => void;
  onUnlinkTransaction: (keepAsPaid: boolean) => void;
  onMarkCash: () => void;
  onMarkUnpaid: () => void;
  onViewTransaction: () => void;
  onUpdateComment: (comment: string) => void;
}

/**
 * Display a single inscription with payment status and action buttons
 *
 * Handles 3 states:
 * 1. Bank-linked: has transaction_id, paye=true
 * 2. Cash-paid: no transaction_id, paye=true, mode_paiement='cash'
 * 3. Unpaid: no transaction_id, paye=false
 */
export function InscriptionRow({
  inscription,
  linkedTransaction,
  onLinkTransaction,
  onUnlinkTransaction,
  onMarkCash,
  onMarkUnpaid,
  onViewTransaction,
  onUpdateComment
}: InscriptionRowProps) {
  const [isEditingComment, setIsEditingComment] = useState(false);
  const [commentValue, setCommentValue] = useState(inscription.commentaire || '');
  const [showUnlinkDialog, setShowUnlinkDialog] = useState(false);

  const handleSaveComment = () => {
    onUpdateComment(commentValue);
    setIsEditingComment(false);
  };

  const handleCancelComment = () => {
    setCommentValue(inscription.commentaire || '');
    setIsEditingComment(false);
  };

  const handleUnlinkConfirm = (keepAsPaid: boolean) => {
    setShowUnlinkDialog(false);
    onUnlinkTransaction(keepAsPaid);
  };

  // Determine payment state
  const isLinkedToBank = inscription.transaction_id && inscription.paye;
  const isPaidCash = !inscription.transaction_id && inscription.paye && inscription.mode_paiement === 'cash';
  const isUnpaid = !inscription.paye;

  // Determine background color based on payment status
  const getBackgroundColor = () => {
    if (isLinkedToBank) {
      return 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800';
    } else if (isUnpaid) {
      return 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800';
    } else if (isPaidCash) {
      return 'bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-800';
    }
    return 'bg-white dark:bg-dark-bg-secondary border-gray-200 dark:border-dark-border';
  };

  return (
    <>
      <div className={cn("border rounded-lg p-4 hover:shadow-sm transition-shadow", getBackgroundColor())}>
        {/* Header: Name and Price */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h4 className="font-semibold text-gray-900 dark:text-dark-text-primary text-lg">
              {inscription.membre_prenom} {inscription.membre_nom}
            </h4>
            {inscription.date_inscription && (
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                <span className="font-medium">📅 Inscrit le:</span>{' '}
                <span className="text-gray-900 dark:text-dark-text-primary">{formatDate(inscription.date_inscription)}</span>
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">{formatMontant(inscription.prix)}</p>
            {/* Show paid amount if different from expected price */}
            {inscription.transaction_montant &&
             inscription.transaction_montant !== inscription.prix && (
              <p className="text-sm text-green-700 dark:text-green-400 font-medium mt-1">
                Payé: {formatMontant(inscription.transaction_montant)}
              </p>
            )}
          </div>
        </div>

        {/* Payment Status Badge */}
        <div className="mb-3">
          <InscriptionPaymentBadge inscription={inscription} showDate={true} />
        </div>

        {/* Action Buttons - State-based */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {/* STATE 1: Bank-linked */}
          {isLinkedToBank && (
            <>
              <button
                onClick={onViewTransaction}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Eye className="h-4 w-4" />
                Voir transaction
              </button>
              <button
                onClick={() => setShowUnlinkDialog(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 transition-colors"
              >
                <Unlock className="h-4 w-4" />
                Délier
              </button>
            </>
          )}

          {/* STATE 2: Cash-paid */}
          {isPaidCash && (
            <>
              <button
                onClick={onLinkTransaction}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Link2 className="h-4 w-4" />
                Lier transaction
              </button>
              <button
                onClick={onMarkUnpaid}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors"
              >
                <XCircle className="h-4 w-4" />
                Marquer impayé
              </button>
            </>
          )}

          {/* STATE 3: Unpaid */}
          {isUnpaid && (
            <>
              <button
                onClick={onLinkTransaction}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Link2 className="h-4 w-4" />
                Lier transaction
              </button>
              <button
                onClick={onMarkCash}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
              >
                <Banknote className="h-4 w-4" />
                Marquer payé espèces
              </button>
            </>
          )}
        </div>

        {/* Comment Field */}
        <div className="pt-3 border-t border-gray-200 dark:border-dark-border">
          <div className="flex items-start gap-2">
            <div className="flex-1">
              {isEditingComment ? (
                <div className="space-y-2">
                  <textarea
                    value={commentValue}
                    onChange={(e) => setCommentValue(e.target.value)}
                    placeholder="Ajouter un commentaire (ex: Payé sur place en espèces)"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none"
                    rows={2}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveComment}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <Check className="h-4 w-4" />
                      Enregistrer
                    </button>
                    <button
                      onClick={handleCancelComment}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-300 text-gray-700 dark:text-dark-text-primary text-sm rounded-lg hover:bg-gray-400 transition-colors"
                    >
                      <X className="h-4 w-4" />
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                      <span className="font-medium">💬 Commentaire:</span>{' '}
                      <span className={inscription.commentaire ? 'text-gray-900' : 'text-gray-400 italic'}>
                        {inscription.commentaire || 'Aucun commentaire'}
                      </span>
                    </p>
                  </div>
                  <button
                    onClick={() => setIsEditingComment(true)}
                    className="p-1.5 text-gray-400 dark:text-dark-text-muted hover:text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:bg-dark-bg-tertiary rounded transition-colors"
                    title="Modifier le commentaire"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Unlink Dialog */}
      {showUnlinkDialog && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-[80]"
            onClick={() => setShowUnlinkDialog(false)}
          />

          {/* Dialog */}
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[90] bg-white dark:bg-dark-bg-secondary rounded-lg shadow-2xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-3">
              Délier la transaction
            </h3>
            <p className="text-sm text-gray-600 dark:text-dark-text-secondary mb-4">
              Que souhaitez-vous faire après avoir délié cette transaction ?
            </p>

            <div className="space-y-3">
              <button
                onClick={() => handleUnlinkConfirm(true)}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-left"
              >
                <div className="font-medium">Garder comme payé (espèces)</div>
                <div className="text-sm text-blue-100 mt-1">
                  L'inscription reste marquée comme payée, le mode de paiement devient "espèces"
                </div>
              </button>

              <button
                onClick={() => handleUnlinkConfirm(false)}
                className="w-full px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-left"
              >
                <div className="font-medium">Marquer comme non payé</div>
                <div className="text-sm text-orange-100 mt-1">
                  L'inscription sera marquée comme non payée
                </div>
              </button>

              <button
                onClick={() => setShowUnlinkDialog(false)}
                className="w-full px-4 py-2 bg-gray-200 text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-300 transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
