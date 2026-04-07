import { useState } from 'react';
import { X, ArrowRight, AlertTriangle } from 'lucide-react';
import { formatMontant, cn } from '@/utils/utils';

interface MontantEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (justification: string) => void;
  oldMontant: number;
  newMontant: number;
}

export function MontantEditModal({
  isOpen,
  onClose,
  onConfirm,
  oldMontant,
  newMontant
}: MontantEditModalProps) {
  const [justification, setJustification] = useState('');

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(justification.trim());
    setJustification('');
  };

  const handleClose = () => {
    setJustification('');
    onClose();
  };

  const difference = newMontant - oldMontant;
  const percentChange = oldMontant !== 0 ? ((difference / oldMontant) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-dark-card rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-dark-border bg-amber-50 dark:bg-amber-900/20">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <h3 className="font-semibold text-gray-900 dark:text-dark-text-primary">
              Modification du montant
            </h3>
          </div>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-gray-200 dark:hover:bg-dark-hover rounded-full transition-colors"
          >
            <X className="h-5 w-5 text-gray-500 dark:text-dark-text-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Montant change visualization */}
          <div className="flex items-center justify-center gap-4 py-4 bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-dark-bg rounded-lg">
            <div className="text-center">
              <div className="text-xs text-gray-500 dark:text-dark-text-muted mb-1">Ancien</div>
              <div className="text-lg font-mono line-through text-gray-500 dark:text-dark-text-muted">
                {formatMontant(oldMontant)}
              </div>
            </div>
            <ArrowRight className="h-6 w-6 text-gray-400 dark:text-dark-text-muted" />
            <div className="text-center">
              <div className="text-xs text-gray-500 dark:text-dark-text-muted mb-1">Nouveau</div>
              <div className="text-lg font-mono font-bold text-gray-900 dark:text-dark-text-primary">
                {formatMontant(newMontant)}
              </div>
            </div>
          </div>

          {/* Difference indicator */}
          <div className={cn(
            "text-center text-sm",
            difference > 0 ? "text-red-600" : difference < 0 ? "text-green-600" : "text-gray-500 dark:text-dark-text-muted"
          )}>
            {difference > 0 ? '+' : ''}{formatMontant(difference)}
            {oldMontant !== 0 && (
              <span className="text-gray-400 dark:text-dark-text-muted ml-1">
                ({percentChange > 0 ? '+' : ''}{percentChange.toFixed(1)}%)
              </span>
            )}
          </div>

          {/* Justification field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
              Justification <span className="text-gray-400 dark:text-dark-text-muted font-normal">(optionnel)</span>
            </label>
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Ex: Erreur de saisie, ticket corrigé..."
              className={cn(
                "w-full px-3 py-2 text-sm rounded-lg border transition-colors resize-none",
                "border-gray-300 dark:border-dark-border",
                "bg-white dark:bg-dark-bg",
                "text-gray-900 dark:text-dark-text-primary",
                "placeholder:text-gray-400 dark:text-dark-text-muted dark:placeholder:text-dark-text-muted",
                "focus:ring-2 focus:ring-calypso-blue/20 focus:border-calypso-blue"
              )}
              rows={2}
            />
          </div>

          {/* Info message */}
          <p className="text-xs text-gray-500 dark:text-dark-text-muted">
            Cette modification sera enregistrée dans l'historique de la demande.
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-dark-bg">
          <button
            onClick={handleClose}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
              "text-gray-700 dark:text-dark-text-primary",
              "hover:bg-gray-200 dark:hover:bg-dark-hover"
            )}
          >
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
              "bg-calypso-blue text-white",
              "hover:bg-blue-700"
            )}
          >
            Confirmer la modification
          </button>
        </div>
      </div>
    </div>
  );
}
