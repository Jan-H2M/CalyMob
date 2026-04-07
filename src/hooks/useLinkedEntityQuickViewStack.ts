import { useCallback, useState } from 'react';
import { DemandeRemboursement, Operation, TransactionBancaire } from '@/types';

export type LinkedEntityQuickView =
  | { kind: 'transaction'; transaction: TransactionBancaire }
  | { kind: 'demand'; demand: DemandeRemboursement }
  | { kind: 'operation'; operation: Operation };

const getQuickViewKey = (item: LinkedEntityQuickView): string => {
  switch (item.kind) {
    case 'transaction':
      return `transaction:${item.transaction.id}`;
    case 'demand':
      return `demand:${item.demand.id}`;
    case 'operation':
      return `operation:${item.operation.id}`;
  }
};

export function useLinkedEntityQuickViewStack() {
  const [quickViews, setQuickViews] = useState<LinkedEntityQuickView[]>([]);

  const openQuickView = useCallback((item: LinkedEntityQuickView) => {
    setQuickViews(prev => {
      const topItem = prev[prev.length - 1];
      if (topItem && getQuickViewKey(topItem) === getQuickViewKey(item)) {
        return prev;
      }

      return [...prev, item];
    });
  }, []);

  const closeQuickViewsFrom = useCallback((index: number) => {
    setQuickViews(prev => prev.slice(0, index));
  }, []);

  const closeAllQuickViews = useCallback(() => {
    setQuickViews([]);
  }, []);

  return {
    quickViews,
    openQuickView,
    closeQuickViewsFrom,
    closeAllQuickViews
  };
}
