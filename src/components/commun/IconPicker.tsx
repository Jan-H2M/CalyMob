/**
 * IconPicker Component
 *
 * Dropdown selector voor Lucide iconen met zoekfunctionaliteit
 * en categorisatie (Users, Finance, Operations, General).
 */

import { useState, useRef, useEffect } from 'react';
import * as LucideIcons from 'lucide-react';
import { Search, ChevronDown } from 'lucide-react';

// Available Lucide icons per category
export const AVAILABLE_ICONS = {
  users: [
    'User', 'Users', 'Shield', 'UserCheck', 'UserCog', 'UserPlus',
    'UserMinus', 'UserX', 'Award', 'Crown', 'Briefcase'
  ],
  finance: [
    'Wallet', 'CreditCard', 'Banknote', 'TrendingUp', 'TrendingDown',
    'PiggyBank', 'Receipt', 'DollarSign', 'Euro', 'Coins'
  ],
  operations: [
    'Calendar', 'Target', 'FileText', 'ClipboardList', 'CheckCircle',
    'Flag', 'Activity', 'BarChart', 'PieChart', 'Package'
  ],
  general: [
    'Settings', 'Bell', 'Mail', 'Home', 'Star', 'Heart',
    'Tag', 'Hash', 'AlertCircle', 'Info', 'HelpCircle'
  ]
};

// Category labels
const CATEGORY_LABELS: Record<keyof typeof AVAILABLE_ICONS, string> = {
  users: '👥 Utilisateurs',
  finance: '💰 Finance',
  operations: '📅 Opérations',
  general: '🔧 Général'
};

interface IconPickerProps {
  value: string | undefined;
  onChange: (icon: string) => void;
  disabled?: boolean;
}

export default function IconPicker({ value, onChange, disabled }: IconPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
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

  // Render icon component dynamically
  const renderIcon = (iconName: string, className?: string) => {
    const Icon = (LucideIcons as any)[iconName];
    if (!Icon) return null;
    return <Icon className={className} />;
  };

  // Filter icons based on search term
  const filterIcons = () => {
    if (!searchTerm.trim()) {
      return AVAILABLE_ICONS;
    }

    const search = searchTerm.toLowerCase();
    const filtered: typeof AVAILABLE_ICONS = {
      users: [],
      finance: [],
      operations: [],
      general: []
    };

    Object.entries(AVAILABLE_ICONS).forEach(([category, icons]) => {
      filtered[category as keyof typeof AVAILABLE_ICONS] = icons.filter(icon =>
        icon.toLowerCase().includes(search)
      );
    });

    return filtered;
  };

  const filteredIcons = filterIcons();

  // Check if any icons match search
  const hasResults = Object.values(filteredIcons).some(icons => icons.length > 0);

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
            {renderIcon(value, 'w-4 h-4')}
            <span>{value}</span>
          </>
        ) : (
          <span className="text-gray-400 dark:text-dark-text-tertiary">Choisir une icône</span>
        )}
        <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-2 w-80 bg-white dark:bg-dark-bg-primary border border-gray-200 dark:border-dark-border rounded-lg shadow-lg">
          {/* Search Bar */}
          <div className="p-3 border-b border-gray-200 dark:border-dark-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-dark-text-tertiary" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher une icône..."
                className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg text-sm
                  bg-white dark:bg-dark-bg-secondary
                  text-gray-900 dark:text-dark-text-primary
                  placeholder-gray-400 dark:placeholder-dark-text-tertiary
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Icon Grid */}
          <div className="max-h-96 overflow-y-auto p-3">
            {!hasResults ? (
              <div className="text-center py-8 text-gray-400 dark:text-dark-text-tertiary text-sm">
                Aucune icône trouvée
              </div>
            ) : (
              Object.entries(filteredIcons).map(([category, icons]) => {
                if (icons.length === 0) return null;

                return (
                  <div key={category} className="mb-4 last:mb-0">
                    {/* Category Label */}
                    <div className="text-xs font-medium text-gray-500 dark:text-dark-text-secondary mb-2 px-1">
                      {CATEGORY_LABELS[category as keyof typeof AVAILABLE_ICONS]}
                    </div>

                    {/* Icon Grid */}
                    <div className="grid grid-cols-6 gap-2">
                      {icons.map(iconName => (
                        <button
                          key={iconName}
                          type="button"
                          onClick={() => {
                            onChange(iconName);
                            setIsOpen(false);
                            setSearchTerm('');
                          }}
                          className={`
                            p-3 rounded-lg border-2 transition-all
                            hover:bg-blue-50 dark:hover:bg-blue-900/20
                            ${value === iconName
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                              : 'border-gray-200 dark:border-dark-border'
                            }
                          `}
                          title={iconName}
                        >
                          {renderIcon(iconName, 'w-5 h-5 text-gray-700 dark:text-dark-text-primary mx-auto')}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
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
                Supprimer l'icône
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
