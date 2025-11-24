import React, { useState, useEffect } from 'react';
import {
  X,
  Lock,
  Unlock,
  LockKeyhole,
  AlertCircle,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { FiscalYear } from '@/types';
import { formatMontant, formatDate, cn } from '@/utils/utils';
import { FiscalYearService } from '@/services/fiscalYearService';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

interface FiscalYearDetailViewProps {
  fiscalYear: FiscalYear;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
}

export function FiscalYearDetailView({
  fiscalYear,
  isOpen,
  onClose,
  onUpdate
}: FiscalYearDetailViewProps) {
  const { clubId } = useAuth();

  // Edited fields
  const [year, setYear] = useState(fiscalYear.year);
  const [startDate, setStartDate] = useState(fiscalYear.start_date.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(fiscalYear.end_date.toISOString().split('T')[0]);
  const [openingCurrent, setOpeningCurrent] = useState(fiscalYear.opening_balances.bank_current);
  const [openingSavings, setOpeningSavings] = useState(fiscalYear.opening_balances.bank_savings);
  const [accountCurrent, setAccountCurrent] = useState(fiscalYear.account_numbers?.bank_current || '');
  const [accountSavings, setAccountSavings] = useState(fiscalYear.account_numbers?.bank_savings || '');
  const [notes, setNotes] = useState(fiscalYear.notes || '');

  // Reset form when fiscal year changes
  useEffect(() => {
    setYear(fiscalYear.year);
    setStartDate(fiscalYear.start_date.toISOString().split('T')[0]);
    setEndDate(fiscalYear.end_date.toISOString().split('T')[0]);
    setOpeningCurrent(fiscalYear.opening_balances.bank_current);
    setOpeningSavings(fiscalYear.opening_balances.bank_savings);
    setAccountCurrent(fiscalYear.account_numbers?.bank_current || '');
    setAccountSavings(fiscalYear.account_numbers?.bank_savings || '');
    setNotes(fiscalYear.notes || '');
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
      } else if (field === 'opening_current') {
        updates.opening_balances = {
          bank_current: parseFloat(value) || 0,
          bank_savings: openingSavings
        };
      } else if (field === 'opening_savings') {
        updates.opening_balances = {
          bank_current: openingCurrent,
          bank_savings: parseFloat(value) || 0
        };
      } else if (field === 'account_current') {
        updates.account_numbers = {
          bank_current: value,
          bank_savings: accountSavings
        };
      } else if (field === 'account_savings') {
        updates.account_numbers = {
          bank_current: accountCurrent,
          bank_savings: value
        };
      } else if (field === 'notes') {
        updates.notes = value;
      }

      await FiscalYearService.updateFiscalYear(clubId, fiscalYear.id, updates);

      toast.success('✓ Sauvegardé', {
        duration: 1500,
        position: 'bottom-right'
      });

      if (onUpdate) onUpdate();
    } catch (error: any) {
      console.error(`Error saving ${field}:`, error);
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  const handleClose = async () => {
    if (!clubId) return;

    const confirm = window.confirm(
      `Voulez-vous clôturer l'année fiscale ${fiscalYear.year}?\n\n` +
      `Cette action calcule les soldes de clôture et empêche les modifications par les utilisateurs normaux.\n` +
      `Elle peut être réouverte par un administrateur si nécessaire.`
    );

    if (!confirm) return;

    try {
      await FiscalYearService.closeFiscalYear(clubId, fiscalYear.id);
      toast.success(`Année ${fiscalYear.year} clôturée avec succès`);
      if (onUpdate) onUpdate();
      onClose();
    } catch (error: any) {
      console.error('Error closing fiscal year:', error);
      toast.error(error.message || 'Erreur lors de la clôture');
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
    } catch (error: any) {
      console.error('Error reopening fiscal year:', error);
      toast.error(error.message || 'Erreur lors de la réouverture');
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
    } catch (error: any) {
      console.error('Error permanently closing fiscal year:', error);
      toast.error(error.message || 'Erreur lors du verrouillage');
    }
  };

  // Calculate variation for closed years
  const varCurrent = fiscalYear.status !== 'open' ? {
    diff: fiscalYear.closing_balances.bank_current - fiscalYear.opening_balances.bank_current,
    percent: fiscalYear.opening_balances.bank_current !== 0
      ? ((fiscalYear.closing_balances.bank_current - fiscalYear.opening_balances.bank_current) / Math.abs(fiscalYear.opening_balances.bank_current)) * 100
      : 0
  } : null;

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
              className="p-2 hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
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
                <label className="block text-xs font-medium text-gray-600 dark:text-dark-text-secondary mb-1">
                  Année
                </label>
                <input
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
                <label className="block text-xs font-medium text-gray-600 dark:text-dark-text-secondary mb-1">
                  Date de début
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  onBlur={() => handleFieldSave('start_date', startDate)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-dark-text-secondary mb-1">
                  Date de fin
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  onBlur={() => handleFieldSave('end_date', endDate)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue text-sm"
                />
              </div>
            </div>
          </div>

          {/* Compte Courant - 2 fields on 1 line */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-dark-text-primary">
              Compte Courant
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-dark-text-secondary mb-1">
                  IBAN (optionnel)
                </label>
                <input
                  type="text"
                  value={accountCurrent}
                  onChange={(e) => setAccountCurrent(e.target.value)}
                  onBlur={() => handleFieldSave('account_current', accountCurrent)}
                  placeholder="BE68 5390 0754 7034"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-dark-text-secondary mb-1">
                  Solde début (€)
                </label>
                <input
                  type="number"
                  value={openingCurrent}
                  onChange={(e) => setOpeningCurrent(parseFloat(e.target.value) || 0)}
                  onBlur={() => handleFieldSave('opening_current', openingCurrent)}
                  step="0.01"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue text-sm"
                />
              </div>
            </div>
          </div>

          {/* Compte Épargne - 2 fields on 1 line */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-dark-text-primary">
              Compte Épargne
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-dark-text-secondary mb-1">
                  IBAN (optionnel)
                </label>
                <input
                  type="text"
                  value={accountSavings}
                  onChange={(e) => setAccountSavings(e.target.value)}
                  onBlur={() => handleFieldSave('account_savings', accountSavings)}
                  placeholder="BE68 5390 0754 7035"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-dark-text-secondary mb-1">
                  Solde début (€)
                </label>
                <input
                  type="number"
                  value={openingSavings}
                  onChange={(e) => setOpeningSavings(parseFloat(e.target.value) || 0)}
                  onBlur={() => handleFieldSave('opening_savings', openingSavings)}
                  step="0.01"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue text-sm"
                />
              </div>
            </div>
          </div>

          {/* Closing balances - only for closed years */}
          {fiscalYear.status !== 'open' && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-dark-text-primary mb-3">
                Soldes de clôture
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-600 dark:text-dark-text-secondary mb-1">
                    Compte Courant
                  </div>
                  <div className="text-lg font-bold text-gray-900 dark:text-dark-text-primary">
                    {formatMontant(fiscalYear.closing_balances.bank_current)}
                  </div>
                  {varCurrent && (
                    <div className={cn(
                      "text-sm font-medium mt-1 flex items-center gap-1",
                      varCurrent.diff >= 0 ? "text-green-600" : "text-red-600"
                    )}>
                      {varCurrent.diff >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {varCurrent.diff >= 0 ? '+' : ''}{formatMontant(varCurrent.diff)} ({varCurrent.percent.toFixed(1)}%)
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-xs text-gray-600 dark:text-dark-text-secondary mb-1">
                    Compte Épargne
                  </div>
                  <div className="text-lg font-bold text-gray-900 dark:text-dark-text-primary">
                    {formatMontant(fiscalYear.closing_balances.bank_savings)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notes - compact */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-dark-text-secondary mb-1">
              Notes (optionnel)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => handleFieldSave('notes', notes)}
              rows={2}
              placeholder="Notes ou remarques..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue text-sm"
            />
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
                  onClick={handleClose}
                  className="w-full px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center justify-center gap-2 font-medium text-sm"
                >
                  <Lock className="h-4 w-4" />
                  Clôturer l'année {fiscalYear.year}
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
