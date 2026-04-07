import { logger } from '@/utils/logger';
/**
 * NewBoutiqueSnapshotModal - Modal voor het aanmaken van een nieuwe Boutique Snapshot
 *
 * Gebruiker selecteert:
 * - Jaar
 * - Type (Boutique Club of LIFRAS)
 */

import { useState, useEffect } from 'react';
import { X, AlertTriangle, Calendar, ShoppingBag } from 'lucide-react';
import { BoutiqueStockService } from '@/services/boutiqueStockService';
import { BoutiqueSnapshot, BoutiqueType } from '@/types/boutique';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (snapshotId: string) => void;
  existingSnapshots: BoutiqueSnapshot[];
}

export function NewBoutiqueSnapshotModal({ isOpen, onClose, onCreated, existingSnapshots }: Props) {
  const { clubId, user } = useAuth();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedType, setSelectedType] = useState<BoutiqueType>('boutique');
  const [creating, setCreating] = useState(false);
  const [stockPreview, setStockPreview] = useState<{ items: number; value: number } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Generate year options (current year + 2 previous years)
  const yearOptions = [currentYear, currentYear - 1, currentYear - 2];

  // Check if selected year/type already has a snapshot
  const existingSnapshot = existingSnapshots.find(
    s => s.year === selectedYear && s.type === selectedType
  );
  const hasExisting = !!existingSnapshot;

  // Load stock preview when type changes
  useEffect(() => {
    if (isOpen && clubId) {
      loadStockPreview();
    }
  }, [isOpen, clubId, selectedType]);

  useEffect(() => {
    if (isOpen) {
      setSelectedYear(currentYear);
      setSelectedType('boutique');
    }
  }, [isOpen, currentYear]);

  const loadStockPreview = async () => {
    if (!clubId) return;

    setLoadingPreview(true);
    try {
      const summary = await BoutiqueStockService.getStockSummary(clubId, selectedType);
      setStockPreview({
        items: summary.totalItems,
        value: summary.totalValue
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
      toast.error(`Une clôture ${selectedType === 'boutique' ? 'Boutique Club' : 'Boutique LIFRAS'} ${selectedYear} existe déjà`);
      return;
    }

    setCreating(true);
    try {
      const snapshotId = await BoutiqueStockService.createSnapshot(
        clubId,
        selectedYear,
        selectedType,
        user.uid
      );
      toast.success(`Clôture ${selectedYear} créée`);
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
              <ShoppingBag className="h-5 w-5 text-purple-600" />
              Nouvelle Clôture Stock
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
            {/* Type selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                <span className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4" />
                  Type de stock
                </span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedType('boutique')}
                  className={`p-3 rounded-lg border-2 text-left transition-colors ${
                    selectedType === 'boutique'
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                      : 'border-gray-200 dark:border-dark-border hover:border-purple-300'
                  }`}
                >
                  <p className="font-medium text-gray-900 dark:text-dark-text-primary">
                    Boutique Club
                  </p>
                  <p className="text-xs text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary mt-1">
                    Code Bilan 02.01.01
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedType('boutique_lifras')}
                  className={`p-3 rounded-lg border-2 text-left transition-colors ${
                    selectedType === 'boutique_lifras'
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                      : 'border-gray-200 dark:border-dark-border hover:border-green-300'
                  }`}
                >
                  <p className="font-medium text-gray-900 dark:text-dark-text-primary">
                    Boutique LIFRAS
                  </p>
                  <p className="text-xs text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary mt-1">
                    Code Bilan 02.01.02
                  </p>
                </button>
              </div>
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
                    Une clôture {selectedType === 'boutique' ? 'Boutique Club' : 'Boutique LIFRAS'} {selectedYear} existe déjà.
                  </p>
                  <p className="mt-1">
                    {existingSnapshot?.statut === 'verrouille'
                      ? 'Elle est verrouillée et ne peut pas être remplacée.'
                      : 'Vous ne pouvez pas créer une nouvelle clôture pour cette combinaison.'}
                  </p>
                </div>
              </div>
            )}

            {/* Stock preview */}
            {!hasExisting && (
              <div className="p-4 rounded-lg bg-gray-50 dark:bg-dark-bg-tertiary">
                <p className="text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  Aperçu du stock actuel:
                </p>
                {loadingPreview ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-dark-text-muted">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>
                    Chargement...
                  </div>
                ) : stockPreview ? (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-dark-text-secondary">
                      {stockPreview.items} articles
                    </span>
                    <span className="text-lg font-bold text-purple-600 dark:text-purple-400">
                      {formatCurrency(stockPreview.value)}
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-dark-text-muted">Aucune donnée disponible</p>
                )}
              </div>
            )}

            <p className="text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
              Une clôture fige la valeur du stock à ce moment. Cette valeur sera utilisée pour le Bilan comptable.
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
              className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? 'Création...' : 'Créer la clôture'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
