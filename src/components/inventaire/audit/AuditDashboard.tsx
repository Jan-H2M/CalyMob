import { CheckCircle, XCircle, Clock, Package, Lock } from 'lucide-react';
import { InventoryAudit } from '@/types/inventory';

interface Props {
  audit: InventoryAudit;
  progress: number;
  onComplete: () => void;
  onLock: () => void;
}

export function AuditDashboard({ audit, progress, onComplete, onLock }: Props) {
  const isComplete = progress === 100;
  const isFermee = audit.statut === 'fermee';
  const isVerrouille = audit.statut === 'verrouille';

  return (
    <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary">
            {audit.nom}
          </h2>
          <p className="text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
            Démarré le {audit.date_debut.toDate().toLocaleDateString('fr-FR')}
            {audit.date_fin && ` • Fermé le ${audit.date_fin.toDate().toLocaleDateString('fr-FR')}`}
            {audit.date_verrouillage && ` • Verrouillé le ${audit.date_verrouillage.toDate().toLocaleDateString('fr-FR')}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Bouton Fermer - visible si en_cours */}
          {audit.statut === 'en_cours' && (
            <button
              onClick={onComplete}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-gray-600 rounded-md hover:bg-gray-700"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Fermer l'inventaire
            </button>
          )}

          {/* Bouton Verrouiller - visible si fermé */}
          {isFermee && (
            <button
              onClick={onLock}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700"
            >
              <Lock className="h-4 w-4 mr-2" />
              Verrouiller
            </button>
          )}

          {/* Badge statut fermé */}
          {isFermee && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 dark:bg-dark-bg-tertiary text-gray-800 dark:bg-gray-700 dark:text-gray-300">
              <CheckCircle className="h-4 w-4 mr-1" />
              Fermé
            </span>
          )}

          {/* Badge statut verrouillé */}
          {isVerrouille && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
              <Lock className="h-4 w-4 mr-1" />
              Verrouillé
            </span>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-dark-text-primary">
            Progression
          </span>
          <span className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
            {audit.items_controles} / {audit.total_items} contrôlés ({progress}%)
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-dark-bg-tertiary rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all duration-300 ${
              isComplete ? 'bg-green-500' : 'bg-blue-500'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 h-10 w-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
              <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
                {audit.total_items}
              </p>
              <p className="text-xs text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
                Total articles
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 h-10 w-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
                {audit.items_controles - audit.items_manquants}
              </p>
              <p className="text-xs text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
                Retrouvés
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 h-10 w-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
              <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
                {audit.items_manquants}
              </p>
              <p className="text-xs text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
                Manquants
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 h-10 w-10 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center">
              <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
                {audit.total_items - audit.items_controles}
              </p>
              <p className="text-xs text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
                À vérifier
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
