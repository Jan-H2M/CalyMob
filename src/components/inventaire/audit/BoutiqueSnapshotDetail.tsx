import { logger } from '@/utils/logger';
/**
 * BoutiqueSnapshotDetail - Detail weergave van een Boutique Snapshot
 *
 * Toont:
 * - Snapshot metadata (datum, totalen)
 * - Lijst van items in de snapshot
 * - Lock/Unlock knoppen
 */

import { useState, useEffect } from 'react';
import { ArrowLeft, Lock, Unlock, X, ShoppingBag, Euro, Package } from 'lucide-react';
import { BoutiqueStockService } from '@/services/boutiqueStockService';
import { BoutiqueSnapshot, BoutiqueSnapshotItem } from '@/types/boutique';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

interface Props {
  snapshotId: string;
  onBack: () => void;
}

export function BoutiqueSnapshotDetail({ snapshotId, onBack }: Props) {
  const { clubId } = useAuth();
  const [snapshot, setSnapshot] = useState<BoutiqueSnapshot | null>(null);
  const [items, setItems] = useState<BoutiqueSnapshotItem[]>([]);
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
        BoutiqueStockService.getSnapshotById(clubId, snapshotId),
        BoutiqueStockService.getSnapshotItems(clubId, snapshotId)
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
      'Verrouiller rend cette clôture non modifiable.\n\nCette valeur sera utilisée pour le Bilan comptable.\n\nContinuer ?'
    );
    if (!confirmed) return;

    try {
      await BoutiqueStockService.lockSnapshot(clubId, snapshot.id);
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
      `DÉVERROUILLAGE DE LA CLÔTURE ${snapshot.year}\n\n` +
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
      await BoutiqueStockService.unlockSnapshot(clubId, snapshot.id);
      toast.success('Clôture déverrouillée');
      await loadSnapshot();
    } catch (error: unknown) {
      logger.error('Erreur déverrouillage:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors du déverrouillage';
      toast.error(errorMessage);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('fr-BE', {
      style: 'currency',
      currency: 'EUR'
    }).format(value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">Clôture non trouvée</p>
        <button
          onClick={onBack}
          className="mt-4 text-purple-600 hover:text-purple-700"
        >
          Retour à la liste
        </button>
      </div>
    );
  }

  const isReadOnly = snapshot.statut === 'verrouille';
  const canLock = snapshot.statut === 'en_cours';
  const canUnlock = snapshot.statut === 'verrouille';

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
          {/* Fermer = navigatie terug naar lijst */}
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
            <div className="h-10 w-10 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
              <ShoppingBag className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary">
                {snapshot.nom}
              </h2>
              <p className="text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
                Créée le {snapshot.snapshot_date.toLocaleDateString('fr-FR')}
                {snapshot.date_verrouillage && ` • Verrouillée le ${snapshot.date_verrouillage.toLocaleDateString('fr-FR')}`}
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
              <ShoppingBag className="h-5 w-5 text-gray-400 dark:text-dark-text-muted" />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
              {snapshot.total_quantite}
            </p>
            <p className="text-xs text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">Unités</p>
          </div>
          <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4 text-center col-span-2">
            <div className="flex items-center justify-center mb-2">
              <Euro className="h-5 w-5 text-purple-500" />
            </div>
            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {formatCurrency(snapshot.total_value)}
            </p>
            <p className="text-xs text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">Valeur totale stock</p>
          </div>
        </div>

        {/* Info box for Bilan */}
        {isReadOnly && (
          <div className="mt-4 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
            <p className="text-sm text-purple-700 dark:text-purple-300">
              <strong>Pour le Bilan:</strong> Cette valeur ({formatCurrency(snapshot.total_value)}) sera utilisée
              pour le code {snapshot.type === 'boutique' ? '02.01.01 (Boutique)' : '02.01.02 (Boutique LIFRAS)'}
              dans le Bilan comptable {snapshot.year}.
            </p>
          </div>
        )}
      </div>

      {/* Items List */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border">
          <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">
            Articles ({items.length})
          </h3>
        </div>

        {items.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <ShoppingBag className="mx-auto h-8 w-8 text-gray-300 dark:text-dark-text-muted mb-2" />
            <p className="text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
              Aucun article dans cette clôture
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
              <thead className="bg-gray-50 dark:bg-dark-bg-tertiary">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary uppercase tracking-wider">
                    Article
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary uppercase tracking-wider">
                    Quantité
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary uppercase tracking-wider">
                    Prix unitaire
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary uppercase tracking-wider">
                    Valeur
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-dark-bg-secondary divide-y divide-gray-200 dark:divide-dark-border">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                        {item.nom}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <span className="text-sm text-gray-900 dark:text-dark-text-primary">
                        {item.quantite}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <span className="text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
                        {formatCurrency(item.prix_achat)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <span className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                        {formatCurrency(item.value)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 dark:bg-dark-bg-tertiary">
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                    Total
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                    {snapshot.total_quantite}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    {/* Empty */}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-purple-600 dark:text-purple-400">
                    {formatCurrency(snapshot.total_value)}
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
