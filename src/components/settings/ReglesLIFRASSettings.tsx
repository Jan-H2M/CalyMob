import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { SettingsHeader } from './SettingsHeader';
import { FirebaseSettingsService } from '@/services/firebaseSettingsService';
import { LifrasRulesSettings, DEFAULT_LIFRAS_RULES } from '@/types/settings.types';
import { logger } from '@/utils/logger';
import toast from 'react-hot-toast';
import {
  Save,
  RotateCcw,
  AlertTriangle,
  Shield,
  Anchor,
  Users,
  Waves,
  ArrowDown,
  Info,
  Loader2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

// Niveaux dans l'ordre LIFRAS
const NIVEAUX = ['NB', '1', '2', '3', '4', 'AM', 'MC', 'MF', 'MN'] as const;
const NIVEAU_LABELS: Record<string, string> = {
  'NB': 'NB', '1': '1★', '2': '2★', '3': '3★', '4': '4★',
  'AM': 'AM', 'MC': 'MC', 'MF': 'MF', 'MN': 'MN',
};

export function ReglesLIFRASSettings() {
  const { clubId, appUser } = useAuth();
  const [rules, setRules] = useState<LifrasRulesSettings>({ ...DEFAULT_LIFRAS_RULES } as LifrasRulesSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Collapsible sections
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    matrix: true,
    nb: true,
    oneStar: true,
    twoStar: false,
    zealand: true,
    depth: false,
  });

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // ---- Load ----
  useEffect(() => {
    async function loadRules() {
      if (!clubId) return;
      try {
        const loaded = await FirebaseSettingsService.loadLifrasRules(clubId);
        setRules(loaded);
      } catch (error) {
        logger.error('Error loading LIFRAS rules:', error);
        toast.error('Erreur lors du chargement des règles LIFRAS');
      } finally {
        setIsLoading(false);
      }
    }
    loadRules();
  }, [clubId]);

  // ---- Save ----
  const handleSave = useCallback(async () => {
    if (!clubId || !appUser?.id) return;
    setIsSaving(true);
    try {
      await FirebaseSettingsService.saveLifrasRules(clubId, rules, appUser.id);
      toast.success('Règles LIFRAS sauvegardées');
      setHasChanges(false);
    } catch (error) {
      logger.error('Error saving LIFRAS rules:', error);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  }, [clubId, appUser, rules]);

  // ---- Reset ----
  const handleReset = useCallback(async () => {
    if (!clubId || !appUser?.id) return;
    if (!window.confirm('Réinitialiser toutes les règles aux valeurs MIL LIFRAS 2026 par défaut ?')) return;
    setIsSaving(true);
    try {
      await FirebaseSettingsService.resetLifrasRulesToDefault(clubId, appUser.id);
      setRules({ ...DEFAULT_LIFRAS_RULES } as LifrasRulesSettings);
      toast.success('Règles réinitialisées aux valeurs MIL 2026');
      setHasChanges(false);
    } catch (error) {
      logger.error('Error resetting LIFRAS rules:', error);
      toast.error('Erreur lors de la réinitialisation');
    } finally {
      setIsSaving(false);
    }
  }, [clubId, appUser]);

  // ---- Update helpers ----
  const updateMatrixCell = (row: string, col: string, value: number | null) => {
    setRules(prev => {
      const newMatrix = { ...prev.depthMatrix };
      newMatrix[row] = { ...newMatrix[row], [col]: value };
      // Maintain symmetry
      newMatrix[col] = { ...newMatrix[col], [row]: value };
      return { ...prev, depthMatrix: newMatrix };
    });
    setHasChanges(true);
  };

  const updateNbRules = (field: keyof LifrasRulesSettings['nbRules'], value: number | boolean) => {
    setRules(prev => ({ ...prev, nbRules: { ...prev.nbRules, [field]: value } }));
    setHasChanges(true);
  };

  const updateOneStarRules = (field: keyof LifrasRulesSettings['oneStarRules'], value: number | boolean) => {
    setRules(prev => ({ ...prev, oneStarRules: { ...prev.oneStarRules, [field]: value } }));
    setHasChanges(true);
  };

  const updateTwoStarRules = (field: keyof LifrasRulesSettings['twoStarRules'], value: boolean) => {
    setRules(prev => ({ ...prev, twoStarRules: { ...prev.twoStarRules, [field]: value } }));
    setHasChanges(true);
  };

  const updateZealandRules = (field: keyof LifrasRulesSettings['zealandRules'], value: number | boolean) => {
    setRules(prev => ({ ...prev, zealandRules: { ...prev.zealandRules, [field]: value } }));
    setHasChanges(true);
  };

  const updateDepthRecommendations = (field: keyof LifrasRulesSettings['depthRecommendations'], value: number) => {
    setRules(prev => ({ ...prev, depthRecommendations: { ...prev.depthRecommendations, [field]: value } }));
    setHasChanges(true);
  };

  // ---- Section header component ----
  const SectionHeader = ({ id, icon, title, description, color }: {
    id: string; icon: React.ReactNode; title: string; description: string; color: string;
  }) => (
    <button
      onClick={() => toggleSection(id)}
      className="w-full flex items-center gap-3 p-4 bg-white dark:bg-dark-bg-secondary rounded-t-lg border border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary transition-colors"
    >
      <div className={`p-2 rounded-lg ${color}`}>{icon}</div>
      <div className="flex-1 text-left">
        <h3 className="font-semibold text-gray-900 dark:text-dark-text-primary">{title}</h3>
        <p className="text-xs text-gray-500 dark:text-dark-text-muted">{description}</p>
      </div>
      {openSections[id] ? <ChevronDown className="h-5 w-5 text-gray-400" /> : <ChevronRight className="h-5 w-5 text-gray-400" />}
    </button>
  );

  // ---- Number input helper ----
  const NumberInput = ({ value, onChange, min, max, label, unit, disabled }: {
    value: number; onChange: (v: number) => void; min?: number; max?: number; label: string; unit?: string; disabled?: boolean;
  }) => (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-gray-700 dark:text-dark-text-secondary">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          min={min ?? 0}
          max={max ?? 999}
          disabled={disabled}
          className="w-20 px-2 py-1 text-center border border-gray-300 dark:border-dark-border rounded-md text-sm bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary disabled:opacity-50"
        />
        {unit && <span className="text-xs text-gray-500 dark:text-dark-text-muted">{unit}</span>}
      </div>
    </div>
  );

  // ---- Toggle helper ----
  const Toggle = ({ value, onChange, label }: {
    value: boolean; onChange: (v: boolean) => void; label: string;
  }) => (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-gray-700 dark:text-dark-text-secondary">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${value ? 'bg-calypso-blue dark:bg-calypso-aqua' : 'bg-gray-300 dark:bg-gray-600'}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-calypso-blue" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-5xl mx-auto">
        <SettingsHeader
          breadcrumb={['Paramètres', 'Règles LIFRAS']}
          title="Règles LIFRAS — Palanquées"
          description="Configuration des règles de composition des palanquées selon MIL LIFRAS 2026"
        />

        {/* Action bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium">
              {rules.sourceReference || 'MIL LIFRAS 2026'}
            </span>
            {hasChanges && (
              <span className="text-xs px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">
                Modifications non sauvegardées
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-secondary transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
              Réinitialiser
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-calypso-blue dark:bg-calypso-aqua text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-all font-medium"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Sauvegarder
            </button>
          </div>
        </div>

        <div className="space-y-4">

          {/* ====== 1. DEPTH MATRIX ====== */}
          <div>
            <SectionHeader
              id="matrix"
              icon={<ArrowDown className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
              title="Matrice de Profondeur"
              description="§1.7.1 — Profondeur max par combinaison de niveaux (en mètres)"
              color="bg-blue-100 dark:bg-blue-900/30"
            />
            {openSections.matrix && (
              <div className="border border-t-0 border-gray-200 dark:border-dark-border rounded-b-lg bg-white dark:bg-dark-bg-secondary p-4 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className="w-12 p-1 text-left text-gray-500 dark:text-dark-text-muted"></th>
                      {NIVEAUX.map(n => (
                        <th key={n} className="p-1 text-center font-bold text-gray-700 dark:text-dark-text-primary min-w-[48px]">
                          {NIVEAU_LABELS[n]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {NIVEAUX.map((row, ri) => (
                      <tr key={row}>
                        <td className="p-1 font-bold text-gray-700 dark:text-dark-text-primary">{NIVEAU_LABELS[row]}</td>
                        {NIVEAUX.map((col, ci) => {
                          const val = rules.depthMatrix?.[row]?.[col];
                          const isDisabled = ci < ri; // lower triangle = mirror
                          const bgColor = val === null
                            ? 'bg-red-50 dark:bg-red-900/20'
                            : val !== undefined && val !== null
                              ? 'bg-green-50 dark:bg-green-900/20'
                              : '';
                          return (
                            <td key={col} className={`p-0.5 text-center ${bgColor}`}>
                              {isDisabled ? (
                                <span className="text-gray-400 dark:text-gray-600 text-xs">
                                  {val === null ? '✕' : val ?? '—'}
                                </span>
                              ) : (
                                <input
                                  type="text"
                                  value={val === null ? '✕' : val ?? ''}
                                  onChange={e => {
                                    const v = e.target.value.trim();
                                    if (v === '' || v === '✕' || v === 'x' || v === 'X') {
                                      updateMatrixCell(row, col, null);
                                    } else {
                                      const num = parseInt(v);
                                      if (!isNaN(num) && num >= 0) {
                                        updateMatrixCell(row, col, num);
                                      }
                                    }
                                  }}
                                  className={`w-full min-w-[40px] px-1 py-0.5 text-center border border-gray-200 dark:border-dark-border rounded text-xs
                                    ${val === null ? 'text-red-500 bg-red-50 dark:bg-red-900/20 dark:text-red-400' : 'text-gray-900 dark:text-dark-text-primary bg-white dark:bg-dark-bg-tertiary'}`}
                                  title={`${NIVEAU_LABELS[row]} + ${NIVEAU_LABELS[col]}: ${val === null ? 'Interdit' : val + 'm'}`}
                                />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 flex items-center gap-4 text-xs text-gray-500 dark:text-dark-text-muted">
                  <div className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"></span>
                    ✕ = Interdit
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"></span>
                    Nombre = Profondeur max (m)
                  </div>
                  <div className="flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    La matrice est symétrique (seul le triangle supérieur est modifiable)
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ====== 2. NB RULES ====== */}
          <div>
            <SectionHeader
              id="nb"
              icon={<Shield className="h-5 w-5 text-amber-600 dark:text-amber-400" />}
              title="Plongée Découverte (NB)"
              description="§8 — Règles pour les plongeurs Non Brevetés"
              color="bg-amber-100 dark:bg-amber-900/30"
            />
            {openSections.nb && (
              <div className="border border-t-0 border-gray-200 dark:border-dark-border rounded-b-lg bg-white dark:bg-dark-bg-secondary p-4 space-y-1">
                <Toggle
                  label="NB ne peut plonger qu'avec un Moniteur (MC/MF/MN)"
                  value={rules.nbRules.requireMoniteur}
                  onChange={v => updateNbRules('requireMoniteur', v)}
                />
                <NumberInput
                  label="Max NB par moniteur"
                  value={rules.nbRules.maxNbPerMoniteur}
                  onChange={v => updateNbRules('maxNbPerMoniteur', v)}
                  min={1} max={10}
                />
                <NumberInput
                  label="Taille max palanquée avec NB"
                  value={rules.nbRules.maxPalanqueeSizeWithNb}
                  onChange={v => updateNbRules('maxPalanqueeSizeWithNb', v)}
                  min={2} max={10}
                />
                <NumberInput
                  label="Profondeur max NB"
                  value={rules.nbRules.maxDepthNb}
                  onChange={v => updateNbRules('maxDepthNb', v)}
                  min={1} max={50}
                  unit="m"
                />
              </div>
            )}
          </div>

          {/* ====== 3. 1★ RULES ====== */}
          <div>
            <SectionHeader
              id="oneStar"
              icon={<Users className="h-5 w-5 text-green-600 dark:text-green-400" />}
              title="Plongeur 1★"
              description="§1.7.3 — Limitations du plongeur une étoile"
              color="bg-green-100 dark:bg-green-900/30"
            />
            {openSections.oneStar && (
              <div className="border border-t-0 border-gray-200 dark:border-dark-border rounded-b-lg bg-white dark:bg-dark-bg-secondary p-4 space-y-1">
                <Toggle
                  label="Chef de palanquée (min 3★) obligatoire"
                  value={rules.oneStarRules.requireCP}
                  onChange={v => updateOneStarRules('requireCP', v)}
                />
                <Toggle
                  label="No Deco obligatoire"
                  value={rules.oneStarRules.noDecoRequired}
                  onChange={v => updateOneStarRules('noDecoRequired', v)}
                />
                <NumberInput
                  label="Max plongeurs 1★ par palanquée"
                  value={rules.oneStarRules.max1StarPerPalanquee}
                  onChange={v => updateOneStarRules('max1StarPerPalanquee', v)}
                  min={1} max={10}
                />
                <NumberInput
                  label="Profondeur max 1★"
                  value={rules.oneStarRules.maxDepth1Star}
                  onChange={v => updateOneStarRules('maxDepth1Star', v)}
                  min={1} max={50}
                  unit="m"
                />
              </div>
            )}
          </div>

          {/* ====== 4. 2★ RULES ====== */}
          <div>
            <SectionHeader
              id="twoStar"
              icon={<Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />}
              title="Plongeur 2★"
              description="§25.1.2 — Prérogatives plongeur deux étoiles"
              color="bg-purple-100 dark:bg-purple-900/30"
            />
            {openSections.twoStar && (
              <div className="border border-t-0 border-gray-200 dark:border-dark-border rounded-b-lg bg-white dark:bg-dark-bg-secondary p-4 space-y-1">
                <Toggle
                  label="2★+2★ doivent avoir 18 ans accomplis"
                  value={rules.twoStarRules.requireAge18WithPeer}
                  onChange={v => updateTwoStarRules('requireAge18WithPeer', v)}
                />
              </div>
            )}
          </div>

          {/* ====== 5. ZEALAND RULES ====== */}
          <div>
            <SectionHeader
              id="zealand"
              icon={<Waves className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />}
              title="Règles Zélande"
              description="§5.1 — Règles particulières LIFRAS pour la Zélande"
              color="bg-cyan-100 dark:bg-cyan-900/30"
            />
            {openSections.zealand && (
              <div className="border border-t-0 border-gray-200 dark:border-dark-border rounded-b-lg bg-white dark:bg-dark-bg-secondary p-4 space-y-1">
                <NumberInput
                  label="Taille max palanquée en Zélande"
                  value={rules.zealandRules.maxPalanqueeSize}
                  onChange={v => updateZealandRules('maxPalanqueeSize', v)}
                  min={2} max={10}
                />
                <NumberInput
                  label="Max palanquées de 3 autorisées"
                  value={rules.zealandRules.maxPalanqueesOf3}
                  onChange={v => updateZealandRules('maxPalanqueesOf3', v)}
                  min={0} max={10}
                />
                <Toggle
                  label="Palanquée de 3 = No Deco obligatoire"
                  value={rules.zealandRules.palanqueeOf3NoDeco}
                  onChange={v => updateZealandRules('palanqueeOf3NoDeco', v)}
                />
                <Toggle
                  label="Lampe de plongée obligatoire"
                  value={rules.zealandRules.requireLamp}
                  onChange={v => updateZealandRules('requireLamp', v)}
                />
                <Toggle
                  label="Dragonne obligatoire"
                  value={rules.zealandRules.requireDragonne}
                  onChange={v => updateZealandRules('requireDragonne', v)}
                />
              </div>
            )}
          </div>

          {/* ====== 6. DEPTH RECOMMENDATIONS ====== */}
          <div>
            <SectionHeader
              id="depth"
              icon={<Anchor className="h-5 w-5 text-red-600 dark:text-red-400" />}
              title="Recommandations de Profondeur"
              description="§1.7.4 — Recommandations pour 4★ et plus"
              color="bg-red-100 dark:bg-red-900/30"
            />
            {openSections.depth && (
              <div className="border border-t-0 border-gray-200 dark:border-dark-border rounded-b-lg bg-white dark:bg-dark-bg-secondary p-4 space-y-1">
                <NumberInput
                  label="Profondeur max recommandée en lacs/carrières"
                  value={rules.depthRecommendations.maxDepthLakeQuarry}
                  onChange={v => updateDepthRecommendations('maxDepthLakeQuarry', v)}
                  min={10} max={100}
                  unit="m"
                />
                <NumberInput
                  label="Profondeur max recommandée sur air"
                  value={rules.depthRecommendations.maxDepthAir}
                  onChange={v => updateDepthRecommendations('maxDepthAir', v)}
                  min={10} max={100}
                  unit="m"
                />
              </div>
            )}
          </div>

          {/* Info footer */}
          <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <Info className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-700 dark:text-blue-300">
              <p className="font-medium">Source: MIL LIFRAS 2026</p>
              <p className="mt-1">
                Ces règles sont utilisées par le système de validation des palanquées
                pour vérifier automatiquement la composition des groupes de plongée.
                Toute modification sera immédiatement prise en compte lors de la prochaine validation.
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
