import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FileSpreadsheet, Loader2, Calendar, FileText, Users, BarChart3, Activity } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { FiscalYearService } from '@/services/fiscalYearService';
import { FiscalYear } from '@/types';
import { User } from '@/types/user.types';
import { UserService } from '@/services/userService';
import { downloadCompteResultatsExcel } from '@/services/reportExcelService';
import { generatePresencePdf } from '@/utils/generatePresencePdf';
import { generateMemberStatsPptx } from '@/services/memberStatsPptxService';
import { generateActivityStatsPptx } from '@/services/activityStatsPptxService';
import { MemberStatsReport } from './MemberStatsReport';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { logger } from '@/utils/logger';

type TabType = 'exports' | 'members';

function toTimeMs(date: Date | undefined): number {
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
}

function fiscalYearStatusRank(status: FiscalYear['status']): number {
  if (status === 'permanently_closed') return 3;
  if (status === 'closed') return 2;
  return 1;
}

function selectPreferredFiscalYearByYear(
  fiscalYears: FiscalYear[],
  targetYear: number
): FiscalYear | null {
  const candidates = fiscalYears.filter(y => y.year === targetYear);
  if (candidates.length === 0) return null;

  const sorted = [...candidates].sort((a, b) => {
    const statusDiff = fiscalYearStatusRank(b.status) - fiscalYearStatusRank(a.status);
    if (statusDiff !== 0) return statusDiff;

    const endDiff = toTimeMs(b.end_date) - toTimeMs(a.end_date);
    if (endDiff !== 0) return endDiff;

    const updatedDiff = toTimeMs(b.updated_at) - toTimeMs(a.updated_at);
    if (updatedDiff !== 0) return updatedDiff;

    const createdDiff = toTimeMs(b.created_at) - toTimeMs(a.created_at);
    if (createdDiff !== 0) return createdDiff;

    return a.id.localeCompare(b.id);
  });

  return sorted[0] || null;
}

export function RapportsPage() {
  const { clubId } = useAuth();
  const [searchParams] = useSearchParams();
  const autoExportLastTokenRef = useRef<string | null>(null);

  // États
  const [activeTab, setActiveTab] = useState<TabType>('exports');
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<FiscalYear | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingMemberStats, setIsGeneratingMemberStats] = useState(false);
  const [isGeneratingActivityStats, setIsGeneratingActivityStats] = useState(false);

  // Charger les années fiscales et les membres au montage
  useEffect(() => {
    void loadFiscalYears();
    void loadUsers();
  }, [clubId]);

  const loadUsers = useCallback(async () => {
    try {
      const loadedUsers = await UserService.getUsers(clubId);
      setUsers(loadedUsers);
    } catch (error) {
      logger.error('Erreur chargement membres:', error);
    }
  }, [clubId]);

  const getRequestedFiscalYear = useCallback((years: FiscalYear[]): FiscalYear | null => {
    const fyIdParam = searchParams.get('fyId');
    if (fyIdParam) {
      return years.find(year => year.id === fyIdParam) || null;
    }

    const yearParam = searchParams.get('year');
    if (!yearParam) return null;

    const requestedYear = Number(yearParam);
    if (!Number.isFinite(requestedYear)) return null;

    return selectPreferredFiscalYearByYear(years, requestedYear);
  }, [searchParams]);

  const loadFiscalYears = useCallback(async () => {
    try {
      const years = await FiscalYearService.getFiscalYears(clubId);
      setFiscalYears(years);

      const requestedFiscalYear = getRequestedFiscalYear(years);
      if (requestedFiscalYear) {
        setSelectedFiscalYear(requestedFiscalYear);
        return;
      }

      // Sélectionner l'année fiscale courante par défaut
      const currentYear = await FiscalYearService.getCurrentFiscalYear(clubId);
      if (currentYear) {
        setSelectedFiscalYear(currentYear);
      } else if (years.length > 0) {
        setSelectedFiscalYear(years[0]);
      }
    } catch (error) {
      logger.error('Erreur chargement années fiscales:', error);
      toast.error('Erreur lors du chargement des années fiscales');
    }
  }, [clubId, getRequestedFiscalYear]);

  // Export Compte de Résultats
  const handleExportCompteResultats = useCallback(async (fiscalYearOverride?: FiscalYear) => {
    const fiscalYearToExport = fiscalYearOverride || selectedFiscalYear;
    if (!fiscalYearToExport) {
      toast.error('Veuillez sélectionner une année fiscale');
      return;
    }

    setIsExporting(true);
    try {
      await downloadCompteResultatsExcel(clubId, fiscalYearToExport);
      toast.success(
        `Fichier "Compta_Calypso_${fiscalYearToExport.year}.xlsx" téléchargé dans votre dossier Téléchargements`,
        { duration: 5000 }
      );
    } catch (error) {
      logger.error('Erreur export Compte de Résultats:', error);
      toast.error('Erreur lors de l\'export du Compte de Résultats');
    } finally {
      setIsExporting(false);
    }
  }, [clubId, selectedFiscalYear]);

  const handleExportButtonClick = useCallback(() => {
    void handleExportCompteResultats();
  }, [handleExportCompteResultats]);

  // Auto-export optionnel via URL:
  // /rapports?autoExport=1&year=2025&token=<run-id>
  // /rapports?autoExport=1&fyId=<id>&token=<run-id>
  useEffect(() => {
    const autoExport = searchParams.get('autoExport') === '1';
    if (!autoExport || isExporting) return;

    // Token allows repeated auto-runs on same mounted page.
    // Without token, run once per page lifetime.
    const token = searchParams.get('token');
    const tokenKey = token || '__once__';
    if (autoExportLastTokenRef.current === tokenKey) return;

    if (fiscalYears.length === 0) return;

    const fyIdParam = searchParams.get('fyId');
    const yearParam = searchParams.get('year');

    let targetFY: FiscalYear | null = null;
    if (fyIdParam) {
      targetFY = fiscalYears.find(y => y.id === fyIdParam) || null;
    } else if (yearParam) {
      const year = Number(yearParam);
      if (Number.isFinite(year)) {
        targetFY = selectPreferredFiscalYearByYear(fiscalYears, year);
      }
    }

    // Fallback: année déjà sélectionnée
    if (!targetFY) {
      targetFY = selectedFiscalYear;
    }
    if (!targetFY) return;

    if (!selectedFiscalYear || selectedFiscalYear.id !== targetFY.id) {
      setSelectedFiscalYear(targetFY);
    }

    autoExportLastTokenRef.current = tokenKey;
    void handleExportCompteResultats(targetFY);
  }, [searchParams, fiscalYears, selectedFiscalYear, isExporting, handleExportCompteResultats]);

  // Générer PPTX rapport d'activités
  const handleGenerateActivityStats = async () => {
    if (!selectedFiscalYear) {
      toast.error('Veuillez sélectionner une année fiscale');
      return;
    }
    setIsGeneratingActivityStats(true);
    try {
      await generateActivityStatsPptx(clubId, selectedFiscalYear.year);
      toast.success('Rapport d\'activités généré avec succès');
    } catch (error) {
      logger.error('Erreur génération PPTX activités:', error);
      toast.error('Erreur lors de la génération du rapport');
    } finally {
      setIsGeneratingActivityStats(false);
    }
  };

  // Générer PPTX statistiques membres
  const handleGenerateMemberStats = async () => {
    if (!selectedFiscalYear) {
      toast.error('Veuillez sélectionner une année fiscale');
      return;
    }
    setIsGeneratingMemberStats(true);
    try {
      await generateMemberStatsPptx(clubId, selectedFiscalYear.year);
      toast.success('Présentation PowerPoint générée avec succès');
    } catch (error) {
      logger.error('Erreur génération PPTX membres:', error);
      toast.error('Erreur lors de la génération du PowerPoint');
    } finally {
      setIsGeneratingMemberStats(false);
    }
  };

  // Générer PDF liste de présences
  const handleGeneratePresencePdf = async () => {
    setIsGeneratingPdf(true);
    try {
      await generatePresencePdf(users);
      toast.success('PDF généré avec succès');
    } catch (error) {
      logger.error('Erreur génération PDF:', error);
      toast.error('Erreur lors de la génération du PDF');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
          Rapports
        </h1>
        <p className="text-gray-600 dark:text-dark-text-secondary mt-1">
          Exports et statistiques
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-dark-border mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('exports')}
            className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
              activeTab === 'exports'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-dark-text-secondary dark:hover:text-dark-text-primary'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Exports Comptables
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
              activeTab === 'members'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-dark-text-secondary dark:hover:text-dark-text-primary'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Statistiques Membres
          </button>
        </nav>
      </div>

      {/* Tab Content: Members */}
      {activeTab === 'members' && (
        <MemberStatsReport />
      )}

      {/* Tab Content: Exports */}
      {activeTab === 'exports' && (
        <>
      {/* Sélection de l'année fiscale */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-4 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Année fiscale
        </h2>

        <select
          value={selectedFiscalYear?.id || ''}
          onChange={(e) => {
            const year = fiscalYears.find(y => y.id === e.target.value);
            setSelectedFiscalYear(year || null);
          }}
          className="w-full md:w-96 px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary"
        >
          <option value="">Sélectionner une année</option>
          {fiscalYears.map(year => (
            <option key={year.id} value={year.id}>
              {year.year} ({format(year.start_date, 'dd/MM/yyyy')} - {format(year.end_date, 'dd/MM/yyyy')})
              {year.status === 'open' && ' - En cours'}
            </option>
          ))}
        </select>
      </div>

      {/* Export Compte de Résultats */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <FileSpreadsheet className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                Compte de Résultats & Bilan
              </h3>
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                Export Excel avec 4 feuilles :
              </p>
              <ul className="text-sm text-gray-600 dark:text-dark-text-secondary mt-2 list-disc list-inside">
                <li><strong>Compte de Résultats</strong> - P&L par groupes de codes comptables</li>
                <li><strong>Bilan</strong> - Actif et Passif avec formules automatiques</li>
                <li><strong>Données</strong> - Cellules éditables pour saisie manuelle</li>
                <li><strong>Transactions</strong> - Liste complète avec numéro, date, contrepartie, compte comptable, liaison et montant</li>
              </ul>
              <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-3">
                Configuration des groupes disponible dans Paramètres → Comptabilité → Groupes de Rapport
              </p>
            </div>
          </div>
          <button
            onClick={handleExportButtonClick}
            disabled={isExporting || !selectedFiscalYear}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Export en cours...
              </>
            ) : (
              <>
                <FileSpreadsheet className="h-4 w-4" />
                Exporter Excel
              </>
            )}
          </button>
        </div>
      </div>

      {/* Rapport d'Activités */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-6 mt-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
              <Activity className="h-6 w-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                Rapport d'Activités
              </h3>
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                Statistiques des activités du club pour l'année fiscale sélectionnée
              </p>
              <ul className="text-sm text-gray-600 dark:text-dark-text-secondary mt-2 list-disc list-inside">
                <li><strong>Événements</strong> — Nombre par type (plongée, piscine, sortie)</li>
                <li><strong>Participations</strong> — Inscriptions, taux de remplissage</li>
                <li><strong>Top participants</strong> — Membres les plus actifs</li>
              </ul>
            </div>
          </div>
          <button
            onClick={handleGenerateActivityStats}
            disabled={isGeneratingActivityStats || !selectedFiscalYear}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGeneratingActivityStats ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Génération...
              </>
            ) : (
              <>
                <FileText className="h-4 w-4" />
                Générer PowerPoint
              </>
            )}
          </button>
        </div>
      </div>

      {/* Statistiques Membres */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-6 mt-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-teal-100 dark:bg-teal-900/30 rounded-lg">
              <Users className="h-6 w-6 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                Statistiques Membres
              </h3>
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                Présentation PowerPoint avec les statistiques détaillées des membres
              </p>
              <ul className="text-sm text-gray-600 dark:text-dark-text-secondary mt-2 list-disc list-inside">
                <li><strong>Démographie</strong> — Répartition par sexe et tranches d'âge</li>
                <li><strong>Brevets</strong> — Niveaux de plongée et encadrement</li>
                <li><strong>Cotisations</strong> — Types d'affiliation</li>
                <li><strong>Fonctions</strong> — Rôles au sein du club</li>
              </ul>
            </div>
          </div>
          <button
            onClick={handleGenerateMemberStats}
            disabled={isGeneratingMemberStats || !selectedFiscalYear}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGeneratingMemberStats ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Génération...
              </>
            ) : (
              <>
                <FileText className="h-4 w-4" />
                Générer PowerPoint
              </>
            )}
          </button>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
