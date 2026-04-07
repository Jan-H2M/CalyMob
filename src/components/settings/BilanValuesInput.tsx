import { useState, useEffect, useMemo } from 'react';
import { logger } from '@/utils/logger';
import {
  Save,
  RefreshCw,
  Download,
  Calendar,
  Calculator,
  AlertCircle,
  AlertTriangle,
  Lock,
  Loader2
} from 'lucide-react';
import { BilanCode, BilanValues, FiscalYear } from '@/types';
import { getBilanCodes } from '@/services/bilanCodeService';
import { getBilanValues, saveBilanValues, calculateAllBilanValues } from '@/services/bilanMappingService';
import { FiscalYearService } from '@/services/fiscalYearService';
import { BoutiqueStockService } from '@/services/boutiqueStockService';
import { InventoryValueSnapshotService } from '@/services/inventoryValueSnapshotService';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/utils/utils';
import toast from 'react-hot-toast';

// Status info voor boutique snapshots
interface BoutiqueSnapshotStatus {
  boutique: { hasSnapshot: boolean; isLocked: boolean };
  boutique_lifras: { hasSnapshot: boolean; isLocked: boolean };
}

// Status info voor inventory (matériel) snapshots
interface InventorySnapshotStatus {
  hasSnapshot: boolean;
  isLocked: boolean;
}

interface BilanValuesInputProps {
  onClose?: () => void;
}

export function BilanValuesInput({ onClose: _onClose }: BilanValuesInputProps) {
  const { clubId } = useAuth();
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<string | null>(null);
  const [bilanCodes, setBilanCodes] = useState<BilanCode[]>([]);
  const [values, setValues] = useState<BilanValues[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [boutiqueStatus, setBoutiqueStatus] = useState<BoutiqueSnapshotStatus | null>(null);
  const [inventoryStatus, setInventoryStatus] = useState<InventorySnapshotStatus | null>(null);

  // Charger les années fiscales et codes de bilan
  useEffect(() => {
    const loadInitialData = async () => {
      if (!clubId) return;

      try {
        const [years, codes] = await Promise.all([
          FiscalYearService.getFiscalYears(clubId),
          getBilanCodes(clubId)
        ]);

        setFiscalYears(years);
        setBilanCodes(codes);

        // Sélectionner l'année active par défaut
        const activeYear = years.find(y => y.status === 'open');
        if (activeYear) {
          setSelectedYearId(activeYear.id);
        } else if (years.length > 0) {
          setSelectedYearId(years[0].id);
        }
      } catch (error) {
        logger.error('Erreur chargement données initiales:', error);
        toast.error('Erreur lors du chargement des données');
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialData();
  }, [clubId]);

  // Charger les valeurs quand l'année change
  useEffect(() => {
    const loadValues = async () => {
      if (!clubId || !selectedYearId) return;

      const year = fiscalYears.find(y => y.id === selectedYearId);
      if (!year) return;

      try {
        setIsLoading(true);
        // D'abord charger les valeurs existantes
        const existingValues = await getBilanValues(clubId, selectedYearId);

        // Puis calculer toutes les valeurs (auto + manuelles existantes)
        const calculatedValues = await calculateAllBilanValues(clubId, year, existingValues);
        setValues(calculatedValues);
        setHasChanges(false);

        // Charger le status des boutique et inventory snapshots
        const [boutiqueResult, lifrasResult, inventoryResult] = await Promise.all([
          BoutiqueStockService.getValueForBilan(clubId, year.year, 'boutique'),
          BoutiqueStockService.getValueForBilan(clubId, year.year, 'boutique_lifras'),
          InventoryValueSnapshotService.getValueForBilan(clubId, year.year)
        ]);
        setBoutiqueStatus({
          boutique: { hasSnapshot: boutiqueResult.hasSnapshot, isLocked: boutiqueResult.isLocked },
          boutique_lifras: { hasSnapshot: lifrasResult.hasSnapshot, isLocked: lifrasResult.isLocked }
        });
        setInventoryStatus({
          hasSnapshot: inventoryResult.hasSnapshot,
          isLocked: inventoryResult.isLocked
        });
      } catch (error) {
        logger.error('Erreur chargement valeurs:', error);
        toast.error('Erreur lors du chargement des valeurs');
      } finally {
        setIsLoading(false);
      }
    };

    loadValues();
  }, [clubId, selectedYearId, fiscalYears]);

  // Année fiscale sélectionnée
  const selectedYear = useMemo(() => {
    return fiscalYears.find(y => y.id === selectedYearId) || null;
  }, [fiscalYears, selectedYearId]);

  // Codes manuels (à saisir) - inclut aussi result_carryforward (04.01) pour permettre la saisie initiale
  const manualCodes = useMemo(() => {
    return bilanCodes
      .filter(c => c.calculationType === 'manual' || c.calculationType === 'result_carryforward')
      .sort((a, b) => a.order - b.order);
  }, [bilanCodes]);

  // Codes auto-calculés (lecture seule)
  const autoCodes = useMemo(() => {
    return bilanCodes
      .filter(c =>
        c.calculationType === 'inventory_value' ||
        c.calculationType === 'pl_result' ||
        c.calculationType === 'boutique_stock'
      )
      .sort((a, b) => a.order - b.order);
  }, [bilanCodes]);

  // Helper pour obtenir le status d'un code boutique
  const getBoutiqueCodeStatus = (code: BilanCode): { hasSnapshot: boolean; isLocked: boolean } | null => {
    if (code.calculationType !== 'boutique_stock' || !boutiqueStatus) return null;
    const type = code.boutiqueType || (code.id === '02.01.01' ? 'boutique' : 'boutique_lifras');
    return type === 'boutique' ? boutiqueStatus.boutique : boutiqueStatus.boutique_lifras;
  };

  // Helper pour obtenir le status d'un code inventory (matériel)
  const getInventoryCodeStatus = (code: BilanCode): { hasSnapshot: boolean; isLocked: boolean } | null => {
    if (code.calculationType !== 'inventory_value' || !inventoryStatus) return null;
    return inventoryStatus;
  };

  // Map des valeurs pour accès rapide
  const valuesMap = useMemo(() => {
    return new Map(values.map(v => [v.bilanCodeId, v]));
  }, [values]);

  // Obtenir la valeur d'un code
  const getValue = (codeId: string, field: 'openingValue' | 'closingValue'): number => {
    const value = valuesMap.get(codeId);
    return value?.[field] ?? 0;
  };

  // Mettre à jour une valeur
  const updateValue = (codeId: string, field: 'openingValue' | 'closingValue', newValue: number) => {
    setValues(prev => {
      const existing = prev.find(v => v.bilanCodeId === codeId);
      if (existing) {
        return prev.map(v =>
          v.bilanCodeId === codeId
            ? { ...v, [field]: newValue, [field === 'openingValue' ? 'isManualOpening' : 'isManualClosing']: true }
            : v
        );
      } else {
        return [...prev, {
          bilanCodeId: codeId,
          openingValue: field === 'openingValue' ? newValue : 0,
          closingValue: field === 'closingValue' ? newValue : 0,
          isManualOpening: field === 'openingValue',
          isManualClosing: field === 'closingValue'
        }];
      }
    });
    setHasChanges(true);
  };

  // Sauvegarder
  const handleSave = async () => {
    if (!clubId || !selectedYearId) return;

    try {
      setIsSaving(true);
      await saveBilanValues(clubId, selectedYearId, values);
      setHasChanges(false);
      toast.success('Valeurs sauvegardées');
    } catch (error) {
      logger.error('Erreur sauvegarde:', error);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  // Recalculer toutes les valeurs
  const handleRecalculate = async () => {
    if (!clubId || !selectedYear) return;

    try {
      setIsRecalculating(true);
      const calculatedValues = await calculateAllBilanValues(clubId, selectedYear, values);
      setValues(calculatedValues);
      await saveBilanValues(clubId, selectedYear.id, calculatedValues);
      setHasChanges(false);
      toast.success('Valeurs recalculées et sauvegardées');
    } catch (error) {
      logger.error('Erreur recalcul:', error);
      toast.error('Erreur lors du recalcul');
    } finally {
      setIsRecalculating(false);
    }
  };

  // Charger opening values depuis l'année précédente
  const handleLoadFromPreviousYear = async () => {
    if (!clubId || !selectedYear) return;

    try {
      const previousYear = await FiscalYearService.getPreviousFiscalYear(clubId);
      if (!previousYear) {
        toast.error('Pas d\'année fiscale précédente trouvée');
        return;
      }

      const previousValues = await getBilanValues(clubId, previousYear.id);
      const previousValuesMap = new Map(previousValues.map(v => [v.bilanCodeId, v]));

      // Mettre à jour les opening values avec les closing values de l'année précédente
      setValues(prev => {
        const updated = [...prev];
        manualCodes.forEach(code => {
          const prevValue = previousValuesMap.get(code.id);
          if (prevValue) {
            const existingIndex = updated.findIndex(v => v.bilanCodeId === code.id);
            if (existingIndex >= 0) {
              updated[existingIndex] = {
                ...updated[existingIndex],
                openingValue: prevValue.closingValue,
                isManualOpening: true
              };
            } else {
              updated.push({
                bilanCodeId: code.id,
                openingValue: prevValue.closingValue,
                closingValue: 0,
                isManualOpening: true,
                isManualClosing: true
              });
            }
          }
        });
        return updated;
      });

      setHasChanges(true);
      toast.success(`Valeurs d'ouverture chargées depuis ${previousYear.year}`);
    } catch (error) {
      logger.error('Erreur chargement année précédente:', error);
      toast.error('Erreur lors du chargement');
    }
  };

  // Formater un nombre en euros
  const formatEuro = (value: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(value);
  };

  if (isLoading && !selectedYear) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-calypso-blue" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
            Valeurs du Bilan
          </h2>
          <p className="text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
            Saisissez les valeurs d'ouverture et de clôture pour chaque code du Bilan par année fiscale
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Sélecteur d'année */}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
            <select
              value={selectedYearId || ''}
              onChange={(e) => setSelectedYearId(e.target.value)}
              className="rounded-lg border border-gray-300 dark:border-dark-border px-3 py-2 text-sm bg-white dark:bg-dark-bg-tertiary"
            >
              {fiscalYears.map(year => (
                <option key={year.id} value={year.id}>
                  {year.year} {year.status === 'open' ? '(actif)' : year.status === 'closed' ? '(clôturé)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Boutons d'action */}
          <button
            onClick={handleLoadFromPreviousYear}
            disabled={isLoading || isRecalculating}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Charger année préc.
          </button>

          <button
            onClick={handleRecalculate}
            disabled={isLoading || isRecalculating}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-calypso-blue text-calypso-blue rounded-lg hover:bg-calypso-blue/10 disabled:opacity-50"
          >
            {isRecalculating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Recalculer
          </button>

          <button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm rounded-lg",
              hasChanges
                ? "bg-calypso-blue text-white hover:bg-calypso-blue/90"
                : "bg-gray-100 dark:bg-dark-bg-tertiary text-gray-400 dark:text-dark-text-muted cursor-not-allowed"
            )}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Sauvegarder
          </button>
        </div>
      </div>

      {hasChanges && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <span className="text-sm text-amber-700 dark:text-amber-400">
            Des modifications non sauvegardées sont en attente.
          </span>
        </div>
      )}

      {/* Codes Auto-Calculés */}
      {autoCodes.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-700 dark:text-dark-text-primary flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Valeurs calculées automatiquement
          </h3>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-600 dark:text-dark-text-secondary">
                  <th className="py-2 pr-4">Code</th>
                  <th className="py-2 pr-4">Description</th>
                  <th className="py-2 pr-4 text-right">Opening</th>
                  <th className="py-2 text-right">Closing</th>
                </tr>
              </thead>
              <tbody>
                {autoCodes.map(code => {
                  const boutiqueCodeStatus = getBoutiqueCodeStatus(code);
                  const inventoryCodeStatus = getInventoryCodeStatus(code);
                  // Determine status for any auto-calculated code (boutique OR inventory)
                  const codeStatus = boutiqueCodeStatus || inventoryCodeStatus;
                  const hasWarning = codeStatus && !codeStatus.isLocked;

                  return (
                    <tr key={code.id} className={cn(
                      "border-t",
                      hasWarning
                        ? "border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-900/10"
                        : "border-green-200 dark:border-green-800"
                    )}>
                      <td className={cn(
                        "py-3 pr-4 text-sm font-mono",
                        hasWarning
                          ? "text-orange-700 dark:text-orange-400"
                          : "text-green-700 dark:text-green-400"
                      )}>
                        {code.code}
                      </td>
                      <td className="py-3 pr-4 text-sm text-gray-900 dark:text-dark-text-primary">
                        <div className="flex items-center gap-2">
                          <span>{code.name}</span>
                          <span className={cn(
                            "text-xs",
                            hasWarning
                              ? "text-orange-600 dark:text-orange-400"
                              : "text-green-600 dark:text-green-400"
                          )}>
                            ({code.calculationType === 'inventory_value' ? 'Inventaire' :
                              code.calculationType === 'pl_result' ? 'Résultat P&L' : 'Stock boutique'})
                          </span>
                          {/* Status indicator voor boutique codes */}
                          {boutiqueCodeStatus && (
                            boutiqueCodeStatus.isLocked ? (
                              <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400" title="Clôture verrouillée">
                                <Lock className="h-3 w-3" />
                              </span>
                            ) : boutiqueCodeStatus.hasSnapshot ? (
                              <span className="inline-flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400" title="Clôture non verrouillée - valeur provisoire">
                                <AlertTriangle className="h-3 w-3" />
                                Non verrouillé
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400" title="Pas de clôture - valeur live">
                                <AlertTriangle className="h-3 w-3" />
                                Pas de clôture - valeur live
                              </span>
                            )
                          )}
                          {/* Status indicator voor inventory (matériel) codes */}
                          {inventoryCodeStatus && (
                            inventoryCodeStatus.isLocked ? (
                              <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400" title="Clôture verrouillée">
                                <Lock className="h-3 w-3" />
                              </span>
                            ) : inventoryCodeStatus.hasSnapshot ? (
                              <span className="inline-flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400" title="Clôture non verrouillée - valeur provisoire">
                                <AlertTriangle className="h-3 w-3" />
                                Non verrouillé
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400" title="Pas de clôture - valeur live">
                                <AlertTriangle className="h-3 w-3" />
                                Pas de clôture - valeur live
                              </span>
                            )
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-sm text-right font-medium text-gray-900 dark:text-dark-text-primary">
                        {formatEuro(getValue(code.id, 'openingValue'))}
                      </td>
                      <td className={cn(
                        "py-3 text-sm text-right font-medium",
                        hasWarning
                          ? "text-orange-700 dark:text-orange-400"
                          : "text-green-700 dark:text-green-400"
                      )}>
                        {formatEuro(getValue(code.id, 'closingValue'))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Codes Manuels - ACTIF */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-700 dark:text-dark-text-primary">
          ACTIF - Saisie manuelle
        </h3>
        <div className="bg-white dark:bg-dark-bg-tertiary rounded-lg border border-gray-200 dark:border-dark-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-dark-bg-secondary">
              <tr className="text-left text-sm text-gray-600 dark:text-dark-text-secondary">
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4 text-right w-40">Opening</th>
                <th className="py-3 px-4 text-right w-40">Closing</th>
              </tr>
            </thead>
            <tbody>
              {manualCodes
                .filter(c => c.section === 'actif')
                .map(code => (
                  <tr key={code.id} className="border-t border-gray-100 dark:border-dark-border">
                    <td className="py-3 px-4 text-sm font-mono text-gray-500 dark:text-dark-text-muted">
                      {code.code}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-900 dark:text-dark-text-primary">
                      {code.name}
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="number"
                        step="0.01"
                        value={getValue(code.id, 'openingValue') || ''}
                        onChange={(e) => updateValue(code.id, 'openingValue', parseFloat(e.target.value) || 0)}
                        className="w-full text-right px-3 py-1.5 rounded border border-gray-300 dark:border-dark-border bg-amber-50 dark:bg-amber-900/20 focus:outline-none focus:ring-2 focus:ring-calypso-blue text-sm"
                        placeholder="0.00"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="number"
                        step="0.01"
                        value={getValue(code.id, 'closingValue') || ''}
                        onChange={(e) => updateValue(code.id, 'closingValue', parseFloat(e.target.value) || 0)}
                        className="w-full text-right px-3 py-1.5 rounded border border-gray-300 dark:border-dark-border bg-amber-50 dark:bg-amber-900/20 focus:outline-none focus:ring-2 focus:ring-calypso-blue text-sm"
                        placeholder="0.00"
                      />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Codes Manuels - PASSIF */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-700 dark:text-dark-text-primary">
          PASSIF - Saisie manuelle
        </h3>
        <div className="bg-white dark:bg-dark-bg-tertiary rounded-lg border border-gray-200 dark:border-dark-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-dark-bg-secondary">
              <tr className="text-left text-sm text-gray-600 dark:text-dark-text-secondary">
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4 text-right w-40">Opening</th>
                <th className="py-3 px-4 text-right w-40">Closing</th>
              </tr>
            </thead>
            <tbody>
              {manualCodes
                .filter(c => c.section === 'passif')
                .map(code => (
                  <tr key={code.id} className="border-t border-gray-100 dark:border-dark-border">
                    <td className="py-3 px-4 text-sm font-mono text-gray-500 dark:text-dark-text-muted">
                      {code.code}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-900 dark:text-dark-text-primary">
                      {code.name}
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="number"
                        step="0.01"
                        value={getValue(code.id, 'openingValue') || ''}
                        onChange={(e) => updateValue(code.id, 'openingValue', parseFloat(e.target.value) || 0)}
                        className="w-full text-right px-3 py-1.5 rounded border border-gray-300 dark:border-dark-border bg-amber-50 dark:bg-amber-900/20 focus:outline-none focus:ring-2 focus:ring-calypso-blue text-sm"
                        placeholder="0.00"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="number"
                        step="0.01"
                        value={getValue(code.id, 'closingValue') || ''}
                        onChange={(e) => updateValue(code.id, 'closingValue', parseFloat(e.target.value) || 0)}
                        className="w-full text-right px-3 py-1.5 rounded border border-gray-300 dark:border-dark-border bg-amber-50 dark:bg-amber-900/20 focus:outline-none focus:ring-2 focus:ring-calypso-blue text-sm"
                        placeholder="0.00"
                      />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Légende */}
      <div className="flex items-center gap-6 text-xs text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary pt-4">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200"></div>
          <span>Saisie manuelle</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-green-50 dark:bg-green-900/20 border border-green-200"></div>
          <span>Calculé automatiquement</span>
        </div>
      </div>
    </div>
  );
}
