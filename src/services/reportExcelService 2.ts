import { logger } from '@/utils/logger';
/**
 * Service de génération du Compte de Résultats CDC en Excel
 *
 * Génère un fichier Excel structuré par groupes de codes comptables
 * avec données mensuelles et totaux YTD
 */

// ExcelJS is loaded dynamically to reduce initial bundle size
import type ExcelJS from 'exceljs';
import { ReportGroup, TransactionBancaire, FiscalYear, BilanCode, BilanValues } from '@/types';
import type { BoutiqueItem } from '@/types/boutique';
import { getReportGroups } from './reportGroupService';
import { ReportService } from './reportService';
import { AccountCodeService } from '@/services/accountCodeService';
import { calypsoAccountCodes } from '@/config/calypso-accounts';
import { getBilanCodes, getChildCodes } from './bilanCodeService';
import { getBilanValues, calculateAllBilanValues } from './bilanMappingService';
import { BoutiqueStockService } from './boutiqueStockService';
import { FiscalYearService } from './fiscalYearService';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

// Helper: arrondi à 2 décimales pour éviter les erreurs de virgule flottante IEEE 754
const round2 = (n: number): number => Math.round(n * 100) / 100;

// ============================================================
// OFFICIAL LABEL OVERRIDES — Correcties codes comptables 2025
// Firestore-labels die afwijken van het officiële boekhoudplan
// ============================================================
const LABEL_OVERRIDES: Record<string, string> = {
  // Cotisation codes: Firestore is 1 positie verschoven t.o.v. officieel 2025
  '730-00-712': 'Cotisation instructeur (V)',
  '730-00-713': 'Cotisation administrateur (V)',
  '730-00-714': 'Cotisation nageur (V)',
  '730-00-715': 'Cotisation autre (ex 2ème appartenance) (V)',
  // Boutique stock label: Firestore voegt "Calypso" toe, officieel niet
  '600-00-641': 'Stock Boutique',
};

// Codes in Firestore die NIET in het officiële boekhoudplan 2025 staan
const EXCLUDED_CODES = new Set([
  '601-00-624',  // Niet in officieel plan
  '614-00-629',  // Niet in officieel plan
  '620-00-664',  // Niet in officieel plan
  '730-00-716',  // Niet in officieel plan
]);

// Codes die WEL in het officieel staan maar ontbreken in Firestore
const EXTRA_OFFICIAL_CODES: Array<{code: string; label: string; type: 'expense' | 'revenue' | 'asset' | 'liability'; categories?: string[]}> = [
  { code: '657-00-760', label: 'Intérêt des comptes', type: 'revenue', categories: ['frais_bancaires'] },
];

/**
 * Haalt account codes op met officiële label overrides toegepast.
 * Filtert codes die niet in het officieel plan staan en voegt ontbrekende toe.
 * Gebruik dit ALTIJD in plaats van rechtstreeks AccountCodeService.getAllCodes().
 */
function getOfficialAccountCodes() {
  const raw = AccountCodeService.isReady()
    ? AccountCodeService.getAllCodes()
    : calypsoAccountCodes;

  const result = [
    ...raw
      .filter(ac => !EXCLUDED_CODES.has(ac.code))
      .map(ac => ({
        ...ac,
        label: LABEL_OVERRIDES[ac.code] || ac.label,
      })),
    // Voeg ontbrekende codes toe (alleen als ze nog niet bestaan)
    ...EXTRA_OFFICIAL_CODES.filter(ec => !raw.some(ac => ac.code === ec.code)),
  ];

  return result;
}

/**
 * Lookup een label voor een code met override toegepast.
 * Voor gebruik in GL courant en andere plekken die individuele codes opzoeken.
 */
function getOfficialLabel(code: string, firestoreLabel: string): string {
  return LABEL_OVERRIDES[code] || firestoreLabel;
}

/**
 * Helper: corrige le timezone offset pour ExcelJS.
 * ExcelJS écrit les dates en UTC, mais nos dates Firestore sont en heure locale (CET/CEST).
 * On ajoute l'offset timezone pour que la date apparaisse correctement dans Excel.
 */
function excelDate(d: Date): Date {
  const offset = d.getTimezoneOffset(); // minutes (négatif pour CET: -60)
  return new Date(d.getTime() - offset * 60000);
}

/**
 * Convert a date to a clean midnight-UTC value for Excel.
 * Firestore dates may be stored as UTC midnight (00:00 UTC) or CET midnight (23:00 UTC).
 * ExcelJS uses UTC internally, so we round to the nearest midnight UTC:
 *   - 00:00-11:59 UTC → same day midnight (handles UTC-stored dates)
 *   - 12:00-23:59 UTC → next day midnight (handles CET/CEST-stored dates)
 */
function dateOnly(d: Date): Date {
  const hours = d.getUTCHours();
  if (hours >= 12) {
    // Round up to next day midnight UTC (e.g., 23:00 UTC → next day 00:00 UTC)
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
  }
  // Round down to current day midnight UTC
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Format a date as DD/MM/YYYY text string using dateOnly normalization + UTC formatting.
 * This avoids the double-compensation that happens with format(dateOnly(d)) in CET timezone.
 */
function formatDateText(d: Date): string {
  const normalized = dateOnly(d);
  const dd = String(normalized.getUTCDate()).padStart(2, '0');
  const mm = String(normalized.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = normalized.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Format a bank transaction date as DD/MM/YYYY text.
 * Firestore stores dates as midnight local time:
 *   - CET (winter): midnight = 23:00 UTC → bank date = UTC date + 1
 *   - CEST (summer): midnight = 22:00 UTC → bank date = UTC date (same day)
 * Only adds +1 day when UTC hours = 23 (CET midnight).
 */
function formatBankDate(d: Date): string {
  const h = d.getUTCHours();
  if (h >= 23) {
    // CET midnight (23:00 UTC) → bank date is next UTC day
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
    return `${String(next.getUTCDate()).padStart(2, '0')}/${String(next.getUTCMonth() + 1).padStart(2, '0')}/${next.getUTCFullYear()}`;
  }
  // CEST midnight (22:00 UTC) or midnight UTC → bank date = UTC date
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

/**
 * Try to convert a string to a number if it looks like a pure numeric value.
 * Used for bank communication fields where Excel stores numeric-looking strings as numbers.
 */
function tryNumeric(val: string | null | undefined): string | number | null {
  if (!val) return null;
  // Only convert strings that are pure digits (no spaces, dashes, letters)
  if (/^\d+$/.test(val.trim())) {
    const n = Number(val.trim());
    if (!isNaN(n) && isFinite(n)) return n;
  }
  return val;
}

// TODO: 89 transacties in Firestore hebben een verkeerde code_comptable.
// Deze moeten in de database worden aangepast (niet via code mapping in de export).
// Mapping (Firestore → Correct):
//   730-00-712 → 730-00-711 (58x)
//   601-00-624 → 612-00-624 (9x)
//   730-00-714 → 730-00-713 (8x)
//   730-00-713 → 730-00-712 (8x)
//   730-00-716 → 730-00-715 (5x)
//   730-00-715 → 730-00-714 (1x)

// Couleurs Calypso (sans le préfixe # pour ExcelJS ARGB)
const CALYPSO_COLORS = {
  blue: 'FF006994',        // Bleu principal
  blueLight: 'FF0084B8',   // Bleu clair
  blueDark: 'FF004A6B',    // Bleu foncé
  aqua: 'FF00A5CF',        // Aqua
  aquaLight: 'FF33B9D9',   // Aqua clair
  // Couleurs dérivées pour les fonds
  headerBg: 'FF006994',    // Header background (bleu principal)
  groupBg: 'FFE6F3F7',     // Groupe background (bleu très clair)
  totalBg: 'FFCCE7EE',     // Total background (aqua très clair)
  subtotalBg: 'FFE6F3F7',  // Sous-total background
  white: 'FFFFFFFF',
  editableYellow: 'FFFFF3CD',
};

// Noms des mois en français — exporté pour usage futur
export const MONTH_NAMES_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

/**
 * Charge le logo Calypso et l'ajoute au workbook
 */
async function addLogoToWorkbook(workbook: ExcelJS.Workbook): Promise<number | null> {
  try {
    // Charger le logo depuis le dossier public
    const response = await fetch('/logo-vertical.png');
    if (!response.ok) {
      logger.warn('Logo non trouvé, génération sans logo');
      return null;
    }
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    const imageId = workbook.addImage({
      base64: base64,
      extension: 'png',
    });

    return imageId;
  } catch (error) {
    logger.warn('Erreur chargement logo:', error);
    return null;
  }
}

/**
 * Ajoute le logo à une feuille Excel
 */
function addLogoToSheet(
  sheet: ExcelJS.Worksheet,
  imageId: number,
  startCol: number = 0,
  startRow: number = 0
): void {
  sheet.addImage(imageId, {
    tl: { col: startCol, row: startRow },
    ext: { width: 80, height: 100 }
  });
}

interface AccountCodeData {
  code: string;
  label: string;
  monthlyAmounts: number[]; // 12 months
  ytd: number;
  budget?: number;
}

interface GroupData {
  group: ReportGroup;
  accounts: AccountCodeData[];
  monthlyTotals: number[];
  ytdTotal: number;
  budgetTotal: number;
}

/**
 * Agrège les transactions par code comptable et par mois
 * Supporte à la fois:
 * - L'ancien système split_details (déprécié)
 * - Le nouveau système parent-child transactions
 */
function aggregateTransactionsByCodeAndMonth(
  transactions: TransactionBancaire[],
  fiscalYearStart: Date
): Map<string, number[]> {
  const codeMonthlyMap = new Map<string, number[]>();

  // Helper pour calculer le mois fiscal
  const calculateFiscalMonth = (transDate: Date): number => {
    const fiscalYearStartMonth = fiscalYearStart.getMonth();
    const transMonth = transDate.getMonth();

    let monthIndex: number;
    if (fiscalYearStartMonth <= transMonth) {
      monthIndex = transMonth - fiscalYearStartMonth;
    } else {
      // La transaction est dans l'année civile suivante
      monthIndex = 12 - fiscalYearStartMonth + transMonth;
    }

    return monthIndex;
  };

  // Helper pour ajouter un montant à un code
  const addToCode = (code: string, amount: number, monthIndex: number) => {
    if (monthIndex < 0 || monthIndex > 11) {
      return; // Hors période fiscale
    }
    if (!codeMonthlyMap.has(code)) {
      codeMonthlyMap.set(code, new Array(12).fill(0));
    }
    const monthlyData = codeMonthlyMap.get(code)!;
    monthlyData[monthIndex] = round2(monthlyData[monthIndex] + amount);
  };

  transactions.forEach(trans => {
    const transDate = trans.date_execution;
    const monthIndex = calculateFiscalMonth(transDate);

    // Nouveau système: is_parent = true signifie que les children ont les codes
    // On ignore les parents car leurs montants sont déjà comptés via les children
    if (trans.is_parent) {
      return; // Skip parent transactions - children will be counted separately
    }

    // Child transaction (nouveau système) ou transaction normale
    // Une child transaction a parent_transaction_id et son propre code_comptable
    if (trans.parent_transaction_id) {
      // C'est une child transaction - utiliser son code_comptable directement
      if (trans.code_comptable) {
        addToCode(trans.code_comptable, trans.montant, monthIndex);
      }
      return;
    }

    // Ancien système: split_details (pour backward compatibility)
    const transAny = trans as unknown as Record<string, unknown>;
    if (trans.is_split && transAny.split_details && Array.isArray(transAny.split_details) && (transAny.split_details as unknown[]).length > 0) {
      (transAny.split_details as Array<{ code_comptable?: string; montant: number }>).forEach(split => {
        if (split.code_comptable) {
          addToCode(split.code_comptable, split.montant, monthIndex);
        }
      });
      return;
    }

    // Transaction simple avec code comptable
    if (trans.code_comptable) {
      addToCode(trans.code_comptable, trans.montant, monthIndex);
    }
  });

  return codeMonthlyMap;
}

/**
 * Prépare les données pour chaque groupe
 */
function prepareGroupData(
  groups: ReportGroup[],
  codeMonthlyMap: Map<string, number[]>
): GroupData[] {
  const accountCodes = getOfficialAccountCodes();
  const accountCodeMap = new Map(accountCodes.map(ac => [ac.code, ac]));

  return groups.map(group => {
    // Sort by plan compta code (last segment)
    const sortedCodes = [...group.accountCodes].sort((a, b) => {
      const lastA = a.split('-').pop() || '';
      const lastB = b.split('-').pop() || '';
      return lastA.localeCompare(lastB);
    });

    const accounts: AccountCodeData[] = sortedCodes.map(code => {
      const accountInfo = accountCodeMap.get(code);
      const monthlyAmounts = codeMonthlyMap.get(code) || new Array(12).fill(0);
      const ytd = round2(monthlyAmounts.reduce((sum, val) => sum + val, 0));

      return {
        code,
        label: accountInfo?.label || code,
        monthlyAmounts,
        ytd,
        budget: 0 // TODO: intégrer le budget si disponible
      };
    });

    // Calculer les totaux du groupe
    const monthlyTotals = new Array(12).fill(0);
    let ytdTotal = 0;
    let budgetTotal = 0;

    accounts.forEach(account => {
      account.monthlyAmounts.forEach((amount, idx) => {
        monthlyTotals[idx] = round2(monthlyTotals[idx] + amount);
      });
      ytdTotal = round2(ytdTotal + account.ytd);
      budgetTotal = round2(budgetTotal + (account.budget || 0));
    });

    return {
      group,
      accounts,
      monthlyTotals,
      ytdTotal,
      budgetTotal
    };
  });
}

/**
 * Style pour les cellules d'en-tête
 */
function applyHeaderStyle(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, color: { argb: CALYPSO_COLORS.white } };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: CALYPSO_COLORS.headerBg }
  };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.border = {
    top: { style: 'thin', color: { argb: CALYPSO_COLORS.blueDark } },
    left: { style: 'thin', color: { argb: CALYPSO_COLORS.blueDark } },
    bottom: { style: 'thin', color: { argb: CALYPSO_COLORS.blueDark } },
    right: { style: 'thin', color: { argb: CALYPSO_COLORS.blueDark } }
  };
}

/**
 * Style pour les cellules de groupe
 */
function applyGroupStyle(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, color: { argb: CALYPSO_COLORS.blueDark } };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: CALYPSO_COLORS.groupBg }
  };
  cell.border = {
    top: { style: 'thin', color: { argb: CALYPSO_COLORS.blue } },
    left: { style: 'thin', color: { argb: CALYPSO_COLORS.blue } },
    bottom: { style: 'thin', color: { argb: CALYPSO_COLORS.blue } },
    right: { style: 'thin', color: { argb: CALYPSO_COLORS.blue } }
  };
}

/**
 * Style pour les cellules de total
 */
function applyTotalStyle(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, color: { argb: CALYPSO_COLORS.blueDark } };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: CALYPSO_COLORS.totalBg }
  };
  cell.border = {
    top: { style: 'medium', color: { argb: CALYPSO_COLORS.blue } },
    left: { style: 'thin', color: { argb: CALYPSO_COLORS.blue } },
    bottom: { style: 'medium', color: { argb: CALYPSO_COLORS.blue } },
    right: { style: 'thin', color: { argb: CALYPSO_COLORS.blue } }
  };
}

/**
 * Style pour les cellules de données
 */
function applyDataStyle(cell: ExcelJS.Cell): void {
  cell.border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' }
  };
}

/**
 * Formate un montant en euros
 */
export function formatAmountEur(amount: number): string {
  if (amount === 0) return '-';
  return new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2
  }).format(amount);
}

/**
 * Style pour les cellules éditables (fond jaune)
 */
function applyEditableStyle(cell: ExcelJS.Cell): void {
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFF3CD' } // Jaune clair
  };
  cell.border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' }
  };
  cell.numFmt = '#,##0.00 €';
  cell.alignment = { horizontal: 'right' };
}

/**
 * Style pour les labels de la feuille Données
 */
function applyLabelStyle(cell: ExcelJS.Cell): void {
  cell.font = { bold: false };
  cell.alignment = { horizontal: 'left', vertical: 'middle' };
}

/**
 * Style pour les titres de section
 */
function applySectionTitleStyle(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, size: 11 };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE5E7EB' }
  };
  cell.alignment = { horizontal: 'left', vertical: 'middle' };
}

/**
 * Ajoute la feuille "Données" pour la saisie manuelle - VERSION DYNAMIQUE
 * Génère les lignes basées sur la configuration BilanCodes
 */
function addDataSheet(
  workbook: ExcelJS.Workbook,
  fiscalYear: FiscalYear,
  logoId: number | null,
  bilanCodes: BilanCode[],
  bilanValues: BilanValues[]
): { rowMapping: Map<string, number> } {
  const sheet = workbook.addWorksheet('Données', {
    views: [{ showGridLines: false }]
  });

  // Map bilanCodeId -> row number pour les formules Excel
  const rowMapping = new Map<string, number>();
  const valuesMap = new Map(bilanValues.map(v => [v.bilanCodeId, v]));

  // Largeur des colonnes
  sheet.getColumn(1).width = 45;
  sheet.getColumn(2).width = 18;
  sheet.getColumn(3).width = 18;
  sheet.getColumn(4).width = 15;

  // Logo si disponible
  if (logoId !== null) {
    addLogoToSheet(sheet, logoId, 0, 0);
    sheet.getRow(1).height = 50;
    sheet.getRow(2).height = 50;
  }

  // Titre (décalé pour le logo)
  sheet.mergeCells('B1:C2');
  const titleCell = sheet.getCell('B1');
  titleCell.value = `DONNÉES DU BILAN - Année ${fiscalYear.year}`;
  titleCell.font = { bold: true, size: 14, color: { argb: CALYPSO_COLORS.blue } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Sous-titre explicatif
  sheet.mergeCells('A3:D3');
  const subtitleCell = sheet.getCell('A3');
  subtitleCell.value = 'Cellules jaunes = à compléter manuellement | Cellules grises = calculées automatiquement';
  subtitleCell.font = { italic: true, size: 10, color: { argb: 'FF6B7280' } };
  subtitleCell.alignment = { horizontal: 'center' };

  // En-têtes colonnes
  sheet.getCell('A5').value = 'Code';
  sheet.getCell('B5').value = 'Description';
  sheet.getCell('C5').value = 'OPENING';
  sheet.getCell('D5').value = 'CLOSING';
  ['A5', 'B5', 'C5', 'D5'].forEach(addr => {
    const cell = sheet.getCell(addr);
    applyHeaderStyle(cell);
  });
  sheet.getRow(5).height = 22;

  let row = 7;

  // Séparer actif et passif
  const actifCodes = bilanCodes.filter(c => c.section === 'actif').sort((a, b) => a.order - b.order);
  const passifCodes = bilanCodes.filter(c => c.section === 'passif').sort((a, b) => a.order - b.order);

  // Helper function pour ajouter une ligne de code bilan
  const addBilanCodeRow = (code: BilanCode) => {
    const depth = code.code.split('.').length - 1;
    const indent = '  '.repeat(depth);
    const values = valuesMap.get(code.id);
    const isManual = code.calculationType === 'manual';
    const isParent = code.calculationType === 'sum_children';

    // Code dans colonne A
    sheet.getCell(`A${row}`).value = code.code;
    sheet.getCell(`A${row}`).font = {
      size: 10,
      color: { argb: 'FF6B7280' },
      bold: depth === 0
    };

    // Nom dans colonne B
    sheet.getCell(`B${row}`).value = indent + code.name;
    if (depth === 0) {
      sheet.getCell(`B${row}`).font = { bold: true };
    } else if (isParent) {
      sheet.getCell(`B${row}`).font = { bold: true, italic: true };
    } else {
      applyLabelStyle(sheet.getCell(`B${row}`));
    }

    // Opening value
    const openingCell = sheet.getCell(`C${row}`);
    openingCell.value = values?.openingValue ?? 0;
    openingCell.numFmt = '#,##0.00 €';
    if (isManual) {
      applyEditableStyle(openingCell);
    } else if (isParent) {
      // Sera calculé par formule dans Bilan
      openingCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE5E7EB' } // Gris clair
      };
    } else {
      applyDataStyle(openingCell);
    }

    // Closing value
    const closingCell = sheet.getCell(`D${row}`);
    closingCell.value = values?.closingValue ?? 0;
    closingCell.numFmt = '#,##0.00 €';
    if (isManual || code.closingSource === 'manual') {
      applyEditableStyle(closingCell);
    } else if (isParent) {
      closingCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE5E7EB' }
      };
    } else {
      applyDataStyle(closingCell);
    }

    // Enregistrer le mapping
    rowMapping.set(code.id, row);
    row++;
  };

  // === ACTIF ===
  sheet.getCell(`A${row}`).value = 'ACTIF';
  applySectionTitleStyle(sheet.getCell(`A${row}`));
  sheet.mergeCells(`A${row}:D${row}`);
  row++;

  actifCodes.forEach(addBilanCodeRow);

  row += 2;

  // === PASSIF ===
  sheet.getCell(`A${row}`).value = 'PASSIF';
  applySectionTitleStyle(sheet.getCell(`A${row}`));
  sheet.mergeCells(`A${row}:D${row}`);
  row++;

  passifCodes.forEach(addBilanCodeRow);

  // Note en bas
  row += 2;
  sheet.getCell(`A${row}`).value = 'Note: Cellules jaunes = saisie manuelle. Cellules grises = somme des sous-codes (calculée dans feuille Bilan).';
  sheet.getCell(`A${row}`).font = { italic: true, size: 9, color: { argb: 'FF6B7280' } };

  return { rowMapping };
}

/**
 * Ajoute la feuille "Bilan" avec formules Excel - VERSION DYNAMIQUE
 * Génère les lignes et formules basées sur la configuration BilanCodes
 */
function addBalanceSheet(
  workbook: ExcelJS.Workbook,
  fiscalYear: FiscalYear,
  logoId: number | null,
  bilanCodes: BilanCode[],
  rowMapping: Map<string, number>,
  bilanValues: BilanValues[]
): void {
  // Map bilanCodeId -> values pour écrire les résultats avec les formules
  const valuesMap = new Map(bilanValues.map(v => [v.bilanCodeId, v]));
  const sheet = workbook.addWorksheet('Bilan courant', {
    views: [{ showGridLines: false }]
  });

  // Largeur des colonnes
  sheet.getColumn(1).width = 5;
  sheet.getColumn(2).width = 40;
  sheet.getColumn(3).width = 15;
  sheet.getColumn(4).width = 15;
  sheet.getColumn(5).width = 5;
  sheet.getColumn(6).width = 40;
  sheet.getColumn(7).width = 15;
  sheet.getColumn(8).width = 15;

  // Logo si disponible
  if (logoId !== null) {
    addLogoToSheet(sheet, logoId, 0, 0);
    sheet.getRow(1).height = 50;
    sheet.getRow(2).height = 50;
  }

  // Titre in R3 (official: B3:L5 merged)
  sheet.mergeCells('B3:L5');
  const titleCell = sheet.getCell('B3');
  titleCell.value = `Bilan Calypso DC ${fiscalYear.year}`;
  titleCell.font = { bold: true, size: 16, color: { argb: CALYPSO_COLORS.blue } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // En-têtes in R8 (official: E8, F8, J8, K8)
  sheet.getCell('E8').value = 'OPENING';
  sheet.getCell('F8').value = 'CLOSING';
  sheet.getCell('J8').value = 'OPENING';
  sheet.getCell('K8').value = 'CLOSING';
  ['E8', 'F8', 'J8', 'K8'].forEach(addr => applyHeaderStyle(sheet.getCell(addr)));

  // Titres ACTIF / PASSIF in R9 (official: C9 and H9)
  sheet.getCell('C9').value = 'ACTIF';
  sheet.getCell('C9').font = { bold: true, size: 12, color: { argb: CALYPSO_COLORS.blue } };
  sheet.getCell('H9').value = 'PASSIF';
  sheet.getCell('H9').font = { bold: true, size: 12, color: { argb: CALYPSO_COLORS.blue } };

  // Séparer actif et passif
  const actifCodes = bilanCodes.filter(c => c.section === 'actif').sort((a, b) => a.order - b.order);
  const passifCodes = bilanCodes.filter(c => c.section === 'passif').sort((a, b) => a.order - b.order);

  // Map pour stocker les rows du Bilan (pour les formules sum_children)
  const bilanRowMapping = new Map<string, number>();

  // Helper function pour créer une formule sum_children
  const _createSumChildrenFormula = (
    code: BilanCode,
    valueColumn: 'C' | 'D' | 'G' | 'H'
  ): { formula: string } | number => {
    const children = getChildCodes(bilanCodes, code.id);
    if (children.length === 0) {
      // Aucun enfant, utiliser la valeur de Données
      const dataRow = rowMapping.get(code.id);
      if (dataRow) {
        const dataCol = valueColumn === 'C' || valueColumn === 'G' ? 'C' : 'D';
        return { formula: `Données!${dataCol}${dataRow}` };
      }
      return 0;
    }

    // Créer une formule qui additionne les enfants (dans le Bilan)
    const childRefs = children
      .map(child => {
        const childBilanRow = bilanRowMapping.get(child.id);
        return childBilanRow ? `${valueColumn}${childBilanRow}` : null;
      })
      .filter(Boolean);

    if (childRefs.length === 0) return 0;
    return { formula: childRefs.join('+') };
  };
  void _createSumChildrenFormula; // Reserved for future formula-based bilan

  // Helper pour ajouter une ligne de bilan code
  const addBilanRow = (
    code: BilanCode,
    row: number,
    labelCol: string,
    openingCol: string,
    closingCol: string
  ) => {
    const depth = code.code.split('.').length - 1;
    const indent = '  '.repeat(depth);
    const isParent = code.calculationType === 'sum_children';

    // Enregistrer la row pour les formules sum_children
    bilanRowMapping.set(code.id, row);

    // Label: remplacer "année suivante" par l'année concrète (ex: "année 2026")
    const nextYear = fiscalYear.year + 1;
    const displayName = code.name
      .replace(/année suivante/gi, `année ${nextYear}`)
      .replace(/exercice suivant/gi, `exercice ${nextYear}`);
    sheet.getCell(`${labelCol}${row}`).value = indent + displayName;

    if (depth === 0) {
      sheet.getCell(`${labelCol}${row}`).font = { bold: true };
    } else if (isParent) {
      sheet.getCell(`${labelCol}${row}`).font = { bold: true, italic: true };
    }

    // Root parent codes (depth 0, sans parentId) = section headers SANS valeurs
    // Intermediaire parents (depth > 0, comme 02.01 Stock C.D.C.) MONTRENT des valeurs
    const isRootParent = isParent && !code.parentId;
    if (!isRootParent) {
      const dataRow = rowMapping.get(code.id);
      const codeValues = valuesMap.get(code.id);
      const openingResult = round2(codeValues?.openingValue ?? 0);
      const closingResult = round2(codeValues?.closingValue ?? 0);

      if (dataRow) {
        // Données sheet: kolom C = Opening, kolom D = Closing (altijd)
        sheet.getCell(`${openingCol}${row}`).value = { formula: `'Données'!C${dataRow}`, result: openingResult };
        sheet.getCell(`${closingCol}${row}`).value = { formula: `'Données'!D${dataRow}`, result: closingResult };
      } else {
        sheet.getCell(`${openingCol}${row}`).value = openingResult;
        sheet.getCell(`${closingCol}${row}`).value = closingResult;
      }

      // Styling pour les leaf codes
      applyDataStyle(sheet.getCell(`${openingCol}${row}`));
      applyDataStyle(sheet.getCell(`${closingCol}${row}`));
      sheet.getCell(`${openingCol}${row}`).numFmt = '#,##0.00 €';
      sheet.getCell(`${closingCol}${row}`).numFmt = '#,##0.00 €';
    }
  };

  // === ACTIF (labels in column C, values in E/F) — official structure ===
  let actifRow = 10;
  const actifDataRows: number[] = [];
  const actifLeafRows: number[] = [];

  // Afficher TOUS les codes actif — root parents = section headers, rest = valeurs
  // Track directe kinderen van root parents voor TOTAL formule (geen dubbeltelling)
  const actifDirectChildRows: number[] = [];
  actifCodes.forEach(code => {
    const isParent = code.calculationType === 'sum_children';
    addBilanRow(code, actifRow, 'C', 'E', 'F');
    actifDataRows.push(actifRow);
    if (!isParent) {
      actifLeafRows.push(actifRow);
    }
    // Direct children of root = codes met parentId dat een root is (geen parentId zelf)
    // Exclusie: "pour mémoire" items (inventory_value) tellen niet mee in TOTAL
    const parentCode = code.parentId ? bilanCodes.find(c => c.id === code.parentId) : null;
    const isPourMemoire = code.calculationType === 'inventory_value' ||
      (parentCode && parentCode.calculationType === 'inventory_value');
    if (parentCode && !parentCode.parentId && !isPourMemoire) {
      actifDirectChildRows.push(actifRow);
    }
    actifRow++;
  });

  const lastActifRow = actifRow - 1;
  actifRow += 2;

  // Total ACTIF — SUM van directe kinderen van root parents (excl. pour mémoire)
  sheet.getCell(`C${actifRow}`).value = 'TOTAL ACTIF';
  sheet.getCell(`C${actifRow}`).font = { bold: true };
  // Root codes zonder "pour mémoire" (01 = Actifs immobilisés bevat alleen pour mémoire items)
  const actifRootCodes = actifCodes.filter(c => !c.parentId && c.calculationType !== 'inventory_value');
  // Exclude root parents whose ALL children are pour mémoire
  const actifRootsForTotal = actifRootCodes.filter(rootCode => {
    const children = actifCodes.filter(c => c.parentId === rootCode.id);
    const allPourMemoire = children.length > 0 && children.every(c => c.calculationType === 'inventory_value');
    return !allPourMemoire;
  });
  const totalActifOpening = round2(actifRootsForTotal.reduce((sum, c) => sum + (valuesMap.get(c.id)?.openingValue ?? 0), 0));
  const totalActifClosing = round2(actifRootsForTotal.reduce((sum, c) => sum + (valuesMap.get(c.id)?.closingValue ?? 0), 0));
  // Formule sommeert alleen directe kinderen van root parents (02.01 + 02.02 + 02.03 etc., niet 02.01.01)
  const actifSumFormula = actifDirectChildRows.map(r => `E${r}`).join('+') || `SUM(E10:E${lastActifRow})`;
  const actifSumFormulaF = actifDirectChildRows.map(r => `F${r}`).join('+') || `SUM(F10:F${lastActifRow})`;
  sheet.getCell(`E${actifRow}`).value = { formula: actifSumFormula, result: totalActifOpening };
  sheet.getCell(`F${actifRow}`).value = { formula: actifSumFormulaF, result: totalActifClosing };
  applyTotalStyle(sheet.getCell(`C${actifRow}`));
  applyTotalStyle(sheet.getCell(`E${actifRow}`));
  applyTotalStyle(sheet.getCell(`F${actifRow}`));
  sheet.getCell(`E${actifRow}`).numFmt = '#,##0.00 €';
  sheet.getCell(`F${actifRow}`).numFmt = '#,##0.00 €';

  const totalActifRow = actifRow;

  // === PASSIF (colonnes H-K, labels in column G) ===
  let passifRow = 10;
  const passifDataRows: number[] = [];

  // Afficher TOUS les codes passif — root parents = section headers, rest = valeurs
  const passifLeafRows: number[] = [];
  const passifDirectChildRows: number[] = [];
  passifCodes.forEach(code => {
    const depth = code.code.split('.').length - 1;
    const indent = '  '.repeat(depth);
    const isParent = code.calculationType === 'sum_children';

    bilanRowMapping.set(code.id, passifRow);

    // Label: remplacer "année suivante" par l'année concrète
    const nextYearP = fiscalYear.year + 1;
    const displayNameP = code.name
      .replace(/année suivante/gi, `année ${nextYearP}`)
      .replace(/année courante afférant à suivante/gi, `afférant à l'exercice ${nextYearP}`)
      .replace(/exercice suivant/gi, `exercice ${nextYearP}`);
    sheet.getCell(`H${passifRow}`).value = indent + displayNameP;

    if (depth === 0) {
      sheet.getCell(`H${passifRow}`).font = { bold: true };
    } else if (isParent) {
      sheet.getCell(`H${passifRow}`).font = { bold: true, italic: true };
    }

    // Root parent codes (depth 0, sans parentId) = section headers SANS valeurs
    // Intermediaire parents (depth > 0) MONTRENT des valeurs
    const isRootParent = isParent && !code.parentId;
    if (!isRootParent) {
      const dataRow = rowMapping.get(code.id);
      const passifValues = valuesMap.get(code.id);
      const passifOpening = round2(passifValues?.openingValue ?? 0);
      const passifClosing = round2(passifValues?.closingValue ?? 0);

      if (dataRow) {
        sheet.getCell(`J${passifRow}`).value = { formula: `'Données'!C${dataRow}`, result: passifOpening };
        sheet.getCell(`K${passifRow}`).value = { formula: `'Données'!D${dataRow}`, result: passifClosing };
      } else {
        sheet.getCell(`J${passifRow}`).value = passifOpening;
        sheet.getCell(`K${passifRow}`).value = passifClosing;
      }

      applyDataStyle(sheet.getCell(`J${passifRow}`));
      applyDataStyle(sheet.getCell(`K${passifRow}`));
      sheet.getCell(`J${passifRow}`).numFmt = '#,##0.00 €';
      sheet.getCell(`K${passifRow}`).numFmt = '#,##0.00 €';

      passifLeafRows.push(passifRow);
    }

    // Direct children of root = codes met parentId dat een root is
    const parentCode = code.parentId ? bilanCodes.find(c => c.id === code.parentId) : null;
    if (parentCode && !parentCode.parentId) {
      passifDirectChildRows.push(passifRow);
    }

    passifDataRows.push(passifRow);
    passifRow++;
  });

  const lastPassifRow = passifRow - 1;
  passifRow += 2;

  // Total PASSIF — SUM van alleen directe kinderen van root parents
  sheet.getCell(`H${passifRow}`).value = 'TOTAL PASSIF';
  sheet.getCell(`H${passifRow}`).font = { bold: true };
  const passifRootCodes = passifCodes.filter(c => !c.parentId);
  const totalPassifOpening = round2(passifRootCodes.reduce((sum, c) => sum + (valuesMap.get(c.id)?.openingValue ?? 0), 0));
  const totalPassifClosing = round2(passifRootCodes.reduce((sum, c) => sum + (valuesMap.get(c.id)?.closingValue ?? 0), 0));
  const passifSumFormula = passifDirectChildRows.map(r => `J${r}`).join('+') || `SUM(J10:J${lastPassifRow})`;
  const passifSumFormulaK = passifDirectChildRows.map(r => `K${r}`).join('+') || `SUM(K10:K${lastPassifRow})`;
  sheet.getCell(`J${passifRow}`).value = { formula: passifSumFormula, result: totalPassifOpening };
  sheet.getCell(`K${passifRow}`).value = { formula: passifSumFormulaK, result: totalPassifClosing };
  applyTotalStyle(sheet.getCell(`H${passifRow}`));
  applyTotalStyle(sheet.getCell(`J${passifRow}`));
  applyTotalStyle(sheet.getCell(`K${passifRow}`));
  sheet.getCell(`J${passifRow}`).numFmt = '#,##0.00 €';
  sheet.getCell(`K${passifRow}`).numFmt = '#,##0.00 €';

  const totalPassifRow = passifRow;
  passifRow += 2;

  // Différence (contrôle) — placed in columns B-F to avoid conflict with PASSIF label area (column H)
  sheet.getCell(`B${passifRow}`).value = 'Différence (Actif - Passif)';
  sheet.getCell(`B${passifRow}`).font = { italic: true, color: { argb: 'FF6B7280' } };
  sheet.getCell(`F${passifRow}`).value = { formula: `F${totalActifRow}-K${totalPassifRow}`, result: round2(totalActifClosing - totalPassifClosing) };
  sheet.getCell(`F${passifRow}`).numFmt = '#,##0.00 €';
  sheet.getCell(`F${passifRow}`).font = { italic: true, color: { argb: 'FF6B7280' } };

  // Année de référence (official: R31)
  passifRow += 2;
  sheet.getCell(`C${passifRow}`).value = 'Année de référence';
  sheet.getCell(`C${passifRow}`).font = { italic: true };
  sheet.getCell(`F${passifRow}`).value = fiscalYear.year;
}

/**
 * Ajoute la feuille "Transactions" avec toutes les transactions individuelles
 * Colonnes: Numero, Date, Counterparty, Compte comptable, Liaison, Montant
 */
function addTransactionsSheet(
  workbook: ExcelJS.Workbook,
  fiscalYear: FiscalYear,
  logoId: number | null,
  transactions: TransactionBancaire[]
): void {
  const sheet = workbook.addWorksheet('Transactions', {
    views: [{ state: 'frozen', ySplit: 4, xSplit: 0, showGridLines: false }]
  });

  // Largeur des colonnes
  sheet.getColumn(1).width = 18; // Numero
  sheet.getColumn(2).width = 14; // Date
  sheet.getColumn(3).width = 35; // Contrepartie
  sheet.getColumn(4).width = 18; // Compte comptable
  sheet.getColumn(5).width = 30; // Liaison
  sheet.getColumn(6).width = 16; // Montant

  // Logo si disponible
  if (logoId !== null) {
    addLogoToSheet(sheet, logoId, 0, 0);
    sheet.getRow(1).height = 50;
    sheet.getRow(2).height = 50;
  }

  // Titre
  sheet.mergeCells('B1:E2');
  const titleCell = sheet.getCell('B1');
  titleCell.value = `TRANSACTIONS - Année ${fiscalYear.year}`;
  titleCell.font = { bold: true, size: 16, color: { argb: CALYPSO_COLORS.blue } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Sous-titre avec nombre de transactions
  sheet.mergeCells('A3:F3');
  const subtitleCell = sheet.getCell('A3');
  subtitleCell.value = `${transactions.length} transactions pour la période fiscale ${fiscalYear.year}`;
  subtitleCell.font = { italic: true, size: 10, color: { argb: 'FF6B7280' } };
  subtitleCell.alignment = { horizontal: 'center' };

  // En-têtes colonnes (ligne 4)
  const headers = ['Numéro', 'Date', 'Contrepartie', 'Compte comptable', 'Liaison', 'Montant'];
  headers.forEach((header, idx) => {
    const cell = sheet.getCell(4, idx + 1);
    cell.value = header;
    applyHeaderStyle(cell);
  });
  sheet.getRow(4).height = 25;

  // Helper: construire la description de liaison à partir des matched_entities
  // Filtre sur entity_type 'event' ou 'operation' (comme dans TransactionsPage)
  const getLiaison = (trans: TransactionBancaire): string => {
    if (trans.matched_entities && trans.matched_entities.length > 0) {
      return trans.matched_entities
        .filter(e => (e.entity_type === 'event' || (e.entity_type as string) === 'operation') && e.entity_name)
        .map(e => e.entity_name)
        .join(' | ');
    }
    return '';
  };

  // Trier les transactions par numero_sequence (comme dans le fichier officiel)
  const sortedTransactions = [...transactions].sort((a, b) => {
    return (a.numero_sequence || '').localeCompare(b.numero_sequence || '');
  });

  // R5+: Ajouter les transactions (officiel bestand heeft geen TOTAL-rij)
  let currentRow = 5;

  sortedTransactions.forEach(trans => {
    // Skip parent transactions (montant déjà comptabilisé via children)
    if (trans.is_parent) return;

    const transDate = trans.date_execution instanceof Date
      ? trans.date_execution
      : new Date(trans.date_execution);

    const row = sheet.getRow(currentRow);
    row.values = [
      trans.numero_sequence || '',
      formatBankDate(transDate),
      trans.contrepartie_nom || '',
      trans.code_comptable || '',
      getLiaison(trans),
      trans.montant
    ];

    // Styling
    row.eachCell((cell, colNumber) => {
      applyDataStyle(cell);
      if (colNumber === 6) {
        cell.numFmt = '#,##0.00 €';
        cell.alignment = { horizontal: 'right' };
        // Couleur rouge pour montants négatifs
        if (trans.montant < 0) {
          cell.font = { color: { argb: 'FFDC2626' } };
        }
      }
      if (colNumber === 2) {
        cell.alignment = { horizontal: 'center' };
      }
    });

    // Alternance de couleurs pour lisibilité
    if (currentRow % 2 === 0) {
      row.eachCell(cell => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF9FAFB' } // Gris très clair
        };
      });
    }

    currentRow++;
  });

  // Info génération
  currentRow += 2;
  sheet.getCell(`A${currentRow}`).value = `Généré le ${format(new Date(), 'dd/MM/yyyy à HH:mm', { locale: fr })} par CalyCompta`;
  sheet.getCell(`A${currentRow}`).font = { italic: true, size: 9, color: { argb: 'FF6B7280' } };

  // Auto-filter sur les en-têtes
  sheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: currentRow - 2, column: 6 }
  };
}

/**
 * Ajoute la feuille Validations — montre les codes comptables utilisés dans les
 * transactions mais absents des Groupes de Rapport (donc exclus du P&L)
 */
// Legacy validation sheet (kept for reference)
export function addValidationsSheetLegacy(
  workbook: ExcelJS.Workbook,
  fiscalYear: FiscalYear,
  logoId: number | null,
  unmappedCodes: Map<string, number>,
  _codeMonthlyMap: Map<string, number[]>,
  totalPL: number
): void {
  const sheet = workbook.addWorksheet('Validations', {
    views: [{ state: 'frozen', ySplit: 3, showGridLines: false }]
  });

  // Charger les labels des codes comptables
  const accountCodes = getOfficialAccountCodes();
  const accountCodeMap = new Map(accountCodes.map(ac => [ac.code, ac]));

  // Colonnes
  sheet.columns = [
    { header: 'Code', key: 'code', width: 18 },
    { header: 'Libellé', key: 'label', width: 45 },
    { header: 'Total EUR', key: 'total', width: 15 },
    { header: 'Statut', key: 'status', width: 35 },
  ];

  // Logo
  if (logoId !== null) {
    addLogoToSheet(sheet, logoId, 0, 0);
    sheet.getRow(1).height = 50;
    sheet.getRow(2).height = 50;
  }

  // Titre
  sheet.mergeCells('C1:D2');
  const titleCell = sheet.getCell('C1');
  titleCell.value = `VALIDATIONS - Année ${fiscalYear.year}`;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FFCC0000' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // En-tête
  const headerRow = sheet.getRow(3);
  headerRow.values = ['Code', 'Libellé', 'Total EUR', 'Statut'];
  headerRow.eachCell(cell => applyHeaderStyle(cell));
  headerRow.height = 25;

  // Données
  let currentRow = 4;
  let totalUnmapped = 0;

  // Trier par montant absolu (plus grand impact d'abord)
  const sortedCodes = Array.from(unmappedCodes.entries())
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

  for (const [code, total] of sortedCodes) {
    const row = sheet.getRow(currentRow);
    const accountInfo = accountCodeMap.get(code);
    const label = accountInfo?.label || '⚠️ Code inconnu';
    const status = accountInfo
      ? 'Absent des Groupes de Rapport'
      : 'Code inexistant dans la configuration';

    row.values = [code, label, total, status];
    row.getCell(3).numFmt = '#,##0.00 €';
    row.getCell(3).alignment = { horizontal: 'right' };

    // Colorer en rouge si code inconnu
    if (!accountInfo) {
      row.eachCell(cell => {
        cell.font = { ...cell.font, color: { argb: 'FFCC0000' } };
      });
    }

    totalUnmapped += total;
    currentRow++;
  }

  // Ligne de total
  currentRow++;
  const totalRow = sheet.getRow(currentRow);
  totalRow.values = ['', 'Total non comptabilisé dans le P&L', totalUnmapped, ''];
  totalRow.getCell(3).numFmt = '#,##0.00 €';
  totalRow.getCell(3).alignment = { horizontal: 'right' };
  totalRow.eachCell(cell => applyTotalStyle(cell));
  totalRow.height = 22;

  // Ligne réconciliation
  currentRow += 2;
  const reconRow1 = sheet.getRow(currentRow);
  reconRow1.values = ['', 'Total P&L (Compte de Résultats)', totalPL, ''];
  reconRow1.getCell(3).numFmt = '#,##0.00 €';
  reconRow1.getCell(3).alignment = { horizontal: 'right' };
  reconRow1.font = { bold: true };

  currentRow++;
  const reconRow2 = sheet.getRow(currentRow);
  reconRow2.values = ['', 'Total non comptabilisé', totalUnmapped, ''];
  reconRow2.getCell(3).numFmt = '#,##0.00 €';
  reconRow2.getCell(3).alignment = { horizontal: 'right' };
  reconRow2.font = { bold: true };

  currentRow++;
  const reconRow3 = sheet.getRow(currentRow);
  const totalTransactions = totalPL + totalUnmapped;
  reconRow3.values = ['', 'Total réel des transactions', totalTransactions, ''];
  reconRow3.getCell(3).numFmt = '#,##0.00 €';
  reconRow3.getCell(3).alignment = { horizontal: 'right' };
  reconRow3.eachCell(cell => applyTotalStyle(cell));
  reconRow3.height = 22;

  // Info de génération
  currentRow += 2;
  const infoRow = sheet.getRow(currentRow);
  infoRow.values = [`⚠️ Ces codes doivent être ajoutés aux Groupes de Rapport (Paramètres > Groupes de Rapport) pour apparaître dans le Compte de Résultats.`];
  infoRow.font = { italic: true, size: 10, color: { argb: 'FFCC0000' } };
}

// ============================================================
// FASE 1: Triviale + Lage complexiteit tabs
// ============================================================

/**
 * Ajoute la feuille "Month" — table de correspondance statique mois → numéro
 * Utilisée par les formules Excel des autres feuilles
 */
function addMonthSheet(workbook: ExcelJS.Workbook): void {
  const sheet = workbook.addWorksheet('Month');

  sheet.getColumn(1).width = 12;
  sheet.getColumn(2).width = 5;

  const months = [
    ['Jan', 1], ['Feb', 2], ['Mar', 3], ['Apr', 4],
    ['May', 5], ['Jun', 6], ['Jul', 7], ['Aug', 8],
    ['Sep', 9], ['Oct', 10], ['Nov', 11], ['Dec', 12]
  ];

  months.forEach(([name, num], idx) => {
    const row = sheet.getRow(idx + 1);
    row.values = [name, num];
  });
}

/**
 * Ajoute la feuille "Cognos_Office_Connection_Cache" — feuille technique vide
 * Présente dans le fichier officiel pour compatibilité Cognos
 */
function addCognosSheet(workbook: ExcelJS.Workbook): void {
  workbook.addWorksheet('Cognos_Office_Connection_Cache');
}

/**
 * Ajoute la feuille "CC Utilisés" — Codes comptables utilisés dans les transactions
 * 3 colonnes: Code, Libellé, Total EUR
 */
function addCCUtilisesSheet(
  workbook: ExcelJS.Workbook,
  codeMonthlyMap: Map<string, number[]>
): void {
  const sheet = workbook.addWorksheet('CC Utilisés', {
    views: [{ showGridLines: true }]
  });

  // Colonnes — structure officielle
  sheet.getColumn(1).width = 49.86;  // Code Comptables utilisés
  sheet.getColumn(2).width = 10.43;  // Code
  sheet.getColumn(3).width = 14.43;  // Somme

  // En-tête (pas de styling)
  const headerRow = sheet.getRow(1);
  headerRow.values = ['Code Comptables utilisés', 'Code', 'Somme'];
  headerRow.height = 15;

  // Charger les codes
  const accountCodes = getOfficialAccountCodes();
  const accountCodeMap = new Map(accountCodes.map(ac => [ac.code, ac]));

  // Construire la liste des codes utilisés avec totaux, filtrés par non-zéro
  const usedCodes: { code: string; label: string; total: number }[] = [];
  for (const [code, monthlyAmounts] of codeMonthlyMap.entries()) {
    const total = round2(monthlyAmounts.reduce((sum, val) => sum + val, 0));
    // 610-00-622 exists in Firestore but not in official CC Utilisés (excluded only here, not globally)
    if (total !== 0 && /^\d{2,3}-\d{2,3}-\d{2,3}$/.test(code) && !EXCLUDED_CODES.has(code) && code !== '610-00-622') {
      const accountInfo = accountCodeMap.get(code);
      usedCodes.push({
        code,
        label: accountInfo?.label || code,
        total
      });
    }
  }

  // Trier par code
  usedCodes.sort((a, b) => a.code.localeCompare(b.code));

  // Ajouter les données
  let currentRow = 2;
  usedCodes.forEach(({ code, label, total }) => {
    const row = sheet.getRow(currentRow);
    row.values = [
      `${code} - ${label}`,  // A: combined code - label
      code,                   // B: code
      total                   // C: sum
    ];
    row.getCell(3).numFmt = '#,##0.00';
    row.getCell(3).alignment = { horizontal: 'right' };
    currentRow++;
  });

  // Ligne de total
  const totalRow = sheet.getRow(currentRow);
  const grandTotal = round2(usedCodes.reduce((sum, c) => sum + c.total, 0));
  totalRow.values = [null, null, grandTotal];
  totalRow.getCell(3).numFmt = '#,##0.00';
  totalRow.getCell(3).alignment = { horizontal: 'right' };
}

/**
 * Ajoute la feuille "Validations" — structure officielle
 * 4 colonnes: Code, Libellé, Montant du compte, Existe dans le tableau P&L
 */
function addValidationsSheetFull(
  workbook: ExcelJS.Workbook,
  _fiscalYear: FiscalYear,
  codeMonthlyMap: Map<string, number[]>,
  allGroupCodes: Set<string>,
  _totalPL: number
): void {
  const sheet = workbook.addWorksheet('Validations', {
    views: [{ showGridLines: true }]
  });

  // Colonnes — structure officielle
  sheet.getColumn(1).width = 13.57;  // Code
  sheet.getColumn(2).width = 38.71;  // Libellé
  sheet.getColumn(3).width = 18.86;  // Montant du compte
  sheet.getColumn(4).width = 28.14;  // Existe dans le tableau P&L

  // En-tête (pas de styling)
  const headerRow = sheet.getRow(1);
  headerRow.values = ['Liste des Comptes', null, 'Montant du compte', 'Existe dans le tableau P&L'];
  headerRow.height = 15;

  // Charger les codes comptables
  const accountCodes = getOfficialAccountCodes();
  const accountCodeMap = new Map(accountCodes.map(ac => [ac.code, ac]));

  // Construire les données: tous les codes utilisés + tous les codes connus
  const allCodes = new Map<string, { code: string; label: string; total: number }>();

  // D'abord ajouter tous les codes utilisés dans les transactions
  for (const [code, monthlyAmounts] of codeMonthlyMap.entries()) {
    const total = round2(monthlyAmounts.reduce((sum, val) => sum + val, 0));
    const accountInfo = accountCodeMap.get(code);
    allCodes.set(code, {
      code,
      label: accountInfo?.label || code,
      total
    });
  }

  // Ensuite ajouter tous les codes connus (non utilisés) — sauf EXTRA_OFFICIAL_CODES
  const extraCodes = new Set(EXTRA_OFFICIAL_CODES.map(ec => ec.code));
  for (const ac of accountCodes) {
    if (!allCodes.has(ac.code) && !extraCodes.has(ac.code)) {
      allCodes.set(ac.code, {
        code: ac.code,
        label: ac.label,
        total: 0
      });
    }
  }

  // Filtrer les codes de test, exclus, et trier par code
  // Support codes like "730-00-712", "5500-0-700", "15-000-770"
  const isValidAccountCode = (code: string) => /^\d{1,4}-\d{1,3}-\d{3}$/.test(code);
  const sortedCodes = Array.from(allCodes.values())
    .filter(c => isValidAccountCode(c.code) && !EXCLUDED_CODES.has(c.code))
    .sort((a, b) => a.code.localeCompare(b.code));

  // Codes qui apparaissent comme lignes individuelles dans le P&L officiel
  // TODO: passer à une détection dynamique quand le P&L sera corrigé
  const plLineCodes = new Set([
    '15-000-770', '15-000-771', '15-000-772',
    '439-00-001', '439-00-002',
    '490-00-635', '493-00-719', '493-00-735',
    '604-00-640', '604-00-641', '604-00-642', '604-00-740', '604-00-741', '604-00-742', '604-00-743',
    '610-00-621', '610-00-622',
    '611-00-616', '611-00-618',
    '612-00-622', '612-00-623', '612-00-624',
    '614-00-643',
    '615-00-646', '615-00-746',
    '617-00-630', '617-00-730',
    '618-00-632', '618-00-732',
    '619-00-633', '619-00-733',
    '620-00-666', '620-00-766',
    '657-00-660',
    '664-00-650', '664-00-750',
    '730-00-610', '730-00-611', '730-00-711', '730-00-712', '730-00-713', '730-00-714', '730-00-715',
  ]);

  // Ajouter les données
  let currentRow = 2;

  for (const data of sortedCodes) {
    const row = sheet.getRow(currentRow);
    const exitsInPL = plLineCodes.has(data.code) ? data.code : null;

    row.values = [data.code, data.label, data.total, exitsInPL];
    row.getCell(3).numFmt = '#,##0.00';
    row.getCell(3).alignment = { horizontal: 'right' };

    currentRow++;
  }
}

/**
 * Ajoute la feuille "Bank Balance courant" — soldes mensuels
 * Structure officielle: OPE | CLO | Opening Bank Balance (BNP) | Monthly Mvt | Closing date | Month Closing amount
 */
function addBankBalanceSheet(
  workbook: ExcelJS.Workbook,
  fiscalYear: FiscalYear,
  transactions: TransactionBancaire[]
): void {
  const sheet = workbook.addWorksheet('Bank Balance courant', {
    views: [{ showGridLines: true }]
  });

  // Colonnes — structure officielle
  sheet.getColumn(1).width = 10.43;  // OPE (date)
  sheet.getColumn(2).width = 10.43;  // CLO (month number)
  sheet.getColumn(3).width = 16.14;  // Opening Bank Balance
  sheet.getColumn(4).width = 14.43;  // Monthly Mvt
  sheet.getColumn(5).width = 13.0;   // Closing date
  sheet.getColumn(6).width = 19.57;  // Month Closing amount

  // En-tête (pas de styling)
  const headerRow = sheet.getRow(1);
  headerRow.values = ['OPE', 'CLO', 'Opening Bank Balance (BNP)', 'Monthly Mvt', 'Closing date', 'Month Closing amount'];
  headerRow.height = 15;

  // Calculer le début de l'année fiscale
  const fiscalYearStart = fiscalYear.start_date instanceof Date
    ? fiscalYear.start_date
    : (fiscalYear.start_date as any).toDate();
  const startMonth = fiscalYearStart.getMonth();
  const startYear = fiscalYearStart.getFullYear();

  // Calculer les montants par mois fiscal
  const monthlyMovement = new Array(12).fill(0);

  const filteredTransactions = transactions.filter(t => !t.is_parent);

  filteredTransactions.forEach(trans => {
    const transDate = trans.date_execution instanceof Date
      ? trans.date_execution
      : new Date(trans.date_execution as any);
    const transMonth = transDate.getMonth();
    const transYear = transDate.getFullYear();

    // Calculer l'index du mois dans l'année fiscale
    let monthIndex: number;
    if (transYear === startYear) {
      monthIndex = transMonth - startMonth;
    } else if (transYear === startYear + 1) {
      monthIndex = 12 - startMonth + transMonth;
    } else {
      monthIndex = -1;
    }

    if (monthIndex >= 0 && monthIndex < 12) {
      monthlyMovement[monthIndex] = round2(monthlyMovement[monthIndex] + trans.montant);
    }
  });

  // Solde d'ouverture initial (depuis opening_balances.bank_current du FiscalYear)
  let openingBalance = fiscalYear.opening_balances?.bank_current ?? 0;

  // Remplir les lignes mensuelles (lignes 2-13 pour les 12 mois)
  let currentRow = 2;
  for (let i = 0; i < 12; i++) {
    const monthNum = i + 1;
    const monthDate = excelDate(new Date(startYear, (startMonth + i) % 12, 1));
    const monthMovement = monthlyMovement[i];
    // Closing date = last day of the month
    const closingYear = startMonth + i > 11 ? startYear + 1 : startYear;
    const closingMonth = (startMonth + i) % 12;
    const lastDayOfMonth = excelDate(new Date(closingYear, closingMonth + 1, 0)); // day 0 = last day of prev month
    const closingBalance = round2(openingBalance + monthMovement);

    const row = sheet.getRow(currentRow);
    row.values = [
      monthDate,                         // A: OPE (first day of month as Date)
      monthNum,                          // B: CLO (month number 1-12)
      openingBalance,                    // C: Opening Balance
      monthMovement,                     // D: Monthly Movement
      lastDayOfMonth,                    // E: Closing date (last day of month)
      closingBalance                     // F: Closing amount
    ];

    // Format numeric columns
    row.getCell(3).numFmt = '#,##0.00';
    row.getCell(3).alignment = { horizontal: 'right' };
    row.getCell(4).numFmt = '#,##0.00';
    row.getCell(4).alignment = { horizontal: 'right' };
    row.getCell(6).numFmt = '#,##0.00';
    row.getCell(6).alignment = { horizontal: 'right' };
    openingBalance = closingBalance;
    currentRow++;
  }

  // Ligne 14: Jan 1 of next year
  const nextYearDate = excelDate(new Date(startYear + 1, startMonth, 1));
  const row14 = sheet.getRow(currentRow);
  const totalMovement = round2(monthlyMovement.reduce((s, v) => s + v, 0));
  row14.values = [
    nextYearDate,                         // A: Jan 1 next year (Date object)
    13,                                   // B: 13
    openingBalance,                      // C: last closing balance
    0,                                   // D: 0
    null,                                  // E: null
    null                                   // F: null
  ];
  row14.getCell(3).numFmt = '#,##0.00';
  row14.getCell(3).alignment = { horizontal: 'right' };
  row14.getCell(4).numFmt = '#,##0.00';
  row14.getCell(4).alignment = { horizontal: 'right' };
  currentRow++;

  // Ligne 15: Summary totals
  const row15 = sheet.getRow(currentRow);
  row15.values = [
    null,                         // A: null
    null,                         // B: null
    openingBalance,               // C: last closing balance
    totalMovement,                // D: total movement
    null,                         // E: null
    null                          // F: null
  ];
  row15.getCell(3).numFmt = '#,##0.00';
  row15.getCell(3).alignment = { horizontal: 'right' };
  row15.getCell(4).numFmt = '#,##0.00';
  row15.getCell(4).alignment = { horizontal: 'right' };
}

/**
 * Ajoute la feuille "N Rubriques" — tous les codes comptables
 * Structure officielle: New Rubriques | Debit/Credit | Libellé | Type | Sub-type
 */
function addNRubriquesSheet(workbook: ExcelJS.Workbook): void {
  const sheet = workbook.addWorksheet('N Rubriques', {
    views: [{ showGridLines: true }]
  });

  // Colonnes — structure officielle
  sheet.getColumn(1).width = 15.0;   // New Rubriques (code)
  sheet.getColumn(2).width = 12.86;  // Debit/Credit
  sheet.getColumn(3).width = 48.14;  // Libellé
  sheet.getColumn(4).width = 56.0;   // Type
  sheet.getColumn(5).width = 13.0;   // Sub-type

  // En-tête (pas de styling)
  const headerRow = sheet.getRow(1);
  headerRow.values = ['New Rubriques', 'Debit/Credit', 'Libellé', 'Type', 'Sub-type'];
  headerRow.height = 15;

  // Charger les codes
  const accountCodes = getOfficialAccountCodes();

  // Filtrer les codes de test et trier par code
  const isValidCode = (code: string) => /^\d{2,4}-\d{1,3}-\d{3}$/.test(code);
  const sortedCodes = [...accountCodes]
    .filter(ac => isValidCode(ac.code))
    .sort((a, b) => a.code.localeCompare(b.code));

  let currentRow = 2;
  for (const ac of sortedCodes) {
    // Déterminer le sens débit/crédit
    const debitCredit = ac.type === 'expense' || ac.type === 'asset' ? 'd' : 'c';

    // Type mapping
    const typeLabel = ac.type === 'expense' ? 'Dépense'
      : ac.type === 'revenue' ? 'Revenu'
      : ac.type === 'asset' ? 'Actif'
      : ac.type === 'liability' ? 'Passif'
      : ac.type;

    const row = sheet.getRow(currentRow);
    // Official structure: A=code, B=d/c, C=label, D=type, E=sub-type (category)
    // Explicit sub-type overrides for codes where Firestore category differs from official
    const SUBTYPE_OVERRIDES: Record<string, string> = {
      '439-00-001': 'Cautions',
      '439-00-002': 'Cautions',
      '604-00-641': 'BoutiqueBoutique',
      '604-00-642': 'BoutiqueBoutique',
      '604-00-741': 'BoutiqueDivers',
      '617-00-634': 'SortiesReports',
      '617-00-734': 'SortiesReports',
      '750-00-760': 'Intérêts bancaires',
    };
    // French accent corrections for category names from Firestore (stored without accents)
    const CATEGORY_ACCENTS: Record<string, string> = {
      'Materiel': 'Matériel',
      'Reunions': 'Réunions',
      'Activites': 'Activités',
      'Evenements': 'Événements',
    };
    let subType: string | null = null;
    if (ac.code in SUBTYPE_OVERRIDES) {
      subType = SUBTYPE_OVERRIDES[ac.code];
    } else if (ac.categories && ac.categories.length > 0) {
      const cat = ac.categories[0];
      // Skip internal IDs (cat_xxx), use human-readable names with underscores replaced
      if (!cat.startsWith('cat_')) {
        subType = cat.replace(/_/g, ' ');
        // Strip " depense"/" revenu" suffixes (Firestore stores these but official doesn't)
        subType = subType.replace(/ depense$/i, '').replace(/ revenu$/i, '');
        // Official uses lowercase for immobilisations, amortissements, bilan
        const lowerSub = subType.toLowerCase();
        if (['immobilisations', 'amortissements', 'bilan'].includes(lowerSub)) {
          subType = lowerSub;
        } else {
          // Capitalize first letter for everything else
          subType = subType.charAt(0).toUpperCase() + subType.slice(1);
        }
        // Apply accent corrections
        if (subType && subType in CATEGORY_ACCENTS) {
          subType = CATEGORY_ACCENTS[subType];
        }
      }
    }
    // Official leaves d/c empty for immobilisations, amortissements, Cautions,
    // and various boutique/stock codes
    const emptyDcCategories = ['immobilisations', 'amortissements'];
    const emptyDcSubTypes = ['Cautions'];
    let effectiveDc: string | null = debitCredit;
    if (subType && (emptyDcCategories.includes(subType) || emptyDcSubTypes.includes(subType))) {
      effectiveDc = null;
    }
    // Explicit d/c overrides for codes where the generic type-based logic is wrong
    const DC_OVERRIDES: Record<string, string | null> = {
      '340-00-602': 'c',    // bilan report stock boutique (credit)
      '340-00-702': 'd',    // bilan report stock boutique (debit)
      '439-00-001': null,   // Cautions reçues — empty in official
      '439-00-002': null,   // Cautions remboursées — empty in official
      '5500-0-700': 'c',    // bilan report compte courant
      '5510-0-701': 'c',    // bilan report compte epargne
      '570-00-703': 'c',    // bilan report caisse boutique
      '571-00-704': 'c',    // bilan report caisse piscine
      '493-00-735': 'd',    // Perception pour activités année suivante
      '600-00-640': null,   // Stock Divers (A) — empty in official
      '600-00-642': null,   // Stock Boutique LIFRAS (A) — empty
      '600-00-740': null,   // Stock Divers (V) — empty
      '600-00-742': null,   // Stock boutique LIFRAS (V) — empty
      '604-00-641': null,   // Boutique (A) — empty
      '604-00-642': null,   // Boutique LIFRAS (A) — empty
      '604-00-740': 'c',    // Stock Divers (V) — credit in official
      '604-00-741': null,   // Boutique (V) — empty
      '604-00-742': null,   // Boutique LIFRAS (V) — empty
      '604-00-743': null,   // Calybar — empty
      '630-00-005': null,   // Dotations aux amortissements — empty
      '657-00-760': 'c',    // Intérêt des comptes (revenue type in official)
      '700-00-720': 'c',    // Entrées bassin
      '713-00-642': 'c',    // Depreciation Stock Boutique — credit in official
      '713-00-742': 'd',    // Valorisation Stock Boutique — debit in official
      '764-00-750': 'c',    // Soirée annuelle bénéfice exceptionnel
    };
    if (ac.code in DC_OVERRIDES) {
      effectiveDc = DC_OVERRIDES[ac.code];
    }
    row.values = [ac.code, effectiveDc, ac.label, typeLabel, subType];

    currentRow++;
  }
}

// ============================================================
// FASE 2: Medium complexiteit tabs
// ============================================================

/**
 * Ajoute la feuille "GL courant" (Grand Livre) — toutes les transactions en détail
 * Structure officielle: 17 colonnes avec ordre spécifique
 */
function addGLCourantSheet(
  workbook: ExcelJS.Workbook,
  fiscalYear: FiscalYear,
  transactions: TransactionBancaire[]
): void {
  const sheet = workbook.addWorksheet('GL courant', {
    views: [{ showGridLines: true }]
  });

  // Colonnes — structure officielle (17 cols)
  const colWidths = [17.43, 14.57, 14.57, 11.29, 19.57, 16.57, 26.71, 28.29, 46.29, 103.29, 11.86, 4.71, 4.0, 10.14, 16.29, 49.86, 50.0];
  const headers = [
    'Nº de séquence', "Date d'exécution", 'Date valeur', 'Montant', 'Devise du compte',
    'Numéro de compte', 'Type de transaction', 'Contrepartie', 'Nom de la contrepartie',
    'Communication', 'Détails', 'MTD', 'YTD', 'Compte', 'Provisionné en ' + (fiscalYear.year - 1),
    'Code Comptable', 'Activité'
  ];

  colWidths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  // Format columns H (8) and I (9) as date — matches official format
  // When value is 0, Excel displays it as 00:00:00 (midnight), matching the official file
  sheet.getColumn(8).numFmt = 'd/mm/yyyy;@';
  sheet.getColumn(9).numFmt = 'd/mm/yyyy;@';

  // En-tête (pas de styling)
  const headerRow = sheet.getRow(1);
  headerRow.values = headers;
  headerRow.height = 15;

  // Helper: get activity name
  const getActivity = (trans: TransactionBancaire): string => {
    if (trans.matched_entities && trans.matched_entities.length > 0) {
      return trans.matched_entities
        .filter(e => e.entity_type === 'event' && e.entity_name)
        .map(e => e.entity_name)
        .join(' | ');
    }
    return '';
  };

  // Build parent map for child transactions (GL uses parent's contrepartie_nom and communication)
  const parentMap = new Map<string, TransactionBancaire>();
  transactions.forEach(t => {
    if (t.is_parent) {
      parentMap.set(t.id, t);
    }
  });

  // Filtrer les parents (garder children + transactions simples), trier par numero_sequence
  const sortedTransactions = [...transactions]
    .filter(t => !t.is_parent)
    .sort((a, b) => (a.numero_sequence || '').localeCompare(b.numero_sequence || ''));

  let currentRow = 2;

  // Load account codes for code+label in column P (met officiële label overrides)
  const accountCodesGL = getOfficialAccountCodes();
  const accountCodeMapGL = new Map(accountCodesGL.map(ac => [ac.code, ac]));

  sortedTransactions.forEach(trans => {
    const transDate = trans.date_execution instanceof Date
      ? trans.date_execution : new Date(trans.date_execution as any);
    const valDate = trans.date_valeur instanceof Date
      ? trans.date_valeur : new Date(trans.date_valeur as any);

    // Column P: "code - label" format
    const acInfo = trans.code_comptable ? accountCodeMapGL.get(trans.code_comptable) : null;
    const codeLabel = trans.code_comptable
      ? `${trans.code_comptable} - ${acInfo?.label || trans.code_comptable}`
      : '';

    // For child transactions: use parent's contrepartie_nom and communication (without " - Ligne X/Y")
    const parent = trans.parent_transaction_id ? parentMap.get(trans.parent_transaction_id) : null;
    // Official file: only show contrepartie_nom when IBAN is present (card payments have no IBAN)
    const hasIban = !!(trans.contrepartie_iban);
    const rawContrepartieNom = parent ? (parent.contrepartie_nom || null) : (trans.contrepartie_nom || null);
    const glContrepartieNom = hasIban ? rawContrepartieNom : null;
    // Strip " - Ligne X/Y" suffix from communication for child transactions
    let glCommunication = trans.communication || null;
    if (glCommunication && trans.parent_transaction_id) {
      glCommunication = glCommunication.replace(/ - Ligne \d+\/\d+$/, '') || null;
    }

    const row = sheet.getRow(currentRow);
    row.values = [
      trans.numero_sequence || null,          // A: Nº de séquence
      dateOnly(transDate),                    // B: Date d'exécution (date only, no time)
      dateOnly(valDate),                      // C: Date valeur (date only, no time)
      trans.montant,                         // D: Montant
      trans.devise || 'EUR',                 // E: Devise du compte
      trans.numero_compte || null,           // F: Numéro de compte
      trans.type_transaction || null,        // G: Type de transaction
      trans.contrepartie_iban || 0,           // H: Contrepartie (IBAN, 0 when no IBAN — matches official format)
      glContrepartieNom ?? 0,                // I: Nom de la contrepartie (0 when no name — matches official format)
      glCommunication ? tryNumeric(glCommunication) ?? 0 : 0,  // J: Communication (numeric when possible, 0 when null)
      (trans.details || '').replace(/  +/g, ' ').trim() || null,  // K: Détails (normalized spaces)
      dateOnly(transDate).getUTCMonth() + 1, // L: MTD (month number 1-12)
      1,                                     // M: YTD
      trans.code_comptable || null,            // N: Compte (code comptable)
      null,                                  // O: Provisionné en {year-1}
      codeLabel || null,                     // P: Code Comptable (code + label)
      getActivity(trans) || ''               // Q: Activité
    ];

    // Format montant
    row.getCell(4).numFmt = '#,##0.00';
    row.getCell(4).alignment = { horizontal: 'right' };

    currentRow++;
  });
}

/**
 * Ajoute la feuille "Banque{year}" — transactions bancaires brutes
 * Structure officielle: 13 colonnes, seulement transactions parentes (pas children)
 */
function addBanqueSheet(
  workbook: ExcelJS.Workbook,
  fiscalYear: FiscalYear,
  transactions: TransactionBancaire[]
): void {
  const sheetName = `Banque${fiscalYear.year}`;
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ showGridLines: true }]
  });

  // Colonnes — structure officielle (13 cols)
  const headers = [
    'Nº de séquence', "Date d'exécution", 'Date valeur', 'Montant', 'Devise du compte',
    'Numéro de compte', 'Type de transaction', 'Contrepartie', 'Nom de la contrepartie',
    'Communication', 'Détails', 'Statut', 'Motif du refus'
  ];
  const colWidths = [15.0, 16.14, 11.14, 9.0, 17.0, 18.29, 29.71, 29.14, 49.86, 106.43, 255.71, 8.14, 13.57];

  colWidths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  // En-tête (pas de styling)
  const headerRow = sheet.getRow(1);
  headerRow.values = headers;
  headerRow.height = 15;

  // Filtrer: seulement transactions parentes (pas children), trier par numero_sequence
  const parentTransactions = transactions
    .filter(t => !t.parent_transaction_id)
    .sort((a, b) => (a.numero_sequence || '').localeCompare(b.numero_sequence || ''));

  let currentRow = 2;

  parentTransactions.forEach(trans => {
    const transDate = trans.date_execution instanceof Date
      ? trans.date_execution : new Date(trans.date_execution as any);
    const valDate = trans.date_valeur instanceof Date
      ? trans.date_valeur : new Date(trans.date_valeur as any);

    const row = sheet.getRow(currentRow);
    row.values = [
      trans.numero_sequence || null,            // A: Nº de séquence
      dateOnly(transDate),                     // B: Date d'exécution (date only, no time)
      dateOnly(valDate),                       // C: Date valeur (date only, no time)
      trans.montant,                           // D: Montant
      trans.devise || 'EUR',                   // E: Devise du compte
      trans.numero_compte || null,             // F: Numéro de compte
      trans.type_transaction || null,          // G: Type de transaction
      trans.contrepartie_iban || null,         // H: Contrepartie (IBAN)
      // Official file only shows counterparty name when IBAN is present
      // (card payments have name extracted from details but official leaves it blank)
      (trans.contrepartie_iban ? trans.contrepartie_nom : null) || null,  // I: Nom de la contrepartie
      tryNumeric(trans.communication),          // J: Communication (numeric if pure digits)
      // Normalize double spaces and trim trailing whitespace to match official format
      (trans.details || '').replace(/  +/g, ' ').trim() || null,  // K: Détails
      trans.statut === 'accepte' ? 'Accepté' : trans.statut === 'refuse' ? 'Refusé' : trans.statut === 'en_attente' ? 'En attente' : 'Accepté',  // L: Statut
      null                                     // M: Motif du refus
    ];

    // Format montant
    row.getCell(4).numFmt = '#,##0.00';
    row.getCell(4).alignment = { horizontal: 'right' };

    currentRow++;
  });
}

/**
 * Ajoute la feuille "N PCMN Calypso" — Plan Comptable Minimum Normalisé
 * Structure STATIC du plan comptable belge PCMN avec hiérarchie de classes
 */
function addNPCMNSheet(workbook: ExcelJS.Workbook): void {
  const sheet = workbook.addWorksheet('N PCMN Calypso', {
    views: [{ showGridLines: true }]
  });

  // Column widths matching official exactly
  sheet.getColumn(1).width = 6.71;
  sheet.getColumn(2).width = 2.57;
  sheet.getColumn(3).width = 68.86;
  sheet.getColumn(4).width = 50.14;
  sheet.getColumn(5).width = 62.57;
  sheet.getColumn(6).width = 15.57;
  sheet.getColumn(7).width = 19.71;
  sheet.getColumn(8).width = 9.0;
  sheet.getColumn(9).width = 7.57;
  sheet.getColumn(10).width = 9.0;
  sheet.getColumn(11).width = 7.57;
  sheet.getColumn(12).width = 53.57;
  sheet.getColumn(13).width = 51.86;
  sheet.getColumn(14).width = 23.71;
  sheet.getColumn(15).width = 22.14;

  // Static template: 72 rows matching official reference exactly
  // Format: [A, B, C, D, E, F, G, H, I, J, K, L, M, N, O]
  const rows: (string | null)[][] = [
    // Row 1: Headers
    [null, null, null, null, null, null, null, 'Actifs', null, 'Passifs', null, 'Debit Rubriques ancienne', 'Credit Rubriques ancienne', 'Debit Rubriques ancienne', 'Credit Rubriques ancienne'],
    // Row 2: Class 1
    ['1-0000', '1.', 'FONDS SOCIAL, PROVISIONS POUR RISQUES ET CHARGES ET DETTES \u00C0 PLUS D\u2019UN AN', null, null, null, null, null, null, null, null, null, null, null, null],
    // Row 3-5: 15-000 Subsides en capital
    ['15-000', null, '15.', 'Subsides en capital', null, null, null, null, null, 'VI', null, null, '770 - Subsides communaux', null, '15-000-770'],
    ['15-000', null, '15.', 'Subsides en capital', null, null, null, null, null, 'VI', null, null, '771 - Subsides Lifras', null, '15-000-771'],
    ['15-000', null, '15.', 'Subsides en capital', null, null, null, null, null, 'VI', null, null, '772 - Subsides ADEPS', null, '15-000-772'],
    // Row 6: Class 2
    ['2-0000', '2.', 'FRAIS D\'\u00C9TABLISSEMENT, ACTIFS IMMOBILIS\u00C9S ET CR\u00C9ANCES \u00C0 PLUS D\'UN AN', null, null, null, null, null, null, null, null, null, null, null, null],
    // Row 7: Class 3
    ['3-0000', '3.', 'STOCKS ET COMMANDES EN COURS D\'EX\u00C9CUTION', null, null, null, null, null, null, null, null, null, null, null, null],
    // Row 8: 34-000
    ['34-000', null, '34.', 'Marchandises\u00A0(9)', null, null, null, 'VI.A.4', null, null, null, null, null, null, null],
    // Row 9: 340-00
    ['340-00', null, null, '340.', 'Valeur d\'acquisition\u00A0(10)', null, null, null, null, null, null, '702 - Report stock boutique', '602 - Report stock boutique', '340-00-702', '340-00-602'],
    // Row 10: Class 4
    ['4-0000', '4.', 'CR\u00C9ANCES ET DETTES \u00C0 UN AN AU PLUS', null, null, null, null, null, null, null, null, null, null, null, null],
    // Row 11: 49-000
    ['49-000', null, '49.', 'Comptes de r\u00E9gularisation et d\'attente', null, null, null, null, null, null, null, null, null, null, null],
    // Row 12: 490-00
    ['490-00', null, null, '490.', 'Charges \u00E0 reporter', null, null, 'X', null, null, null, '631 - Sortie \u00E9cole de mer ann\u00E9e suivante', null, '490-00-631', null],
    // Row 13-14: 493-00
    ['493-00', null, null, '493.', 'Produits \u00E0 reporter', null, null, null, null, 'X', null, null, '719 - Cotisation plongeurs a reporter', null, '493-00-719'],
    ['493-00', null, null, '493.', 'Produits \u00E0 reporter', null, null, null, null, null, null, null, '731 - Sortie \u00E9cole de mer ann\u00E9e suivante', null, '493-00-731'],
    // Row 15: Class 5
    ['5-0000', '5.', 'PLACEMENTS DE TR\u00C9SORERIE ET VALEURS DISPONIBLES', null, null, null, null, null, null, null, null, null, null, null, null],
    // Row 16-17: 5500/5510
    ['5500-0', null, null, null, '5500.', 'Comptes courants', null, null, null, null, null, null, '700 - Report Compte courant', null, '5500-0-700'],
    ['5510-0', null, null, null, '5510.', 'Comptes courants', null, null, null, null, null, null, '701 - Report Compte epargne', null, '5510-0-701'],
    // Row 18-19: 570/571
    ['570-00', null, null, '570.', 'Caisses-esp\u00E8ces', null, null, 'IX', null, null, null, null, '703 - Report caisse boutique', null, '570-00-703'],
    ['571-00', null, null, '571.', 'Caisses-esp\u00E8ces', null, null, 'IX', null, null, null, null, '704 - Report caisse piscine', null, '571-00-704'],
    // Row 20: Class 6
    ['6-0000', '6.', 'CHARGES', null, null, null, null, 'Charges', null, 'Produits', null, null, null, null, null],
    // Row 21: 600-00
    ['600-00', null, null, '600.', 'Achats de mati\u00E8res premi\u00E8res', null, null, 'II.A.1', null, null, null, '641 - Stock Boutique', '741 - Stock boutique', '600-00-641', '600-00-741'],
    // Row 22: 601-00
    ['601-00', null, null, '601.', 'Achats de fournitures', null, null, 'II.A.1', null, null, null, '624 - achat de mat\u00E9riel', null, '601-00-624', null],
    // Row 23: 604-00
    ['604-00', null, null, '604.', 'Achats de marchandises', null, null, 'II.A.1', null, null, null, '640 - remboursement Boutique', '740 - Vente Boutique', '604-00-640', '604-00-740'],
    // Row 24: 61-000
    ['61-000', null, '61.', 'Services et biens divers', null, null, null, 'II.B', null, null, null, null, null, null, null],
    // Row 25-27: 610-00
    ['610-00', null, null, '610.', 'Location', null, null, 'II.B', null, null, null, '628 - Salles de cours & frais', null, '610-00-628', null],
    ['610-00', null, null, '610.', 'Location', null, null, 'II.B', null, null, null, '621 - Location piscine', null, '610-00-621', null],
    ['610-00', null, null, '610.', 'Location', null, null, 'II.B', null, null, null, '622 - Location piscine ann\u00E9e pr\u00E9c\u00E9dente', null, '610-00-622', null],
    // Row 28-30: 611-00
    ['611-00', null, null, '611.', 'Assurances', null, null, 'II.B', null, null, null, '616 - Assurances sport', null, '611-00-616', null],
    ['611-00', null, null, '611.', 'Assurances', null, null, 'II.B', null, null, null, '618 - Assurance "administrateurs"', null, '611-00-618', null],
    ['611-00', null, null, '611.', 'Assurances', null, null, 'II.B', null, null, null, '619 - Assurance mat\u00E9riel', null, '611-00-619', null],
    // Row 31-33: 612-00
    ['612-00', null, null, '612.', 'Entretiens', null, null, 'II.B', null, null, null, '625 - divers d\u00E9penses bassin', null, '612-00-625', null],
    ['612-00', null, null, '612.', 'Entretiens', null, null, 'II.B', null, null, null, '622 - entretien & r\u00E9paration mat\u00E9riel', null, '612-00-622', null],
    ['612-00', null, null, '612.', 'Entretiens', null, null, 'II.B', null, null, null, '623 - frais de compresseur', null, '612-00-623', null],
    // Row 34-36: 613-00
    ['613-00', null, null, '613.', 'R\u00E9unions', null, null, 'II.B', null, null, null, '662 - r\u00E9unions moniteurs-instructeurs', null, '613-00-662', null],
    ['613-00', null, null, '613.', 'R\u00E9unions', null, null, 'II.B', null, null, null, '663 - r\u00E9unions du CA', null, '613-00-663', null],
    ['613-00', null, null, '613.', 'R\u00E9unions', null, null, 'II.B', null, null, null, '664 - assembl\u00E9es g\u00E9n\u00E9rales', null, '613-00-664', null],
    // Row 37-38: 614-00
    ['614-00', null, null, '614.', 'Communication', null, null, 'II.B', null, null, null, '629 - Portes ouvertes', null, '614-00-629', null],
    ['614-00', null, null, '614.', 'Communication', null, null, 'II.B', null, null, null, '643 - Site Web', null, '614-00-643', null],
    // Row 39-40: 615-00
    ['615-00', null, null, '615.', 'Activit\u00E9s piscine', null, null, 'II.B', null, null, null, '644 - TSA', null, '615-00-644', null],
    ['615-00', null, null, '615.', 'Activit\u00E9s piscine', null, null, 'II.B', null, null, null, '646 - Divers activit\u00E9s', '746 - Divers activit\u00E9s', '615-00-646', '615-00-746'],
    // Row 41: 616-00
    ['616-00', null, null, '616.', 'Progression moniteurs', null, null, 'II.B', null, null, null, '645 - Frais li\u00E9 au passage de brevet de moniteur', null, '616-00-645', null],
    // Row 42-43: 617-00
    ['617-00', null, null, '617.', 'Voyage club', null, null, 'II.B', null, null, null, '630 - Sortie \u00E9cole de mer ann\u00E9e courante', '730 - Sortie \u00E9cole de mer ann\u00E9e courante', '617-00-630', '617-00-730'],
    ['617-00', null, null, '617.', 'Voyage club', null, null, 'II.B', null, null, null, '634 - Sortie \u00E9cole de mer ann\u00E9e precedente', '634 - Sortie \u00E9cole de mer ann\u00E9e precedente', '617-00-634', '617-00-634'],
    // Row 44-45: 618-00
    ['618-00', null, null, '618.', 'Sorties plong\u00E9es', null, null, 'II.B', null, null, null, '632 - Sorties plong\u00E9es', '732 - Sorties plong\u00E9es', '618-00-632', '618-00-732'],
    ['618-00', null, null, '618.', 'Sorties plong\u00E9es', null, null, 'II.B', null, null, null, '635 - Sorties plong\u00E9es - Frais de l\'ann\u00E9e pr\u00E9c\u00E9dente (A)', '734 - Sorties plong\u00E9es - Recettes de l\'ann\u00E9e pr\u00E9c\u00E9dente (V)', '618-00-635', '618-00-734'],
    // Row 46-47: 619-00
    ['619-00', null, null, '619.', 'Sorties non plong\u00E9es', null, null, 'II.B', null, null, null, '633 - Sorties non plong\u00E9es', '733 - Sorties non plong\u00E9es', '619-00-633', '619-00-733'],
    ['619-00', null, null, '619.', 'Sorties non plong\u00E9es', null, null, 'II.B', null, null, null, '636 - Sorties non plong\u00E9es - Frais de l\'ann\u00E9e pr\u00E9c\u00E9dente (A)', '736 - Sorties non plong\u00E9es - Recettes de l\'ann\u00E9e pr\u00E9c\u00E9dente (V)', '619-00-636', '619-00-736'],
    // Row 48-50: 620-00
    ['620-00', null, null, '620.', 'Divers', null, null, 'II.B', null, null, null, '665 - cadeaux (mariages, d\u00E9part,\u2026)', null, '620-00-665', null],
    ['620-00', null, null, '620.', 'Divers', null, null, 'II.B', null, null, null, '666 - Divers', '766 - Divers', '620-00-666', '620-00-766'],
    ['620-00', null, null, '620.', 'Divers', null, null, 'II.B', null, null, null, '667 - Divers - Frais de l\'ann\u00E9e pr\u00E9c\u00E9dente (A)', '767- Divers - Recettes de l\'ann\u00E9e pr\u00E9c\u00E9dente (V)', '620-00-667', '620-00-767'],
    // Row 51-52: empty rows
    [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    // Row 53: 649-00
    ['649-00', null, null, '649.', 'Charges d\'exploitation port\u00E9es \u00E0 l\'actif au titre de frais de restructuration (\u2013)', null, null, 'II.H', null, null, null, null, null, null, null],
    // Row 54: 657-00
    ['657-00', null, null, '657.', 'Charges financi\u00E8res diverses', null, null, 'V.C', null, null, null, '660 - Frais de banque', '760 - Int\u00E9rets des compte', '657-00-660', '657-00-760'],
    // Row 55: 66-000
    ['66-000', null, '66.', 'Charges d\u2019exploitation ou financi\u00E8res non r\u00E9currentes', null, null, null, 'II.I ou V.D', null, null, null, null, null, null, null],
    // Row 56: 664-00
    ['664-00', null, null, '664.', 'Autres charges d\'exploitation non r\u00E9currentes', null, null, 'II.I', null, null, null, '650 - Soir\u00E9e annuelle', null, '664-00-650', null],
    // Row 57: Class 7
    ['7-0000', '7.', 'PRODUITS', null, null, null, null, null, null, null, null, null, null, null, null],
    // Row 58: 700-00
    ['700-00', null, null, '700.', 'Ventes et prestations de services', null, null, null, null, null, null, null, '720 - Entr\u00E9es bassin (vacances scolaires)', null, '700-00-720'],
    // Row 59: 71-000
    ['71-000', null, '71.', 'Variation des stocks et des commandes en cours d\u2019ex\u00E9cution', null, null, null, null, null, null, null, null, null, null, null],
    // Row 60: 713-00
    ['713-00', null, null, '713.', 'Des produits finis', null, null, null, null, null, null, '742 - Valorisation Stock Boutique', '642 - Depreciation Stock Boutique', '713-00-742', '713-00-642'],
    // Row 61: 73-000
    ['73-000', null, '73.', 'Cotisations, dons, legs et subsides(30)', null, null, null, 'I.D', null, null, null, null, null, null, null],
    // Row 62-67: 730-00
    ['730-00', null, null, '730.', 'Cotisations', null, null, null, null, null, null, '610 - Lifras - Cotisation club', null, '730-00-610', null],
    ['730-00', null, null, '730.', 'Cotisations', null, null, null, null, null, null, '611 - Lifras - Cotisation membres', '711 - Lifras - Cotisation membres', '730-00-611', '730-00-711'],
    ['730-00', null, null, '730.', 'Cotisations', null, null, null, null, null, null, '612 - Cotisations des membres plongeurs', '712 - Cotisations des membres plongeurs', '730-00-612', '730-00-712'],
    ['730-00', null, null, '730.', 'Cotisations', null, null, null, null, null, null, '613 - Cotisations instructeurs', '713 - Cotisations instructeurs', '730-00-613', '730-00-713'],
    ['730-00', null, null, '730.', 'Cotisations', null, null, null, null, null, null, '614 - Cotisations administrateurs', '714 - Cotisations administrateurs', '730-00-614', '730-00-714'],
    ['730-00', null, null, '730.', 'Cotisations', null, null, null, null, null, null, '615 - Cotisation autres', '715 - Cotisation autres', '730-00-615', '730-00-715'],
    // Row 68: 75-000
    ['75-000', null, '75.', 'Produits financiers', null, null, null, '\t\nI.E', null, null, null, null, null, null, null],
    // Row 69: 750-00
    ['750-00', null, null, '750.', 'Produits des immobilisations financi\u00E8res', null, null, 'IV.A', null, null, null, null, '760 - Int\u00E9r\u00EAts banque', null, '750-00-760'],
    // Row 70: 76-000
    ['76-000', null, '76.', 'Produits d\'exploitation ou financiers non r\u00E9currents', null, null, null, 'I.E ou IV.D', null, null, null, null, null, null, null],
    // Row 71: 764-00
    ['764-00', null, null, '764.', 'Autres produits d\u2019exploitation non r\u00E9currents', null, null, 'VII.E', null, null, null, null, '750 - Soir\u00E9e annuelle', null, '764-00-750'],
    // Row 72: Class 0
    ['0-0000', '0.', 'DROITS ET ENGAGEMENTS HORS BILAN\u00A0(33) (34)', null, null, null, null, null, null, null, null, null, null, null, null],
  ];

  // Write all rows
  rows.forEach((rowData, index) => {
    const row = sheet.getRow(index + 1);
    rowData.forEach((value, colIndex) => {
      if (value !== null) {
        row.getCell(colIndex + 1).value = value;
      }
    });
  });
}

/**
 * Ajoute la feuille "Résultats courant" — P&L par code comptable individuel
 * Format: codes groupés par activité avec subtotaux, provisie-regels, et budget
 * Structure identique au fichier officiel du comptable
 */
function addResultatsCourantSheet(
  workbook: ExcelJS.Workbook,
  fiscalYear: FiscalYear,
  codeMonthlyMap: Map<string, number[]>,
  _fiscalYearStart: Date,
  groups: ReportGroup[] = [],
  openingBankBalance?: number
): void {
  const sheet = workbook.addWorksheet('Résultats courant', {
    views: [{ showGridLines: true }]
  });

  // Column widths matching official
  sheet.getColumn(1).width = 4.14;   // A
  sheet.getColumn(2).width = 14.14;  // B: code
  sheet.getColumn(3).width = 44.0;   // C: label
  sheet.getColumn(4).width = 3.86;   // D: spacer
  sheet.getColumn(5).width = 11.0;   // E: F23 / YTD
  sheet.getColumn(6).width = 12.57;  // F: Month
  sheet.getColumn(7).width = 15.29;  // G: Year to Month
  sheet.getColumn(8).width = 12.57;  // H: Full Year
  sheet.getColumn(9).width = 13.0;   // I: Budget
  sheet.getColumn(10).width = 5.43;  // J: spacer
  sheet.getColumn(11).width = 18.14; // K: Commentaires

  const numFmt = '#,##0.00';
  const rightAlign: Partial<ExcelJS.Alignment> = { horizontal: 'right' };

  // Title in B2, merged B2:I4
  sheet.mergeCells('B2:I4');
  const titleCell = sheet.getCell('B2');
  titleCell.value = `COMPTE DE RESULTATS CDC ${fiscalYear.year}`;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Headers in Row 6
  const currentMonth = 12; // Full year
  const headerRow = sheet.getRow(6);
  headerRow.values = [
    currentMonth,                           // A6: month count
    excelDate(new Date(fiscalYear.year, 11, 1)), // B6: date
    null,                                    // C6: empty
    null,                                    // D6: empty
    'F23',                                   // E6: F23
    `Month (${currentMonth})`,               // F6: Month label
    `Year to Month ${currentMonth}`,         // G6: Year to Month
    fiscalYear.year,                         // H6: year
    `Budget ${fiscalYear.year}`,             // I6: Budget
    null,                                    // J6: empty
    'Commentaires'                           // K6: Commentaires
  ];
  headerRow.font = { bold: true };

  // Load account codes
  const accountCodes = getOfficialAccountCodes();
  const accountCodeMap = new Map(accountCodes.map(ac => [ac.code, ac]));

  // Helper: get entry data for a code (monthly + ytd)
  const getCodeData = (code: string) => {
    const monthly = codeMonthlyMap.get(code) || new Array(12).fill(0);
    const ytd = round2(monthly.reduce((s, v) => s + v, 0));
    const lastMonth = monthly[11] || 0;
    return { monthly, ytd, lastMonth };
  };

  // Helper: write a data row (code + label + amounts)
  const writeDataRow = (
    rowNum: number,
    code: string | null,
    label: string,
    vals: { e?: number; f?: number; g?: number; h?: number; i?: number },
    comment?: string,
    bold = false
  ) => {
    const row = sheet.getRow(rowNum);
    if (code) row.getCell(2).value = code;
    if (label) row.getCell(3).value = label;
    if (vals.e !== undefined) { row.getCell(5).value = round2(vals.e); row.getCell(5).numFmt = numFmt; row.getCell(5).alignment = rightAlign; }
    if (vals.f !== undefined) { row.getCell(6).value = round2(vals.f); row.getCell(6).numFmt = numFmt; row.getCell(6).alignment = rightAlign; }
    if (vals.g !== undefined) { row.getCell(7).value = round2(vals.g); row.getCell(7).numFmt = numFmt; row.getCell(7).alignment = rightAlign; }
    if (vals.h !== undefined) { row.getCell(8).value = round2(vals.h); row.getCell(8).numFmt = numFmt; row.getCell(8).alignment = rightAlign; }
    if (vals.i !== undefined) { row.getCell(9).value = round2(vals.i); row.getCell(9).numFmt = numFmt; row.getCell(9).alignment = rightAlign; }
    if (comment) row.getCell(11).value = comment;
    if (bold) row.font = { bold: true };
  };

  // Helper: write a code entry from codeMonthlyMap
  const writeCodeRow = (rowNum: number, code: string, budgetVal?: number) => {
    const info = accountCodeMap.get(code);
    const data = getCodeData(code);
    writeDataRow(rowNum, code, info?.label || code, {
      e: data.ytd,
      f: data.lastMonth,
      g: data.ytd,
      h: data.ytd,
      i: budgetVal
    });
  };

  // Sort codes within each group by plan compta code (last segment)
  const sortGroupCodes = (codes: string[]): string[] => {
    return [...codes].sort((a, b) => {
      const lastA = a.split('-').pop() || '';
      const lastB = b.split('-').pop() || '';
      return lastA.localeCompare(lastB);
    });
  };

  // Provisie-configuratie: provisie-regels die na bepaalde groepen komen
  // Structuur: { afterGroup: groupId, provisions: [...] }
  // Deze provisies zijn handmatige boekingen die niet in codeMonthlyMap zitten
  // maar wel in de officiële resultatenrekening staan
  // TODO: Later deze waarden uit Firestore halen (provisions collectie)

  // Budget per code (statische waarden uit het officiële bestand)
  // TODO: Later uit Firestore budget collectie halen
  const budgetMap = new Map<string, number>([
    ['730-00-610', -50],
    ['730-00-611', -7760],
    ['730-00-711', 12700],
    ['730-00-712', 1600],
    ['730-00-713', 1600],
    ['611-00-616', -50],
    ['611-00-618', -200],
    ['611-00-619', -120],
    ['610-00-621', -6500],
    ['612-00-622', -1500],
    ['612-00-623', -500],
    ['612-00-624', -1000],
    ['612-00-625', -300],
    ['617-00-730', -500],
    ['618-00-732', 100],
    ['604-00-740', 180],
    ['614-00-643', -300],
    ['664-00-750', 1500],
    ['657-00-660', -50],
    ['613-00-662', -50],
    ['613-00-664', -50],
    ['620-00-665', -100],
    ['620-00-666', -200],
    ['15-000-770', 1050],
    ['15-000-772', 500],
  ]);

  // ============================
  // DATA ROWS — grouped by activity
  // ============================
  let currentRow = 8;
  let totalPL_F = 0; // Month total
  let totalPL_G = 0; // Year to Month total
  let totalPL_H = 0; // Full Year total

  // Track which codes are already written (to avoid duplicates)
  const writtenCodes = new Set<string>();

  for (const group of groups.sort((a, b) => a.order - b.order)) {
    const sortedCodes = sortGroupCodes(group.accountCodes);

    // Write each code in this group
    let groupSum_E = 0;
    let groupSum_F = 0;
    let groupSum_G = 0;
    let groupSum_H = 0;
    let groupBudget = 0;

    for (const code of sortedCodes) {
      const data = getCodeData(code);
      // Alleen schrijven als er data is OF als er een budget is
      if (data.ytd !== 0 || data.lastMonth !== 0 || budgetMap.has(code)) {
        writeCodeRow(currentRow, code, budgetMap.get(code));
        groupSum_E += data.ytd;
        groupSum_F += data.lastMonth;
        groupSum_G += data.ytd;
        groupSum_H += data.ytd;
        if (budgetMap.has(code)) groupBudget += budgetMap.get(code)!;
        writtenCodes.add(code);
        currentRow++;
      }
    }

    // Write group subtotal row (bold)
    writeDataRow(currentRow, group.name, '', {
      e: round2(groupSum_E),
      f: round2(groupSum_F),
      g: round2(groupSum_G),
      h: round2(groupSum_H),
      i: groupBudget !== 0 ? round2(groupBudget) : undefined
    }, undefined, true);

    totalPL_F += groupSum_F;
    totalPL_G += groupSum_G;
    totalPL_H += groupSum_H;

    currentRow += 2; // Empty row after subtotal
  }

  // Write any remaining codes not in any group
  const ungroupedCodes: string[] = [];
  for (const [code] of codeMonthlyMap.entries()) {
    if (!writtenCodes.has(code)) {
      ungroupedCodes.push(code);
    }
  }
  if (ungroupedCodes.length > 0) {
    ungroupedCodes.sort();
    for (const code of ungroupedCodes) {
      const data = getCodeData(code);
      if (data.ytd !== 0 || data.lastMonth !== 0) {
        writeCodeRow(currentRow, code, budgetMap.get(code));
        totalPL_F += data.lastMonth;
        totalPL_G += data.ytd;
        totalPL_H += data.ytd;
        currentRow++;
      }
    }
    currentRow++;
  }

  // ============================
  // TOTAL P&L row
  // ============================
  writeDataRow(currentRow, 'TOTAL P&L', '', {
    f: round2(totalPL_F),
    g: round2(totalPL_G),
    h: round2(totalPL_H),
    i: 0
  }, undefined, true);
  currentRow += 2;

  // ============================
  // BOTTOM SECTION: Cash Balance reconciliation
  // ============================
  if (openingBankBalance !== undefined) {
    writeDataRow(currentRow, null, 'Opening Cash Balance', {
      f: round2(openingBankBalance),
      g: round2(openingBankBalance),
      h: round2(openingBankBalance)
    });
    currentRow++;

    writeDataRow(currentRow, null, `Total Mouvement${fiscalYear.year}`, {
      f: round2(totalPL_F),
      g: round2(totalPL_G),
      h: round2(totalPL_H)
    });
    currentRow++;

    // Apport Cash Reserve (empty placeholder)
    writeDataRow(currentRow, null, 'Apport Cash Reserve', {});
    currentRow++;

    // Balance Théorique = Opening + Total P&L
    const balanceTheorique = round2(openingBankBalance + totalPL_H);
    writeDataRow(currentRow, null, `Balance Theorique ${fiscalYear.year}`, {
      f: round2(openingBankBalance + totalPL_F),
      g: round2(openingBankBalance + totalPL_G),
      h: round2(balanceTheorique)
    });
    currentRow++;

    // Balance Banque (actual bank balance — same as Bilan Compte à vue closing)
    // TODO: pass actual closing bank balance for exact match
    writeDataRow(currentRow, null, 'Balance Banque', {});
    currentRow++;

    // Difference
    writeDataRow(currentRow, null, 'Difference', {});
  }
}

/**
 * Ajoute la feuille "Plan compta" — Plan comptable statique Calypso
 * Structure officielle avec codes de dépenses/recettes appairés (classe 6 vs 7)
 */
function addPlanComptaSheet(workbook: ExcelJS.Workbook): void {
  const sheet = workbook.addWorksheet('Plan compta', {
    views: [{ showGridLines: true }]
  });

  // Column widths (official: A=5.57, B=27.14, C=11.14, D=6.86, E=28.57)
  sheet.getColumn(1).width = 5.57;
  sheet.getColumn(2).width = 27.14;
  sheet.getColumn(3).width = 11.14;
  sheet.getColumn(4).width = 6.86;
  sheet.getColumn(5).width = 28.57;

  // ========== STATIC TEMPLATE — exact replica of official Plan compta ==========
  // This sheet is identical every year, only the codes/labels matter (no data).

  // Row 1: Title
  sheet.getCell('A1').value = '#REF!';
  sheet.getCell('B1').value = 'CALYPSO DIVING CLUB ASBL';
  sheet.getCell('B1').font = { bold: true, size: 14 };

  // Row 3: Mouvements de fonds
  sheet.getCell('D3').value = 'MOUVEMENTS DE FONDS';
  sheet.getCell('D3').font = { bold: true };

  // Rows 5-9: Opening/Closing balances
  const movements: Array<[string, string]> = [
    ['600 - Report Compte courant', '700 - Report Compte courant'],
    ['601 - Report Compte epargne', '701 - Report Compte epargne'],
    ['602 - Report stock boutique', '702 - Report stock boutique'],
    ['603 - Report caisse boutique', '703 - Report caisse boutique'],
    ['604 - Report caisse piscine', '704 - Report caisse piscine'],
  ];
  for (let i = 0; i < movements.length; i++) {
    sheet.getCell(`B${5 + i}`).value = movements[i][0];
    sheet.getCell(`E${5 + i}`).value = movements[i][1];
  }

  // Row 11: DEPENSES / RECETTES
  sheet.getCell('A11').value = 'DEPENSES';
  sheet.getCell('A11').font = { bold: true };
  sheet.getCell('D11').value = 'RECETTES';
  sheet.getCell('D11').font = { bold: true };

  // Row 13: Section 1 — Activités plongées en général
  sheet.getCell('A13').value = 'Dépenses des activités plongées en général';
  sheet.getCell('A13').font = { bold: true };
  sheet.getCell('D13').value = 'Recettes des activités plongées en général';
  sheet.getCell('D13').font = { bold: true };

  // Rows 15-23: Cotisations & assurances
  sheet.getCell('B15').value = '610 - Lifras - Cotisation club';
  sheet.getCell('B16').value = '611 - Lifras - Cotisation membres';
  sheet.getCell('E16').value = '711 - Lifras - Cotisation membres';
  sheet.getCell('B17').value = '612 - Cotisations des membres plongeurs';
  sheet.getCell('E17').value = '712 - Cotisations des membres plongeurs';
  sheet.getCell('B18').value = '613 - Cotisations instructeurs';
  sheet.getCell('E18').value = '713 - Cotisations instructeurs';
  sheet.getCell('B19').value = '614 - Cotisations administrateurs';
  sheet.getCell('E19').value = '714 - Cotisations administrateurs';
  sheet.getCell('B20').value = '615 - Cotisation autres';
  sheet.getCell('E20').value = '715 - Cotisation autres';
  sheet.getCell('B21').value = '616 - Assurances sport';
  sheet.getCell('B22').value = '617 - Assurances R.C.';
  sheet.getCell('B23').value = '618 - Assurance "administrateurs"';
  sheet.getCell('E24').value = '719 - Cotisation plongeurs a reporter';

  // Row 26: Section 2 — Piscine
  sheet.getCell('A26').value = 'Dépenses des activités "piscine"';
  sheet.getCell('A26').font = { bold: true };
  sheet.getCell('D26').value = 'Recettes des activités plongées "Piscine"';
  sheet.getCell('D26').font = { bold: true };

  sheet.getCell('E28').value = '720 - Entrées bassin (vacances scolaires)';
  sheet.getCell('B29').value = '621 - Location piscine';
  sheet.getCell('B30').value = '622 - réparation matériel';
  sheet.getCell('B31').value = '623 - frais de compresseur';
  sheet.getCell('B32').value = '624 - achat de matériel';
  sheet.getCell('B33').value = '625 - divers dépenses bassin';
  sheet.getCell('B34').value = '626 - air oxygène';

  // Row 36: Section 3 — Formation
  sheet.getCell('A36').value = 'Dépenses de "Formation"';
  sheet.getCell('A36').font = { bold: true };
  sheet.getCell('D36').value = 'Recettes de "Formation"';
  sheet.getCell('D36').font = { bold: true };

  sheet.getCell('B38').value = '627 - Brevets';
  sheet.getCell('B39').value = '628 - Salles de cours & frais';
  sheet.getCell('B40').value = '629 - Portes ouvertes';

  // Row 42: Section 4 — Sorties club
  sheet.getCell('A42').value = 'Dépenses des activités "sorties club"';
  sheet.getCell('A42').font = { bold: true };
  sheet.getCell('D42').value = 'Recettes des activités "sorties club"';
  sheet.getCell('D42').font = { bold: true };

  sheet.getCell('B44').value = '630 - Sortie école de mer année courante';
  sheet.getCell('E44').value = '730 - Sortie école de mer année courante';
  sheet.getCell('B45').value = '631 - Sortie école de mer année suivante';
  sheet.getCell('E45').value = '731 - Sortie école de mer année suivante';
  sheet.getCell('B46').value = '632 - Sorties plongées';
  sheet.getCell('E46').value = '732 - Sorties plongées';
  sheet.getCell('B47').value = '633 - Sorties non plongées';
  sheet.getCell('E47').value = '733 - Sorties non plongées';

  // Row 49: Section 5 — Activités connexes
  sheet.getCell('A49').value = 'Dépenses des activités connexes';
  sheet.getCell('A49').font = { bold: true };
  sheet.getCell('D49').value = 'Recettes des activités connexes';
  sheet.getCell('D49').font = { bold: true };

  sheet.getCell('B51').value = '640 - Boutique';
  sheet.getCell('E51').value = '740 - Boutique';
  sheet.getCell('B52').value = '641 - Stock Boutique';
  sheet.getCell('E52').value = '741 - Stock boutique';
  sheet.getCell('B53').value = '642 - Depreciation Stock Boutique';
  sheet.getCell('E53').value = '742 - Valorisation Stock Boutique';
  sheet.getCell('B54').value = '643 - Site Web';
  sheet.getCell('B55').value = '644 - TSA';
  sheet.getCell('B56').value = '645 - Lifras Brevet de moniteur';
  sheet.getCell('B57').value = '646 - Divers activités';
  sheet.getCell('E57').value = '746 - Divers activités';

  // Row 59: Section 6 — Soirée
  sheet.getCell('A59').value = 'Dépenses de soirée';
  sheet.getCell('A59').font = { bold: true };
  sheet.getCell('D59').value = 'Recettes des soirées';
  sheet.getCell('D59').font = { bold: true };

  sheet.getCell('B61').value = '650 - Soirée annuelle';
  sheet.getCell('E61').value = '750 - Soirée annuelle';

  // Row 63: Section 7 — Administratives
  sheet.getCell('A63').value = 'Dépenses administratives';
  sheet.getCell('A63').font = { bold: true };
  sheet.getCell('D63').value = 'Recettes administratives';
  sheet.getCell('D63').font = { bold: true };

  sheet.getCell('B65').value = '660 - Frais de banque';
  sheet.getCell('E65').value = '760 - Intérêts banque';
  sheet.getCell('B66').value = '661 - dépenses de matériel administratif divers';
  sheet.getCell('B67').value = '662 - réunions moniteurs-instructeurs';
  sheet.getCell('B68').value = '663 - réunions du CA';
  sheet.getCell('B69').value = '664 - assemblées générales';
  sheet.getCell('B70').value = '665 - cadeaux (mariages, départ,…)';
  sheet.getCell('B71').value = '666 - Divers administratif';
  sheet.getCell('E71').value = '766 - Divers administratif';
  sheet.getCell('B72').value = '667 - Ajustement administratif';
  sheet.getCell('E72').value = '767 - Ajustement administratif';

  // Row 74: Section 8 — Subsides (revenue only)
  sheet.getCell('D74').value = 'Subsides';
  sheet.getCell('D74').font = { bold: true };

  sheet.getCell('E76').value = '770 - Subsides commune';
  sheet.getCell('E77').value = '771 - Subsides Lifras';
  sheet.getCell('E78').value = '772 - Subsides ADEPS';
}

// ============================================================
// FASE 3: Boutique inventaris + BS an-1
// ============================================================

/**
 * Ajoute la feuille "Boutk - fin {year}" — Inventaire boutique club
 * Structure officielle avec 21 lignes, catégories, et 13 colonnes
 */
function addBoutiqueSheet(
  workbook: ExcelJS.Workbook,
  fiscalYear: FiscalYear,
  items: BoutiqueItem[],
  sheetType: 'boutique' | 'boutique_lifras'
): void {
  if (sheetType === 'boutique_lifras') {
    addBoutiqueLIFRASSheet(workbook, fiscalYear, items);
    return;
  }

  const sheetName = `Boutk - fin ${fiscalYear.year}`;
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 2, showGridLines: true }]
  });

  // Set column widths (official: A=4.14, B=28.71, C=10.43, D=12.0, E=11.0, F=5.29, G=5.57, H=11.0, I=10.43, J=9.57, K=11.0, L=10.71, M=8.86)
  sheet.getColumn(1).width = 4.14;   // A: empty
  sheet.getColumn(2).width = 28.71;  // B: Item name / Category
  sheet.getColumn(3).width = 10.43;  // C: Stock Initial
  sheet.getColumn(4).width = 12.0;   // D: Unit Value End Prev Year
  sheet.getColumn(5).width = 11.0;   // E: Stock Value Prev Year
  sheet.getColumn(6).width = 5.29;   // F: spacer
  sheet.getColumn(7).width = 5.57;   // G: Purchases Qty
  sheet.getColumn(8).width = 11.0;   // H: Purchase Value
  sheet.getColumn(9).width = 10.43;  // I: Sales/Distributed Qty
  sheet.getColumn(10).width = 9.57;  // J: Final Stock Qty
  sheet.getColumn(11).width = 11.0;  // K: Unit Value Start Prev Year
  sheet.getColumn(12).width = 10.71; // L: Inventory Unit Value
  sheet.getColumn(13).width = 8.86;  // M: Stock Value

  // R1: empty
  // R2: Headers
  const headerRow = sheet.getRow(2);
  headerRow.values = [
    '', 'INVENTAIRE 14/01/' + fiscalYear.year,
    'Stock Initial', 'Valeur unitaire fin ' + (fiscalYear.year - 1),
    'Valeur stock fin ' + (fiscalYear.year - 1), '',
    'Achat', "Valeur d'achat", 'Vente / distribution', 'Stock Final',
    'Valeur unitaire début ' + (fiscalYear.year - 1),
    "Valeur unitaire d'inventaire", 'Valeur du stock'
  ];
  headerRow.eachCell(cell => applyHeaderStyle(cell));
  headerRow.height = 22;

  // Categories with items (classification based on item name)
  const categories = [
    { name: 'CARNETS DE PLONGEE', items: items.filter(i => i.nom.toLowerCase().includes('carnet')) },
    { name: 'CARTES LIFRAS', items: items.filter(i => i.nom.toLowerCase().includes('carte')) },
    { name: 'FICHES & LIVRES', items: items.filter(i => i.nom.toLowerCase().includes('fiche') || i.nom.toLowerCase().includes('livre')) },
    { name: 'Textile', items: items.filter(i => i.nom.toLowerCase().includes('textile')) },
    { name: 'GOODIES', items: items.filter(i => i.nom.toLowerCase().includes('goodie')) }
  ];

  // Add uncategorized items to the last category
  const categorizedIds = new Set(categories.flatMap(c => c.items.map(it => it.id)));
  const uncategorized = items.filter(i => !categorizedIds.has(i.id));
  if (uncategorized.length > 0) {
    categories[categories.length - 1].items.push(...uncategorized);
  }

  let currentRow = 3;
  let totalStockValue = 0;

  for (const category of categories) {
    if (category.items.length === 0) continue;

    // Category header in row
    const catRow = sheet.getRow(currentRow);
    catRow.getCell(2).value = category.name;
    catRow.getCell(2).font = { bold: true };
    catRow.getCell(2).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: CALYPSO_COLORS.groupBg }
    };
    currentRow++;

    // Items in this category
    for (const item of category.items) {
      const stockValue = round2(item.quantite * item.prix_achat);
      const row = sheet.getRow(currentRow);

      row.values = [
        null,                             // A: spacer → null
        item.nom,                         // B: item name
        item.quantite,                    // C: stock initial qty
        item.prix_achat,                  // D: unit value
        stockValue,                       // E: stock value
        null,                             // F: spacer → null
        0,                                // G: purchases → 0 (numeric)
        0,                                // H: purchase value → 0 (numeric)
        0,                                // I: sales/distributed → 0 (numeric)
        0,                                // J: final stock → 0 (numeric)
        0,                                // K: unit value start → 0 (numeric)
        item.prix_achat,                  // L: inventory unit value
        0                                 // M: stock value → 0 (numeric)
      ];

      // Format numeric columns
      [3, 4, 5, 8, 10, 11, 12, 13].forEach(col => {
        row.getCell(col).numFmt = '#,##0.00';
        row.getCell(col).alignment = { horizontal: 'right' };
      });

      totalStockValue = round2(totalStockValue + stockValue);
      currentRow++;
    }
  }

  // Last row: M = total stock value (685.01 in example)
  const lastRow = sheet.getRow(currentRow);
  lastRow.getCell(13).value = totalStockValue;
  lastRow.getCell(13).numFmt = '#,##0.00';
  lastRow.getCell(13).font = { bold: true };
}

/**
 * Ajoute la feuille "Boutk LIFRAS - fin {year}" — Inventaire LIFRAS
 * Structure officielle très différente: 30+ lignes, 20 colonnes
 */
function addBoutiqueLIFRASSheet(
  workbook: ExcelJS.Workbook,
  fiscalYear: FiscalYear,
  items: BoutiqueItem[]
): void {
  const sheetName = `Boutk LIFRAS - fin ${fiscalYear.year}`;
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 5, showGridLines: true }]
  });

  // Set column widths (official)
  const widths = [10.57, 64.86, 10.14, 10.57, 11.43, 7.0, 4.0, 13.0, 5.43, 6.14, 13.0, 5.29, 9.86, 16.29, 19.0, 9.86, 14.0, 4.0, 11.43, 13.0];
  for (let i = 0; i < widths.length; i++) {
    sheet.getColumn(i + 1).width = widths[i];
  }

  // R1: Merged title
  sheet.mergeCells('A1:R1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'Mouvements boutique LIFRAS';
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // R2: Three merged sections for headers
  sheet.mergeCells('A2:F2');
  sheet.getCell('A2').value = 'Inventaire 31/12/' + (fiscalYear.year - 1);
  sheet.getCell('A2').font = { bold: true };
  sheet.getCell('A2').alignment = { horizontal: 'center' };

  sheet.mergeCells('I2:Q2');
  sheet.getCell('I2').value = 'Operations ' + fiscalYear.year + ' (factures LIFRAS)';
  sheet.getCell('I2').font = { bold: true };
  sheet.getCell('I2').alignment = { horizontal: 'center' };

  sheet.mergeCells('S2:T2');
  sheet.getCell('S2').value = 'Inventaire 31/12/' + fiscalYear.year;
  sheet.getCell('S2').font = { bold: true };
  sheet.getCell('S2').alignment = { horizontal: 'center' };

  sheet.mergeCells('V2:AD2');
  sheet.getCell('V2').value = 'Factures LIFRAS';
  sheet.getCell('V2').font = { bold: true };
  sheet.getCell('V2').alignment = { horizontal: 'center' };

  // R4: Column headers
  const headerRow = sheet.getRow(4);
  headerRow.values = [
    'REF. LIFRAS', 'DESCRIPTION', 'QUANTITE', 'PRIX ACHAT', '(PRIX VENTE)', 'TOTAL', '',
    '', 'Achat', 'Vendu', 'Donné', 'Solde', 'Total achat', 'Total Stock + achat',
    "Réduction d'inventaire", 'Total vente', 'Profits sur vente', '', 'QUANTITE', 'TOTAL'
  ];
  headerRow.eachCell(cell => applyHeaderStyle(cell));
  headerRow.height = 22;

  // R6+: Data rows
  let currentRow = 6;
  for (const item of items) {
    const row = sheet.getRow(currentRow);
    const totalValue = round2(item.quantite * item.prix_achat);

    row.values = [
      item.reference || null,            // A: REF LIFRAS
      item.nom,                          // B: DESCRIPTION
      item.quantite,                     // C: QUANTITE opening
      item.prix_achat,                   // D: PRIX ACHAT
      item.prix_vente || 0,              // E: PRIX VENTE
      totalValue,                        // F: TOTAL
      null,                              // G: spacer
      null,                              // H: spacer
      0,                                 // I: Achat
      0,                                 // J: Vendu
      0,                                 // K: Donné
      0,                                 // L: Solde
      0,                                 // M: Total achat
      0,                                 // N: Total Stock + achat
      0,                                 // O: Réduction d'inventaire
      0,                                 // P: Total vente
      0,                                 // Q: Profits sur vente
      null,                              // R: spacer
      item.quantite,                     // S: QUANTITE closing
      totalValue                         // T: TOTAL closing
    ];

    // Format numeric columns
    [3, 4, 5, 6, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19, 20].forEach(col => {
      row.getCell(col).numFmt = '#,##0.00';
      row.getCell(col).alignment = { horizontal: 'right' };
    });

    currentRow++;
  }
}

/**
 * Ajoute la feuille "Budget Next Year" — comparaison budget vs réalisé
 * Structure officielle avec CDC BUDGET en R2-R4, données à partir R8
 */
function addBudgetNextYearSheet(
  workbook: ExcelJS.Workbook,
  fiscalYear: FiscalYear,
  groupsData: GroupData[],
  _fiscalYearStart: Date
): void {
  const nextYear = fiscalYear.year + 1;
  const sheet = workbook.addWorksheet('Budget Next Year', {
    views: [{ state: 'frozen', ySplit: 7, xSplit: 3, showGridLines: true }]
  });

  // Set column widths (official: A=5.86, B=15.14, C=44.0, D=10.71, E=10.86, F=13.0, G=13.0, H=15.14, I=13.0, J=13.0, K=17.29, L=41.71, M=10.29)
  sheet.getColumn(1).width = 5.86;   // A
  sheet.getColumn(2).width = 15.14;  // B: Code/Line no
  sheet.getColumn(3).width = 44.0;   // C: Label / Title
  sheet.getColumn(4).width = 10.71;  // D: Next Year Budget
  sheet.getColumn(5).width = 10.86;  // E: Full Year Realized
  sheet.getColumn(6).width = 13.0;   // F: Current Year Budget
  sheet.getColumn(7).width = 13.0;   // G: spacer
  sheet.getColumn(8).width = 15.14;  // H: spacer
  sheet.getColumn(9).width = 13.0;   // I: spacer
  sheet.getColumn(10).width = 13.0;  // J: spacer
  sheet.getColumn(11).width = 17.29; // K: Code (right section)
  sheet.getColumn(12).width = 41.71; // L: Label (right section)
  sheet.getColumn(13).width = 10.29; // M: Budget (right section)

  // R2-R4: Merged title sections
  sheet.mergeCells('C2:F4');
  const titleLeftCell = sheet.getCell('C2');
  titleLeftCell.value = `CDC BUDGET ${nextYear}`;
  titleLeftCell.font = { bold: true, size: 14 };
  titleLeftCell.alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells('K2:M4');
  const titleRightCell = sheet.getCell('K2');
  titleRightCell.value = `CDC BUDGET ${fiscalYear.year}`;
  titleRightCell.font = { bold: true, size: 14 };
  titleRightCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // R6: Date and column headers — official: C1=12, C2=date, C4-C6=headers
  const row6 = sheet.getRow(6);
  row6.values = [12, excelDate(new Date(fiscalYear.year, 11, 1)), null, 'Budget ' + nextYear, 'Full Year ' + fiscalYear.year, 'Budget ' + fiscalYear.year];
  row6.getCell(1).numFmt = '0';
  row6.getCell(2).numFmt = 'mm/dd/yyyy';

  // R8+: Data rows (pas de groep headers, structure officielle)
  let currentRow = 8;

  groupsData.forEach(groupData => {
    // Pas de ligne de groupe (structure officielle: codes uniquement)

    // Comptes
    groupData.accounts.forEach(account => {
      const row = sheet.getRow(currentRow);
      row.values = [
        null,
        account.code,
        account.label,
        null, // D: Next Year Budget (editable, yellow)
        account.ytd !== 0 ? round2(account.ytd) : null, // E: Full Year Realized
        account.budget !== 0 ? round2(account.budget) : null, // F: Current Year Budget
        null, null, null, null, // G-J spacers
        account.code, // K: Code right (official: same code)
        account.label, // L: Label right
        account.budget !== 0 ? round2(account.budget) : null  // M: Budget right (current year budget)
      ];

      // Format numeric columns
      [5].forEach(col => {
        row.getCell(col).numFmt = '#,##0.00';
        row.getCell(col).alignment = { horizontal: 'right' };
      });

      // Column D: Editable (yellow)
      applyEditableStyle(row.getCell(4));

      currentRow++;
    });

    currentRow++;
  });
}

/**
 * Ajoute la feuille "BS an-1" — Bilan de l'année précédente
 * Structure officielle avec layout ACTIF/PASSIF côte à côte sur 33 lignes
 */
function addBSPreviousYearSheet(
  workbook: ExcelJS.Workbook,
  previousYear: number,
  bilanCodes: BilanCode[],
  bilanValues: BilanValues[]
): void {
  const sheet = workbook.addWorksheet('BS an-1', {
    views: [{ showGridLines: true }]
  });

  // Column widths (official: A=4.14, B=47.86, C=4.57, D=15.0, E=11.14, F=10.86, G=46.14, H=2.29, I=10.71, J=12.71, K=9.14, L=8.14)
  sheet.getColumn(1).width = 4.14;   // A
  sheet.getColumn(2).width = 47.86;  // B: ACTIF labels
  sheet.getColumn(3).width = 4.57;   // C: spacer
  sheet.getColumn(4).width = 15.0;   // D: ACTIF Opening
  sheet.getColumn(5).width = 11.14;  // E: ACTIF Closing
  sheet.getColumn(6).width = 10.86;  // F: spacer
  sheet.getColumn(7).width = 46.14;  // G: PASSIF labels
  sheet.getColumn(8).width = 2.29;   // H: spacer
  sheet.getColumn(9).width = 10.71;  // I: PASSIF Opening
  sheet.getColumn(10).width = 12.71; // J: PASSIF Closing
  sheet.getColumn(11).width = 9.14;  // K: spacer
  sheet.getColumn(12).width = 8.14;  // L: spacer

  // R2: Merged title
  sheet.mergeCells('B2:J4');
  const titleCell = sheet.getCell('B2');
  titleCell.value = `Bilan Calypso DC Déc. ${previousYear}`;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // R7: Opening/Closing headers
  const headerRow = sheet.getRow(7);
  headerRow.values = [null, null, null, 'OPENING', 'CLOSING', null, null, null, 'OPENING', 'CLOSING'];
  ['D7', 'E7', 'I7', 'J7'].forEach(addr => applyHeaderStyle(sheet.getCell(addr)));

  // R8: ACTIF and PASSIF titles
  sheet.getCell('B8').value = 'ACTIF';
  sheet.getCell('B8').font = { bold: true, size: 12 };
  sheet.getCell('G8').value = 'PASSIF';
  sheet.getCell('G8').font = { bold: true, size: 12 };

  const valuesMap = new Map(bilanValues.map(v => [v.bilanCodeId, v]));
  const actifCodes = bilanCodes.filter(c => c.section === 'actif' && !c.parentId).sort((a, b) => a.order - b.order);
  const passifCodes = bilanCodes.filter(c => c.section === 'passif' && !c.parentId).sort((a, b) => a.order - b.order);

  let currentRow = 9;
  let totalActifOpening = 0;
  let totalActifClosing = 0;
  let totalPassifOpening = 0;
  let totalPassifClosing = 0;

  // Write ACTIF and PASSIF items side by side
  const maxRows = Math.max(actifCodes.length, passifCodes.length);

  for (let i = 0; i < maxRows; i++) {
    const actifCode = actifCodes[i];
    const passifCode = passifCodes[i];

    // ACTIF item
    if (actifCode) {
      const values = valuesMap.get(actifCode.id);
      const opening = round2(values?.openingValue ?? 0);
      const closing = round2(values?.closingValue ?? 0);

      const row = sheet.getRow(currentRow);
      row.getCell(2).value = actifCode.name;
      row.getCell(4).value = opening;
      row.getCell(5).value = closing;

      row.getCell(4).numFmt = '#,##0.00';
      row.getCell(5).numFmt = '#,##0.00';
      row.getCell(4).alignment = { horizontal: 'right' };
      row.getCell(5).alignment = { horizontal: 'right' };

      totalActifOpening = round2(totalActifOpening + opening);
      totalActifClosing = round2(totalActifClosing + closing);
    }

    // PASSIF item
    if (passifCode) {
      const values = valuesMap.get(passifCode.id);
      const opening = round2(values?.openingValue ?? 0);
      const closing = round2(values?.closingValue ?? 0);

      const row = sheet.getRow(currentRow);
      row.getCell(7).value = passifCode.name;
      row.getCell(9).value = opening;
      row.getCell(10).value = closing;

      row.getCell(9).numFmt = '#,##0.00';
      row.getCell(10).numFmt = '#,##0.00';
      row.getCell(9).alignment = { horizontal: 'right' };
      row.getCell(10).alignment = { horizontal: 'right' };

      totalPassifOpening = round2(totalPassifOpening + opening);
      totalPassifClosing = round2(totalPassifClosing + closing);
    }

    currentRow++;
  }

  // R27: Totals
  const totalRow = sheet.getRow(27);
  totalRow.getCell(2).value = 'TOTAL ACTIF';
  totalRow.getCell(2).font = { bold: true };
  totalRow.getCell(4).value = totalActifOpening;
  totalRow.getCell(5).value = totalActifClosing;
  totalRow.getCell(4).numFmt = '#,##0.00';
  totalRow.getCell(5).numFmt = '#,##0.00';
  totalRow.getCell(4).font = { bold: true };
  totalRow.getCell(5).font = { bold: true };

  totalRow.getCell(7).value = 'TOTAL PASSIF';
  totalRow.getCell(7).font = { bold: true };
  totalRow.getCell(9).value = totalPassifOpening;
  totalRow.getCell(10).value = totalPassifClosing;
  totalRow.getCell(9).numFmt = '#,##0.00';
  totalRow.getCell(10).numFmt = '#,##0.00';
  totalRow.getCell(9).font = { bold: true };
  totalRow.getCell(10).font = { bold: true };

  // R29: Difference (should be 0)
  const diffRow = sheet.getRow(29);
  const difference = round2(totalActifClosing - totalPassifClosing);
  diffRow.getCell(10).value = difference;
  diffRow.getCell(10).numFmt = '#,##0.00';

  // R30: Reference year
  const refRow = sheet.getRow(30);
  refRow.getCell(2).value = 'Année de référence';
  refRow.getCell(5).value = previousYear;
}

// ============================================================
// MAIN ORCHESTRATOR
// ============================================================

/**
 * Génère le fichier Excel du Compte de Résultats
 */
export async function generateCompteResultatsExcel(
  clubId: string,
  fiscalYear: FiscalYear
): Promise<Blob> {
  // Dynamic import for code splitting - ExcelJS is a large library
  const ExcelJS = await import('exceljs');

  // 1. Récupérer les groupes de rapport
  const groups = await getReportGroups(clubId);

  // 2. Créer la période depuis l'année fiscale
  const period = ReportService.createPeriodFromFiscalYear(fiscalYear);

  // 3. Récupérer les transactions
  const transactions = await ReportService.getTransactionsForPeriod(clubId, period, fiscalYear.id);

  // 4. Agréger les données par code et mois
  const fiscalYearStart = fiscalYear.start_date instanceof Date
    ? fiscalYear.start_date
    : (fiscalYear.start_date as any).toDate();

  const codeMonthlyMap = aggregateTransactionsByCodeAndMonth(transactions, fiscalYearStart);

  // 4b. Validation: détecter les codes de transaction absents des groupes de rapport
  const allGroupCodes = new Set(groups.flatMap(g => g.accountCodes));
  const unmappedCodes = new Map<string, number>(); // code → total montant
  for (const [code, monthlyAmounts] of codeMonthlyMap.entries()) {
    if (!allGroupCodes.has(code)) {
      const total = monthlyAmounts.reduce((sum, val) => sum + val, 0);
      unmappedCodes.set(code, total);
    }
  }
  if (unmappedCodes.size > 0) {
    const totalMissing = Array.from(unmappedCodes.values()).reduce((sum, val) => sum + val, 0);
    logger.warn(`[ReportExcel] ⚠️ ${unmappedCodes.size} code(s) comptable(s) utilisé(s) dans les transactions mais absent(s) des Groupes de Rapport:`);
    unmappedCodes.forEach((total, code) => {
      logger.warn(`  - ${code}: ${total.toFixed(2)} EUR`);
    });
    logger.warn(`  Total non comptabilisé dans le P&L: ${totalMissing.toFixed(2)} EUR`);
  }

  // 5. Préparer les données des groupes
  const groupsData = prepareGroupData(groups, codeMonthlyMap);

  // 6. Créer le workbook Excel
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CalyCompta';
  workbook.created = new Date();

  // Charger le logo
  const logoId = await addLogoToWorkbook(workbook);

  const sheet = workbook.addWorksheet('P&L courant par mois', {
    views: [{ state: 'frozen', ySplit: 5, xSplit: 2, showGridLines: false }]
  });

  // 7. Définir les colonnes (A=month count, B=date, C=empty, D=empty, E=F23, F-Q=months 1-12, R=YTD, S=Budget, T=empty, U=Commentaires)
  sheet.getColumn(1).width = 4.14;   // A: month count
  sheet.getColumn(2).width = 14.14;  // B: date
  sheet.getColumn(3).width = 44.0;   // C: (empty for spacing)
  sheet.getColumn(4).width = 3.86;   // D: (empty for spacing)
  sheet.getColumn(5).width = 11.0;   // E: F23
  for (let i = 0; i < 12; i++) {
    sheet.getColumn(6 + i).width = 14.0;  // F-Q: months
  }
  sheet.getColumn(18).width = 11.0;  // R: YTD
  sheet.getColumn(19).width = 11.0;  // S: Budget
  sheet.getColumn(20).width = 3.86;  // T: (empty)
  sheet.getColumn(21).width = 44.0;  // U: Commentaires

  // 8. Ajouter le logo s'il est disponible (lignes 1-2)
  if (logoId !== null) {
    addLogoToSheet(sheet, logoId, 0, 0);
    sheet.getRow(1).height = 50;
    sheet.getRow(2).height = 50;
  }

  // 9. Ajouter le titre (ligne 2, merged C2:I4)
  sheet.mergeCells('C2:I4');
  const titleCell = sheet.getCell('C2');
  titleCell.value = `COMPTE DE RESULTATS CDC ${fiscalYear.year}`;
  titleCell.font = { bold: true, size: 14, color: { argb: CALYPSO_COLORS.blue } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // 10. Ligne d'en-tête des colonnes (ligne 5)
  // A5=12, B5=date, E5='F23', F5-Q5=1-12, R5='YTD = 12', S5='Budget {year}', U5='Commentaires'
  const dataHeaderRow = sheet.getRow(5);
  const monthHeaders = [];
  for (let i = 1; i <= 12; i++) {
    monthHeaders.push(i);
  }
  dataHeaderRow.values = [
    12,                                              // A5: month count
    excelDate(new Date(fiscalYear.year, 11, 1)),    // B5: date (Dec 1 of fiscal year)
    null,                             // C5: empty
    null,                             // D5: empty
    'F23',                            // E5: F23
    ...monthHeaders,                  // F5-Q5: 1-12
    `YTD = 12`,                       // R5: YTD label
    `Budget ${fiscalYear.year}`,      // S5: Budget label
    null,                             // T5: empty
    'Commentaires'                    // U5: Commentaires
  ];
  dataHeaderRow.eachCell(cell => {
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center' };
  });
  dataHeaderRow.height = 20;

  // 11. Ajouter les données des groupes
  let currentRow = 7;  // Data starts at row 7
  let totalMonthly = new Array(12).fill(0);
  let totalYTD = 0;
  let totalBudget = 0;

  groupsData.forEach(groupData => {
    // Pas de ligne de groupe ni de sous-total (structure officielle: codes uniquement)

    // Lignes de codes comptables (plat, sans groep headers)
    groupData.accounts.forEach(account => {
      const row = sheet.getRow(currentRow);
      row.values = [
        null,                                                     // A: empty
        account.code,                                             // B: code
        account.label,                                            // C: label
        null,                                                     // D: empty
        account.ytd !== 0 ? round2(account.ytd) : null,           // E: Full Year / YTD
        ...account.monthlyAmounts.map(a => round2(a)),             // F-Q: 12 months (keep 0)
        account.ytd !== 0 ? round2(account.ytd) : null,           // R: YTD
        account.budget !== 0 ? round2(account.budget) : null,     // S: budget
        null,                                                     // T: empty
        null                                                      // U: comments
      ];

      // Appliquer le format monétaire
      for (let col = 6; col <= 19; col++) {
        row.getCell(col).numFmt = '#,##0.00';
        row.getCell(col).alignment = { horizontal: 'right' };
      }

      currentRow++;
    });

    // Pas de ligne vide entre les groupes (structure officielle)

    // Accumuler les totaux généraux
    groupData.monthlyTotals.forEach((val, idx) => {
      totalMonthly[idx] = round2(totalMonthly[idx] + val);
    });
    totalYTD = round2(totalYTD + groupData.ytdTotal);
    totalBudget = round2(totalBudget + groupData.budgetTotal);
  });

  // 12. Ligne de total général
  const totalRow = sheet.getRow(currentRow);
  totalRow.values = [
    null,               // A: empty
    null,               // B: empty
    'TOTAL GÉNÉRAL',    // C: total label
    null,               // D: empty
    null,               // E: empty
    ...totalMonthly.map(t => round2(t)),                 // F-Q: 12 months (keep 0)
    round2(totalYTD),                                    // R: YTD
    round2(totalBudget),                                 // S: budget
    null,               // T: empty
    null                // U: comments
  ];

  totalRow.eachCell(cell => applyTotalStyle(cell));
  for (let col = 6; col <= 19; col++) {
    totalRow.getCell(col).numFmt = '#,##0.00';
    totalRow.getCell(col).alignment = { horizontal: 'right' };
  }
  totalRow.height = 25;

  // 14. Récupérer les BilanCodes et valeurs pour les feuilles dynamiques
  const bilanCodes = await getBilanCodes(clubId);
  const existingBilanValues = await getBilanValues(clubId, fiscalYear.id);
  const bilanValues = await calculateAllBilanValues(clubId, fiscalYear, existingBilanValues);

  // 15. Ajouter la feuille Données (doit être avant Bilan pour les références)
  const { rowMapping } = addDataSheet(workbook, fiscalYear, logoId, bilanCodes, bilanValues);

  // 16. Ajouter la feuille Bilan
  addBalanceSheet(workbook, fiscalYear, logoId, bilanCodes, rowMapping, bilanValues);

  // 17. Ajouter la feuille Transactions (toutes les transactions individuelles)
  addTransactionsSheet(workbook, fiscalYear, logoId, transactions);

  // ============================================================
  // NOUVELLES FEUILLES — Phase 1: Trivial + Faible complexité
  // ============================================================

  // 18. Validations étendue (tous les codes + débit/crédit)
  addValidationsSheetFull(workbook, fiscalYear, codeMonthlyMap, allGroupCodes, totalYTD);

  // 19. Bank Balance courant (soldes mensuels)
  addBankBalanceSheet(workbook, fiscalYear, transactions);

  // 20. CC Utilisés (codes comptables utilisés)
  addCCUtilisesSheet(workbook, codeMonthlyMap);

  // 21. N Rubriques (classification des codes)
  addNRubriquesSheet(workbook);

  // 22. Month (table statique)
  addMonthSheet(workbook);

  // 23. Cognos_Office_Connection_Cache (feuille vide)
  addCognosSheet(workbook);

  // ============================================================
  // NOUVELLES FEUILLES — Phase 2: Complexité moyenne
  // ============================================================

  // 24. Résultats courant (P&L par code individuel, same group order as P&L)
  const openingBankBalance = fiscalYear.opening_balances?.bank_current ?? 0;
  addResultatsCourantSheet(workbook, fiscalYear, codeMonthlyMap, fiscalYearStart, groups, openingBankBalance);

  // 25. GL courant (Grand Livre - toutes transactions en détail)
  addGLCourantSheet(workbook, fiscalYear, transactions);

  // 26. Banque{year} (transactions bancaires brutes)
  addBanqueSheet(workbook, fiscalYear, transactions);

  // 27. N PCMN Calypso (Plan Comptable Minimum Normalisé)
  addNPCMNSheet(workbook);

  // 28. Plan compta (Plan comptable statique)
  addPlanComptaSheet(workbook);

  // ============================================================
  // NOUVELLES FEUILLES — Phase 3: Boutique inventaire
  // ============================================================

  // 29. Boutique inventaire (club + LIFRAS)
  try {
    const boutiqueItems = await BoutiqueStockService.getItems(clubId, 'boutique');
    if (boutiqueItems.length > 0) {
      addBoutiqueSheet(workbook, fiscalYear, boutiqueItems, 'boutique');
    }
  } catch (error) {
    logger.warn('[ReportExcel] Could not load boutique items:', error);
  }

  try {
    const lifrasItems = await BoutiqueStockService.getItems(clubId, 'boutique_lifras');
    if (lifrasItems.length > 0) {
      addBoutiqueSheet(workbook, fiscalYear, lifrasItems, 'boutique_lifras');
    }
  } catch (error) {
    logger.warn('[ReportExcel] Could not load LIFRAS items:', error);
  }

  // 30. BS an-1 (Bilan année précédente)
  try {
    const allFiscalYears = await FiscalYearService.getFiscalYears(clubId);
    const previousFY = allFiscalYears.find(fy => fy.year === fiscalYear.year - 1);
    if (previousFY) {
      const prevBilanValues = await getBilanValues(clubId, previousFY.id);
      const prevCalculated = await calculateAllBilanValues(clubId, previousFY, prevBilanValues);
      addBSPreviousYearSheet(workbook, previousFY.year, bilanCodes, prevCalculated);
    }
  } catch (error) {
    logger.warn('[ReportExcel] Could not load previous year bilan:', error);
  }

  // ============================================================
  // NOUVELLES FEUILLES — Phase 4: Budget Next Year
  // ============================================================

  // 31. Budget Next Year (réalisé + colonnes budget éditables)
  addBudgetNextYearSheet(workbook, fiscalYear, groupsData, fiscalYearStart);

  // ============================================================
  // PHASE 5: Réordonner les onglets selon l'ordre officiel
  // ============================================================
  const sheetOrder = [
    'Budget Next Year',
    'Bilan courant',
    'Résultats courant',
    'P&L courant par mois',
    'Validations',
    'Bank Balance courant',
    'CC Utilisés',
    'GL courant',
    `Boutk - fin ${fiscalYear.year}`,
    `Boutk LIFRAS - fin ${fiscalYear.year}`,
    'BS an-1',
    'Cognos_Office_Connection_Cache',
    'N PCMN Calypso',
    'N Rubriques',
    'Plan compta',
    'Month',
    `Banque${fiscalYear.year}`,
    'Transactions',
    // 'Données' is hidden (internal helper sheet)
  ];

  // Réordonner: ExcelJS utilise orderNo (1-based) pour l'ordre des onglets
  sheetOrder.forEach((name, idx) => {
    const ws = workbook.getWorksheet(name);
    if (ws) {
      (ws as unknown as Record<string, unknown>).orderNo = idx + 1;
    }
  });

  // Cacher la feuille Données (interne, pas dans le fichier officiel)
  const donneesSheet = workbook.getWorksheet('Données');
  if (donneesSheet) {
    donneesSheet.state = 'hidden';
    (donneesSheet as unknown as Record<string, unknown>).orderNo = 99; // Push to end
  }

  // 31. Générer le blob
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

/**
 * Télécharge le fichier Excel du Compte de Résultats.
 * Utilise File System Access API si disponible pour sauvegarder
 * directement sans dialogue "Save As".
 */
export async function downloadCompteResultatsExcel(
  clubId: string,
  fiscalYear: FiscalYear
): Promise<void> {
  const blob = await generateCompteResultatsExcel(clubId, fiscalYear);
  const fileName = `Compta_Calypso_${fiscalYear.year}.xlsx`;

  // Try auto-save to Vite dev server first (bypasses save dialog)
  try {
    console.log('[AutoTest] Sending blob to /api/save...', blob.size, 'bytes');
    const ab = await blob.arrayBuffer();
    const resp = await fetch('/api/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Filename': fileName,
      },
      body: ab,
    });
    if (resp.ok) {
      const result = await resp.text();
      console.log('[AutoTest] Save result:', result);
      return; // Saved successfully, no dialog needed
    }
    console.warn('[AutoTest] Save response not ok:', resp.status);
  } catch (e) {
    console.warn('[AutoTest] /api/save not available, using normal download:', e);
  }

  // Fallback: normal download via link click
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
