import React from 'react';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { useFiscalYear } from '@/contexts/FiscalYearContext';

/**
 * Bannière d'avertissement affichée en mode consultation archives
 * S'affiche automatiquement quand l'utilisateur consulte une année différente de l'année courante
 */
export function ArchiveBanner() {
  const {
    selectedFiscalYear,
    currentFiscalYear,
    isArchiveMode,
    resetToCurrentYear
  } = useFiscalYear();

  // Ne rien afficher si pas en mode archive
  if (!isArchiveMode || !selectedFiscalYear) return null;

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'closed': return 'clôturée';
      case 'permanently_closed': return 'verrouillée définitivement';
      default: return status;
    }
  };

  return (
    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 rounded-r-lg">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />

        <div className="flex-1">
          <h3 className="text-sm font-semibold text-yellow-800 mb-1">
            ⚠️ CONSULTATION EN MODE ARCHIVE ({selectedFiscalYear.year})
          </h3>
          <p className="text-sm text-yellow-700 mb-2">
            Vous consultez les données de l'année fiscale <strong>{selectedFiscalYear.year}</strong> ({getStatusLabel(selectedFiscalYear.status)}).
            {selectedFiscalYear.status === 'permanently_closed' && (
              <> Cette année est verrouillée de manière définitive.</>
            )}
            {selectedFiscalYear.status === 'closed' && (
              <> Les modifications sont désactivées pour les utilisateurs normaux.</>
            )}
          </p>

          {currentFiscalYear && (
            <button
              onClick={resetToCurrentYear}
              className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white text-sm font-medium rounded-lg hover:bg-yellow-700 transition-colors"
            >
              Retourner à l'année courante {currentFiscalYear.year}
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
