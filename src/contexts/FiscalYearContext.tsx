import { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FiscalYear } from '@/types';
import { UserRole } from '@/types/user.types';
import { FiscalYearService } from '@/services/fiscalYearService';
import { useAuth } from '@/contexts/AuthContext';

// ============================================================================
// INTERFACES
// ============================================================================

interface YearStats {
  revenues: number;
  expenses: number;
  transactionCount: number;
}

interface FiscalYearContextType {
  // Années fiscales
  currentFiscalYear: FiscalYear | null;      // Année ouverte (status='open')
  selectedFiscalYear: FiscalYear | null;     // Année consultée (UI)
  allFiscalYears: FiscalYear[];              // Toutes les années
  previousFiscalYear: FiscalYear | null;     // Année N-1

  // États dérivés
  isArchiveMode: boolean;                    // true si selected !== current
  canModify: boolean;                        // false si clôturée ET user pas admin
  loading: boolean;
  error: Error | null;

  // Actions
  setSelectedFiscalYear: (fy: FiscalYear | null) => void;
  refreshFiscalYears: () => Promise<void>;
  resetToCurrentYear: () => void;

  // Helpers Multi-Année
  getFiscalYearsRange: (startYear: number, endYear: number) => FiscalYear[];
  getCachedStats: (fiscalYearId: string) => Promise<YearStats>;
}

// ============================================================================
// CONTEXT
// ============================================================================

const FiscalYearContext = createContext<FiscalYearContextType | undefined>(undefined);

// ============================================================================
// PROVIDER
// ============================================================================

export function FiscalYearProvider({ children }: { children: ReactNode }) {
  const { clubId, user } = useAuth();
  const queryClient = useQueryClient();

  // État principal
  const [allFiscalYears, setAllFiscalYears] = useState<FiscalYear[]>([]);
  const [currentFiscalYear, setCurrentFiscalYear] = useState<FiscalYear | null>(null);
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<FiscalYear | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Cache statistiques
  const [statsCache, setStatsCache] = useState<Map<string, YearStats>>(new Map());

  // Calculer année précédente
  const previousFiscalYear = useMemo(() => {
    if (!currentFiscalYear) return null;
    return allFiscalYears.find(fy => fy.year === currentFiscalYear.year - 1) || null;
  }, [currentFiscalYear, allFiscalYears]);

  // États dérivés
  const isArchiveMode = selectedFiscalYear?.id !== currentFiscalYear?.id;
  const canModify = computeCanModify(selectedFiscalYear, user?.role);

  // ============================================================================
  // CHARGEMENT INITIAL
  // ============================================================================

  useEffect(() => {
    // ⚠️ CRITICAL: Wait for BOTH clubId AND user to be authenticated
    // Prevents "Missing or insufficient permissions" Firestore errors
    if (!clubId || !user) {
      console.log('⏳ FiscalYear Context: Waiting for authentication...', { clubId: !!clubId, user: !!user });
      return;
    }

    const loadFiscalYears = async () => {
      try {
        setLoading(true);
        setError(null);

        console.log('🔄 FiscalYear Context: Loading fiscal years for clubId:', clubId, 'user:', user.email);
        const years = await FiscalYearService.getFiscalYears(clubId);
        setAllFiscalYears(years);

        const current = years.find(y => y.status === 'open') || null;
        setCurrentFiscalYear(current);
        setSelectedFiscalYear(current);

        console.log('✅ FiscalYear Context: Loaded', years.length, 'years');
        console.log('📅 Current:', current?.year, '| Previous:', years.find(y => y.year === (current?.year || 0) - 1)?.year);
      } catch (err) {
        console.error('❌ FiscalYear Context: Load error', err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    loadFiscalYears();
  }, [clubId, user]);

  // ============================================================================
  // HELPER: RANGE D'ANNÉES
  // ============================================================================

  const getFiscalYearsRange = useCallback((startYear: number, endYear: number): FiscalYear[] => {
    return allFiscalYears.filter(fy => fy.year >= startYear && fy.year <= endYear);
  }, [allFiscalYears]);

  // ============================================================================
  // HELPER: GET CACHED STATS
  // ============================================================================

  const getCachedStats = useCallback(async (fiscalYearId: string): Promise<YearStats> => {
    // Check cache
    if (statsCache.has(fiscalYearId)) {
      console.log('📊 Cache hit for', fiscalYearId);
      return statsCache.get(fiscalYearId)!;
    }

    // Load from Firestore
    const fiscalYear = allFiscalYears.find(fy => fy.id === fiscalYearId);
    if (!fiscalYear) throw new Error('Fiscal year not found: ' + fiscalYearId);

    console.log('📊 Loading stats for', fiscalYearId);
    const transactions = await FiscalYearService.getTransactionsForFiscalYear(clubId!, fiscalYear);

    const stats: YearStats = {
      revenues: transactions.filter(tx => tx.montant > 0).reduce((sum, tx) => sum + tx.montant, 0),
      expenses: transactions.filter(tx => tx.montant < 0).reduce((sum, tx) => sum + Math.abs(tx.montant), 0),
      transactionCount: transactions.length
    };

    // Update cache
    const newCache = new Map(statsCache);
    newCache.set(fiscalYearId, stats);
    setStatsCache(newCache);

    return stats;
  }, [statsCache, allFiscalYears, clubId]);

  // ============================================================================
  // REFRESH
  // ============================================================================

  const refreshFiscalYears = async () => {
    if (!clubId) return;

    try {
      const years = await FiscalYearService.getFiscalYears(clubId);
      setAllFiscalYears(years);

      const current = years.find(y => y.status === 'open') || null;
      setCurrentFiscalYear(current);

      if (selectedFiscalYear) {
        const updated = years.find(y => y.id === selectedFiscalYear.id);
        setSelectedFiscalYear(updated || current);
      }

      // Clear cache
      setStatsCache(new Map());

      console.log('🔄 FiscalYear Context: Refreshed');
    } catch (err) {
      console.error('❌ FiscalYear Context: Refresh error', err);
    }
  };

  // ============================================================================
  // RESET TO CURRENT YEAR
  // ============================================================================

  const resetToCurrentYear = () => {
    setSelectedFiscalYear(currentFiscalYear);
  };

  // ============================================================================
  // SET SELECTED FISCAL YEAR WITH CACHE INVALIDATION
  // ============================================================================

  const handleSetSelectedFiscalYear = (fy: FiscalYear | null) => {
    console.log('🔄 Changement d\'année fiscale, invalidation du cache dashboard...');
    setSelectedFiscalYear(fy);

    // ✅ Invalidation du cache React Query - TOUTES les données du dashboard
    // Car les données dépendent de l'année fiscale sélectionnée
    queryClient.invalidateQueries({ queryKey: ['currentFiscalYear', clubId] });
    queryClient.invalidateQueries({ queryKey: ['previousFiscalYear', clubId] });
    queryClient.invalidateQueries({ queryKey: ['fiscalYearStats', clubId] });
    queryClient.invalidateQueries({ queryKey: ['monthlyBreakdown', clubId] });
    queryClient.invalidateQueries({ queryKey: ['financialSummary', clubId] });
    queryClient.invalidateQueries({ queryKey: ['reconciliationStats', clubId] });
    queryClient.invalidateQueries({ queryKey: ['accountingCodeStats', clubId] });
    queryClient.invalidateQueries({ queryKey: ['yearOverYearData', clubId] });
    queryClient.invalidateQueries({ queryKey: ['balanceCurrent', clubId] });
    queryClient.invalidateQueries({ queryKey: ['balanceSavings', clubId] });
    console.log('✅ Cache dashboard invalidé après changement d\'année fiscale!');
  };

  // ============================================================================
  // CONTEXT VALUE
  // ============================================================================

  const value: FiscalYearContextType = {
    currentFiscalYear,
    selectedFiscalYear,
    allFiscalYears,
    previousFiscalYear,
    isArchiveMode,
    canModify,
    loading,
    error,
    setSelectedFiscalYear: handleSetSelectedFiscalYear,
    refreshFiscalYears,
    resetToCurrentYear,
    getFiscalYearsRange,
    getCachedStats
  };

  return (
    <FiscalYearContext.Provider value={value}>
      {children}
    </FiscalYearContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================

export function useFiscalYear(): FiscalYearContextType {
  const context = useContext(FiscalYearContext);
  if (context === undefined) {
    throw new Error('useFiscalYear must be used within FiscalYearProvider');
  }
  return context;
}

// ============================================================================
// HELPER FUNCTION
// ============================================================================

function computeCanModify(selectedFiscalYear: FiscalYear | null, userRole: UserRole | undefined): boolean {
  if (!selectedFiscalYear) return false;
  if (selectedFiscalYear.status === 'permanently_closed') return false;
  if (selectedFiscalYear.status === 'closed') {
    return userRole === 'admin' || userRole === 'validateur' || userRole === 'superadmin';
  }
  return true;
}
