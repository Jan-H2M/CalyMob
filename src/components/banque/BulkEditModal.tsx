import { useState, useMemo } from 'react';
import { 
  X, 
  FileText, 
  Calendar, 
  Check, 
  AlertTriangle,
  Trash2,
  UserCheck
} from 'lucide-react';
import { TransactionBancaire, Operation, Membre } from '@/types';
import { formatMontant, formatDate, cn } from '@/utils/utils';
import { AccountCodeSelectorModal } from '@/components/commun/AccountCodeSelectorModal';
import { OperationLinkingPanel } from './OperationLinkingPanel';
import { BulkMemberLinkingModal, MemberAssignment } from './BulkMemberLinkingModal';

interface BulkEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: TransactionBancaire[];
  operations: Operation[];
  membres: Membre[];
  clubId: string;
  onAssignCode: (code: string) => Promise<void>;
  onAssignActivities: (operationIds: string[]) => Promise<void>;
  onLinkMembers: (assignments: MemberAssignment[], cotisationDate: Date) => Promise<void>;
  onClearSelection: () => void;
}

export function BulkEditModal({
  isOpen,
  onClose,
  transactions,
  operations,
  membres,
  clubId,
  onAssignCode,
  onAssignActivities,
  onLinkMembers,
  onClearSelection
}: BulkEditModalProps) {
  // State
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [isOperationPanelOpen, setIsOperationPanelOpen] = useState(false);
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [completedActions, setCompletedActions] = useState<Set<string>>(new Set());

  // Helper: check if code comptable is cotisation family (730-00-7xx ou 493-00-719)
  const isCotisationCode = (code: string | undefined): boolean => {
    if (!code) return false;
    return code.startsWith('730-00-7') || code === '493-00-719';
  };

  // Calculer les statistiques des transactions sélectionnées
  const stats = useMemo(() => {
    const total = transactions.reduce((sum, t) => sum + t.montant, 0);
    const positive = transactions.filter(t => t.montant > 0);
    const negative = transactions.filter(t => t.montant < 0);
    const withCode = transactions.filter(t => t.code_comptable);
    const withActivity = transactions.filter(t => t.matched_entities?.some((e: { entity_type: string }) => e.entity_type === 'event'));
    const withMember = transactions.filter(t => t.matched_entities?.some((e: { entity_type: string }) => e.entity_type === 'member'));
    const cotisationTransactions = transactions.filter(t => isCotisationCode(t.code_comptable) && !t.is_parent);
    
    return {
      count: transactions.length,
      total,
      positiveCount: positive.length,
      positiveTotal: positive.reduce((sum, t) => sum + t.montant, 0),
      negativeCount: negative.length,
      negativeTotal: negative.reduce((sum, t) => sum + t.montant, 0),
      withCodeCount: withCode.length,
      withActivityCount: withActivity.length,
      withMemberCount: withMember.length,
      cotisationCount: cotisationTransactions.length,
      // Pour le modal: la majorité des transactions détermine l'onglet par défaut
      isExpense: negative.length >= positive.length
    };
  }, [transactions]);

  // Transactions cotisation (pour le modal de liaison membres)
  const cotisationTransactions = useMemo(() => {
    return transactions.filter(t => isCotisationCode(t.code_comptable) && !t.is_parent);
  }, [transactions]);

  // Handlers
  const handleCodeSelect = async (code: string) => {
    setIsProcessing(true);
    try {
      await onAssignCode(code);
      setCompletedActions(prev => new Set([...prev, 'code']));
      setIsCodeModalOpen(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLinkOperations = async (operationIds: string[]) => {
    setIsProcessing(true);
    try {
      await onAssignActivities(operationIds);
      setCompletedActions(prev => new Set([...prev, 'activity']));
      setIsOperationPanelOpen(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLinkMembers = async (assignments: MemberAssignment[], cotisationDate: Date) => {
    setIsProcessing(true);
    try {
      await onLinkMembers(assignments, cotisationDate);
      setCompletedActions(prev => new Set([...prev, 'member']));
      setIsMemberModalOpen(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    // Réinitialiser l'état
    setCompletedActions(new Set());
    // Effacer la sélection et fermer
    onClearSelection();
    onClose();
  };

  const handleCloseKeepSelection = () => {
    // Réinitialiser l'état mais PAS la sélection
    setCompletedActions(new Set());
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col shadow-2xl">
          
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-200 dark:border-dark-border bg-calypso-blue text-white flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold">Modification en masse</h2>
              <p className="text-sm text-white/80">
                {stats.count} transaction{stats.count !== 1 ? 's' : ''} sélectionnée{stats.count !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={handleCloseKeepSelection}
              className="p-2 hover:bg-white/20 rounded transition-colors"
              title="Fermer (garder la sélection)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Résumé */}
          <div className="px-4 py-3 bg-gray-50 dark:bg-dark-bg-tertiary border-b border-gray-200 dark:border-dark-border">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <span className="text-gray-500 dark:text-dark-text-muted">Total :</span>
                <span className={cn(
                  "ml-2 font-semibold",
                  stats.total >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                )}>
                  {formatMontant(stats.total)}
                </span>
              </div>
              {stats.positiveCount > 0 && (
                <div>
                  <span className="text-gray-500 dark:text-dark-text-muted">Recettes :</span>
                  <span className="ml-2 font-semibold text-green-600 dark:text-green-400">
                    {stats.positiveCount}× ({formatMontant(stats.positiveTotal)})
                  </span>
                </div>
              )}
              {stats.negativeCount > 0 && (
                <div>
                  <span className="text-gray-500 dark:text-dark-text-muted">Dépenses :</span>
                  <span className="ml-2 font-semibold text-red-600 dark:text-red-400">
                    {stats.negativeCount}× ({formatMontant(stats.negativeTotal)})
                  </span>
                </div>
              )}
              <div>
                <span className="text-gray-500 dark:text-dark-text-muted">Avec code :</span>
                <span className="ml-2 font-semibold">
                  {stats.withCodeCount}/{stats.count}
                </span>
              </div>
            </div>
          </div>

          {/* Contenu - Scrollable */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col min-h-0">
            
            {/* Avertissement si mélange positif/négatif */}
            {stats.positiveCount > 0 && stats.negativeCount > 0 && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-700 dark:text-amber-400">
                  <strong>Attention :</strong> Vous avez sélectionné des recettes ({stats.positiveCount}) et des dépenses ({stats.negativeCount}). 
                  Vérifiez si vous souhaitez attribuer le même code/activité aux deux types.
                </div>
              </div>
            )}

            {/* Section 1: Code comptable */}
            <div className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 dark:bg-dark-bg-tertiary flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-gray-500" />
                  <span className="font-medium">Attribuer un code comptable</span>
                  {completedActions.has('code') && (
                    <span className="flex items-center gap-1 text-green-600 dark:text-green-400 text-sm">
                      <Check className="h-4 w-4" /> Attribué
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setIsCodeModalOpen(true)}
                  disabled={isProcessing}
                  className={cn(
                    "px-3 py-1.5 text-sm font-medium rounded transition-colors",
                    isProcessing
                      ? "bg-gray-200 dark:bg-dark-bg-tertiary text-gray-500 cursor-not-allowed"
                      : "bg-calypso-blue text-white hover:bg-calypso-blue-dark"
                  )}
                >
                  {completedActions.has('code') ? 'Modifier' : 'Sélectionner'}
                </button>
              </div>
              
              {/* Afficher les codes actuels */}
              {stats.withCodeCount > 0 && (
                <div className="px-4 py-2 border-t border-gray-200 dark:border-dark-border text-sm text-gray-600 dark:text-dark-text-secondary">
                  <span className="font-medium">{stats.withCodeCount}</span> transaction{stats.withCodeCount !== 1 ? 's' : ''} 
                  {stats.withCodeCount === 1 ? ' a' : ' ont'} déjà un code. Il sera écrasé.
                </div>
              )}
            </div>

            {/* Section 2: Activité */}
            <div className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 dark:bg-dark-bg-tertiary flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-gray-500" />
                  <span className="font-medium">Lier à une activité</span>
                  {completedActions.has('activity') && (
                    <span className="flex items-center gap-1 text-green-600 dark:text-green-400 text-sm">
                      <Check className="h-4 w-4" /> Lié
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setIsOperationPanelOpen(true)}
                  disabled={isProcessing}
                  className={cn(
                    "px-3 py-1.5 text-sm font-medium rounded transition-colors",
                    isProcessing
                      ? "bg-gray-200 dark:bg-dark-bg-tertiary text-gray-500 cursor-not-allowed"
                      : "bg-calypso-blue text-white hover:bg-calypso-blue-dark"
                  )}
                >
                  {completedActions.has('activity') ? 'Modifier' : 'Sélectionner'}
                </button>
              </div>
              
              {/* Info sur les activités déjà liées */}
              {stats.withActivityCount > 0 && (
                <div className="px-4 py-2 border-t border-gray-200 dark:border-dark-border text-sm text-gray-600 dark:text-dark-text-secondary">
                  <span className="font-medium">{stats.withActivityCount}</span> transaction{stats.withActivityCount !== 1 ? 's' : ''} 
                  {stats.withActivityCount === 1 ? ' est' : ' sont'} déjà liée{stats.withActivityCount !== 1 ? 's' : ''} à une activité.
                </div>
              )}
            </div>

            {/* Section 3: Lier à un membre (uniquement pour cotisations) */}
            {stats.cotisationCount > 0 && (
              <div className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 dark:bg-dark-bg-tertiary flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-5 w-5 text-gray-500" />
                    <span className="font-medium">Lier à un membre</span>
                    <span className="text-xs text-gray-500 dark:text-dark-text-muted">
                      ({stats.cotisationCount} cotisation{stats.cotisationCount !== 1 ? 's' : ''})
                    </span>
                    {completedActions.has('member') && (
                      <span className="flex items-center gap-1 text-green-600 dark:text-green-400 text-sm">
                        <Check className="h-4 w-4" /> Lié
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setIsMemberModalOpen(true)}
                    disabled={isProcessing}
                    className={cn(
                      "px-3 py-1.5 text-sm font-medium rounded transition-colors",
                      isProcessing
                        ? "bg-gray-200 dark:bg-dark-bg-tertiary text-gray-500 cursor-not-allowed"
                        : "bg-green-600 text-white hover:bg-green-700"
                    )}
                  >
                    {completedActions.has('member') ? 'Modifier' : 'Sélectionner'}
                  </button>
                </div>
                
                {/* Info sur les membres déjà liés */}
                {stats.withMemberCount > 0 && (
                  <div className="px-4 py-2 border-t border-gray-200 dark:border-dark-border text-sm text-gray-600 dark:text-dark-text-secondary">
                    <span className="font-medium">{stats.withMemberCount}</span> transaction{stats.withMemberCount !== 1 ? 's' : ''} 
                    {stats.withMemberCount === 1 ? ' est' : ' sont'} déjà liée{stats.withMemberCount !== 1 ? 's' : ''} à un membre.
                  </div>
                )}
              </div>
            )}

            {/* Transactions sélectionnées */}
            <div className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden flex-1 flex flex-col min-h-0">
              <div className="px-4 py-3 bg-gray-50 dark:bg-dark-bg-tertiary border-b border-gray-200 dark:border-dark-border flex-shrink-0">
                <span className="font-medium">Transactions sélectionnées ({stats.count})</span>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0 max-h-[40vh]">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-dark-bg-tertiary sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">N°</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Contrepartie</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Communication</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Montant</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                    {transactions.map(tx => (
                      <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary">
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">
                          {tx.numero_sequence || '-'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {tx.date_execution ? formatDate(tx.date_execution) : '-'}
                        </td>
                        <td className="px-3 py-2 truncate max-w-[180px]" title={tx.contrepartie_nom || ''}>
                          {tx.contrepartie_nom || '-'}
                        </td>
                        <td className="px-3 py-2 truncate max-w-[250px] text-gray-600 dark:text-dark-text-secondary" title={tx.communication || ''}>
                          {tx.communication || '-'}
                        </td>
                        <td className={cn(
                          "px-3 py-2 text-right whitespace-nowrap font-medium",
                          tx.montant >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                        )}>
                          {formatMontant(tx.montant)}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {tx.code_comptable || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary flex justify-between items-center">
            <button
              onClick={handleCloseKeepSelection}
              className="px-4 py-2 text-sm border border-gray-300 dark:border-dark-border rounded hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary transition-colors"
            >
              Fermer (garder la sélection)
            </button>
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium bg-calypso-blue text-white rounded hover:bg-calypso-blue-dark transition-colors flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Terminé & effacer la sélection
            </button>
          </div>
        </div>
      </div>

      {/* Code Selector Modal */}
      <AccountCodeSelectorModal
        isOpen={isCodeModalOpen}
        onClose={() => setIsCodeModalOpen(false)}
        onSelect={handleCodeSelect}
        isExpense={stats.isExpense}
        clubId={clubId}
        transaction={transactions[0]}
        allowClear={true}
      />

      {/* Operation Linking Panel */}
      <OperationLinkingPanel
        isOpen={isOperationPanelOpen}
        onClose={() => setIsOperationPanelOpen(false)}
        operations={operations}
        linkedOperationIds={[]}
        onLinkOperations={handleLinkOperations}
        bulkMode={true}
        bulkCount={stats.count}
        title="Lier à une activité"
        subtitle={`${stats.count} transaction${stats.count !== 1 ? 's' : ''} sélectionnée${stats.count !== 1 ? 's' : ''}`}
      />

      {/* Member Linking Modal (pour cotisations) */}
      <BulkMemberLinkingModal
        isOpen={isMemberModalOpen}
        onClose={() => setIsMemberModalOpen(false)}
        transactions={cotisationTransactions}
        membres={membres}
        onConfirm={handleLinkMembers}
      />
    </>
  );
}
