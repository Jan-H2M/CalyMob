import { useState, useEffect } from 'react';
import { ArrowLeft, Lock, Unlock, X } from 'lucide-react';
import { InventoryAuditService } from '@/services/inventoryAuditService';
import { InventoryAudit, InventoryAuditItem } from '@/types/inventory';
import { useAuth } from '@/contexts/AuthContext';
import { AuditCheckList } from './AuditCheckList';
import toast from 'react-hot-toast';
import { logger } from '@/utils/logger';

interface Props {
  auditId: string;
  onBack: () => void;
}

export function AuditDetailPage({ auditId, onBack }: Props) {
  const { clubId } = useAuth();
  const [audit, setAudit] = useState<InventoryAudit | null>(null);
  const [items, setItems] = useState<InventoryAuditItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (clubId && auditId) {
      loadAudit();
    }
  }, [clubId, auditId]);

  const loadAudit = async () => {
    if (!clubId) return;

    try {
      setLoading(true);
      const [auditData, itemsData] = await Promise.all([
        InventoryAuditService.getAuditById(clubId, auditId),
        InventoryAuditService.getAuditItems(clubId, auditId, 'all')
      ]);
      logger.debug('🔍 [AUDIT] Loaded from Firestore:', { statut: auditData?.statut, nom: auditData?.nom });
      setAudit(auditData);
      setItems(itemsData);
    } catch (error) {
      logger.error('Erreur chargement audit:', error);
      toast.error('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  // === HANDLERS ===

  // Verrouiller: en_cours → verrouille (1x confirm)
  const handleLockAudit = async () => {
    if (!clubId || !audit) return;

    const confirmed = window.confirm(
      'Verrouiller rend l\'inventaire non modifiable.\n\nContinuer ?'
    );
    if (!confirmed) return;

    try {
      await InventoryAuditService.lockAudit(clubId, audit.id);
      toast.success('Inventaire verrouillé');
      await loadAudit();
    } catch (error: any) {
      logger.error('Erreur verrouillage audit:', error);
      toast.error(error.message || 'Erreur lors du verrouillage');
    }
  };

  // Déverrouiller: verrouille → en_cours (2x confirm)
  const handleUnlockAudit = async () => {
    if (!clubId || !audit) return;

    // Première confirmation
    const firstConfirm = window.confirm(
      `DÉVERROUILLAGE DE L'INVENTAIRE ${audit.year}\n\n` +
      `Cet inventaire est verrouillé et pourrait déjà être repris en comptabilité.\n\n` +
      `Êtes-vous sûr de vouloir le déverrouiller ?`
    );
    if (!firstConfirm) return;

    // Deuxième confirmation
    const secondConfirm = window.confirm(
      `CONFIRMATION FINALE\n\n` +
      `Normalement, on ne modifie JAMAIS un inventaire verrouillé.\n\n` +
      `Êtes-vous absolument certain de vouloir continuer ?`
    );
    if (!secondConfirm) return;

    try {
      await InventoryAuditService.reopenAudit(clubId, audit.id);
      toast.success('Inventaire déverrouillé');
      await loadAudit();
    } catch (error: any) {
      logger.error('Erreur déverrouillage audit:', error);
      toast.error(error.message || 'Erreur lors du déverrouillage');
    }
  };

  const handleItemUpdated = async () => {
    if (!clubId || !audit) return;
    // Reload audit stats and items
    const [auditData, itemsData] = await Promise.all([
      InventoryAuditService.getAuditById(clubId, audit.id),
      InventoryAuditService.getAuditItems(clubId, audit.id, 'all')
    ]);
    if (auditData) {
      setAudit(auditData);
      setItems(itemsData);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!audit) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">Inventaire non trouvé</p>
        <button
          onClick={onBack}
          className="mt-4 text-blue-600 hover:text-blue-700"
        >
          Retour à la liste
        </button>
      </div>
    );
  }

  const progress = InventoryAuditService.calculateProgress(audit);

  // === PERMISSIONS ===
  // Note: 'fermee' is legacy status, treated same as 'en_cours' (not locked)
  const isReadOnly = audit.statut === 'verrouille';
  const canLock = audit.statut === 'en_cours' || audit.statut === 'fermee';
  const canUnlock = audit.statut === 'verrouille';

  // Debug logging - kan verwijderd worden na verificatie
  logger.debug('🔍 [AUDIT] Permissions:', {
    statut: audit.statut,
    canLock,
    canUnlock,
    isReadOnly
  });

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
              onClick={handleLockAudit}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700"
            >
              <Lock className="h-4 w-4 mr-2" />
              Verrouiller
            </button>
          )}

          {/* verrouille: Déverrouiller knop */}
          {canUnlock && (
            <button
              onClick={handleUnlockAudit}
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
          <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary">
            {audit.nom}
          </h2>
          <p className="text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
            Démarré le {audit.date_debut.toDate().toLocaleDateString('fr-FR')}
            {audit.date_fin && ` • Fermé le ${audit.date_fin.toDate().toLocaleDateString('fr-FR')}`}
            {audit.date_verrouillage && ` • Verrouillé le ${audit.date_verrouillage.toDate().toLocaleDateString('fr-FR')}`}
          </p>
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
                progress === 100 ? 'bg-green-500' : 'bg-blue-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
              {audit.total_items}
            </p>
            <p className="text-xs text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">Total</p>
          </div>
          <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {audit.items_controles - audit.items_manquants}
            </p>
            <p className="text-xs text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">Retrouvés</p>
          </div>
          <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">
              {audit.items_manquants}
            </p>
            <p className="text-xs text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">Manquants</p>
          </div>
          <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
              {audit.total_items - audit.items_controles}
            </p>
            <p className="text-xs text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">À vérifier</p>
          </div>
        </div>
      </div>

      {/* Checklist */}
      <AuditCheckList
        auditId={audit.id}
        items={items}
        onItemUpdated={handleItemUpdated}
        readOnly={isReadOnly}
      />
    </div>
  );
}
