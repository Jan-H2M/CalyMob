/**
 * LocationBadge - Affiche l'emplacement d'un article d'inventaire
 *
 * Indicateurs visuels:
 * - 📍 Local club (stockage par défaut)
 * - 🏊 Piscine
 * - 🏔️ Carrière
 * - 👤 Prêté (avec nom du membre)
 * - 🔧 Maintenance
 */

import React from 'react';
import { cn } from '@/utils/utils';
import { MapPin, Waves, Mountain, User, Wrench, HelpCircle } from 'lucide-react';

export type LocationType = 'club' | 'piscine' | 'carriere' | 'prete' | 'maintenance' | 'unknown';

interface LocationBadgeProps {
  locationType: LocationType;
  locationName?: string;
  borrowerName?: string; // Nom du membre si prêté
  showIcon?: boolean;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const locationConfig: Record<LocationType, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  bgColor: string;
  textColor: string;
  borderColor: string;
  emoji: string;
}> = {
  club: {
    label: 'Local club',
    icon: MapPin,
    bgColor: 'bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-800/50',
    textColor: 'text-gray-700 dark:text-dark-text-primary dark:text-gray-300',
    borderColor: 'border-gray-200 dark:border-dark-border dark:border-gray-700',
    emoji: '📍'
  },
  piscine: {
    label: 'Piscine',
    icon: Waves,
    bgColor: 'bg-cyan-100 dark:bg-cyan-900/30',
    textColor: 'text-cyan-800 dark:text-cyan-300',
    borderColor: 'border-cyan-200 dark:border-cyan-800',
    emoji: '🏊'
  },
  carriere: {
    label: 'Carrière',
    icon: Mountain,
    bgColor: 'bg-stone-100 dark:bg-stone-800/50',
    textColor: 'text-stone-700 dark:text-stone-300',
    borderColor: 'border-stone-200 dark:border-stone-700',
    emoji: '🏔️'
  },
  prete: {
    label: 'Prêté',
    icon: User,
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    textColor: 'text-blue-800 dark:text-blue-300',
    borderColor: 'border-blue-200 dark:border-blue-800',
    emoji: '👤'
  },
  maintenance: {
    label: 'Maintenance',
    icon: Wrench,
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    textColor: 'text-amber-800 dark:text-amber-300',
    borderColor: 'border-amber-200 dark:border-amber-800',
    emoji: '🔧'
  },
  unknown: {
    label: 'Inconnu',
    icon: HelpCircle,
    bgColor: 'bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-800/50',
    textColor: 'text-gray-500 dark:text-dark-text-muted',
    borderColor: 'border-gray-200 dark:border-dark-border dark:border-gray-700',
    emoji: '❓'
  }
};

const sizeConfig = {
  sm: {
    padding: 'px-1.5 py-0.5',
    text: 'text-xs',
    icon: 'h-3 w-3',
    gap: 'gap-1'
  },
  md: {
    padding: 'px-2 py-1',
    text: 'text-sm',
    icon: 'h-4 w-4',
    gap: 'gap-1.5'
  },
  lg: {
    padding: 'px-3 py-1.5',
    text: 'text-base',
    icon: 'h-5 w-5',
    gap: 'gap-2'
  }
};

export function LocationBadge({
  locationType,
  locationName,
  borrowerName,
  showIcon = true,
  showLabel = true,
  size = 'md',
  className
}: LocationBadgeProps) {
  const config = locationConfig[locationType] || locationConfig.unknown;
  const sizeStyles = sizeConfig[size];
  const Icon = config.icon;

  // Déterminer le texte à afficher
  let displayLabel = locationName || config.label;
  if (locationType === 'prete' && borrowerName) {
    displayLabel = borrowerName;
  }

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full border',
        sizeStyles.padding,
        sizeStyles.text,
        sizeStyles.gap,
        config.bgColor,
        config.textColor,
        config.borderColor,
        className
      )}
    >
      {showIcon && <Icon className={sizeStyles.icon} />}
      {showLabel && <span className="truncate max-w-[150px]">{displayLabel}</span>}
    </span>
  );
}

/**
 * Convertit le code d'un emplacement en type de location
 */
export function getLocationTypeFromCode(code: string): LocationType {
  const codeUpper = code.toUpperCase();

  if (codeUpper.includes('CLUB') || codeUpper.includes('LOCAL')) return 'club';
  if (codeUpper.includes('PISCINE') || codeUpper.includes('POOL')) return 'piscine';
  if (codeUpper.includes('CARRIERE') || codeUpper.includes('CARRIÈRE') || codeUpper.includes('QUARRY')) return 'carriere';
  if (codeUpper.includes('PRET') || codeUpper.includes('PRÊT') || codeUpper.includes('LOAN')) return 'prete';
  if (codeUpper.includes('MAINT') || codeUpper.includes('REPAIR')) return 'maintenance';

  return 'unknown';
}

/**
 * Détermine le type de location basé sur le statut de l'article
 */
export function getLocationTypeFromStatus(
  statut: string,
  locationCode?: string
): LocationType {
  if (statut === 'prete') return 'prete';
  if (statut === 'en_maintenance') return 'maintenance';

  if (locationCode) {
    return getLocationTypeFromCode(locationCode);
  }

  return 'club';
}

/**
 * getLocationRowClass - Retourne la classe CSS pour colorer une ligne
 * selon l'emplacement de l'article
 */
export function getLocationRowClass(locationType: LocationType): string {
  const rowClasses: Record<LocationType, string> = {
    club: '',
    piscine: '',
    carriere: '',
    prete: 'bg-blue-50 dark:bg-blue-900/10',
    maintenance: 'bg-amber-50 dark:bg-amber-900/10',
    unknown: ''
  };

  return rowClasses[locationType] || '';
}

/**
 * Selector dropdown pour choisir un emplacement
 */
interface LocationSelectProps {
  value: string;
  onChange: (value: string) => void;
  locations: Array<{ id: string; nom: string; code: string }>;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}

export function LocationSelect({
  value,
  onChange,
  locations,
  className,
  disabled = false,
  placeholder = 'Sélectionner un emplacement'
}: LocationSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={cn(
        'px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md',
        'bg-white dark:bg-dark-bg-primary',
        'text-gray-900 dark:text-dark-text-primary',
        'focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
    >
      <option value="">{placeholder}</option>
      {locations.map((loc) => {
        const locType = getLocationTypeFromCode(loc.code);
        const emoji = locationConfig[locType].emoji;
        return (
          <option key={loc.id} value={loc.id}>
            {emoji} {loc.nom}
          </option>
        );
      })}
    </select>
  );
}

/**
 * Usage indicator - Piscine/Carrière/Polyvalent
 */
export type UsageType = 'piscine' | 'carriere' | 'polyvalent';

interface UsageBadgeProps {
  usage: UsageType;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const usageConfig: Record<UsageType, {
  label: string;
  bgColor: string;
  textColor: string;
  emoji: string;
}> = {
  piscine: {
    label: 'Piscine',
    bgColor: 'bg-cyan-100 dark:bg-cyan-900/30',
    textColor: 'text-cyan-700 dark:text-cyan-300',
    emoji: '🏊'
  },
  carriere: {
    label: 'Carrière',
    bgColor: 'bg-stone-100 dark:bg-stone-800/50',
    textColor: 'text-stone-700 dark:text-stone-300',
    emoji: '🏔️'
  },
  polyvalent: {
    label: 'Polyvalent',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    textColor: 'text-purple-700 dark:text-purple-300',
    emoji: '🔄'
  }
};

export function UsageBadge({ usage, size = 'sm', className }: UsageBadgeProps) {
  const config = usageConfig[usage] || usageConfig.polyvalent;
  const sizeStyles = sizeConfig[size];

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full',
        sizeStyles.padding,
        sizeStyles.text,
        config.bgColor,
        config.textColor,
        className
      )}
    >
      {config.label}
    </span>
  );
}

export default LocationBadge;
