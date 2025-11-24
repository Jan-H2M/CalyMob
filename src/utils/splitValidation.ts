import { TransactionSplit } from '@/types';

/**
 * Valide que la somme des splits correspond au montant de la transaction
 */
export function validateSplitSum(
  transactionAmount: number,
  splits: Array<{ amount: number }>
): boolean {
  const totalSplit = splits.reduce((sum, split) => sum + Math.abs(split.amount || 0), 0);
  const targetAmount = Math.abs(transactionAmount);
  return Math.abs(totalSplit - targetAmount) < 0.01; // Tolérance de 1 centime pour les arrondis
}

/**
 * Valide qu'un split individuel est complet et valide
 */
export function validateSingleSplit(split: Partial<TransactionSplit>): string[] {
  const errors: string[] = [];
  
  if (!split.description || split.description.trim().length === 0) {
    errors.push('La description est obligatoire');
  }
  
  if (!split.amount || split.amount <= 0) {
    errors.push('Le montant doit être supérieur à zéro');
  }
  
  if (split.description && split.description.length > 200) {
    errors.push('La description ne doit pas dépasser 200 caractères');
  }
  
  if (split.notes && split.notes.length > 500) {
    errors.push('Les notes ne doivent pas dépasser 500 caractères');
  }
  
  return errors;
}

/**
 * Valide l'ensemble des splits pour une transaction
 */
export function validateAllSplits(
  transactionAmount: number,
  splits: Array<Partial<TransactionSplit>>
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Vérifier qu'il y a au moins 2 splits
  if (splits.length < 2) {
    errors.push('Une ventilation doit contenir au moins 2 lignes');
  }
  
  // Valider chaque split individuellement
  splits.forEach((split, index) => {
    const splitErrors = validateSingleSplit(split);
    splitErrors.forEach(error => {
      errors.push(`Ligne ${index + 1}: ${error}`);
    });
  });
  
  // Valider la somme
  if (!validateSplitSum(transactionAmount, splits as Array<{ amount: number }>)) {
    const totalSplit = splits.reduce((sum, split) => sum + Math.abs(split.amount || 0), 0);
    const targetAmount = Math.abs(transactionAmount);
    const difference = targetAmount - totalSplit;
    errors.push(`La somme des lignes (${totalSplit.toFixed(2)}€) ne correspond pas au montant de la transaction (${targetAmount.toFixed(2)}€). Différence: ${Math.abs(difference).toFixed(2)}€`);
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Calcule le montant restant à allouer
 */
export function calculateRemainingAmount(
  transactionAmount: number,
  splits: Array<{ amount: number }>
): number {
  const totalSplit = splits.reduce((sum, split) => sum + Math.abs(split.amount || 0), 0);
  const targetAmount = Math.abs(transactionAmount);
  return targetAmount - totalSplit;
}

/**
 * Formate les splits pour l'enregistrement en base de données
 */
export function formatSplitsForSave(
  transactionId: string,
  transactionAmount: number,
  splits: Array<Omit<TransactionSplit, 'id' | 'bank_transaction_id' | 'created_at' | 'updated_at' | 'created_by'>>
): Array<Omit<TransactionSplit, 'id' | 'created_at' | 'updated_at' | 'created_by'>> {
  const isExpense = transactionAmount < 0;
  
  return splits.map(split => ({
    ...split,
    bank_transaction_id: transactionId,
    // Assurer que le signe du montant correspond au type de transaction
    amount: isExpense ? -Math.abs(split.amount) : Math.abs(split.amount),
    reconcilie: split.reconcilie || false
  }));
}

/**
 * Vérifie si une transaction peut être ventilée
 */
export function canSplitTransaction(transaction: { 
  reconcilie?: boolean; 
  is_split?: boolean;
  statut?: string;
}): boolean {
  // Ne peut pas ventiler si déjà réconcilié
  if (transaction.reconcilie) return false;
  
  // Peut toujours re-ventiler une transaction déjà ventilée (pour modifier)
  // Mais vérifier le statut si applicable
  if (transaction.statut === 'refuse') return false;
  
  return true;
}

/**
 * Calcule les statistiques des splits
 */
export function calculateSplitStats(splits: TransactionSplit[]): {
  totalAmount: number;
  categoryBreakdown: Record<string, number>;
  reconciledCount: number;
  unreconciledCount: number;
} {
  const stats = {
    totalAmount: 0,
    categoryBreakdown: {} as Record<string, number>,
    reconciledCount: 0,
    unreconciledCount: 0
  };
  
  splits.forEach(split => {
    stats.totalAmount += split.amount;
    
    if (split.categorie) {
      if (!stats.categoryBreakdown[split.categorie]) {
        stats.categoryBreakdown[split.categorie] = 0;
      }
      stats.categoryBreakdown[split.categorie] += split.amount;
    }
    
    if (split.reconcilie) {
      stats.reconciledCount++;
    } else {
      stats.unreconciledCount++;
    }
  });
  
  return stats;
}