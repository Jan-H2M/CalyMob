/**
 * MemberCategorySelector
 * Reusable component for selecting a membership category and period
 * Used in UserDetailView and CreateUserModal
 */

import { useState, useEffect } from 'react';
import { MembershipSeason, MembershipPeriod, MEMBERSHIP_PERIOD_LABELS } from '@/types/cotisations.types';
import { MembershipSeasonService } from '@/services/membershipSeasonService';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/utils/logger';

interface MemberCategorySelectorProps {
  /** Currently selected category code */
  categoryCode?: string;
  /** Currently selected period */
  period?: MembershipPeriod;
  /** Currently selected season ID */
  seasonId?: string;
  /** Callback when selection changes */
  onChange: (categoryCode: string, period: MembershipPeriod, seasonId: string) => void;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Show compact layout */
  compact?: boolean;
  /** Override label for the category selector */
  categoryLabel?: string;
  /** Show current season label */
  showSeasonInfo?: boolean;
  /** Show selected price summary */
  showSummary?: boolean;
  /** Show period selector */
  showPeriodSelector?: boolean;
}

export function MemberCategorySelector({
  categoryCode,
  period,
  seasonId,
  onChange,
  disabled = false,
  compact = false,
  categoryLabel = 'Catégorie de cotisation',
  showSeasonInfo = true,
  showSummary = true,
  showPeriodSelector = true,
}: MemberCategorySelectorProps) {
  const { clubId } = useAuth();
  const [activeSeason, setActiveSeason] = useState<MembershipSeason | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(categoryCode || '');
  const [selectedPeriod, setSelectedPeriod] = useState<MembershipPeriod>(period || 'jan_dec');

  useEffect(() => {
    setSelectedCategory(categoryCode || '');
  }, [categoryCode]);

  useEffect(() => {
    setSelectedPeriod(period || 'jan_dec');
  }, [period]);

  // Load active season
  useEffect(() => {
    const load = async () => {
      if (!clubId) return;
      try {
        setLoading(true);
        // If a seasonId is provided, load that; otherwise load the active one
        let season: MembershipSeason | null = null;
        if (seasonId) {
          season = await MembershipSeasonService.getSeasonById(clubId, seasonId);
        }
        if (!season) {
          season = await MembershipSeasonService.getActiveSeason(clubId);
        }
        setActiveSeason(season);
      } catch (error) {
        logger.error('Error loading membership season:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [clubId, seasonId]);

  // Find the selected tariff
  const selectedTariff = activeSeason?.tariffs.find(t => t.code === selectedCategory);

  // Get available periods for selected category
  const availablePeriods: MembershipPeriod[] = [];
  if (selectedTariff) {
    if (selectedTariff.price_jan_dec !== null) availablePeriods.push('jan_dec');
    if (selectedTariff.price_sept_dec !== null) availablePeriods.push('sept_dec');
  }

  // Get the price for the selected combination
  const selectedPrice = selectedTariff
    ? (selectedPeriod === 'jan_dec' ? selectedTariff.price_jan_dec : selectedTariff.price_sept_dec)
    : null;

  // Handle category change
  const handleCategoryChange = (code: string) => {
    setSelectedCategory(code);
    const tariff = activeSeason?.tariffs.find(t => t.code === code);
    // Auto-select first available period
    let newPeriod = selectedPeriod;
    if (tariff) {
      if (tariff.price_jan_dec !== null) {
        newPeriod = 'jan_dec';
      } else if (tariff.price_sept_dec !== null) {
        newPeriod = 'sept_dec';
      }
    }
    setSelectedPeriod(newPeriod);
    if (activeSeason) {
      onChange(code, newPeriod, activeSeason.id);
    }
  };

  // Handle period change
  const handlePeriodChange = (p: MembershipPeriod) => {
    setSelectedPeriod(p);
    if (activeSeason) {
      onChange(selectedCategory, p, activeSeason.id);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse h-10 bg-gray-200 dark:bg-dark-bg-tertiary rounded" />
    );
  }

  if (!activeSeason) {
    return (
      <p className="text-sm text-gray-500 dark:text-dark-text-muted italic">
        Aucun tarif de cotisation actif. Configurez les tarifs dans Paramètres → Cotisations.
      </p>
    );
  }

  const sortedTariffs = [...activeSeason.tariffs].sort((a, b) => a.display_order - b.display_order);

  return (
    <div className={compact ? 'space-y-2' : 'space-y-4'}>
      {/* Season info */}
      {showSeasonInfo && (
        <p className="text-xs text-gray-500 dark:text-dark-text-muted">
          Tarif: {activeSeason.label}
        </p>
      )}

      {/* Category selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-muted mb-1">
          {categoryLabel}
        </label>
        <select
          value={selectedCategory}
          onChange={(e) => handleCategoryChange(e.target.value)}
          disabled={disabled}
          className="w-full h-10 px-3 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
        >
          <option value="">— Sélectionnez —</option>
          {sortedTariffs.map((tariff) => (
            <option key={tariff.code} value={tariff.code}>
              {tariff.label}
            </option>
          ))}
        </select>
      </div>

      {/* Period selector (only if category is selected and has multiple periods) */}
      {showPeriodSelector && selectedCategory && availablePeriods.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-muted mb-1">
            Période
          </label>
          <div className="flex gap-3">
            {availablePeriods.map((p) => {
              const price = p === 'jan_dec' ? selectedTariff?.price_jan_dec : selectedTariff?.price_sept_dec;
              return (
                <label
                  key={p}
                  className={`flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer transition-colors ${
                    selectedPeriod === p
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400'
                      : 'border-gray-300 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary'
                  } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <input
                    type="radio"
                    name="membership_period"
                    value={p}
                    checked={selectedPeriod === p}
                    onChange={() => handlePeriodChange(p)}
                    disabled={disabled}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-sm text-gray-900 dark:text-dark-text-primary">
                      {MEMBERSHIP_PERIOD_LABELS[p]}
                    </span>
                    {price !== null && price !== undefined && (
                      <span className="ml-2 text-sm font-medium text-blue-600 dark:text-blue-400">
                        {price.toFixed(2)} €
                      </span>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected price summary */}
      {showSummary && selectedCategory && selectedPrice !== null && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-sm text-blue-800 dark:text-blue-300">
            <span className="font-medium">{selectedTariff?.label}</span>
            {' · '}
            {MEMBERSHIP_PERIOD_LABELS[selectedPeriod]}
            {' · '}
            <span className="font-bold">{selectedPrice.toFixed(2)} €</span>
          </p>
        </div>
      )}
    </div>
  );
}
