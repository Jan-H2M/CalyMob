/**
 * InventoryStats - Dashboard de statistiques d'inventaire
 *
 * Affiche:
 * - Compteurs par statut (disponible, prêté, maintenance, hors service)
 * - Alertes (révisions, stock bas)
 * - Valeurs financières (achat, actuelle, amortissement)
 */

import React from 'react';
import { cn } from '@/utils/utils';
import {
  Package,
  CheckCircle,
  User,
  Wrench,
  XCircle,
  AlertTriangle,
  TrendingDown,
  Euro,
  Percent,
  AlertCircle
} from 'lucide-react';
import { DepreciationSummary } from '@/services/amortizationService';

// ===========================================
// TYPES
// ===========================================

export interface InventoryStatsData {
  total: number;
  disponible: number;
  prete: number;
  maintenance: number;
  hors_service: number;
}

export interface TankInspectionAlert {
  overdue: number;
  upcoming: number;
  ok: number;
}

export interface InventoryStatsProps {
  stats: InventoryStatsData;
  tankAlerts?: TankInspectionAlert;
  depreciation?: DepreciationSummary;
  isLoading?: boolean;
  className?: string;
}

// ===========================================
// COMPONENTS
// ===========================================

/**
 * Stat Card individuelle
 */
interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  bgColor: string;
  textColor: string;
  iconColor: string;
  subtext?: string;
  onClick?: () => void;
}

function StatCard({
  label,
  value,
  icon: Icon,
  bgColor,
  textColor,
  iconColor,
  subtext,
  onClick
}: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg shadow p-4 transition-all',
        bgColor,
        onClick && 'cursor-pointer hover:shadow-md hover:scale-[1.02]'
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-medium truncate', textColor)}>{label}</p>
          <p className={cn('text-2xl font-bold', textColor.replace('text-', 'text-').replace('-700', '-900').replace('-300', '-100'))}>
            {value}
          </p>
          {subtext && (
            <p className={cn('text-xs mt-1 opacity-75', textColor)}>{subtext}</p>
          )}
        </div>
        <Icon className={cn('h-8 w-8 flex-shrink-0', iconColor)} />
      </div>
    </div>
  );
}

/**
 * Alerte avec icône
 */
interface AlertItemProps {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  message: string;
  count?: number;
  onClick?: () => void;
}

function AlertItem({ icon: Icon, iconColor, message, count, onClick }: AlertItemProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 p-2 rounded-md',
        onClick && 'cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-gray-800'
      )}
      onClick={onClick}
    >
      <Icon className={cn('h-5 w-5 flex-shrink-0', iconColor)} />
      <span className="flex-1 text-sm text-gray-700 dark:text-dark-text-primary dark:text-gray-300">{message}</span>
      {count !== undefined && count > 0 && (
        <span className="text-sm font-semibold text-gray-900 dark:text-dark-text-primary dark:text-white">{count}</span>
      )}
    </div>
  );
}

/**
 * Progress bar pour pourcentage
 */
interface ProgressBarProps {
  percent: number;
  label?: string;
  color?: string;
}

function ProgressBar({ percent, label, color = 'bg-blue-600' }: ProgressBarProps) {
  const clampedPercent = Math.min(100, Math.max(0, percent));

  return (
    <div className="space-y-1">
      {label && (
        <div className="flex justify-between text-xs text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">
          <span>{label}</span>
          <span>{clampedPercent.toFixed(1)}%</span>
        </div>
      )}
      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', color)}
          style={{ width: `${clampedPercent}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Composant principal
 */
export function InventoryStats({
  stats,
  tankAlerts,
  depreciation,
  isLoading = false,
  className
}: InventoryStatsProps) {
  if (isLoading) {
    return (
      <div className={cn('animate-pulse space-y-4', className)}>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const hasAlerts = tankAlerts && (tankAlerts.overdue > 0 || tankAlerts.upcoming > 0);
  const hasDepreciation = depreciation && depreciation.totalPurchaseValue > 0;

  return (
    <div className={cn('space-y-6', className)}>
      {/* Stats principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          label="Total"
          value={stats.total}
          icon={Package}
          bgColor="bg-white dark:bg-dark-bg-secondary"
          textColor="text-gray-700 dark:text-dark-text-primary dark:text-gray-300"
          iconColor="text-gray-400 dark:text-dark-text-muted"
        />

        <StatCard
          label="Disponible"
          value={stats.disponible}
          icon={CheckCircle}
          bgColor="bg-green-50 dark:bg-green-900/20"
          textColor="text-green-700 dark:text-green-300"
          iconColor="text-green-600"
          subtext={stats.total > 0 ? `${((stats.disponible / stats.total) * 100).toFixed(0)}% du total` : undefined}
        />

        <StatCard
          label="Prêté"
          value={stats.prete}
          icon={User}
          bgColor="bg-blue-50 dark:bg-blue-900/20"
          textColor="text-blue-700 dark:text-blue-300"
          iconColor="text-blue-600"
        />

        <StatCard
          label="Maintenance"
          value={stats.maintenance}
          icon={Wrench}
          bgColor="bg-amber-50 dark:bg-amber-900/20"
          textColor="text-amber-700 dark:text-amber-300"
          iconColor="text-amber-600"
        />

        <StatCard
          label="Hors service"
          value={stats.hors_service}
          icon={XCircle}
          bgColor="bg-red-50 dark:bg-red-900/20"
          textColor="text-red-700 dark:text-red-300"
          iconColor="text-red-600"
        />
      </div>

      {/* Alertes */}
      {hasAlerts && (
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
          <div className="flex items-start gap-3 mb-3">
            <AlertTriangle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
            <h3 className="text-sm font-semibold text-orange-900 dark:text-orange-200">
              Alertes révision
            </h3>
          </div>

          <div className="space-y-1 ml-8">
            {tankAlerts.overdue > 0 && (
              <AlertItem
                icon={XCircle}
                iconColor="text-red-600"
                message="Révisions en retard"
                count={tankAlerts.overdue}
              />
            )}
            {tankAlerts.upcoming > 0 && (
              <AlertItem
                icon={AlertCircle}
                iconColor="text-amber-600"
                message="Révisions à planifier (< 6 mois)"
                count={tankAlerts.upcoming}
              />
            )}
          </div>
        </div>
      )}

      {/* Valeurs financières */}
      {hasDepreciation && (
        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow p-4">
          <div className="flex items-center gap-2 mb-4">
            <Euro className="h-5 w-5 text-gray-400 dark:text-dark-text-muted" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text-primary dark:text-white">
              Valeur du matériel
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <p className="text-xs text-gray-500 dark:text-dark-text-muted">Valeur d'achat</p>
              <p className="text-lg font-bold text-gray-900 dark:text-dark-text-primary dark:text-white">
                {formatCurrency(depreciation.totalPurchaseValue)}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500 dark:text-dark-text-muted">Valeur actuelle</p>
              <p className="text-lg font-bold text-green-600 dark:text-green-400">
                {formatCurrency(depreciation.totalCurrentValue)}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500 dark:text-dark-text-muted">Amortissements cumulés</p>
              <p className="text-lg font-bold text-orange-600 dark:text-orange-400">
                {formatCurrency(depreciation.totalAccumulatedDepreciation)}
              </p>
            </div>
          </div>

          <ProgressBar
            percent={depreciation.percentDepreciated}
            label="Taux d'amortissement global"
            color={
              depreciation.percentDepreciated > 75
                ? 'bg-red-500'
                : depreciation.percentDepreciated > 50
                ? 'bg-orange-500'
                : 'bg-green-500'
            }
          />

          <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 dark:text-dark-text-muted">
            <TrendingDown className="h-4 w-4" />
            <span>
              {depreciation.fullyDepreciatedCount} article(s) entièrement amorti(s)
              {depreciation.itemCount > 0 &&
                ` sur ${depreciation.itemCount} (${((depreciation.fullyDepreciatedCount / depreciation.itemCount) * 100).toFixed(0)}%)`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================
// UTILITIES
// ===========================================

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

/**
 * Mini stats pour affichage compact
 */
interface MiniStatsProps {
  stats: InventoryStatsData;
  className?: string;
}

export function MiniStats({ stats, className }: MiniStatsProps) {
  const items = [
    { label: 'Dispo', value: stats.disponible, color: 'text-green-600' },
    { label: 'Prêté', value: stats.prete, color: 'text-blue-600' },
    { label: 'Maint.', value: stats.maintenance, color: 'text-amber-600' },
    { label: 'HS', value: stats.hors_service, color: 'text-red-600' }
  ];

  return (
    <div className={cn('flex items-center gap-4 text-sm', className)}>
      <span className="font-semibold text-gray-900 dark:text-dark-text-primary dark:text-white">
        {stats.total} articles
      </span>
      <span className="text-gray-300 dark:text-dark-text-secondary">|</span>
      {items.map((item, i) => (
        <span key={i} className={cn('font-medium', item.color)}>
          {item.value} {item.label}
        </span>
      ))}
    </div>
  );
}

export default InventoryStats;
