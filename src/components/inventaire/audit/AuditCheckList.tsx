import { useState } from 'react';
import { Check, X, Search, Filter } from 'lucide-react';
import { InventoryAuditItem } from '@/types/inventory';
import { InventoryAuditService } from '@/services/inventoryAuditService';
import { useAuth } from '@/contexts/AuthContext';
import { ConditionBadge, ConditionType } from '../common/ConditionBadge';
import { cn } from '@/utils/utils';
import toast from 'react-hot-toast';
import { logger } from '@/utils/logger';

type FilterType = 'all' | 'todo' | 'done' | 'missing';

interface Props {
  auditId: string;
  items: InventoryAuditItem[];
  onItemUpdated: () => void;
  readOnly?: boolean;
}

export function AuditCheckList({ auditId, items, onItemUpdated, readOnly = false }: Props) {
  const { clubId, user } = useAuth();
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [updatingItems, setUpdatingItems] = useState<Set<string>>(new Set());

  // Filter items
  const filteredItems = items.filter(item => {
    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      if (!item.code.toLowerCase().includes(search) &&
          !item.typeName?.toLowerCase().includes(search)) {
        return false;
      }
    }

    // Status filter
    switch (filter) {
      case 'todo':
        return !item.date_controle;
      case 'done':
        return item.date_controle && item.retrouve;
      case 'missing':
        return item.date_controle && !item.retrouve;
      default:
        return true;
    }
  });

  // Stats for filter badges
  const stats = {
    all: items.length,
    todo: items.filter(i => !i.date_controle).length,
    done: items.filter(i => i.date_controle && i.retrouve).length,
    missing: items.filter(i => i.date_controle && !i.retrouve).length
  };

  const handleToggleFound = async (item: InventoryAuditItem, found: boolean) => {
    if (!clubId || !user) return;

    // Si on clique sur le même bouton qui est déjà actif, on reset à "à vérifier"
    const isCurrentlyFound = item.date_controle && item.retrouve;
    const isCurrentlyMissing = item.date_controle && !item.retrouve;

    // Si on clique sur "retrouvé" et c'est déjà retrouvé -> reset
    // Si on clique sur "manquant" et c'est déjà manquant -> reset
    const shouldReset = (found && isCurrentlyFound) || (!found && isCurrentlyMissing);

    setUpdatingItems(prev => new Set(prev).add(item.id));

    try {
      if (shouldReset) {
        // Reset: effacer le contrôle
        await InventoryAuditService.resetAuditItem(
          clubId,
          auditId,
          item.id
        );
        toast.success('Contrôle annulé');
      } else {
        await InventoryAuditService.updateAuditItem(
          clubId,
          auditId,
          item.id,
          {
            retrouve: found,
            etat_final: found ? (item.etat_final || item.etat_initial) : undefined
          },
          user.uid
        );
      }
      onItemUpdated();
    } catch (error: any) {
      logger.error('Erreur mise à jour item:', error);
      toast.error('Erreur lors de la mise à jour');
    } finally {
      setUpdatingItems(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const handleConditionChange = async (item: InventoryAuditItem, condition: ConditionType) => {
    if (!clubId || !user) return;

    setUpdatingItems(prev => new Set(prev).add(item.id));

    try {
      await InventoryAuditService.updateAuditItem(
        clubId,
        auditId,
        item.id,
        {
          retrouve: true,
          etat_final: condition
        },
        user.uid
      );
      onItemUpdated();
    } catch (error: any) {
      logger.error('Erreur mise à jour condition:', error);
      toast.error('Erreur lors de la mise à jour');
    } finally {
      setUpdatingItems(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const filterButtons: { key: FilterType; label: string; color: string }[] = [
    { key: 'all', label: 'Tous', color: 'bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary dark:bg-gray-700 dark:text-gray-300' },
    { key: 'todo', label: 'À faire', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
    { key: 'done', label: 'Retrouvés', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
    { key: 'missing', label: 'Manquants', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' }
  ];

  return (
    <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow">
      {/* Header with filters */}
      <div className="p-4 border-b border-gray-200 dark:border-dark-border">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
            <input
              type="text"
              placeholder="Rechercher par code ou type..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
            />
          </div>

          {/* Filter buttons */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
            {filterButtons.map(btn => (
              <button
                key={btn.key}
                onClick={() => setFilter(btn.key)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm font-medium transition-all',
                  filter === btn.key
                    ? btn.color + ' ring-2 ring-offset-2 ring-blue-500'
                    : 'bg-gray-50 dark:bg-dark-bg-tertiary text-gray-500 dark:text-dark-text-muted dark:bg-dark-bg-tertiary dark:text-dark-text-secondary hover:bg-gray-100 dark:bg-dark-bg-tertiary'
                )}
              >
                {btn.label} ({stats[btn.key]})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Items list */}
      <div className="divide-y divide-gray-200 dark:divide-dark-border max-h-[60vh] md:max-h-[600px] overflow-y-auto">
        {filteredItems.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
            Aucun article trouvé
          </div>
        ) : (
          filteredItems.map(item => {
            const isUpdating = updatingItems.has(item.id);
            const isChecked = item.date_controle != null;
            const isFound = item.retrouve;

            return (
              <div
                key={item.id}
                className={cn(
                  'p-4 flex items-center gap-4 transition-colors',
                  isUpdating && 'opacity-50',
                  !isChecked && 'bg-yellow-50/50 dark:bg-yellow-900/10',
                  isChecked && !isFound && 'bg-red-50/50 dark:bg-red-900/10'
                )}
              >
                {/* Checkbox buttons */}
                <div className="flex gap-1">
                  <button
                    onClick={() => handleToggleFound(item, true)}
                    disabled={isUpdating || readOnly}
                    className={cn(
                      'p-2 rounded-lg transition-colors',
                      readOnly && 'cursor-not-allowed opacity-60',
                      isFound
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-100 dark:bg-dark-bg-tertiary text-gray-400 dark:text-dark-text-muted hover:bg-green-100 hover:text-green-600 dark:bg-dark-bg-tertiary'
                    )}
                    title={readOnly ? 'Inventaire verrouillé' : 'Retrouvé'}
                  >
                    <Check className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => handleToggleFound(item, false)}
                    disabled={isUpdating || readOnly}
                    className={cn(
                      'p-2 rounded-lg transition-colors',
                      readOnly && 'cursor-not-allowed opacity-60',
                      isChecked && !isFound
                        ? 'bg-red-500 text-white'
                        : 'bg-gray-100 dark:bg-dark-bg-tertiary text-gray-400 dark:text-dark-text-muted hover:bg-red-100 hover:text-red-600 dark:bg-dark-bg-tertiary'
                    )}
                    title={readOnly ? 'Inventaire verrouillé' : 'Manquant'}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Item info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium text-gray-900 dark:text-dark-text-primary">
                      {item.code}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
                      {item.typeName}
                    </span>
                  </div>
                  {item.etat_initial && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-400 dark:text-dark-text-muted">État initial:</span>
                      <ConditionBadge condition={item.etat_initial as ConditionType} size="sm" />
                    </div>
                  )}
                </div>

                {/* Condition selector (only when found) */}
                {isFound && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 dark:text-dark-text-muted">Nouvel état:</span>
                    <select
                      value={item.etat_final || item.etat_initial || 'bon'}
                      onChange={(e) => handleConditionChange(item, e.target.value as ConditionType)}
                      disabled={isUpdating || readOnly}
                      className={cn(
                        'px-2 py-1 text-sm border border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary',
                        readOnly && 'cursor-not-allowed opacity-60'
                      )}
                    >
                      <option value="excellent">Excellent</option>
                      <option value="bon">Bon</option>
                      <option value="correct">Correct</option>
                      <option value="mauvais">Usé</option>
                      <option value="hors_service">Hors service</option>
                    </select>
                  </div>
                )}

                {/* Status indicator */}
                <div className="text-right">
                  {!isChecked ? (
                    <span className="text-xs text-yellow-600 dark:text-yellow-400">À vérifier</span>
                  ) : isFound ? (
                    <span className="text-xs text-green-600 dark:text-green-400">Retrouvé</span>
                  ) : (
                    <span className="text-xs text-red-600 dark:text-red-400">Manquant</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
