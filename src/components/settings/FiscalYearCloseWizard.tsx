import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  Loader2,
  Lock,
  ShieldCheck,
  Wallet,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { BilanCode, BilanValues, FiscalYear, TransactionBancaire } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { FiscalYearService } from '@/services/fiscalYearService';
import { BoutiqueStockService } from '@/services/boutiqueStockService';
import { InventoryValueSnapshotService } from '@/services/inventoryValueSnapshotService';
import { getBilanCodes } from '@/services/bilanCodeService';
import { calculateAllBilanValues, getBilanValues, saveBilanValues } from '@/services/bilanMappingService';
import { cn, formatDate, formatMontant } from '@/utils/utils';
import { logger } from '@/utils/logger';

interface FiscalYearCloseWizardProps {
  fiscalYear: FiscalYear;
  isOpen: boolean;
  onClose: () => void;
  onCompleted?: () => Promise<void> | void;
}

type WizardStepId = 'preparation' | 'banques' | 'stocks' | 'bilan' | 'validation';

interface WizardStep {
  id: WizardStepId;
  label: string;
  description: string;
}

interface StepGuide {
  documents: string[];
  actions: string[];
  control: string;
}

interface SnapshotStatusCard {
  key: 'boutique' | 'boutique_lifras' | 'inventory';
  title: string;
  description: string;
  value: number;
  hasSnapshot: boolean;
  isLocked: boolean;
  snapshotId?: string;
  canCreate: boolean;
}

interface WizardDraft {
  accountCurrent: string;
  accountSavings: string;
  openingCurrent: string;
  openingSavings: string;
  notes: string;
  balanceSheet: {
    stockCdc: string;
    stockBoutique: string;
    stockBoutiqueLifras: string;
    obligations: string;
    chargesReportees: string;
    assuranceReportee: string;
    resultatReporte: string;
    fondsAffectes: string;
    provisionEntretien: string;
    provisionPiscine: string;
    cotisationsReportees: string;
    sortiesReportees: string;
    paiementsAnneeSuivante: string;
  };
}

interface BankSummary {
  current: number;
  savings: number;
  currentTransactions: number;
  savingsTransactions: number;
  unreconciledTransactions: number;
}

interface WizardBilanRow {
  code: string;
  label: string;
  reference?: number;
  closing?: number;
  source: string;
  status: string;
}

const STEPS: WizardStep[] = [
  {
    id: 'preparation',
    label: 'Préparation',
    description: 'Vérifier que l’exercice est prêt à être clôturé.'
  },
  {
    id: 'banques',
    label: 'Banques',
    description: 'Confirmer les IBAN et les soldes de départ.'
  },
  {
    id: 'stocks',
    label: 'Stocks et matériel',
    description: 'Créer et verrouiller les clôtures de stock et de matériel.'
  },
  {
    id: 'bilan',
    label: 'Bilan manuel',
    description: 'Confirmer toutes les valeurs manuelles nécessaires à l’export.'
  },
  {
    id: 'validation',
    label: 'Validation',
    description: 'Bloquants, avertissements et clôture finale.'
  }
];

const STEP_GUIDES: Record<WizardStepId, StepGuide> = {
  preparation: {
    documents: [
      'Le relevé bancaire de fin d’exercice.',
      'La liste des opérations exceptionnelles encore en discussion.',
      'Les décisions du comité qui ont un impact comptable.'
    ],
    actions: [
      'Vérifiez les blocages techniques remontés ci-dessous.',
      'Confirmez que l’exercice est bien terminé et encore ouvert.',
      'Repérez les avertissements qui devront être expliqués à l’expert-comptable.'
    ],
    control: 'Un blocage rouge doit être traité avant de pouvoir clôturer de manière certifiée.'
  },
  banques: {
    documents: [
      'Le relevé du compte courant au 31/12.',
      'Le relevé du compte épargne au 31/12.',
      'Les IBAN exacts utilisés dans l’import bancaire.'
    ],
    actions: [
      'Confirmez les IBAN des comptes suivis par CaliCompta.',
      'Vérifiez les soldes d’ouverture reportés.',
      'Comparez le solde calculé avec le relevé bancaire.'
    ],
    control: 'Si le solde calculé ne correspond pas au relevé, stoppez ici et corrigez les transactions avant la clôture.'
  },
  stocks: {
    documents: [
      'Le comptage boutique club.',
      'Le comptage boutique LIFRAS.',
      'La clôture matériel/amortissements.'
    ],
    actions: [
      'Créez un snapshot s’il n’existe pas encore.',
      'Vérifiez la valeur calculée.',
      'Verrouillez chaque clôture retenue dans le bilan.'
    ],
    control: 'Une valeur non nulle doit provenir d’une clôture verrouillée pour être certifiée.'
  },
  bilan: {
    documents: [
      'Le brouillon de bilan de l’exercice.',
      'Les décisions de provisions et fonds affectés.',
      'Les justificatifs des charges ou produits à reporter.'
    ],
    actions: [
      'Saisissez explicitement chaque rubrique manuelle.',
      'Encodez 0,00 quand la rubrique ne s’applique pas.',
      'Laissez une note si une valeur demande une explication future.'
    ],
    control: 'Un champ vide est considéré comme non confirmé; un zéro explicite est accepté.'
  },
  validation: {
    documents: [
      'La checklist de clôture complète.',
      'Les relevés bancaires validés.',
      'Les snapshots verrouillés et le bilan manuel enregistré.'
    ],
    actions: [
      'Traitez tous les bloquants restants.',
      'Lisez les avertissements et décidez s’ils sont acceptables.',
      'Lancez ensuite la clôture finale.'
    ],
    control: 'La clôture finale ne doit être lancée qu’une fois tous les bloquants levés.'
  }
};

const MANUAL_BALANCE_FIELDS: Array<{
  key: keyof WizardDraft['balanceSheet'];
  label: string;
  hint: string;
  whereToFind: string;
  control: string;
  example: string;
  section: 'actif' | 'regularisation' | 'fonds' | 'provisions';
}> = [
  {
    key: 'stockCdc',
    label: 'Stock C.D.C.',
    hint: 'Saisissez explicitement 0,00 si aucun stock C.D.C. ne doit apparaître au bilan.',
    whereToFind: 'Sur le comptage manuel spécifique C.D.C. ou dans la validation comptable de fin d’année.',
    control: 'Le montant doit correspondre à la valeur retenue par le club à la date de clôture.',
    example: 'Exemple: 0,00 si aucun stock C.D.C. n’est repris au bilan.',
    section: 'actif'
  },
  {
    key: 'obligations',
    label: 'Obligations / Dette belge',
    hint: 'Montant des placements encore détenus à la date de clôture.',
    whereToFind: 'Sur les extraits d’investissement ou le relevé de portefeuille de fin d’exercice.',
    control: 'Ne reprenez que les placements encore existants au 31/12.',
    example: 'Exemple: 10 000,00 si une obligation est encore détenue à la clôture.',
    section: 'actif'
  },
  {
    key: 'chargesReportees',
    label: 'Charges à reporter',
    hint: 'Dépenses payées cette année mais qui concernent l’exercice suivant.',
    whereToFind: 'Sur les factures ou assurances déjà payées couvrant une période N+1.',
    control: 'Le montant doit couvrir uniquement la partie relative à l’exercice suivant.',
    example: 'Exemple: 320,00 de cotisation ou location déjà payée pour l’année suivante.',
    section: 'regularisation'
  },
  {
    key: 'assuranceReportee',
    label: 'Assurance reportée',
    hint: 'Part d’assurance déjà payée mais relative à l’année suivante.',
    whereToFind: 'Sur le contrat d’assurance et la facture annuelle correspondante.',
    control: 'Ne reprenez que la quote-part qui couvre N+1.',
    example: 'Exemple: 450,00 si 3 mois d’assurance appartiennent à l’exercice suivant.',
    section: 'regularisation'
  },
  {
    key: 'resultatReporte',
    label: 'Résultat reporté',
    hint: 'Reprenez le résultat reporté validé à la clôture précédente.',
    whereToFind: 'Sur le bilan approuvé de l’exercice précédent.',
    control: 'Le montant doit correspondre exactement à la valeur approuvée l’an dernier.',
    example: 'Exemple: 43 422,59 repris du bilan N-1.',
    section: 'fonds'
  },
  {
    key: 'fondsAffectes',
    label: 'Fonds affectés',
    hint: 'Montant décidé par le comité ou l’expert-comptable.',
    whereToFind: 'Dans la décision du comité ou la note de clôture préparée avec l’expert-comptable.',
    control: 'N’encodez que ce qui a été formellement décidé.',
    example: 'Exemple: 2 500,00 affectés à un projet précis du club.',
    section: 'fonds'
  },
  {
    key: 'provisionEntretien',
    label: 'Provision entretien matériel',
    hint: 'Réserve décidée pour l’entretien futur du matériel.',
    whereToFind: 'Dans le budget d’entretien futur ou la décision de réserve validée par le comité.',
    control: 'La provision doit être cohérente avec les coûts futurs identifiés.',
    example: 'Exemple: 1 500,00 mis en réserve pour entretien/révision matériel.',
    section: 'provisions'
  },
  {
    key: 'provisionPiscine',
    label: 'Provision piscine',
    hint: 'Montant mis de côté pour des coûts de piscine futurs.',
    whereToFind: 'Dans la décision budgétaire ou la projection des locations piscine futures.',
    control: 'Ne reprenez que la part réellement décidée comme provision.',
    example: 'Exemple: 2 000,00 réservés pour l’augmentation prévue des couloirs.',
    section: 'provisions'
  },
  {
    key: 'cotisationsReportees',
    label: 'Cotisations reportées',
    hint: 'Cotisations encaissées cette année mais qui concernent l’exercice suivant.',
    whereToFind: 'Dans les encaissements de cotisations couvrant explicitement l’année suivante.',
    control: 'Ne reprenez que la part liée à N+1.',
    example: 'Exemple: 600,00 de cotisations déjà encaissées pour l’exercice suivant.',
    section: 'provisions'
  },
  {
    key: 'sortiesReportees',
    label: 'Sorties reportées',
    hint: 'Produits reçus cette année pour des sorties de l’année suivante.',
    whereToFind: 'Dans les acomptes reçus pour des sorties ou événements prévus l’année suivante.',
    control: 'Le total doit correspondre aux encaissements affectés à N+1.',
    example: 'Exemple: 1 200,00 d’acomptes pour une sortie de mars prochain.',
    section: 'provisions'
  },
  {
    key: 'paiementsAnneeSuivante',
    label: 'Paiements année suivante',
    hint: 'Paiements N relatifs à des charges ou produits de N+1.',
    whereToFind: 'Dans les opérations de régularisation identifiées avec l’expert-comptable.',
    control: 'Le montant doit être documenté et justifiable par une pièce ou une décision.',
    example: 'Exemple: 875,00 payés en N mais à rattacher à N+1.',
    section: 'provisions'
  }
];

const BILAN_SECTIONS: Array<{
  key: 'actif' | 'regularisation' | 'fonds' | 'provisions';
  label: string;
}> = [
  { key: 'actif', label: 'Actif' },
  { key: 'regularisation', label: 'Comptes de régularisation' },
  { key: 'fonds', label: 'Fonds propres' },
  { key: 'provisions', label: 'Provisions et reports' }
];

const BALANCE_FIELD_TO_CODE: Record<keyof WizardDraft['balanceSheet'], string> = {
  stockCdc: '02.01',
  stockBoutique: '02.01.01',
  stockBoutiqueLifras: '02.01.02',
  obligations: '02.04',
  chargesReportees: '03.01',
  assuranceReportee: '03.02',
  resultatReporte: '04.01',
  fondsAffectes: '04.02.01',
  provisionEntretien: '05.01',
  provisionPiscine: '05.02',
  cotisationsReportees: '06.01',
  sortiesReportees: '06.02',
  paiementsAnneeSuivante: '06.03'
};

const CODE_TO_BALANCE_PATH: Record<string, string> = {
  '02.01': 'assets.stock_cdc',
  '02.01.01': 'assets.stock_boutique',
  '02.01.02': 'assets.stock_boutique_lifras',
  '02.04': 'assets.obligations',
  '03.01': 'assets.charges_reportees',
  '03.02': 'assets.assurance_reportee',
  '04.01': 'liabilities.resultat_reporte',
  '04.02.01': 'liabilities.fonds_affectes',
  '04.03': 'liabilities.resultat_exercice',
  '05.01': 'liabilities.provision_entretien',
  '05.02': 'liabilities.provision_piscine',
  '06.01': 'liabilities.cotisations_reportees',
  '06.02': 'liabilities.sorties_reportees',
  '06.03': 'liabilities.paiements_annee_suivante'
};

const AUTO_BILAN_CODES: Array<{
  code: string;
  fallbackLabel: string;
  source: string;
  stockKey?: SnapshotStatusCard['key'];
}> = [
  {
    code: '01.01',
    fallbackLabel: 'Stock matériel (pour mémoire)',
    source: 'Calculé depuis la clôture matériel',
    stockKey: 'inventory'
  },
  {
    code: '02.01.01',
    fallbackLabel: 'Boutique club',
    source: 'Calculé depuis la clôture boutique',
    stockKey: 'boutique'
  },
  {
    code: '02.01.02',
    fallbackLabel: 'Boutique LIFRAS',
    source: 'Calculé depuis la clôture boutique LIFRAS',
    stockKey: 'boutique_lifras'
  },
  {
    code: '04.03',
    fallbackLabel: "Résultat de l'exercice",
    source: 'Calculé automatiquement à partir du P&L'
  }
];

function formatInputNumber(value?: number): string {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return '';
  }

  return String(Math.round(value * 100) / 100);
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') {
    return undefined;
  }

  const parsed = Number(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getNestedNumber(obj: unknown, path: string): number | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in (current as Record<string, unknown>))) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return typeof current === 'number' && Number.isFinite(current) ? current : undefined;
}

function getFiscalYearBalanceSheetCodeMap(fiscalYear?: FiscalYear | null): Map<string, number> {
  const result = new Map<string, number>();
  if (!fiscalYear?.balance_sheet) {
    return result;
  }

  for (const [code, path] of Object.entries(CODE_TO_BALANCE_PATH)) {
    const value = getNestedNumber(fiscalYear.balance_sheet, path);
    if (value !== undefined) {
      result.set(code, value);
    }
  }

  return result;
}

function fiscalYearStatusRank(status: FiscalYear['status']): number {
  if (status === 'permanently_closed') return 3;
  if (status === 'closed') return 2;
  return 1;
}

function selectPreviousFiscalYear(fiscalYears: FiscalYear[], year: number): FiscalYear | null {
  const previousYear = year - 1;
  const candidates = fiscalYears.filter(fiscalYear =>
    fiscalYear.year === previousYear && fiscalYear.status !== 'open'
  );

  if (candidates.length === 0) {
    return null;
  }

  return [...candidates].sort((left, right) => {
    const statusDiff = fiscalYearStatusRank(right.status) - fiscalYearStatusRank(left.status);
    if (statusDiff !== 0) return statusDiff;

    const updatedLeft = left.updated_at instanceof Date ? left.updated_at.getTime() : 0;
    const updatedRight = right.updated_at instanceof Date ? right.updated_at.getTime() : 0;
    if (updatedRight !== updatedLeft) return updatedRight - updatedLeft;

    return left.id.localeCompare(right.id);
  })[0] || null;
}

function upsertBilanClosingValue(
  valuesMap: Map<string, BilanValues>,
  code: string,
  closingValue: number,
  isManualClosing: boolean
): void {
  const existing = valuesMap.get(code);
  if (existing) {
    valuesMap.set(code, {
      ...existing,
      closingValue,
      isManualClosing
    });
    return;
  }

  valuesMap.set(code, {
    bilanCodeId: code,
    openingValue: 0,
    closingValue,
    isManualOpening: false,
    isManualClosing
  });
}

function buildDraft(fiscalYear: FiscalYear, snapshotValues: Pick<WizardDraft['balanceSheet'], 'stockBoutique' | 'stockBoutiqueLifras'>): WizardDraft {
  return {
    accountCurrent: fiscalYear.account_numbers?.bank_current || '',
    accountSavings: fiscalYear.account_numbers?.bank_savings || '',
    openingCurrent: formatInputNumber(fiscalYear.opening_balances.bank_current),
    openingSavings: formatInputNumber(fiscalYear.opening_balances.bank_savings),
    notes: fiscalYear.notes || '',
    balanceSheet: {
      stockCdc: formatInputNumber(fiscalYear.balance_sheet?.assets?.stock_cdc),
      stockBoutique: snapshotValues.stockBoutique,
      stockBoutiqueLifras: snapshotValues.stockBoutiqueLifras,
      obligations: formatInputNumber(fiscalYear.balance_sheet?.assets?.obligations),
      chargesReportees: formatInputNumber(fiscalYear.balance_sheet?.assets?.charges_reportees),
      assuranceReportee: formatInputNumber(fiscalYear.balance_sheet?.assets?.assurance_reportee),
      resultatReporte: formatInputNumber(fiscalYear.balance_sheet?.liabilities?.resultat_reporte),
      fondsAffectes: formatInputNumber(fiscalYear.balance_sheet?.liabilities?.fonds_affectes),
      provisionEntretien: formatInputNumber(fiscalYear.balance_sheet?.liabilities?.provision_entretien),
      provisionPiscine: formatInputNumber(fiscalYear.balance_sheet?.liabilities?.provision_piscine),
      cotisationsReportees: formatInputNumber(fiscalYear.balance_sheet?.liabilities?.cotisations_reportees),
      sortiesReportees: formatInputNumber(fiscalYear.balance_sheet?.liabilities?.sorties_reportees),
      paiementsAnneeSuivante: formatInputNumber(fiscalYear.balance_sheet?.liabilities?.paiements_annee_suivante)
    }
  };
}

function calculateBalance(openingBalance: number, transactions: TransactionBancaire[]): number {
  return transactions.reduce((total, transaction) => {
    if (transaction.is_parent) {
      return total;
    }
    return total + transaction.montant;
  }, openingBalance);
}

function mergeDraftWithFreshData(previousDraft: WizardDraft, freshDraft: WizardDraft): WizardDraft {
  return {
    ...previousDraft,
    balanceSheet: {
      ...previousDraft.balanceSheet,
      stockBoutique: freshDraft.balanceSheet.stockBoutique,
      stockBoutiqueLifras: freshDraft.balanceSheet.stockBoutiqueLifras
    }
  };
}

function getStepIndex(stepId: WizardStepId): number {
  return STEPS.findIndex(step => step.id === stepId);
}

function normalizeWizardStateForCompare(state?: FiscalYear['closing_wizard']): string {
  if (!state) {
    return '';
  }

  const { last_saved_at: _ignoredTimestamp, ...rest } = state;
  return JSON.stringify(rest);
}

export function FiscalYearCloseWizard({
  fiscalYear,
  isOpen,
  onClose,
  onCompleted
}: FiscalYearCloseWizardProps) {
  const navigate = useNavigate();
  const { clubId, user } = useAuth();
  const lastPersistedWizardRef = useRef<string>('');

  const [selectedStep, setSelectedStep] = useState<WizardStepId>('preparation');
  const [workingFiscalYear, setWorkingFiscalYear] = useState<FiscalYear>(fiscalYear);
  const [draft, setDraft] = useState<WizardDraft>(() => buildDraft(fiscalYear, {
    stockBoutique: formatInputNumber(fiscalYear.balance_sheet?.assets?.stock_boutique),
    stockBoutiqueLifras: formatInputNumber(fiscalYear.balance_sheet?.assets?.stock_boutique_lifras)
  }));
  const [loading, setLoading] = useState(false);
  const [savingBanks, setSavingBanks] = useState(false);
  const [savingBalanceSheet, setSavingBalanceSheet] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [bankSummary, setBankSummary] = useState<BankSummary | null>(null);
  const [stockCards, setStockCards] = useState<SnapshotStatusCard[]>([]);
  const [rawCloseReasons, setRawCloseReasons] = useState<string[]>([]);
  const [bilanCodes, setBilanCodes] = useState<BilanCode[]>([]);
  const [calculatedBilanValues, setCalculatedBilanValues] = useState<BilanValues[]>([]);
  const [previousFiscalYear, setPreviousFiscalYear] = useState<FiscalYear | null>(null);

  const loadData = async (preserveDraft = false) => {
    if (!clubId) {
      return;
    }

    try {
      setLoading(true);

      const freshFiscalYear = await FiscalYearService.getFiscalYearById(clubId, fiscalYear.id);
      if (!freshFiscalYear) {
        throw new Error('Exercice introuvable');
      }

      const [
        allTransactions,
        currentTransactions,
        savingsTransactions,
        canCloseResult,
        boutiqueSnapshot,
        lifrasSnapshot,
        inventorySnapshot,
        boutiqueValue,
        lifrasValue,
        inventoryValue,
        loadedBilanCodes,
        existingBilanValues,
        allFiscalYears
      ] = await Promise.all([
        FiscalYearService.getTransactionsForFiscalYear(clubId, freshFiscalYear),
        FiscalYearService.getTransactionsForFiscalYear(clubId, freshFiscalYear, 'current'),
        FiscalYearService.getTransactionsForFiscalYear(clubId, freshFiscalYear, 'savings'),
        FiscalYearService.canCloseFiscalYear(clubId, freshFiscalYear),
        BoutiqueStockService.getSnapshotByYearAndType(clubId, freshFiscalYear.year, 'boutique'),
        BoutiqueStockService.getSnapshotByYearAndType(clubId, freshFiscalYear.year, 'boutique_lifras'),
        InventoryValueSnapshotService.getSnapshotByYear(clubId, freshFiscalYear.year),
        BoutiqueStockService.getValueForBilan(clubId, freshFiscalYear.year, 'boutique'),
        BoutiqueStockService.getValueForBilan(clubId, freshFiscalYear.year, 'boutique_lifras'),
        InventoryValueSnapshotService.getValueForBilan(clubId, freshFiscalYear.year),
        getBilanCodes(clubId),
        getBilanValues(clubId, freshFiscalYear.id),
        FiscalYearService.getFiscalYears(clubId)
      ]);
      const calculatedValues = await calculateAllBilanValues(clubId, freshFiscalYear, existingBilanValues);
      const previousYear = selectPreviousFiscalYear(allFiscalYears, freshFiscalYear.year);

      setWorkingFiscalYear(freshFiscalYear);
      setRawCloseReasons(canCloseResult.reasons);
      setBilanCodes(loadedBilanCodes);
      setCalculatedBilanValues(calculatedValues);
      setPreviousFiscalYear(previousYear);
      setBankSummary({
        current: calculateBalance(freshFiscalYear.opening_balances.bank_current, currentTransactions),
        savings: calculateBalance(freshFiscalYear.opening_balances.bank_savings, savingsTransactions),
        currentTransactions: currentTransactions.filter(transaction => !transaction.is_parent).length,
        savingsTransactions: savingsTransactions.filter(transaction => !transaction.is_parent).length,
        unreconciledTransactions: allTransactions.filter(transaction => !transaction.is_parent && !transaction.reconcilie).length
      });

      setStockCards([
        {
          key: 'boutique',
          title: 'Boutique club',
          description: 'Valeur utilisée dans l’actif du bilan.',
          value: boutiqueValue.value,
          hasSnapshot: boutiqueValue.hasSnapshot,
          isLocked: boutiqueValue.isLocked,
          snapshotId: boutiqueSnapshot?.id,
          canCreate: true
        },
        {
          key: 'boutique_lifras',
          title: 'Boutique LIFRAS',
          description: 'Clôture spécifique du stock LIFRAS.',
          value: lifrasValue.value,
          hasSnapshot: lifrasValue.hasSnapshot,
          isLocked: lifrasValue.isLocked,
          snapshotId: lifrasSnapshot?.id,
          canCreate: true
        },
        {
          key: 'inventory',
          title: 'Matériel',
          description: 'Valeur amortie du matériel pour le bilan.',
          value: inventoryValue.value,
          hasSnapshot: inventoryValue.hasSnapshot,
          isLocked: inventoryValue.isLocked,
          snapshotId: inventorySnapshot?.id,
          canCreate: inventoryValue.value > 0 || !!inventorySnapshot
        }
      ]);

      const freshDraft = buildDraft(freshFiscalYear, {
        stockBoutique: formatInputNumber(boutiqueValue.value),
        stockBoutiqueLifras: formatInputNumber(lifrasValue.value)
      });

      if (!preserveDraft) {
        setSelectedStep(freshFiscalYear.closing_wizard?.current_step || 'preparation');
      }

      lastPersistedWizardRef.current = normalizeWizardStateForCompare(freshFiscalYear.closing_wizard);
      setDraft(previousDraft => preserveDraft ? mergeDraftWithFreshData(previousDraft, freshDraft) : freshDraft);
    } catch (error) {
      logger.error('Erreur lors du chargement de l’assistant de clôture:', error);
      toast.error('Impossible de charger l’assistant de clôture');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setSelectedStep('preparation');
    void loadData(false);
  }, [isOpen, fiscalYear.id]);

  const manualMissingFields = useMemo(() => {
    return MANUAL_BALANCE_FIELDS.filter(field => draft.balanceSheet[field.key].trim() === '');
  }, [draft]);

  const blockingReasons = useMemo(() => {
    const reasons: string[] = [];

    if (workingFiscalYear.status !== 'open') {
      reasons.push('L’exercice sélectionné n’est plus ouvert.');
    }

    if (draft.openingCurrent.trim() === '' || draft.openingSavings.trim() === '') {
      reasons.push('Les soldes d’ouverture des comptes doivent être confirmés dans l’étape « Banques ».');
    }

    const hardServiceReasons = rawCloseReasons.filter(reason => !reason.includes('avertissement'));
    reasons.push(...hardServiceReasons);

    stockCards.forEach(card => {
      const shouldBlock = card.value > 0 || card.hasSnapshot;
      if (shouldBlock && !card.isLocked) {
        reasons.push(`La clôture « ${card.title} » n’est pas verrouillée.`);
      }
    });

    manualMissingFields.forEach(field => {
      reasons.push(`Le champ « ${field.label} » n’a pas encore été confirmé.`);
    });

    return Array.from(new Set(reasons));
  }, [draft.openingCurrent, draft.openingSavings, manualMissingFields, rawCloseReasons, stockCards, workingFiscalYear.status]);

  const warnings = useMemo(() => {
    const messages: string[] = [];

    rawCloseReasons
      .filter(reason => reason.includes('avertissement'))
      .forEach(reason => messages.push(reason));

    if (!draft.accountCurrent.trim()) {
      messages.push('L’IBAN du compte courant n’est pas renseigné.');
    }

    if (!draft.accountSavings.trim()) {
      messages.push('L’IBAN du compte épargne n’est pas renseigné.');
    }

    stockCards.forEach(card => {
      if (card.value === 0 && !card.isLocked) {
        messages.push(`La clôture « ${card.title} » n’est pas verrouillée, mais sa valeur est actuellement à 0,00 €.`);
      }
    });

    return Array.from(new Set(messages));
  }, [draft.accountCurrent, draft.accountSavings, rawCloseReasons, stockCards]);

  const bilanCodeMap = useMemo(() => {
    return new Map(bilanCodes.map(code => [code.id, code]));
  }, [bilanCodes]);

  const calculatedBilanMap = useMemo(() => {
    return new Map(calculatedBilanValues.map(value => [value.bilanCodeId, value]));
  }, [calculatedBilanValues]);

  const previousBalanceSheetCodeMap = useMemo(() => {
    return getFiscalYearBalanceSheetCodeMap(previousFiscalYear);
  }, [previousFiscalYear]);

  const stockCardMap = useMemo(() => {
    return new Map(stockCards.map(card => [card.key, card]));
  }, [stockCards]);

  const automaticBilanRows = useMemo<WizardBilanRow[]>(() => {
    return AUTO_BILAN_CODES.map(item => {
      const codeMeta = bilanCodeMap.get(item.code);
      const linkedCard = item.stockKey ? stockCardMap.get(item.stockKey) : undefined;
      const calculated = calculatedBilanMap.get(item.code);
      const closing = linkedCard ? linkedCard.value : calculated?.closingValue ?? 0;
      const reference = previousBalanceSheetCodeMap.get(item.code);

      let status = 'Calculé automatiquement';
      if (linkedCard) {
        if (linkedCard.isLocked) {
          status = 'Clôture verrouillée';
        } else if (linkedCard.hasSnapshot) {
          status = 'Snapshot existant, à verrouiller';
        } else {
          status = 'Valeur live, pas encore verrouillée';
        }
      }

      return {
        code: item.code,
        label: codeMeta?.name || item.fallbackLabel,
        reference,
        closing,
        source: item.source,
        status
      };
    });
  }, [bilanCodeMap, calculatedBilanMap, previousBalanceSheetCodeMap, stockCardMap]);

  const manualBilanRows = useMemo<WizardBilanRow[]>(() => {
    return MANUAL_BALANCE_FIELDS.map(field => {
      const code = BALANCE_FIELD_TO_CODE[field.key];
      const codeMeta = bilanCodeMap.get(code);
      const closing = parseOptionalNumber(draft.balanceSheet[field.key]);

      return {
        code,
        label: codeMeta?.name || field.label,
        reference: previousBalanceSheetCodeMap.get(code),
        closing,
        source: "Confirmé dans l'assistant de clôture",
        status: closing === undefined ? 'À confirmer' : 'Confirmé'
      };
    });
  }, [bilanCodeMap, calculatedBilanMap, draft.balanceSheet, previousBalanceSheetCodeMap]);

  const stepStatuses = useMemo<Record<WizardStepId, 'done' | 'current' | 'todo'>>(() => {
    const bankReady = draft.openingCurrent.trim() !== '' && draft.openingSavings.trim() !== '';
    const stocksReady = stockCards.every(card => card.isLocked || card.value === 0);
    const manualReady = manualMissingFields.length === 0;
    const validationReady = blockingReasons.length === 0;

    return {
      preparation: rawCloseReasons.filter(reason => !reason.includes('avertissement')).length === 0 ? 'done' : 'todo',
      banques: bankReady ? 'done' : 'todo',
      stocks: stocksReady ? 'done' : 'todo',
      bilan: manualReady ? 'done' : 'todo',
      validation: validationReady ? 'done' : 'todo'
    };
  }, [blockingReasons.length, draft.openingCurrent, draft.openingSavings, manualMissingFields.length, rawCloseReasons, stockCards]);

  const persistedWizardState = useMemo<NonNullable<FiscalYear['closing_wizard']>>(() => {
    const now = new Date().toISOString();
    const mapStatus = (stepId: WizardStepId): 'todo' | 'in_progress' | 'done' => {
      if (stepStatuses[stepId] === 'done') {
        return 'done';
      }

      if (selectedStep === stepId) {
        return 'in_progress';
      }

      return 'todo';
    };

    return {
      version: 1,
      current_step: selectedStep,
      last_saved_at: now,
      blocking_reasons: blockingReasons,
      warning_messages: warnings,
      steps: {
        preparation: {
          status: mapStatus('preparation'),
          updated_at: now,
          completed_at: mapStatus('preparation') === 'done' ? now : undefined
        },
        banques: {
          status: mapStatus('banques'),
          updated_at: now,
          completed_at: mapStatus('banques') === 'done' ? now : undefined
        },
        stocks: {
          status: mapStatus('stocks'),
          updated_at: now,
          completed_at: mapStatus('stocks') === 'done' ? now : undefined
        },
        bilan: {
          status: mapStatus('bilan'),
          updated_at: now,
          completed_at: mapStatus('bilan') === 'done' ? now : undefined
        },
        validation: {
          status: mapStatus('validation'),
          updated_at: now,
          completed_at: mapStatus('validation') === 'done' ? now : undefined
        }
      }
    };
  }, [blockingReasons, selectedStep, stepStatuses, warnings]);

  useEffect(() => {
    if (!isOpen || loading || !clubId) {
      return;
    }

    const normalizedState = normalizeWizardStateForCompare(persistedWizardState);
    if (normalizedState === lastPersistedWizardRef.current) {
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        await FiscalYearService.updateFiscalYear(clubId, workingFiscalYear.id, {
          closing_wizard: persistedWizardState
        });
        lastPersistedWizardRef.current = normalizedState;
      } catch (error) {
        logger.error('Erreur lors de la sauvegarde du progrès de clôture:', error);
      }
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [clubId, isOpen, loading, persistedWizardState, workingFiscalYear.id]);

  if (!isOpen) {
    return null;
  }

  const selectedStepIndex = getStepIndex(selectedStep);
  const canGoBack = selectedStepIndex > 0;
  const canGoNext = selectedStepIndex < STEPS.length - 1;

  const goToNextStep = () => {
    if (!canGoNext) {
      return;
    }
    setSelectedStep(STEPS[selectedStepIndex + 1].id);
  };

  const goToPreviousStep = () => {
    if (!canGoBack) {
      return;
    }
    setSelectedStep(STEPS[selectedStepIndex - 1].id);
  };

  const updateDraftField = (field: keyof WizardDraft, value: string) => {
    setDraft(previous => ({ ...previous, [field]: value }));
  };

  const updateBalanceField = (field: keyof WizardDraft['balanceSheet'], value: string) => {
    setDraft(previous => ({
      ...previous,
      balanceSheet: {
        ...previous.balanceSheet,
        [field]: value
      }
    }));
  };

  const renderStepGuide = (stepId: WizardStepId) => {
    const guide = STEP_GUIDES[stepId];

    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Mode d’emploi</div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Documents à avoir sous la main</h4>
            <ul className="mt-2 space-y-2 text-sm text-slate-700">
              {guide.documents.map(document => (
                <li key={document}>• {document}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Ce que vous devez faire</h4>
            <ul className="mt-2 space-y-2 text-sm text-slate-700">
              {guide.actions.map(action => (
                <li key={action}>• {action}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Contrôle final</h4>
            <p className="mt-2 text-sm text-slate-700">{guide.control}</p>
          </div>
        </div>
      </div>
    );
  };

  const renderBilanTable = (
    title: string,
    subtitle: string,
    rows: WizardBilanRow[],
    emptyLabel = 'Non confirmé'
  ) => {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-600">{subtitle}</p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Poste</th>
                <th className="px-3 py-2 text-right">Référence N-1</th>
                <th className="px-3 py-2 text-right">Valeur retenue</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(row => (
                <tr key={row.code}>
                  <td className="px-3 py-3 font-mono text-gray-600">{row.code}</td>
                  <td className="px-3 py-3 text-gray-900">{row.label}</td>
                  <td className="px-3 py-3 text-right text-gray-700">
                    {row.reference === undefined ? '—' : formatMontant(row.reference)}
                  </td>
                  <td className="px-3 py-3 text-right font-medium text-gray-900">
                    {row.closing === undefined ? emptyLabel : formatMontant(row.closing)}
                  </td>
                  <td className="px-3 py-3 text-gray-600">{row.source}</td>
                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                        row.status === 'Confirmé' || row.status === 'Clôture verrouillée' || row.status === 'Calculé automatiquement'
                          ? 'bg-green-100 text-green-700'
                          : row.status.includes('À confirmer') || row.status.includes('live')
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-blue-100 text-blue-700'
                      )}
                    >
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const saveBankStep = async (): Promise<boolean> => {
    if (!clubId) {
      return false;
    }

    const openingCurrent = parseOptionalNumber(draft.openingCurrent);
    const openingSavings = parseOptionalNumber(draft.openingSavings);

    if (openingCurrent === undefined || openingSavings === undefined) {
      toast.error('Les soldes d’ouverture des comptes doivent être renseignés.');
      return false;
    }

    try {
      setSavingBanks(true);
      await FiscalYearService.updateFiscalYear(clubId, workingFiscalYear.id, {
        opening_balances: {
          bank_current: openingCurrent,
          bank_savings: openingSavings
        },
        account_numbers: {
          bank_current: draft.accountCurrent.trim() || undefined,
          bank_savings: draft.accountSavings.trim() || undefined
        },
        notes: draft.notes.trim() || undefined
      });
      toast.success('Étape « Banques » enregistrée');
      await loadData(true);
      return true;
    } catch (error) {
      logger.error('Erreur lors de la sauvegarde des banques:', error);
      toast.error('Impossible d’enregistrer les données bancaires');
      return false;
    } finally {
      setSavingBanks(false);
    }
  };

  const saveBalanceSheetStep = async (): Promise<boolean> => {
    if (!clubId) {
      return false;
    }

    const balanceSheet = {
      assets: {
        stock_cdc: parseOptionalNumber(draft.balanceSheet.stockCdc),
        stock_boutique: parseOptionalNumber(draft.balanceSheet.stockBoutique),
        stock_boutique_lifras: parseOptionalNumber(draft.balanceSheet.stockBoutiqueLifras),
        obligations: parseOptionalNumber(draft.balanceSheet.obligations),
        charges_reportees: parseOptionalNumber(draft.balanceSheet.chargesReportees),
        assurance_reportee: parseOptionalNumber(draft.balanceSheet.assuranceReportee)
      },
      liabilities: {
        resultat_reporte: parseOptionalNumber(draft.balanceSheet.resultatReporte),
        fonds_affectes: parseOptionalNumber(draft.balanceSheet.fondsAffectes),
        resultat_exercice: workingFiscalYear.balance_sheet?.liabilities?.resultat_exercice,
        provision_entretien: parseOptionalNumber(draft.balanceSheet.provisionEntretien),
        provision_piscine: parseOptionalNumber(draft.balanceSheet.provisionPiscine),
        cotisations_reportees: parseOptionalNumber(draft.balanceSheet.cotisationsReportees),
        sorties_reportees: parseOptionalNumber(draft.balanceSheet.sortiesReportees),
        paiements_annee_suivante: parseOptionalNumber(draft.balanceSheet.paiementsAnneeSuivante)
      }
    };

    try {
      setSavingBalanceSheet(true);
      await FiscalYearService.updateFiscalYear(clubId, workingFiscalYear.id, {
        balance_sheet: balanceSheet,
        notes: draft.notes.trim() || undefined
      });
      const existingBilanValues = await getBilanValues(clubId, workingFiscalYear.id);
      const valuesMap = new Map(existingBilanValues.map(value => [value.bilanCodeId, { ...value }]));

      MANUAL_BALANCE_FIELDS.forEach(field => {
        const parsed = parseOptionalNumber(draft.balanceSheet[field.key]);
        if (parsed !== undefined) {
          upsertBilanClosingValue(valuesMap, BALANCE_FIELD_TO_CODE[field.key], parsed, true);
        }
      });

      const stockBoutique = parseOptionalNumber(draft.balanceSheet.stockBoutique);
      if (stockBoutique !== undefined) {
        upsertBilanClosingValue(valuesMap, '02.01.01', stockBoutique, false);
      }

      const stockBoutiqueLifras = parseOptionalNumber(draft.balanceSheet.stockBoutiqueLifras);
      if (stockBoutiqueLifras !== undefined) {
        upsertBilanClosingValue(valuesMap, '02.01.02', stockBoutiqueLifras, false);
      }

      await saveBilanValues(clubId, workingFiscalYear.id, Array.from(valuesMap.values()));
      toast.success('Valeurs manuelles du bilan enregistrées');
      await loadData(true);
      return true;
    } catch (error) {
      logger.error('Erreur lors de la sauvegarde du bilan manuel:', error);
      toast.error('Impossible d’enregistrer les valeurs manuelles');
      return false;
    } finally {
      setSavingBalanceSheet(false);
    }
  };

  const handleCreateOrLockSnapshot = async (card: SnapshotStatusCard) => {
    if (!clubId || !user?.uid) {
      toast.error('Utilisateur non identifié');
      return;
    }

    try {
      if (card.key === 'inventory') {
        if (!card.snapshotId) {
          const snapshotId = await InventoryValueSnapshotService.createSnapshot(clubId, workingFiscalYear.year, user.uid);
          await InventoryValueSnapshotService.lockSnapshot(clubId, snapshotId);
          toast.success('Clôture matériel créée et verrouillée');
        } else if (!card.isLocked) {
          await InventoryValueSnapshotService.lockSnapshot(clubId, card.snapshotId);
          toast.success('Clôture matériel verrouillée');
        }
      } else {
        if (!card.snapshotId) {
          const snapshotId = await BoutiqueStockService.createSnapshot(clubId, workingFiscalYear.year, card.key, user.uid);
          await BoutiqueStockService.lockSnapshot(clubId, snapshotId);
          toast.success(`Clôture « ${card.title} » créée et verrouillée`);
        } else if (!card.isLocked) {
          await BoutiqueStockService.lockSnapshot(clubId, card.snapshotId);
          toast.success(`Clôture « ${card.title} » verrouillée`);
        }
      }

      await loadData(true);
    } catch (error) {
      logger.error('Erreur lors du traitement de la clôture de stock:', error);
      toast.error(error instanceof Error ? error.message : 'Impossible de traiter cette clôture');
    }
  };

  const finalizeClosing = async () => {
    if (!clubId) {
      return;
    }

    if (blockingReasons.length > 0) {
      toast.error('La clôture certifiée est bloquée tant que la liste de validation n’est pas verte.');
      return;
    }

    try {
      setFinalizing(true);
      const bankSaved = await saveBankStep();
      const balanceSheetSaved = await saveBalanceSheetStep();

      if (!bankSaved || !balanceSheetSaved) {
        toast.error('La clôture a été interrompue parce qu’une étape préalable n’a pas pu être sauvegardée.');
        return;
      }

      await FiscalYearService.updateFiscalYear(clubId, workingFiscalYear.id, {
        closing_wizard: persistedWizardState
      });
      await FiscalYearService.closeFiscalYear(clubId, workingFiscalYear.id, user?.uid);
      toast.success(`Exercice ${workingFiscalYear.year} clôturé avec succès`);
      if (onCompleted) {
        await onCompleted();
      }
      onClose();
    } catch (error) {
      logger.error('Erreur lors de la clôture finale:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la clôture finale');
    } finally {
      setFinalizing(false);
    }
  };

  const renderStepContent = () => {
    if (loading) {
      return (
        <div className="flex min-h-[340px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-calypso-blue" />
        </div>
      );
    }

    if (selectedStep === 'preparation') {
      return (
        <div className="space-y-6">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
            <h3 className="text-lg font-semibold text-blue-900">Objectif de l’assistant</h3>
            <p className="mt-2 text-sm text-blue-800">
              Cet assistant centralise les confirmations nécessaires avant une clôture certifiée. Les chiffres calculés restent dans CaliCompta;
              vous confirmez ici les éléments de bilan, les stocks verrouillés et les paramètres bancaires.
            </p>
          </div>

          {renderStepGuide('preparation')}

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="text-sm font-medium text-gray-500">Exercice</div>
              <div className="mt-1 text-2xl font-bold text-gray-900">{workingFiscalYear.year}</div>
              <div className="mt-2 text-sm text-gray-600">
                {formatDate(workingFiscalYear.start_date)} → {formatDate(workingFiscalYear.end_date)}
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="text-sm font-medium text-gray-500">Transactions non réconciliées</div>
              <div className="mt-1 text-2xl font-bold text-gray-900">{bankSummary?.unreconciledTransactions ?? 0}</div>
              <div className="mt-2 text-sm text-gray-600">Avertissement seulement: la clôture reste possible.</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="text-sm font-medium text-gray-500">Statut actuel</div>
              <div className="mt-1 text-2xl font-bold text-gray-900">
                {workingFiscalYear.status === 'open' && 'Ouvert'}
                {workingFiscalYear.status === 'closed' && 'Clôturé'}
                {workingFiscalYear.status === 'permanently_closed' && 'Verrouillé'}
              </div>
              <div className="mt-2 text-sm text-gray-600">La clôture certifiée n’est possible que sur un exercice encore ouvert.</div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Pré-contrôles</h4>
            <div className="mt-4 space-y-3">
              {rawCloseReasons.length === 0 ? (
                <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>Aucun blocage technique détecté par le service de clôture.</span>
                </div>
              ) : (
                rawCloseReasons.map(reason => (
                  <div
                    key={reason}
                    className={cn(
                      'flex items-start gap-3 rounded-lg border p-3 text-sm',
                      reason.includes('avertissement')
                        ? 'border-amber-200 bg-amber-50 text-amber-800'
                        : 'border-red-200 bg-red-50 text-red-800'
                    )}
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>{reason}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      );
    }

    if (selectedStep === 'banques') {
      return (
        <div className="space-y-6">
          {renderStepGuide('banques')}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="text-base font-semibold text-gray-900">Compte courant</h3>
              <label className="mt-4 block text-sm font-medium text-gray-700">IBAN</label>
              <input
                type="text"
                value={draft.accountCurrent}
                onChange={event => updateDraftField('accountCurrent', event.target.value)}
                placeholder="BE00 0000 0000 0000"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-calypso-blue focus:outline-none focus:ring-2 focus:ring-calypso-blue/20"
              />
              <label className="mt-4 block text-sm font-medium text-gray-700">Solde d’ouverture</label>
              <input
                type="number"
                step="0.01"
                value={draft.openingCurrent}
                onChange={event => updateDraftField('openingCurrent', event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-calypso-blue focus:outline-none focus:ring-2 focus:ring-calypso-blue/20"
              />
              <div className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">
                <div className="font-medium">Solde calculé à la clôture</div>
                <div className="mt-1 text-xl font-bold">{formatMontant(bankSummary?.current ?? 0)}</div>
                <div className="mt-1 text-xs text-green-700">
                  {bankSummary?.currentTransactions ?? 0} transaction(s) prises en compte.
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="text-base font-semibold text-gray-900">Compte épargne</h3>
              <label className="mt-4 block text-sm font-medium text-gray-700">IBAN</label>
              <input
                type="text"
                value={draft.accountSavings}
                onChange={event => updateDraftField('accountSavings', event.target.value)}
                placeholder="BE00 0000 0000 0000"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-calypso-blue focus:outline-none focus:ring-2 focus:ring-calypso-blue/20"
              />
              <label className="mt-4 block text-sm font-medium text-gray-700">Solde d’ouverture</label>
              <input
                type="number"
                step="0.01"
                value={draft.openingSavings}
                onChange={event => updateDraftField('openingSavings', event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-calypso-blue focus:outline-none focus:ring-2 focus:ring-calypso-blue/20"
              />
              <div className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">
                <div className="font-medium">Solde calculé à la clôture</div>
                <div className="mt-1 text-xl font-bold">{formatMontant(bankSummary?.savings ?? 0)}</div>
                <div className="mt-1 text-xs text-green-700">
                  {bankSummary?.savingsTransactions ?? 0} transaction(s) prises en compte.
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <label className="block text-sm font-medium text-gray-700">Notes de clôture</label>
            <textarea
              rows={4}
              value={draft.notes}
              onChange={event => updateDraftField('notes', event.target.value)}
              placeholder="Remarques pour l’expert-comptable, particularités de l’exercice, justificatifs à retrouver…"
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-calypso-blue focus:outline-none focus:ring-2 focus:ring-calypso-blue/20"
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => void saveBankStep()}
              disabled={savingBanks}
              className="inline-flex items-center gap-2 rounded-lg bg-calypso-blue px-4 py-2 text-sm font-medium text-white hover:bg-calypso-blue-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingBanks ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              Enregistrer l’étape banques
            </button>
          </div>
        </div>
      );
    }

    if (selectedStep === 'stocks') {
      return (
        <div className="space-y-6">
          {renderStepGuide('stocks')}

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Clôtures de stock et de matériel</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Pour une clôture certifiée, les clôtures utilisées par le bilan doivent être verrouillées.
                </p>
              </div>
              <button
                onClick={() => navigate('/stock/audit')}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <ExternalLink className="h-4 w-4" />
                Ouvrir l’écran complet des clôtures
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {stockCards.map(card => (
              <div key={card.key} className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-base font-semibold text-gray-900">{card.title}</h4>
                    <p className="mt-1 text-sm text-gray-600">{card.description}</p>
                  </div>
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-medium',
                      card.isLocked ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'
                    )}
                  >
                    {card.isLocked ? 'Verrouillé' : card.hasSnapshot ? 'À verrouiller' : 'À créer'}
                  </span>
                </div>

                <div className="mt-4 rounded-lg bg-gray-50 p-3">
                  <div className="text-xs uppercase tracking-wide text-gray-500">Valeur retenue</div>
                  <div className="mt-1 text-2xl font-bold text-gray-900">{formatMontant(card.value)}</div>
                </div>

                <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
                  <span>Snapshot existant</span>
                  <span className="font-medium text-gray-900">{card.hasSnapshot ? 'Oui' : 'Non'}</span>
                </div>

                <div className="mt-4">
                  {card.isLocked ? (
                    <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                      Cette clôture est déjà verrouillée. Elle sera reprise telle quelle dans le bilan et l’export Excel.
                    </div>
                  ) : (
                    <button
                      onClick={() => void handleCreateOrLockSnapshot(card)}
                      disabled={!card.canCreate}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-calypso-blue px-4 py-2 text-sm font-medium text-white hover:bg-calypso-blue-dark disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Lock className="h-4 w-4" />
                      {card.hasSnapshot ? 'Verrouiller maintenant' : 'Créer et verrouiller'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (selectedStep === 'bilan') {
      return (
        <div className="space-y-6">
          {renderStepGuide('bilan')}

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-900">
            Les montants repris auparavant dans l’écran « Valeurs du Bilan » sont maintenant consultables ici. Les montants de boutique et boutique LIFRAS sont injectés automatiquement depuis les clôtures verrouillées. Les autres champs ci-dessous doivent être confirmés explicitement, même si la valeur est 0,00.
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="text-xs uppercase tracking-wide text-gray-500">Auto depuis les clôtures</div>
              <div className="mt-3 space-y-3 text-sm">
                <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                  <span>Boutique club</span>
                  <span className="font-semibold text-gray-900">{formatMontant(parseOptionalNumber(draft.balanceSheet.stockBoutique) || 0)}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                  <span>Boutique LIFRAS</span>
                  <span className="font-semibold text-gray-900">{formatMontant(parseOptionalNumber(draft.balanceSheet.stockBoutiqueLifras) || 0)}</span>
                </div>
                <div className="rounded-lg border border-dashed border-gray-300 px-3 py-3 text-gray-600">
                  Le résultat de l’exercice reste calculé automatiquement à partir des rapports. Il n’est pas saisi dans cette étape.
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="text-xs uppercase tracking-wide text-gray-500">Confirmation manuelle</div>
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Si une rubrique ne s’applique pas, saisissez explicitement <strong>0</strong>. Un champ vide reste considéré comme non confirmé.
              </div>
            </div>
          </div>

          {renderBilanTable(
            'Valeurs calculées automatiquement',
            previousFiscalYear
              ? `Vue synthétique des postes automatiques. Les références N-1 proviennent de l’exercice certifié ${previousFiscalYear.year}.`
              : 'Vue synthétique des postes automatiques. Aucune référence N-1 certifiée n’est disponible pour cet exercice.',
            automaticBilanRows
          )}

          <div className="space-y-6">
            {BILAN_SECTIONS.map(section => {
              const fields = MANUAL_BALANCE_FIELDS.filter(field => field.section === section.key);
              if (fields.length === 0) {
                return null;
              }

              return (
                <div key={section.key} className="space-y-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{section.label}</div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {fields.map(field => (
                      <div key={field.key} className="rounded-xl border border-gray-200 bg-white p-5">
                        <label className="block text-sm font-medium text-gray-900">{field.label}</label>
                        <p className="mt-1 text-xs text-gray-500">{field.hint}</p>
                        <input
                          type="number"
                          step="0.01"
                          value={draft.balanceSheet[field.key]}
                          onChange={event => updateBalanceField(field.key, event.target.value)}
                          className={cn(
                            'mt-3 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2',
                            draft.balanceSheet[field.key].trim() === ''
                              ? 'border-amber-300 focus:border-amber-400 focus:ring-amber-100'
                              : 'border-gray-300 focus:border-calypso-blue focus:ring-calypso-blue/20'
                          )}
                        />
                        <div className="mt-4 space-y-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                          <div>
                            <span className="font-semibold text-slate-900">Où trouver ce montant ? </span>
                            {field.whereToFind}
                          </div>
                          <div>
                            <span className="font-semibold text-slate-900">Contrôle à faire: </span>
                            {field.control}
                          </div>
                          <div>
                            <span className="font-semibold text-slate-900">Exemple: </span>
                            {field.example}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {renderBilanTable(
            'Valeurs confirmées dans l’assistant',
            'Les montants retenus ici remplacent la saisie manuelle de l’ancien écran technique. La colonne N-1 reprend uniquement la référence certifiée de l’exercice précédent.',
            manualBilanRows,
            'À confirmer dans l’assistant'
          )}

          <div className="flex justify-end">
            <button
              onClick={() => void saveBalanceSheetStep()}
              disabled={savingBalanceSheet}
              className="inline-flex items-center gap-2 rounded-lg bg-calypso-blue px-4 py-2 text-sm font-medium text-white hover:bg-calypso-blue-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingBalanceSheet ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
              Enregistrer le bilan manuel
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {renderStepGuide('validation')}

        {renderBilanTable(
          'Synthèse finale du bilan',
          'Cette synthèse remplace l’ancien écran Valeurs du Bilan pour les postes utiles à la clôture et ne conserve que la référence N-1 certifiée.',
          [...automaticBilanRows, ...manualBilanRows],
          'À confirmer avant clôture'
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-red-200 bg-red-50 p-5">
            <div className="flex items-center gap-2 text-red-900">
              <ShieldCheck className="h-5 w-5" />
              <h3 className="text-base font-semibold">Bloquants</h3>
            </div>
            <div className="mt-4 space-y-3">
              {blockingReasons.length === 0 ? (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                  Tous les points bloquants sont levés. L’exercice peut être clôturé de manière certifiée.
                </div>
              ) : (
                blockingReasons.map(reason => (
                  <div key={reason} className="flex items-start gap-3 rounded-lg border border-red-200 bg-white p-3 text-sm text-red-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>{reason}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-center gap-2 text-amber-900">
              <AlertCircle className="h-5 w-5" />
              <h3 className="text-base font-semibold">Avertissements</h3>
            </div>
            <div className="mt-4 space-y-3">
              {warnings.length === 0 ? (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                  Aucun avertissement supplémentaire.
                </div>
              ) : (
                warnings.map(warning => (
                  <div key={warning} className="rounded-lg border border-amber-200 bg-white p-3 text-sm text-amber-800">
                    {warning}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-base font-semibold text-gray-900">Clôture finale</h3>
          <p className="mt-2 text-sm text-gray-600">
            La clôture finale calcule les soldes de fin, marque l’exercice comme clôturé et crée automatiquement l’exercice suivant avec report des soldes bancaires.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg bg-gray-50 p-4">
              <div className="text-sm text-gray-500">Compte courant reporté sur {workingFiscalYear.year + 1}</div>
              <div className="mt-1 text-2xl font-bold text-gray-900">{formatMontant(bankSummary?.current ?? 0)}</div>
            </div>
            <div className="rounded-lg bg-gray-50 p-4">
              <div className="text-sm text-gray-500">Compte épargne reporté sur {workingFiscalYear.year + 1}</div>
              <div className="mt-1 text-2xl font-bold text-gray-900">{formatMontant(bankSummary?.savings ?? 0)}</div>
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <button
              onClick={() => void finalizeClosing()}
              disabled={finalizing || blockingReasons.length > 0}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {finalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Clôturer l’exercice {workingFiscalYear.year}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-6xl bg-gray-100 shadow-2xl">
        <div className="hidden w-80 shrink-0 border-r border-gray-200 bg-white lg:block">
          <div className="border-b border-gray-200 px-6 py-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-calypso-blue">Assistant de clôture</div>
            <h2 className="mt-2 text-2xl font-bold text-gray-900">Exercice {workingFiscalYear.year}</h2>
            <p className="mt-2 text-sm text-gray-600">
              {formatDate(workingFiscalYear.start_date)} → {formatDate(workingFiscalYear.end_date)}
            </p>
            {workingFiscalYear.closing_wizard?.last_saved_at && (
              <p className="mt-2 text-xs text-gray-500">
                Progression mémorisée le {new Date(workingFiscalYear.closing_wizard.last_saved_at).toLocaleString('fr-BE')}
              </p>
            )}
          </div>
          <div className="space-y-2 p-4">
            {STEPS.map((step, index) => {
              const status = step.id === selectedStep ? 'current' : stepStatuses[step.id];
              return (
                <button
                  key={step.id}
                  onClick={() => setSelectedStep(step.id)}
                  className={cn(
                    'w-full rounded-xl border px-4 py-3 text-left transition-colors',
                    status === 'current' && 'border-calypso-blue bg-blue-50',
                    status === 'done' && 'border-green-200 bg-green-50',
                    status === 'todo' && 'border-gray-200 bg-white hover:bg-gray-50'
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Étape {index + 1}</span>
                    {status === 'done' ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : status === 'current' ? (
                      <ArrowRight className="h-4 w-4 text-calypso-blue" />
                    ) : null}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-gray-900">{step.label}</div>
                  <div className="mt-1 text-xs text-gray-600">{step.description}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="sticky top-0 z-10 border-b border-gray-200 bg-white px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold uppercase tracking-wide text-calypso-blue">
                  {STEPS[selectedStepIndex].label}
                </div>
                <h2 className="mt-1 text-xl font-bold text-gray-900">
                  {STEPS[selectedStepIndex].description}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 lg:hidden">
              {STEPS.map((step, index) => (
                <button
                  key={step.id}
                  onClick={() => setSelectedStep(step.id)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium',
                    step.id === selectedStep
                      ? 'border-calypso-blue bg-blue-50 text-calypso-blue'
                      : 'border-gray-200 bg-white text-gray-700'
                  )}
                >
                  {index + 1}. {step.label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {renderStepContent()}
          </div>

          <div className="border-t border-gray-200 bg-white px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={goToPreviousStep}
                disabled={!canGoBack}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
                Étape précédente
              </button>
              <button
                onClick={goToNextStep}
                disabled={!canGoNext}
                className="inline-flex items-center gap-2 rounded-lg bg-calypso-blue px-4 py-2 text-sm font-medium text-white hover:bg-calypso-blue-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                Étape suivante
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
