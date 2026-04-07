import { getAccountCodeByCode } from '@/config/calypso-accounts';
import { DemandeRemboursement, TransactionBancaire } from '@/types';

export type OperationTransactionBucket = 'revenue' | 'expense' | 'uncategorized';

export interface OperationAccountingSummary {
  revenueTransactions: TransactionBancaire[];
  expenseTransactions: TransactionBancaire[];
  uncategorizedTransactions: TransactionBancaire[];
  revenueTotal: number;
  expenseTotal: number;
  balance: number;
}

const isEventEntityType = (entityType: string | undefined): boolean =>
  entityType === 'event' || entityType === 'operation';

export const getTransactionEventLinkIds = (
  transaction: Pick<TransactionBancaire, 'operation_id' | 'evenement_id' | 'matched_entities'>
): string[] => {
  const eventIds = new Set<string>();

  if (transaction.operation_id) {
    eventIds.add(transaction.operation_id);
  }

  if (transaction.evenement_id) {
    eventIds.add(transaction.evenement_id);
  }

  for (const entity of transaction.matched_entities || []) {
    if (isEventEntityType(entity.entity_type as string) && entity.entity_id) {
      eventIds.add(entity.entity_id);
    }
  }

  return Array.from(eventIds);
};

export const getOtherTransactionEventLinkIds = (
  transaction: Pick<TransactionBancaire, 'operation_id' | 'evenement_id' | 'matched_entities'>,
  currentEventId: string
): string[] => getTransactionEventLinkIds(transaction).filter(eventId => eventId !== currentEventId);

export const isTransactionLinkedToOtherEvent = (
  transaction: Pick<TransactionBancaire, 'operation_id' | 'evenement_id' | 'matched_entities'>,
  currentEventId: string
): boolean => getOtherTransactionEventLinkIds(transaction, currentEventId).length > 0;

export const getExpenseLinkedEventId = (
  expense: Pick<DemandeRemboursement, 'operation_id' | 'evenement_id'>
): string | null => expense.operation_id || expense.evenement_id || null;

export const isExpenseLinkedToOtherEvent = (
  expense: Pick<DemandeRemboursement, 'operation_id' | 'evenement_id'>,
  currentEventId: string
): boolean => {
  const linkedEventId = getExpenseLinkedEventId(expense);
  return !!linkedEventId && linkedEventId !== currentEventId;
};

export const getTransactionAccountingBucket = (transaction: TransactionBancaire): OperationTransactionBucket => {
  if (!transaction.code_comptable) {
    return 'uncategorized';
  }

  const accountCode = getAccountCodeByCode(transaction.code_comptable);

  // Revenue + Liability codes = Ventes (argent qui entre)
  if (accountCode?.type === 'revenue' || accountCode?.type === 'liability') {
    return 'revenue';
  }

  // Expense + Asset codes = Achats (argent qui sort)
  // Ex: 490-00-635 "Frais engagés pour activités année suivante" = asset mais doit compter dans la balance
  if (accountCode?.type === 'expense' || accountCode?.type === 'asset') {
    return 'expense';
  }

  return 'uncategorized';
};

export const summarizeOperationTransactions = (
  transactions: TransactionBancaire[]
): OperationAccountingSummary => {
  const revenueTransactions: TransactionBancaire[] = [];
  const expenseTransactions: TransactionBancaire[] = [];
  const uncategorizedTransactions: TransactionBancaire[] = [];

  for (const transaction of transactions) {
    const bucket = getTransactionAccountingBucket(transaction);

    if (bucket === 'revenue') {
      revenueTransactions.push(transaction);
      continue;
    }

    if (bucket === 'expense') {
      expenseTransactions.push(transaction);
      continue;
    }

    uncategorizedTransactions.push(transaction);
  }

  const revenueTotal = revenueTransactions.reduce((sum, transaction) => sum + transaction.montant, 0);
  const expenseTotal = expenseTransactions.reduce((sum, transaction) => sum + Math.abs(transaction.montant), 0);

  return {
    revenueTransactions,
    expenseTransactions,
    uncategorizedTransactions,
    revenueTotal,
    expenseTotal,
    balance: revenueTotal - expenseTotal
  };
};
