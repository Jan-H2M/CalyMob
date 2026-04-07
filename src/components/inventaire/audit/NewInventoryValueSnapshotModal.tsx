import { logger } from '@/utils/logger';
/**
 * NewInventoryValueSnapshotModal - Modal voor het aanmaken van een nieuwe Inventory Value Snapshot
 *
 * Gebruiker selecteert:
 * - Jaar (automatisch huidige jaar of vorig jaar)
 *
 * Bilan code: 01.01 "Stock matériel (pour mémoire)"
 */

import { useState, useEffect } from 'react';
import { X, AlertTriangle, Calendar, Package, TrendingDown } from 'lucide-react';
import { InventoryValueSnapshotService } from '@/services/inventoryValueSnapshotService';
import { InventoryValueSnapshot } from '@/types/inventory';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (snapshotId: string) => void;
  existingSnapshots: InventoryValueSnapshot[];
}

export function NewInventoryValueSnapshotModal({ isOpen, onClose, onCreated, existingSnapshots }: Props) {
  const { clubId, user } = useAuth();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [creating, setCreating] = useState(false);
  const [stockPreview, setStockPreview] = useState<{
    items: number;
    purchaseValue: number;
    currentValue: number;
    depreciation: number;
  } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Generate year options (current year + 2 previous years)
  const yearOptions = [currentYear, currentYear - 1, currentYear - 2];

  // Check if selected year already has a snapshot
  const existingSnapshot = existingSnapshots.find(s => s.year === selectedYear);
  const hasExisting = !!existingSnapshot;

  // Load stock preview when modal opens
  useEffect(() => {
    if (isOpen && clubId) {
      loadStockPreview();
    }
  }, [isOpen, clubId]);

  useEffect(() => {
    if (isOpen) {
      setSelectedYear(currentYear);
    }
  }, [isOpen, currentYear]);

  const loadStockPreview = async () => {
    if (!clubId) return;

    setLoadingPreview(true);
    try {
      const liveValue = await InventoryValueSnapshotService.calculateLiveValue(clubId);
      // For a more detailed preview, we'd need to call the full service
      // For now we just show the current value
      setStockPreview({
        items: 0, // Will be calculated by the service
        purchaseValue: 0, // Will be calculated by the service
        currentValue: liveValue,
        depreciation: 0 // Will be calculated by the service
      });
    } catch (error) {
      logger.error('Erreur chargement preview:', error);
      setStockPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleCreate = async () => {
    if (!clubId || !user) return;

    if (hasExisting) {
      toast.error(`Une clôture matériel ${selectedYear} existe déjà`);
      return;
    }

    setCreating(true);
    try {
      const snapshotId = await InventoryValueSnapshotService.createSnapshot(
        clubId,
        selectedYear,
        user.uid
      );
      toast.success(`Clôture matériel ${selectedYear} créée`);
      onCreated(snapshotId);
      onClose();
    } catch (error: unknown) {
      logger.error('Erreur création snapshot:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la création';
      toast.error(errorMessage);
    } finally {
      setCreating(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('fr-BE', {
      style: 'currency',
      currency: 'EUR'
    }).format(value);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary flex items-center gap-2">
              <Package className="h-5 w-5 text-calypso-blue" />
              Nouvelle Clôture Matériel
            </h3>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 dark:text-dark-text-muted hover:text-gray-600 dark:text-dark-text-secondary dark:hover:text-dark-text-primary"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            {/* Info box */}
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400">
              <p className="text-sm">
                <strong>Bilan code 01.01</strong> - Cette clôture fige la valeur nette du matériel
                (après amortissements) pour la comptabilité annuelle.
              </p>
            </div>

            {/* Year selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                <span className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Année comptable
                </span>
              </label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
              >
                {yearOptions.map(year => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

            {/* Warning if snapshot exists */}
            {hasExisting && (
              <div className="p-3 rounded-lg flex items-start gap-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">
                <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium">
                    Une clôture matériel {selectedYear} existe déjà.
                  </p>
                  <p className="mt-1">
                    {existingSnapshot?.statut === 'verrouille'
                      ? 'Elle est verrouillée et ne peut pas être remplacée.'
                      : 'Vous ne pouvez pas créer une nouvelle clôture pour cette année.'}
                  </p>
                </div>
              </div>
            )}

            {/* Stock preview */}
            {!hasExisting && (
              <div className="p-4 rounded-lg bg-gray-50 dark:bg-dark-bg-tertiary">
                <p className="text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-3">
                  Aperçu valeur actuelle du matériel:
                </p>
                {loadingPreview ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-dark-text-muted">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-calypso-blue"></div>
                    Calcul en cours...
                  </div>
                ) : stockPreview ? (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-dark-text-secondary flex items-center gap-1">
                        <TrendingDown className="h-4 w-4 text-orange-500" />
                        Valeur nette (après amortissements)
                      </span>
                      <span className="text-lg font-bold text-calypso-blue">
                        {formatCurrency(stockPreview.currentValue)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                      Cette valeur sera figée dans la clôture
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-dark-text-muted">Aucune donnée disponible</p>
                )}
              </div>
            )}

            <p className="text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
              Une clôture capture la valeur de tous les équipements avec leurs amortissements calculés.
              Après verrouillage, cette valeur sera utilisée pour le Bilan.
            </p>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 p-4 border-t border-gray-200 dark:border-dark-border">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded-md"
            >
              Annuler
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || hasExisting}
              className="px-4 py-2 text-sm font-medium text-white bg-calypso-blue hover:bg-calypso-blue/90 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? 'Création...' : 'Créer la clôture'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
