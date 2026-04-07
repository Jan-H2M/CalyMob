import { useState, useEffect } from 'react';
import { logger } from '@/utils/logger';
import {
  X,
  Lock,
  Unlock,
  LockKeyhole,
  AlertCircle
} from 'lucide-react';
import { FiscalYear } from '@/types';
import { formatDate, formatMontant, cn } from '@/utils/utils';
import { FiscalYearService } from '@/services/fiscalYearService';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

interface FiscalYearDetailViewProps {
  fiscalYear: FiscalYear;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
  onOpenCloseWizard?: (fiscalYear: FiscalYear) => void;
}

export function FiscalYearDetailView({
  fiscalYear,
  isOpen,
  onClose,
  onUpdate,
  onOpenCloseWizard
}: FiscalYearDetailViewProps) {
  const { clubId } = useAuth();

  // Edited fields
  const [year, setYear] = useState(fiscalYear.year);
  const [startDate, setStartDate] = useState(fiscalYear.start_date.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(fiscalYear.end_date.toISOString().split('T')[0]);

  // Reset form when fiscal year changes
  useEffect(() => {
    setYear(fiscalYear.year);
    setStartDate(fiscalYear.start_date.toISOString().split('T')[0]);
    setEndDate(fiscalYear.end_date.toISOString().split('T')[0]);
  }, [fiscalYear]);

  // Auto-save handler
  const handleFieldSave = async (field: string, value: any) => {
    if (!clubId) return;

    try {
      let updates: any = {};

      if (field === 'year') {
        updates.year = parseInt(value) || fiscalYear.year;
      } else if (field === 'start_date') {
        updates.start_date = new Date(value);
      } else if (field === 'end_date') {
        updates.end_date = new Date(value);
      }

      await FiscalYearService.updateFiscalYear(clubId, fiscalYear.id, updates);

      toast.success('✓ Sauvegardé', {
        duration: 1500,
        position: 'bottom-right'
      });

      if (onUpdate) onUpdate();
    } catch (error) {
      logger.error(`Error saving ${field}:`, error);
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  const handleReopen = async () => {
    if (!clubId) return;

    const confirm = window.confirm(
      `Voulez-vous rouvrir l'année fiscale ${fiscalYear.year}?\n\n` +
      `L'année redeviendra modifiable par tous les utilisateurs.`
    );

    if (!confirm) return;

    try {
      await FiscalYearService.reopenFiscalYear(clubId, fiscalYear.id);
      toast.success(`Année ${fiscalYear.year} réouverte`);
      if (onUpdate) onUpdate();
    } catch (error) {
      logger.error('Error reopening fiscal year:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la réouverture');
    }
  };

  const handlePermanentlyClose = async () => {
    if (!clubId) return;

    const confirmFirst = window.confirm(
      `⚠️ ATTENTION: Verrouillage définitif de l'année ${fiscalYear.year}\n\n` +
      `Cette action est IRRÉVERSIBLE. L'année ne pourra plus être modifiée que par le super administrateur.\n\n` +
      `Êtes-vous sûr de vouloir continuer ?`
    );

    if (!confirmFirst) return;

    const userInput = prompt(`Pour confirmer, tapez exactement: VERROUILLER`);

    if (userInput !== 'VERROUILLER') {
      toast.error('Action annulée');
      return;
    }

    try {
      await FiscalYearService.permanentlyCloseFiscalYear(clubId, fiscalYear.id);
      toast.success(`Année ${fiscalYear.year} verrouillée définitivement`);
      if (onUpdate) onUpdate();
      onClose();
    } catch (error) {
      logger.error('Error permanently closing fiscal year:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur lors du verrouillage');
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />

      {/* Sliding panel */}
      <div className="fixed right-0 top-0 h-full w-full md:w-2/3 lg:w-1/2 bg-white dark:bg-dark-bg-secondary shadow-xl z-50 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-dark-bg-secondary border-b border-gray-200 dark:border-dark-border px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary">
              Année Fiscale {fiscalYear.year}
            </h2>
            <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
              {formatDate(fiscalYear.start_date, 'dd/MM/yyyy')} → {formatDate(fiscalYear.end_date, 'dd/MM/yyyy')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Status badge */}
            <span className={cn(
              "px-3 py-1 text-sm rounded-full font-medium",
              fiscalYear.status === 'open' && "bg-green-100 text-green-700 border border-green-300",
              fiscalYear.status === 'closed' && "bg-orange-100 text-orange-700 border border-orange-300",
              fiscalYear.status === 'permanently_closed' && "bg-red-100 text-red-700 border border-red-300"
            )}>
              {fiscalYear.status === 'open' && '✅ Ouverte'}
              {fiscalYear.status === 'closed' && '🔒 Clôturée'}
              {fiscalYear.status === 'permanently_closed' && '🔐 Verrouillée'}
            </span>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Informations générales - 3 fields on 1 line */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-dark-text-primary">
              Informations générales
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="fiscalyear-year-input" className="block text-xs font-medium text-gray-600 dark:text-dark-text-secondary mb-1">
                  Année
                </label>
                <input
                  id="fiscalyear-year-input"
                  type="number"
                  value={year}
                  onChange={(e) => setYear(parseInt(e.target.value))}
                  onBlur={() => handleFieldSave('year', year)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue text-sm"
                  min="2020"
                  max="2050"
                />
              </div>
              <div>
                <label htmlFor="fiscalyear-startDate-input" className="block text-xs font-medium text-gray-600 dark:text-dark-text-secondary mb-1">
                  Date de début
                </label>
                <input
                  id="fiscalyear-startDate-input"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  onBlur={() => handleFieldSave('start_date', startDate)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue text-sm"
                />
              </div>
              <div>
                <label htmlFor="fiscalyear-endDate-input" className="block text-xs font-medium text-gray-600 dark:text-dark-text-secondary mb-1">
                  Date de fin
                </label>
                <input
                  id="fiscalyear-endDate-input"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  onBlur={() => handleFieldSave('end_date', endDate)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue text-sm"
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <h3 className="text-sm font-semibold text-blue-900">
              Saisie comptable centralisée
            </h3>
            <p className="mt-2 text-sm text-blue-800">
              Les IBAN, soldes d’ouverture, stocks verrouillés, valeurs manuelles du bilan et la validation finale
              se gèrent désormais uniquement dans l’<strong>Assistant de clôture</strong>. Cette fiche ne sert plus
              d’écran de saisie parallèle pour la clôture.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg bg-white/80 p-3">
                <div className="text-xs uppercase tracking-wide text-blue-700">Compte courant</div>
                <div className="mt-1 text-sm text-slate-700">
                  IBAN: {fiscalYear.account_numbers?.bank_current || 'Non renseigné'}
                </div>
                <div className="mt-1 text-sm text-slate-700">
                  Ouverture: {formatMontant(fiscalYear.opening_balances.bank_current)}
                </div>
                <div className="mt-1 text-sm text-slate-700">
                  Clôture: {formatMontant(fiscalYear.closing_balances?.bank_current || 0)}
                </div>
              </div>
              <div className="rounded-lg bg-white/80 p-3">
                <div className="text-xs uppercase tracking-wide text-blue-700">Compte épargne</div>
                <div className="mt-1 text-sm text-slate-700">
                  IBAN: {fiscalYear.account_numbers?.bank_savings || 'Non renseigné'}
                </div>
                <div className="mt-1 text-sm text-slate-700">
                  Ouverture: {formatMontant(fiscalYear.opening_balances.bank_savings)}
                </div>
                <div className="mt-1 text-sm text-slate-700">
                  Clôture: {formatMontant(fiscalYear.closing_balances?.bank_savings || 0)}
                </div>
              </div>
            </div>
            {fiscalYear.notes && (
              <div className="mt-4 rounded-lg bg-white/80 p-3 text-sm text-slate-700">
                <div className="text-xs uppercase tracking-wide text-blue-700">Notes enregistrées</div>
                <div className="mt-1 whitespace-pre-wrap">{fiscalYear.notes}</div>
              </div>
            )}
          </div>

          {/* Status management buttons - compact */}
          <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-dark-text-primary mb-2">
              Gestion du statut
            </h3>

            {fiscalYear.status === 'open' && (
              <>
                <p className="text-xs text-gray-600 dark:text-dark-text-secondary mb-3">
                  ✅ Année ouverte: tout le monde peut modifier
                </p>
                <button
                  onClick={() => onOpenCloseWizard?.(fiscalYear)}
                  className="w-full px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center justify-center gap-2 font-medium text-sm"
                >
                  <Lock className="h-4 w-4" />
                  Assistant de clôture
                </button>
              </>
            )}

            {fiscalYear.status === 'closed' && (
              <>
                <p className="text-xs text-gray-600 dark:text-dark-text-secondary mb-3">
                  ⚠️ Année clôturée: seuls les admins peuvent modifier
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleReopen}
                    className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 font-medium text-sm"
                  >
                    <Unlock className="h-4 w-4" />
                    Rouvrir
                  </button>
                  <button
                    onClick={handlePermanentlyClose}
                    className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2 font-medium text-sm"
                  >
                    <LockKeyhole className="h-4 w-4" />
                    Verrouiller
                  </button>
                </div>
              </>
            )}

            {fiscalYear.status === 'permanently_closed' && (
              <div className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 rounded-lg p-3 flex items-center gap-2 border border-red-300 dark:border-red-700">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <div className="text-xs">
                  <div className="font-semibold">Année verrouillée définitivement</div>
                  <div className="mt-0.5">Seul le super administrateur peut modifier</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
