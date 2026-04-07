import { logger } from '@/utils/logger';
/**
 * Value List Selector Component
 *
 * Reusable component for selecting values from dynamic value lists.
 * Supports both single-select and multi-select modes.
 */

import { useState, useEffect } from 'react';
import { getValueList, sortValueListItems } from '@/services/valueListService';
import type { ValueList, ValueListItem } from '@/types/valueList.types';
import { X } from 'lucide-react';

interface ValueListSelectorProps {
  clubId: string;
  listId: string;
  value: string | string[];
  onChange: (value: string | string[]) => void;
  mode: 'single' | 'multi';
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  showBadges?: boolean; // Show colored badges for selected items (multi-select only)
}

export function ValueListSelector({
  clubId,
  listId,
  value,
  onChange,
  mode,
  disabled = false,
  placeholder,
  className = '',
  showBadges = true
}: ValueListSelectorProps) {
  const [valueList, setValueList] = useState<ValueList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load value list from Firestore
  useEffect(() => {
    let mounted = true;

    async function loadValueList() {
      try {
        setLoading(true);
        setError(null);
        const list = await getValueList(clubId, listId);
        if (mounted) {
          if (!list) {
            setError(`Liste de valeurs "${listId}" introuvable`);
          } else {
            setValueList(list);
          }
        }
      } catch (err) {
        if (mounted) {
          logger.error('Error loading value list:', err);
          setError('Erreur lors du chargement de la liste');
        }
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
  }, [clubId, listId]);

  // Get sorted active items
  const sortedItems = valueList ? sortValueListItems(valueList.items) : [];

  // Helper to get item by value
  const getItem = (itemValue: string): ValueListItem | undefined => {
    return sortedItems.find(item => item.value === itemValue);
  };

  // Handle single-select change
  const handleSingleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(e.target.value);
  };

  // Handle multi-select toggle
  const handleMultiToggle = (itemValue: string) => {
    if (disabled) return;

    const currentValues = Array.isArray(value) ? value : [];
    const newValues = currentValues.includes(itemValue)
      ? currentValues.filter(v => v !== itemValue)
      : [...currentValues, itemValue];

    onChange(newValues);
  };

  // Handle removing a selected item (multi-select badges)
  const handleRemoveItem = (itemValue: string) => {
    if (disabled) return;
    const currentValues = Array.isArray(value) ? value : [];
    onChange(currentValues.filter(v => v !== itemValue));
  };

  // Loading state
  if (loading) {
    return (
      <div className="text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
        Chargement...
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="text-sm text-red-600 dark:text-red-400">
        {error}
      </div>
    );
  }

  // No items available
  if (sortedItems.length === 0) {
    return (
      <div className="text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
        Aucune valeur disponible
      </div>
    );
  }

  // Render single-select dropdown
  if (mode === 'single') {
    return (
      <select
        value={typeof value === 'string' ? value : ''}
        onChange={handleSingleChange}
        disabled={disabled}
        className={`
          w-full px-3 py-2 rounded-lg border
          bg-white dark:bg-dark-bg-secondary
          border-gray-300 dark:border-dark-border
          text-gray-900 dark:text-dark-text-primary
          focus:ring-2 focus:ring-blue-500 focus:border-blue-500
          disabled:opacity-50 disabled:cursor-not-allowed
          ${className}
        `}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {sortedItems.map(item => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    );
  }

  // Render multi-select with checkboxes and badges
  const selectedValues = Array.isArray(value) ? value : [];
  const selectedItems = selectedValues.map(v => getItem(v)).filter(Boolean) as ValueListItem[];

  return (
    <div className={className}>
      {/* Selected items as badges */}
      {showBadges && selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {selectedItems.map(item => (
            <span
              key={item.value}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium"
              style={{
                backgroundColor: item.color ? `${item.color}20` : '#e5e7eb',
                color: item.color || '#374151',
                border: `1px solid ${item.color || '#d1d5db'}`
              }}
            >
              <span>{item.shortCode || item.label}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemoveItem(item.value)}
                  className="hover:opacity-70 transition-opacity"
                  aria-label={`Retirer ${item.label}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Checkboxes - 2 column grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {sortedItems.map(item => {
          const isSelected = selectedValues.includes(item.value);
          return (
            <label
              key={item.value}
              className={`
                flex items-center gap-2 px-3 py-2 rounded-lg border
                transition-colors cursor-pointer
                ${isSelected
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                  : 'bg-white dark:bg-dark-bg-secondary border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => handleMultiToggle(item.value)}
                disabled={disabled}
                className="h-4 w-4 rounded border-gray-300 dark:border-dark-border text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed flex-shrink-0"
              />
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                {item.color && (
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                )}
                <span className="text-sm font-medium text-gray-900 dark:text-dark-text-primary truncate">
                  {item.label}
                </span>
                {item.shortCode && (
                  <span className="text-xs text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary flex-shrink-0">
                    ({item.shortCode})
                  </span>
                )}
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
