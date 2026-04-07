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
import { getBilanCodes } from './bilanCodeService';
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
  // Boutique stock label: Firestore voegt "Calypso" toe, officieel niet
  '600-00-641': 'Stock Boutique',
  // Cotisation revenue labels (V) — match officieel (Validations/Résultats/P&L tabs)
  // NB: CC Utilisés tab in officieel bestand heeft OUDE verschoven labels (data-issue in officieel)
  '730-00-712': 'Cotisation plongeur (V)',
  '730-00-713': 'Cotisation instructeur (V)',
  '730-00-714': 'Cotisation administrateur (V)',
  '730-00-715': 'Cotisation nageur (V)',
  '730-00-716': 'Cotisation autre (ex 2ème appartenance) (V)',
  // Cotisation expense labels (A) — match officieel boekhoudplan
  '730-00-611': 'Lifras - Cotisation membres (A)',
  '730-00-612': 'Cotisations des membres plongeurs (A)',
  '730-00-613': 'Cotisations instructeurs (A)',
  '730-00-614': 'Cotisations administrateurs (A)',
  '730-00-615': 'Cotisation autres (A)',
};

// Codes in Firestore die NIET in het officiële boekhoudplan 2025 staan
const EXCLUDED_CODES = new Set([
  '620-00-664',  // Niet in officieel plan
  // 601-00-624 en 730-00-716 VERWIJDERD — staan WEL in officieel bestand
  // 614-00-629 VERPLAATST naar N_RUBRIQUES_EXCLUDED — staat wel in Validations
]);

// Codes die WEL in het officieel staan maar ontbreken in Firestore
const EXTRA_OFFICIAL_CODES: Array<{code: string; label: string; type: 'expense' | 'revenue' | 'asset' | 'liability'; categories?: string[]}> = [
  { code: '657-00-760', label: 'Intérêt des comptes', type: 'revenue', categories: ['frais_bancaires'] },
  { code: '614-00-629', label: 'Portes ouvertes', type: 'expense', categories: ['Piscine'] },
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

// Cotisation codes in Firestore zijn 1 stap verschoven t.o.v. officieel boekhoudplan.
// Firestore 711=plongeur maar officieel 712=plongeur, etc.
// Mapping (Firestore → Officieel):
const TRANSACTION_CODE_REMAP: Record<string, string> = {
  '730-00-711': '730-00-712',  // plongeur (58x)
  '730-00-712': '730-00-713',  // instructeur (8x)
  '730-00-713': '730-00-714',  // administrateur (8x)
  '730-00-714': '730-00-715',  // nageur (5x)
  '730-00-715': '730-00-716',  // autre (1x)
  '612-00-624': '601-00-624',  // Achat de matériel (9x) — Firestore has 612, official has 601
};

// Extra remapping for Transactions/GL sheets only (not for aggregated tabs)
// NOTE: 612-00-624 moved to TRANSACTION_CODE_REMAP so aggregation also picks it up
const TRANSACTION_SHEET_REMAP: Record<string, string> = {
};

/** Remap transaction code_comptable from Firestore to official code */
function remapCode(code: string | undefined | null): string {
  if (!code) return '';
  return TRANSACTION_CODE_REMAP[code] || code;
}

/** Remap for Transactions/GL sheets — applies both general + sheet-specific remaps */
function remapCodeForSheet(code: string | undefined | null): string {
  if (!code) return '';
  const step1 = TRANSACTION_CODE_REMAP[code] || code;
  return TRANSACTION_SHEET_REMAP[step1] || step1;
}

/** Inverse remap: official code → Firestore code.
 *  Used by CC Utilisés which uses original Firestore codes in the official file. */
const TRANSACTION_CODE_UNREMAP: Record<string, string> = Object.fromEntries(
  Object.entries(TRANSACTION_CODE_REMAP).map(([k, v]) => [v, k])
);
function unremapCode(code: string): string {
  return TRANSACTION_CODE_UNREMAP[code] || code;
}

// Couleurs Calypso (sans le préfixe # pour ExcelJS ARGB)
// Format numérique officiel du comptable (accounting format sans symbole €)
const OFFICIAL_NUM_FMT = '_ * #,##0.00_ ;_ * \\-#,##0.00_ ;_ * "-"??_ ;_ @_ ';

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
  fiscalYearStart: Date,
  applyRemap = true
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
        addToCode(applyRemap ? remapCode(trans.code_comptable) : trans.code_comptable, trans.montant, monthIndex);
      }
      return;
    }

    // Ancien système: split_details (pour backward compatibility)
    const transAny = trans as unknown as Record<string, unknown>;
    if (trans.is_split && transAny.split_details && Array.isArray(transAny.split_details) && (transAny.split_details as unknown[]).length > 0) {
      (transAny.split_details as Array<{ code_comptable?: string; montant: number }>).forEach(split => {
        if (split.code_comptable) {
          addToCode(applyRemap ? remapCode(split.code_comptable) : split.code_comptable, split.montant, monthIndex);
        }
      });
      return;
    }

    // Transaction simple avec code comptable
    if (trans.code_comptable) {
      addToCode(applyRemap ? remapCode(trans.code_comptable) : trans.code_comptable, trans.montant, monthIndex);
    }
  });

  return codeMonthlyMap;
}

// Budget per code — statische waarden uit het officiële bestand 2025
// Gebruikt door Résultats courant, P&L par mois, en Budget Next Year
function getOfficialBudgetMap(): Map<string, number> {
  return new Map<string, number>([
    // Activités plongées en général
    ['730-00-610', -50],
    ['730-00-611', -7760],
    ['730-00-712', 12700],  // NB: officieel heeft 712=12700 (remapped code)
    ['730-00-713', 1600],
    ['730-00-714', 1600],
    ['611-00-616', -50],
    ['611-00-618', -200],
    ['611-00-619', -120],
    // Activités plongées "Piscine"
    ['610-00-621', -6500],
    ['612-00-622', -1500],
    ['612-00-623', -500],
    ['601-00-624', -1000],  // Officieel: 601-00-624
    ['612-00-625', -300],
    // Activités "Sorties club"
    ['617-00-730', -500],
    ['618-00-732', 100],
    // Activités connexes
    ['604-00-740', 180],
    ['614-00-643', -300],
    // Soirée annuelle
    ['664-00-750', 1500],
    ['664-00-752', 1500],
    // Administration
    ['657-00-660', -50],
    ['613-00-662', -50],
    ['613-00-664', -50],
    ['620-00-665', -100],
    ['620-00-666', -200],
    // Subsides
    ['15-000-770', 1050],
    ['15-000-772', 500],
    // Frais bancaires
    ['657-00-760', -50],
  ]);
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
  const budgetMap = getOfficialBudgetMap();

  return groups.map(group => {
    // Behoud de volgorde uit de groep-definitie (matcht officieel bestand)
    const sortedCodes = [...group.accountCodes];

    const accounts: AccountCodeData[] = sortedCodes.map(code => {
      const accountInfo = accountCodeMap.get(code);
      const monthlyAmounts = codeMonthlyMap.get(code) || new Array(12).fill(0);
      const ytd = round2(monthlyAmounts.reduce((sum, val) => sum + val, 0));

      return {
        code,
        label: accountInfo?.label || code,
        monthlyAmounts,
        ytd,
        budget: budgetMap.get(code) ?? 0
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
    views: [{ showGridLines: false }],
    state: 'hidden' as const
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

  // Largeur des colonnes — match le format officiel du comptable
  sheet.getColumn(1).width = 8.14;   // A: spacer
  sheet.getColumn(2).width = 4.14;   // B: spacer
  sheet.getColumn(3).width = 62.57;  // C: labels ACTIF
  sheet.getColumn(4).width = 4.57;   // D: spacer
  sheet.getColumn(5).width = 15;     // E: ACTIF opening values
  sheet.getColumn(6).width = 11.14;  // F: ACTIF closing values
  sheet.getColumn(7).width = 10.86;  // G: spacer
  sheet.getColumn(8).width = 60.86;  // H: labels PASSIF
  sheet.getColumn(9).width = 2.29;   // I: spacer
  sheet.getColumn(10).width = 10.71; // J: PASSIF opening values
  sheet.getColumn(11).width = 12.71; // K: PASSIF closing values

  // Logo si disponible
  if (logoId !== null) {
    addLogoToSheet(sheet, logoId, 0, 0);
    sheet.getRow(1).height = 50;
    sheet.getRow(2).height = 50;
  }

  // Titre in R3 (official: B3:L5 merged, size 22, thick border bottom)
  sheet.mergeCells('B3:L5');
  const titleCell = sheet.getCell('B3');
  titleCell.value = `Bilan Calypso DC ${fiscalYear.year}`;
  titleCell.font = { bold: true, size: 22, name: 'Calibri' };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.border = { bottom: { style: 'thick' } };

  // En-têtes in R8 (official: plain text, right-aligned, Calibri)
  sheet.getCell('E8').value = 'OPENING';
  sheet.getCell('F8').value = 'CLOSING';
  sheet.getCell('J8').value = 'OPENING';
  sheet.getCell('K8').value = 'CLOSING';
  ['E8', 'F8', 'J8', 'K8'].forEach(addr => {
    const cell = sheet.getCell(addr);
    cell.font = { name: 'Calibri' };
    cell.alignment = { horizontal: 'right' };
  });

  // Titres ACTIF / PASSIF in R9 (official: bold, Calibri, no color)
  sheet.getCell('C9').value = 'ACTIF';
  sheet.getCell('C9').font = { bold: true, name: 'Calibri' };
  sheet.getCell('H9').value = 'PASSIF';
  sheet.getCell('H9').font = { bold: true, name: 'Calibri' };

  // === FIXED LAYOUT matching official accountant's file ===
  // The official Bilan has a specific fixed row structure where ACTIF and PASSIF
  // share the same rows. We use a fixed layout to match exactly.
  const nextYear = fiscalYear.year + 1;

  // Helper: lookup bilan code values by code string (e.g. '02.01')
  const codeMap = new Map(bilanCodes.map(c => [c.code, c]));
  const getVal = (codeStr: string, field: 'openingValue' | 'closingValue'): number => {
    const bc = codeMap.get(codeStr);
    if (!bc) return 0;
    return round2(valuesMap.get(bc.id)?.[field] ?? 0);
  };
  const getDonneesRow = (codeStr: string): number | undefined => {
    const bc = codeMap.get(codeStr);
    return bc ? rowMapping.get(bc.id) : undefined;
  };

  // Helper: write a value cell with formula link to Données if available
  // skipZero: if true, don't write anything when value is 0 (cell stays empty like official)
  const writeValCell = (addr: string, codeStr: string, field: 'openingValue' | 'closingValue', donneesCol: 'C' | 'D', skipZero = false) => {
    const val = getVal(codeStr, field);
    if (skipZero && val === 0) return; // Leave cell empty (official has no value here)
    const dRow = getDonneesRow(codeStr);
    if (dRow) {
      sheet.getCell(addr).value = { formula: `'Données'!${donneesCol}${dRow}`, result: val };
    } else {
      sheet.getCell(addr).value = val;
    }
    sheet.getCell(addr).numFmt = OFFICIAL_NUM_FMT;
    sheet.getCell(addr).font = { name: 'Calibri' };
    sheet.getCell(addr).alignment = { horizontal: 'right' };
    sheet.getCell(addr).border = { bottom: { style: 'thin' } };
  };

  // Helper: write a label cell
  const writeLabelCell = (addr: string, text: string, bold = false) => {
    sheet.getCell(addr).value = text;
    sheet.getCell(addr).font = { bold, name: 'Calibri' };
    if (bold) {
      sheet.getCell(addr).border = { bottom: { style: 'thin' } };
    }
  };

  // Helper: write both opening+closing values for a code
  const writeActifVals = (row: number, codeStr: string, skipZero = false) => {
    writeValCell(`E${row}`, codeStr, 'openingValue', 'C', skipZero);
    writeValCell(`F${row}`, codeStr, 'closingValue', 'D', skipZero);
  };
  const writePassifVals = (row: number, codeStr: string, skipZero = false) => {
    writeValCell(`J${row}`, codeStr, 'openingValue', 'C', skipZero);
    writeValCell(`K${row}`, codeStr, 'closingValue', 'D', skipZero);
  };

  // Track rows with values for TOTAL formulas
  const actifValueRows: number[] = [];
  const passifValueRows: number[] = [];

  // === R10: Section headers ===
  writeLabelCell('C10', 'Actifs immobilisés', true);
  writeLabelCell('H10', 'Fonds Social', true);

  // === R11: (ACTIF empty) | Resultat reporté ===
  writeLabelCell('H11', 'Resultat reporté');
  writePassifVals(11, '04.01');
  passifValueRows.push(11);

  // === R12: (ACTIF empty) | Résultat de l'exercice ===
  writeLabelCell('H12', "Résultat de l'exercice ");
  writePassifVals(12, '04.03');
  passifValueRows.push(12);

  // === R13: (ACTIF empty) | Fonds Affectés 2021 ===
  // Official label: "Fonds Affectés 2021" (the specific sub-code, not the parent)
  writeLabelCell('H13', 'Fonds Affectés 2021');
  writePassifVals(13, '04.02.01');
  passifValueRows.push(13);

  // === R14: Actifs circulants (header) | (PASSIF empty) ===
  writeLabelCell('C14', 'Actifs circulants', true);

  // === R15: Stock C.D.C. | Provision pour charges et risques divers (header) ===
  writeLabelCell('C15', 'Stock C.D.C.');
  writeActifVals(15, '02.01');
  actifValueRows.push(15);
  writeLabelCell('H15', 'Provision pour charges et risques divers', true);

  // === R16: Boutique | (PASSIF empty) ===
  writeLabelCell('C16', 'Boutique');
  writeActifVals(16, '02.01.01');
  // Note: Boutique is a child of Stock C.D.C., NOT included in actifValueRows (avoid double count)

  // === R17: Boutique LIFRAS | Provision pr entretien/achat matériel ===
  writeLabelCell('C17', 'Boutique LIFRAS');
  writeActifVals(17, '02.01.02');
  // Note: Also child of Stock C.D.C., NOT in actifValueRows
  writeLabelCell('H17', "Provision pr entretien/achat matériel a faire dans l'exercice suivant ");
  writePassifVals(17, '05.01');
  passifValueRows.push(17);

  // === R18: Compte épargne | Provision Location Piscine ===
  writeLabelCell('C18', 'Compre épargne');  // Official typo: "Compre" not "Compte"
  writeActifVals(18, '02.02');
  actifValueRows.push(18);
  writeLabelCell('H18', 'Provision Location Piscine exercice suivant ');
  writePassifVals(18, '05.02');
  passifValueRows.push(18);

  // === R19: Compte à vue | (PASSIF empty) ===
  writeLabelCell('C19', 'Compte à vue');
  writeActifVals(19, '02.03');
  actifValueRows.push(19);

  // === R20: Obligations Dette Belge | (PASSIF empty) ===
  writeLabelCell('C20', 'Obligations Dette Belge');
  // Official shows '-' for opening when 0, numeric for closing
  const oblOpening = getVal('02.04', 'openingValue');
  const oblClosing = getVal('02.04', 'closingValue');
  sheet.getCell('E20').value = oblOpening === 0 ? '-' : oblOpening;
  sheet.getCell('F20').value = oblClosing;
  ['E20', 'F20'].forEach(addr => {
    sheet.getCell(addr).numFmt = OFFICIAL_NUM_FMT;
    sheet.getCell(addr).font = { name: 'Calibri' };
    sheet.getCell(addr).alignment = { horizontal: 'right' };
    sheet.getCell(addr).border = { bottom: { style: 'thin' } };
  });
  actifValueRows.push(20);

  // === R21: empty separator ===

  // === R22: Comptes de régularisation (both sides) ===
  writeLabelCell('C22', 'Comptes de régularisation', true);
  writeLabelCell('H22', 'Comptes de régularisation', true);

  // === R23: empty ===

  // === R24: (ACTIF empty) | Cotisations année XXXX ===
  writeLabelCell('H24', `Cotisations année ${nextYear}`);
  writePassifVals(24, '06.01', true); // skipZero: official has no values when 0
  passifValueRows.push(24);

  // === R25: Charges a reporter sortie année XXXX | Sorties Club année XXXX ===
  writeLabelCell('C25', `Charges a reporter sortie année ${nextYear}`);
  writeActifVals(25, '03.01', true); // skipZero: official has no values when 0
  actifValueRows.push(25);
  writeLabelCell('H25', `Sorties Club année ${nextYear}`);
  writePassifVals(25, '06.02', true); // skipZero: official has no values when 0
  passifValueRows.push(25);

  // === R26: Assurance materiel année XXXX | Paiement afferant à l'exercice suivant ===
  writeLabelCell('C26', `Assurance materiel année ${nextYear}`);
  // Official: E26 (opening) is empty, F26 (closing) shows 0
  writeValCell(`E${26}`, '03.02', 'openingValue', 'C', true); // skipZero for opening
  writeValCell(`F${26}`, '03.02', 'closingValue', 'D'); // always show closing
  actifValueRows.push(26);
  writeLabelCell('H26', "Paiement afferant à l'exercice suivant");
  writePassifVals(26, '06.03');
  passifValueRows.push(26);

  // === R27: empty separator ===

  // === R28: TOTALS (both sides) ===
  const totalRow = 28;

  // ACTIF total = sum of actifValueRows (excl. children like Boutique/Boutique LIFRAS)
  const actifSumFormula = actifValueRows.map(r => `E${r}`).join('+');
  const actifSumFormulaF = actifValueRows.map(r => `F${r}`).join('+');
  const totalActifOpening = round2(actifValueRows.reduce((sum, _r) => sum, 0)); // placeholder
  // Calculate actual totals from codes: 02 + 03 (excl. 01 pour mémoire)
  const actualTotalActifOpening = round2(getVal('02', 'openingValue') + getVal('03', 'openingValue'));
  const actualTotalActifClosing = round2(getVal('02', 'closingValue') + getVal('03', 'closingValue'));

  sheet.getCell(`E${totalRow}`).value = { formula: actifSumFormula, result: actualTotalActifOpening };
  sheet.getCell(`F${totalRow}`).value = { formula: actifSumFormulaF, result: actualTotalActifClosing };

  const officialTotalBorder = { bottom: { style: 'double' as const } };
  ['E', 'F'].forEach(col => {
    sheet.getCell(`${col}${totalRow}`).font = { bold: true, name: 'Calibri' };
    sheet.getCell(`${col}${totalRow}`).alignment = { horizontal: 'right' };
    sheet.getCell(`${col}${totalRow}`).numFmt = OFFICIAL_NUM_FMT;
    sheet.getCell(`${col}${totalRow}`).border = officialTotalBorder;
  });

  // PASSIF total = sum of passifValueRows
  const passifSumFormula = passifValueRows.map(r => `J${r}`).join('+');
  const passifSumFormulaK = passifValueRows.map(r => `K${r}`).join('+');
  const actualTotalPassifOpening = round2(getVal('04', 'openingValue') + getVal('05', 'openingValue') + getVal('06', 'openingValue'));
  const actualTotalPassifClosing = round2(getVal('04', 'closingValue') + getVal('05', 'closingValue') + getVal('06', 'closingValue'));

  sheet.getCell(`J${totalRow}`).value = { formula: passifSumFormula, result: actualTotalPassifOpening };
  sheet.getCell(`K${totalRow}`).value = { formula: passifSumFormulaK, result: actualTotalPassifClosing };

  ['J', 'K'].forEach(col => {
    sheet.getCell(`${col}${totalRow}`).font = { bold: true, name: 'Calibri' };
    sheet.getCell(`${col}${totalRow}`).alignment = { horizontal: 'right' };
    sheet.getCell(`${col}${totalRow}`).numFmt = OFFICIAL_NUM_FMT;
    sheet.getCell(`${col}${totalRow}`).border = { bottom: { style: 'double' } };
  });

  // === R30: Différence (closing only) ===
  sheet.getCell(`K30`).value = { formula: `F${totalRow}-K${totalRow}`, result: round2(actualTotalActifClosing - actualTotalPassifClosing) };
  sheet.getCell('K30').numFmt = OFFICIAL_NUM_FMT;
  sheet.getCell('K30').font = { name: 'Calibri' };

  // === R31: Année de référence ===
  writeLabelCell('C31', 'Année de référence', true);
  sheet.getCell('F31').value = fiscalYear.year;
  sheet.getCell('F31').font = { bold: true, name: 'Calibri' };

  // Official: all data rows have height 20.25
  for (let r = 2; r <= 40; r++) {
    sheet.getRow(r).height = 20.25;
  }
  void totalActifOpening; // suppress unused
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
      remapCodeForSheet(trans.code_comptable) || '',
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
  // CC Utilisés uses rawCodeMonthlyMap (no remap) to show original Firestore codes,
  // matching the official file which also shows original codes.
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

  // Ensuite ajouter tous les codes connus (non utilisés)
  for (const ac of accountCodes) {
    if (!allCodes.has(ac.code)) {
      allCodes.set(ac.code, {
        code: ac.code,
        label: ac.label,
        total: 0
      });
    }
  }
  // Ajouter EXTRA_OFFICIAL_CODES s'ils ne sont pas encore présents
  for (const ec of EXTRA_OFFICIAL_CODES) {
    if (!allCodes.has(ec.code)) {
      allCodes.set(ec.code, {
        code: ec.code,
        label: ec.label,
        total: 0
      });
    }
  }

  // Filtrer les codes de test, exclus, et trier par code
  // Support codes like "730-00-712", "5500-0-700", "15-000-770"
  const isValidAccountCode = (code: string) => /^\d{1,4}-\d{1,3}-\d{3}$/.test(code);
  // Codes niet in officieel Validations (wel in transacties na code-fix of in N Rubriques)
  const VALIDATIONS_EXCLUDED = new Set(['612-00-624', '730-00-711', '610-00-629', '657-00-760']);
  // Custom sort: 614-00-629 gesorteerd als 610-00-629z (officieel plaatst het na 610-00-628)
  // NB: 601-00-624 sorteert lexicografisch correct (na 600-xx, voor 604-xx)
  const validationsSortKey = (code: string): string => {
    if (code === '614-00-629') return '610-00-629z'; // na 610-00-628, voor 611-xx
    return code;
  };
  const sortedCodes = Array.from(allCodes.values())
    .filter(c => isValidAccountCode(c.code) && !EXCLUDED_CODES.has(c.code) && !VALIDATIONS_EXCLUDED.has(c.code))
    .sort((a, b) => validationsSortKey(a.code).localeCompare(validationsSortKey(b.code)));

  // Codes qui apparaissent comme lignes individuelles dans le P&L officiel
  // TODO: passer à une détection dynamique quand le P&L sera corrigé
  const plLineCodes = new Set([
    '15-000-770', '15-000-771', '15-000-772',
    '439-00-001', '439-00-002',
    '490-00-635', '493-00-719', '493-00-735',
    '601-00-624',
    '604-00-640', '604-00-641', '604-00-642', '604-00-740', '604-00-741', '604-00-742', '604-00-743',
    '610-00-621', '610-00-622',
    '611-00-616', '611-00-618',
    '612-00-622', '612-00-623',
    '614-00-643',
    '615-00-646', '615-00-746',
    '617-00-630', '617-00-730',
    '618-00-632', '618-00-732',
    '619-00-633', '619-00-733',
    '620-00-666', '620-00-766',
    '657-00-660',
    '664-00-650', '664-00-750',
    '730-00-610', '730-00-611', '730-00-712', '730-00-713', '730-00-714', '730-00-715', '730-00-716',
  ]);

  // Ajouter les données
  let currentRow = 2;
  let prevCodePrefix = '';

  for (const data of sortedCodes) {
    // Blank row between 619-xx and 620-xx (visual separator in official)
    const codePrefix = data.code.substring(0, 3);
    if (prevCodePrefix === '619' && codePrefix === '620') {
      currentRow++; // insert blank row
    }
    prevCodePrefix = codePrefix;

    const row = sheet.getRow(currentRow);
    const exitsInPL = plLineCodes.has(data.code) ? data.code : null;

    row.values = [data.code, data.label, data.total, exitsInPL];
    row.getCell(3).numFmt = '#,##0.00';
    row.getCell(3).alignment = { horizontal: 'right' };

    currentRow++;
  }

  // Totaux de validation (3 lignes vides + totaux comme dans le fichier officiel)
  currentRow++; // ligne vide
  const grandTotal = round2(sortedCodes.reduce((sum, c) => sum + c.total, 0));
  const plTotal = round2(sortedCodes.filter(c => plLineCodes.has(c.code)).reduce((sum, c) => sum + c.total, 0));
  sheet.getRow(currentRow).getCell(3).value = grandTotal;
  sheet.getRow(currentRow).getCell(3).numFmt = '#,##0.00';
  currentRow++;
  sheet.getRow(currentRow).getCell(3).value = plTotal;
  sheet.getRow(currentRow).getCell(3).numFmt = '#,##0.00';
  currentRow++;
  sheet.getRow(currentRow).getCell(3).value = round2(grandTotal - plTotal);
  sheet.getRow(currentRow).getCell(3).numFmt = '#,##0.00';
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

  // Codes in N Rubriques die NIET in het officieel staan (wel in andere tabs)
  const N_RUBRIQUES_EXCLUDED = new Set(['612-00-624', '730-00-711', '614-00-629']);

  // N Rubriques-specifieke label overrides — officieel PCMN labels (afwijkend van CC Utilisés)
  const N_RUBRIQUES_LABELS: Record<string, string> = {
    '730-00-712': 'Cotisation plongeur (V)',
    '730-00-713': 'Cotisation instructeur (V)',
    '730-00-714': 'Cotisation administrateur (V)',
    '730-00-715': 'Cotisation nageur (V)',
  };

  // Custom sort key: 601-00-624 wordt gesorteerd alsof het 612-00-624 is
  // (officieel bestand plaatst het tussen 612-00-623 en 612-00-625)
  const sortKey = (code: string): string => {
    if (code === '601-00-624') return '612-00-624';
    return code;
  };

  // Filtrer les codes de test et trier par code
  const isValidCode = (code: string) => /^\d{2,4}-\d{1,3}-\d{3}$/.test(code);
  const sortedCodes = [...accountCodes]
    .filter(ac => isValidCode(ac.code) && !N_RUBRIQUES_EXCLUDED.has(ac.code))
    .sort((a, b) => sortKey(a.code).localeCompare(sortKey(b.code)));

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
    // Use N Rubriques-specific labels if available, otherwise use global label
    const effectiveLabel = N_RUBRIQUES_LABELS[ac.code] || ac.label;
    // Use empty string instead of null for B column (d/c) — official has empty cells, not null
    row.values = [ac.code, effectiveDc ?? '', effectiveLabel, typeLabel, subType];

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

    // Column P: "code - label" format (with remapped code — sheet-level remap includes 612→601)
    const mappedCode = remapCodeForSheet(trans.code_comptable);
    const acInfo = mappedCode ? accountCodeMapGL.get(mappedCode) : null;
    const codeLabel = mappedCode
      ? `${mappedCode} - ${acInfo?.label || mappedCode}`
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
      mappedCode || null,                      // N: Compte (code comptable, remapped)
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

  // Static template: 92 rows matching official reference exactly (no empty separator rows)
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
    // Row 7: 24-000
    ['24-000', null, '24.', null, null, null, null, null, null, null, null, null, null, null, null],
    // Row 8-12: 240-00 Matériel
    ['240-00', null, null, 'Mat\u00E9riel', 'Gilets', null, null, null, null, null, null, '671 - Mat\u00E9riel - Gilets', '771 - Amortissement -Mat\u00E9riel - Gilets', '240-00-671', '240-00-771'],
    ['240-00', null, null, 'Mat\u00E9riel', 'D\u00E9tendeurs', null, null, null, null, null, null, '672 - Mat\u00E9riel - D\u00E9tendeurs', '772 - Amortissement -Mat\u00E9riel - D\u00E9tendeurs', '240-00-672', '240-00-772'],
    ['240-00', null, null, 'Mat\u00E9riel', 'Bouteilles', null, null, null, null, null, null, '673 - Mat\u00E9riel - Bouteilles', '773 - Amortissement -Mat\u00E9riel - Bouteilles', '240-00-673', '240-00-773'],
    ['240-00', null, null, 'Mat\u00E9riel', 'Ordinateurs', null, null, null, null, null, null, '674 - Mat\u00E9riel - Ordinateurs', '774 - Amortissement -Mat\u00E9riel - Ordinateurs', '240-00-674', '240-00-774'],
    ['240-00', null, null, 'Mat\u00E9riel', 'Autres', null, null, null, null, null, null, '679 - Mat\u00E9riel - Autres', '775 - Amortissement -Mat\u00E9riel - Autres', '240-00-679', '240-00-775'],
    // Row 13: Class 3
    ['3-0000', '3.', 'STOCKS ET COMMANDES EN COURS D\'EX\u00C9CUTION', null, null, null, null, null, null, null, null, null, null, null, null],
    // Row 8: 34-000
    ['34-000', null, '34.', 'Marchandises\u00A0(9)', null, null, null, 'VI.A.4', null, null, null, null, null, null, null],
    // Row 9: 340-00
    ['340-00', null, null, '340.', 'Valeur d\'acquisition\u00A0(10)', null, null, null, null, null, null, '602 - Report stock boutique', '702 - Report stock boutique', '340-00-702', '340-00-602'],
    // Row 16: Class 4
    ['4-0000', '4.', 'CR\u00C9ANCES ET DETTES \u00C0 UN AN AU PLUS', null, null, null, null, null, null, null, null, null, null, null, null],
    // Row 17: 43-000 Cautions
    ['43-000', null, '43', 'Cautions', null, null, null, null, null, null, null, null, null, null, null],
    // Row 18-19: 439-00
    ['439-00', null, null, 'Caution', 'Pr\u00EAt mat\u00E9riel', null, null, null, null, null, null, '681 - Caution re\u00E7ue - Pr\u00EAt mat\u00E9riel', '781 - Caution rembours\u00E9e - Pr\u00EAt mat\u00E9riel', '439-00-781', '439-00-781'],
    ['439-00', null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    // Row 20: 49-000
    ['49-000', null, '49.', 'Comptes de r\u00E9gularisation et d\'attente', null, null, null, null, null, null, null, null, null, null, null],
    // Row 12: 490-00
    ['490-00', null, null, '490.', 'Charges \u00E0 reporter', null, null, 'X', null, null, null, '631 - Sortie \u00E9cole de mer ann\u00E9e suivante (A)', '631 - Sortie \u00E9cole de mer ann\u00E9e suivante (V)', '490-00-631', '490-00-631'],
    // Row 13-14: 493-00
    ['493-00', null, null, '493.', 'Produits \u00E0 reporter', null, null, null, null, 'X', null, null, '719 - Cotisation plongeurs ann\u00E9e suivante', null, '493-00-719'],
    ['493-00', null, null, '493.', 'Produits \u00E0 reporter', null, null, null, null, null, null, null, '731 - Sortie \u00E9cole de mer ann\u00E9e suivante', null, '493-00-731'],
    // Row 24: 493-00 (perception activité)
    ['493-00', null, null, null, null, null, null, null, null, null, null, null, '735 - perception pour activit\u00E9 ann\u00E9e suivante', null, '493-00-735'],
    // Row 25: Class 5
    ['5-0000', '5.', 'PLACEMENTS DE TR\u00C9SORERIE ET VALEURS DISPONIBLES', null, null, null, null, null, null, null, null, null, null, null, null],
    // Row 26: 55-000
    ['55-000', null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    // Row 27: 550-0
    ['550-0', null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    // Row 28: 5500-0
    ['5500-0', null, null, null, '5500.', 'Comptes courants', null, null, null, null, null, null, '700 - Report Compte courant', null, '5500-0-700'],
    // Row 29: 551-00
    ['551-00', null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    // Row 30: 5510-0
    ['5510-0', null, null, null, '5510.', 'Comptes courants', null, null, null, null, null, null, '701 - Report Compte epargne', null, '5510-0-701'],
    // Row 31: 57-000
    ['57-000', null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    // Row 32-33: 570/571
    ['570-00', null, null, '570.', 'Caisses-esp\u00E8ces', null, null, 'IX', null, null, null, null, '703 - Report caisse boutique', null, '570-00-703'],
    ['571-00', null, null, '571.', 'Caisses-esp\u00E8ces', null, null, 'IX', null, null, null, null, '704 - Report caisse piscine', null, '571-00-704'],
    // Row 20: Class 6
    ['6-0000', '6.', 'CHARGES', null, null, null, null, 'Charges', null, 'Produits', null, null, null, null, null],
    // Row 21: 600-00
    ['600-00', null, null, '600.', 'Achats de mati\u00E8res premi\u00E8res', null, null, 'II.A.1', null, null, null, '641 - Stock Boutique', '741 - Stock boutique', '600-00-641', '600-00-741'],
    // Row 22: 601-00
    ['601-00', null, null, '601.', 'Achats de fournitures', null, null, 'II.A.1', null, null, null, '624 - achat de mat\u00E9riel', null, '601-00-624', null],
    // Row 23: 604-00
    ['604-00', null, null, '604.', 'Achats de marchandises', null, null, 'II.A.1', null, null, null, '640 - Stock Divers (A)', '740 - Stock Divers (V)', '604-00-640', '604-00-740'],
    // Row 38-39: 604-00 Boutique Calypso/LIFRAS
    ['604-00', null, null, null, null, null, null, 'II.A.1', null, null, null, '641 - Boutique Calypso (A)', '741 - Boutique Calypso (V)', '604-00-641', '604-00-741'],
    ['604-00', null, null, null, null, null, null, 'II.A.1', null, null, null, '642 - Boutique LIFRAS (A)', '742 - Boutique LIFRAS (V)', '604-00-642', '604-00-742'],
    // Row 40: 61-000
    ['61-000', null, '61.', 'Services et biens divers', null, null, null, 'II.B', null, null, null, null, null, null, null],
    // Row 25-27: 610-00
    ['610-00', null, null, '610.', 'Location', null, null, 'II.B', null, null, null, '621 - Location piscine', null, '610-00-621', null],
    ['610-00', null, null, '610.', 'Location', null, null, 'II.B', null, null, null, '622 - Location piscine ann\u00E9e pr\u00E9c\u00E9dente', null, '610-00-622', null],
    ['610-00', null, null, '610.', 'Location', null, null, 'II.B', null, null, null, '628 - Salles de cours & frais', null, '610-00-628', null],
    // Row 28-30: 611-00
    ['611-00', null, null, '611.', 'Assurances', null, null, 'II.B', null, null, null, '616 - Assurances sport', null, '611-00-616', null],
    ['611-00', null, null, '611.', 'Assurances', null, null, 'II.B', null, null, null, '618 - Assurance "administrateurs"', null, '611-00-618', null],
    ['611-00', null, null, '611.', 'Assurances', null, null, 'II.B', null, null, null, '619 - Assurance mat\u00E9riel', null, '611-00-619', null],
    // Row 31-33: 612-00
    ['612-00', null, null, '612.', 'Entretiens', null, null, 'II.B', null, null, null, '622 - entretien & r\u00E9paration mat\u00E9riel', null, '612-00-622', null],
    ['612-00', null, null, '612.', 'Entretiens', null, null, 'II.B', null, null, null, '623 - frais de compresseur', null, '612-00-623', null],
    ['612-00', null, null, '612.', 'Entretiens', null, null, 'II.B', null, null, null, '625 - divers d\u00E9penses bassin', null, '612-00-625', null],
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
    ['617-00', null, null, '617.', 'Voyage club', null, null, 'II.B', null, null, null, '630 - Sortie \u00E9cole de mer ann\u00E9e courante (A)', '730 - Sortie \u00E9cole de mer ann\u00E9e courante (V)', '617-00-630', '617-00-730'],
    ['617-00', null, null, '617.', 'Voyage club', null, null, 'II.B', null, null, null, '634 - Sortie \u00E9cole de mer ann\u00E9e precedente (A)', '634 - Sortie \u00E9cole de mer ann\u00E9e precedente (V)', '617-00-634', '617-00-634'],
    // Row 44-45: 618-00
    ['618-00', null, null, '618.', 'Sorties plong\u00E9es', null, null, 'II.B', null, null, null, '632 - Sorties plong\u00E9es (A)', '732 - Sorties plong\u00E9es (V)', '618-00-632', '618-00-732'],
    ['618-00', null, null, '618.', 'Sorties plong\u00E9es', null, null, 'II.B', null, null, null, '635 - Sorties plong\u00E9es - Frais de l\'ann\u00E9e pr\u00E9c\u00E9dente (A)', '734 - Sorties plong\u00E9es - Recettes de l\'ann\u00E9e pr\u00E9c\u00E9dente (V)', '618-00-635', '618-00-734'],
    // Row 46-47: 619-00
    ['619-00', null, null, '619.', 'Sorties non plong\u00E9es', null, null, 'II.B', null, null, null, '633 - Sorties non plong\u00E9es (A)', '733 - Sorties non plong\u00E9es (V)', '619-00-633', '619-00-733'],
    ['619-00', null, null, '619.', 'Sorties non plong\u00E9es', null, null, 'II.B', null, null, null, '636 - Sorties non plong\u00E9es - Frais de l\'ann\u00E9e pr\u00E9c\u00E9dente (A)', '736 - Sorties non plong\u00E9es - Recettes de l\'ann\u00E9e pr\u00E9c\u00E9dente (V)', '619-00-636', '619-00-736'],
    // Row 48-50: 620-00
    ['620-00', null, null, '620.', 'Divers', null, null, 'II.B', null, null, null, '665 - cadeaux (mariages, d\u00E9part,\u2026)', null, '620-00-665', null],
    ['620-00', null, null, '620.', 'Divers', null, null, 'II.B', null, null, null, '666 - Divers (A)', '766 - Divers (A)', '620-00-666', '620-00-766'],
    ['620-00', null, null, '620.', 'Divers', null, null, 'II.B', null, null, null, '667 - Divers - Frais de l\'ann\u00E9e pr\u00E9c\u00E9dente (A)', '767- Divers - Recettes de l\'ann\u00E9e pr\u00E9c\u00E9dente (V)', '620-00-667', '620-00-767'],
    // Row 67-71: 630-00 Dotations aux amortissements
    ['630-00', null, null, '630.', 'Dotations aux amortissements', null, null, 'II.B', null, null, null, '691 - Dotations aux amortissemenys - Gilets', null, '630-00-691', null],
    ['630-00', null, null, '630.', 'Dotations aux amortissements', null, null, 'II.B', null, null, null, '692 - Dotations aux amortissemenys - D\u00E9tendeurs', null, '630-00-692', null],
    ['630-00', null, null, '630.', 'Dotations aux amortissements', null, null, 'II.B', null, null, null, '693 - Dotations aux amortissemenys - Bouteille', null, '630-00-693', null],
    ['630-00', null, null, '630.', 'Dotations aux amortissements', null, null, 'II.B', null, null, null, '694 - Dotations aux amortissemenys - Ordinateurs', null, '630-00-694', null],
    ['630-00', null, null, '630.', 'Dotations aux amortissements', null, null, 'II.B', null, null, null, '699 - Dotations aux amortissemenys - Autres', null, '630-00-699', null],
    // Row 72: 649-00
    ['649-00', null, null, '649.', 'Charges d\'exploitation port\u00E9es \u00E0 l\'actif au titre de frais de restructuration (\u2013)', null, null, 'II.H', null, null, null, null, null, null, null],
    // Row 54: 657-00
    ['657-00', null, null, '657.', 'Charges financi\u00E8res diverses', null, null, 'V.C', null, null, null, '660 - Frais de banque', '760 - Int\u00E9rets des compte', '657-00-660', '657-00-760'],
    // Row 55: 66-000
    ['66-000', null, '66.', 'Charges d\u2019exploitation ou financi\u00E8res non r\u00E9currentes', null, null, null, 'II.I ou V.D', null, null, null, null, null, null, null],
    // Row 56: 664-00
    ['664-00', null, null, '664.', 'Autres charges d\'exploitation non r\u00E9currentes', null, null, 'II.I', null, null, null, '650 - Soir\u00E9e annuelle - D\u00E9penses (A)', '650 - Soir\u00E9e annuelle - Recettes (V)', '664-00-650', '664-00-650'],
    // Row 57: Class 7
    ['7-0000', '7.', 'PRODUITS', null, null, null, null, null, null, null, null, null, null, null, null],
    // Row 58: 700-00
    ['700-00', null, null, '700.', 'Ventes et prestations de services', null, null, null, null, null, null, null, '720 - Entr\u00E9es bassin (vacances scolaires)', null, '700-00-720'],
    // Row 59: 71-000
    ['71-000', null, '71.', 'Variation des stocks et des commandes en cours d\u2019ex\u00E9cution', null, null, null, null, null, null, null, null, null, null, null],
    // Row 60: 713-00
    ['713-00', null, null, '713.', 'Des produits finis', null, null, null, null, null, null, '642 - Depreciation Stock Boutique', '742 - Valorisation Stock Boutique', '713-00-642', '713-00-742'],
    // Row 61: 73-000
    ['73-000', null, '73.', 'Cotisations, dons, legs et subsides(30)', null, null, null, 'I.D', null, null, null, null, null, null, null],
    // Row 62-67: 730-00
    ['730-00', null, null, '730.', 'Cotisations', null, null, null, null, null, null, '610 - Lifras - Cotisation club (A)', null, '730-00-610', null],
    ['730-00', null, null, '730.', 'Cotisations', null, null, null, null, null, null, '611 - Lifras - Cotisation membres (A)', '712 - Cotisation plongeurs (V)', '730-00-611', '730-00-712'],
    ['730-00', null, null, '730.', 'Cotisations', null, null, null, null, null, null, null, '713 - Cotisations instructeurs (V)', null, '730-00-712'],
    ['730-00', null, null, '730.', 'Cotisations', null, null, null, null, null, null, null, '714 - Cotisations administrateurs (V)', null, '730-00-713'],
    ['730-00', null, null, '730.', 'Cotisations', null, null, null, null, null, null, null, '715 - Cotisations nageurs (V)', null, '730-00-714'],
    ['730-00', null, null, '730.', 'Cotisations', null, null, null, null, null, null, null, '716 - Cotisation autres (ex 2\u00E8me appartenance) (V)', null, '730-00-715'],
    // Row 87: 730-00 (code 716)
    ['730-00', null, null, '730.', 'Cotisations', null, null, null, null, null, null, null, null, null, '730-00-716'],
    // Row 88: 75-000
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
  openingBankBalance?: number,
  closingBankBalance?: number,
  bilanValues?: BilanValues[],
  prevYearCodeMonthlyMap?: Map<string, number[]>
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

  // Number formats matching official file
  const numFmtAccounting = OFFICIAL_NUM_FMT; // Col E: accounting format
  const numFmtRedNeg = '#,##0.00_ ;[Red]\\-#,##0.00 '; // Col F/G/H: red negatives
  const rightAlign: Partial<ExcelJS.Alignment> = { horizontal: 'right' };
  const navyFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002060' } };
  const whiteFont: Partial<ExcelJS.Font> = { color: { argb: 'FFFFFFFF' }, bold: true, name: 'Calibri', size: 10 };

  // Title in B2, merged B2:I4
  sheet.mergeCells('B2:I4');
  const titleCell = sheet.getCell('B2');
  titleCell.value = `COMPTE DE RESULTATS CDC ${fiscalYear.year}`;
  titleCell.font = { bold: true, size: 22, name: 'Calibri' };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.border = { bottom: { style: 'medium' } };

  // Row heights
  sheet.getRow(1).height = 16.5;
  sheet.getRow(2).height = 29.25;
  sheet.getRow(4).height = 13.5;

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
  headerRow.font = { bold: true, name: 'Calibri', size: 10 };
  // B6 date formatted as mmm
  sheet.getCell('B6').numFmt = 'mmm';
  // E6 & G6: navy fill + white font (matching official)
  sheet.getCell('E6').fill = navyFill;
  sheet.getCell('E6').font = whiteFont;
  sheet.getCell('G6').fill = navyFill;
  sheet.getCell('G6').font = whiteFont;
  sheet.getCell('G6').numFmt = numFmtRedNeg;

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

  // Helper: get previous year YTD for a code (for F23 column)
  const getPrevYearYTD = (code: string): number => {
    if (!prevYearCodeMonthlyMap || prevYearCodeMonthlyMap.size === 0) return 0;
    const monthly = prevYearCodeMonthlyMap.get(code) || new Array(12).fill(0);
    return round2(monthly.reduce((s, v) => s + v, 0));
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
    // Col E: accounting format, Col F/G/H: red negative format (matching official)
    if (vals.e !== undefined) { row.getCell(5).value = round2(vals.e); row.getCell(5).numFmt = numFmtAccounting; row.getCell(5).alignment = rightAlign; }
    if (vals.f !== undefined) { row.getCell(6).value = round2(vals.f); row.getCell(6).numFmt = numFmtRedNeg; row.getCell(6).alignment = rightAlign; }
    if (vals.g !== undefined) { row.getCell(7).value = round2(vals.g); row.getCell(7).numFmt = numFmtRedNeg; row.getCell(7).alignment = rightAlign; }
    if (vals.h !== undefined) { row.getCell(8).value = round2(vals.h); row.getCell(8).numFmt = numFmtRedNeg; row.getCell(8).alignment = rightAlign; }
    if (vals.i !== undefined) { row.getCell(9).value = round2(vals.i); row.getCell(9).numFmt = numFmtAccounting; row.getCell(9).alignment = rightAlign; }
    if (comment) row.getCell(11).value = comment;
    if (bold) row.font = { bold: true, name: 'Calibri', size: 10 };
    // Default font for non-bold rows
    if (!bold) {
      row.getCell(2).font = { name: 'Calibri', size: 10 };
      row.getCell(3).font = { name: 'Calibri', size: 10 };
    }
  };

  // Helper: write a code entry from codeMonthlyMap
  const writeCodeRow = (rowNum: number, code: string, budgetVal?: number) => {
    const info = accountCodeMap.get(code);
    const data = getCodeData(code);
    const prevYTD = getPrevYearYTD(code);
    writeDataRow(rowNum, code, info?.label || code, {
      e: prevYTD || undefined,
      f: data.lastMonth,
      g: data.ytd,
      h: data.ytd,
      i: budgetVal
    });
  };

  // NIET sorteren — volgorde van de groep-definitie matcht het officiële bestand
  // De volgorde in reportGroupService.ts is de officiele volgorde

  // Provisie-configuratie: provisie-regels die na bepaalde CODES komen (inline)
  // In het officiële bestand worden provisies op specifieke plekken getoond:
  // - Na 610-00-622: provisie piscine
  // - Na 601-00-624: provisie matériel
  // - Na 493-00-735: mouvements & reprise régularisation

  // Budget per code — nu uit de gedeelde functie
  const budgetMap = getOfficialBudgetMap();

  // Groeps-budgetten die niet per code verdeeld zijn
  const groupBudgetOverrides = new Map<string, number>([
    ['sorties_club', -400],
    ['formation', 0],
    ['activites_connexes', -120],
    ['administration', -450],
    ['subsides', 1550],
  ]);

  // ============================
  // PROVISIONS — haal waarden uit bilanValues voor provisie-regels
  // ============================
  // Helper: haal opening/closing waarde op voor een bilan code
  const getBilanVal = (code: string, field: 'openingValue' | 'closingValue'): number => {
    if (!bilanValues) return 0;
    const bv = bilanValues.find(v => v.bilanCodeId === code);
    return bv?.[field] ?? 0;
  };

  // Provisie-regels per CODE: na welke code komen welke provisie-regels?
  // Dit matcht de inline plaatsing in het officiële bestand
  type ProvisionRow = { label: string; e?: number; f?: number; g?: number; h?: number; comment?: string };
  const provisionsByCode = new Map<string, ProvisionRow[]>();

  // Bereken régularisation code sommen (nodig voor zowel midden- als bottom-sectie)
  const regulCodes = ['490-00-631', '493-00-731', '490-00-635', '493-00-719', '493-00-735'];
  const regulSumByCol = { f: 0, g: 0, h: 0 };
  for (const code of regulCodes) {
    const data = getCodeData(code);
    regulSumByCol.f += data.lastMonth;
    regulSumByCol.g += data.ytd;
    regulSumByCol.h += data.ytd;
  }

  if (bilanValues && bilanValues.length > 0) {
    const year = fiscalYear.year;
    const prevYear = year - 1;

    // 05.02: Provision Location Piscine (opening = vorig jaar, closing = dit jaar)
    const piscineProvOpening = getBilanVal('05.02', 'openingValue');
    const piscineProvClosing = getBilanVal('05.02', 'closingValue');

    // 05.01: Provision entretien/achat matériel
    const materielProvOpening = getBilanVal('05.01', 'openingValue');
    const materielProvClosing = getBilanVal('05.01', 'closingValue');

    // 06: Comptes de régularisation (gebruikt in bottom section)

    // INLINE provisies: na specifieke codes (matcht officieel bestand)

    // Na 610-00-622 (Location piscine année précédente): provisie piscine
    const piscineProvisions: ProvisionRow[] = [];
    if (piscineProvOpening !== 0) {
      piscineProvisions.push({
        label: `Reprise Provision piscine faite en ${prevYear}`,
        e: piscineProvOpening,
        g: piscineProvOpening, h: piscineProvOpening,
        comment: `Provision de ${prevYear}`
      });
    }
    if (piscineProvClosing !== 0) {
      piscineProvisions.push({
        label: `Piscine ${year} a payer en ${year + 1}`,
        f: -piscineProvClosing, g: -piscineProvClosing, h: -piscineProvClosing,
        comment: `Provision pour ${year + 1}`
      });
    }
    if (piscineProvisions.length > 0) {
      provisionsByCode.set('610-00-622', piscineProvisions);
    }

    // Na 601-00-624 (Achat de matériel): provisie matériel
    const materielProvisions: ProvisionRow[] = [];
    if (materielProvOpening !== 0) {
      materielProvisions.push({
        label: `Reprise Provision faite en ${prevYear} pour achat matériel`,
        g: materielProvOpening, h: materielProvOpening,
        comment: `Provision de ${prevYear}`
      });
    }
    if (materielProvClosing !== 0) {
      materielProvisions.push({
        label: `Provision pour achat de matériel en ${year + 1}`,
        f: -materielProvClosing, g: -materielProvClosing, h: -materielProvClosing,
        comment: `Provision pour ${year + 1}`
      });
    }
    if (materielProvisions.length > 0) {
      provisionsByCode.set('601-00-624', materielProvisions);
    }

    // Na groep "sorties_club": provisies régularisation
    // Het officiële bestand berekent deze vanuit transactiecodes, niet bilanValues
    // "Mouvements affecté" = negatieve som van de régularisation-codes (490-xx, 493-xx)
    // regulSumByCol is al berekend boven het bilanValues blok

    // Bilan 06.03 opening = Paiements année courante fait l'année précédente
    // Dit is het bedrag dat vorig jaar betaald werd voor dit jaar (bv. school van zeeduiken)
    const paiementPrevOpening = getBilanVal('06.03', 'openingValue');

    // 06.02 opening = Sorties Club année précédente
    const regul0602Opening = getBilanVal('06.02', 'openingValue');
    // NB: 06.01 (Cotisations plongeurs) wordt NIET meegenomen in sorties provisions
    // omdat cotisaties al als revenue in Activités générales zitten

    // SPLIT provisies: officieel bestand plaatst "Reprise Prepaiement" NA 439-00-002
    // (vóór de régularisation-codes), terwijl Mouvements en Reprise mouvement
    // NA 493-00-735 komen (na de régularisation-codes)

    // 1. Reprise Prepaiement → na 439-00-002 (vóór régularisation codes)
    // Altijd tonen (ook met waarde 0) — officieel bestand toont deze rij altijd
    provisionsByCode.set('439-00-002', [{
      label: `Reprise Prepaiement ${year} fait en ${prevYear}`,
      g: regul0602Opening, h: regul0602Opening,
      comment: `Provision de ${prevYear}`
    }]);

    // 2. Mouvements + Reprise mouvement → na 493-00-735 (na régularisation codes)
    const sortiesProvisions: ProvisionRow[] = [];

    // Mouvements affecté à année suivante = -SUM(régularisation codes)
    const mouvAffecteF = round2(-regulSumByCol.f);
    const mouvAffecteG = round2(-regulSumByCol.g);
    const mouvAffecteH = round2(-regulSumByCol.h);
    sortiesProvisions.push({
      label: `Mouvements ${year} affecté à ${year + 1}`,
      e: mouvAffecteH,
      f: mouvAffecteF, g: mouvAffecteG, h: mouvAffecteH,
      comment: `Provision pour ${year + 1}`
    });

    // Reprise mouvement: 06.03 opening (paiements année courante fait en année précédente)
    if (paiementPrevOpening !== 0) {
      sortiesProvisions.push({
        label: `Reprise mouvement ${prevYear} Affecté ${year}`,
        g: paiementPrevOpening, h: paiementPrevOpening,
        comment: `Provision de ${prevYear}`
      });
    }

    // Na 493-00-735: mouvements & reprise (inline in sorties_club groep)
    if (sortiesProvisions.length > 0) {
      provisionsByCode.set('493-00-735', sortiesProvisions);
    }
  }

  // ============================
  // DATA ROWS — grouped by activity
  // ============================
  let currentRow = 8;
  let totalPL_E = 0; // F23 (previous year) total
  let totalPL_F = 0; // Month total
  let totalPL_G = 0; // Year to Month total
  let totalPL_H = 0; // Full Year total

  // Track which codes are already written (to avoid duplicates)
  const writtenCodes = new Set<string>();

  for (const group of groups.sort((a, b) => a.order - b.order)) {
    // Gebruik de volgorde uit de groep-definitie (matcht officieel bestand)
    const orderedCodes = group.accountCodes;

    // Write each code in this group
    let groupSum_E = 0;
    let groupSum_F = 0;
    let groupSum_G = 0;
    let groupSum_H = 0;
    let groupBudget = 0;
    let lastCodeRow = currentRow; // Track last code row for double border

    for (const code of orderedCodes) {
      const data = getCodeData(code);
      // Toon ALLE codes die in de groep staan, ook met waarde 0
      // (officieel bestand toont ook 0-waarden)
      writeCodeRow(currentRow, code, budgetMap.get(code));
      groupSum_E += getPrevYearYTD(code);
      groupSum_F += data.lastMonth;
      groupSum_G += data.ytd;
      groupSum_H += data.ytd;
      if (budgetMap.has(code)) groupBudget += budgetMap.get(code)!;
      writtenCodes.add(code);
      lastCodeRow = currentRow;
      currentRow++;

      // Write INLINE provision rows after this specific code (if any)
      const inlineProvisions = provisionsByCode.get(code) || [];
      for (const prov of inlineProvisions) {
        writeDataRow(currentRow, null, prov.label, {
          e: prov.e, f: prov.f, g: prov.g, h: prov.h
        }, prov.comment);
        // Include provisions in group subtotals
        groupSum_E += prov.e || 0;
        groupSum_F += prov.f || 0;
        groupSum_G += prov.g || 0;
        groupSum_H += prov.h || 0;
        lastCodeRow = currentRow;
        currentRow++;
      }
    }

    // Double border on the last row before the subtotal (matching official)
    if (lastCodeRow >= 8) {
      const lastRow = sheet.getRow(lastCodeRow);
      for (const col of [2, 3, 5, 6, 7, 8, 9]) {
        const cell = lastRow.getCell(col);
        cell.border = { ...cell.border, bottom: { style: 'double' } };
      }
    }

    // Write group subtotal row (bold, with section fill)
    // Budget: use override if available, else sum of individual code budgets
    const budgetOverride = groupBudgetOverrides.get(group.id);
    const finalGroupBudget = budgetOverride !== undefined ? budgetOverride : groupBudget;
    writeDataRow(currentRow, group.name, '', {
      e: round2(groupSum_E),
      f: round2(groupSum_F),
      g: round2(groupSum_G),
      h: round2(groupSum_H),
      i: finalGroupBudget !== 0 ? round2(finalGroupBudget) : undefined
    }, undefined, true);
    // Section subtotal row height
    sheet.getRow(currentRow).height = 13.5;

    totalPL_E += groupSum_E;
    totalPL_F += groupSum_F;
    totalPL_G += groupSum_G;
    totalPL_H += groupSum_H;

    currentRow += 2; // Empty row after subtotal

    // Variation d'inventaire — na Soirée annuelle, vóór Administration (zoals officieel bestand R74)
    if (group.id === 'soiree_annuelle' && bilanValues) {
      const boutiqueCDCOpening = getBilanVal('02.01.01', 'openingValue');
      const boutiqueCDCClosing = getBilanVal('02.01.01', 'closingValue');
      const boutiqueLIFRASOpening = getBilanVal('02.01.02', 'openingValue');
      const boutiqueLIFRASClosing = getBilanVal('02.01.02', 'closingValue');
      const variationInv = round2(
        (boutiqueCDCClosing - boutiqueCDCOpening) + (boutiqueLIFRASClosing - boutiqueLIFRASOpening)
      );
      writeDataRow(currentRow, null, `Variation d'inventaire (${fiscalYear.year} - ${fiscalYear.year - 1})`, {
        h: variationInv
      });
      totalPL_H += variationInv;
      currentRow++; // Geen lege rij — officieel bestand gaat direct door naar Administration
    }
  }

  // Write any remaining codes not in any group
  // Some codes are hidden (not displayed) but still included in P&L totals
  // These exist due to Firestore code-fix and don't appear as separate rows in official
  const RESULTATS_UNGROUPED_HIDDEN = new Set(['612-00-624', '730-00-711', '610-00-629', '620-00-664']);
  const ungroupedCodes: string[] = [];
  for (const [code] of codeMonthlyMap.entries()) {
    if (!writtenCodes.has(code)) {
      ungroupedCodes.push(code);
    }
  }
  if (ungroupedCodes.length > 0) {
    ungroupedCodes.sort();
    let hasVisibleUngrouped = false;
    for (const code of ungroupedCodes) {
      const data = getCodeData(code);
      if (data.ytd !== 0 || data.lastMonth !== 0) {
        // Always include in totals
        totalPL_E += getPrevYearYTD(code);
        totalPL_F += data.lastMonth;
        totalPL_G += data.ytd;
        totalPL_H += data.ytd;
        // Only display if not hidden
        if (!RESULTATS_UNGROUPED_HIDDEN.has(code)) {
          writeCodeRow(currentRow, code, budgetMap.get(code));
          hasVisibleUngrouped = true;
          currentRow++;
        }
      }
    }
    if (hasVisibleUngrouped) currentRow++;
  }

  // ============================
  // TOTAL P&L row — navy fill matching official
  // ============================
  writeDataRow(currentRow, 'TOTAL P&L', '', {
    e: totalPL_E !== 0 ? round2(totalPL_E) : undefined,
    f: round2(totalPL_F),
    g: round2(totalPL_G),
    h: round2(totalPL_H),
    i: 0
  }, undefined, true);
  // Navy fill + white font on TOTAL P&L (matching official)
  const totalPLRow = sheet.getRow(currentRow);
  totalPLRow.height = 13.5;
  for (const col of [2, 5, 6, 7, 8, 9]) {
    const cell = totalPLRow.getCell(col);
    cell.fill = navyFill;
    cell.font = whiteFont;
    if (col >= 5) {
      cell.numFmt = col === 5 ? numFmtAccounting : numFmtRedNeg;
    }
  }
  totalPLRow.getCell(2).border = { bottom: { style: 'medium' } };
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

    // Provision summary in bottom section
    // De bottom section toont de netto impact van provisies op de cash balance
    // Reprises = vorig jaar gereserveerd, nu vrijgekomen (negatief effect op cash)
    // Nieuwe provisies = dit jaar gereserveerd voor volgend jaar (positief effect op cash)
    let provAdj_F = 0, provAdj_G = 0, provAdj_H = 0;

    if (bilanValues) {
      const prevYear = fiscalYear.year - 1;
      const year = fiscalYear.year;

      // Reprise provisions = netto van alle opening provisions
      // Dit zijn bedragen die vorig jaar gereserveerd waren en nu geconsumeerd
      // In de bottom section is dit negatief (geld was al gereserveerd, nu uitgegeven)
      // NB: 06.01 (Cotisations plongeurs) wordt NIET meegenomen — cotisaties zitten
      // al in de revenue van Activités générales
      const repriseMatOpening = getBilanVal('05.01', 'openingValue');
      const reprisePiscOpening = getBilanVal('05.02', 'openingValue');
      const repriseRegulOpening = round2(
        getBilanVal('06.02', 'openingValue') +
        getBilanVal('06.03', 'openingValue')
      );
      const totalRepriseProvisions = round2(repriseMatOpening + reprisePiscOpening + repriseRegulOpening);

      writeDataRow(currentRow, null, `Reprise provisions ${year}`, {
        f: 0, g: round2(-totalRepriseProvisions), h: round2(-totalRepriseProvisions)
      }, `Provision de ${prevYear}`);
      provAdj_G += round2(-totalRepriseProvisions);
      provAdj_H += round2(-totalRepriseProvisions);
      currentRow++;

      // Nieuwe provisie: Piscine
      const piscineProvClosing = getBilanVal('05.02', 'closingValue');
      if (piscineProvClosing !== 0) {
        writeDataRow(currentRow, null, `Provision pour Piscine ${year} a payer en ${year + 1}`, {
          f: piscineProvClosing, g: piscineProvClosing, h: piscineProvClosing
        }, `Provision pour ${year + 1}`);
        provAdj_F += piscineProvClosing;
        provAdj_G += piscineProvClosing;
        provAdj_H += piscineProvClosing;
        currentRow++;
      }

      // Nieuwe provisie: Matériel
      const materielProvClosing = getBilanVal('05.01', 'closingValue');
      if (materielProvClosing !== 0) {
        writeDataRow(currentRow, null, `Provision pour achat de matériel en ${year + 1}`, {
          f: materielProvClosing, g: materielProvClosing, h: materielProvClosing
        }, `Provision pour ${year + 1}`);
        provAdj_F += materielProvClosing;
        provAdj_G += materielProvClosing;
        provAdj_H += materielProvClosing;
        currentRow++;
      }

      // Nieuwe provisie: Mouvements (régularisation)
      // Bottom section toont de PROVISIE (cash-effect), niet de reprise
      // Officieel: F = SUM(regul codes lastMonth), G/H = SUM(regul codes ytd)
      // Dit is het tegengestelde van de middensectie "Mouvements affecté"
      const mouvProvF = round2(regulSumByCol.f);
      const mouvProvG = round2(regulSumByCol.g);
      const mouvProvH = round2(regulSumByCol.h);
      writeDataRow(currentRow, null, `Provision pour Mouvements ${year} affecté à ${year + 1}`, {
        f: mouvProvF, g: mouvProvG, h: mouvProvH
      }, `Provision pour ${year + 1}`);
      provAdj_F += mouvProvF;
      provAdj_G += mouvProvG;
      provAdj_H += mouvProvH;
      currentRow++;
    }

    // Balance Théorique = Opening + Total P&L + provision adjustments
    const balanceTheorique_F = round2(openingBankBalance + totalPL_F + provAdj_F);
    const balanceTheorique_G = round2(openingBankBalance + totalPL_G + provAdj_G);
    const balanceTheorique_H = round2(openingBankBalance + totalPL_H + provAdj_H);
    writeDataRow(currentRow, null, `Balance Theorique ${fiscalYear.year}`, {
      f: balanceTheorique_F,
      g: balanceTheorique_G,
      h: balanceTheorique_H
    });
    currentRow++;

    // Balance Banque (actual closing bank balance)
    if (closingBankBalance !== undefined) {
      writeDataRow(currentRow, null, 'Balance Banque', {
        f: round2(closingBankBalance),
        g: round2(closingBankBalance),
        h: round2(closingBankBalance)
      });
      currentRow++;

      // Difference
      writeDataRow(currentRow, null, 'Difference', {
        f: round2(closingBankBalance - balanceTheorique_F),
        g: round2(closingBankBalance - balanceTheorique_G),
        h: round2(closingBankBalance - balanceTheorique_H)
      });
    } else {
      writeDataRow(currentRow, null, 'Balance Banque', {});
      currentRow++;
      writeDataRow(currentRow, null, 'Difference', {});
    }
  }
}

/**
 * Ajoute la feuille "Inventaire non valorisé" — Résumé inventaire matériel
 * Structure fixe: 25 lignes, 3 colonnes (A vide, B label, C quantité)
 */

/**
 * Ajoute la feuille "Inventaire non valorisé" — Résumé inventaire matériel
 * Structure fixe: 25 lignes, 3 colonnes (A vide, B label, C quantité)
 */
function addInventaireSheet(workbook: ExcelJS.Workbook, year: number): void {
  const sheet = workbook.addWorksheet('Inventaire non valorisé', {
    views: [{ showGridLines: true }]
  });

  sheet.getColumn(1).width = 8.43;
  sheet.getColumn(2).width = 25.0;
  sheet.getColumn(3).width = 12.0;

  // R3: Title
  sheet.getCell('B3').value = `Inventaire fin ${year}`;
  // R8: Headers
  sheet.getCell('B8').value = 'Resume Inventaire';
  sheet.getCell('C8').value = `Fin ${year}`;

  // Static inventory items (R9-R25)
  const items: [string, number][] = [
    ['Gilets', 44],
    ['Detendeurs', 30],
    ['Bouteilles plongee', 41],
    ['Bout. oxy', 2],
    ['Bout. oxy demo', 1],
    ['Ordi', 3],
    ['Palmes piscine', 25],
    ['Palmes carriere', 5],
    ['Lampes ', 4],
    ['Compas', 5],
    ['Ceintures a poches', 4],
    ['Masques', 18],
    ['Tubas', 20],
    ['Ceintures 3Kg', 17],
    ['Backacks', 13],
    ['Parachutes carriere', 3],
    ['Parachute piscine', 3],
  ];

  items.forEach(([label, qty], idx) => {
    const row = 9 + idx;
    sheet.getCell(`B${row}`).value = label;
    sheet.getCell(`C${row}`).value = qty;
  });
}

/**
 * Ajoute la feuille "Ʃ activité" — Pivot des transactions par activité
 * Colonnes: A = Étiquettes de lignes (nom activité), B = Somme de Montant
 */
function addSommeActiviteSheet(
  workbook: ExcelJS.Workbook,
  transactions: TransactionBancaire[]
): void {
  const sheet = workbook.addWorksheet('Ʃ activité', {
    views: [{ showGridLines: true }]
  });

  sheet.getColumn(1).width = 60.0;
  sheet.getColumn(2).width = 20.0;

  // Helper: get activity name from matched_entities
  const getActivity = (trans: TransactionBancaire): string => {
    if (trans.matched_entities && trans.matched_entities.length > 0) {
      return trans.matched_entities
        .filter(e => e.entity_type === 'event' && e.entity_name)
        .map(e => e.entity_name)
        .join(' | ');
    }
    return '';
  };

  // Build pivot: activity name → sum of amounts
  const activityMap = new Map<string, number>();
  for (const trans of transactions) {
    const activity = getActivity(trans);
    if (activity) {
      activityMap.set(activity, (activityMap.get(activity) || 0) + (trans.montant || 0));
    }
  }

  // Sort alphabetically
  const sorted = Array.from(activityMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  // R3: Headers
  sheet.getCell('A3').value = 'Étiquettes de lignes';
  sheet.getCell('B3').value = 'Somme de Montant';

  // R4: Grand total without label (matches official)
  let grandTotal = 0;
  sorted.forEach(([, amount]) => { grandTotal += amount; });
  sheet.getCell('B4').value = grandTotal;

  // R5+: Data rows
  sorted.forEach(([activity, amount], idx) => {
    const row = 5 + idx;
    sheet.getCell(`A${row}`).value = activity;
    sheet.getCell(`B${row}`).value = amount;
  });

  // Total row after data
  const totalRow = 5 + sorted.length;
  sheet.getCell(`A${totalRow}`).value = 'Total général';
  sheet.getCell(`B${totalRow}`).value = grandTotal;

  // ƩƩ marker at end (matches official)
  const markerRow = totalRow + 5;
  sheet.getCell(`A${markerRow}`).value = 'ƩƩ';
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
    null, 'INVENTAIRE 14/01/' + fiscalYear.year,
    'Stock Initial', 'Valeur unitaire fin ' + (fiscalYear.year - 1),
    'Valeur stock fin ' + (fiscalYear.year - 1), null,
    'Achat', "Valeur d'achat", 'Vente / distribution', 'Stock Final',
    'Valeur unitaire début ' + (fiscalYear.year - 1),
    "Valeur unitaire d'inventaire", 'Valeur du stock'
  ];
  headerRow.eachCell(cell => applyHeaderStyle(cell));
  headerRow.height = 22;

  // Categories with explicit item assignment matching official Excel order.
  // The official file groups items by type, not by name pattern.
  // Each category defines keyword matchers + an explicit order list for sorting.
  const categoryDefs: Array<{
    name: string;
    match: (nom: string) => boolean;
    order: string[];  // partial name matches in desired display order
  }> = [
    {
      name: 'CARNETS DE PLONGEE',
      match: (n) => n.includes('carnet'),
      order: ['plongée - calypso', 'plongée - lifras', 'apnée']
    },
    {
      name: 'CARTES LIFRAS',
      match: (n) => n.includes('feuille') || n.includes('triptype') || n.includes('plongée découverte') || n.includes('carte'),
      order: ['attestation', 'inscriptions', 'triptype', 'plongée découverte']
    },
    {
      name: 'FICHES & LIVRES',
      match: (n) => n.includes('livre') || (n.includes('fiche') && n.includes('faune')),
      order: ['livre', 'fiche']
    },
    {
      name: 'Textile',
      match: (n) => n.includes('spreadshop') || n.includes('casquette') || n.includes('textile'),
      order: ['spreadshop', 'casquettes calypso diving', 'casquettes calypso']
    },
    {
      name: 'GOODIES',
      match: (n) => n.includes('goodie') || n.includes('porte-clef'),
      order: ['porte-clef']
    }
  ];

  // Assign items to categories using match functions
  const categories: Array<{ name: string; items: BoutiqueItem[] }> = categoryDefs.map(def => ({
    name: def.name,
    items: [] as BoutiqueItem[]
  }));

  const assignedIds = new Set<string>();
  for (const item of items) {
    const nomLower = item.nom.toLowerCase();
    let assigned = false;
    for (let ci = 0; ci < categoryDefs.length; ci++) {
      if (categoryDefs[ci].match(nomLower)) {
        categories[ci].items.push(item);
        assignedIds.add(item.id);
        assigned = true;
        break; // first matching category wins
      }
    }
    if (!assigned) {
      // Uncategorized → GOODIES (last category)
      categories[categories.length - 1].items.push(item);
      assignedIds.add(item.id);
    }
  }

  // Sort items within each category to match official order
  for (let ci = 0; ci < categoryDefs.length; ci++) {
    const orderList = categoryDefs[ci].order;
    categories[ci].items.sort((a, b) => {
      const aLower = a.nom.toLowerCase();
      const bLower = b.nom.toLowerCase();
      const aIdx = orderList.findIndex(pat => aLower.includes(pat));
      const bIdx = orderList.findIndex(pat => bLower.includes(pat));
      // Items matching order list come first, in that order; others alphabetically at end
      const aPos = aIdx >= 0 ? aIdx : 9999;
      const bPos = bIdx >= 0 ? bIdx : 9999;
      if (aPos !== bPos) return aPos - bPos;
      return a.nom.localeCompare(b.nom, 'fr');
    });
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

      // Official file: C=opening stock, J=closing stock, M=closing value
      // We only have current (=closing) quantities in Firestore.
      // Opening stock would require a snapshot from start-of-year.
      // For now: C=qty (opening), J=qty (closing=same), K/L=prix_achat, M=stockValue
      row.values = [
        null,                             // A: spacer
        item.nom,                         // B: item name
        item.quantite,                    // C: stock initial qty
        item.prix_achat,                  // D: unit value end prev year
        stockValue,                       // E: stock value end prev year
        null,                             // F: spacer
        null,                             // G: purchases qty (not tracked)
        null,                             // H: purchase value (not tracked)
        null,                             // I: sales/distributed (not tracked)
        item.quantite,                    // J: final stock (= current qty)
        item.prix_achat,                  // K: unit value start prev year
        item.prix_achat,                  // L: inventory unit value
        stockValue                        // M: stock value (current)
      ];

      // Format numeric columns (C-E, G-M)
      [3, 4, 5, 7, 8, 9, 10, 11, 12, 13].forEach(col => {
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

  // Sort items by reference (official order) — items without reference go last
  const sortedItems = [...items].sort((a, b) => {
    const refA = a.reference || 'ZZZZ';
    const refB = b.reference || 'ZZZZ';
    return refA.localeCompare(refB);
  });

  // R6+: Data rows
  let currentRow = 6;
  for (const item of sortedItems) {
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
      null,                              // I: Achat (data not tracked)
      null,                              // J: Vendu (data not tracked)
      null,                              // K: Donné (data not tracked)
      null,                              // L: Solde (data not tracked)
      null,                              // M: Total achat (data not tracked)
      null,                              // N: Total Stock + achat (data not tracked)
      null,                              // O: Réduction d'inventaire (data not tracked)
      null,                              // P: Total vente (data not tracked)
      null,                              // Q: Profits sur vente (data not tracked)
      null,                              // R: spacer
      item.quantite,                     // S: QUANTITE closing
      totalValue                         // T: TOTAL closing
    ];

    // Format numeric columns (only A-F and S-T, operations I-Q are null)
    [3, 4, 5, 6, 19, 20].forEach(col => {
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
  _fiscalYearStart: Date,
  openingBankBalance: number,
  closingBankBalance: number | undefined,
  bilanValues: BilanValues[]
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

  // Right-side label overrides (official Budget right uses different labels than left)
  const BUDGET_RIGHT_LABEL: Record<string, string> = {
    '730-00-712': 'Cotisations des membres plongeurs (V)',
    '730-00-713': 'Cotisations instructeurs (V)',
    '730-00-714': 'Cotisations administrateurs (V)',
    '730-00-715': 'Cotisation autres (V)',
    '604-00-640': 'Remboursement Boutique',
    '604-00-740': 'Vente Boutique',
    '604-00-641': 'Stock Boutique (A)',
    '604-00-741': 'Stock boutique (V)',
    '664-00-750': 'Soirée annuelle (V)',
    '664-00-650': 'Soirée annuelle (A)',
    '657-00-760': 'Intérêts banque',
  };
  // Right-side code overrides (official Budget right uses different codes for boutique)
  const BUDGET_RIGHT_CODE: Record<string, string> = {
    '604-00-641': '600-00-641',
    '604-00-741': '600-00-741',
  };
  // Codes that should NOT appear on the right side (provision-only rows, extra codes)
  const BUDGET_RIGHT_SKIP_CODES = new Set([
    '730-00-716',    // nageur already on R14 as 730-00-715
    '610-00-622',    // piscine année précédente — not on right side
    '439-00-001',    // cautions reçues — not on right
    '439-00-002',    // cautions remboursées — not on right
    '490-00-631', '493-00-731', '490-00-635', '493-00-719', '493-00-735', // sortie codes
    '619-00-733',    // sorties non plongées (V)
    '604-00-642', '604-00-742', '604-00-743', // boutique LIFRAS + calybar
  ]);
  // Codes where right-side budget should be null even if left has a value
  const BUDGET_RIGHT_NO_BUDGET = new Set([
    '657-00-760',    // Intérêts banque — budget only on left side
  ]);
  // Group budget overrides for right side (col M)
  const BUDGET_RIGHT_GROUP_BUDGET: Record<string, number> = {
    'administration': -450, // Official has -450, not -500
    'formation': 0,         // Official shows 0 explicitly
  };

  // Helper to write a budget row
  const writeBudgetRow = (
    rowNum: number,
    code: string | null,
    label: string,
    ytd: number | null,
    budget: number | null,
    isBold = false,
    skipRight = false
  ) => {
    // Right-side values
    const rightCode = code && !skipRight && !isBold ? (BUDGET_RIGHT_CODE[code] || code) : (isBold && !skipRight ? code : null);
    const rightLabel = code && !skipRight && !isBold ? (BUDGET_RIGHT_LABEL[code] || label) : (isBold && !skipRight ? '' : null);
    const noBudgetRight = code ? BUDGET_RIGHT_NO_BUDGET.has(code) : false;
    const rightBudget = !skipRight && !noBudgetRight ? (budget != null && budget !== 0 ? round2(budget) : null) : null;

    const row = sheet.getRow(rowNum);
    row.values = [
      null,                                                          // A
      code,                                                          // B: Code
      label,                                                         // C: Label
      null,                                                          // D: Next Year Budget (editable)
      ytd != null && ytd !== 0 ? round2(ytd) : null,                // E: Full Year Realized
      budget != null && budget !== 0 ? round2(budget) : null,        // F: Current Year Budget
      null, null, null, null,                                        // G-J spacers
      rightCode,                                                     // K: Code right
      rightLabel,                                                    // L: Label right
      rightBudget                                                    // M: Budget right
    ];
    // Format numeric columns
    for (const col of [4, 5, 6, 13]) {
      row.getCell(col).numFmt = '#,##0.00';
      row.getCell(col).alignment = { horizontal: 'right' };
    }
    // Column D: Editable (yellow)
    applyEditableStyle(row.getCell(4));
    if (isBold) {
      row.eachCell(cell => { cell.font = { ...(cell.font || {}), bold: true }; });
    }
  };

  const year = fiscalYear.year;
  const prevYear = year - 1;

  // BilanValues helper
  const getBilanValBudget = (code: string, field: 'openingValue' | 'closingValue'): number => {
    const bv = bilanValues.find(v => v.bilanCodeId === code);
    if (!bv) return 0;
    return round2(bv[field] ?? 0);
  };

  // Provision data (same as P&L par mois)
  const piscineProvOpening = getBilanValBudget('05.02', 'openingValue');
  const piscineProvClosing = getBilanValBudget('05.02', 'closingValue');
  const materielProvOpening = getBilanValBudget('05.01', 'openingValue');
  const materielProvClosing = getBilanValBudget('05.01', 'closingValue');

  const regulCodes = ['490-00-631', '493-00-731', '490-00-635', '493-00-719', '493-00-735'];
  let regulYTD = 0;
  for (const gd of groupsData) {
    for (const acc of gd.accounts) {
      if (regulCodes.includes(acc.code)) {
        regulYTD += acc.ytd;
      }
    }
  }
  regulYTD = round2(regulYTD);

  const paiementPrevOpening = getBilanValBudget('06.03', 'openingValue');
  const regul0602Opening = getBilanValBudget('06.02', 'openingValue');

  // Provision rows mapping
  type BudgetProvisionRow = { label: string; ytd: number };
  const provisionsByCode = new Map<string, BudgetProvisionRow[]>();

  // After 610-00-622: piscine provisions
  const piscineProvs: BudgetProvisionRow[] = [];
  if (piscineProvOpening !== 0) {
    piscineProvs.push({ label: `Reprise Provision piscine faite en ${prevYear}`, ytd: piscineProvOpening });
  }
  if (piscineProvClosing !== 0) {
    piscineProvs.push({ label: `Piscine ${year} a payer en ${year + 1}`, ytd: -piscineProvClosing });
  }
  if (piscineProvs.length > 0) provisionsByCode.set('610-00-622', piscineProvs);

  // After 601-00-624: matériel provisions
  const materielProvs: BudgetProvisionRow[] = [];
  if (materielProvOpening !== 0) {
    materielProvs.push({ label: `Reprise Provision faite en ${prevYear} pour achat matériel`, ytd: materielProvOpening });
  }
  if (materielProvClosing !== 0) {
    materielProvs.push({ label: `Provision pour achat de matériel en ${year}`, ytd: -materielProvClosing });
  }
  if (materielProvs.length > 0) provisionsByCode.set('601-00-624', materielProvs);

  // After 439-00-002: Reprise Prepaiement (Budget ALWAYS shows this row, unlike P&L par mois)
  provisionsByCode.set('439-00-002', [{
    label: `Reprise Prepaiement ${year} fait en ${prevYear}`,
    ytd: regul0602Opening
  }]);

  // After 493-00-735: Mouvements + Reprise mouvement
  const sortiesProvs: BudgetProvisionRow[] = [];
  sortiesProvs.push({
    label: `Mouvements ${year} affecté à ${year + 1}`,
    ytd: round2(-regulYTD)
  });
  if (paiementPrevOpening !== 0) {
    sortiesProvs.push({
      label: `Reprise mouvement ${prevYear} Affecté ${year}`,
      ytd: paiementPrevOpening
    });
  }
  provisionsByCode.set('493-00-735', sortiesProvs);

  // R8+: Data rows with group subtotals and provisions
  let currentRow = 8;
  let totalYTD = 0;

  const sortedGroups = [...groupsData].sort((a, b) => a.group.order - b.group.order);

  for (const gd of sortedGroups) {
    let groupYTD = 0;
    let groupBudget = 0;

    // Write code rows + inline provisions
    let groupBudgetRight = 0;
    for (const acc of gd.accounts) {
      const skipCodeRight = BUDGET_RIGHT_SKIP_CODES.has(acc.code);
      writeBudgetRow(currentRow, acc.code, acc.label, acc.ytd, acc.budget ?? 0, false, skipCodeRight);
      groupYTD = round2(groupYTD + acc.ytd);
      groupBudget = round2(groupBudget + (acc.budget ?? 0));
      if (!skipCodeRight) groupBudgetRight = round2(groupBudgetRight + (acc.budget ?? 0));
      currentRow++;

      // Inline provision rows after specific codes (never on right side)
      const provRows = provisionsByCode.get(acc.code);
      if (provRows) {
        for (const prov of provRows) {
          writeBudgetRow(currentRow, null, prov.label, prov.ytd, null, false, true);
          groupYTD = round2(groupYTD + prov.ytd);
          currentRow++;
        }
      }
    }

    // Group subtotal row (bold) — use right-side budget override if available
    const rightGroupBudget = BUDGET_RIGHT_GROUP_BUDGET[gd.group.id] ?? groupBudgetRight;
    writeBudgetRow(currentRow, gd.group.name, '', groupYTD, groupBudget, true);
    // Override right-side budget (col M) for group subtotal
    const groupRow = sheet.getRow(currentRow);
    groupRow.getCell(13).value = rightGroupBudget !== 0 ? rightGroupBudget : null;
    totalYTD = round2(totalYTD + groupYTD);
    currentRow += 2; // Empty row after subtotal

    // Variation d'inventaire — after Soirée annuelle
    if (gd.group.id === 'soiree_annuelle') {
      const boutiqueCDCOpening = getBilanValBudget('02.01.01', 'openingValue');
      const boutiqueCDCClosing = getBilanValBudget('02.01.01', 'closingValue');
      const boutiqueLIFRASOpening = getBilanValBudget('02.01.02', 'openingValue');
      const boutiqueLIFRASClosing = getBilanValBudget('02.01.02', 'closingValue');
      const variationInv = round2(
        (boutiqueCDCClosing - boutiqueCDCOpening) + (boutiqueLIFRASClosing - boutiqueLIFRASOpening)
      );
      writeBudgetRow(currentRow, null, `Variation d'inventaire (${year} - ${prevYear})`, variationInv, null, false, true);
      totalYTD = round2(totalYTD + variationInv);
      currentRow++;
    }
  }

  // TOTAL P&L row — right side shows TOTAL P&L with budget 0
  writeBudgetRow(currentRow, 'TOTAL P&L', '', totalYTD, null, true);
  // Right side: TOTAL P&L with 0 budget
  const totalRow = sheet.getRow(currentRow);
  totalRow.getCell(13).value = 0;
  sheet.getRow(currentRow).eachCell(cell => applyTotalStyle(cell));
  currentRow += 2;

  // BOTTOM SECTION: Cash Balance reconciliation (left side only)
  if (openingBankBalance !== undefined) {
    writeBudgetRow(currentRow, null, 'Opening Cash Balance', round2(openingBankBalance), null, false, true);
    currentRow++;

    writeBudgetRow(currentRow, null, `Total Mouvement${year}`, totalYTD, null, false, true);
    currentRow++;

    writeBudgetRow(currentRow, null, 'Apport Cash Reserve', null, null, false, true);
    currentRow++;

    // Provision summary
    let provAdj = 0;
    const repriseMatOpening = getBilanValBudget('05.01', 'openingValue');
    const reprisePiscOpening = getBilanValBudget('05.02', 'openingValue');
    const repriseRegulOpening = round2(
      getBilanValBudget('06.02', 'openingValue') + getBilanValBudget('06.03', 'openingValue')
    );
    const totalRepriseProvisions = round2(repriseMatOpening + reprisePiscOpening + repriseRegulOpening);

    writeBudgetRow(currentRow, null, `Reprise provisions ${year}`, round2(-totalRepriseProvisions), null, false, true);
    provAdj += round2(-totalRepriseProvisions);
    currentRow++;

    if (piscineProvClosing !== 0) {
      writeBudgetRow(currentRow, null, `Provision pour Piscine ${year} a payer en ${year + 1}`, piscineProvClosing, null, false, true);
      provAdj += piscineProvClosing;
      currentRow++;
    }

    if (materielProvClosing !== 0) {
      writeBudgetRow(currentRow, null, `Provision pour achat de matériel en ${year}`, materielProvClosing, null, false, true);
      provAdj += materielProvClosing;
      currentRow++;
    }

    const mouvProv = round2(regulYTD);
    writeBudgetRow(currentRow, null, `Provision pour Mouvements ${year} affecté à ${year + 1}`, mouvProv, null, false, true);
    provAdj += mouvProv;
    currentRow++;

    // Balance Théorique
    const balanceTheorique = round2(openingBankBalance + totalYTD + provAdj);
    writeBudgetRow(currentRow, null, `Balance Theorique ${year}`, balanceTheorique, null, false, true);
    currentRow++;

    // Balance Banque
    if (closingBankBalance !== undefined) {
      writeBudgetRow(currentRow, null, 'Balance Banque', round2(closingBankBalance), null, false, true);
      currentRow++;

      // Difference
      const difference = round2(closingBankBalance - balanceTheorique);
      writeBudgetRow(currentRow, null, 'Difference', difference, null, false, true);
    }
  }
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
  const codeMap = new Map(bilanCodes.map(c => [c.code, c]));

  // Helper: get value for a bilan code
  const getVal = (codeStr: string, field: 'openingValue' | 'closingValue'): number => {
    const bc = codeMap.get(codeStr);
    if (!bc) return 0;
    return round2(valuesMap.get(bc.id)?.[field] ?? 0);
  };

  // Helper: write a value cell (skipZero leaves cell empty when value is 0)
  const writeVal = (col: string, row: number, val: number, skipZero = false) => {
    if (skipZero && val === 0) return;
    const cell = sheet.getCell(`${col}${row}`);
    cell.value = val;
    cell.numFmt = '#,##0.00';
    cell.alignment = { horizontal: 'right' };
  };
  const writeLabel = (col: string, row: number, text: string, bold = false) => {
    const cell = sheet.getCell(`${col}${row}`);
    cell.value = text;
    if (bold) cell.font = { bold: true };
  };

  // Track rows for totals
  const actifValueRows: number[] = [];
  const passifValueRows: number[] = [];

  // === FIXED LAYOUT matching official BS an-1 ===
  // R9: Actifs immobilisés | Fonds Social
  writeLabel('B', 9, 'Actifs immobilisés', true);
  writeLabel('G', 9, 'Fonds Social', true);

  // R10: (empty ACTIF) | Resultat reporté
  writeLabel('G', 10, 'Resultat reporté');
  writeVal('I', 10, getVal('04.01', 'openingValue'));
  writeVal('J', 10, getVal('04.01', 'closingValue'));
  passifValueRows.push(10);

  // R11: (empty ACTIF) | Fonds Affectés 2021
  writeLabel('G', 11, 'Fonds Affectés 2021');
  writeVal('I', 11, getVal('04.02.01', 'openingValue'));
  writeVal('J', 11, getVal('04.02.01', 'closingValue'));
  passifValueRows.push(11);

  // R12: (empty ACTIF) | Résultat de l'exercice YYYY
  writeLabel('G', 12, `Résultat de l'exercice ${previousYear}`);
  writeVal('I', 12, getVal('04.03', 'openingValue'));
  writeVal('J', 12, getVal('04.03', 'closingValue'));
  passifValueRows.push(12);

  // R13: Actifs circulants (header)
  writeLabel('B', 13, 'Actifs circulants', true);

  // R14: Stock C.D.C. | Provision pour charges et risques divers (header)
  writeLabel('B', 14, 'Stock C.D.C.');
  writeVal('D', 14, getVal('02.01', 'openingValue'));
  writeVal('E', 14, getVal('02.01', 'closingValue'));
  actifValueRows.push(14);
  writeLabel('G', 14, 'Provision pour charges et risques divers', true);

  // R15: Boutique
  writeLabel('B', 15, 'Boutique');
  writeVal('D', 15, getVal('02.01.01', 'openingValue'));
  writeVal('E', 15, getVal('02.01.01', 'closingValue'));
  // child of Stock CDC, not in actifValueRows

  // R16: Boutique LIFRAS | Provision pr entretien/achat matériel
  writeLabel('B', 16, 'Boutique LIFRAS');
  writeVal('D', 16, getVal('02.01.02', 'openingValue'));
  writeVal('E', 16, getVal('02.01.02', 'closingValue'));
  writeLabel('G', 16, 'Provision pr entretien/achat matériel');
  writeVal('I', 16, getVal('05.01', 'openingValue'));
  writeVal('J', 16, getVal('05.01', 'closingValue'));
  passifValueRows.push(16);

  // R17: Compre épargne | Provision Location Piscine YYYY
  writeLabel('B', 17, 'Compre épargne'); // official typo
  writeVal('D', 17, getVal('02.02', 'openingValue'));
  writeVal('E', 17, getVal('02.02', 'closingValue'));
  actifValueRows.push(17);
  writeLabel('G', 17, `Provision Location Piscine ${previousYear}`);
  writeVal('I', 17, getVal('05.02', 'openingValue'));
  writeVal('J', 17, getVal('05.02', 'closingValue'));
  passifValueRows.push(17);

  // R18: Compte à vue
  writeLabel('B', 18, 'Compte à vue');
  writeVal('D', 18, getVal('02.03', 'openingValue'));
  writeVal('E', 18, getVal('02.03', 'closingValue'));
  actifValueRows.push(18);

  // R19: Obligations Dette Belge
  writeLabel('B', 19, 'Obligations Dette Belge');
  const oblOpen = getVal('02.04', 'openingValue');
  const oblClose = getVal('02.04', 'closingValue');
  // Show actual values (official: 35000/0 for 2024)
  writeVal('D', 19, oblOpen);
  writeVal('E', 19, oblClose);
  actifValueRows.push(19);

  // R20: empty

  // R21: Comptes de régularisation (both sides)
  writeLabel('B', 21, 'Comptes de régularisation', true);
  writeLabel('G', 21, 'Comptes de régularisation', true);

  // R22: empty

  // R23: Cotisations plongeurs année suivante
  writeLabel('G', 23, 'Cotisations plongeurs année suivante');
  writeVal('I', 23, getVal('06.01', 'openingValue'), true); // skipZero
  writeVal('J', 23, getVal('06.01', 'closingValue'), true); // skipZero
  passifValueRows.push(23);

  // R24: Charges a reporter sortie année suivante | Sorties Club année suivante
  writeLabel('B', 24, 'Charges a reporter sortie année suivante');
  writeVal('D', 24, getVal('03.01', 'openingValue'), true);
  writeVal('E', 24, getVal('03.01', 'closingValue'), true);
  actifValueRows.push(24);
  writeLabel('G', 24, 'Sorties Club année suivante');
  writeVal('I', 24, getVal('06.02', 'openingValue'), true);
  writeVal('J', 24, getVal('06.02', 'closingValue'), true);
  passifValueRows.push(24);

  // R25: Assurance materiel année suivante | Paiement YYYY afferant à YYYY+1
  writeLabel('B', 25, 'Assurance materiel année suivante');
  writeVal('D', 25, getVal('03.02', 'openingValue'), true);
  writeVal('E', 25, getVal('03.02', 'closingValue'), true);
  actifValueRows.push(25);
  writeLabel('G', 25, `Paiement ${previousYear} afferant à ${previousYear + 1}`);
  writeVal('I', 25, getVal('06.03', 'openingValue'), true);
  writeVal('J', 25, getVal('06.03', 'closingValue'), true);
  passifValueRows.push(25);

  // R26: empty

  // R27: Totals
  const totalActifOpening = round2(actifValueRows.reduce((sum, r) => {
    const cell = sheet.getCell(`D${r}`);
    return sum + (typeof cell.value === 'number' ? cell.value : 0);
  }, 0));
  const totalActifClosing = round2(actifValueRows.reduce((sum, r) => {
    const cell = sheet.getCell(`E${r}`);
    return sum + (typeof cell.value === 'number' ? cell.value : 0);
  }, 0));
  const totalPassifOpening = round2(passifValueRows.reduce((sum, r) => {
    const cell = sheet.getCell(`I${r}`);
    return sum + (typeof cell.value === 'number' ? cell.value : 0);
  }, 0));
  const totalPassifClosing = round2(passifValueRows.reduce((sum, r) => {
    const cell = sheet.getCell(`J${r}`);
    return sum + (typeof cell.value === 'number' ? cell.value : 0);
  }, 0));

  writeVal('D', 27, totalActifOpening);
  writeVal('E', 27, totalActifClosing);
  sheet.getCell('D27').font = { bold: true };
  sheet.getCell('E27').font = { bold: true };

  writeVal('I', 27, totalPassifOpening);
  writeVal('J', 27, totalPassifClosing);
  sheet.getCell('I27').font = { bold: true };
  sheet.getCell('J27').font = { bold: true };

  // R29: Difference (should be 0)
  const difference = round2(totalActifClosing - totalPassifClosing);
  writeVal('J', 29, difference);

  // R30: Reference year
  writeLabel('B', 30, 'Année de référence', true);
  sheet.getCell('E30').value = previousYear;
  sheet.getCell('E30').font = { bold: true };
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
  // Raw (non-remapped) version for CC Utilisés which shows original Firestore codes
  const rawCodeMonthlyMap = aggregateTransactionsByCodeAndMonth(transactions, fiscalYearStart, false);

  // 4c. Récupérer les transactions de l'année précédente pour la colonne F23
  const prevYear = fiscalYear.year - 1;
  let prevYearCodeMonthlyMap: Map<string, number[]> = new Map();
  try {
    const allFiscalYears = await FiscalYearService.getFiscalYears(clubId);
    const prevFY = allFiscalYears.find(fy => fy.year === prevYear);
    if (prevFY) {
      const prevPeriod = ReportService.createPeriodFromFiscalYear(prevFY);
      const prevTransactions = await ReportService.getTransactionsForPeriod(clubId, prevPeriod, prevFY.id);
      const prevFYStart = prevFY.start_date instanceof Date
        ? prevFY.start_date
        : (prevFY.start_date as any).toDate();
      prevYearCodeMonthlyMap = aggregateTransactionsByCodeAndMonth(prevTransactions, prevFYStart);
      logger.info(`[ReportExcel] ✅ F23: Loaded ${prevTransactions.length} transactions from FY${prevYear}`);
    } else {
      logger.warn(`[ReportExcel] ⚠️ F23: No fiscal year found for ${prevYear}, F23 column will be empty`);
    }
  } catch (err) {
    logger.warn(`[ReportExcel] ⚠️ F23: Failed to load previous year data:`, err);
  }

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

  // Récupérer les BilanCodes et valeurs (nécessaire pour provisions + Variation d'inventaire + cash balance)
  const bilanCodes = await getBilanCodes(clubId);
  const existingBilanValues = await getBilanValues(clubId, fiscalYear.id);
  const bilanValues = await calculateAllBilanValues(clubId, fiscalYear, existingBilanValues);
  const openingBankBalance = fiscalYear.opening_balances?.bank_current ?? 0;
  const closingBankBalance = fiscalYear.closing_balances?.bank_current;

  // Helper pour lire les bilanValues
  const getBilanVal = (code: string, field: 'openingValue' | 'closingValue'): number => {
    const bv = bilanValues.find(v => v.bilanCodeId === code);
    if (!bv) return 0;
    return round2(bv[field] ?? 0);
  };

  const sheet = workbook.addWorksheet('P&L courant par mois', {
    views: [{ state: 'frozen', ySplit: 6, xSplit: 2, showGridLines: false }]
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

  // 10. Ligne d'en-tête des colonnes (ligne 6 — officieel bestand)
  // A6=12, B6=date, E6='F23', F6-Q6=1-12, R6='YTD = 12', S6='Budget {year}', U6='Commentaires'
  const dataHeaderRow = sheet.getRow(6);
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

  // 11. P&L par mois data — zelfde rij-structuur als Résultats courant
  // Helper om een data-rij te schrijven met maandkolommen
  // Helper: get previous year YTD for a code (for F23 column in P&L)
  const getPrevYearYTD_PL = (code: string): number => {
    if (!prevYearCodeMonthlyMap || prevYearCodeMonthlyMap.size === 0) return 0;
    const monthly = prevYearCodeMonthlyMap.get(code) || new Array(12).fill(0);
    return round2(monthly.reduce((s, v) => s + v, 0));
  };

  const writePLRow = (rowNum: number, code: string | null, label: string,
    monthlyArr: number[] | null, ytd: number | null, budget: number | null,
    isBold = false, f23?: number | null) => {
    const row = sheet.getRow(rowNum);
    // f23 parameter: if provided, use it for col E. Otherwise fall back to ytd (backward compat for provisions)
    const colEValue = f23 !== undefined ? f23 : ytd;
    const vals: (string | number | null)[] = [
      null,                                                     // A
      code,                                                     // B: code
      label || null,                                            // C: label (null if empty)
      null,                                                     // D
      colEValue != null && colEValue !== 0 ? round2(colEValue) : null,  // E: F23 prev year
    ];
    if (monthlyArr) {
      for (let m = 0; m < 12; m++) vals.push(round2(monthlyArr[m])); // F-Q
    } else {
      for (let m = 0; m < 12; m++) vals.push(null);
    }
    vals.push(ytd != null ? round2(ytd) : null);               // R: YTD (keep 0)
    vals.push(budget != null && budget !== 0 ? round2(budget) : null); // S: Budget
    vals.push(null);                                             // T
    vals.push(null);                                             // U: Commentaires
    row.values = vals;
    for (let col = 5; col <= 19; col++) {
      row.getCell(col).numFmt = '#,##0.00';
      row.getCell(col).alignment = { horizontal: 'right' };
    }
    if (isBold) {
      row.eachCell(cell => { cell.font = { ...cell.font, bold: true }; });
    }
    row.height = 13.5;
  };

  let currentRow = 8;  // Data starts at row 8 (R7 is empty, like official)
  let totalPL_Monthly = new Array(12).fill(0);
  let totalPL_YTD = 0;

  // Provision data — zelfde logica als Résultats courant
  const year = fiscalYear.year;
  const prevYear = year - 1;
  const piscineProvOpening = getBilanVal('05.02', 'openingValue');
  const piscineProvClosing = getBilanVal('05.02', 'closingValue');
  const materielProvOpening = getBilanVal('05.01', 'openingValue');
  const materielProvClosing = getBilanVal('05.01', 'closingValue');

  // Régularisation sommen (voor Mouvements provisie) — monthly + YTD
  const regulCodes = ['490-00-631', '493-00-731', '490-00-635', '493-00-719', '493-00-735'];
  const regulMonthly = new Array(12).fill(0);
  let regulYTD = 0;
  for (const rc of regulCodes) {
    const monthly = codeMonthlyMap.get(rc);
    if (monthly) {
      for (let m = 0; m < 12; m++) regulMonthly[m] = round2(regulMonthly[m] + monthly[m]);
      regulYTD += monthly.reduce((s, v) => s + v, 0);
    }
  }
  regulYTD = round2(regulYTD);

  // Paiement année courante fait l'année précédente
  const paiementPrevOpening = getBilanVal('06.03', 'openingValue');

  // Provisie-rijen mapping: code → provisie rijen die erna komen
  // month: 0-11 = put value in that month column (F-Q), undefined = put in column E
  // monthlyArr: full 12-month distribution (used for Mouvements which span multiple months)
  // comment: optional text for column U
  type PLProvisionRow = { label: string; ytd: number; month?: number; monthlyArr?: number[]; comment?: string; alsoInE?: boolean };
  const provisionsByCode = new Map<string, PLProvisionRow[]>();

  // Na 610-00-622: provisie piscine
  const piscineProvs: PLProvisionRow[] = [];
  if (piscineProvOpening !== 0) {
    piscineProvs.push({ label: `Reprise Provision piscine faite en ${prevYear}`, ytd: piscineProvOpening, month: 0, comment: `Provision de ${prevYear}` });
  }
  if (piscineProvClosing !== 0) {
    piscineProvs.push({ label: `Provision pour location de piscine en ${year}`, ytd: -piscineProvClosing, month: 11, comment: `Provision pour ${Number(year) + 1}` });
  }
  if (piscineProvs.length > 0) provisionsByCode.set('610-00-622', piscineProvs);

  // Na 601-00-624: provisie matériel
  const materielProvs: PLProvisionRow[] = [];
  if (materielProvOpening !== 0) {
    materielProvs.push({ label: `Reprise Provision faite en ${prevYear} pour achat matériel`, ytd: materielProvOpening, month: 0, comment: `Provision de ${prevYear}` });
  }
  if (materielProvClosing !== 0) {
    materielProvs.push({ label: `Provision pour achat de matériel en ${year + 1}`, ytd: -materielProvClosing, month: 11, comment: `Provision pour ${Number(year) + 1}` });
  }
  if (materielProvs.length > 0) provisionsByCode.set('601-00-624', materielProvs);

  // Na 439-00-002: In Résultats courant staat hier "Reprise Prepaiement",
  // maar in P&L par mois is het een lege rij (separator) in het officieel bestand
  provisionsByCode.set('439-00-002', [{ label: '', ytd: 0 }]);

  // Na 493-00-735: Mouvements + Reprise mouvement
  // Mouvements: distributed across months (from regulMonthly), not a single month
  // Reprise mouvement: goes in column E (like YTD), not in a specific month
  const sortiesProvs: PLProvisionRow[] = [];
  sortiesProvs.push({
    label: `Mouvements ${year} affecté à ${year + 1}`,
    ytd: round2(-regulYTD),
    monthlyArr: regulMonthly.map((v: number) => round2(-v)),
    comment: `Provision pour ${Number(year) + 1}`
  });
  if (paiementPrevOpening !== 0) {
    sortiesProvs.push({
      label: `Reprise mouvement ${prevYear} Affecté ${year}`,
      ytd: paiementPrevOpening,
      month: 0, // Also put in January (F) column — official has value in BOTH E and F
      alsoInE: true, // Official has value in E, F AND R
      comment: `Provision de ${prevYear}`
    });
  }
  provisionsByCode.set('493-00-735', sortiesProvs);

  // Iterate groups — same order as Résultats courant
  const sortedGroups = [...groupsData].sort((a, b) => a.group.order - b.group.order);

  for (const gd of sortedGroups) {
    const groupMonthly = new Array(12).fill(0);
    let groupYTD = 0;
    let groupBudget = 0;

    // Write code rows + inline provisions
    for (const acc of gd.accounts) {
      writePLRow(currentRow, acc.code, acc.label, acc.monthlyAmounts, acc.ytd, acc.budget ?? 0);
      for (let m = 0; m < 12; m++) groupMonthly[m] = round2(groupMonthly[m] + acc.monthlyAmounts[m]);
      groupYTD = round2(groupYTD + acc.ytd);
      groupBudget = round2(groupBudget + (acc.budget ?? 0));
      currentRow++;

      // Inline provisie-rijen na specifieke codes
      const provRows = provisionsByCode.get(acc.code);
      if (provRows) {
        for (const prov of provRows) {
          if (prov.monthlyArr) {
            // Full monthly distribution (e.g., Mouvements) — use non-zero values only
            writePLRow(currentRow, null, prov.label, null, null, null);
            for (let m = 0; m < 12; m++) {
              if (prov.monthlyArr[m] !== 0) {
                const col = 6 + m;
                sheet.getCell(currentRow, col).value = prov.monthlyArr[m];
                sheet.getCell(currentRow, col).numFmt = '#,##0.00';
                sheet.getCell(currentRow, col).alignment = { horizontal: 'right' };
              }
            }
            // Column R = YTD
            sheet.getCell(currentRow, 18).value = prov.ytd;
            sheet.getCell(currentRow, 18).numFmt = '#,##0.00';
            sheet.getCell(currentRow, 18).alignment = { horizontal: 'right' };
            if (prov.comment) sheet.getCell(currentRow, 21).value = prov.comment;
          } else if (prov.month !== undefined && prov.ytd !== 0) {
            // Single month placement (e.g., provision piscine in Dec, reprise in Jan)
            writePLRow(currentRow, null, prov.label, null, null, null);
            const monthCol = 6 + prov.month;
            sheet.getCell(currentRow, monthCol).value = prov.ytd;
            sheet.getCell(currentRow, monthCol).numFmt = '#,##0.00';
            sheet.getCell(currentRow, monthCol).alignment = { horizontal: 'right' };
            // Optionally also set column E (col 5) — some provisions (e.g., Reprise mouvement) have value in E, month col, AND R
            if (prov.alsoInE) {
              sheet.getCell(currentRow, 5).value = prov.ytd;
              sheet.getCell(currentRow, 5).numFmt = '#,##0.00';
              sheet.getCell(currentRow, 5).alignment = { horizontal: 'right' };
            }
            // Also set column R (YTD) = same value
            sheet.getCell(currentRow, 18).value = prov.ytd;
            sheet.getCell(currentRow, 18).numFmt = '#,##0.00';
            sheet.getCell(currentRow, 18).alignment = { horizontal: 'right' };
            if (prov.comment) sheet.getCell(currentRow, 21).value = prov.comment;
          } else {
            // Regular provision row: value in column E (ytd)
            writePLRow(currentRow, null, prov.label, null, prov.ytd, null);
            if (prov.comment) sheet.getCell(currentRow, 21).value = prov.comment;
          }
          // Add provision monthly values to group totals
          if (prov.monthlyArr) {
            for (let m = 0; m < 12; m++) groupMonthly[m] = round2(groupMonthly[m] + prov.monthlyArr[m]);
          } else if (prov.month !== undefined && prov.ytd !== 0) {
            groupMonthly[prov.month] = round2(groupMonthly[prov.month] + prov.ytd);
          }
          groupYTD = round2(groupYTD + prov.ytd);
          currentRow++;
        }
      }
    }

    // Group subtotal row (bold) — always show budget value (even 0) for group subtotals
    writePLRow(currentRow, gd.group.name, '', groupMonthly, groupYTD, groupBudget !== 0 ? groupBudget : null, true);
    // Force budget=0 display for group subtotals when official shows 0
    if (groupBudget === 0) {
      sheet.getRow(currentRow).getCell(19).value = 0;
    }
    sheet.getRow(currentRow).height = 13.5;

    // Accumulate totals
    for (let m = 0; m < 12; m++) totalPL_Monthly[m] = round2(totalPL_Monthly[m] + groupMonthly[m]);
    totalPL_YTD = round2(totalPL_YTD + groupYTD);

    currentRow += 2; // Empty row after subtotal

    // Variation d'inventaire — na Soirée annuelle
    if (gd.group.id === 'soiree_annuelle') {
      const boutiqueCDCOpening = getBilanVal('02.01.01', 'openingValue');
      const boutiqueCDCClosing = getBilanVal('02.01.01', 'closingValue');
      const boutiqueLIFRASOpening = getBilanVal('02.01.02', 'openingValue');
      const boutiqueLIFRASClosing = getBilanVal('02.01.02', 'closingValue');
      const variationInv = round2(
        (boutiqueCDCClosing - boutiqueCDCOpening) + (boutiqueLIFRASClosing - boutiqueLIFRASOpening)
      );
      writePLRow(currentRow, null, `Variation d'inventaire (${year} - ${prevYear})`, null, variationInv, null);
      totalPL_YTD = round2(totalPL_YTD + variationInv);
      currentRow++; // No extra empty row — goes straight to Administration
    }
  }

  // 12. TOTAL P&L row
  const totalRow = sheet.getRow(currentRow);
  const totalVals: (string | number | null)[] = [
    null,                           // A
    'TOTAL P&L',                    // B
    null,                           // C
    null,                           // D
    round2(totalPL_YTD),            // E: F23 / YTD
  ];
  for (let m = 0; m < 12; m++) totalVals.push(round2(totalPL_Monthly[m]));
  totalVals.push(round2(totalPL_YTD));  // R
  totalVals.push(0);                     // S: Budget total (official shows 0)
  totalVals.push(null);                  // T
  totalVals.push(null);                  // U
  totalRow.values = totalVals;
  totalRow.eachCell(cell => applyTotalStyle(cell));
  for (let col = 5; col <= 19; col++) {
    totalRow.getCell(col).numFmt = '#,##0.00';
    totalRow.getCell(col).alignment = { horizontal: 'right' };
  }
  totalRow.height = 25;
  currentRow += 2;

  // ============================
  // BOTTOM SECTION: Cash Balance reconciliation with MONTHLY breakdowns
  // ============================
  if (openingBankBalance !== undefined) {
    // Provision data for monthly distribution
    let provAdj = 0;
    const repriseMatOpening = getBilanVal('05.01', 'openingValue');
    const reprisePiscOpening = getBilanVal('05.02', 'openingValue');
    const repriseRegulOpening = round2(
      getBilanVal('06.02', 'openingValue') + getBilanVal('06.03', 'openingValue')
    );
    const totalRepriseProvisions = round2(repriseMatOpening + reprisePiscOpening + repriseRegulOpening);

    // Build monthly provision arrays (12 months)
    // Reprise provisions: all in month 0 (January) — reprises from previous year
    const repriseMonthly = new Array(12).fill(0);
    repriseMonthly[0] = round2(-totalRepriseProvisions);

    // Provision piscine: all in month 11 (December) — provisioned for next year
    const piscineMonthly = new Array(12).fill(0);
    if (piscineProvClosing !== 0) piscineMonthly[11] = piscineProvClosing;

    // Provision matériel: all in month 11 (December)
    const materielMonthly = new Array(12).fill(0);
    if (materielProvClosing !== 0) materielMonthly[11] = materielProvClosing;

    // Mouvements provision: use regulMonthly computed above
    const mouvProvMonthly = new Array(12).fill(0);
    const mouvProv = round2(regulYTD);
    for (let m = 0; m < 12; m++) mouvProvMonthly[m] = round2(regulMonthly[m]);

    // Calculate monthly opening balance, balance théorique, and running sums
    const openingMonthly = new Array(12).fill(0);
    const mouvementMonthly = [...totalPL_Monthly]; // copy TOTAL P&L monthly
    const balTheorMonthly = new Array(12).fill(0);
    // Balance Banque monthly = running cumulative balance (same as Balance Théorique in official)
    const balBanqueMonthly = new Array(12).fill(0);
    const differenceMonthly = new Array(12).fill(0);

    for (let m = 0; m < 12; m++) {
      openingMonthly[m] = m === 0 ? round2(openingBankBalance) : balTheorMonthly[m - 1];
      const provTotal = round2(
        repriseMonthly[m] + piscineMonthly[m] + materielMonthly[m] + mouvProvMonthly[m]
      );
      balTheorMonthly[m] = round2(openingMonthly[m] + mouvementMonthly[m] + provTotal);
      // Balance Banque = same as Balance Théorique for each month (official has them equal)
      balBanqueMonthly[m] = balTheorMonthly[m];
      differenceMonthly[m] = 0;
    }

    // YTD totals for the summary column (R)
    const totalRepriseYTD = round2(-totalRepriseProvisions);
    const totalPiscineYTD = piscineProvClosing;
    const totalMaterielYTD = materielProvClosing;

    // Helper: write bottom section row — no col E (F23 doesn't apply), value goes to R only
    const writeBottomRow = (rowNum: number, label: string, monthlyArr: number[] | null,
      rValue: number | null, comment: string | null = null) => {
      writePLRow(rowNum, null, label, monthlyArr, null, null);
      // Set R (col 18) separately since writePLRow puts ytd in both E and R
      if (rValue != null && rValue !== 0) {
        sheet.getCell(rowNum, 18).value = round2(rValue);
        sheet.getCell(rowNum, 18).numFmt = '#,##0.00';
        sheet.getCell(rowNum, 18).alignment = { horizontal: 'right' };
      }
      // Column U (col 21) for comments
      if (comment) {
        sheet.getCell(rowNum, 21).value = comment;
      }
    };

    // R92: Opening Cash Balance
    writeBottomRow(currentRow, 'Opening Cash Balance', openingMonthly, round2(openingBankBalance));
    currentRow++;

    // R93: Total Mouvement
    const totalMouvYTD = round2(mouvementMonthly.reduce((s, v) => s + v, 0));
    writeBottomRow(currentRow, `Total Mouvement${year}`, mouvementMonthly, totalMouvYTD);
    currentRow++;

    // R94: Apport Cash Reserve
    writeBottomRow(currentRow, 'Apport Cash Reserve', null, null);
    currentRow++;

    // R95: Reprise provisions
    writeBottomRow(currentRow, `Reprise provisions ${year}`, repriseMonthly, totalRepriseYTD, `Provision de ${prevYear}`);
    provAdj += totalRepriseYTD;
    currentRow++;

    // R96: Provision piscine
    if (piscineProvClosing !== 0) {
      writeBottomRow(currentRow, `Provision pour location de piscine en ${year}`, piscineMonthly, totalPiscineYTD, `Provision pour ${year}`);
      provAdj += totalPiscineYTD;
      currentRow++;
    }

    // R97: Provision matériel
    if (materielProvClosing !== 0) {
      writeBottomRow(currentRow, `Provision pour achat de matériel en ${year + 1}`, materielMonthly, totalMaterielYTD, `Provision pour ${year}`);
      provAdj += totalMaterielYTD;
      currentRow++;
    }

    // R98: Mouvements provision
    writeBottomRow(currentRow, `Provision pour Mouvements ${year} affecté à ${year + 1}`, mouvProvMonthly, mouvProv, `Provision pour ${year}`);
    provAdj += mouvProv;
    currentRow++;

    // R99: Balance Théorique
    const balanceTheorique = round2(openingBankBalance + totalPL_YTD + provAdj);
    writeBottomRow(currentRow, `Balance Theorique ${year}`, balTheorMonthly, balanceTheorique);
    currentRow++;

    // R100: Balance Banque
    if (closingBankBalance !== undefined) {
      writeBottomRow(currentRow, 'Balance Banque', balBanqueMonthly, round2(closingBankBalance));
      currentRow++;
      writeBottomRow(currentRow, 'Difference', differenceMonthly, round2(closingBankBalance - balanceTheorique));
    } else {
      writeBottomRow(currentRow, 'Balance Banque', null, null);
      currentRow++;
      writeBottomRow(currentRow, 'Difference', null, null);
    }
  }

  // 14. (BilanCodes/BilanValues moved earlier — before P&L par mois)

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
  addValidationsSheetFull(workbook, fiscalYear, codeMonthlyMap, allGroupCodes, totalPL_YTD);

  // 19. Bank Balance courant (soldes mensuels)
  addBankBalanceSheet(workbook, fiscalYear, transactions);

  // 20. CC Utilisés (codes comptables utilisés)
  addCCUtilisesSheet(workbook, rawCodeMonthlyMap);

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
  addResultatsCourantSheet(workbook, fiscalYear, codeMonthlyMap, fiscalYearStart, groups, openingBankBalance, closingBankBalance, bilanValues, prevYearCodeMonthlyMap);

  // 24b. Inventaire non valorisé (résumé inventaire matériel)
  addInventaireSheet(workbook, fiscalYear.year);

  // 24c. Ʃ activité (pivot transactions par activité)
  addSommeActiviteSheet(workbook, transactions);

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
  addBudgetNextYearSheet(workbook, fiscalYear, groupsData, fiscalYearStart, openingBankBalance, closingBankBalance, bilanValues);

  // ============================================================
  // PHASE 5: Réordonner les onglets selon l'ordre officiel
  // ============================================================
  const sheetOrder = [
    'Budget Next Year',
    'Bilan courant',
    'Résultats courant',
    'P&L courant par mois',
    'Inventaire non valorisé',
    'Validations',
    'Bank Balance courant',
    'CC Utilisés',
    'Ʃ activité',
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
