import { useState, useEffect } from 'react';
import { X, AlertTriangle, Calendar } from 'lucide-react';
import { InventoryAuditService } from '@/services/inventoryAuditService';
import { InventoryAudit } from '@/types/inventory';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { logger } from '@/utils/logger';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (auditId: string) => void;
  existingAudits: InventoryAudit[];
}

export function NewAuditModal({ isOpen, onClose, onCreated, existingAudits }: Props) {
  const { clubId, user } = useAuth();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [creating, setCreating] = useState(false);

  // Generate year options (current year + 2 previous years)
  const yearOptions = [currentYear, currentYear - 1, currentYear - 2];

  // Check if selected year already has an audit
  const existingAudit = existingAudits.find(a => a.year === selectedYear);
  const hasExistingAudit = !!existingAudit;
  const isExistingInProgress = existingAudit?.statut === 'en_cours';

  useEffect(() => {
    if (isOpen) {
      setSelectedYear(currentYear);
    }
  }, [isOpen, currentYear]);

  const handleCreate = async () => {
    if (!clubId || !user) return;

    // Don't allow creating if there's already an in-progress audit for this year
    if (isExistingInProgress) {
      toast.error(`Un inventaire ${selectedYear} est déjà en cours`);
      return;
    }

    setCreating(true);
    try {
      const auditId = await InventoryAuditService.startAudit(clubId, selectedYear, user.uid);
      toast.success(`Inventaire ${selectedYear} créé`);
      onCreated(auditId);
      onClose();
    } catch (error: any) {
      logger.error('Erreur création audit:', error);
      toast.error(error.message || 'Erreur lors de la création');
    } finally {
      setCreating(false);
    }
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
            <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
              Nouvel Inventaire
            </h3>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 dark:text-dark-text-muted hover:text-gray-600 dark:text-dark-text-secondary dark:hover:text-dark-text-primary"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                <span className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Année
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

            {/* Warning if audit exists */}
            {hasExistingAudit && (
              <div className={`p-3 rounded-lg flex items-start gap-2 ${
                isExistingInProgress
                  ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                  : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400'
              }`}>
                <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  {isExistingInProgress ? (
                    <>
                      <p className="font-medium">Un inventaire {selectedYear} est déjà en cours.</p>
                      <p className="mt-1">Vous ne pouvez pas créer un nouvel inventaire pour cette année.</p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium">Un inventaire {selectedYear} existe déjà (verrouillé).</p>
                      <p className="mt-1">
                        Un nouvel inventaire remplacera les données existantes.
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            <p className="mt-4 text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
              Un inventaire sera créé avec la liste de tout le matériel actuel.
              Vous pourrez ensuite vérifier chaque article.
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
              disabled={creating || isExistingInProgress}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? 'Création...' : 'Créer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
