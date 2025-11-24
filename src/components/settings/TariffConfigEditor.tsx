/**
 * Tariff Config Editor
 * Embedded component for managing tariffs (add/remove/edit)
 * Used in LocationDetailView and (future) OperationFormModal
 */

import { useState } from 'react';
import { Plus, Trash2, Star, MapPin } from 'lucide-react';
import { Tariff, TariffCategory, CATEGORY_LABELS } from '@/types/tariff.types';
import { cn } from '@/utils/utils';

interface TariffConfigEditorProps {
  tariffs: Tariff[];
  onChange: (tariffs: Tariff[]) => void;
  disabled?: boolean;
}

export function TariffConfigEditor({ tariffs, onChange, disabled = false }: TariffConfigEditorProps) {
  const handleAddTariff = () => {
    const category: TariffCategory = 'membre';
    const newTariff: Tariff = {
      id: `tariff_${Date.now()}`,
      label: CATEGORY_LABELS[category], // Auto-generate label from category
      category: category,
      price: 0,
      is_default: tariffs.length === 0, // First tariff is default
      display_order: tariffs.length
    };
    onChange([...tariffs, newTariff]);
  };

  const handleUpdateTariff = (index: number, field: keyof Tariff, value: any) => {
    const updated = [...tariffs];
    updated[index] = { ...updated[index], [field]: value };

    // Auto-update label when category changes
    if (field === 'category') {
      updated[index].label = CATEGORY_LABELS[value as TariffCategory];
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

            {/* Category */}
            <select
              value={tariff.category}
              onChange={(e) => handleUpdateTariff(index, 'category', e.target.value as TariffCategory)}
              disabled={disabled}
              className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary rounded focus:ring-1 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="membre">{CATEGORY_LABELS.membre}</option>
              <option value="encadrant">{CATEGORY_LABELS.encadrant}</option>
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
                    : "text-gray-400 hover:text-yellow-500"
                )}
                title="Définir comme tarif par défaut"
              >
                <Star className={cn("h-3.5 w-3.5", tariff.is_default && "fill-current")} />
              </button>

              {/* Delete */}
              <button
                onClick={() => handleRemoveTariff(index)}
                disabled={disabled}
                className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-dark-bg-secondary mb-2">
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
