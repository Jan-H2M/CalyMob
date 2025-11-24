import React, { useEffect, useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  TrendingUp,
  TrendingDown,
  Euro,
  AlertCircle,
  Calendar,
  Users,
  Receipt,
  Activity,
  Upload,
  Download,
  Plus,
  Link2,
  FileSpreadsheet,
  FileText,
  Loader2,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  Database,
  RefreshCw
} from 'lucide-react';
import { formatMontant, formatDate, formatRelativeDate, cn } from '@/utils/utils';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { FiscalYearService } from '@/services/fiscalYearService';
import { FiscalYear } from '@/types';
import {
  DashboardService,
  FiscalYearStats,
  MonthStats,
  MemberStats,
  EventStats,
  PendingActionsStats,
  ReconciliationStats,
  MonthlyBreakdown,
  FinancialSummary,
  CountStats,
  MonthlyComparison
} from '@/services/dashboardService';

export function TableauBord() {
  const navigate = useNavigate();
  const { clubId } = useAuth();
  const queryClient = useQueryClient();

  // ✅ React Query: Charger l'année fiscale courante
  const { data: currentFY, isLoading: currentFYLoading } = useQuery({
    queryKey: ['currentFiscalYear', clubId],
    queryFn: () => FiscalYearService.getCurrentFiscalYear(clubId!),
    enabled: !!clubId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // ✅ React Query: Charger l'année fiscale précédente
  const { data: previousFY, isLoading: previousFYLoading } = useQuery({
    queryKey: ['previousFiscalYear', clubId],
    queryFn: () => FiscalYearService.getPreviousFiscalYear(clubId!),
    enabled: !!clubId,
    staleTime: 5 * 60 * 1000,
  });

  // ✅ React Query: Calculer solde compte courant
  const { data: balanceCurrent = 0, isLoading: balanceCurrentLoading } = useQuery({
    queryKey: ['balanceCurrent', clubId],
    queryFn: () => FiscalYearService.calculateCurrentBalance(clubId!, 'current'),
    enabled: !!clubId && !!currentFY,
    staleTime: 5 * 60 * 1000,
  });

  // ✅ React Query: Calculer solde compte épargne
  const { data: balanceSavings = 0, isLoading: balanceSavingsLoading } = useQuery({
    queryKey: ['balanceSavings', clubId],
    queryFn: () => FiscalYearService.calculateCurrentBalance(clubId!, 'savings'),
    enabled: !!clubId && !!currentFY,
    staleTime: 5 * 60 * 1000,
  });

  // ✅ React Query: Statistiques de l'année fiscale
  const { data: fiscalYearStats, isLoading: fiscalYearStatsLoading } = useQuery({
    queryKey: ['fiscalYearStats', clubId, currentFY?.id],
    queryFn: () => DashboardService.getFiscalYearStats(clubId!, currentFY!),
    enabled: !!clubId && !!currentFY,
    staleTime: 5 * 60 * 1000,
  });

  // ✅ React Query: Répartition mensuelle
  const { data: monthlyBreakdown = [], isLoading: monthlyBreakdownLoading } = useQuery({
    queryKey: ['monthlyBreakdown', clubId, currentFY?.id],
    queryFn: () => DashboardService.getMonthlyBreakdown(clubId!, currentFY!),
    enabled: !!clubId && !!currentFY,
    staleTime: 5 * 60 * 1000,
  });

  // ✅ React Query: Résumé financier
  const { data: financialSummary, isLoading: financialSummaryLoading } = useQuery({
    queryKey: ['financialSummary', clubId, currentFY?.id],
    queryFn: () => DashboardService.getFinancialSummary(clubId!, currentFY!),
    enabled: !!clubId && !!currentFY,
    staleTime: 5 * 60 * 1000,
  });

  // ✅ React Query: Statistiques du mois en cours
  const { data: monthStats, isLoading: monthStatsLoading } = useQuery({
    queryKey: ['currentMonthStats', clubId],
    queryFn: () => DashboardService.getCurrentMonthStats(clubId!),
    enabled: !!clubId,
    staleTime: 5 * 60 * 1000,
  });

  // ✅ React Query: Statistiques des membres
  const { data: memberStats, isLoading: memberStatsLoading } = useQuery({
    queryKey: ['memberStats', clubId],
    queryFn: () => DashboardService.getMemberStats(clubId!),
    enabled: !!clubId,
    staleTime: 5 * 60 * 1000,
  });

  // ℹ️ eventStats supprimée - carte "Activités à venir" retirée du dashboard

  // ✅ React Query: Actions en attente
  const { data: pendingActions, isLoading: pendingActionsLoading } = useQuery({
    queryKey: ['pendingActions', clubId],
    queryFn: () => DashboardService.getPendingActions(clubId!),
    enabled: !!clubId,
    staleTime: 5 * 60 * 1000,
  });

  // ✅ React Query: Taux de réconciliation
  const { data: reconciliationStats, isLoading: reconciliationStatsLoading } = useQuery({
    queryKey: ['reconciliationStats', clubId, currentFY?.id],
    queryFn: () => DashboardService.getReconciliationStats(clubId!),
    enabled: !!clubId && !!currentFY,
    staleTime: 5 * 60 * 1000,
  });

  // ✅ React Query: Stats codes comptables
  const { data: accountingCodeStats, isLoading: accountingCodeStatsLoading } = useQuery({
    queryKey: ['accountingCodeStats', clubId, currentFY?.id],
    queryFn: () => DashboardService.getAccountingCodeStats(clubId!),
    enabled: !!clubId && !!currentFY,
    staleTime: 5 * 60 * 1000,
  });

  // ✅ React Query: Statistiques de comptage
  const { data: countStats, isLoading: countStatsLoading } = useQuery({
    queryKey: ['countStats', clubId],
    queryFn: () => DashboardService.getCountStats(clubId!),
    enabled: !!clubId,
    staleTime: 5 * 60 * 1000,
  });

  // ✅ React Query: Comparaison année par année
  const { data: yearOverYearData = [], isLoading: yearOverYearLoading } = useQuery({
    queryKey: ['yearOverYearData', clubId, currentFY?.id, previousFY?.id],
    queryFn: () => DashboardService.getYearOverYearComparison(clubId!, currentFY!, previousFY!),
    enabled: !!clubId && !!currentFY && !!previousFY,
    staleTime: 5 * 60 * 1000,
  });

  // ✅ Loading global: combine tous les loading states
  const loading = currentFYLoading || previousFYLoading || balanceCurrentLoading ||
    balanceSavingsLoading || fiscalYearStatsLoading || monthlyBreakdownLoading ||
    financialSummaryLoading || monthStatsLoading || memberStatsLoading ||
    pendingActionsLoading || reconciliationStatsLoading ||
    accountingCodeStatsLoading || countStatsLoading || yearOverYearLoading;

  // Calculer un domaine Y intelligent pour éviter que les outliers écrasent le graphique
  const yMaxDomain = useMemo(() => {
    if (yearOverYearData.length === 0) return 10000; // Valeur par défaut

    const allValues: number[] = [];
    yearOverYearData.forEach(month => {
      if (month.annee_precedente?.revenus) allValues.push(Math.abs(month.annee_precedente.revenus));
      if (month.annee_precedente?.depenses) allValues.push(Math.abs(month.annee_precedente.depenses));
      if (month.annee_courante?.revenus) allValues.push(Math.abs(month.annee_courante.revenus));
      if (month.annee_courante?.depenses) allValues.push(Math.abs(month.annee_courante.depenses));
    });

    if (allValues.length === 0) return 10000;

    // Trier les valeurs
    allValues.sort((a, b) => a - b);

    // Calculer Q1, Q3 et IQR (Interquartile Range)
    const q1Index = Math.floor(allValues.length * 0.25);
    const q3Index = Math.floor(allValues.length * 0.75);
    const q1 = allValues[q1Index] || 0;
    const q3 = allValues[q3Index] || 0;
    const iqr = q3 - q1;

    // Limite supérieure: Q3 + 1.5 * IQR (formule standard pour outliers)
    const upperLimit = q3 + 1.5 * iqr;

    // Ajouter une marge de 10% pour l'esthétique
    return upperLimit * 1.1;
  }, [yearOverYearData]);

  // ✅ Les données sont maintenant chargées automatiquement par React Query ci-dessus
  // Plus besoin de useEffect manuel - React Query gère tout!

  // ✅ Fonction pour rafraîchir manuellement toutes les données
  const handleRefreshDashboard = async () => {
    try {
      console.log('🔄 Rafraîchissement manuel du dashboard...');

      // Invalider toutes les queries en une seule fois
      await queryClient.invalidateQueries();

      console.log('✅ Dashboard rafraîchi!');
    } catch (error) {
      console.error('❌ Erreur lors du rafraîchissement:', error);
    }
  };

  // Fonction de debug pour vérifier les calculs
  const handleDebugCalculations = async () => {
    if (!clubId || !currentFY) {
      console.log('❌ Pas de clubId ou d\'année fiscale');
      return;
    }

    console.log('=== DEBUG CALCULS DASHBOARD ===');
    console.log('Club ID:', clubId);
    console.log('Année fiscale:', currentFY.year);
    console.log('Période:', formatDate(currentFY.start_date), '→', formatDate(currentFY.end_date));
    console.log('');
    console.log('Compte courant:', currentFY.account_numbers?.bank_current);
    console.log('Compte épargne:', currentFY.account_numbers?.bank_savings);
    console.log('');

    // Charger TOUTES les transactions
    const { collection, query, where, getDocs, Timestamp } = await import('firebase/firestore');
    const { db } = await import('@/lib/firebase');
    const { startOfDay, endOfDay } = await import('date-fns');

    const txRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
    const q = query(
      txRef,
      where('date_execution', '>=', Timestamp.fromDate(startOfDay(currentFY.start_date))),
      where('date_execution', '<=', Timestamp.fromDate(endOfDay(currentFY.end_date)))
    );

    const snapshot = await getDocs(q);
    console.log(`📊 Total transactions dans l'année fiscale: ${snapshot.size}`);

    const normalizedCurrentAccount = currentFY.account_numbers?.bank_current?.replace(/\s/g, '');
    const normalizedSavingsAccount = currentFY.account_numbers?.bank_savings?.replace(/\s/g, '');

    let totalRevenus = 0;
    let totalDepenses = 0;
    let countRevenus = 0;
    let countDepenses = 0;
    let countParents = 0;
    let countCurrentAccount = 0;
    let countSavingsAccount = 0;
    let countOtherAccounts = 0;

    const monthlyData: Record<string, { revenus: number; depenses: number }> = {};

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const montant = data.montant || 0;
      const normalizedTxAccount = data.numero_compte?.replace(/\s/g, '') || '';

      // Compter les parents
      if (data.is_parent) {
        countParents++;
        return;
      }

      // Compter par compte
      if (normalizedTxAccount === normalizedCurrentAccount) {
        countCurrentAccount++;
      } else if (normalizedTxAccount === normalizedSavingsAccount) {
        countSavingsAccount++;
        return; // Ne pas compter dans les stats
      } else {
        countOtherAccounts++;
        console.log('⚠️ Compte inconnu:', data.numero_compte, '- Montant:', montant);
      }

      // Stats mensuelles
      const date = data.date_execution?.toDate();
      if (date) {
        const moisKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyData[moisKey]) {
          monthlyData[moisKey] = { revenus: 0, depenses: 0 };
        }
        if (montant > 0) {
          monthlyData[moisKey].revenus += montant;
        } else if (montant < 0) {
          monthlyData[moisKey].depenses += Math.abs(montant);
        }
      }

      // Ne compter que le compte courant
      if (normalizedTxAccount === normalizedCurrentAccount) {
        if (montant > 0) {
          totalRevenus += montant;
          countRevenus++;
        } else if (montant < 0) {
          totalDepenses += Math.abs(montant);
          countDepenses++;
        }
      }
    });

    console.log('');
    console.log('🔢 RÉPARTITION PAR COMPTE:');
    console.log(`  - Compte courant: ${countCurrentAccount} transactions`);
    console.log(`  - Compte épargne: ${countSavingsAccount} transactions (ignorées)`);
    console.log(`  - Autres comptes: ${countOtherAccounts} transactions`);
    console.log(`  - Parents (ventilés): ${countParents} transactions (ignorées)`);

    console.log('');
    console.log('💰 TOTAUX CALCULÉS (compte courant uniquement):');
    console.log(`  Revenus: ${formatMontant(totalRevenus)} (${countRevenus} transactions)`);
    console.log(`  Dépenses: ${formatMontant(totalDepenses)} (${countDepenses} transactions)`);
    console.log(`  Solde net: ${formatMontant(totalRevenus - totalDepenses)}`);

    console.log('');
    console.log('📈 DONNÉES AFFICHÉES:');
    console.log(`  fiscalYearStats.total_revenus: ${formatMontant(fiscalYearStats?.total_revenus || 0)}`);
    console.log(`  fiscalYearStats.total_depenses: ${formatMontant(fiscalYearStats?.total_depenses || 0)}`);
    console.log(`  fiscalYearStats.solde_net: ${formatMontant(fiscalYearStats?.solde_net || 0)}`);

    console.log('');
    console.log('📅 RÉPARTITION MENSUELLE:');
    Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([mois, data]) => {
        console.log(`  ${mois}: Revenus ${formatMontant(data.revenus)} | Dépenses ${formatMontant(data.depenses)}`);
      });

    console.log('');
    console.log('✅ Vérification terminée - Voir détails ci-dessus');
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text-primary">Tableau de bord</h1>
          <p className="text-gray-600 dark:text-dark-text-secondary mt-1">
            Vue d'ensemble de la situation financière du club
            {currentFY && (
              <span className="ml-2">
                • Année fiscale {currentFY.year} ({formatDate(currentFY.start_date)} → {formatDate(currentFY.end_date)})
              </span>
            )}
          </p>
        </div>

        {/* Boutons d'action */}
        <div className="flex items-center gap-3">
          {/* Bouton Debug Calculs */}
          <button
            onClick={handleDebugCalculations}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 border border-orange-300 dark:border-orange-800 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
          >
            <AlertCircle className="h-4 w-4" />
            Debug Calculs
          </button>

          {/* Bouton Actualiser */}
          <button
            onClick={handleRefreshDashboard}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-dark-text-primary bg-white dark:bg-dark-bg-secondary border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Actualiser
          </button>
        </div>
      </div>

      {/* Statistiques rapides */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Statistiques rapides</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Nombre de transactions */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600 dark:text-dark-text-secondary">Transactions</span>
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Database className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400 dark:text-dark-text-muted" />
              </div>
            ) : (
              <div>
                <div className="text-3xl font-bold text-gray-900 dark:text-dark-text-primary">
                  {countStats?.nombre_transactions || 0}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Année fiscale en cours
                </p>
              </div>
            )}
          </div>

          {/* Nombre d'activités */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600 dark:text-dark-text-secondary">Activités</span>
              <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                <Calendar className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400 dark:text-dark-text-muted" />
              </div>
            ) : (
              <div>
                <div className="text-3xl font-bold text-gray-900 dark:text-dark-text-primary">
                  {countStats?.nombre_evenements || 0}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Total dans la base
                </p>
              </div>
            )}
          </div>

          {/* Nombre de dépenses */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600 dark:text-dark-text-secondary">Dépenses</span>
              <div className="p-2 bg-purple-100 rounded-lg">
                <Receipt className="h-5 w-5 text-purple-600" />
              </div>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400 dark:text-dark-text-muted" />
              </div>
            ) : (
              <div>
                <div className="text-3xl font-bold text-gray-900 dark:text-dark-text-primary">
                  {countStats?.nombre_depenses || 0}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Demandes de remboursement
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cartes de statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Soldes bancaires */}
        <div className="bg-gradient-to-br from-calypso-blue to-blue-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-100">Soldes bancaires</span>
            <Euro className="h-5 w-5 text-blue-200" />
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-white" />
            </div>
          ) : currentFY ? (
            <div className="space-y-3">
              {/* Année fiscale */}
              <div className="text-xs text-blue-100 pb-3 border-b border-blue-400/30">
                <div className="flex items-center gap-2">
                  <Calendar className="h-3 w-3" />
                  <span>Année fiscale {currentFY.year}</span>
                </div>
                <div className="mt-1">
                  {formatDate(currentFY.start_date)} → {formatDate(currentFY.end_date)}
                </div>
              </div>

              {/* Compte Courant */}
              <div>
                <div className="text-xs text-blue-100 mb-1">Solde compte courant</div>
                <div className="text-2xl font-bold">
                  {formatMontant(balanceCurrent)}
                </div>
                <div className="text-xs text-blue-100 mt-1 opacity-80">
                  {currentFY.account_numbers?.bank_current && (
                    <span>{currentFY.account_numbers.bank_current}</span>
                  )}
                </div>
              </div>

              {/* Compte Épargne */}
              <div className="border-t border-blue-400/30 pt-3">
                <div className="text-xs text-blue-100 mb-1">Compte épargne</div>
                <div className="text-2xl font-bold">
                  {formatMontant(balanceSavings)}
                </div>
                <div className="text-xs text-blue-100 mt-1 opacity-80">
                  {currentFY.account_numbers?.bank_savings && (
                    <span>{currentFY.account_numbers.bank_savings}</span>
                  )}
                </div>
              </div>

              {/* Disclaimer */}
              <div className="border-t border-blue-400/30 pt-3 text-xs text-blue-100 opacity-70 italic">
                Calculé sur base des extraits bancaires importés
              </div>
            </div>
          ) : (
            <div className="text-sm text-blue-100">
              Aucune année fiscale active
            </div>
          )}
        </div>

        {/* Revenus mensuels */}
        <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm p-6 border border-gray-200 dark:border-dark-border">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-gray-600 dark:text-dark-text-secondary">Revenus mensuels</span>
            <TrendingUp className="h-5 w-5 text-green-500 dark:text-green-400" />
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400 dark:text-dark-text-muted" />
            </div>
          ) : monthlyBreakdown.length > 0 ? (
            <div>
              <table className="w-full text-xs">
                <thead className="border-b dark:border-dark-border">
                  <tr className="text-left text-xs text-gray-500 dark:text-dark-text-muted">
                    <th className="pb-2">Mois</th>
                    <th className="pb-2 text-right">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyBreakdown.map((month) => (
                    <tr key={month.mois} className="border-b border-gray-100 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary">
                      <td className="py-1 text-gray-700 dark:text-dark-text-primary">{month.mois_nom}</td>
                      <td className="py-1 text-right font-medium text-green-600 dark:text-green-400">
                        {formatMontant(month.revenus)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-green-50 dark:bg-green-900/20 font-semibold">
                    <td className="py-2 text-gray-900 dark:text-dark-text-primary">Total</td>
                    <td className="py-2 text-right text-green-700 dark:text-green-400">
                      {formatMontant(monthlyBreakdown.reduce((sum, m) => sum + m.revenus, 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-gray-400 dark:text-dark-text-muted text-center py-4">
              Aucune donnée disponible
            </div>
          )}
        </div>

        {/* Dépenses mensuelles */}
        <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm p-6 border border-gray-200 dark:border-dark-border">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-gray-600 dark:text-dark-text-secondary">Dépenses mensuelles</span>
            <TrendingDown className="h-5 w-5 text-red-500" />
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400 dark:text-dark-text-muted" />
            </div>
          ) : monthlyBreakdown.length > 0 ? (
            <div>
              <table className="w-full text-xs">
                <thead className="border-b">
                  <tr className="text-left text-xs text-gray-500 dark:text-dark-text-muted">
                    <th className="pb-2">Mois</th>
                    <th className="pb-2 text-right">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyBreakdown.map((month) => (
                    <tr key={month.mois} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-1 text-gray-700">{month.mois_nom}</td>
                      <td className="py-1 text-right font-medium text-red-600 dark:text-red-400">
                        {formatMontant(month.depenses)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-red-50 font-semibold">
                    <td className="py-2 text-gray-900 dark:text-dark-text-primary">Total</td>
                    <td className="py-2 text-right text-red-700">
                      {formatMontant(monthlyBreakdown.reduce((sum, m) => sum + m.depenses, 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-gray-400 text-center py-4">
              Aucune donnée disponible
            </div>
          )}
        </div>

        {/* Résumé financier */}
        <div className="bg-gradient-to-br from-calypso-blue to-blue-600 rounded-xl shadow-sm p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-blue-100">Résumé financier</span>
            <Activity className="h-5 w-5 text-blue-200" />
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-white" />
            </div>
          ) : financialSummary ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center pb-2 border-b border-blue-400/30">
                <span className="text-blue-100">Solde de début</span>
                <span className="font-semibold">{formatMontant(financialSummary.solde_debut)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-blue-100">+ Revenus</span>
                <span className="font-semibold text-green-300">{formatMontant(financialSummary.total_revenus)}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-blue-400/30">
                <span className="text-blue-100">- Dépenses</span>
                <span className="font-semibold text-red-300">{formatMontant(financialSummary.total_depenses)}</span>
              </div>
              <div className={`flex justify-between items-center font-medium pb-2 border-b border-blue-400/30 ${
                (financialSummary.total_revenus - financialSummary.total_depenses) >= 0 ? 'text-green-300' : 'text-orange-300'
              }`}>
                <span>= Évolution de l'année</span>
                <span className="text-base flex items-center gap-1">
                  {(financialSummary.total_revenus - financialSummary.total_depenses) >= 0 ? (
                    <ArrowUp className="h-4 w-4" />
                  ) : (
                    <ArrowDown className="h-4 w-4" />
                  )}
                  {formatMontant(financialSummary.total_revenus - financialSummary.total_depenses)}
                </span>
              </div>
              <div className="flex justify-between items-center font-medium">
                <span className="text-blue-100">Solde compte courant</span>
                <span className={`text-lg ${financialSummary.solde_avant_epargne >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                  {formatMontant(financialSummary.solde_avant_epargne)}
                </span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-blue-400/30">
                <span className="text-blue-100">Compte épargne</span>
                <span className="font-semibold">{formatMontant(financialSummary.solde_epargne)}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t-2 border-blue-400/50 text-lg font-bold">
                <span>Solde total</span>
                <span>{formatMontant(financialSummary.solde_total)}</span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-blue-100 text-center py-4">
              Aucune année fiscale active
            </div>
          )}
        </div>
      </div>

      {/* Statistiques de l'année fiscale */}
      {fiscalYearStats && currentFY && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Revenus de l'année */}
          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl shadow-sm p-6 border border-green-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-green-800">Revenus de l'année fiscale</span>
              <Euro className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div className="text-2xl font-bold text-green-700">
              {formatMontant(fiscalYearStats.total_revenus)}
            </div>
            <p className="text-xs text-green-600 mt-1">
              {fiscalYearStats.nombre_revenus} transactions • Année {currentFY.year}
            </p>
          </div>

          {/* Dépenses de l'année */}
          <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl shadow-sm p-6 border border-red-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-red-800">Dépenses de l'année fiscale</span>
              <Euro className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div className="text-2xl font-bold text-red-700">
              {formatMontant(fiscalYearStats.total_depenses)}
            </div>
            <p className="text-xs text-red-600 mt-1">
              {fiscalYearStats.nombre_depenses} transactions • Année {currentFY.year}
            </p>
          </div>

          {/* Évolution de l'année fiscale */}
          <div className={`bg-gradient-to-br rounded-xl shadow-sm p-6 border ${
            fiscalYearStats.solde_net >= 0
              ? 'from-blue-50 to-blue-100 border-blue-200'
              : 'from-orange-50 to-orange-100 border-orange-200'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm font-medium ${
                fiscalYearStats.solde_net >= 0 ? 'text-blue-800' : 'text-orange-800'
              }`}>
                Évolution de l'année
              </span>
              <Activity className={`h-5 w-5 ${
                fiscalYearStats.solde_net >= 0 ? 'text-blue-600' : 'text-orange-600'
              }`} />
            </div>
            <div className={`text-2xl font-bold ${
              fiscalYearStats.solde_net >= 0 ? 'text-blue-700' : 'text-orange-700'
            }`}>
              {formatMontant(fiscalYearStats.solde_net)}
            </div>
            <p className={`text-xs mt-1 flex items-center gap-1 ${
              fiscalYearStats.solde_net >= 0 ? 'text-blue-600' : 'text-orange-600'
            }`}>
              {fiscalYearStats.solde_net >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {fiscalYearStats.solde_net >= 0 ? 'Croissance' : 'Recul'} • {fiscalYearStats.nombre_transactions} transactions
            </p>
          </div>
        </div>
      )}

      {/* Statistiques contextuelles */}
      {(reconciliationStats || accountingCodeStats) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Taux de réconciliation */}
          {reconciliationStats && (
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600 dark:text-dark-text-secondary">Taux de réconciliation</span>
                <Activity className="h-5 w-5 text-calypso-blue" />
              </div>
              <div className={`text-2xl font-bold ${
                reconciliationStats.taux_reconciliation >= 80 ? 'text-green-600' :
                reconciliationStats.taux_reconciliation >= 50 ? 'text-orange-600' :
                'text-red-600'
              }`}>
                {reconciliationStats.taux_reconciliation.toFixed(1)}%
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {reconciliationStats.transactions_reconciliees} sur {reconciliationStats.total_transactions} transactions
              </p>
            </div>
          )}

          {/* Codes comptables assignés */}
          {accountingCodeStats && (
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600 dark:text-dark-text-secondary">Codes comptables assignés</span>
                <FileText className="h-5 w-5 text-calypso-blue" />
              </div>
              <div className={`text-2xl font-bold ${
                accountingCodeStats.taux_codification >= 80 ? 'text-green-600' :
                accountingCodeStats.taux_codification >= 50 ? 'text-orange-600' :
                'text-red-600'
              }`}>
                {accountingCodeStats.taux_codification.toFixed(1)}%
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {accountingCodeStats.transactions_avec_code} / {accountingCodeStats.total_transactions} transactions ({accountingCodeStats.taux_codification.toFixed(0)}%)
              </p>
            </div>
          )}
        </div>
      )}

      {/* Comparaison année par année */}
      {yearOverYearData.length > 0 && currentFY && previousFY && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-4">
            Évolution mensuelle : {currentFY.year} vs {previousFY.year}
          </h2>
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <ResponsiveContainer width="100%" height={800}>
              <ComposedChart
                data={yearOverYearData}
                margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="mois_nom"
                  tick={{ fill: '#6b7280', fontSize: 12 }}
                  stroke="#9ca3af"
                />
                <YAxis
                  domain={[0, yMaxDomain]}
                  tick={{ fill: '#6b7280', fontSize: 12 }}
                  stroke="#9ca3af"
                  tickFormatter={(value) => `${(value / 1000).toFixed(0)}k €`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                    padding: '0.75rem'
                  }}
                  formatter={(value: number, name: string) => {
                    const label = name.includes('revenus') ? 'Revenus' : 'Dépenses';
                    const year = name.includes(currentFY.year.toString()) ? currentFY.year : previousFY.year;
                    return [formatMontant(value), `${label} ${year}`];
                  }}
                />
                <Legend
                  verticalAlign="top"
                  height={36}
                  content={(props) => {
                    const { payload } = props;
                    if (!payload) return null;

                    return (
                      <div className="flex justify-center items-center gap-6 mb-2">
                        {payload.map((entry: any, index: number) => {
                          const isBar = entry.value === `revenus_${previousFY.year}` || entry.value === `depenses_${previousFY.year}`;
                          let label = entry.value;

                          if (entry.value === `revenus_${currentFY.year}`) label = `Revenus ${currentFY.year} (en cours)`;
                          if (entry.value === `revenus_${previousFY.year}`) label = `Revenus ${previousFY.year}`;
                          if (entry.value === `depenses_${currentFY.year}`) label = `Dépenses ${currentFY.year} (en cours)`;
                          if (entry.value === `depenses_${previousFY.year}`) label = `Dépenses ${previousFY.year}`;

                          return (
                            <div key={`legend-${index}`} className="flex items-center gap-2">
                              {isBar ? (
                                <div
                                  style={{ backgroundColor: entry.color }}
                                  className="w-3 h-3"
                                />
                              ) : (
                                <div
                                  style={{ backgroundColor: entry.color }}
                                  className="w-3 h-3 rounded-full"
                                />
                              )}
                              <span className="text-sm text-gray-700 dark:text-dark-text-primary">{label}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }}
                />
                {/* Barres pour année précédente (données complètes) */}
                <Bar
                  dataKey="annee_precedente.revenus"
                  name={`revenus_${previousFY.year}`}
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="annee_precedente.depenses"
                  name={`depenses_${previousFY.year}`}
                  fill="#ef4444"
                  radius={[4, 4, 0, 0]}
                />
                {/* Lignes pour année courante (en cours) */}
                <Line
                  type="monotone"
                  dataKey="annee_courante.revenus"
                  name={`revenus_${currentFY.year}`}
                  stroke="#10b981"
                  strokeWidth={3}
                  dot={{ fill: '#10b981', r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="annee_courante.depenses"
                  name={`depenses_${currentFY.year}`}
                  stroke="#ef4444"
                  strokeWidth={3}
                  dot={{ fill: '#ef4444', r: 5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}