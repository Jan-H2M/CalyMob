import React, { useState, useCallback, useRef } from 'react';
import { Calculator, RotateCcw, Info } from 'lucide-react';
import { AmortizationService } from '@/services/amortizationService';
import {
  ItemType,
  InventoryItem,
  DepreciationMethod,
  ItemDepreciationOverride,
  DepreciationSettings
} from '@/types/inventory';
import { Timestamp } from 'firebase/firestore';
import { cn } from '@/utils/utils';

/**
 * Remove undefined values from an object before sending to Firebase
 */
function cleanOverrideForFirebase(override: ItemDepreciationOverride): ItemDepreciationOverride {
  const cleaned: ItemDepreciationOverride = {};
  if (override.method !== undefined) cleaned.method = override.method;
  if (override.lifespan !== undefined) cleaned.lifespan = override.lifespan;
  if (override.depreciationRate !== undefined) cleaned.depreciationRate = override.depreciationRate;
  if (override.residualValue !== undefined) cleaned.residualValue = override.residualValue;
  if (override.startDate !== undefined) cleaned.startDate = override.startDate;
  return cleaned;
}

const DEPRECIATION_METHODS = [
  { value: 'linear', label: 'Linéaire', description: 'Amortissement réparti également sur la durée de vie' },
  { value: 'degressive', label: 'Dégressif', description: 'Amortissement accéléré les premières années (règle belge: max 40%)' },
  { value: 'manual', label: 'Manuel / Libre', description: 'Montant saisi manuellement chaque année' }
];

interface DepreciationSettingsPanelProps {
  item: InventoryItem;
  itemType?: ItemType;
  onChange: (override: ItemDepreciationOverride | undefined) => void;
  disabled?: boolean;
  /** Hide header when used inside an accordion */
  hideHeader?: boolean;
}

export function DepreciationSettingsPanel({
  item,
  itemType,
  onChange,
  disabled = false,
  hideHeader = false
}: DepreciationSettingsPanelProps) {
  const [useOverride, setUseOverride] = useState(!!item.depreciation_override);
  const [override, setOverride] = useState<ItemDepreciationOverride>(
    item.depreciation_override || {}
  );

  // Debounce timer ref - prevents rapid-fire saves
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Track if we're currently saving to prevent duplicate saves
  const isSavingRef = useRef(false);

  // Get effective settings (merged type defaults with item overrides)
  const effectiveSettings = AmortizationService.getEffectiveSettings(item, itemType);
  const typeDefaults = itemType?.depreciation;

  // Debounced save function - only triggers onChange after user stops typing
  const debouncedSave = useCallback((newOverride: ItemDepreciationOverride | undefined) => {
    // Clear any pending save
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Prevent duplicate saves
    if (isSavingRef.current) return;

    debounceTimerRef.current = setTimeout(() => {
      isSavingRef.current = true;

      if (newOverride === undefined) {
        onChange(undefined);
      } else {
        // Clean the override object to remove undefined values
        const cleaned = cleanOverrideForFirebase(newOverride);
        // Only save if there are actual values to save
        if (Object.keys(cleaned).length > 0) {
          onChange(cleaned);
        }
      }

      // Reset saving flag after a short delay
      setTimeout(() => {
        isSavingRef.current = false;
      }, 500);
    }, 800); // 800ms debounce delay
  }, [onChange]);

  const handleReset = () => {
    setUseOverride(false);
    setOverride({});
    // Clear any pending debounced save
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    onChange(undefined);
  };

  const updateOverride = (field: keyof ItemDepreciationOverride, value: any) => {
    const newOverride = { ...override, [field]: value };
    setOverride(newOverride);
    if (!useOverride) {
      setUseOverride(true);
    }
    // Trigger debounced save
    debouncedSave(newOverride);
  };

  const formatDate = (timestamp: Timestamp | undefined): string => {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    return date.toISOString().split('T')[0];
  };

  const parseDate = (dateStr: string): Timestamp | undefined => {
    if (!dateStr) return undefined;
    return Timestamp.fromDate(new Date(dateStr));
  };

  return (
    <div className={hideHeader ? '' : 'bg-white border border-gray-200 dark:border-dark-border rounded-lg p-4'}>
      {!hideHeader && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-blue-600" />
            <h3 className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">Paramètres d'amortissement</h3>
          </div>
          {useOverride && (
            <button
              onClick={handleReset}
              disabled={disabled}
              className="text-sm text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:text-dark-text-primary flex items-center gap-1 disabled:opacity-50"
            >
              <RotateCcw className="h-3 w-3" />
              Réinitialiser aux valeurs par défaut
            </button>
          )}
        </div>
      )}
      {hideHeader && useOverride && (
        <div className="flex justify-end mb-4">
          <button
            onClick={handleReset}
            disabled={disabled}
            className="text-sm text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:text-dark-text-primary flex items-center gap-1 disabled:opacity-50"
          >
            <RotateCcw className="h-3 w-3" />
            Réinitialiser aux valeurs par défaut
          </button>
        </div>
      )}

      {/* Type Defaults Info */}
      {typeDefaults && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-600 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-800">Valeurs par défaut du type "{itemType?.nom}"</p>
              <p className="text-blue-700 mt-1">
                {AmortizationService.getMethodLabel(typeDefaults.method)} • {typeDefaults.lifespan} ans
                {typeDefaults.residualValue ? ` • Résiduel: ${typeDefaults.residualValue}€` : ''}
                {typeDefaults.depreciationRate ? ` • Taux: ${typeDefaults.depreciationRate}%` : ''}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Override Toggle */}
      <div className="mb-4">
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={useOverride}
            onChange={(e) => {
              const checked = e.target.checked;
              setUseOverride(checked);
              if (!checked) {
                setOverride({});
                // Clear any pending debounced save
                if (debounceTimerRef.current) {
                  clearTimeout(debounceTimerRef.current);
                }
                onChange(undefined);
              }
            }}
            disabled={disabled}
            className="mr-2"
          />
          <span className="text-sm text-gray-700 dark:text-dark-text-primary">
            Utiliser des paramètres personnalisés pour cet article
          </span>
        </label>
      </div>

      {/* Override Settings */}
      <div className={cn('space-y-4', !useOverride && 'opacity-50 pointer-events-none')}>
        {/* Method Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
            Méthode d'amortissement
          </label>
          <select
            value={override.method || effectiveSettings.method}
            onChange={(e) => updateOverride('method', e.target.value as DepreciationMethod)}
            disabled={disabled || !useOverride}
            className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md text-sm"
          >
            {DEPRECIATION_METHODS.map(method => (
              <option key={method.value} value={method.value}>
                {method.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-muted">
            {DEPRECIATION_METHODS.find(m => m.value === (override.method || effectiveSettings.method))?.description}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Lifespan */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
              Durée de vie (années)
            </label>
            <input
              type="number"
              min="1"
              max="50"
              value={override.lifespan ?? effectiveSettings.lifespan}
              onChange={(e) => updateOverride('lifespan', parseInt(e.target.value) || undefined)}
              disabled={disabled || !useOverride}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md text-sm"
            />
          </div>

          {/* Degressive Rate - Only for degressive method */}
          {(override.method || effectiveSettings.method) === 'degressive' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                Taux dégressif (%)
              </label>
              <input
                type="number"
                min="1"
                max="40"
                step="0.1"
                value={override.depreciationRate ?? effectiveSettings.depreciationRate ?? ''}
                onChange={(e) => updateOverride('depreciationRate', parseFloat(e.target.value) || undefined)}
                disabled={disabled || !useOverride}
                placeholder={`Recommandé: ${AmortizationService.getRecommendedDegressiveRate(override.lifespan || effectiveSettings.lifespan)}%`}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md text-sm"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-muted">
                Règle belge: 2x taux linéaire, max 40%
              </p>
            </div>
          )}

          {/* Residual Value */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
              Valeur résiduelle (€)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={override.residualValue ?? effectiveSettings.residualValue ?? ''}
              onChange={(e) => updateOverride('residualValue', parseFloat(e.target.value) || undefined)}
              disabled={disabled || !useOverride}
              placeholder="0"
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md text-sm"
            />
          </div>

          {/* Custom Start Date */}
          {(typeDefaults?.useCustomStartDate || useOverride) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                Date de début d'amortissement
              </label>
              <input
                type="date"
                value={formatDate(override.startDate)}
                onChange={(e) => updateOverride('startDate', parseDate(e.target.value))}
                disabled={disabled || !useOverride}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md text-sm"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-muted">
                Par défaut: date d'achat de l'article
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="mt-4 pt-4 border-t">
        <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
          <span className="font-medium">Paramètres effectifs: </span>
          {AmortizationService.getMethodLabel(effectiveSettings.method)} • {effectiveSettings.lifespan} ans
          {effectiveSettings.residualValue ? ` • Résiduel: ${effectiveSettings.residualValue}€` : ''}
          {effectiveSettings.depreciationRate ? ` • Taux: ${effectiveSettings.depreciationRate}%` : ''}
        </p>
      </div>
    </div>
  );
}
