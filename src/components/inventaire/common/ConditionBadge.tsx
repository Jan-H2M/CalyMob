/**
 * ConditionBadge - Affiche l'état/condition d'un article d'inventaire
 *
 * Couleurs visuelles selon la condition:
 * - Excellent: Vert (neuf/parfait)
 * - Bon: Vert clair (fonctionne bien)
 * - Correct: Jaune (usure normale)
 * - Mauvais: Orange (à surveiller)
 * - Hors service: Rouge (à retirer)
 */

import React from 'react';
import { cn } from '@/utils/utils';
import { CheckCircle2, Circle, AlertCircle, AlertTriangle, XCircle } from 'lucide-react';

export type ConditionType = 'excellent' | 'bon' | 'correct' | 'mauvais' | 'hors_service';

interface ConditionBadgeProps {
  condition: ConditionType;
  showIcon?: boolean;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const conditionConfig: Record<ConditionType, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  bgColor: string;
  textColor: string;
  borderColor: string;
  emoji: string;
}> = {
  excellent: {
    label: 'Excellent',
    icon: CheckCircle2,
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
    textColor: 'text-emerald-800 dark:text-emerald-300',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
    emoji: '✅'
  },
  bon: {
    label: 'Bon',
    icon: Circle,
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    textColor: 'text-green-800 dark:text-green-300',
    borderColor: 'border-green-200 dark:border-green-800',
    emoji: '🟢'
  },
  correct: {
    label: 'Correct',
    icon: AlertCircle,
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    textColor: 'text-yellow-800 dark:text-yellow-300',
    borderColor: 'border-yellow-200 dark:border-yellow-800',
    emoji: '🟡'
  },
  mauvais: {
    label: 'Usé',
    icon: AlertTriangle,
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    textColor: 'text-orange-800 dark:text-orange-300',
    borderColor: 'border-orange-200 dark:border-orange-800',
    emoji: '🟠'
  },
  hors_service: {
    label: 'Hors service',
    icon: XCircle,
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    textColor: 'text-red-800 dark:text-red-300',
    borderColor: 'border-red-200 dark:border-red-800',
    emoji: '🔴'
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

export function ConditionBadge({
  condition,
  showIcon = true,
  showLabel = true,
  size = 'md',
  className
}: ConditionBadgeProps) {
  const config = conditionConfig[condition] || conditionConfig.bon;
  const sizeStyles = sizeConfig[size];
  const Icon = config.icon;

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
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}

/**
 * ConditionDot - Version compacte, juste un point coloré
 */
interface ConditionDotProps {
  condition: ConditionType;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showTooltip?: boolean;
}

const dotSizeConfig = {
  sm: 'h-2 w-2',
  md: 'h-3 w-3',
  lg: 'h-4 w-4'
};

const dotColorConfig: Record<ConditionType, string> = {
  excellent: 'bg-emerald-500',
  bon: 'bg-green-500',
  correct: 'bg-yellow-500',
  mauvais: 'bg-orange-500',
  hors_service: 'bg-red-500'
};

export function ConditionDot({
  condition,
  size = 'md',
  className,
  showTooltip = true
}: ConditionDotProps) {
  const config = conditionConfig[condition] || conditionConfig.bon;

  return (
    <span
      className={cn(
        'inline-block rounded-full',
        dotSizeConfig[size],
        dotColorConfig[condition],
        className
      )}
      title={showTooltip ? config.label : undefined}
    />
  );
}

/**
 * getConditionRowClass - Retourne la classe CSS pour colorer une ligne
 * selon la condition de l'article
 */
export function getConditionRowClass(condition: ConditionType): string {
  const rowClasses: Record<ConditionType, string> = {
    excellent: '',
    bon: '',
    correct: '',
    mauvais: 'bg-orange-50 dark:bg-orange-900/10',
    hors_service: 'bg-red-50 dark:bg-red-900/10'
  };

  return rowClasses[condition] || '';
}

/**
 * Selector dropdown pour choisir une condition
 */
interface ConditionSelectProps {
  value: ConditionType;
  onChange: (value: ConditionType) => void;
  className?: string;
  disabled?: boolean;
}

export function ConditionSelect({
  value,
  onChange,
  className,
  disabled = false
}: ConditionSelectProps) {
  const conditions: ConditionType[] = ['excellent', 'bon', 'correct', 'mauvais', 'hors_service'];

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ConditionType)}
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
      {conditions.map((cond) => (
        <option key={cond} value={cond}>
          {conditionConfig[cond].emoji} {conditionConfig[cond].label}
        </option>
      ))}
    </select>
  );
}

export default ConditionBadge;
