import { useState, useEffect } from 'react';
import { Plus, ClipboardCheck, ChevronRight, Lock, Clock } from 'lucide-react';
import { InventoryAuditService } from '@/services/inventoryAuditService';
import { InventoryAudit } from '@/types/inventory';
import { useAuth } from '@/contexts/AuthContext';
import { NewAuditModal } from './NewAuditModal';
import { AuditDetailPage } from './AuditDetailPage';
import toast from 'react-hot-toast';
import { logger } from '@/utils/logger';

export function InventoryAuditPage() {
  const { clubId } = useAuth();
  const [audits, setAudits] = useState<InventoryAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);

  useEffect(() => {
    if (clubId) {
      loadAudits();
    }
  }, [clubId]);

  const loadAudits = async () => {
    if (!clubId) return;

    try {
      setLoading(true);
      const allAudits = await InventoryAuditService.getAudits(clubId);
      setAudits(allAudits);
    } catch (error) {
      logger.error('Erreur chargement audits:', error);
      toast.error('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  const handleAuditCreated = (auditId: string) => {
    loadAudits();
    setSelectedAuditId(auditId);
  };

  const handleBack = () => {
    setSelectedAuditId(null);
    loadAudits(); // Refresh list when coming back
  };

  // Show detail page if an audit is selected
  if (selectedAuditId) {
    return (
      <AuditDetailPage
        auditId={selectedAuditId}
        onBack={handleBack}
      />
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const getStatusBadge = (audit: InventoryAudit) => {
    switch (audit.statut) {
      case 'en_cours':
      case 'fermee':  // Legacy status, treated as en_cours
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
            <Clock className="h-3 w-3 mr-1" />
            En cours
          </span>
        );
      case 'verrouille':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
            <Lock className="h-3 w-3 mr-1" />
            Verrouillé
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
            Inventaires
          </h2>
          <p className="text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
            Contrôle annuel du matériel
          </p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nouveau
        </button>
      </div>

      {/* Audits List */}
      {audits.length === 0 ? (
        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow p-12 text-center">
          <ClipboardCheck className="mx-auto h-12 w-12 text-gray-300 dark:text-dark-text-muted mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-2">
            Aucun inventaire
          </h3>
          <p className="text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary max-w-sm mx-auto">
            Créez votre premier inventaire pour commencer à vérifier le matériel du club.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow overflow-hidden">
          <ul className="divide-y divide-gray-200 dark:divide-dark-border">
            {audits.map((audit) => {
              const found = audit.items_controles - audit.items_manquants;
              const progress = audit.total_items > 0
                ? Math.round((audit.items_controles / audit.total_items) * 100)
                : 0;

              return (
                <li key={audit.id}>
                  <button
                    onClick={() => setSelectedAuditId(audit.id)}
                    className="w-full px-6 py-4 flex items-center hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors text-left"
                  >
                    {/* Icon */}
                    <div className="flex-shrink-0 h-10 w-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mr-4">
                      <ClipboardCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <p className="font-medium text-gray-900 dark:text-dark-text-primary">
                          {audit.nom}
                        </p>
                        {getStatusBadge(audit)}
                      </div>
                      <div className="mt-1 flex items-center gap-4 text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
                        <span>
                          {audit.date_debut.toDate().toLocaleDateString('fr-FR')}
                        </span>
                        <span>•</span>
                        <span className="text-green-600 dark:text-green-400">
                          {found} retrouvés
                        </span>
                        {audit.items_manquants > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-red-600 dark:text-red-400">
                              {audit.items_manquants} manquants
                            </span>
                          </>
                        )}
                        {audit.statut === 'en_cours' && audit.total_items - audit.items_controles > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-yellow-600 dark:text-yellow-400">
                              {audit.total_items - audit.items_controles} à vérifier
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Progress + Arrow */}
                    <div className="flex items-center gap-4 ml-4">
                      {/* Mini progress */}
                      <div className="hidden sm:block w-24">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
                            {progress}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-dark-bg-tertiary rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${
                              progress === 100 ? 'bg-green-500' : 'bg-blue-500'
                            }`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>

                      <ChevronRight className="h-5 w-5 text-gray-400 dark:text-dark-text-muted" />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* New Audit Modal */}
      <NewAuditModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreated={handleAuditCreated}
        existingAudits={audits}
      />
    </div>
  );
}
