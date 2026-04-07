/**
 * Service d'Amortissement - Module Inventaire CalyCompta
 *
 * Calcule les tableaux d'amortissement pour le matériel de plongée
 * selon plusieurs méthodes (conformément aux règles comptables belges PCMN).
 *
 * Méthodes supportées:
 * - Linéaire: répartition égale sur la durée de vie
 * - Dégressif: accéléré les premières années (règle belge: max 40%)
 * - Manuel: montants saisis par l'utilisateur chaque année
 *
 * Fonctionnalités:
 * - Calcul du tableau d'amortissement complet
 * - Calcul de la valeur comptable actuelle
 * - Génération des écritures comptables de dotation
 * - Alertes pour matériel entièrement amorti
 * - Verrouillage par année fiscale et par article
 */

import { Timestamp } from 'firebase/firestore';
import {
  InventoryItem,
  ItemType,
  DepreciationMethod,
  DepreciationSettings,
  DepreciationCalculationParams,
  ManualDepreciationEntry
} from '@/types/inventory';

// ===========================================
// TYPES
// ===========================================

/**
 * Une ligne du tableau d'amortissement
 */
export interface AmortizationScheduleEntry {
  fiscalYear: string;           // "2021", "2022", etc.
  fiscalYearId?: string;        // ID de l'année fiscale (ex: "FY2021")
  yearNumber: number;           // 1, 2, 3... (numéro d'année d'amortissement)
  openingValue: number;         // Valeur comptable en début d'exercice
  annualDepreciation: number;   // Dotation de l'exercice
  accumulatedDepreciation: number; // Amortissements cumulés
  closingValue: number;         // Valeur comptable en fin d'exercice
  isCurrentYear: boolean;       // Année en cours
  isProRata: boolean;           // Pro-rata temporis (première/dernière année)
  isLocked: boolean;            // Année verrouillée (impossible à modifier)
  isManual: boolean;            // Entrée manuelle (method='manual')
  canEdit: boolean;             // Peut être édité (basé sur locking et permissions)
  justification?: string;       // Notes pour entrée manuelle
  method: DepreciationMethod;   // Méthode utilisée pour cette année
}

/**
 * Tableau d'amortissement complet
 */
export interface AmortizationSchedule {
  itemId: string;
  itemCode: string;
  itemName: string;
  purchaseDate: Date;
  startDate: Date;              // Date de début (peut différer de purchaseDate)
  purchaseValue: number;
  depreciationMethod: DepreciationMethod;
  lifespan: number;             // Durée de vie en années
  annualRate: number;           // Taux annuel (%)
  residualValue: number;        // Valeur résiduelle
  entries: AmortizationScheduleEntry[];
  currentBookValue: number;     // Valeur nette comptable actuelle
  accumulatedDepreciation: number; // Total amorti à ce jour
  isFullyDepreciated: boolean;  // Entièrement amorti?
  percentDepreciated: number;   // Pourcentage amorti
  hasLockedYears: boolean;      // A des années verrouillées?
  lockedYearIds: string[];      // IDs des années verrouillées
  isItemLocked: boolean;        // Article entièrement verrouillé?
}

/**
 * Résumé pour un groupe d'articles
 */
export interface DepreciationSummary {
  totalPurchaseValue: number;
  totalCurrentValue: number;
  totalAccumulatedDepreciation: number;
  percentDepreciated: number;
  itemCount: number;
  fullyDepreciatedCount: number;
}

/**
 * Écriture comptable de dotation aux amortissements
 */
export interface DepreciationJournalEntry {
  date: Date;
  fiscalYear: string;
  description: string;
  debitAccount: string;         // Compte 630-xx-xxx (Dotations)
  debitAmount: number;
  creditAccount: string;        // Compte 260-xx-xxx (Amortissements actés)
  creditAmount: number;
  itemIds: string[];            // Articles concernés
}

// ===========================================
// SERVICE
// ===========================================

export class AmortizationService {

  // ========================================
  // EFFECTIVE SETTINGS (ITEM > TYPE)
  // ========================================

  /**
   * Obtenir les paramètres effectifs d'amortissement pour un article
   * Priorité: override de l'article > defaults du type > valeurs par défaut
   */
  static getEffectiveSettings(item: InventoryItem, itemType: ItemType): DepreciationCalculationParams {
    // Defaults du type
    const typeDepreciation = itemType.depreciation || {
      method: 'linear' as DepreciationMethod,
      lifespan: itemType.lifespan || 10,
      depreciationRate: itemType.depreciationRate,
      residualValue: 0,
      useCustomStartDate: false
    };

    // Override de l'article
    const override = item.depreciation_override;

    // Date d'achat
    const purchaseDate = item.date_achat instanceof Timestamp
      ? item.date_achat.toDate()
      : new Date(item.date_achat);

    // Date de début (peut être différente de la date d'achat)
    let startDate = purchaseDate;
    if (override?.startDate) {
      startDate = override.startDate instanceof Timestamp
        ? override.startDate.toDate()
        : new Date(override.startDate);
    }

    return {
      purchaseValue: item.valeur_achat,
      purchaseDate,
      startDate: startDate !== purchaseDate ? startDate : undefined,
      method: override?.method || typeDepreciation.method,
      lifespan: override?.lifespan || typeDepreciation.lifespan,
      depreciationRate: override?.depreciationRate || typeDepreciation.depreciationRate,
      residualValue: override?.residualValue ?? typeDepreciation.residualValue ?? 0,
      manualEntries: item.manual_depreciation_entries
    };
  }

  // ========================================
  // CALCULS DE BASE - LINÉAIRE
  // ========================================

  /**
   * Calculer l'amortissement linéaire annuel
   */
  static calculateLinearDepreciation(
    purchaseValue: number,
    lifespan: number,
    residualValue: number = 0
  ): number {
    if (lifespan <= 0 || purchaseValue <= residualValue) return 0;
    return (purchaseValue - residualValue) / lifespan;
  }

  /**
   * Legacy: Calculer l'amortissement linéaire annuel (sans valeur résiduelle)
   */
  static calculateAnnualDepreciation(purchaseValue: number, lifespan: number): number {
    return this.calculateLinearDepreciation(purchaseValue, lifespan, 0);
  }

  /**
   * Calculer le pro-rata temporis pour la première année
   * Règle belge: amortissement au prorata des mois complets
   */
  static calculateProRataFirstYear(
    purchaseDate: Date,
    annualDepreciation: number
  ): number {
    const purchaseMonth = purchaseDate.getMonth(); // 0-11
    const remainingMonths = 12 - purchaseMonth;
    return (annualDepreciation * remainingMonths) / 12;
  }

  // ========================================
  // CALCULS DE BASE - DÉGRESSIF
  // ========================================

  /**
   * Calculer l'amortissement dégressif pour une année
   * Règle belge: taux dégressif = 2x taux linéaire, max 40%
   * Passage au linéaire quand linéaire > dégressif
   */
  static calculateDegressiveDepreciation(
    bookValue: number,
    purchaseValue: number,
    yearNumber: number,
    lifespan: number,
    customRate?: number,
    residualValue: number = 0
  ): number {
    if (bookValue <= residualValue) return 0;

    // Taux linéaire de base
    const linearRate = 100 / lifespan;

    // Taux dégressif: 2x linéaire ou personnalisé, max 40% (règle belge)
    const degressiveRate = Math.min(customRate || (linearRate * 2), 40) / 100;

    // Montant dégressif
    const degressiveAmount = bookValue * degressiveRate;

    // Montant linéaire pour les années restantes (pour comparaison)
    const remainingValue = bookValue - residualValue;
    const remainingYears = Math.max(1, lifespan - yearNumber + 1);
    const straightLineRemaining = remainingValue / remainingYears;

    // Règle belge: utiliser le montant le plus élevé (passage automatique au linéaire)
    const depreciation = Math.max(degressiveAmount, straightLineRemaining);

    // Ne pas dépasser la valeur restante
    return Math.min(depreciation, remainingValue);
  }

  /**
   * Calculer la valeur comptable nette à une date donnée
   */
  static calculateCurrentBookValue(
    purchaseValue: number,
    purchaseDate: Date,
    lifespan: number,
    asOfDate: Date = new Date()
  ): { currentValue: number; accumulatedDepreciation: number; percentDepreciated: number } {
    if (purchaseValue <= 0 || lifespan <= 0) {
      return {
        currentValue: 0,
        accumulatedDepreciation: 0,
        percentDepreciated: 100
      };
    }

    const annualDepreciation = purchaseValue / lifespan;
    const purchaseYear = purchaseDate.getFullYear();
    const currentYear = asOfDate.getFullYear();

    let accumulatedDepreciation = 0;

    // Première année (pro-rata)
    if (currentYear > purchaseYear) {
      accumulatedDepreciation += this.calculateProRataFirstYear(purchaseDate, annualDepreciation);
    } else if (currentYear === purchaseYear) {
      // Même année que l'achat - pro-rata partiel
      const monthsElapsed = asOfDate.getMonth() - purchaseDate.getMonth() + 1;
      accumulatedDepreciation = (annualDepreciation * Math.max(0, monthsElapsed)) / 12;
    }

    // Années complètes intermédiaires
    const fullYearsAfterFirst = Math.max(0, currentYear - purchaseYear - 1);
    accumulatedDepreciation += fullYearsAfterFirst * annualDepreciation;

    // Année en cours (si pas la première)
    if (currentYear > purchaseYear) {
      const monthsInCurrentYear = asOfDate.getMonth() + 1;
      accumulatedDepreciation += (annualDepreciation * monthsInCurrentYear) / 12;
    }

    // Ne pas dépasser la valeur d'achat
    accumulatedDepreciation = Math.min(accumulatedDepreciation, purchaseValue);
    const currentValue = Math.max(0, purchaseValue - accumulatedDepreciation);
    const percentDepreciated = (accumulatedDepreciation / purchaseValue) * 100;

    return {
      currentValue: Math.round(currentValue * 100) / 100,
      accumulatedDepreciation: Math.round(accumulatedDepreciation * 100) / 100,
      percentDepreciated: Math.round(percentDepreciated * 10) / 10
    };
  }

  // ========================================
  // VERROUILLAGE / LOCKING
  // ========================================

  /**
   * Vérifier si une année est verrouillée pour un article
   */
  static isYearLocked(
    fiscalYear: number,
    item: InventoryItem,
    closedFiscalYears?: number[]
  ): boolean {
    // Verrouillage complet de l'article
    if (item.depreciation_locked) return true;

    // Verrouillage spécifique de l'année sur l'article
    const fiscalYearId = `FY${fiscalYear}`;
    if (item.depreciation_locked_years?.includes(fiscalYearId)) return true;

    // Année fiscale clôturée
    if (closedFiscalYears?.includes(fiscalYear)) return true;

    return false;
  }

  /**
   * Vérifier si l'amortissement peut être modifié
   */
  static canModifyDepreciation(
    item: InventoryItem,
    fiscalYear: number,
    userRole?: string,
    closedFiscalYears?: number[]
  ): { canModify: boolean; reason?: string } {
    // Verrouillage complet de l'article
    if (item.depreciation_locked) {
      return { canModify: false, reason: 'Article verrouillé pour amortissement' };
    }

    // Verrouillage spécifique de l'année
    const fiscalYearId = `FY${fiscalYear}`;
    if (item.depreciation_locked_years?.includes(fiscalYearId)) {
      return { canModify: false, reason: 'Année fiscale verrouillée pour cet article' };
    }

    // Année fiscale clôturée (admins peuvent encore modifier)
    if (closedFiscalYears?.includes(fiscalYear)) {
      const adminRoles = ['admin', 'validateur', 'superadmin'];
      if (!adminRoles.includes(userRole || '')) {
        return { canModify: false, reason: 'Année fiscale clôturée - contactez un administrateur' };
      }
    }

    return { canModify: true };
  }

  // ========================================
  // TABLEAU D'AMORTISSEMENT
  // ========================================

  /**
   * Générer le tableau d'amortissement complet pour un article
   * Supporte: linéaire, dégressif, manuel
   */
  static generateAmortizationSchedule(
    item: InventoryItem,
    itemType: ItemType,
    closedFiscalYears?: number[]
  ): AmortizationSchedule | null {
    // Vérifier les données requises
    if (!item.valeur_achat || item.valeur_achat <= 0 || !item.date_achat) {
      return null;
    }

    // Obtenir les paramètres effectifs
    const settings = this.getEffectiveSettings(item, itemType);
    const { purchaseValue, purchaseDate, method, lifespan, depreciationRate, residualValue } = settings;
    const startDate = settings.startDate || purchaseDate;

    // Déterminer l'année de départ
    const startYear = startDate.getFullYear();
    const currentYear = new Date().getFullYear();

    // Préparer les entrées manuelles pour lookup rapide
    const manualEntriesMap = new Map<number, ManualDepreciationEntry>();
    if (method === 'manual' && item.manual_depreciation_entries) {
      item.manual_depreciation_entries.forEach(entry => {
        manualEntriesMap.set(entry.fiscalYear, entry);
      });
    }

    // Générer le schedule
    const schedule: AmortizationScheduleEntry[] = [];
    let accumulatedDep = 0;
    let remainingValue = purchaseValue;
    const lockedYearIds: string[] = [];

    // Amortissement linéaire annuel (pour référence)
    const linearAnnual = this.calculateLinearDepreciation(purchaseValue, lifespan, residualValue);

    for (let year = 0; year <= lifespan; year++) {
      const fiscalYear = startYear + year;
      const fiscalYearId = `FY${fiscalYear}`;
      let yearDepreciation: number;
      let isProRata = false;
      let isManual = false;
      let justification: string | undefined;

      // Vérifier le verrouillage
      const isLocked = this.isYearLocked(fiscalYear, item, closedFiscalYears);
      if (isLocked) {
        lockedYearIds.push(fiscalYearId);
      }

      // Calculer l'amortissement selon la méthode
      if (method === 'manual') {
        // Méthode manuelle: utiliser l'entrée si disponible
        const manualEntry = manualEntriesMap.get(fiscalYear);
        if (manualEntry) {
          yearDepreciation = manualEntry.amount;
          isManual = true;
          justification = manualEntry.justification;
        } else {
          // Pas d'entrée manuelle = 0 (l'utilisateur doit saisir)
          yearDepreciation = 0;
        }
      } else if (method === 'degressive') {
        // Méthode dégressive
        if (year === 0) {
          // Première année: pro-rata du dégressif
          const fullYearDegressive = this.calculateDegressiveDepreciation(
            remainingValue,
            purchaseValue,
            year + 1,
            lifespan,
            depreciationRate,
            residualValue
          );
          yearDepreciation = this.calculateProRataFirstYear(startDate, fullYearDegressive);
          isProRata = true;
        } else {
          yearDepreciation = this.calculateDegressiveDepreciation(
            remainingValue,
            purchaseValue,
            year + 1,
            lifespan,
            depreciationRate,
            residualValue
          );
        }
      } else {
        // Méthode linéaire (défaut)
        if (year === 0) {
          yearDepreciation = this.calculateProRataFirstYear(startDate, linearAnnual);
          isProRata = true;
        } else if (year === lifespan) {
          yearDepreciation = Math.min(remainingValue, linearAnnual);
        } else {
          yearDepreciation = linearAnnual;
        }
      }

      // Ne pas dépasser la valeur restante (sauf pour manuel qui peut être 0)
      if (method !== 'manual') {
        yearDepreciation = Math.min(yearDepreciation, Math.max(0, remainingValue - residualValue));
      }

      // Stop si entièrement amorti
      if (yearDepreciation <= 0 && remainingValue <= residualValue && method !== 'manual') {
        break;
      }

      accumulatedDep += yearDepreciation;
      const closingValue = Math.max(residualValue, purchaseValue - accumulatedDep);

      schedule.push({
        fiscalYear: fiscalYear.toString(),
        fiscalYearId,
        yearNumber: year + 1,
        openingValue: Math.round(remainingValue * 100) / 100,
        annualDepreciation: Math.round(yearDepreciation * 100) / 100,
        accumulatedDepreciation: Math.round(accumulatedDep * 100) / 100,
        closingValue: Math.round(closingValue * 100) / 100,
        isCurrentYear: fiscalYear === currentYear,
        isProRata,
        isLocked,
        isManual,
        canEdit: !isLocked && (method === 'manual' || fiscalYear >= currentYear),
        justification,
        method
      });

      remainingValue = closingValue;

      // Stop pour méthode calculée si atteint la valeur résiduelle
      if (method !== 'manual' && remainingValue <= residualValue) break;
    }

    // Calculer la valeur actuelle (pour méthode manuelle, utiliser les entrées)
    let currentBookValue: number;
    let totalAccumulatedDepreciation: number;

    if (method === 'manual') {
      // Pour manuel, calculer depuis les entrées
      totalAccumulatedDepreciation = schedule
        .filter(e => parseInt(e.fiscalYear) <= currentYear)
        .reduce((sum, e) => sum + e.annualDepreciation, 0);
      currentBookValue = Math.max(residualValue, purchaseValue - totalAccumulatedDepreciation);
    } else {
      // Pour calculé, utiliser la fonction standard
      const bookValue = this.calculateCurrentBookValue(purchaseValue, startDate, lifespan);
      currentBookValue = Math.max(residualValue, bookValue.currentValue);
      totalAccumulatedDepreciation = bookValue.accumulatedDepreciation;
    }

    const depreciableAmount = purchaseValue - residualValue;
    const percentDepreciated = depreciableAmount > 0
      ? (totalAccumulatedDepreciation / depreciableAmount) * 100
      : 0;

    return {
      itemId: item.id,
      itemCode: item.code || item.numero_serie || '',
      itemName: item.nom || `${itemType.nom} ${item.numero_serie}`,
      purchaseDate,
      startDate,
      purchaseValue,
      depreciationMethod: method,
      lifespan,
      annualRate: method === 'degressive'
        ? Math.min(depreciationRate || (200 / lifespan), 40)
        : 100 / lifespan,
      residualValue,
      entries: schedule,
      currentBookValue: Math.round(currentBookValue * 100) / 100,
      accumulatedDepreciation: Math.round(totalAccumulatedDepreciation * 100) / 100,
      isFullyDepreciated: currentBookValue <= residualValue,
      percentDepreciated: Math.round(Math.min(100, percentDepreciated) * 10) / 10,
      hasLockedYears: lockedYearIds.length > 0,
      lockedYearIds,
      isItemLocked: item.depreciation_locked || false
    };
  }

  // ========================================
  // CALCULS AGRÉGÉS
  // ========================================

  /**
   * Calculer le résumé d'amortissement pour un ensemble d'articles
   */
  static calculateDepreciationSummary(
    items: InventoryItem[],
    itemTypes: Record<string, ItemType>
  ): DepreciationSummary {
    let totalPurchaseValue = 0;
    let totalCurrentValue = 0;
    let totalAccumulatedDepreciation = 0;
    let fullyDepreciatedCount = 0;

    items.forEach(item => {
      const itemType = itemTypes[item.typeId];
      if (!itemType || !item.valeur_achat || !item.date_achat) {
        // Article sans données d'achat = entièrement amorti
        fullyDepreciatedCount++;
        return;
      }

      const purchaseDate = item.date_achat instanceof Timestamp
        ? item.date_achat.toDate()
        : new Date(item.date_achat);

      const lifespan = itemType.lifespan || 10;
      const { currentValue, accumulatedDepreciation } =
        this.calculateCurrentBookValue(item.valeur_achat, purchaseDate, lifespan);

      totalPurchaseValue += item.valeur_achat;
      totalCurrentValue += currentValue;
      totalAccumulatedDepreciation += accumulatedDepreciation;

      if (currentValue === 0) {
        fullyDepreciatedCount++;
      }
    });

    const percentDepreciated = totalPurchaseValue > 0
      ? (totalAccumulatedDepreciation / totalPurchaseValue) * 100
      : 0;

    return {
      totalPurchaseValue: Math.round(totalPurchaseValue * 100) / 100,
      totalCurrentValue: Math.round(totalCurrentValue * 100) / 100,
      totalAccumulatedDepreciation: Math.round(totalAccumulatedDepreciation * 100) / 100,
      percentDepreciated: Math.round(percentDepreciated * 10) / 10,
      itemCount: items.length,
      fullyDepreciatedCount
    };
  }

  /**
   * Calculer la dotation aux amortissements pour une année fiscale
   */
  static calculateAnnualDepreciationExpense(
    items: InventoryItem[],
    itemTypes: Record<string, ItemType>,
    fiscalYear: number
  ): { total: number; byType: Record<string, number> } {
    const byType: Record<string, number> = {};
    let total = 0;

    items.forEach(item => {
      const itemType = itemTypes[item.typeId];
      if (!itemType || !item.valeur_achat || !item.date_achat) return;

      const schedule = this.generateAmortizationSchedule(item, itemType);
      if (!schedule) return;

      const yearEntry = schedule.entries.find((e: AmortizationScheduleEntry) => e.fiscalYear === fiscalYear.toString());
      if (!yearEntry) return;

      const amount = yearEntry.annualDepreciation;
      total += amount;

      if (!byType[item.typeId]) {
        byType[item.typeId] = 0;
      }
      byType[item.typeId] += amount;
    });

    // Arrondir les résultats
    Object.keys(byType).forEach(key => {
      byType[key] = Math.round(byType[key] * 100) / 100;
    });

    return {
      total: Math.round(total * 100) / 100,
      byType
    };
  }

  // ========================================
  // ÉCRITURES COMPTABLES
  // ========================================

  /**
   * Générer l'écriture comptable de dotation aux amortissements
   * pour une année fiscale
   */
  static generateDepreciationJournalEntry(
    items: InventoryItem[],
    itemTypes: Record<string, ItemType>,
    fiscalYear: number
  ): DepreciationJournalEntry | null {
    const { total, byType } = this.calculateAnnualDepreciationExpense(items, itemTypes, fiscalYear);

    if (total <= 0) return null;

    // Déterminer le compte en fonction du type principal
    // Pour simplifier, on utilise un compte général
    const debitAccount = '630-00-005';  // Dotations aux amortissements - Divers
    const creditAccount = '260-00-005'; // Amortissements matériel - Divers

    return {
      date: new Date(fiscalYear, 11, 31), // 31/12 de l'année fiscale
      fiscalYear: fiscalYear.toString(),
      description: `Dotation aux amortissements matériel de plongée - Exercice ${fiscalYear}`,
      debitAccount,
      debitAmount: total,
      creditAccount,
      creditAmount: total,
      itemIds: items.filter(i => i.valeur_achat && i.date_achat).map(i => i.id)
    };
  }

  // ========================================
  // UTILITAIRES
  // ========================================

  /**
   * Vérifier si un article est entièrement amorti
   * Utilise les paramètres effectifs (item override > type defaults)
   */
  static isFullyDepreciated(item: InventoryItem, itemType: ItemType): boolean {
    if (!item.valeur_achat || !item.date_achat) return true;

    const schedule = this.generateAmortizationSchedule(item, itemType);
    return schedule?.isFullyDepreciated ?? true;
  }

  /**
   * Calculer la valeur actuelle d'un article pour affichage
   * Utilise les paramètres effectifs (item override > type defaults)
   */
  static getItemCurrentValue(item: InventoryItem, itemType: ItemType): number {
    if (!item.valeur_achat || !item.date_achat) return 0;

    const schedule = this.generateAmortizationSchedule(item, itemType);
    return schedule?.currentBookValue ?? 0;
  }

  /**
   * Obtenir le libellé de la méthode d'amortissement
   */
  static getMethodLabel(method: DepreciationMethod): string {
    switch (method) {
      case 'linear': return 'Linéaire';
      case 'degressive': return 'Dégressif';
      case 'manual': return 'Manuel';
      default: return 'Inconnu';
    }
  }

  /**
   * Calculer le taux dégressif recommandé (règle belge)
   */
  static getRecommendedDegressiveRate(lifespan: number): number {
    // Règle belge: 2x le taux linéaire, max 40%
    return Math.min((100 / lifespan) * 2, 40);
  }

  /**
   * Formater un montant en euros
   */
  static formatCurrency(amount: number): string {
    return new Intl.NumberFormat('fr-BE', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  }

  /**
   * Formater un pourcentage
   */
  static formatPercent(percent: number): string {
    return `${percent.toFixed(1)}%`;
  }
}
