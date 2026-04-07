/**
 * Member Statistics Report Component
 *
 * Dashboard displaying comprehensive member statistics:
 * - KPI cards (total, new, left, retention)
 * - Contribution revenue chart (monthly)
 * - Member type breakdown (pie chart)
 * - Retention trends (line chart)
 * - Year over year comparison
 *
 * @component MemberStatsReport
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/utils/logger';
import { FiscalYear } from '@/types';
import { FiscalYearService } from '@/services/fiscalYearService';
import {
  getMemberStatistics,
  MemberStatistics,
  YearlyMemberStats,
  ContributionStats,
  MemberTypeBreakdown,
  RetentionStats,
} from '@/services/memberStatsService';
import {
  Users,
  UserPlus,
  UserMinus,
  TrendingUp,
  TrendingDown,
  Euro,
  Calendar,
  Loader2,
  AlertCircle,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from 'recharts';
import toast from 'react-hot-toast';

// ============================================================
// CONSTANTS
// ============================================================

const PIE_COLORS = [
  '#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8',
  '#82ca9d', '#ffc658', '#ff7c43', '#665191', '#a05195',
];

// ============================================================
// SUB-COMPONENTS
// ============================================================

interface KPICardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  trend?: number;
  trendLabel?: string;
  format?: 'number' | 'percentage' | 'currency';
}

function KPICard({ title, value, icon, trend, trendLabel, format = 'number' }: KPICardProps) {
  const formatValue = () => {
    if (format === 'currency') {
      return `€ ${typeof value === 'number' ? value.toLocaleString('fr-BE') : value}`;
    }
    if (format === 'percentage') {
      return `${value}%`;
    }
    return typeof value === 'number' ? value.toLocaleString('fr-BE') : value;
  };

  const trendColor = trend !== undefined
    ? trend >= 0 ? 'text-green-600' : 'text-red-600'
    : '';

  const TrendIcon = trend !== undefined
    ? trend >= 0 ? ArrowUp : ArrowDown
    : null;

  return (
    <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow p-4 border border-gray-200 dark:border-dark-border">
      <div className="flex items-center justify-between">
        <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
          {icon}
        </div>
        {trend !== undefined && TrendIcon && (
          <div className={`flex items-center gap-1 text-sm ${trendColor}`}>
            <TrendIcon className="w-4 h-4" />
            <span>{Math.abs(trend)}%</span>
          </div>
        )}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
          {formatValue()}
        </p>
        <p className="text-sm text-gray-500 dark:text-dark-text-secondary mt-1">
          {title}
        </p>
        {trendLabel && (
          <p className="text-xs text-gray-400 dark:text-dark-text-tertiary mt-0.5">
            {trendLabel}
          </p>
        )}
      </div>
    </div>
  );
}

interface ChartCardProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

function ChartCard({ title, children, className = '' }: ChartCardProps) {
  return (
    <div className={`bg-white dark:bg-dark-bg-secondary rounded-lg shadow p-4 border border-gray-200 dark:border-dark-border ${className}`}>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-4">
        {title}
      </h3>
      {children}
    </div>
  );
}

// ============================================================
// CHART COMPONENTS
// ============================================================

interface ContributionChartProps {
  data: ContributionStats;
}

function ContributionChart({ data }: ContributionChartProps) {
  const chartData = data.monthlyBreakdown.map(m => ({
    name: m.monthLabel.substring(0, 3),
    montant: m.amount,
    transactions: m.count,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
        <XAxis
          dataKey="name"
          tick={{ fill: 'currentColor' }}
          className="text-gray-600 dark:text-gray-400"
        />
        <YAxis
          tickFormatter={(v) => `€${v}`}
          tick={{ fill: 'currentColor' }}
          className="text-gray-600 dark:text-gray-400"
        />
        <Tooltip
          formatter={(value: number) => [`€ ${value.toLocaleString('fr-BE')}`, 'Montant']}
          labelFormatter={(label) => `Mois: ${label}`}
          contentStyle={{
            backgroundColor: 'var(--tooltip-bg, #fff)',
            border: '1px solid var(--tooltip-border, #e5e7eb)',
            borderRadius: '8px',
          }}
        />
        <Bar
          dataKey="montant"
          fill="#0088FE"
          radius={[4, 4, 0, 0]}
          name="Cotisations"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

interface MemberTypePieProps {
  data: MemberTypeBreakdown[];
}

function MemberTypePie({ data }: MemberTypePieProps) {
  // Take top 7 + "Autres" for the rest
  const displayData = data.length > 7
    ? [
        ...data.slice(0, 7),
        {
          level: 'Autres',
          levelCode: 'AUT',
          count: data.slice(7).reduce((sum, d) => sum + d.count, 0),
          percentage: data.slice(7).reduce((sum, d) => sum + d.percentage, 0),
          activeCount: data.slice(7).reduce((sum, d) => sum + d.activeCount, 0),
          inactiveCount: data.slice(7).reduce((sum, d) => sum + d.inactiveCount, 0),
        }
      ]
    : data;

  const chartData = displayData.map(d => ({
    name: d.level,
    value: d.count,
    percentage: d.percentage,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          dataKey="value"
          label={({ name, percentage }) => `${name} (${percentage}%)`}
          labelLine={false}
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number, name: string) => [value, 'Membres']}
          contentStyle={{
            backgroundColor: 'var(--tooltip-bg, #fff)',
            border: '1px solid var(--tooltip-border, #e5e7eb)',
            borderRadius: '8px',
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

interface RetentionChartProps {
  data: RetentionStats[];
}

function RetentionChart({ data }: RetentionChartProps) {
  const chartData = data.map(d => ({
    year: d.year.toString(),
    retention: d.retentionRate,
    churn: d.churnRate,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
        <XAxis
          dataKey="year"
          tick={{ fill: 'currentColor' }}
          className="text-gray-600 dark:text-gray-400"
        />
        <YAxis
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          tick={{ fill: 'currentColor' }}
          className="text-gray-600 dark:text-gray-400"
        />
        <Tooltip
          formatter={(value: number, name: string) => [
            `${value.toFixed(1)}%`,
            name === 'retention' ? 'Rétention' : 'Churn'
          ]}
          contentStyle={{
            backgroundColor: 'var(--tooltip-bg, #fff)',
            border: '1px solid var(--tooltip-border, #e5e7eb)',
            borderRadius: '8px',
          }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="retention"
          stroke="#00C49F"
          strokeWidth={2}
          dot={{ fill: '#00C49F', strokeWidth: 2 }}
          name="Rétention"
        />
        <Line
          type="monotone"
          dataKey="churn"
          stroke="#FF8042"
          strokeWidth={2}
          dot={{ fill: '#FF8042', strokeWidth: 2 }}
          name="Churn"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

interface YearlyTrendChartProps {
  data: YearlyMemberStats[];
}

function YearlyTrendChart({ data }: YearlyTrendChartProps) {
  const chartData = data.map(d => ({
    year: d.year.toString(),
    actifs: d.totalActiveMembers,
    nouveaux: d.newMembers,
    partis: d.leftMembers,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
        <XAxis
          dataKey="year"
          tick={{ fill: 'currentColor' }}
          className="text-gray-600 dark:text-gray-400"
        />
        <YAxis
          tick={{ fill: 'currentColor' }}
          className="text-gray-600 dark:text-gray-400"
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--tooltip-bg, #fff)',
            border: '1px solid var(--tooltip-border, #e5e7eb)',
            borderRadius: '8px',
          }}
        />
        <Legend />
        <Bar dataKey="actifs" fill="#0088FE" name="Membres actifs" radius={[4, 4, 0, 0]} />
        <Bar dataKey="nouveaux" fill="#00C49F" name="Nouveaux" radius={[4, 4, 0, 0]} />
        <Bar dataKey="partis" fill="#FF8042" name="Partis" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function MemberStatsReport() {
  const { clubId } = useAuth();

  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<MemberStatistics | null>(null);
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  // Load fiscal years on mount
  useEffect(() => {
    loadFiscalYears();
  }, [clubId]);

  // Load stats when year changes
  useEffect(() => {
    if (clubId && selectedYear) {
      loadStats();
    }
  }, [clubId, selectedYear]);

  const loadFiscalYears = async () => {
    try {
      const years = await FiscalYearService.getFiscalYears(clubId);
      setFiscalYears(years);

      // Set current year as default
      const currentFy = await FiscalYearService.getCurrentFiscalYear(clubId);
      if (currentFy) {
        setSelectedYear(currentFy.year);
      }
    } catch (err) {
      logger.error('Error loading fiscal years:', err);
    }
  };

  const loadStats = async () => {
    setLoading(true);
    setError(null);

    try {
      const memberStats = await getMemberStatistics(clubId, selectedYear, 5);
      setStats(memberStats);
    } catch (err) {
      logger.error('Error loading member stats:', err);
      setError('Erreur lors du chargement des statistiques');
      toast.error('Erreur lors du chargement des statistiques');
    } finally {
      setLoading(false);
    }
  };

  // Calculate trend percentage vs previous year
  const getTrend = (current: number, previous: number): number => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  // Render loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600 dark:text-dark-text-secondary">
          Chargement des statistiques...
        </span>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <AlertCircle className="w-8 h-8 text-red-500" />
        <span className="ml-2 text-red-600">{error}</span>
      </div>
    );
  }

  if (!stats) return null;

  const { currentStats, previousYearStats, contributions, memberTypeBreakdown, retention, yearlyTrends, retentionTrends } = stats;

  return (
    <div className="space-y-6">
      {/* Header with Year Selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary">
            Statistiques Membres
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-gray-500" />
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="px-3 py-2 bg-white dark:bg-dark-bg-tertiary border border-gray-300 dark:border-dark-border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          >
            {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Membres Actifs"
          value={currentStats.totalActiveMembers}
          icon={<Users className="w-5 h-5 text-blue-600" />}
          trend={previousYearStats ? getTrend(currentStats.totalActiveMembers, previousYearStats.totalActiveMembers) : undefined}
          trendLabel={previousYearStats ? `vs ${selectedYear - 1}` : undefined}
        />
        <KPICard
          title="Nouveaux Membres"
          value={currentStats.newMembers}
          icon={<UserPlus className="w-5 h-5 text-green-600" />}
          trend={previousYearStats ? getTrend(currentStats.newMembers, previousYearStats.newMembers) : undefined}
          trendLabel={`Cette année`}
        />
        <KPICard
          title="Membres Partis"
          value={currentStats.leftMembers}
          icon={<UserMinus className="w-5 h-5 text-red-600" />}
          trend={previousYearStats ? -getTrend(currentStats.leftMembers, previousYearStats.leftMembers) : undefined}
          trendLabel={`Cette année`}
        />
        <KPICard
          title="Taux de Rétention"
          value={retention.retentionRate}
          format="percentage"
          icon={retention.retentionRate >= 90
            ? <TrendingUp className="w-5 h-5 text-green-600" />
            : <TrendingDown className="w-5 h-5 text-orange-600" />
          }
          trendLabel={`Churn: ${retention.churnRate}%`}
        />
      </div>

      {/* Contribution Revenue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ChartCard title={`Cotisations ${selectedYear}`}>
            <div className="flex items-center gap-4 mb-4 text-sm text-gray-600 dark:text-dark-text-secondary">
              <div className="flex items-center gap-2">
                <Euro className="w-4 h-4" />
                <span>Total: € {contributions.totalRevenue.toLocaleString('fr-BE')}</span>
              </div>
              <div className="flex items-center gap-2">
                <span>{contributions.totalTransactions} transactions</span>
              </div>
              <div className="flex items-center gap-2">
                <span>Moyenne/membre: € {contributions.averagePerMember.toLocaleString('fr-BE')}</span>
              </div>
            </div>
            <ContributionChart data={contributions} />
          </ChartCard>
        </div>

        <div>
          <ChartCard title="Cotisations par Type">
            <div className="space-y-3">
              {contributions.byCode.map((item) => (
                <div key={item.code} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-dark-border last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                      {item.label}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-dark-text-tertiary">
                      {item.count} transactions
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900 dark:text-dark-text-primary">
                      € {item.total.toLocaleString('fr-BE')}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-dark-text-tertiary">
                      moy. € {item.averageAmount.toLocaleString('fr-BE')}
                    </p>
                  </div>
                </div>
              ))}
              {contributions.byCode.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-dark-text-tertiary text-center py-4">
                  Aucune cotisation enregistrée
                </p>
              )}
            </div>
          </ChartCard>
        </div>
      </div>

      {/* Member Breakdown & Retention */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Répartition par Niveau">
          {memberTypeBreakdown.length > 0 ? (
            <>
              <MemberTypePie data={memberTypeBreakdown} />
              <div className="mt-4 grid grid-cols-2 gap-2">
                {memberTypeBreakdown.slice(0, 6).map((item, index) => (
                  <div key={item.level} className="flex items-center gap-2 text-sm">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                    />
                    <span className="text-gray-600 dark:text-dark-text-secondary truncate">
                      {item.level}: {item.count}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-500 dark:text-dark-text-tertiary text-center py-8">
              Aucune donnée de niveau disponible
            </p>
          )}
        </ChartCard>

        <ChartCard title="Évolution Rétention (5 ans)">
          {retentionTrends.length > 0 ? (
            <RetentionChart data={retentionTrends} />
          ) : (
            <p className="text-sm text-gray-500 dark:text-dark-text-tertiary text-center py-8">
              Données insuffisantes pour afficher les tendances
            </p>
          )}
        </ChartCard>
      </div>

      {/* Yearly Trends */}
      <ChartCard title="Évolution du Nombre de Membres (5 ans)">
        {yearlyTrends.length > 0 ? (
          <YearlyTrendChart data={yearlyTrends} />
        ) : (
          <p className="text-sm text-gray-500 dark:text-dark-text-tertiary text-center py-8">
            Données insuffisantes pour afficher les tendances
          </p>
        )}
      </ChartCard>

      {/* Summary Table */}
      <ChartCard title="Détail par Année">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-dark-border">
                <th className="text-left py-2 font-medium text-gray-600 dark:text-dark-text-secondary">Année</th>
                <th className="text-right py-2 font-medium text-gray-600 dark:text-dark-text-secondary">Actifs</th>
                <th className="text-right py-2 font-medium text-gray-600 dark:text-dark-text-secondary">Nouveaux</th>
                <th className="text-right py-2 font-medium text-gray-600 dark:text-dark-text-secondary">Partis</th>
                <th className="text-right py-2 font-medium text-gray-600 dark:text-dark-text-secondary">Croissance</th>
                <th className="text-right py-2 font-medium text-gray-600 dark:text-dark-text-secondary">Rétention</th>
              </tr>
            </thead>
            <tbody>
              {yearlyTrends.map((year, index) => (
                <tr
                  key={year.year}
                  className={`border-b border-gray-100 dark:border-dark-border ${
                    year.year === selectedYear ? 'bg-blue-50 dark:bg-blue-900/10' : ''
                  }`}
                >
                  <td className="py-2 font-medium text-gray-900 dark:text-dark-text-primary">
                    {year.year}
                  </td>
                  <td className="text-right py-2 text-gray-700 dark:text-dark-text-secondary">
                    {year.totalActiveMembers}
                  </td>
                  <td className="text-right py-2 text-green-600">
                    +{year.newMembers}
                  </td>
                  <td className="text-right py-2 text-red-600">
                    -{year.leftMembers}
                  </td>
                  <td className={`text-right py-2 ${year.netGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {year.netGrowth >= 0 ? '+' : ''}{year.netGrowth} ({year.growthPercentage}%)
                  </td>
                  <td className="text-right py-2 text-gray-700 dark:text-dark-text-secondary">
                    {retentionTrends[index]?.retentionRate?.toFixed(1) || '-'}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {/* Footer */}
      <div className="text-xs text-gray-400 dark:text-dark-text-tertiary text-center">
        Généré le {stats.generatedAt.toLocaleString('fr-BE')} • Données basées sur {currentStats.totalActiveMembers + currentStats.totalInactiveMembers} membres
      </div>
    </div>
  );
}
