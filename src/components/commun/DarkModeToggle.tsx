import React, { useState } from 'react';
import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/utils/utils';
import type { Theme } from '@/types/theme.types';

interface ThemeOption {
  value: Theme;
  label: string;
  icon: typeof Sun;
}

const THEME_OPTIONS: ThemeOption[] = [
  { value: 'light', label: 'Mode Clair', icon: Sun },
  { value: 'dark', label: 'Mode Sombre', icon: Moon },
  { value: 'system', label: 'Système', icon: Monitor },
];

export function DarkModeToggle() {
  const { theme, setTheme, effectiveTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const currentOption = THEME_OPTIONS.find(opt => opt.value === theme);
  const CurrentIcon = currentOption?.icon || Sun;

  return (
    <div className="relative">
      {/* Bouton principal */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg transition-colors",
          "hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary",
          "text-gray-700 dark:text-dark-text-primary text-sm font-medium"
        )}
        title={`Thème: ${currentOption?.label || 'Inconnu'}`}
        aria-label="Changer le thème"
      >
        <CurrentIcon className="h-4 w-4" />
        <span>{currentOption?.label || 'Thème'}</span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          {/* Menu */}
          <div className={cn(
            "absolute bottom-full right-0 mb-2 w-52 z-50",
            "bg-white dark:bg-dark-bg-secondary",
            "border border-gray-200 dark:border-dark-border",
            "rounded-lg shadow-lg",
            "py-1"
          )}>
            {THEME_OPTIONS.map(option => {
              const Icon = option.icon;
              const isActive = theme === option.value;

              return (
                <button
                  key={option.value}
                  onClick={() => {
                    setTheme(option.value);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5",
                    "text-left text-sm transition-colors",
                    "hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary",
                    isActive
                      ? "text-calypso-blue dark:text-calypso-aqua font-medium"
                      : "text-gray-700 dark:text-dark-text-primary"
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1">{option.label}</span>
                  {isActive && <Check className="h-4 w-4 flex-shrink-0" />}
                </button>
              );
            })}

            {/* Indicateur effectif (si mode System) */}
            {theme === 'system' && (
              <div className="px-4 py-2 border-t border-gray-200 dark:border-dark-border mt-1">
                <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                  Actuellement : {effectiveTheme === 'dark' ? '🌙 Sombre' : '☀️ Clair'}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
