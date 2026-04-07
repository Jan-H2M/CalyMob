/**
 * AmortizationTable - Tableau d'amortissement pour un article d'inventaire
 *
 * Affiche le tableau d'amortissement linéaire complet:
 * - Informations de base (valeur achat, durée vie, taux)
 * - Tableau année par année
 * - Valeur actuelle mise en évidence
 * - Indication du pro-rata temporis
 */

import React, { useState } from 'react';
import { cn } from '@/utils/utils';
import { formatCurrency, formatDate } from '@/utils/formatters';
import {
  Calculator,
  Calendar,
  Euro,
  Percent,
  TrendingDown,
  CheckCircle,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Lock,
  Edit3,
  MessageSquare,
  Save,
  X
} from 'lucide-react';
import {
  AmortizationSchedule,
  AmortizationScheduleEntry,
  AmortizationService
} from '@/services/amortizationService';
import { InventoryItem, ItemType, ManualDepreciationEntry } from '@/types/inventory';
import { Timestamp } from 'firebase/firestore';

// ===========================================
// TYPES
// ===========================================

interface AmortizationTableProps {
  item: InventoryItem;
  itemType: ItemType;
  className?: string;
  defaultYearsToShow?: number;
  editable?: boolean;
  onManualEntryChange?: (year: number, amount: number, justification?: string) => void;
  currentUserId?: string;
}

// ===========================================
// UTILITIES
// ===========================================

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

// ===========================================
// SUB-COMPONENTS
// ===========================================

/**
 * Info card with icon
 */
interface InfoCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subtext?: string;
  highlight?: boolean;
}

function InfoCard({ icon: Icon, label, value, subtext, highlight }: InfoCardProps) {
  return (
    <div
      className={cn(
        'p-3 rounded-lg border',
        highlight
          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
          : 'bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-gray-800/50 border-gray-200 dark:border-dark-border dark:border-gray-700'
      )}
    >
      <div className="flex items-start gap-2">
        <Icon
          className={cn(
            'h-4 w-4 mt-0.5',
            highlight ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-dark-text-muted'
          )}
        />
        <div>
          <p className="text-xs text-gray-500 dark:text-dark-text-muted">{label}</p>
          <p
            className={cn(
              'text-sm font-semibold',
              highlight
                ? 'text-blue-900 dark:text-blue-100'
                : 'text-gray-900 dark:text-dark-text-primary dark:text-white'
            )}
          >
            {value}
          </p>
          {subtext && (
            <p className="text-xs text-gray-400 dark:text-dark-text-muted mt-0.5">{subtext}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Progress bar circulaire pour le pourcentage amorti
 */
interface CircularProgressProps {
  percent: number;
  size?: number;
}

function CircularProgress({ percent, size = 80 }: CircularProgressProps) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percent / 100) * circumference;

  const getColor = (pct: number) => {
    if (pct >= 100) return 'text-red-500';
    if (pct >= 75) return 'text-orange-500';
    if (pct >= 50) return 'text-yellow-500';
    return 'text-green-500';
  };

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          className="stroke-gray-200 dark:stroke-gray-700 fill-none"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={cn('fill-none transition-all duration-500', getColor(percent))}
          style={{ stroke: 'currentColor' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn('text-sm font-bold', getColor(percent))}>
          {percent.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

// ===========================================
// MAIN COMPONENT
// ===========================================

export function AmortizationTable({
  item,
  itemType,
  className,
  defaultYearsToShow = 4,
  editable = false,
  onManualEntryChange,
  currentUserId
}: AmortizationTableProps) {
  // State for years to show
  const [yearsToShow, setYearsToShow] = useState(defaultYearsToShow);
  const [showAll, setShowAll] = useState(false);
  const [editingYear, setEditingYear] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState<string>('');
  const [editJustification, setEditJustification] = useState<string>('');

  // Générer le tableau d'amortissement
  const schedule = AmortizationService.generateAmortizationSchedule(item, itemType);

  // Get effective settings for method display
  const effectiveSettings = AmortizationService.getEffectiveSettings(item, itemType);
  const isManualMethod = effectiveSettings.method === 'manual';

  // Handle manual entry edit
  const handleStartEdit = (entry: AmortizationScheduleEntry) => {
    if (!entry.canEdit) return;
    setEditingYear(entry.year);
    setEditAmount(entry.annualDepreciation.toString());
    setEditJustification(entry.justification || '');
  };

  const handleCancelEdit = () => {
    setEditingYear(null);
    setEditAmount('');
    setEditJustification('');
  };

  const handleSaveEdit = () => {
    if (editingYear !== null && onManualEntryChange) {
      const amount = parseFloat(editAmount) || 0;
      onManualEntryChange(editingYear, amount, editJustification || undefined);
    }
    handleCancelEdit();
  };

  // Cas où on ne peut pas générer le tableau
  if (!schedule) {
    return (
      <div
        className={cn(
          'bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-dark-border dark:border-gray-700 p-6 text-center',
          className
        )}
      >
        <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
        <p className="text-sm text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">
          Impossible de calculer l'amortissement.
        </p>
        <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
          Vérifiez que la date d'achat et la valeur d'achat sont renseignées.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <Calculator className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary dark:text-white">
              Tableau d'amortissement
            </h3>
            <p className="text-sm text-gray-500 dark:text-dark-text-muted">
              {schedule.itemCode} - {schedule.itemName}
            </p>
          </div>
        </div>

        {/* Method Badge & Lock Status */}
        <div className="flex items-center gap-2">
          <span className={cn(
            'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium',
            effectiveSettings.method === 'linear' && 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
            effectiveSettings.method === 'degressive' && 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
            effectiveSettings.method === 'manual' && 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
          )}>
            {AmortizationService.getMethodLabel(effectiveSettings.method)}
          </span>
          {schedule.isItemLocked && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
              <Lock className="h-3 w-3" />
              Verrouillé
            </span>
          )}
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <InfoCard
          icon={Calendar}
          label="Date d'achat"
          value={formatDate(schedule.purchaseDate)}
        />
        <InfoCard
          icon={Euro}
          label="Valeur d'achat"
          value={formatCurrency(schedule.purchaseValue)}
        />
        <InfoCard
          icon={Clock}
          label="Durée de vie"
          value={`${schedule.lifespan} ans`}
          subtext={`Taux: ${formatPercent(schedule.annualRate)}/an`}
        />
        <InfoCard
          icon={TrendingDown}
          label="Valeur actuelle"
          value={formatCurrency(schedule.currentBookValue)}
          highlight
        />
      </div>

      {/* Progress section */}
      <div className="flex items-center justify-between p-4 bg-white dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border dark:border-gray-700">
        <div className="flex items-center gap-4">
          <CircularProgress percent={schedule.percentDepreciated} />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary dark:text-white">
              {schedule.isFullyDepreciated ? 'Entièrement amorti' : 'En cours d\'amortissement'}
            </p>
            <p className="text-xs text-gray-500 dark:text-dark-text-muted">
              {formatCurrency(schedule.accumulatedDepreciation)} amortis sur{' '}
              {formatCurrency(schedule.purchaseValue)}
            </p>
          </div>
        </div>

        {schedule.isFullyDepreciated ? (
          <div className="flex items-center gap-2 px-3 py-1 bg-red-100 dark:bg-red-900/30 rounded-full">
            <CheckCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            <span className="text-sm font-medium text-red-800 dark:text-red-200">
              Amorti à 100%
            </span>
          </div>
        ) : (
          <div className="text-right">
            <p className="text-xs text-gray-500 dark:text-dark-text-muted">Valeur résiduelle</p>
            <p className="text-sm font-semibold text-green-600 dark:text-green-400">
              {formatCurrency(schedule.currentBookValue)}
            </p>
          </div>
        )}
      </div>

      {/* Years selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">Afficher:</span>
          <select
            value={showAll ? 'all' : yearsToShow}
            onChange={(e) => {
              if (e.target.value === 'all') {
                setShowAll(true);
              } else {
                setShowAll(false);
                setYearsToShow(parseInt(e.target.value));
              }
            }}
            className="px-2 py-1 text-sm border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-dark-text-primary dark:text-white"
          >
            <option value={4}>4 ans</option>
            <option value={5}>5 ans</option>
            <option value={7}>7 ans</option>
            <option value={10}>10 ans</option>
            <option value="all">Tout ({schedule.entries.length} ans)</option>
          </select>
        </div>
        <span className="text-xs text-gray-500 dark:text-dark-text-muted">
          Durée totale: {schedule.lifespan} ans
        </span>
      </div>

      {/* Schedule table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-dark-border dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                Année
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                Val. début
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                Amort.
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                Amort. cumulés
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                Val. fin
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                {isManualMethod ? 'Toelichting' : 'Note'}
              </th>
              {(editable && isManualMethod) && (
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider w-20">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-dark-bg-secondary divide-y divide-gray-200 dark:divide-gray-700">
            {(showAll ? schedule.entries : schedule.entries.slice(0, yearsToShow)).map((entry) => (
              <ScheduleRow
                key={entry.fiscalYear}
                entry={entry}
                isEditing={editingYear === entry.year}
                editAmount={editAmount}
                editJustification={editJustification}
                onEditAmountChange={setEditAmount}
                onEditJustificationChange={setEditJustification}
                onStartEdit={() => handleStartEdit(entry)}
                onCancelEdit={handleCancelEdit}
                onSaveEdit={handleSaveEdit}
                editable={editable && isManualMethod}
                showActionsColumn={editable && isManualMethod}
              />
            ))}
          </tbody>
        </table>

        {/* Show more/less button */}
        {!showAll && schedule.entries.length > yearsToShow && (
          <button
            onClick={() => setShowAll(true)}
            className="w-full py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-gray-800 flex items-center justify-center gap-1 border-t border-gray-200 dark:border-dark-border dark:border-gray-700"
          >
            <ChevronDown className="h-4 w-4" />
            Voir les {schedule.entries.length - yearsToShow} années restantes
          </button>
        )}
        {showAll && schedule.entries.length > defaultYearsToShow && (
          <button
            onClick={() => setShowAll(false)}
            className="w-full py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-gray-800 flex items-center justify-center gap-1 border-t border-gray-200 dark:border-dark-border dark:border-gray-700"
          >
            <ChevronUp className="h-4 w-4" />
            Réduire
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-dark-text-muted">
        <div className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 bg-blue-100 dark:bg-blue-900/30 rounded border border-blue-300 dark:border-blue-700" />
          <span>Année en cours</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-amber-600">*</span>
          <span>Pro-rata temporis</span>
        </div>
        <div className="flex items-center gap-1">
          <Lock className="h-3 w-3 text-gray-400 dark:text-dark-text-muted" />
          <span>Verrouillé</span>
        </div>
        {isManualMethod && (
          <div className="flex items-center gap-1">
            <span className="inline-block px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded text-xs">manuel</span>
            <span>Entrée manuelle</span>
          </div>
        )}
        <div className="flex items-center gap-1">
          <span>Méthode:</span>
          <span className="font-medium">{AmortizationService.getMethodLabel(effectiveSettings.method)}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Row for schedule table
 */
interface ScheduleRowProps {
  entry: AmortizationScheduleEntry;
  isEditing?: boolean;
  editAmount?: string;
  editJustification?: string;
  onEditAmountChange?: (value: string) => void;
  onEditJustificationChange?: (value: string) => void;
  onStartEdit?: () => void;
  onCancelEdit?: () => void;
  onSaveEdit?: () => void;
  editable?: boolean;
  showActionsColumn?: boolean;
}

function ScheduleRow({
  entry,
  isEditing = false,
  editAmount = '',
  editJustification = '',
  onEditAmountChange,
  onEditJustificationChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  editable = false,
  showActionsColumn = false
}: ScheduleRowProps) {
  const isCurrentYear = entry.isCurrentYear;
  const isProRata = entry.isProRata;
  const isLocked = entry.isLocked;
  const isManual = entry.isManual;
  const canEdit = entry.canEdit && editable;

  return (
    <tr
      className={cn(
        'transition-colors',
        isCurrentYear && 'bg-blue-50 dark:bg-blue-900/20',
        isLocked && 'bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-gray-800/50'
      )}
    >
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex items-center gap-2">
          {isLocked && (
            <Lock className="h-3.5 w-3.5 text-gray-400 dark:text-dark-text-muted" />
          )}
          <span
            className={cn(
              'text-sm font-medium',
              isCurrentYear
                ? 'text-blue-700 dark:text-blue-300'
                : isLocked
                ? 'text-gray-500 dark:text-dark-text-muted'
                : 'text-gray-900 dark:text-dark-text-primary dark:text-white'
            )}
          >
            {entry.fiscalYear}
          </span>
          {isCurrentYear && (
            <span className="text-xs px-1.5 py-0.5 bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded">
              actuel
            </span>
          )}
          {isManual && (
            <span className="text-xs px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded">
              manuel
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">
        {formatCurrency(entry.openingValue)}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-right">
        {isEditing ? (
          <input
            type="number"
            value={editAmount}
            onChange={(e) => onEditAmountChange?.(e.target.value)}
            className="w-24 px-2 py-1 text-sm border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded text-right bg-white dark:bg-gray-800"
            step="0.01"
            min="0"
            autoFocus
          />
        ) : (
          <span className="text-sm text-orange-600 dark:text-orange-400 font-medium">
            -{formatCurrency(entry.annualDepreciation)}
            {isProRata && <span className="text-amber-600 ml-1">*</span>}
          </span>
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">
        {formatCurrency(entry.accumulatedDepreciation)}
      </td>
      <td
        className={cn(
          'px-4 py-3 whitespace-nowrap text-right text-sm font-medium',
          entry.closingValue === 0
            ? 'text-red-600 dark:text-red-400'
            : 'text-gray-900 dark:text-dark-text-primary dark:text-white'
        )}
      >
        {formatCurrency(entry.closingValue)}
      </td>
      <td className="px-4 py-3 text-center">
        {isEditing ? (
          <input
            type="text"
            value={editJustification}
            onChange={(e) => onEditJustificationChange?.(e.target.value)}
            className="w-32 px-2 py-1 text-xs border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded bg-white dark:bg-gray-800"
            placeholder="Toelichting..."
          />
        ) : (
          <span className="text-xs text-gray-500 dark:text-dark-text-muted">
            {entry.justification ? (
              <span className="flex items-center justify-center gap-1" title={entry.justification}>
                <MessageSquare className="h-3 w-3" />
                <span className="truncate max-w-20">{entry.justification}</span>
              </span>
            ) : (
              <>
                {isProRata && '(prorata)'}
                {entry.closingValue === 0 && !isProRata && '(fin)'}
              </>
            )}
          </span>
        )}
      </td>
      {showActionsColumn && (
        <td className="px-4 py-3 whitespace-nowrap text-center">
          {isEditing ? (
            <div className="flex items-center justify-center gap-1">
              <button
                onClick={onSaveEdit}
                className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"
                title="Sauvegarder"
              >
                <Save className="h-4 w-4" />
              </button>
              <button
                onClick={onCancelEdit}
                className="p-1 text-gray-500 dark:text-dark-text-muted hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-gray-700 rounded"
                title="Annuler"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : canEdit ? (
            <button
              onClick={onStartEdit}
              className="p-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
              title="Modifier"
            >
              <Edit3 className="h-4 w-4" />
            </button>
          ) : isLocked ? (
            <Lock className="h-4 w-4 text-gray-300 mx-auto" />
          ) : null}
        </td>
      )}
    </tr>
  );
}

/**
 * Compact version for list views
 */
interface AmortizationSummaryProps {
  item: InventoryItem;
  itemType: ItemType;
  className?: string;
}

export function AmortizationSummary({ item, itemType, className }: AmortizationSummaryProps) {
  const schedule = AmortizationService.generateAmortizationSchedule(item, itemType);

  if (!schedule) {
    return (
      <div className={cn('text-sm text-gray-400 dark:text-dark-text-muted', className)}>
        N/A
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="flex-1">
        <div className="flex justify-between text-xs text-gray-500 dark:text-dark-text-muted mb-1">
          <span>Valeur actuelle</span>
          <span>{formatPercent(schedule.percentDepreciated)} amorti</span>
        </div>
        <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              schedule.percentDepreciated >= 100
                ? 'bg-red-500'
                : schedule.percentDepreciated >= 75
                ? 'bg-orange-500'
                : 'bg-green-500'
            )}
            style={{ width: `${Math.min(100, schedule.percentDepreciated)}%` }}
          />
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold text-gray-900 dark:text-dark-text-primary dark:text-white">
          {formatCurrency(schedule.currentBookValue)}
        </p>
        <p className="text-xs text-gray-400 dark:text-dark-text-muted">
          / {formatCurrency(schedule.purchaseValue)}
        </p>
      </div>
    </div>
  );
}

export default AmortizationTable;
