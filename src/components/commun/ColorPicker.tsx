/**
 * ColorPicker Component
 *
 * Kleur selector met Tailwind preset kleuren en custom hex input.
 * Live preview van geselecteerde kleur.
 */

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Palette } from 'lucide-react';

// Tailwind preset colors
export const PRESET_COLORS = [
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Lime', value: '#84cc16' },
  { name: 'Green', value: '#10b981' },
  { name: 'Emerald', value: '#059669' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Sky', value: '#0ea5e9' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Fuchsia', value: '#d946ef' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Gray', value: '#6b7280' },
  { name: 'Slate', value: '#64748b' },
  { name: 'Zinc', value: '#71717a' }
];

interface ColorPickerProps {
  value: string | undefined;
  onChange: (color: string) => void;
  disabled?: boolean;
}

export default function ColorPicker({ value, onChange, disabled }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customHex, setCustomHex] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Initialize custom hex when opening
  useEffect(() => {
    if (isOpen && value) {
      setCustomHex(value.replace('#', ''));
    }
  }, [isOpen, value]);

  // Validate and apply custom hex
  const handleCustomHexChange = (hex: string) => {
    setCustomHex(hex);

    // Validate hex format
    if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
      onChange('#' + hex);
    }
  };

  // Get color name from hex value
  const getColorName = (hexValue: string | undefined): string => {
    if (!hexValue) return 'Aucune couleur';

    const preset = PRESET_COLORS.find(c => c.value.toLowerCase() === hexValue.toLowerCase());
    return preset ? preset.name : hexValue;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg border
          ${disabled
            ? 'bg-gray-100 dark:bg-dark-bg-secondary border-gray-300 dark:border-dark-border cursor-not-allowed opacity-50'
            : 'bg-white dark:bg-dark-bg-primary border-gray-300 dark:border-dark-border hover:border-blue-500 cursor-pointer'
          }
          text-sm text-gray-700 dark:text-dark-text-primary
          transition-colors
        `}
      >
        {value ? (
          <>
            <div
              className="w-5 h-5 rounded border border-gray-300 dark:border-dark-border"
              style={{ backgroundColor: value }}
            />
            <span>{getColorName(value)}</span>
          </>
        ) : (
          <>
            <Palette className="w-4 h-4 text-gray-400 dark:text-dark-text-tertiary" />
            <span className="text-gray-400 dark:text-dark-text-tertiary">Choisir une couleur</span>
          </>
        )}
        <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-2 w-80 bg-white dark:bg-dark-bg-primary border border-gray-200 dark:border-dark-border rounded-lg shadow-lg">
          {/* Preset Colors */}
          <div className="p-4">
            <div className="text-xs font-medium text-gray-500 dark:text-dark-text-secondary mb-3">
              Couleurs prédéfinies
            </div>

            {/* Color Grid */}
            <div className="grid grid-cols-7 gap-2 mb-4">
              {PRESET_COLORS.map(color => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => {
                    onChange(color.value);
                    setIsOpen(false);
                  }}
                  className={`
                    w-full aspect-square rounded-lg border-2 transition-all
                    hover:scale-110
                    ${value?.toLowerCase() === color.value.toLowerCase()
                      ? 'border-gray-900 dark:border-white ring-2 ring-blue-500'
                      : 'border-gray-300 dark:border-dark-border'
                    }
                  `}
                  style={{ backgroundColor: color.value }}
                  title={color.name}
                />
              ))}
            </div>

            {/* Custom Hex Input */}
            <div className="border-t border-gray-200 dark:border-dark-border pt-4">
              <div className="text-xs font-medium text-gray-500 dark:text-dark-text-secondary mb-2">
                Ou entrez un code hex:
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-dark-text-tertiary">
                    #
                  </span>
                  <input
                    type="text"
                    value={customHex}
                    onChange={(e) => handleCustomHexChange(e.target.value)}
                    placeholder="3b82f6"
                    maxLength={6}
                    className="w-full pl-7 pr-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg text-sm
                      bg-white dark:bg-dark-bg-secondary
                      text-gray-900 dark:text-dark-text-primary
                      placeholder-gray-400 dark:placeholder-dark-text-tertiary
                      focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                      font-mono"
                  />
                </div>

                {/* Live Preview */}
                {customHex && /^[0-9A-Fa-f]{6}$/.test(customHex) && (
                  <div
                    className="w-10 h-10 rounded-lg border-2 border-gray-300 dark:border-dark-border flex-shrink-0"
                    style={{ backgroundColor: '#' + customHex }}
                  />
                )}
              </div>

              {/* Hex Validation Error */}
              {customHex && !/^[0-9A-Fa-f]{6}$/.test(customHex) && (
                <div className="mt-2 text-xs text-red-500 dark:text-red-400">
                  Code hex invalide (6 caractères: 0-9, A-F)
                </div>
              )}
            </div>
          </div>

          {/* Clear Button */}
          {value && (
            <div className="p-3 border-t border-gray-200 dark:border-dark-border">
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setIsOpen(false);
                }}
                className="w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              >
                Supprimer la couleur
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
