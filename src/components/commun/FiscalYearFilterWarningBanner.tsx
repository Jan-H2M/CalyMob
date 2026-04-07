import { AlertTriangle } from 'lucide-react';
import { useFiscalYear } from '@/contexts/FiscalYearContext';

/**
 * Bannière d'avertissement affichée quand le filtrage par année fiscale est désactivé
 * S'affiche sur toutes les pages pour rappeler que TOUTES les données sont visibles
 */
export function FiscalYearFilterWarningBanner() {
  const { disableFiscalYearFilter, setDisableFiscalYearFilter } = useFiscalYear();

  // Ne rien afficher si le filtrage est activé (comportement normal)
  if (!disableFiscalYearFilter) return null;

  return (
    <div className="bg-amber-100 border-l-4 border-amber-500 p-4 mb-6 rounded-r-lg">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />

        <div className="flex-1">
          <h3 className="text-sm font-semibold text-amber-800 mb-1">
            ⚠️ FILTRAGE PAR ANNÉE FISCALE DÉSACTIVÉ
          </h3>
          <p className="text-sm text-amber-700 mb-2">
            Vous voyez <strong>toutes les données de toutes les années fiscales</strong>.
            Les statistiques et calculs peuvent être incorrects.
          </p>

          <button
            onClick={() => setDisableFiscalYearFilter(false)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors"
          >
            Réactiver le filtrage
          </button>
        </div>
      </div>
    </div>
  );
}
