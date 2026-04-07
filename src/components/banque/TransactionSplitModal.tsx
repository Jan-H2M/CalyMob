import { useState, useEffect } from 'react';
import { logger } from '@/utils/logger';
import {
  X,
  Plus,
  Trash2,
  AlertCircle,
  Check,
  Split,
  Link2,
  StickyNote,
  ChevronDown,
  Users
} from 'lucide-react';
import { TransactionBancaire, TransactionSplit, AccountCode, Operation, Membre } from '@/types';
import { formatMontant, cn } from '@/utils/utils';
import { CategorizationService } from '@/services/categorizationService';
import { AccountCodeSelectorModal } from '@/components/commun/AccountCodeSelectorModal';
import { OperationLinkingPanel } from './OperationLinkingPanel';
import { MemberLinkingPanel } from './MemberLinkingPanel';
import { getFirstName, getLastName } from '@/utils/fieldMapper';
import toast from 'react-hot-toast';

interface SplitLine {
  description: string;
  amount: number;
  code_comptable?: string;
  notes?: string;
  operation_id?: string;
  operation_name?: string;
  membre_id?: string;
  membre_name?: string;
}

interface TransactionSplitModalProps {
  transaction: TransactionBancaire;
  existingSplits?: TransactionSplit[];
  childTransactions?: TransactionBancaire[];
  onSave: (splits: Omit<TransactionSplit, 'id' | 'created_at' | 'updated_at' | 'created_by'>[]) => Promise<void>;
  onClose: () => void;
  clubId: string;
  operations: Operation[];
  membres?: Membre[];
}

// Helper: check if code is a cotisation code (730-00-7xx or 493-00-719)
function isCotisationCode(code: string | undefined): boolean {
  if (!code) return false;
  return code.startsWith('730-00-7') || code === '493-00-719';
}

export function TransactionSplitModal({
  transaction,
  existingSplits = [],
  childTransactions = [],
  onSave,
  onClose,
  clubId,
  operations,
  membres = []
}: TransactionSplitModalProps) {
  const isEditMode = childTransactions.length > 0;
  const [splits, setSplits] = useState<SplitLine[]>([]);
  const [accountCodes, setAccountCodes] = useState<AccountCode[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // États pour les sous-modals
  const [codeSelectorOpen, setCodeSelectorOpen] = useState<{ index: number } | null>(null);
  const [operationPanelOpen, setOperationPanelOpen] = useState<{ index: number } | null>(null);
  const [memberPanelOpen, setMemberPanelOpen] = useState<{ index: number } | null>(null);
  const [notesModalOpen, setNotesModalOpen] = useState<{ index: number } | null>(null);
  const [tempNotes, setTempNotes] = useState('');

  useEffect(() => {
    const isExpense = transaction.montant < 0;
    const codes = CategorizationService.getAccountCodesByType(isExpense);
    setAccountCodes(codes);

    if (childTransactions.length > 0) {
      setSplits(childTransactions.map(child => {
        // Find operation entity
        const operationEntity = child.matched_entities?.find(e => e.entity_type === 'event');
        // Find member entity
        const memberEntity = child.matched_entities?.find(e => e.entity_type === 'member');

        return {
          description: child.contrepartie_nom,
          amount: Math.abs(child.montant),
          code_comptable: child.code_comptable,
          notes: child.details,
          operation_id: operationEntity?.entity_id,
          operation_name: operationEntity?.entity_name,
          membre_id: memberEntity?.entity_id,
          membre_name: memberEntity?.entity_name
        };
      }));
    } else if (existingSplits.length > 0) {
      setSplits(existingSplits.map(split => ({
        description: split.description,
        amount: Math.abs(split.amount),
        code_comptable: split.code_comptable,
        notes: split.notes,
        operation_id: undefined,
        operation_name: undefined,
        membre_id: split.membre_id,
        membre_name: undefined // Will be populated from membres if needed
      })));
    } else {
      setSplits([
        { description: '', amount: 0, code_comptable: undefined, notes: '', operation_id: undefined, operation_name: undefined, membre_id: undefined, membre_name: undefined },
        { description: '', amount: 0, code_comptable: undefined, notes: '', operation_id: undefined, operation_name: undefined, membre_id: undefined, membre_name: undefined }
      ]);
    }
  }, [existingSplits, childTransactions, transaction]);

  const addSplitLine = () => {
    setSplits([...splits, { description: '', amount: 0, code_comptable: undefined, notes: '', operation_id: undefined, operation_name: undefined, membre_id: undefined, membre_name: undefined }]);
  };

  const removeSplitLine = (index: number) => {
    const remainingSplits = splits.filter((_, i) => i !== index);
    if (remainingSplits.length >= 1) {
      const totalExceptLast = remainingSplits.slice(0, -1).reduce((sum, split) => sum + (split.amount || 0), 0);
      const targetAmount = Math.abs(transaction.montant);
      remainingSplits[remainingSplits.length - 1].amount = targetAmount - totalExceptLast;
    }
    setSplits(remainingSplits);
  };

  const updateSplitLine = (index: number, field: keyof SplitLine, value: string | number | undefined) => {
    const newSplits = [...splits];
    newSplits[index] = { ...newSplits[index], [field]: value };
    setSplits(newSplits);
  };

  // Fonction pour obtenir le label du code comptable
  const getCodeLabel = (code: string | undefined): string => {
    if (!code) return '';
    const accountCode = accountCodes.find(c => c.code === code);
    return accountCode?.label || code;
  };

  // Ouvrir le modal de notes
  const openNotesModal = (index: number) => {
    setTempNotes(splits[index].notes || '');
    setNotesModalOpen({ index });
  };

  // Sauvegarder les notes
  const saveNotes = () => {
    if (notesModalOpen) {
      updateSplitLine(notesModalOpen.index, 'notes', tempNotes);
      setNotesModalOpen(null);
    }
  };

  // Gérer la sélection d'une opération
  const handleOperationSelect = async (operationIds: string[]) => {
    logger.debug('handleOperationSelect called with:', operationIds);
    logger.debug('operationPanelOpen:', operationPanelOpen);

    if (operationPanelOpen && operationIds.length > 0) {
      const selectedOp = operations.find(op => op.id === operationIds[0]);
      const index = operationPanelOpen.index;
      logger.debug('Updating split at index', { index, operation: selectedOp?.titre });

      // Mettre à jour les deux champs en une seule opération pour éviter le problème de state stale
      setSplits(prev => {
        const newSplits = [...prev];
        newSplits[index] = {
          ...newSplits[index],
          operation_id: operationIds[0],
          operation_name: selectedOp?.titre || ''
        };
        logger.debug('New splits state:', newSplits);
        return newSplits;
      });
      setOperationPanelOpen(null);
    }
  };

  // Effacer la liaison d'opération
  const clearOperationLink = (index: number) => {
    setSplits(prev => {
      const newSplits = [...prev];
      newSplits[index] = {
        ...newSplits[index],
        operation_id: undefined,
        operation_name: undefined
      };
      return newSplits;
    });
  };

  // Gérer la sélection d'un membre
  const handleMemberSelect = (membre: Membre) => {
    if (memberPanelOpen) {
      const index = memberPanelOpen.index;
      const memberName = membre.displayName || `${getFirstName(membre)} ${getLastName(membre)}`;

      setSplits(prev => {
        const newSplits = [...prev];
        newSplits[index] = {
          ...newSplits[index],
          membre_id: membre.id,
          membre_name: memberName
        };
        return newSplits;
      });
      setMemberPanelOpen(null);
    }
  };

  // Effacer la liaison de membre
  const clearMemberLink = (index: number) => {
    setSplits(prev => {
      const newSplits = [...prev];
      newSplits[index] = {
        ...newSplits[index],
        membre_id: undefined,
        membre_name: undefined
      };
      return newSplits;
    });
  };

  const totalAmount = splits.reduce((sum, split) => sum + (split.amount || 0), 0);
  const targetAmount = Math.abs(transaction.montant);
  const difference = targetAmount - totalAmount;
  const isValid = splits.length < 2 || (Math.abs(difference) < 0.01 && splits.every(s => s.description && s.amount !== 0));
  const isTotalCorrect = Math.abs(difference) < 0.01;

  const handleSave = async () => {
    if (!isValid) {
      toast.error('Veuillez vérifier que tous les champs sont remplis et que le total correspond');
      return;
    }

    setIsLoading(true);
    try {
      const splitData = splits.map(split => ({
        bank_transaction_id: transaction.id,
        description: split.description,
        amount: transaction.montant < 0 ? -split.amount : split.amount,
        code_comptable: split.code_comptable,
        notes: split.notes,
        operation_id: split.operation_id,
        membre_id: split.membre_id,
        reconcilie: false
      }));

      await onSave(splitData);
      toast.success('Ventilation enregistrée avec succès');
      onClose();
    } catch (error) {
      toast.error('Erreur lors de l\'enregistrement de la ventilation');
      logger.error('Error saving split transaction', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* En-tête */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-3">
            <Split className={cn("h-6 w-6", isEditMode ? "text-orange-600" : "text-blue-600")} />
            <div>
              <h2 className="text-xl font-semibold">
                {isEditMode ? 'Modifier la ventilation' : 'Ventiler la transaction'}
              </h2>
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                {isEditMode
                  ? `Modifier la répartition du montant de ${formatMontant(transaction.montant)}`
                  : `Répartir le montant de ${formatMontant(transaction.montant)} sur plusieurs lignes`
                }
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded-full transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Détails de la transaction */}
        <div className="bg-gray-50 dark:bg-dark-bg-tertiary p-4 border-b">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600 dark:text-dark-text-secondary">Date:</span>
              <span className="ml-2 font-medium">
                {transaction.date_execution.toLocaleDateString('fr-BE')}
              </span>
            </div>
            <div>
              <span className="text-gray-600 dark:text-dark-text-secondary">Contrepartie:</span>
              <span className="ml-2 font-medium">{transaction.contrepartie_nom}</span>
            </div>
            <div className="sm:col-span-2">
              <span className="text-gray-600 dark:text-dark-text-secondary">Communication:</span>
              <span className="ml-2 font-medium">{transaction.communication}</span>
            </div>
          </div>

          {/* Indicateur visuel du total */}
          {splits.length >= 2 && (
            <div className={cn(
              "mt-4 p-3 rounded-lg border-2 flex items-center justify-between",
              isTotalCorrect
                ? "bg-green-50 border-green-300 dark:bg-green-900/20 dark:border-green-700"
                : "bg-red-50 border-red-300 dark:bg-red-900/20 dark:border-red-700"
            )}>
              <div className="flex items-center gap-2">
                {isTotalCorrect ? (
                  <Check className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-600" />
                )}
                <span className={cn(
                  "font-semibold",
                  isTotalCorrect ? "text-green-900 dark:text-green-300" : "text-red-900 dark:text-red-300"
                )}>
                  Total des lignes:
                </span>
              </div>
              <div className="text-right">
                <span className={cn(
                  "text-lg font-bold",
                  isTotalCorrect ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
                )}>
                  {formatMontant(totalAmount)} / {formatMontant(targetAmount)}
                </span>
                {!isTotalCorrect && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    Différence: {formatMontant(difference)}
                  </p>
                )}
              </div>
            </div>
          )}

          {splits.length < 2 && (
            <div className="mt-4 p-3 rounded-lg border-2 border-blue-300 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-blue-600" />
                <span className="text-sm text-blue-900 dark:text-blue-300">
                  {splits.length === 0
                    ? "Aucune ligne → La transaction redeviendra normale"
                    : "Une seule ligne → La transaction redeviendra normale (minimum 2 lignes requis)"
                  }
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Lignes de ventilation */}
        <div className="p-4 overflow-y-auto flex-1 min-h-0">
          {/* En-tête des colonnes */}
          <div className="flex gap-2 items-center mb-2 px-1 text-xs font-medium text-gray-500 dark:text-dark-text-muted">
            <div className="flex-1">Description *</div>
            <div className="w-24 text-right">Montant *</div>
            <div className="w-32">Code</div>
            <div className="w-9 text-center">Act.</div>
            <div className="w-9 text-center">Mbr.</div>
            <div className="w-9 text-center">Note</div>
            <div className="w-9"></div>
          </div>

          <div className="space-y-2">
            {splits.map((split, index) => (
              <div key={index} className="flex gap-2 items-center py-2 border-b border-gray-100 dark:border-dark-border">
                {/* Description */}
                <input
                  type="text"
                  value={split.description}
                  onChange={(e) => updateSplitLine(index, 'description', e.target.value)}
                  placeholder="Ex: Cotisation Jean Dupont"
                  className="flex-1 h-9 px-3 text-sm border border-gray-300 dark:border-dark-border dark:bg-dark-bg-tertiary rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />

                {/* Montant */}
                <input
                  type="number"
                  value={split.amount || ''}
                  onChange={(e) => updateSplitLine(index, 'amount', parseFloat(e.target.value) || 0)}
                  step="0.01"
                  placeholder="0.00"
                  className="w-24 h-9 px-2 text-sm text-right border border-gray-300 dark:border-dark-border dark:bg-dark-bg-tertiary rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />

                {/* Code comptable - Bouton ouvrant le sélecteur */}
                <button
                  onClick={() => setCodeSelectorOpen({ index })}
                  className={cn(
                    "w-32 h-9 px-2 text-xs border rounded-md truncate text-left transition-colors",
                    split.code_comptable
                      ? "border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:border-blue-700 dark:text-blue-300"
                      : "border-gray-300 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary text-gray-500 dark:text-dark-text-muted"
                  )}
                  title={split.code_comptable ? `${split.code_comptable} - ${getCodeLabel(split.code_comptable)}` : 'Sélectionner un code'}
                >
                  {split.code_comptable ? getCodeLabel(split.code_comptable) : 'Code...'}
                  <ChevronDown className="inline-block ml-1 h-3 w-3" />
                </button>

                {/* Liaison activité */}
                <button
                  onClick={() => split.operation_id ? clearOperationLink(index) : setOperationPanelOpen({ index })}
                  className={cn(
                    "h-9 w-9 flex items-center justify-center border rounded-md transition-colors",
                    split.operation_id
                      ? "text-green-600 bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-700"
                      : "border-gray-300 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary text-gray-400 dark:text-dark-text-muted"
                  )}
                  title={split.operation_name || "Lier à une activité"}
                >
                  <Link2 className="h-4 w-4" />
                </button>

                {/* Liaison membre - only for cotisation codes */}
                {isCotisationCode(split.code_comptable) ? (
                  <button
                    onClick={() => split.membre_id ? clearMemberLink(index) : setMemberPanelOpen({ index })}
                    className={cn(
                      "h-9 w-9 flex items-center justify-center border rounded-md transition-colors",
                      split.membre_id
                        ? "text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-700"
                        : "border-gray-300 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary text-gray-400 dark:text-dark-text-muted"
                    )}
                    title={split.membre_name || "Lier à un membre (cotisation)"}
                  >
                    <Users className="h-4 w-4" />
                  </button>
                ) : (
                  <div className="h-9 w-9" />
                )}

                {/* Notes */}
                <button
                  onClick={() => openNotesModal(index)}
                  className={cn(
                    "h-9 w-9 flex items-center justify-center border rounded-md transition-colors",
                    split.notes
                      ? "text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-700"
                      : "border-gray-300 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary text-gray-400 dark:text-dark-text-muted"
                  )}
                  title={split.notes || "Ajouter une note"}
                >
                  <StickyNote className="h-4 w-4" />
                </button>

                {/* Supprimer */}
                <button
                  onClick={() => removeSplitLine(index)}
                  className="h-9 w-9 flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                  title="Supprimer cette ligne"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={addSplitLine}
            className="mt-4 flex items-center space-x-2 text-blue-600 hover:text-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Ajouter une ligne</span>
          </button>
        </div>

        {/* Footer */}
        <div className="border-t p-4 flex-shrink-0 bg-gray-50 dark:bg-dark-bg-tertiary">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="text-gray-600 dark:text-dark-text-secondary">Total: </span>
              <span className={cn(
                "font-semibold",
                isTotalCorrect ? "text-green-600" : "text-orange-600"
              )}>
                {formatMontant(totalAmount)}
              </span>
              <span className="text-gray-400 dark:text-dark-text-muted mx-1">/</span>
              <span className="font-medium">{formatMontant(targetAmount)}</span>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 dark:text-dark-text-primary bg-white dark:bg-dark-bg-secondary border border-gray-300 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={!isValid || isLoading}
                className={cn(
                  "px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors",
                  isValid && !isLoading
                    ? "bg-blue-600 hover:bg-blue-700 text-white"
                    : "bg-gray-300 text-gray-500 dark:text-dark-text-muted cursor-not-allowed"
                )}
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    <span>Enregistrement...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    <span>Enregistrer</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de sélection de code comptable */}
      {codeSelectorOpen && (
        <AccountCodeSelectorModal
          isOpen={true}
          onClose={() => setCodeSelectorOpen(null)}
          onSelect={(code) => {
            updateSplitLine(codeSelectorOpen.index, 'code_comptable', code);
            setCodeSelectorOpen(null);
          }}
          initialCode={splits[codeSelectorOpen.index]?.code_comptable}
          isExpense={transaction.montant < 0}
          clubId={clubId}
          allowClear={true}
        />
      )}

      {/* Panel de liaison d'activité */}
      {operationPanelOpen && (
        <OperationLinkingPanel
          isOpen={true}
          onClose={() => setOperationPanelOpen(null)}
          operations={operations}
          linkedOperationIds={splits[operationPanelOpen.index]?.operation_id ? [splits[operationPanelOpen.index].operation_id!] : []}
          onLinkOperations={handleOperationSelect}
          singleSelect={true}
          title="Lier à une activité"
          subtitle={`Pour la ligne: ${splits[operationPanelOpen.index]?.description || `Ligne ${operationPanelOpen.index + 1}`}`}
        />
      )}

      {/* Panel de liaison membre */}
      {memberPanelOpen && (
        <MemberLinkingPanel
          isOpen={true}
          onClose={() => setMemberPanelOpen(null)}
          membres={membres}
          transactionIban={transaction.contrepartie_iban}
          linkedMemberId={splits[memberPanelOpen.index]?.membre_id}
          onSelectMember={handleMemberSelect}
          position="right"
        />
      )}

      {/* Mini-modal Notes */}
      {notesModalOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[60]">
          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg p-4 w-96 shadow-xl">
            <h3 className="font-medium mb-2 text-gray-900 dark:text-dark-text-primary">
              Notes - Ligne {notesModalOpen.index + 1}
            </h3>
            <p className="text-xs text-gray-500 dark:text-dark-text-muted mb-2">
              {splits[notesModalOpen.index]?.description || 'Sans description'}
            </p>
            <textarea
              value={tempNotes}
              onChange={(e) => setTempNotes(e.target.value)}
              className="w-full h-32 p-2 border border-gray-300 dark:border-dark-border dark:bg-dark-bg-tertiary rounded-md resize-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ajouter des notes..."
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setNotesModalOpen(null)}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded-md transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={saveNotes}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
