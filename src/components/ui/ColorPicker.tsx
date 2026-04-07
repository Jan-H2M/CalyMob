/**
 * ColorPicker - Composant de selection de couleur
 * Combine un input color natif avec un champ texte et une palette optionnelle
 */

import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/utils/utils';

interface ColorPickerProps {
  label?: string;
  value: string;
  onChange: (color: string) => void;
  presets?: string[];
  className?: string;
  compact?: boolean;
  showHex?: boolean;
}

// Default color presets
const DEFAULT_PRESETS = [
  '#006994', // Calypso blue
  '#004A6B', // Calypso dark
  '#00A5CF', // Calypso aqua
  '#0077B6', // Ocean
  '#2D6A4F', // Forest
  '#E76F51', // Sunset
  '#7C3AED', // Purple
  '#1A365D', // Corporate
  '#333333', // Dark gray
  '#FFFFFF', // White
  '#F5F5F5', // Light gray
  '#F0F0F0', // Lighter gray
];

export default function ColorPicker({
  label,
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  className,
  compact = false,
  showHex = true,
}: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync local value with prop
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleColorChange = (newColor: string) => {
    setLocalValue(newColor);
    onChange(newColor);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);

    // Only call onChange if it's a valid hex color
    if (/^#[0-9A-Fa-f]{6}$/.test(newValue)) {
      onChange(newValue);
    }
  };

  const handleInputBlur = () => {
    // Normalize value on blur
    if (/^#[0-9A-Fa-f]{6}$/.test(localValue)) {
      onChange(localValue.toUpperCase());
    } else if (/^[0-9A-Fa-f]{6}$/.test(localValue)) {
      onChange(`#${localValue.toUpperCase()}`);
    } else {
      // Reset to last valid value
      setLocalValue(value);
    }
  };

  if (compact) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <div className="relative">
          <input
            type="color"
            value={value}
            onChange={(e) => handleColorChange(e.target.value)}
            className="h-8 w-10 cursor-pointer rounded border border-gray-300 dark:border-dark-border"
          />
        </div>
        {showHex && (
          <input
            type="text"
            value={localValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            className="w-20 px-2 py-1 text-xs border border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-bg-tertiary font-mono"
            placeholder="#000000"
          />
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
          {label}
        </label>
      )}

      <div className="flex items-center gap-2">
        {/* Color preview button */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="h-10 w-12 rounded border-2 border-gray-300 dark:border-dark-border hover:border-calypso-blue transition-colors shadow-sm"
          style={{ backgroundColor: value }}
          title="Cliquer pour ouvrir la palette"
        />

        {/* Hidden native color input */}
        <input
          ref={inputRef}
          type="color"
          value={value}
          onChange={(e) => handleColorChange(e.target.value)}
          className="absolute opacity-0 pointer-events-none"
        />

        {/* Hex input */}
        {showHex && (
          <input
            type="text"
            value={localValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary font-mono"
            placeholder="#000000"
          />
        )}
      </div>

      {/* Dropdown with presets */}
      {isOpen && (
        <div className="absolute z-50 mt-2 p-3 bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-lg shadow-lg">
          <div className="grid grid-cols-6 gap-1.5 mb-3">
            {presets.map((color, index) => (
              <button
                key={index}
                type="button"
                onClick={() => {
                  handleColorChange(color);
                  setIsOpen(false);
                }}
                className={cn(
                  'h-7 w-7 rounded border-2 transition-all hover:scale-110',
                  value.toLowerCase() === color.toLowerCase()
                    ? 'border-calypso-blue ring-2 ring-calypso-blue/30'
                    : 'border-gray-200 dark:border-dark-border'
                )}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>

          {/* Custom color button */}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full px-3 py-1.5 text-xs text-calypso-blue hover:bg-calypso-blue/10 rounded transition-colors"
          >
            Couleur personnalisee...
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * ColorPresetSelector - Select a predefined color palette
 */
interface ColorPresetSelectorProps {
  onSelect: (colors: { primary: string; secondary: string; accent: string }) => void;
  className?: string;
}

export function ColorPresetSelector({ onSelect, className }: ColorPresetSelectorProps) {
  const presets = [
    { name: 'Calypso', primary: '#006994', secondary: '#004A6B', accent: '#00A5CF' },
    { name: 'Ocean', primary: '#0077B6', secondary: '#023E8A', accent: '#48CAE4' },
    { name: 'Foret', primary: '#2D6A4F', secondary: '#1B4332', accent: '#52B788' },
    { name: 'Coucher de soleil', primary: '#E76F51', secondary: '#9C3D28', accent: '#F4A261' },
    { name: 'Corporate', primary: '#1A365D', secondary: '#0D1B2A', accent: '#3182CE' },
    { name: 'Violet', primary: '#7C3AED', secondary: '#5B21B6', accent: '#A78BFA' },
  ];

  return (
    <div className={cn('space-y-2', className)}>
      <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary">
        Palettes predefinies
      </label>
      <div className="grid grid-cols-3 gap-2">
        {presets.map((preset) => (
          <button
            key={preset.name}
            type="button"
            onClick={() => onSelect(preset)}
            className="flex flex-col items-center gap-1 p-2 border border-gray-200 dark:border-dark-border rounded-lg hover:border-calypso-blue hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors"
          >
            <div className="flex gap-0.5">
              <div
                className="h-5 w-5 rounded-l"
                style={{ backgroundColor: preset.primary }}
              />
              <div
                className="h-5 w-5"
                style={{ backgroundColor: preset.secondary }}
              />
              <div
                className="h-5 w-5 rounded-r"
                style={{ backgroundColor: preset.accent }}
              />
            </div>
            <span className="text-xs text-gray-600 dark:text-dark-text-secondary">
              {preset.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
