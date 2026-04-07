import { logger } from '@/utils/logger';
/**
 * InventoryValueSnapshotDetail - Detail weergave van een Inventory Value Snapshot
 *
 * Toont:
 * - Snapshot metadata (datum, totalen, amortissements)
 * - Lijst van items met hun waarden
 * - Lock/Unlock knoppen
 *
 * Bilan code: 01.01 "Stock matériel (pour mémoire)"
 */

import { useState, useEffect } from 'react';
import { ArrowLeft, Lock, Unlock, X, Package, Euro, TrendingDown, Trash2 } from 'lucide-react';
import { InventoryValueSnapshotService } from '@/services/inventoryValueSnapshotService';
import { InventoryValueSnapshot, InventoryValueSnapshotItem } from '@/types/inventory';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

interface Props {
  snapshotId: string;
  onBack: () => void;
}

export function InventoryValueSnapshotDetail({ snapshotId, onBack }: Props) {
  const { clubId } = useAuth();
  const [snapshot, setSnapshot] = useState<InventoryValueSnapshot | null>(null);
  const [items, setItems] = useState<InventoryValueSnapshotItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (clubId && snapshotId) {
      loadSnapshot();
    }
  }, [clubId, snapshotId]);

  const loadSnapshot = async () => {
    if (!clubId) return;

    try {
      setLoading(true);
      const [snapshotData, itemsData] = await Promise.all([
        InventoryValueSnapshotService.getSnapshotById(clubId, snapshotId),
        InventoryValueSnapshotService.getSnapshotItems(clubId, snapshotId)
      ]);
      setSnapshot(snapshotData);
      setItems(itemsData);
    } catch (error) {
      logger.error('Erreur chargement snapshot:', error);
      toast.error('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  // Verrouiller: en_cours → verrouille
  const handleLockSnapshot = async () => {
    if (!clubId || !snapshot) return;

    const confirmed = window.confirm(
      'Verrouiller rend cette clôture non modifiable.\n\nCette valeur sera utilisée pour le Bilan comptable (code 01.01).\n\nContinuer ?'
    );
    if (!confirmed) return;

    try {
      await InventoryValueSnapshotService.lockSnapshot(clubId, snapshot.id);
      toast.success('Clôture verrouillée');
      await loadSnapshot();
    } catch (error: unknown) {
      logger.error('Erreur verrouillage:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors du verrouillage';
      toast.error(errorMessage);
    }
  };

  // Déverrouiller: verrouille → en_cours (2x confirm)
  const handleUnlockSnapshot = async () => {
    if (!clubId || !snapshot) return;

    // Première confirmation
    const firstConfirm = window.confirm(
      `DÉVERROUILLAGE DE LA CLÔTURE MATÉRIEL ${snapshot.year}\n\n` +
      `Cette clôture est verrouillée et pourrait déjà être reprise en comptabilité.\n\n` +
      `Êtes-vous sûr de vouloir la déverrouiller ?`
    );
    if (!firstConfirm) return;

    // Deuxième confirmation
    const secondConfirm = window.confirm(
      `CONFIRMATION FINALE\n\n` +
      `Normalement, on ne modifie JAMAIS une clôture verrouillée.\n\n` +
      `Êtes-vous absolument certain de vouloir continuer ?`
    );
    if (!secondConfirm) return;

    try {
      await InventoryValueSnapshotService.unlockSnapshot(clubId, snapshot.id);
      toast.success('Clôture déverrouillée');
      await loadSnapshot();
    } catch (error: unknown) {
      logger.error('Erreur déverrouillage:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors du déverrouillage';
      toast.error(errorMessage);
    }
  };

  // Supprimer (alleen als niet verrouillé)
  const handleDeleteSnapshot = async () => {
    if (!clubId || !snapshot) return;

    if (snapshot.statut === 'verrouille') {
      toast.error('Impossible de supprimer une clôture verrouillée');
      return;
    }

    const confirmed = window.confirm(
      `Supprimer la clôture ${snapshot.nom} ?\n\nCette action est irréversible.`
    );
    if (!confirmed) return;

    try {
      await InventoryValueSnapshotService.deleteSnapshot(clubId, snapshot.id);
      toast.success('Clôture supprimée');
      onBack();
    } catch (error: unknown) {
      logger.error('Erreur suppression:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la suppression';
      toast.error(errorMessage);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('fr-BE', {
      style: 'currency',
      currency: 'EUR'
    }).format(value);
  };

  const formatPercent = (value: number, total: number) => {
    if (total === 0) return '0%';
    return `${((value / total) * 100).toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-calypso-blue"></div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">Clôture non trouvée</p>
        <button
          onClick={onBack}
          className="mt-4 text-calypso-blue hover:text-calypso-blue/80"
        >
          Retour à la liste
        </button>
      </div>
    );
  }

  const isReadOnly = snapshot.statut === 'verrouille';
  const canLock = snapshot.statut === 'en_cours';
  const canUnlock = snapshot.statut === 'verrouille';
  const canDelete = snapshot.statut === 'en_cours';

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:text-dark-text-primary dark:hover:text-dark-text-primary"
        >
          <ArrowLeft className="h-5 w-5 mr-2" />
          Retour
        </button>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {/* Delete button (only if not locked) */}
          {canDelete && (
            <button
              onClick={handleDeleteSnapshot}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Supprimer
            </button>
          )}

          {/* Close button */}
          <button
            onClick={onBack}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-dark-text-primary bg-gray-100 dark:bg-dark-bg-tertiary rounded-md hover:bg-gray-200 dark:hover:bg-dark-bg-primary"
          >
            <X className="h-4 w-4 mr-2" />
            Fermer
          </button>

          {/* en_cours: Verrouiller knop */}
          {canLock && (
            <button
              onClick={handleLockSnapshot}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700"
            >
              <Lock className="h-4 w-4 mr-2" />
              Verrouiller
            </button>
          )}

          {/* verrouille: Déverrouiller knop */}
          {canUnlock && (
            <button
              onClick={handleUnlockSnapshot}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
            >
              <Unlock className="h-4 w-4 mr-2" />
              Déverrouiller
            </button>
          )}

          {/* Status badge verrouillé */}
          {isReadOnly && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
              <Lock className="h-4 w-4 mr-1" />
              Verrouillé
            </span>
          )}
        </div>
      </div>

      {/* Dashboard Stats */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow p-6">
        <div className="mb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-calypso-blue/10 dark:bg-calypso-blue/20 rounded-full flex items-center justify-center">
              <Package className="h-5 w-5 text-calypso-blue" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary">
                {snapshot.nom}
              </h2>
              <p className="text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
                Créée le {snapshot.snapshot_date.toDate().toLocaleDateString('fr-FR')}
                {snapshot.date_verrouillage && ` • Verrouillée le ${snapshot.date_verrouillage.toDate().toLocaleDateString('fr-FR')}`}
              </p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4 text-center">
            <div className="flex items-center justify-center mb-2">
              <Package className="h-5 w-5 text-gray-400 dark:text-dark-text-muted" />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
              {snapshot.total_items}
            </p>
            <p className="text-xs text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">Articles</p>
          </div>
          <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4 text-center">
            <div className="flex items-center justify-center mb-2">
              <Euro className="h-5 w-5 text-gray-400 dark:text-dark-text-muted" />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
              {formatCurrency(snapshot.total_purchase_value)}
            </p>
            <p className="text-xs text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">Valeur d'achat</p>
          </div>
          <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4 text-center">
            <div className="flex items-center justify-center mb-2">
              <TrendingDown className="h-5 w-5 text-orange-500" />
            </div>
            <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
              {formatCurrency(snapshot.total_accumulated_depreciation)}
            </p>
            <p className="text-xs text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
              Amortissements ({formatPercent(snapshot.total_accumulated_depreciation, snapshot.total_purchase_value)})
            </p>
          </div>
          <div className="bg-calypso-blue/10 dark:bg-calypso-blue/20 rounded-lg p-4 text-center">
            <div className="flex items-center justify-center mb-2">
              <Euro className="h-5 w-5 text-calypso-blue" />
            </div>
            <p className="text-2xl font-bold text-calypso-blue">
              {formatCurrency(snapshot.total_current_value)}
            </p>
            <p className="text-xs text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">Valeur nette (Bilan)</p>
          </div>
        </div>

        {/* Info box for Bilan */}
        {isReadOnly && (
          <div className="mt-4 p-3 bg-calypso-blue/10 dark:bg-calypso-blue/20 rounded-lg border border-calypso-blue/30">
            <p className="text-sm text-calypso-blue dark:text-calypso-blue">
              <strong>Pour le Bilan:</strong> Cette valeur nette ({formatCurrency(snapshot.total_current_value)}) sera utilisée
              pour le code 01.01 "Stock matériel (pour mémoire)" dans le Bilan comptable {snapshot.year}.
            </p>
          </div>
        )}
      </div>

      {/* Items List */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border">
          <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">
            Équipements ({items.length})
          </h3>
        </div>

        {items.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Package className="mx-auto h-8 w-8 text-gray-300 dark:text-dark-text-muted mb-2" />
            <p className="text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
              Aucun équipement dans cette clôture
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
              <thead className="bg-gray-50 dark:bg-dark-bg-tertiary">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary uppercase tracking-wider">
                    Code
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary uppercase tracking-wider">
                    Type / Nom
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary uppercase tracking-wider">
                    Valeur achat
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary uppercase tracking-wider">
                    Amortissement
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary uppercase tracking-wider">
                    Valeur nette
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-dark-bg-secondary divide-y divide-gray-200 dark:divide-dark-border">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-mono text-gray-600 dark:text-dark-text-secondary">
                        {item.code}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                          {item.typeName}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
                          {item.nom}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <span className="text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
                        {formatCurrency(item.valeur_achat)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <span className="text-sm text-orange-600 dark:text-orange-400">
                        -{formatCurrency(item.accumulated_depreciation)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <span className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                        {formatCurrency(item.current_value)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 dark:bg-dark-bg-tertiary">
                <tr>
                  <td colSpan={2} className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                    Total ({snapshot.total_items} articles)
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                    {formatCurrency(snapshot.total_purchase_value)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-orange-600 dark:text-orange-400">
                    -{formatCurrency(snapshot.total_accumulated_depreciation)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-calypso-blue">
                    {formatCurrency(snapshot.total_current_value)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
