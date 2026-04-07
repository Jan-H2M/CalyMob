import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, UserCheck, AlertCircle } from 'lucide-react';
import { Membre } from '@/types';
import { formatDate, cn } from '@/utils/utils';
import { getFirstName, getLastName } from '@/utils/fieldMapper';

interface CotisationDateConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  membre: Membre | null;
  onConfirm: (date: Date) => void;
}

// Helper: calculer la date de cotisation par défaut
// La cotisation est pour une année complète → toujours 31 janvier de l'année suivante
function getDefaultCotisationDate(): Date {
  const now = new Date();
  const currentYear = now.getFullYear();

  // Toujours 31 janvier de l'année suivante
  return new Date(currentYear + 1, 0, 31); // 31 janvier année+1
}

// Helper: formater date pour input type="date"
function formatDateForInput(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Helper: vérifier si cotisation est expirée
function isCotisationExpired(cotisationDate: Date | undefined | null): boolean {
  if (!cotisationDate) return true;
  const date = cotisationDate instanceof Date ? cotisationDate : new Date(cotisationDate);
  return date < new Date();
}

export function CotisationDateConfirmModal({
  isOpen,
  onClose,
  membre,
  onConfirm
}: CotisationDateConfirmModalProps) {
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Initialiser la date quand le modal s'ouvre
  useEffect(() => {
    if (isOpen && membre) {
      const defaultDate = getDefaultCotisationDate();
      setSelectedDate(formatDateForInput(defaultDate));
    }
  }, [isOpen, membre]);

  const handleConfirm = async () => {
    if (!selectedDate) return;

    setSaving(true);
    try {
      const date = new Date(selectedDate);
      await onConfirm(date);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !membre) return null;

  const currentCotisation = membre.cotisation_validite as Date | undefined;
  const isCurrentExpired = isCotisationExpired(currentCotisation);
  const memberName = membre.displayName || `${getFirstName(membre)} ${getLastName(membre)}`;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-[80]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-2xl max-w-md w-full">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border bg-gradient-to-r from-green-600 to-green-700 rounded-t-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <UserCheck className="h-6 w-6 text-white" />
                <h2 className="text-lg font-bold text-white">
                  Confirmer la cotisation
                </h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-white" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            {/* Membre info */}
            <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4">
              <div className="text-sm text-gray-500 dark:text-dark-text-muted mb-1">Membre</div>
              <div className="font-medium text-gray-900 dark:text-dark-text-primary text-lg">
                {memberName}
              </div>
              {membre.email && (
                <div className="text-sm text-gray-500 dark:text-dark-text-muted mt-1">
                  {membre.email}
                </div>
              )}
            </div>

            {/* Cotisation actuelle */}
            <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4">
              <div className="text-sm text-gray-500 dark:text-dark-text-muted mb-1">Cotisation actuelle</div>
              {currentCotisation ? (
                <div className={cn(
                  "flex items-center gap-2 font-medium",
                  isCurrentExpired ? "text-red-600" : "text-gray-900 dark:text-dark-text-primary"
                )}>
                  <Clock className="h-4 w-4" />
                  <span>Valable jusqu'au {formatDate(currentCotisation)}</span>
                  {isCurrentExpired && (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                      Expirée
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-gray-500 dark:text-dark-text-muted italic">
                  <AlertCircle className="h-4 w-4" />
                  <span>Aucune cotisation enregistrée</span>
                </div>
              )}
            </div>

            {/* Nouvelle date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                <Calendar className="h-4 w-4 inline mr-2" />
                Nouvelle date de validité
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-dark-border rounded-lg text-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-dark-bg-tertiary"
              />
              <p className="mt-2 text-xs text-gray-500 dark:text-dark-text-muted">
                Par défaut: 31 janvier {new Date().getFullYear() + 1}
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary rounded-b-xl">
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors font-medium"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirm}
                disabled={!selectedDate || saving}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <UserCheck className="h-4 w-4" />
                    Confirmer
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
