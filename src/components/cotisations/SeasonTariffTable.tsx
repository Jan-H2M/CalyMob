/**
 * SeasonTariffTable
 * Displays ALL membership seasons side-by-side in one table
 * Fixed "Catégorie" column on the left, then 2 price columns per season (newest first)
 */

import { MembershipSeason, MembershipTariff } from '@/types/cotisations.types';

interface SeasonTariffTableProps {
  /** All seasons to display (will be sorted newest first) */
  seasons: MembershipSeason[];
}

export function SeasonTariffTable({ seasons }: SeasonTariffTableProps) {
  if (seasons.length === 0) return null;

  // Sort seasons: newest first
  const sortedSeasons = [...seasons].sort((a, b) => b.start_year - a.start_year);

  // Build unified category list from all seasons (by code, preserving order from newest)
  const categoryMap = new Map<string, { code: string; label: string; footnote_ref?: string; display_order: number }>();
  for (const season of sortedSeasons) {
    for (const tariff of season.tariffs) {
      if (!categoryMap.has(tariff.code)) {
        categoryMap.set(tariff.code, {
          code: tariff.code,
          label: tariff.label,
          footnote_ref: tariff.footnote_ref,
          display_order: tariff.display_order,
        });
      }
    }
  }
  const categories = Array.from(categoryMap.values()).sort((a, b) => a.display_order - b.display_order);

  // Helper: find tariff for a category in a season
  const getTariff = (season: MembershipSeason, code: string): MembershipTariff | undefined => {
    return season.tariffs.find(t => t.code === code);
  };

  // Price cell renderer
  const PriceCell = ({ value }: { value: number | null | undefined }) => {
    if (value === null || value === undefined) {
      return <span className="text-gray-300 dark:text-gray-600">–</span>;
    }
    return <>{value.toFixed(2)} €</>;
  };

  return (
    <div className="overflow-x-auto">
      <table className="divide-y divide-gray-200 dark:divide-dark-border">
        <thead>
          {/* Row 1: Season year headers (spanning 2 cols each) */}
          <tr className="bg-gray-50 dark:bg-dark-bg-tertiary">
            <th
              rowSpan={2}
              className="w-px whitespace-nowrap px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider border-r border-gray-200 dark:border-dark-border sticky left-0 bg-gray-50 dark:bg-dark-bg-tertiary z-10"
            >
              Catégorie
            </th>
            {sortedSeasons.map((season) => (
              <th
                key={season.id}
                colSpan={2}
                className="px-4 py-2 text-center text-sm font-semibold text-gray-900 dark:text-dark-text-primary border-l border-gray-200 dark:border-dark-border"
              >
                <div className="flex items-center justify-center gap-2">
                  {season.label}
                  {season.is_active && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      Actif
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr>
          {/* Row 2: Jan→Déc / Sept→Déc+1 sub-headers for each season */}
          <tr className="bg-gray-50 dark:bg-dark-bg-tertiary">
            {sortedSeasons.map((season) => (
              <th key={`${season.id}-jan`} colSpan={1} className="px-3 py-2 text-right text-[11px] font-medium text-gray-400 dark:text-dark-text-muted uppercase tracking-wider border-l border-gray-200 dark:border-dark-border">
                Jan → Déc
              </th>
            )).flatMap((el, i) => [
              el,
              <th key={`${sortedSeasons[i].id}-sept`} className="px-3 py-2 text-right text-[11px] font-medium text-gray-400 dark:text-dark-text-muted uppercase tracking-wider">
                Sept → Déc+1
              </th>
            ])}
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-dark-bg-secondary divide-y divide-gray-200 dark:divide-dark-border">
          {categories.map((cat) => (
            <tr key={cat.code} className="hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary transition-colors">
              {/* Fixed category column */}
              <td className="w-px whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-dark-text-primary border-r border-gray-200 dark:border-dark-border sticky left-0 bg-white dark:bg-dark-bg-secondary">
                {cat.label}
              </td>
              {/* Price columns for each season */}
              {sortedSeasons.map((season) => {
                const tariff = getTariff(season, cat.code);
                return (
                  <td key={`${season.id}-${cat.code}-jan`} colSpan={1} className="px-3 py-3 text-sm text-right font-medium text-gray-900 dark:text-dark-text-primary border-l border-gray-200 dark:border-dark-border">
                    <PriceCell value={tariff?.price_jan_dec ?? null} />
                  </td>
                );
              }).flatMap((el, i) => {
                const tariff = getTariff(sortedSeasons[i], cat.code);
                return [
                  el,
                  <td key={`${sortedSeasons[i].id}-${cat.code}-sept`} className="px-3 py-3 text-sm text-right font-medium text-gray-900 dark:text-dark-text-primary">
                    <PriceCell value={tariff?.price_sept_dec ?? null} />
                  </td>
                ];
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
