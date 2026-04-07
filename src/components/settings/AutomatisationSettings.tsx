import React, { useState, useEffect } from 'react';
import { logger } from '@/utils/logger';
import {
  Brain,
  Sparkles,
  Loader2,
  Sliders,
  Save,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  CreditCard,
  AlertTriangle,
  TrendingUp,
  Calendar,
  ExternalLink,
  HelpCircle,
  Hash,
  Users,
  Ban
} from 'lucide-react';
import { SettingsHeader } from './SettingsHeader';
import { FirebaseSettingsService } from '@/services/firebaseSettingsService';
import { CategorizationSettings, DEFAULT_CATEGORIZATION_SETTINGS } from '@/types/settings.types';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

interface CategorizationStats {
  totalPatterns: number;
  patternsByType: { iban: number; keyword: number; counterparty: number };
  knownIbans: number;
  antiPatterns: number;
  topPatterns: { keyword: string; code: string; useCount: number }[];
  recentCorrections: { from: string; to: string; count: number }[];
  activeSeasonalBoosts: string[];
}

export function AutomatisationSettings() {
  const { clubId, user } = useAuth();

  // Dashboard stats state
  const [stats, setStats] = useState<CategorizationStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Collapsible sections
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Categorization settings state
  const [categorizationSettings, setCategorizationSettings] = useState<CategorizationSettings>(DEFAULT_CATEGORIZATION_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsChanged, setSettingsChanged] = useState(false);

  // Load stats and settings on mount
  useEffect(() => {
    const loadData = async () => {
      if (!clubId) return;

      try {
        // Load stats and settings in parallel
        const [statsData, settings] = await Promise.all([
          FirebaseSettingsService.loadCategorizationStats(clubId),
          FirebaseSettingsService.loadCategorizationSettings(clubId)
        ]);

        setStats(statsData);
        setCategorizationSettings(settings);
      } catch (error) {
        logger.error('Error loading categorization data:', error);
      } finally {
        setStatsLoading(false);
        setSettingsLoading(false);
      }
    };

    loadData();
  }, [clubId]);

  // Handle settings change
  const handleSettingChange = <K extends keyof CategorizationSettings>(
    key: K,
    value: CategorizationSettings[K]
  ) => {
    setCategorizationSettings(prev => ({ ...prev, [key]: value }));
    setSettingsChanged(true);
  };

  // Save settings
  const handleSaveSettings = async () => {
    if (!clubId) return;
    setSettingsSaving(true);
    try {
      await FirebaseSettingsService.saveCategorizationSettings(clubId, categorizationSettings, user?.uid);
      setSettingsChanged(false);
      toast.success('Paramètres de catégorisation sauvegardés');
    } catch (error) {
      logger.error('Error saving categorization settings:', error);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSettingsSaving(false);
    }
  };

  // Reset to defaults
  const handleResetSettings = () => {
    setCategorizationSettings(DEFAULT_CATEGORIZATION_SETTINGS);
    setSettingsChanged(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-7xl mx-auto">
        <SettingsHeader
          breadcrumb={['Paramètres', 'Catégorisation Intelligente']}
          title="Catégorisation Intelligente"
          description="Apprentissage automatique pour catégoriser vos transactions bancaires"
        />

        {/* "Comment ça marche?" Collapsible Section */}
        <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border mb-6">
          <button
            onClick={() => setShowHowItWorks(!showHowItWorks)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors rounded-xl"
          >
            <div className="flex items-center gap-3">
              <HelpCircle className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              <span className="font-medium text-gray-900 dark:text-dark-text-primary dark:text-white">
                Comment ça marche ?
              </span>
            </div>
            {showHowItWorks ? (
              <ChevronUp className="h-5 w-5 text-gray-500 dark:text-dark-text-muted" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-500 dark:text-dark-text-muted" />
            )}
          </button>

          {showHowItWorks && (
            <div className="px-4 pb-4 border-t border-gray-100 dark:border-dark-border">
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg mt-4">
                <div className="flex gap-3">
                  <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-purple-800 dark:text-purple-300">
                    <p className="font-medium mb-3">Le système apprend de vos actions pour suggérer des codes comptables</p>
                    <ol className="space-y-2">
                      <li className="flex items-start gap-2">
                        <span className="font-bold text-purple-600 dark:text-purple-400">1.</span>
                        <span><strong>IBANs connus</strong> — Un IBAN reconnu = catégorisation automatique à 100%</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="font-bold text-purple-600 dark:text-purple-400">2.</span>
                        <span><strong>Mots-clés + montants</strong> — "cotisation" + 195€ → Cotisation adulte</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="font-bold text-purple-600 dark:text-purple-400">3.</span>
                        <span><strong>Contreparties</strong> — Même nom = même catégorie probable</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="font-bold text-purple-600 dark:text-purple-400">4.</span>
                        <span><strong>Boost saisonnier</strong> — Jan-fév = période cotisations, été = sorties</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="font-bold text-purple-600 dark:text-purple-400">5.</span>
                        <span><strong>Anti-patterns</strong> — Codes corrigés ne seront plus suggérés</span>
                      </li>
                    </ol>
                    <p className="mt-3 text-purple-600 dark:text-purple-400 font-medium">
                      Plus vous catégorisez de transactions, plus les suggestions deviennent précises !
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Dashboard Statistics */}
        <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <Brain className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary dark:text-white">
              Tableau de Bord
            </h2>
          </div>

          {statsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : stats ? (
            <div className="space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {/* Total Patterns */}
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
                  <Hash className="h-6 w-6 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {stats.totalPatterns}
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300">Patterns</p>
                </div>

                {/* Known IBANs */}
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
                  <CreditCard className="h-6 w-6 text-green-600 dark:text-green-400 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {stats.knownIbans}
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-300">IBANs connus</p>
                </div>

                {/* Anti-patterns */}
                <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg text-center">
                  <Ban className="h-6 w-6 text-orange-600 dark:text-orange-400 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                    {stats.antiPatterns}
                  </p>
                  <p className="text-xs text-orange-700 dark:text-orange-300">Anti-patterns</p>
                </div>

                {/* Pattern Types Breakdown */}
                <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-center">
                  <Users className="h-6 w-6 text-purple-600 dark:text-purple-400 mx-auto mb-2" />
                  <div className="text-xs space-y-0.5">
                    <p className="text-purple-700 dark:text-purple-300">
                      <span className="font-bold">{stats.patternsByType.iban}</span> IBAN
                    </p>
                    <p className="text-purple-700 dark:text-purple-300">
                      <span className="font-bold">{stats.patternsByType.keyword}</span> Mots-clés
                    </p>
                    <p className="text-purple-700 dark:text-purple-300">
                      <span className="font-bold">{stats.patternsByType.counterparty}</span> Contrep.
                    </p>
                  </div>
                </div>

                {/* Seasonal Boosts */}
                <div className="p-4 bg-teal-50 dark:bg-teal-900/20 rounded-lg text-center">
                  <Calendar className="h-6 w-6 text-teal-600 dark:text-teal-400 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-teal-600 dark:text-teal-400">
                    {stats.activeSeasonalBoosts.length}
                  </p>
                  <p className="text-xs text-teal-700 dark:text-teal-300">Boosts actifs</p>
                </div>
              </div>

              {/* Active Seasonal Boosts */}
              {stats.activeSeasonalBoosts.length > 0 && (
                <div className="p-4 bg-teal-50 dark:bg-teal-900/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                    <span className="text-sm font-medium text-teal-800 dark:text-teal-300">
                      Boosts saisonniers actifs ce mois
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {stats.activeSeasonalBoosts.map((boost, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 bg-teal-100 dark:bg-teal-800/50 text-teal-800 dark:text-teal-200 rounded-full text-xs font-medium"
                      >
                        {boost}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Two Column Layout: Top Patterns & Recent Corrections */}
              <div className="grid md:grid-cols-2 gap-4">
                {/* Top Patterns */}
                <div className="p-4 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-dark-text-primary dark:text-white mb-3 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-indigo-500" />
                    Top Patterns (les plus utilisés)
                  </h3>
                  {stats.topPatterns.length > 0 ? (
                    <ul className="space-y-2">
                      {stats.topPatterns.map((pattern, idx) => (
                        <li key={idx} className="flex items-center justify-between text-sm">
                          <span className="text-gray-700 dark:text-dark-text-primary dark:text-gray-300 truncate max-w-[60%]">
                            {pattern.keyword}
                          </span>
                          <span className="flex items-center gap-2">
                            <code className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">
                              {pattern.code}
                            </code>
                            <span className="text-gray-500 dark:text-dark-text-muted text-xs">
                              ({pattern.useCount}x)
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-dark-text-muted italic">
                      Aucun pattern encore. Catégorisez des transactions pour commencer l'apprentissage.
                    </p>
                  )}
                </div>

                {/* Recent Corrections */}
                <div className="p-4 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-dark-text-primary dark:text-white mb-3 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                    Corrections récentes (anti-patterns)
                  </h3>
                  {stats.recentCorrections.length > 0 ? (
                    <ul className="space-y-2">
                      {stats.recentCorrections.map((correction, idx) => (
                        <li key={idx} className="flex items-center gap-2 text-sm">
                          <code className="px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded text-xs line-through">
                            {correction.from}
                          </code>
                          <span className="text-gray-400 dark:text-dark-text-muted">→</span>
                          <code className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-xs">
                            {correction.to}
                          </code>
                          <span className="text-gray-500 dark:text-dark-text-muted text-xs ml-auto">
                            ({correction.count}x)
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-dark-text-muted italic">
                      Aucune correction enregistrée. Les codes corrigés manuellement créent des anti-patterns.
                    </p>
                  )}
                </div>
              </div>

              {/* Link to Known IBANs */}
              <div className="pt-4 border-t border-gray-200 dark:border-dark-border">
                <Link
                  to="/parametres/ibans-connus"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
                >
                  <CreditCard className="h-4 w-4" />
                  Gérer les IBANs connus
                  <ExternalLink className="h-3 w-3" />
                </Link>
                <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-2">
                  Configurez des IBANs pour catégorisation automatique à 100% (assurances, fournisseurs réguliers, etc.)
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-dark-text-muted">
              Impossible de charger les statistiques
            </div>
          )}
        </div>

        {/* Confidence Thresholds Section (Collapsible) */}
        <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors rounded-xl"
          >
            <div className="flex items-center gap-3">
              <Sliders className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              <div>
                <span className="font-medium text-gray-900 dark:text-dark-text-primary dark:text-white">
                  Réglages avancés
                </span>
                <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                  Seuils de confiance et options de catégorisation
                </p>
              </div>
            </div>
            {showSettings ? (
              <ChevronUp className="h-5 w-5 text-gray-500 dark:text-dark-text-muted" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-500 dark:text-dark-text-muted" />
            )}
          </button>

          {showSettings && (
            <div className="p-6 border-t border-gray-100 dark:border-dark-border">
              <div className="flex items-center justify-end gap-2 mb-6">
                <button
                  onClick={handleResetSettings}
                  disabled={settingsLoading || settingsSaving}
                  className="px-3 py-1.5 text-sm text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors flex items-center gap-1"
                >
                  <RotateCcw className="h-4 w-4" />
                  Réinitialiser
                </button>
                <button
                  onClick={handleSaveSettings}
                  disabled={!settingsChanged || settingsLoading || settingsSaving}
                  className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  {settingsSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Enregistrer
                </button>
              </div>

              {settingsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Threshold visualization */}
                  <div className="p-4 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg">
                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-dark-text-muted mb-2">
                      <span>0%</span>
                      <span>Score de confiance</span>
                      <span>100%</span>
                    </div>
                    <div className="relative h-8 bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden">
                      {/* Manual zone (red) */}
                      <div
                        className="absolute top-0 bottom-0 left-0 bg-red-200 dark:bg-red-900/50"
                        style={{ width: `${categorizationSettings.requireConfirmationThreshold}%` }}
                      />
                      {/* Suggestion zone (yellow) */}
                      <div
                        className="absolute top-0 bottom-0 bg-yellow-200 dark:bg-yellow-900/50"
                        style={{
                          left: `${categorizationSettings.requireConfirmationThreshold}%`,
                          width: `${categorizationSettings.suggestThreshold - categorizationSettings.requireConfirmationThreshold}%`
                        }}
                      />
                      {/* Good suggestion zone (green) */}
                      <div
                        className="absolute top-0 bottom-0 bg-green-200 dark:bg-green-900/50"
                        style={{
                          left: `${categorizationSettings.suggestThreshold}%`,
                          width: `${categorizationSettings.autoCategorizeThreshold - categorizationSettings.suggestThreshold}%`
                        }}
                      />
                      {/* Auto zone (blue) */}
                      <div
                        className="absolute top-0 bottom-0 right-0 bg-blue-200 dark:bg-blue-900/50"
                        style={{ width: `${100 - categorizationSettings.autoCategorizeThreshold}%` }}
                      />
                      {/* Labels */}
                      <div className="absolute inset-0 flex items-center justify-around text-xs font-medium">
                        <span className="text-red-700 dark:text-red-400">Manuel</span>
                        <span className="text-yellow-700 dark:text-yellow-400">À vérifier</span>
                        <span className="text-green-700 dark:text-green-400">Suggestion</span>
                        <span className="text-blue-700 dark:text-blue-400">Auto</span>
                      </div>
                    </div>
                  </div>

                  {/* Sliders */}
                  <div className="grid gap-6">
                    {/* Auto-categorize threshold */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300">
                          Seuil de catégorisation automatique
                        </label>
                        <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                          {categorizationSettings.autoCategorizeThreshold}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="70"
                        max="100"
                        value={categorizationSettings.autoCategorizeThreshold}
                        onChange={(e) => handleSettingChange('autoCategorizeThreshold', parseInt(e.target.value))}
                        className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                      <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
                        Au-dessus de ce seuil, la transaction est catégorisée automatiquement (si activé)
                      </p>
                    </div>

                    {/* Suggest threshold */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300">
                          Seuil d'affichage des suggestions
                        </label>
                        <span className="text-sm font-bold text-green-600 dark:text-green-400">
                          {categorizationSettings.suggestThreshold}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="40"
                        max={categorizationSettings.autoCategorizeThreshold - 5}
                        value={categorizationSettings.suggestThreshold}
                        onChange={(e) => handleSettingChange('suggestThreshold', parseInt(e.target.value))}
                        className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-600"
                      />
                      <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
                        Au-dessus de ce seuil, les suggestions sont affichées comme "fiables"
                      </p>
                    </div>

                    {/* Manual confirmation threshold */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300">
                          Seuil de révision manuelle
                        </label>
                        <span className="text-sm font-bold text-red-600 dark:text-red-400">
                          {categorizationSettings.requireConfirmationThreshold}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="20"
                        max={categorizationSettings.suggestThreshold - 5}
                        value={categorizationSettings.requireConfirmationThreshold}
                        onChange={(e) => handleSettingChange('requireConfirmationThreshold', parseInt(e.target.value))}
                        className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-600"
                      />
                      <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
                        En dessous de ce seuil, la catégorisation manuelle est requise
                      </p>
                    </div>
                  </div>

                  {/* Toggles */}
                  <div className="border-t border-gray-200 dark:border-dark-border pt-6 space-y-4">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-dark-text-primary dark:text-white mb-4">Options</h3>

                    {/* Auto-categorize enabled */}
                    <label className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300">
                          Activer la catégorisation automatique
                        </span>
                        <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                          Les transactions avec score élevé seront catégorisées automatiquement
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={categorizationSettings.autoCategorizeEnabled}
                        onChange={(e) => handleSettingChange('autoCategorizeEnabled', e.target.checked)}
                        className="h-5 w-5 rounded border-gray-300 dark:border-dark-border text-indigo-600 focus:ring-indigo-500"
                      />
                    </label>

                    {/* Show confidence scores */}
                    <label className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300">
                          Afficher les scores de confiance
                        </span>
                        <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                          Montrer le pourcentage de confiance à côté des suggestions
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={categorizationSettings.showConfidenceScores}
                        onChange={(e) => handleSettingChange('showConfidenceScores', e.target.checked)}
                        className="h-5 w-5 rounded border-gray-300 dark:border-dark-border text-indigo-600 focus:ring-indigo-500"
                      />
                    </label>

                    {/* Show explanations */}
                    <label className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300">
                          Afficher les explications
                        </span>
                        <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                          Montrer pourquoi une suggestion a été faite
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={categorizationSettings.showExplanations}
                        onChange={(e) => handleSettingChange('showExplanations', e.target.checked)}
                        className="h-5 w-5 rounded border-gray-300 dark:border-dark-border text-indigo-600 focus:ring-indigo-500"
                      />
                    </label>

                    {/* Notify on low confidence */}
                    <label className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300">
                          Notifier les transactions à faible confiance
                        </span>
                        <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                          Signaler les transactions nécessitant une révision manuelle
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={categorizationSettings.notifyOnLowConfidence}
                        onChange={(e) => handleSettingChange('notifyOnLowConfidence', e.target.checked)}
                        className="h-5 w-5 rounded border-gray-300 dark:border-dark-border text-indigo-600 focus:ring-indigo-500"
                      />
                    </label>

                    {/* Notify on anomaly */}
                    <label className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300">
                          Notifier les anomalies détectées
                        </span>
                        <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                          Alerter lors de transactions inhabituelles
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={categorizationSettings.notifyOnAnomaly}
                        onChange={(e) => handleSettingChange('notifyOnAnomaly', e.target.checked)}
                        className="h-5 w-5 rounded border-gray-300 dark:border-dark-border text-indigo-600 focus:ring-indigo-500"
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
