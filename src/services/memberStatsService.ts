/**
 * Member Statistics Service
 *
 * Provides comprehensive member statistics for CalyCompta including:
 * - Member counts by year (total, new, left)
 * - Contribution revenue from bank transactions
 * - Retention rates and growth trends
 * - Membership type breakdown by diving level
 *
 * @module memberStatsService
 */

import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { logger } from '@/utils/logger';
import { Membre, TransactionBancaire, FiscalYear } from '@/types';

// ============================================================
// TYPES & INTERFACES
// ============================================================

/**
 * Contribution account codes for member fees (revenue)
 */
export const CONTRIBUTION_CODES = [
  '730-00-711', // Cotisation plongeur
  '730-00-712', // Cotisation instructeur
  '730-00-713', // Cotisation administrateur
  '730-00-714', // Cotisation nageur
  '730-00-715', // Cotisation autre (ex 2ème appartenance)
  '730-00-716', // Cotisation autre (ex 2ème appartenance)
] as const;

/**
 * Labels for contribution codes
 */
export const CONTRIBUTION_CODE_LABELS: Record<string, string> = {
  '730-00-711': 'Plongeurs',
  '730-00-712': 'Instructeurs',
  '730-00-713': 'Administrateurs',
  '730-00-714': 'Nageurs',
  '730-00-715': 'Autres',
  '730-00-716': 'Autres (2)',
};

/**
 * Statistics for a single year
 */
export interface YearlyMemberStats {
  year: number;
  totalActiveMembers: number;     // Active members at end of year
  totalInactiveMembers: number;   // Inactive members
  newMembers: number;             // Members created this year
  leftMembers: number;            // Members who became inactive this year
  netGrowth: number;              // newMembers - leftMembers
  growthPercentage: number;       // Net growth as percentage
}

/**
 * Contribution breakdown by code
 */
export interface ContributionByCode {
  code: string;
  label: string;
  total: number;
  count: number;
  averageAmount: number;
}

/**
 * Monthly contribution data
 */
export interface MonthlyContribution {
  month: number;        // 1-12
  monthLabel: string;   // "Janvier", "Février", etc.
  amount: number;
  count: number;
}

/**
 * Complete contribution revenue statistics
 */
export interface ContributionStats {
  year: number;
  totalRevenue: number;
  totalTransactions: number;
  byCode: ContributionByCode[];
  monthlyBreakdown: MonthlyContribution[];
  averagePerMember: number;
}

/**
 * Member level/type breakdown
 */
export interface MemberTypeBreakdown {
  level: string;
  levelCode: string;
  count: number;
  percentage: number;
  activeCount: number;
  inactiveCount: number;
}

/**
 * Retention statistics
 */
export interface RetentionStats {
  year: number;
  startOfYearActive: number;
  endOfYearActive: number;
  newMembers: number;
  leftMembers: number;
  retentionRate: number;        // Percentage
  churnRate: number;            // 100 - retentionRate
}

/**
 * Complete member statistics
 */
export interface MemberStatistics {
  fiscalYear: number;
  generatedAt: Date;

  // Overview
  currentStats: YearlyMemberStats;
  previousYearStats?: YearlyMemberStats;

  // Contributions
  contributions: ContributionStats;

  // Breakdown
  memberTypeBreakdown: MemberTypeBreakdown[];

  // Retention
  retention: RetentionStats;

  // Multi-year trends (last 5 years)
  yearlyTrends: YearlyMemberStats[];
  retentionTrends: RetentionStats[];
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

const MONTH_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

/**
 * Get the start and end dates for a fiscal year
 * Defaults to calendar year if no fiscal year defined
 */
function getYearBoundaries(year: number, fiscalYear?: FiscalYear): { start: Date; end: Date } {
  if (fiscalYear && fiscalYear.year === year) {
    return {
      start: fiscalYear.start_date instanceof Date
        ? fiscalYear.start_date
        : (fiscalYear.start_date as any).toDate?.() ?? new Date(year, 0, 1),
      end: fiscalYear.end_date instanceof Date
        ? fiscalYear.end_date
        : (fiscalYear.end_date as any).toDate?.() ?? new Date(year, 11, 31, 23, 59, 59)
    };
  }

  return {
    start: new Date(year, 0, 1),
    end: new Date(year, 11, 31, 23, 59, 59)
  };
}

/**
 * Parse date from various formats (Timestamp, Date, string)
 */
function parseDate(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date) return value;

  if (value instanceof Timestamp || (typeof value === 'object' && 'toDate' in (value as any))) {
    return (value as Timestamp).toDate();
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

/**
 * Normalize diving level to a standard code
 */
function normalizeDivingLevel(level?: string): { level: string; code: string } {
  if (!level) return { level: 'Non défini', code: 'ND' };

  const normalized = level.toLowerCase().trim();

  // Map common patterns
  if (normalized.includes('moniteur') && normalized.includes('fédéral')) return { level: 'Moniteur Fédéral', code: 'MF' };
  if (normalized.includes('moniteur') && normalized.includes('club')) return { level: 'Moniteur Club', code: 'MC' };
  if (normalized.includes('moniteur')) return { level: 'Moniteur', code: 'M' };
  if (normalized.includes('assistant moniteur')) return { level: 'Assistant Moniteur', code: 'AM' };
  if (normalized.includes('initiateur')) return { level: 'Initiateur', code: 'INI' };
  if (normalized.includes('plongeur 4') || normalized.includes('4*')) return { level: 'Plongeur 4*', code: '4' };
  if (normalized.includes('plongeur 3') || normalized.includes('3*')) return { level: 'Plongeur 3*', code: '3' };
  if (normalized.includes('plongeur 2') || normalized.includes('2*')) return { level: 'Plongeur 2*', code: '2' };
  if (normalized.includes('plongeur 1') || normalized.includes('1*')) return { level: 'Plongeur 1*', code: '1' };
  if (normalized.includes('baptême') || normalized.includes('initiation')) return { level: 'Initiation', code: 'INI' };

  return { level: level, code: level.substring(0, 3).toUpperCase() };
}

// ============================================================
// MAIN SERVICE FUNCTIONS
// ============================================================

/**
 * Get all members for a club
 */
async function getAllMembers(clubId: string): Promise<Membre[]> {
  try {
    const membresRef = collection(db, 'clubs', clubId, 'members');
    const q = query(membresRef, orderBy('nom'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: parseDate(data.createdAt) || parseDate(data.created_at) || new Date(),
        updatedAt: parseDate(data.updatedAt) || parseDate(data.updated_at) || new Date(),
        date_adhesion: parseDate(data.date_adhesion),
        cotisation_validite: parseDate(data.cotisation_validite),
      } as Membre;
    });
  } catch (error) {
    logger.error('Error fetching members for stats:', error);
    throw error;
  }
}

/**
 * Get contribution transactions for a date range
 */
async function getContributionTransactions(
  clubId: string,
  startDate: Date,
  endDate: Date
): Promise<TransactionBancaire[]> {
  try {
    const transactionsRef = collection(db, 'clubs', clubId, 'bank_transactions');

    // Query transactions with contribution codes in the date range
    const q = query(
      transactionsRef,
      where('date_execution', '>=', Timestamp.fromDate(startDate)),
      where('date_execution', '<=', Timestamp.fromDate(endDate))
    );

    const snapshot = await getDocs(q);

    // Filter for contribution codes (client-side due to Firestore limitations)
    return snapshot.docs
      .map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          date_execution: parseDate(data.date_execution) || new Date(),
        } as TransactionBancaire;
      })
      .filter(tx =>
        tx.code_comptable && CONTRIBUTION_CODES.includes(tx.code_comptable as any)
      );
  } catch (error) {
    logger.error('Error fetching contribution transactions:', error);
    throw error;
  }
}

/**
 * Calculate yearly statistics for a specific year
 */
export function calculateYearlyStats(
  members: Membre[],
  year: number,
  fiscalYear?: FiscalYear
): YearlyMemberStats {
  const { start, end } = getYearBoundaries(year, fiscalYear);
  const previousYearEnd = new Date(start);
  previousYearEnd.setDate(previousYearEnd.getDate() - 1);

  // Members created in this year
  const newMembers = members.filter(m => {
    const created = m.createdAt || (m as any).created_at;
    const createdDate = parseDate(created);
    return createdDate && createdDate >= start && createdDate <= end;
  });

  // Active members at end of year
  const activeAtEnd = members.filter(m =>
    m.member_status === 'active' || m.member_status === undefined
  );

  const inactiveMembers = members.filter(m =>
    m.member_status === 'inactive' || m.member_status === 'archived'
  );

  // Members who became inactive this year (approximation based on updatedAt)
  const leftThisYear = members.filter(m => {
    if (m.member_status !== 'inactive' && m.member_status !== 'archived') return false;

    const updated = m.updatedAt || (m as any).updated_at;
    const updatedDate = parseDate(updated);
    return updatedDate && updatedDate >= start && updatedDate <= end;
  });

  const netGrowth = newMembers.length - leftThisYear.length;
  const previousTotal = activeAtEnd.length - netGrowth;
  const growthPercentage = previousTotal > 0
    ? (netGrowth / previousTotal) * 100
    : 0;

  return {
    year,
    totalActiveMembers: activeAtEnd.length,
    totalInactiveMembers: inactiveMembers.length,
    newMembers: newMembers.length,
    leftMembers: leftThisYear.length,
    netGrowth,
    growthPercentage: Math.round(growthPercentage * 10) / 10,
  };
}

/**
 * Calculate contribution statistics
 */
export function calculateContributionStats(
  transactions: TransactionBancaire[],
  year: number,
  totalActiveMembers: number
): ContributionStats {
  // Group by code
  const byCode: Map<string, { total: number; count: number }> = new Map();
  CONTRIBUTION_CODES.forEach(code => byCode.set(code, { total: 0, count: 0 }));

  // Monthly breakdown
  const monthly: Map<number, { amount: number; count: number }> = new Map();
  for (let m = 1; m <= 12; m++) monthly.set(m, { amount: 0, count: 0 });

  // Process transactions
  let totalRevenue = 0;
  transactions.forEach(tx => {
    const amount = Math.abs(tx.montant); // Contributions are positive
    totalRevenue += amount;

    // By code
    const code = tx.code_comptable || '';
    if (byCode.has(code)) {
      const current = byCode.get(code)!;
      byCode.set(code, { total: current.total + amount, count: current.count + 1 });
    }

    // By month
    const txDate = parseDate(tx.date_execution);
    if (txDate) {
      const month = txDate.getMonth() + 1;
      const current = monthly.get(month)!;
      monthly.set(month, { amount: current.amount + amount, count: current.count + 1 });
    }
  });

  return {
    year,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalTransactions: transactions.length,
    byCode: CONTRIBUTION_CODES.map(code => {
      const data = byCode.get(code)!;
      return {
        code,
        label: CONTRIBUTION_CODE_LABELS[code] || code,
        total: Math.round(data.total * 100) / 100,
        count: data.count,
        averageAmount: data.count > 0 ? Math.round((data.total / data.count) * 100) / 100 : 0,
      };
    }).filter(c => c.count > 0),
    monthlyBreakdown: Array.from(monthly.entries()).map(([month, data]) => ({
      month,
      monthLabel: MONTH_LABELS[month - 1],
      amount: Math.round(data.amount * 100) / 100,
      count: data.count,
    })),
    averagePerMember: totalActiveMembers > 0
      ? Math.round((totalRevenue / totalActiveMembers) * 100) / 100
      : 0,
  };
}

/**
 * Calculate member type breakdown by diving level
 */
export function calculateMemberTypeBreakdown(members: Membre[]): MemberTypeBreakdown[] {
  const breakdown: Map<string, { code: string; active: number; inactive: number }> = new Map();

  members.forEach(m => {
    const level = m.plongeur_niveau || m.niveau_plongee;
    const { level: normalizedLevel, code } = normalizeDivingLevel(level);

    if (!breakdown.has(normalizedLevel)) {
      breakdown.set(normalizedLevel, { code, active: 0, inactive: 0 });
    }

    const current = breakdown.get(normalizedLevel)!;
    if (m.member_status === 'active' || m.member_status === undefined) {
      current.active++;
    } else {
      current.inactive++;
    }
  });

  const total = members.length;
  return Array.from(breakdown.entries())
    .map(([level, data]) => ({
      level,
      levelCode: data.code,
      count: data.active + data.inactive,
      percentage: total > 0 ? Math.round(((data.active + data.inactive) / total) * 1000) / 10 : 0,
      activeCount: data.active,
      inactiveCount: data.inactive,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Calculate retention rate for a year
 */
export function calculateRetention(
  currentYearStats: YearlyMemberStats,
  previousYearStats?: YearlyMemberStats
): RetentionStats {
  const startOfYearActive = previousYearStats?.totalActiveMembers || currentYearStats.totalActiveMembers;
  const endOfYearActive = currentYearStats.totalActiveMembers;
  const newMembers = currentYearStats.newMembers;
  const leftMembers = currentYearStats.leftMembers;

  // Retention = (End - New) / Start * 100
  // This shows how many existing members stayed
  const retained = endOfYearActive - newMembers;
  const retentionRate = startOfYearActive > 0
    ? (retained / startOfYearActive) * 100
    : 100;

  return {
    year: currentYearStats.year,
    startOfYearActive,
    endOfYearActive,
    newMembers,
    leftMembers,
    retentionRate: Math.min(100, Math.max(0, Math.round(retentionRate * 10) / 10)),
    churnRate: Math.min(100, Math.max(0, Math.round((100 - retentionRate) * 10) / 10)),
  };
}

// ============================================================
// MAIN PUBLIC API
// ============================================================

/**
 * Get complete member statistics for a club and fiscal year
 *
 * @param clubId - The club identifier
 * @param year - The fiscal year to analyze
 * @param yearsOfHistory - Number of years to include in trends (default: 5)
 * @returns Complete member statistics
 */
export async function getMemberStatistics(
  clubId: string,
  year: number,
  yearsOfHistory: number = 5
): Promise<MemberStatistics> {
  try {
    logger.debug(`Calculating member statistics for club ${clubId}, year ${year}`);

    // Fetch all members
    const allMembers = await getAllMembers(clubId);
    logger.debug(`Found ${allMembers.length} members`);

    // Get year boundaries
    const { start, end } = getYearBoundaries(year);

    // Get contribution transactions
    const contributions = await getContributionTransactions(clubId, start, end);
    logger.debug(`Found ${contributions.length} contribution transactions`);

    // Calculate current year stats
    const currentStats = calculateYearlyStats(allMembers, year);

    // Calculate previous year stats
    const previousYearStats = calculateYearlyStats(allMembers, year - 1);

    // Calculate contribution stats
    const contributionStats = calculateContributionStats(
      contributions,
      year,
      currentStats.totalActiveMembers
    );

    // Calculate member type breakdown
    const memberTypeBreakdown = calculateMemberTypeBreakdown(allMembers);

    // Calculate retention
    const retention = calculateRetention(currentStats, previousYearStats);

    // Calculate multi-year trends
    const yearlyTrends: YearlyMemberStats[] = [];
    const retentionTrends: RetentionStats[] = [];

    for (let y = year - yearsOfHistory + 1; y <= year; y++) {
      const stats = calculateYearlyStats(allMembers, y);
      yearlyTrends.push(stats);

      const prevStats = calculateYearlyStats(allMembers, y - 1);
      retentionTrends.push(calculateRetention(stats, prevStats));
    }

    return {
      fiscalYear: year,
      generatedAt: new Date(),
      currentStats,
      previousYearStats,
      contributions: contributionStats,
      memberTypeBreakdown,
      retention,
      yearlyTrends,
      retentionTrends,
    };
  } catch (error) {
    logger.error('Error calculating member statistics:', error);
    throw error;
  }
}

/**
 * Get just the contribution revenue for a year (lighter query)
 */
export async function getContributionRevenue(
  clubId: string,
  year: number
): Promise<ContributionStats> {
  const { start, end } = getYearBoundaries(year);
  const transactions = await getContributionTransactions(clubId, start, end);
  return calculateContributionStats(transactions, year, 0);
}

/**
 * Get quick overview stats (for dashboard widgets)
 */
export async function getMemberOverview(clubId: string): Promise<{
  totalActive: number;
  totalInactive: number;
  newThisYear: number;
  contributionTotal: number;
}> {
  const year = new Date().getFullYear();
  const allMembers = await getAllMembers(clubId);
  const stats = calculateYearlyStats(allMembers, year);

  const { start, end } = getYearBoundaries(year);
  const contributions = await getContributionTransactions(clubId, start, end);
  const contributionTotal = contributions.reduce((sum, tx) => sum + Math.abs(tx.montant), 0);

  return {
    totalActive: stats.totalActiveMembers,
    totalInactive: stats.totalInactiveMembers,
    newThisYear: stats.newMembers,
    contributionTotal: Math.round(contributionTotal * 100) / 100,
  };
}
