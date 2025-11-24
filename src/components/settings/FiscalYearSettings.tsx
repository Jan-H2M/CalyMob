import React, { useState, useEffect } from 'react';
import { Lock, LockKeyhole, CheckCircle, AlertCircle, Calendar, RefreshCw } from 'lucide-react';
import { useFiscalYear } from '@/contexts/FiscalYearContext';
import { useAuth } from '@/contexts/AuthContext';
import { FiscalYearService } from '@/services/fiscalYearService';
import { cn } from '@/utils/utils';
import toast from 'react-hot-toast';
import { FiscalYear } from '@/types';

/**
 * Composant de gestion des années fiscales
 * Permet de clôturer, rouvrir, et verrouiller définitivement les années
 */
export function FiscalYearSettings() {
  const { allFiscalYears, currentFiscalYear, refreshFiscalYears } = useFiscalYear();
  const { user, clubId, hasPermission } = useAuth();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Record<string, any>>({});

  // Charger les statistiques pour chaque année
  useEffect(() => {
    const loadStats = async () => {
      const statsData: Record<string, any> = {};

      for (const fy of allFiscalYears) {
        try {
          const validation = await FiscalYearService.canCloseFiscalYear(clubId, fy);
          statsData[fy.id] = {
            validation,
            transactions: await FiscalYearService.getTransactionsForFiscalYear(clubId, fy)
          };
        } catch (error) {
          console.error(`Error loading stats for ${fy.id}:`, error);
        }
      }

      setStats(statsData);
    };

    if (allFiscalYears.length > 0) {
      loadStats();
    }
  }, [allFiscalYears, clubId]);

  const handleCloseFiscalYear = async (fiscalYear: FiscalYear) => {
    if (!hasPermission('settings.manage')) {
      toast.error('Vous n\'avez pas les permissions nécessaires');
      return;
    }

    const fyStats = stats[fiscalYear.id];
    if (!fyStats) {
      toast.error('Statistiques non chargées');
      return;
    }

    // Afficher les avertissements s'il y en a
    if (fyStats.validation.reasons.length > 0) {
      const warnings = fyStats.validation.reasons.join('\n');
      if (!confirm(`⚠️ Avertissements:\n\n${warnings}\n\nVoulez-vous continuer ?`)) {
        return;
      }
    }

    setLoading(true);
    try {
      await FiscalYearService.closeFiscalYear(clubId, fiscalYear.id, user?.uid);
      toast.success(`Année ${fiscalYear.year} clôturée avec succès`);
      await refreshFiscalYears();
    } catch (error: any) {
      console.error('Error closing fiscal year:', error);
      toast.error(error.message || 'Erreur lors de la clôture');
    } finally {
      setLoading(false);
    }
  };

  const handleReopenFiscalYear = async (fiscalYear: FiscalYear) => {
    if (!hasPermission('settings.manage')) {
      toast.error('Vous n\'avez pas les permissions nécessaires');
      return;
    }

    if (!confirm(`Êtes-vous sûr de vouloir rouvrir l'année ${fiscalYear.year} ?`)) {
      return;
    }

    setLoading(true);
    try {
      await FiscalYearService.reopenFiscalYear(clubId, fiscalYear.id);
      toast.success(`Année ${fiscalYear.year} rouverte`);
      await refreshFiscalYears();
    } catch (error: any) {
      console.error('Error reopening fiscal year:', error);
      toast.error(error.message || 'Erreur lors de la réouverture');
    } finally {
      setLoading(false);
    }
  };

  const handlePermanentlyClose = async (fiscalYear: FiscalYear) => {
    if (!hasPermission('settings.manage')) {
      toast.error('Vous n\'avez pas les permissions nécessaires');
      return;
    }

    const confirmed = confirm(
      `⚠️ ATTENTION: Verrouillage définitif\n\n` +
      `Êtes-vous sûr de vouloir verrouiller DÉFINITIVEMENT l'année ${fiscalYear.year} ?\n\n` +
      `Cette action est IRRÉVERSIBLE. L'année ne pourra plus jamais être modifiée.\n\n` +
      `Tapez "VERROUILLER" pour confirmer.`
    );

    if (!confirmed) {
      return;
    }

    const userInput = prompt('Tapez "VERROUILLER" pour confirmer:');
    if (userInput !== 'VERROUILLER') {
      toast.error('Action annulée');
      return;
    }

    setLoading(true);
    try {
      await FiscalYearService.permanentlyCloseFiscalYear(clubId, fiscalYear.id);
      toast.success(`Année ${fiscalYear.year} verrouillée définitivement`);
      await refreshFiscalYears();
    } catch (error: any) {
      console.error('Error permanently closing fiscal year:', error);
      toast.error(error.message || 'Erreur lors du verrouillage');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'closed':
        return <Lock className="w-5 h-5 text-orange-600" />;
      case 'permanently_closed':
        return <LockKeyhole className="w-5 h-5 text-red-600" />;
      default:
        return null;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'open': return 'Ouverte';
      case 'closed': return 'Clôturée';
      case 'permanently_closed': return 'Verrouillée';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-green-100 text-green-800 border-green-300';
      case 'closed': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'permanently_closed': return 'bg-red-100 text-red-800 border-red-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('fr-BE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
            Gestion des Années Fiscales
          </h2>
          <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
            Clôturer, rouvrir, ou verrouiller définitivement les années fiscales
          </p>
        </div>
        <button
          onClick={refreshFiscalYears}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          Actualiser
        </button>
      </div>

      {/* Fiscal Years List */}
      <div className="space-y-4">
        {allFiscalYears.map((fy) => {
          const fyStats = stats[fy.id];
          const isCurrent = currentFiscalYear?.id === fy.id;

          return (
            <div
              key={fy.id}
              className={cn(
                "bg-white dark:bg-dark-bg-secondary rounded-lg border-2 p-6",
                isCurrent ? "border-blue-500" : "border-gray-200 dark:border-dark-border"
              )}
            >
              {/* Header Row */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Calendar className="w-6 h-6 text-blue-600" />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary">
                        Année {fy.year}
                      </h3>
                      {isCurrent && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                      {formatDate(fy.start_date)} → {formatDate(fy.end_date)}
                    </p>
                  </div>
                </div>

                {/* Status Badge */}
                <div className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-full border font-medium',
                  getStatusColor(fy.status)
                )}>
                  {getStatusIcon(fy.status)}
                  <span>{getStatusLabel(fy.status)}</span>
                </div>
              </div>

              {/* Statistics */}
              {fyStats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 p-4 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-dark-text-muted">Transactions</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                      {fyStats.transactions?.length || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-dark-text-muted">Solde d'ouverture</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                      {fy.opening_balances.bank_current.toFixed(2)} €
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-dark-text-muted">Solde de clôture</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                      {fy.closing_balances.bank_current.toFixed(2)} €
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-dark-text-muted">Non réconciliées</p>
                    <p className={cn(
                      "text-lg font-semibold",
                      fyStats.transactions?.filter((t: any) => !t.reconcilie).length > 0
                        ? "text-orange-600"
                        : "text-green-600"
                    )}>
                      {fyStats.transactions?.filter((t: any) => !t.reconcilie).length || 0}
                    </p>
                  </div>
                </div>
              )}

              {/* Validation Warnings */}
              {fyStats?.validation?.reasons && fyStats.validation.reasons.length > 0 && (
                <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-yellow-900 dark:text-yellow-200 mb-1">
                        Avertissements:
                      </p>
                      <ul className="text-sm text-yellow-800 dark:text-yellow-300 list-disc list-inside">
                        {fyStats.validation.reasons.map((reason: string, idx: number) => (
                          <li key={idx}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 flex-wrap">
                {fy.status === 'open' && (
                  <button
                    onClick={() => handleCloseFiscalYear(fy)}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
                  >
                    <Lock className="w-4 h-4" />
                    Clôturer
                  </button>
                )}

                {fy.status === 'closed' && (
                  <>
                    <button
                      onClick={() => handleReopenFiscalYear(fy)}
                      disabled={loading}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Rouvrir
                    </button>
                    <button
                      onClick={() => handlePermanentlyClose(fy)}
                      disabled={loading}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                    >
                      <LockKeyhole className="w-4 h-4" />
                      Verrouiller définitivement
                    </button>
                  </>
                )}

                {fy.status === 'permanently_closed' && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-dark-bg-tertiary rounded-lg text-gray-600 dark:text-dark-text-muted">
                    <LockKeyhole className="w-4 h-4" />
                    Verrouillée (irréversible)
                  </div>
                )}
              </div>

              {/* Closed Info */}
              {fy.closed_at && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-dark-border text-sm text-gray-600 dark:text-dark-text-secondary">
                  Clôturée le {formatDate(fy.closed_at)}
                  {fy.closed_by && ` par ${fy.closed_by}`}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Help Section */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
          À propos des statuts d'années fiscales
        </h3>
        <div className="text-sm text-blue-800 dark:text-blue-300 space-y-2">
          <p><strong>✅ Ouverte:</strong> Année active, toutes modifications autorisées</p>
          <p><strong>🔒 Clôturée:</strong> Année fermée, peut être rouverte pour ajustements</p>
          <p><strong>🔐 Verrouillée:</strong> Année définitivement fermée, aucune modification possible (irréversible)</p>
        </div>
      </div>
    </div>
  );
}
