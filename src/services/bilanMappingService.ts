import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, getDocFromServer, setDoc, Timestamp, orderBy } from 'firebase/firestore';
import { BilanCode, BilanValues, BilanValueStatus, TransactionBancaire, FiscalYear } from '@/types';
import { getBilanCodes, getChildCodes } from './bilanCodeService';
import { InventoryItemService } from './inventoryItemService';
import { InventoryConfigService } from './inventoryConfigService';
import { AmortizationService } from './amortizationService';
import { ReportService } from './reportService';
import { FiscalYearService } from './fiscalYearService';
import { BoutiqueStockService } from './boutiqueStockService';
import { InventoryValueSnapshotService } from './inventoryValueSnapshotService';
import { logger } from '@/utils/logger';

// Helper: arrondi à 2 décimales pour éviter les erreurs de virgule flottante IEEE 754
const round2 = (n: number): number => Math.round(n * 100) / 100;

function toTimeMs(date: Date | undefined): number {
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
}

function fiscalYearStatusRank(status: FiscalYear['status']): number {
  if (status === 'permanently_closed') return 3;
  if (status === 'closed') return 2;
  return 1;
}

function selectPreferredFiscalYearForYear(
  fiscalYears: FiscalYear[],
  targetYear: number,
  referenceStartDate?: Date
): FiscalYear | null {
  const candidates = fiscalYears.filter(fy => fy.year === targetYear);
  if (candidates.length === 0) return null;

  const refStartMs = toTimeMs(referenceStartDate);
  const sorted = [...candidates].sort((a, b) => {
    const statusDiff = fiscalYearStatusRank(b.status) - fiscalYearStatusRank(a.status);
    if (statusDiff !== 0) return statusDiff;

    const aEnd = toTimeMs(a.end_date);
    const bEnd = toTimeMs(b.end_date);
    if (refStartMs > 0) {
      const aBeforeRef = aEnd <= refStartMs ? 1 : 0;
      const bBeforeRef = bEnd <= refStartMs ? 1 : 0;
      if (aBeforeRef !== bBeforeRef) return bBeforeRef - aBeforeRef;

      if (aBeforeRef === 1 && bBeforeRef === 1) {
        const endDiff = bEnd - aEnd;
        if (endDiff !== 0) return endDiff;
      } else {
        const distA = Math.abs(aEnd - refStartMs);
        const distB = Math.abs(bEnd - refStartMs);
        const distDiff = distA - distB;
        if (distDiff !== 0) return distDiff;
      }
    } else {
      const endDiff = bEnd - aEnd;
      if (endDiff !== 0) return endDiff;
    }

    const updatedDiff = toTimeMs(b.updated_at) - toTimeMs(a.updated_at);
    if (updatedDiff !== 0) return updatedDiff;

    const createdDiff = toTimeMs(b.created_at) - toTimeMs(a.created_at);
    if (createdDiff !== 0) return createdDiff;

    return a.id.localeCompare(b.id);
  });

  return sorted[0] || null;
}

/**
 * Récupérer les valeurs du bilan pour une année fiscale
 */
export async function getBilanValues(
  clubId: string,
  fiscalYearId: string,
  options?: { forceServer?: boolean }
): Promise<BilanValues[]> {
  try {
    const docRef = doc(db, 'clubs', clubId, 'fiscal_years', fiscalYearId, 'data', 'bilan_values');
    // forceServer bypasse le cache IndexedDB local (utile quand les données
    // ont été modifiées côté serveur, ex: scripts Admin SDK, autre onglet)
    const docSnap = options?.forceServer
      ? await getDocFromServer(docRef)
      : await getDoc(docRef);

    if (docSnap.exists() && docSnap.data().values) {
      return docSnap.data().values as BilanValues[];
    }

    return [];
  } catch (error) {
    logger.error('Erreur lors de la récupération des valeurs du bilan:', error);
    return [];
  }
}

/**
 * Sauvegarder les valeurs du bilan pour une année fiscale
 */
export async function saveBilanValues(
  clubId: string,
  fiscalYearId: string,
  values: BilanValues[]
): Promise<void> {
  try {
    // Sanitize: strip undefined fields from values (Firestore rejects undefined)
    const sanitizedValues = values.map(v => {
      const clean: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(v)) {
        if (val !== undefined) {
          clean[key] = val;
        }
      }
      return clean;
    });

    const docRef = doc(db, 'clubs', clubId, 'fiscal_years', fiscalYearId, 'data', 'bilan_values');
    await setDoc(docRef, {
      values: sanitizedValues,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Erreur lors de la sauvegarde des valeurs du bilan:', error);
    throw error;
  }
}

/**
 * Calculer les mouvements (transactions) pour un code de bilan
 * Retourne la somme des montants des transactions liées aux codes comptables
 * Utilise le filtrage par date (cohérent avec reportService.ts)
 */
export async function calculateMovementsForBilanCode(
  clubId: string,
  fiscalYear: FiscalYear,
  bilanCode: BilanCode
): Promise<number> {
  if (!bilanCode.accountCodes || bilanCode.accountCodes.length === 0) {
    return 0;
  }

  try {
    // Convertir les dates du fiscal year
    const { startDate, endDate } = ReportService.getFiscalYearDateRange(fiscalYear);

    // Récupérer les transactions par date (cohérent avec reportService.getTransactionsForPeriod)
    const transactionsRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
    const q = query(
      transactionsRef,
      where('date_execution', '>=', Timestamp.fromDate(startDate)),
      where('date_execution', '<=', Timestamp.fromDate(endDate)),
      orderBy('date_execution', 'asc')
    );

    const snapshot = await getDocs(q);
    let total = 0;

    snapshot.docs.forEach(doc => {
      const trans = doc.data() as TransactionBancaire;

      // Ignorer les transactions parentes (leurs enfants ont leurs propres codes)
      if (trans.is_parent) return;

      // Vérifier si le code comptable correspond
      if (trans.code_comptable && bilanCode.accountCodes?.includes(trans.code_comptable)) {
        total = round2(total + trans.montant);
      }
    });

    return total;
  } catch (error) {
    logger.error('Erreur lors du calcul des mouvements:', error);
    return 0;
  }
}

/**
 * Calculer toutes les valeurs du bilan pour une année fiscale
 */
export async function calculateAllBilanValues(
  clubId: string,
  fiscalYear: FiscalYear,
  existingValues: BilanValues[]
): Promise<BilanValues[]> {
  const bilanCodes = await getBilanCodes(clubId);

  // Créer un map des valeurs existantes
  const existingMap = new Map(existingValues.map(v => [v.bilanCodeId, v]));

  // Résultats
  const results: BilanValues[] = [];

  // Map pour stocker les valeurs calculées (pour sum_children)
  const calculatedClosing = new Map<string, number>();
  const calculatedOpening = new Map<string, number>();

  // Trier les codes par profondeur (feuilles d'abord)
  const sortedCodes = [...bilanCodes].sort((a, b) => {
    const depthA = a.code.split('.').length;
    const depthB = b.code.split('.').length;
    return depthB - depthA; // Plus profond d'abord
  });

  // Cache pour les valeurs de l'année précédente (chargé une seule fois si nécessaire)
  let previousYearOpenings: Map<string, number> | null = null;

  // Phase 1: Calculer les feuilles et les codes avec transactions
  for (const code of sortedCodes) {
    const existing = existingMap.get(code.id);
    let openingValue = existing?.openingValue ?? 0;
    let closingValue = existing?.closingValue ?? 0;
    let isManualOpening = existing?.isManualOpening ?? true;
    let isManualClosing = existing?.isManualClosing ?? true;
    let calculatedMovements = 0;
    let closingStatus: BilanValueStatus | undefined = undefined;

    // Calculer l'opening selon la source
    if (code.openingSource === 'manual') {
      // Utiliser la valeur existante ou 0
      openingValue = existing?.openingValue ?? 0;
      isManualOpening = true;
    } else if (code.openingSource === 'previous_closing') {
      // Charger la valeur de clôture de l'année précédente
      if (!previousYearOpenings) {
        // Charger une seule fois les valeurs de l'année précédente
        previousYearOpenings = await loadOpeningValuesFromPreviousYear(clubId, fiscalYear);
      }
      const prevValue = previousYearOpenings.get(code.id);
      if (prevValue !== undefined) {
        openingValue = prevValue;
        isManualOpening = false;
      } else {
        // Pas de valeur précédente, utiliser existante ou 0
        openingValue = existing?.openingValue ?? 0;
        isManualOpening = true;

        // Warning si fallback vers 0 (aucune valeur précédente trouvée)
        if (openingValue === 0 && !existing?.openingValue) {
          logger.warn(`[BilanMapping] ⚠️ Code ${code.id} (${code.name}): Pas de clôture précédente trouvée, opening = 0`);
        }
      }
    } else if (code.openingSource === 'zero') {
      // Opening est toujours 0 (utilisé pour "Résultat de l'exercice" - 04.03)
      // Le résultat de l'année précédente est transféré vers "Résultat reporté" (04.01)
      openingValue = 0;
      isManualOpening = false;
    }

    // Pour 02.02 et 02.03: utiliser opening_balances du fiscal year si renseignés
    // Ces valeurs proviennent du relevé bancaire (solde début d'année)
    // Cela permet de corriger le opening même si la clôture précédente était incorrecte
    if (code.id === '02.02' && fiscalYear.opening_balances?.bank_savings != null && fiscalYear.opening_balances.bank_savings !== 0) {
      openingValue = fiscalYear.opening_balances.bank_savings;
      isManualOpening = false;
      logger.debug(`[BilanMapping] 02.02 Compte épargne: using FY opening_balance ${openingValue}`);
    } else if (code.id === '02.03' && fiscalYear.opening_balances?.bank_current != null && fiscalYear.opening_balances.bank_current !== 0) {
      openingValue = fiscalYear.opening_balances.bank_current;
      isManualOpening = false;
      logger.debug(`[BilanMapping] 02.03 Compte à vue: using FY opening_balance ${openingValue}`);
    }

    // Calculer le closing selon le type de calcul
    switch (code.calculationType) {
      case 'sum_transactions':
        // Calculer les mouvements depuis les transactions
        calculatedMovements = await calculateMovementsForBilanCode(
          clubId,
          fiscalYear,
          code
        );

        if (code.closingSource === 'opening_plus_movements') {
          // Pour 02.02 et 02.03: utiliser closing_balances du fiscal year si renseignés
          // Ces valeurs proviennent du relevé bancaire (solde fin d'année)
          // Note: on utilise != null (pas !) pour permettre la valeur 0 comme saldo valide
          if (code.id === '02.02' && fiscalYear.closing_balances?.bank_savings != null && fiscalYear.closing_balances.bank_savings !== 0) {
            closingValue = fiscalYear.closing_balances.bank_savings;
            isManualClosing = false;
            logger.debug(`[BilanMapping] 02.02 Compte épargne: using FY closing_balance ${closingValue}`);
          } else if (code.id === '02.03' && fiscalYear.closing_balances?.bank_current != null && fiscalYear.closing_balances.bank_current !== 0) {
            closingValue = fiscalYear.closing_balances.bank_current;
            isManualClosing = false;
            logger.debug(`[BilanMapping] 02.03 Compte à vue: using FY closing_balance ${closingValue}`);
          } else {
            closingValue = round2(openingValue + calculatedMovements);
            isManualClosing = false;
          }
        } else {
          // Manual closing - utiliser la valeur existante
          closingValue = existing?.closingValue ?? 0;
          isManualClosing = true;
        }
        break;

      case 'manual':
        // Valeurs manuelles
        closingValue = existing?.closingValue ?? 0;
        isManualClosing = true;
        break;

      case 'calculated':
        // Logique spéciale (ex: Résultat reporté)
        // Utiliser la valeur manuelle
        closingValue = existing?.closingValue ?? 0;
        isManualClosing = true;
        break;

      case 'inventory_value':
        // Calculer la valeur actuelle de l'inventaire matériel
        // NIEUW: Gebruik snapshot indien beschikbaar (zoals BoutiqueStockService)
        try {
          const inventoryResult = await InventoryValueSnapshotService.getValueForBilan(clubId, fiscalYear.year);
          closingValue = inventoryResult.value;

          // Sla snapshot status op voor UI indicator
          closingStatus = {
            hasSnapshot: inventoryResult.hasSnapshot,
            isLocked: inventoryResult.isLocked,
            source: inventoryResult.isLocked ? 'snapshot_locked'
                  : inventoryResult.hasSnapshot ? 'snapshot_provisional'
                  : 'live_calculation'
          };

          // Log warning als geen locked snapshot (zoals bij boutique)
          if (!inventoryResult.hasSnapshot) {
            logger.warn(`[BilanMapping] ⚠️ Matériel ${fiscalYear.year}: Pas de clôture créée - valeur live utilisée`);
          } else if (!inventoryResult.isLocked) {
            logger.warn(`[BilanMapping] ⚠️ Matériel ${fiscalYear.year}: Clôture non verrouillée - valeur provisoire`);
          } else {
            logger.debug(`[BilanMapping] ✓ Matériel ${fiscalYear.year}: Clôture verrouillée, valeur: €${closingValue.toFixed(2)}`);
          }

          isManualClosing = false;
        } catch (error) {
          logger.error('Erreur calcul valeur inventaire:', error);
          // Fallback naar directe berekening als service faalt
          try {
            const itemTypesMap = await InventoryConfigService.getItemTypes(clubId);
            const itemTypesRecord: Record<string, typeof itemTypesMap[0]> = {};
            itemTypesMap.forEach(t => { itemTypesRecord[t.id] = t; });

            const items = await InventoryItemService.getItems(clubId);
            const summary = AmortizationService.calculateDepreciationSummary(items, itemTypesRecord);
            closingValue = summary.totalCurrentValue;
            closingStatus = { hasSnapshot: false, isLocked: false, source: 'live_calculation' };
            logger.warn('[BilanMapping] inventory_value - fallback to live calculation:', closingValue);
            isManualClosing = false;
          } catch (fallbackError) {
            logger.error('Erreur fallback calcul inventaire:', fallbackError);
            closingValue = existing?.closingValue ?? 0;
            closingStatus = { hasSnapshot: false, isLocked: false, source: 'manual' };
            isManualClosing = true;
          }
        }
        break;

      case 'pl_result':
        // Calculer le résultat du compte de résultats (P&L)
        try {
          const period = ReportService.createPeriodFromFiscalYear(fiscalYear, 'year');
          logger.debug('[BilanMapping] pl_result - period:', period);
          const plSummary = await ReportService.generateFinancialSummary(
            clubId,
            period,
            fiscalYear
          );
          logger.debug('[BilanMapping] pl_result - net_result:', plSummary.net_result);
          closingValue = plSummary.net_result;
          isManualClosing = false;
        } catch (error) {
          logger.error('Erreur calcul résultat P&L:', error);
          closingValue = existing?.closingValue ?? 0;
          isManualClosing = true;
        }
        break;

      case 'boutique_stock':
        // Calculer la valeur du stock boutique (UNIQUEMENT snapshot verrouillé)
        try {
          // boutiqueType is verplicht voor boutique_stock codes
          if (!code.boutiqueType) {
            logger.error(`[BilanMapping] BilanCode ${code.id} has calculationType 'boutique_stock' but no boutiqueType defined`);
            closingValue = existing?.closingValue ?? 0;
            closingStatus = { hasSnapshot: false, isLocked: false, source: 'manual' };
            isManualClosing = true;
            break;
          }
          const boutiqueType = code.boutiqueType;
          const boutiqueLabel = boutiqueType === 'boutique' ? 'Boutique Club' : 'Boutique LIFRAS';
          logger.debug('[BilanMapping] boutique_stock - type:', boutiqueType, 'code:', code.id, 'year:', fiscalYear.year);

          const result = await BoutiqueStockService.getValueForBilan(clubId, fiscalYear.year, boutiqueType);
          closingValue = result.value;

          // Sla snapshot status op voor UI indicator
          closingStatus = {
            hasSnapshot: result.hasSnapshot,
            isLocked: result.isLocked,
            source: result.isLocked ? 'snapshot_locked'
                  : result.hasSnapshot ? 'snapshot_provisional'
                  : 'live_calculation'
          };

          // Warning si pas de snapshot verrouillé
          if (!result.hasSnapshot) {
            logger.warn(`[BilanMapping] ⚠️ ${boutiqueLabel} ${fiscalYear.year}: Pas de clôture créée - valeur live utilisée`);
          } else if (!result.isLocked) {
            logger.warn(`[BilanMapping] ⚠️ ${boutiqueLabel} ${fiscalYear.year}: Clôture non verrouillée - valeur provisoire`);
          } else {
            logger.debug(`[BilanMapping] ✓ ${boutiqueLabel} ${fiscalYear.year}: Clôture verrouillée`);
          }

          logger.debug('[BilanMapping] boutique_stock - value:', closingValue, 'locked:', result.isLocked);
          isManualClosing = false;
        } catch (error) {
          logger.error('Erreur calcul valeur stock boutique:', error);
          closingValue = existing?.closingValue ?? 0;
          closingStatus = { hasSnapshot: false, isLocked: false, source: 'manual' };
          isManualClosing = true;
        }
        break;

      case 'bank_total':
        // Solde bancaire: opening + somme de TOUTES les transactions (non-parent)
        // Utilisé pour le Compte à vue car chaque transaction passe par la banque
        try {
          const bankPeriod = ReportService.createPeriodFromFiscalYear(fiscalYear, 'year');
          const bankSummary = await ReportService.generateFinancialSummary(
            clubId,
            bankPeriod,
            fiscalYear
          );
          calculatedMovements = bankSummary.net_result;
          closingValue = openingValue + calculatedMovements;
          isManualClosing = false;
          logger.debug(`[BilanMapping] bank_total - opening: ${openingValue}, movements: ${calculatedMovements}, closing: ${closingValue}`);
        } catch (error) {
          logger.error('Erreur calcul bank_total:', error);
          closingValue = existing?.closingValue ?? openingValue;
          isManualClosing = true;
        }
        break;

      case 'result_carryforward':
        // Résultat reporté: accumule tous les résultats des années passées
        // Opening = previous year 04.01 closing + previous year 04.03 (résultat de l'exercice)
        // Closing = opening (le résultat reporté ne change pas en cours d'année)
        try {
          if (!previousYearOpenings) {
            previousYearOpenings = await loadOpeningValuesFromPreviousYear(clubId, fiscalYear);
          }
          // Récupérer le résultat de l'exercice de l'année précédente (04.03)
          const prevYearResult = previousYearOpenings.get('04.03') ?? 0;

          // Si pas de données de l'année précédente (prevYearResult = 0 et opening vient du fallback),
          // respecter les valeurs manuelles existantes si disponibles
          const hasPreviousYearData = previousYearOpenings.size > 0 && previousYearOpenings.has('04.03');

          if (hasPreviousYearData) {
            // Calcul automatique normal
            closingValue = round2(openingValue + prevYearResult);
            isManualClosing = false;
          } else if (existing?.closingValue !== undefined && existing.closingValue !== 0) {
            // Pas de données année précédente, mais valeur manuelle existante → la respecter
            closingValue = existing.closingValue;
            isManualClosing = true;
            logger.info(`[BilanMapping] result_carryforward - pas de données précédentes, utilisation valeur manuelle: opening=${openingValue}, closing=${closingValue}`);
          } else {
            // Aucune donnée → closing = opening (pas de résultat à reporter)
            closingValue = openingValue;
            isManualClosing = false;
          }
          logger.debug(`[BilanMapping] result_carryforward - opening: ${openingValue}, prev result: ${prevYearResult}, hasPrevData: ${hasPreviousYearData}, closing: ${closingValue}`);
        } catch (error) {
          logger.error('Erreur calcul result_carryforward:', error);
          closingValue = existing?.closingValue ?? openingValue;
          isManualClosing = true;
        }
        break;

      case 'sum_children':
        // Sera calculé dans la phase 2
        break;
    }

    // Arrondir à 2 décimales pour éviter les erreurs IEEE 754
    openingValue = Math.round(openingValue * 100) / 100;
    closingValue = Math.round(closingValue * 100) / 100;
    calculatedMovements = Math.round(calculatedMovements * 100) / 100;

    // Stocker les valeurs calculées
    calculatedClosing.set(code.id, closingValue);
    calculatedOpening.set(code.id, openingValue);

    // Build result object, only include closingStatus if defined (Firestore rejects undefined)
    const resultEntry: BilanValues = {
      bilanCodeId: code.id,
      openingValue,
      closingValue,
      isManualOpening,
      isManualClosing,
      calculatedMovements,
    };
    if (closingStatus !== undefined) {
      resultEntry.closingStatus = closingStatus;
    }
    results.push(resultEntry);
  }

  // Phase 1.5: Force-balance 04.03 (Résultat de l'exercice)
  // En comptabilité ASBL, le résultat de l'exercice dans le bilan est le résultat AJUSTÉ
  // qui tient compte des régularisations, provisions et reports.
  // Le Compte de Résultats montre le résultat cash, le bilan montre le résultat comptable.
  // Formule: 04.03 = Total Actif (feuilles) - Total Passif (feuilles, hors 04.03)
  const leafCodes = sortedCodes.filter(c => c.calculationType !== 'sum_children');
  let totalActifClosingLeaf = 0;
  let totalPassifClosingLeafEx0403 = 0;

  for (const lc of leafCodes) {
    const lcClosing = calculatedClosing.get(lc.id) ?? 0;
    if (lc.section === 'actif') {
      totalActifClosingLeaf += lcClosing;
    } else if (lc.section === 'passif' && lc.id !== '04.03') {
      totalPassifClosingLeafEx0403 += lcClosing;
    }
  }

  const balancedPlResult = totalActifClosingLeaf - totalPassifClosingLeafEx0403;
  const rawPlResult = calculatedClosing.get('04.03') ?? 0;

  if (Math.abs(balancedPlResult - rawPlResult) > 0.01) {
    logger.info(`[BilanMapping] 📊 Ajustement résultat bilan: cash P&L = ${rawPlResult.toFixed(2)}, résultat bilan ajusté = ${balancedPlResult.toFixed(2)}, écart = ${(balancedPlResult - rawPlResult).toFixed(2)}`);
    logger.info(`[BilanMapping]   Cet écart vient des régularisations (03/06), provisions (05) et reports manuels`);
  }

  // Mettre à jour 04.03 avec le résultat ajusté
  calculatedClosing.set('04.03', balancedPlResult);
  const plResultIndex = results.findIndex(r => r.bilanCodeId === '04.03');
  if (plResultIndex >= 0) {
    results[plResultIndex] = {
      ...results[plResultIndex],
      closingValue: balancedPlResult,
      isManualClosing: false
    };
  }

  // Phase 2: Calculer les parents (sum_children)
  // Refaire un passage pour les sum_children maintenant que les enfants sont calculés
  for (const code of sortedCodes) {
    if (code.calculationType !== 'sum_children') continue;

    const children = getChildCodes(bilanCodes, code.id);
    let openingSum = 0;
    let closingSum = 0;

    children.forEach(child => {
      openingSum = round2(openingSum + (calculatedOpening.get(child.id) ?? 0));
      closingSum = round2(closingSum + (calculatedClosing.get(child.id) ?? 0));
    });

    // Arrondir à 2 décimales pour éviter les erreurs IEEE 754
    openingSum = Math.round(openingSum * 100) / 100;
    closingSum = Math.round(closingSum * 100) / 100;

    // Mettre à jour les valeurs
    calculatedOpening.set(code.id, openingSum);
    calculatedClosing.set(code.id, closingSum);

    // Mettre à jour le résultat
    const resultIndex = results.findIndex(r => r.bilanCodeId === code.id);
    if (resultIndex >= 0) {
      results[resultIndex] = {
        ...results[resultIndex],
        openingValue: openingSum,
        closingValue: closingSum,
        isManualOpening: false,
        isManualClosing: false
      };
    }
  }

  return results;
}

/**
 * Mettre à jour une seule valeur du bilan (pour saisie manuelle)
 */
export async function updateBilanValue(
  clubId: string,
  fiscalYearId: string,
  bilanCodeId: string,
  field: 'openingValue' | 'closingValue',
  value: number
): Promise<void> {
  const existingValues = await getBilanValues(clubId, fiscalYearId);

  const existingIndex = existingValues.findIndex(v => v.bilanCodeId === bilanCodeId);

  if (existingIndex >= 0) {
    existingValues[existingIndex] = {
      ...existingValues[existingIndex],
      [field]: value,
      [field === 'openingValue' ? 'isManualOpening' : 'isManualClosing']: true
    };
  } else {
    existingValues.push({
      bilanCodeId,
      openingValue: field === 'openingValue' ? value : 0,
      closingValue: field === 'closingValue' ? value : 0,
      isManualOpening: field === 'openingValue',
      isManualClosing: field === 'closingValue'
    });
  }

  await saveBilanValues(clubId, fiscalYearId, existingValues);
}

/**
 * Calculer le total Actif et Passif
 */
export function calculateBilanTotals(
  bilanCodes: BilanCode[],
  values: BilanValues[]
): {
  totalActifOpening: number;
  totalActifClosing: number;
  totalPassifOpening: number;
  totalPassifClosing: number;
  difference: number;
} {
  const valuesMap = new Map(values.map(v => [v.bilanCodeId, v]));

  // Seuls les codes racines (sans parent) sont comptés dans les totaux
  const rootActifCodes = bilanCodes.filter(c => c.section === 'actif' && !c.parentId);
  const rootPassifCodes = bilanCodes.filter(c => c.section === 'passif' && !c.parentId);

  let totalActifOpening = 0;
  let totalActifClosing = 0;
  let totalPassifOpening = 0;
  let totalPassifClosing = 0;

  rootActifCodes.forEach(code => {
    const v = valuesMap.get(code.id);
    if (v) {
      totalActifOpening += v.openingValue;
      totalActifClosing += v.closingValue;
    }
  });

  rootPassifCodes.forEach(code => {
    const v = valuesMap.get(code.id);
    if (v) {
      totalPassifOpening += v.openingValue;
      totalPassifClosing += v.closingValue;
    }
  });

  return {
    totalActifOpening,
    totalActifClosing,
    totalPassifOpening,
    totalPassifClosing,
    difference: totalActifClosing - totalPassifClosing
  };
}

/**
 * Charger les valeurs de clôture de l'année fiscale précédente
 * Pour initialiser les valeurs d'ouverture de l'année courante
 */
async function loadOpeningValuesFromPreviousYear(
  clubId: string,
  currentFiscalYear: FiscalYear
): Promise<Map<string, number>> {
  const openingMap = new Map<string, number>();

  try {
    // Trouver l'année précédente relative à l'année EN COURS DE CALCUL
    // (pas l'année active globale, qui peut être différente)
    const allFiscalYears = await FiscalYearService.getFiscalYears(clubId);
    const previousFY = selectPreferredFiscalYearForYear(
      allFiscalYears,
      currentFiscalYear.year - 1,
      currentFiscalYear.start_date
    ) ?? null;
    if (!previousFY) {
      return openingMap;
    }

    // Charger les valeurs de bilan de l'année précédente
    const previousBilanValues = await getBilanValues(clubId, previousFY.id);

    // Utiliser les valeurs de clôture comme valeurs d'ouverture
    for (const value of previousBilanValues) {
      openingMap.set(value.bilanCodeId, value.closingValue);
    }

    // Ajouter les soldes bancaires depuis fiscal year (pour 02.02 et 02.03)
    if (previousFY.closing_balances) {
      if (previousFY.closing_balances.bank_savings !== undefined) {
        openingMap.set('02.02', previousFY.closing_balances.bank_savings);
      }
      if (previousFY.closing_balances.bank_current !== undefined) {
        openingMap.set('02.03', previousFY.closing_balances.bank_current);
      }
    }
  } catch (error) {
    logger.error('Erreur lors du chargement des valeurs précédentes:', error);
  }

  return openingMap;
}
