import { logger } from '@/utils/logger';
/**
 * Tariff Config Editor
 * Embedded component for managing tariffs (add/remove/edit)
 * Used in LocationDetailView and (future) OperationFormModal
 */

import { useState, useEffect } from 'react';
import { Plus, Trash2, Star, MapPin } from 'lucide-react';
import { Tariff, TariffCategory, CATEGORY_LABELS } from '@/types/tariff.types';
import { cn } from '@/utils/utils';
import { getValueList, sortValueListItems } from '@/services/valueListService';
import type { ValueList, ValueListItem } from '@/types/valueList.types';
import { useAuth } from '@/contexts/AuthContext';

interface TariffConfigEditorProps {
  tariffs: Tariff[];
  onChange: (tariffs: Tariff[]) => void;
  disabled?: boolean;
}

export function TariffConfigEditor({ tariffs, onChange, disabled = false }: TariffConfigEditorProps) {
  const { clubId } = useAuth();
  const [valueList, setValueList] = useState<ValueList | null>(null);
  const [loading, setLoading] = useState(true);

  // Load value list from Firestore
  useEffect(() => {
    let mounted = true;

    async function loadValueList() {
      if (!clubId) return;

      try {
        setLoading(true);
        const list = await getValueList(clubId, 'fonction');
        if (mounted) {
          setValueList(list);
        }
      } catch (err) {
        logger.error('Error loading fonction value list:', err);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadValueList();

    return () => {
      mounted = false;
    };
  }, [clubId]);

  // Get sorted active items
  const sortedItems = valueList ? sortValueListItems(valueList.items) : [];

  // Helper to get label from value
  const getCategoryLabel = (categoryValue: string): string => {
    const item = sortedItems.find(i => i.value === categoryValue);
    return item?.label || CATEGORY_LABELS[categoryValue] || categoryValue;
  };

  const handleAddTariff = () => {
    // Use first available value list item or fallback to 'membre'
    const category = sortedItems.length > 0 ? sortedItems[0].value : 'membre';
    const newTariff: Tariff = {
      id: `tariff_${Date.now()}`,
      label: getCategoryLabel(category),
      category: category,
      price: 0,
      is_default: tariffs.length === 0, // First tariff is default
      display_order: tariffs.length
    };
    onChange([...tariffs, newTariff]);
  };

  const handleUpdateTariff = (index: number, field: keyof Tariff, value: string | number | boolean) => {
    const updated = [...tariffs];
    updated[index] = { ...updated[index], [field]: value };

    // Auto-update label when category changes
    if (field === 'category') {
      updated[index].label = getCategoryLabel(value as string);
    }

    onChange(updated);
  };

  const handleRemoveTariff = (index: number) => {
    onChange(tariffs.filter((_, i) => i !== index));
  };

  const handleSetDefault = (index: number) => {
    const updated = tariffs.map((t, i) => ({
      ...t,
      is_default: i === index
    }));
    onChange(updated);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700 dark:text-dark-text-primary">
          Tarifs
        </h3>
        <button
          onClick={handleAddTariff}
          disabled={disabled}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-md hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Ajouter un tarif"
        >
          <Plus className="h-3.5 w-3.5" />
          Ajouter
        </button>
      </div>

      {/* Tariff List */}
      <div className="space-y-1.5">
        {tariffs.map((tariff, index) => (
          <div
            key={tariff.id}
            className="flex items-center gap-2 px-2 py-1.5 border border-gray-300 dark:border-dark-border rounded bg-gray-50 dark:bg-dark-bg-tertiary"
          >
            {/* Drag handle (future feature) */}
            <div className="text-gray-400 dark:text-dark-text-muted cursor-move" title="Drag to reorder">
              ⋮
            </div>

            {/* Category - Dynamic from value list */}
            <select
              value={tariff.category}
              onChange={(e) => handleUpdateTariff(index, 'category', e.target.value)}
              disabled={disabled || loading}
              className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary rounded focus:ring-1 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <option>Chargement...</option>
              ) : sortedItems.length > 0 ? (
                sortedItems.map(item => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))
              ) : (
                // Fallback to hardcoded options if value list not available
                <>
                  <option value="membre">{CATEGORY_LABELS.membre}</option>
                  <option value="encadrant">{CATEGORY_LABELS.encadrant}</option>
                  <option value="ca">{CATEGORY_LABELS.ca}</option>
                  <option value="accueil">{CATEGORY_LABELS.accueil}</option>

                </>
              )}
            </select>

            {/* Price */}
            <input
              type="number"
              step="0.01"
              min="0"
              value={tariff.price === 0 ? '' : tariff.price}
              onChange={(e) => handleUpdateTariff(index, 'price', parseFloat(e.target.value) || 0)}
              disabled={disabled}
              placeholder="0"
              className="w-24 px-2 py-1 text-sm border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary rounded focus:ring-1 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className="text-xs text-gray-500 dark:text-dark-text-muted">€</span>

            {/* Actions */}
            <div className="flex items-center gap-1">
              {/* Set Default (star icon) */}
              <button
                onClick={() => handleSetDefault(index)}
                disabled={disabled}
                className={cn(
                  "p-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                  tariff.is_default
                    ? "text-yellow-500 hover:text-yellow-600"
                    : "text-gray-400 dark:text-dark-text-muted hover:text-yellow-500"
                )}
                title="Définir comme tarif par défaut"
              >
                <Star className={cn("h-3.5 w-3.5", tariff.is_default && "fill-current")} />
              </button>

              {/* Delete */}
              <button
                onClick={() => handleRemoveTariff(index)}
                disabled={disabled}
                className="p-1 text-gray-400 dark:text-dark-text-muted hover:text-red-600 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Supprimer ce tarif"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {tariffs.length === 0 && (
        <div className="text-center py-8 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg border border-gray-200 dark:border-dark-border">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-dark-bg-secondary mb-2">
            <MapPin className="h-6 w-6 text-gray-400 dark:text-dark-text-muted" />
          </div>
          <p className="text-sm text-gray-500 dark:text-dark-text-muted">
            Aucun tarif défini
          </p>
          <p className="text-xs text-gray-400 dark:text-dark-text-muted mt-1">
            Cliquez sur "Ajouter" pour créer un tarif
          </p>
        </div>
      )}
    </div>
  );
}
