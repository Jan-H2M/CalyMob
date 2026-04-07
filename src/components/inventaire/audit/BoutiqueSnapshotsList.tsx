import { logger } from '@/utils/logger';
/**
 * BoutiqueSnapshotsList - Lijst van Boutique Stock Snapshots
 *
 * Toont alle clôtures (snapshots) voor Boutique Club en LIFRAS.
 * Vergelijkbaar met InventoryAuditPage maar voor Boutique stock.
 */

import { useState, useEffect } from 'react';
import { Plus, ShoppingBag, ChevronRight, Lock, Clock, Euro } from 'lucide-react';
import { BoutiqueStockService } from '@/services/boutiqueStockService';
import { BoutiqueSnapshot } from '@/types/boutique';
import { useAuth } from '@/contexts/AuthContext';
import { NewBoutiqueSnapshotModal } from './NewBoutiqueSnapshotModal';
import { BoutiqueSnapshotDetail } from './BoutiqueSnapshotDetail';
import toast from 'react-hot-toast';

export function BoutiqueSnapshotsList() {
  const { clubId } = useAuth();
  const [snapshots, setSnapshots] = useState<BoutiqueSnapshot[]>([]);
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
      const allSnapshots = await BoutiqueStockService.getSnapshots(clubId);
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
      <BoutiqueSnapshotDetail
        snapshotId={selectedSnapshotId}
        onBack={handleBack}
      />
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  const getStatusBadge = (snapshot: BoutiqueSnapshot) => {
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

  const getTypeBadge = (snapshot: BoutiqueSnapshot) => {
    if (snapshot.type === 'boutique') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
          Club
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
        LIFRAS
      </span>
    );
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('fr-BE', {
      style: 'currency',
      currency: 'EUR'
    }).format(value);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
            Clôtures Stock Boutique
          </h2>
          <p className="text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
            Snapshots annuels pour la comptabilité
          </p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nouvelle clôture
        </button>
      </div>

      {/* Snapshots List */}
      {snapshots.length === 0 ? (
        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow p-12 text-center">
          <ShoppingBag className="mx-auto h-12 w-12 text-gray-300 dark:text-dark-text-muted mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-2">
            Aucune clôture
          </h3>
          <p className="text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary max-w-sm mx-auto">
            Créez une clôture pour figer la valeur du stock boutique à la fin de l'année comptable.
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
                  <div className="flex-shrink-0 h-10 w-10 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center mr-4">
                    <ShoppingBag className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <p className="font-medium text-gray-900 dark:text-dark-text-primary">
                        {snapshot.nom}
                      </p>
                      {getTypeBadge(snapshot)}
                      {getStatusBadge(snapshot)}
                    </div>
                    <div className="mt-1 flex items-center gap-4 text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
                      <span>
                        {snapshot.snapshot_date.toLocaleDateString('fr-FR')}
                      </span>
                      <span>•</span>
                      <span>
                        {snapshot.total_items} articles
                      </span>
                      <span>•</span>
                      <span>
                        {snapshot.total_quantite} unités
                      </span>
                    </div>
                  </div>

                  {/* Value + Arrow */}
                  <div className="flex items-center gap-4 ml-4">
                    {/* Value */}
                    <div className="text-right">
                      <div className="flex items-center text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                        <Euro className="h-4 w-4 mr-1 text-gray-400 dark:text-dark-text-muted" />
                        {formatCurrency(snapshot.total_value)}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
                        Valeur stock
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
      <NewBoutiqueSnapshotModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreated={handleSnapshotCreated}
        existingSnapshots={snapshots}
      />
    </div>
  );
}
