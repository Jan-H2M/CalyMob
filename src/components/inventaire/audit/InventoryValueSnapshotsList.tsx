import { logger } from '@/utils/logger';
/**
 * InventoryValueSnapshotsList - Lijst van Inventory Value Snapshots
 *
 * Toont alle clôtures (snapshots) voor Equipment/Matériel waarde.
 * Vergelijkbaar met BoutiqueSnapshotsList maar voor equipment inventory.
 *
 * Bilan code: 01.01 "Stock matériel (pour mémoire)"
 */

import { useState, useEffect } from 'react';
import { Plus, Package, ChevronRight, Lock, Clock, Euro, TrendingDown } from 'lucide-react';
import { InventoryValueSnapshotService } from '@/services/inventoryValueSnapshotService';
import { InventoryValueSnapshot } from '@/types/inventory';
import { useAuth } from '@/contexts/AuthContext';
import { NewInventoryValueSnapshotModal } from './NewInventoryValueSnapshotModal';
import { InventoryValueSnapshotDetail } from './InventoryValueSnapshotDetail';
import toast from 'react-hot-toast';

export function InventoryValueSnapshotsList() {
  const { clubId } = useAuth();
  const [snapshots, setSnapshots] = useState<InventoryValueSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);

  useEffect(() => {
    if (clubId) {
      loadSnapshots();
    }
  }, [clubId]);

  const loadSnapshots = async () => {
    if (!clubId) return;

    try {
      setLoading(true);
      const allSnapshots = await InventoryValueSnapshotService.getSnapshots(clubId);
      setSnapshots(allSnapshots);
    } catch (error) {
      logger.error('Erreur chargement snapshots:', error);
      toast.error('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  const handleSnapshotCreated = (snapshotId: string) => {
    loadSnapshots();
    setSelectedSnapshotId(snapshotId);
  };

  const handleBack = () => {
    setSelectedSnapshotId(null);
    loadSnapshots();
  };

  // Show detail page if a snapshot is selected
  if (selectedSnapshotId) {
    return (
      <InventoryValueSnapshotDetail
        snapshotId={selectedSnapshotId}
        onBack={handleBack}
      />
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-calypso-blue"></div>
      </div>
    );
  }

  const getStatusBadge = (snapshot: InventoryValueSnapshot) => {
    if (snapshot.statut === 'verrouille') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
          <Lock className="h-3 w-3 mr-1" />
          Verrouillé
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
        <Clock className="h-3 w-3 mr-1" />
        En cours
      </span>
    );
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('fr-BE', {
      style: 'currency',
      currency: 'EUR'
    }).format(value);
  };

  const formatPercent = (snapshot: InventoryValueSnapshot) => {
    if (snapshot.total_purchase_value === 0) return '0%';
    const percent = (snapshot.total_accumulated_depreciation / snapshot.total_purchase_value) * 100;
    return `${percent.toFixed(1)}%`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
            Clôtures Valeur Matériel
          </h2>
          <p className="text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
            Snapshots annuels pour la comptabilité (Bilan 01.01)
          </p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-calypso-blue rounded-md hover:bg-calypso-blue/90"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nouvelle clôture
        </button>
      </div>

      {/* Snapshots List */}
      {snapshots.length === 0 ? (
        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow p-12 text-center">
          <Package className="mx-auto h-12 w-12 text-gray-300 dark:text-dark-text-muted mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-2">
            Aucune clôture
          </h3>
          <p className="text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary max-w-sm mx-auto">
            Créez une clôture pour figer la valeur du matériel à la fin de l'année comptable.
            Ceci est nécessaire pour le Bilan (code 01.01).
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow overflow-hidden">
          <ul className="divide-y divide-gray-200 dark:divide-dark-border">
            {snapshots.map((snapshot) => (
              <li key={snapshot.id}>
                <button
                  onClick={() => setSelectedSnapshotId(snapshot.id)}
                  className="w-full px-6 py-4 flex items-center hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors text-left"
                >
                  {/* Icon */}
                  <div className="flex-shrink-0 h-10 w-10 bg-calypso-blue/10 dark:bg-calypso-blue/20 rounded-full flex items-center justify-center mr-4">
                    <Package className="h-5 w-5 text-calypso-blue" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <p className="font-medium text-gray-900 dark:text-dark-text-primary">
                        {snapshot.nom}
                      </p>
                      {getStatusBadge(snapshot)}
                    </div>
                    <div className="mt-1 flex items-center gap-4 text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
                      <span>
                        {snapshot.snapshot_date.toDate().toLocaleDateString('fr-FR')}
                      </span>
                      <span>•</span>
                      <span>
                        {snapshot.total_items} articles
                      </span>
                      <span>•</span>
                      <span className="inline-flex items-center">
                        <TrendingDown className="h-3 w-3 mr-1 text-orange-500" />
                        {formatPercent(snapshot)} amorti
                      </span>
                    </div>
                  </div>

                  {/* Values + Arrow */}
                  <div className="flex items-center gap-6 ml-4">
                    {/* Purchase Value (smaller) */}
                    <div className="text-right">
                      <div className="text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
                        {formatCurrency(snapshot.total_purchase_value)}
                      </div>
                      <p className="text-xs text-gray-400 dark:text-dark-text-muted">
                        Achat
                      </p>
                    </div>

                    {/* Current Value (prominent) */}
                    <div className="text-right">
                      <div className="flex items-center text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                        <Euro className="h-4 w-4 mr-1 text-gray-400 dark:text-dark-text-muted" />
                        {formatCurrency(snapshot.total_current_value)}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
                        Valeur nette
                      </p>
                    </div>

                    <ChevronRight className="h-5 w-5 text-gray-400 dark:text-dark-text-muted" />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* New Snapshot Modal */}
      <NewInventoryValueSnapshotModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreated={handleSnapshotCreated}
        existingSnapshots={snapshots}
      />
    </div>
  );
}
