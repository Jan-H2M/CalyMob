import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  AlertCircle,
  Check,
  Split,
  BookOpen,
  ChevronDown
} from 'lucide-react';
import { TransactionBancaire, TransactionSplit, Categorie, AccountCode } from '@/types';
import { formatMontant, cn } from '@/utils/utils';
import { CategorizationService } from '@/services/categorizationService';
import toast from 'react-hot-toast';

interface TransactionSplitModalProps {
  transaction: TransactionBancaire;
  existingSplits?: TransactionSplit[];
  childTransactions?: TransactionBancaire[]; // NOUVEAU : pour éditer une ventilation existante
  onSave: (splits: Omit<TransactionSplit, 'id' | 'created_at' | 'updated_at' | 'created_by'>[]) => Promise<void>;
  onClose: () => void;
}

export function TransactionSplitModal({
  transaction,
  existingSplits = [],
  childTransactions = [],
  onSave,
  onClose
}: TransactionSplitModalProps) {
  const isEditMode = childTransactions.length > 0; // Mode édition si des enfants existent
  const [splits, setSplits] = useState<Array<{
    description: string;
    amount: number;
    categorie?: string;
    code_comptable?: string;
    notes?: string;
  }>>([]);
  
  const [accountCodes, setAccountCodes] = useState<AccountCode[]>([]);
  const [categories, setCategories] = useState<Categorie[]>([]);
  
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Charger les codes comptables et catégories appropriés
    const isExpense = transaction.montant < 0;
    const codes = CategorizationService.getAccountCodesByType(isExpense);
    setAccountCodes(codes);

    const filteredCategories = CategorizationService.getCategoriesByType(isExpense);
    setCategories(filteredCategories);

    // NOUVEAU : Priorité aux childTransactions (nouveau système parent-enfant)
    if (childTransactions.length > 0) {
      setSplits(childTransactions.map(child => ({
        description: child.contrepartie_nom,
        amount: Math.abs(child.montant),
        categorie: child.categorie,
        code_comptable: child.code_comptable,
        notes: child.details
      })));
    } else if (existingSplits.length > 0) {
      // Ancien système de splits
      setSplits(existingSplits.map(split => ({
        description: split.description,
        amount: Math.abs(split.amount),
        categorie: split.categorie,
        code_comptable: split.code_comptable,
        notes: split.notes
      })));
    } else {
      // Initialiser avec 2 lignes vides
      setSplits([
        { description: '', amount: 0, categorie: undefined, code_comptable: undefined, notes: '' },
        { description: '', amount: 0, categorie: undefined, code_comptable: undefined, notes: '' }
      ]);
    }
  }, [existingSplits, childTransactions, transaction]);

  const addSplitLine = () => {
    setSplits([...splits, { description: '', amount: 0, categorie: undefined, code_comptable: undefined, notes: '' }]);
  };

  const removeSplitLine = (index: number) => {
    const remainingSplits = splits.filter((_, i) => i !== index);

    // Si il reste au moins 1 ligne, ajuster automatiquement la dernière ligne
    if (remainingSplits.length >= 1) {
      // Calculer le total des N-1 premières lignes
      const totalExceptLast = remainingSplits.slice(0, -1).reduce((sum, split) => sum + (split.amount || 0), 0);
      // Ajuster la dernière ligne pour atteindre le montant cible
      const targetAmount = Math.abs(transaction.montant);
      remainingSplits[remainingSplits.length - 1].amount = targetAmount - totalExceptLast;
    }

    setSplits(remainingSplits);
  };

  const updateSplitLine = (index: number, field: string, value: any) => {
    const newSplits = [...splits];
    newSplits[index] = { ...newSplits[index], [field]: value };
    setSplits(newSplits);
  };

  const totalAmount = splits.reduce((sum, split) => sum + (split.amount || 0), 0);
  const targetAmount = Math.abs(transaction.montant);
  const difference = targetAmount - totalAmount;

  // NOUVEAU : Validation flexible
  // - Si 0-1 lignes : OK (restaure transaction normale)
  // - Si 2+ lignes : total doit = montant parent ET tous les champs remplis
  const isValid = splits.length < 2 || (Math.abs(difference) < 0.01 && splits.every(s => s.description && s.amount > 0));
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
        amount: transaction.montant < 0 ? -Math.abs(split.amount) : Math.abs(split.amount),
        categorie: split.categorie,
        code_comptable: split.code_comptable,
        notes: split.notes,
        reconcilie: false
      }));

      await onSave(splitData);
      toast.success('Ventilation enregistrée avec succès');
      onClose();
    } catch (error) {
      toast.error('Erreur lors de l\'enregistrement de la ventilation');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
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
            className="p-2 hover:bg-gray-100 dark:bg-dark-bg-tertiary rounded-full transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Détails de la transaction */}
        <div className="bg-gray-50 dark:bg-dark-bg-tertiary p-4 border-b">
          <div className="grid grid-cols-2 gap-4 text-sm">
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
            <div className="col-span-2">
              <span className="text-gray-600 dark:text-dark-text-secondary">Communication:</span>
              <span className="ml-2 font-medium">{transaction.communication}</span>
            </div>
          </div>

          {/* NOUVEAU : Indicateur visuel du total */}
          {splits.length >= 2 && (
            <div className={cn(
              "mt-4 p-3 rounded-lg border-2 flex items-center justify-between",
              isTotalCorrect
                ? "bg-green-50 border-green-300"
                : "bg-red-50 border-red-300"
            )}>
              <div className="flex items-center gap-2">
                {isTotalCorrect ? (
                  <Check className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-600" />
                )}
                <span className={cn(
                  "font-semibold",
                  isTotalCorrect ? "text-green-900" : "text-red-900"
                )}>
                  Total des lignes:
                </span>
              </div>
              <div className="text-right">
                <span className={cn(
                  "text-lg font-bold",
                  isTotalCorrect ? "text-green-700" : "text-red-700"
                )}>
                  {formatMontant(totalAmount)} / {formatMontant(targetAmount)}
                </span>
                {!isTotalCorrect && (
                  <p className="text-xs text-red-600 mt-1">
                    Différence: {formatMontant(difference)}
                  </p>
                )}
              </div>
            </div>
          )}

          {splits.length < 2 && (
            <div className="mt-4 p-3 rounded-lg border-2 border-blue-300 bg-blue-50">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-blue-600" />
                <span className="text-sm text-blue-900">
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
        <div className="p-6 overflow-y-auto max-h-[400px]">
          <div className="space-y-4">
            {splits.map((split, index) => (
              <div key={index} className="flex gap-3 items-start">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Description *
                  </label>
                  <input
                    type="text"
                    value={split.description}
                    onChange={(e) => updateSplitLine(index, 'description', e.target.value)}
                    placeholder="Ex: Cotisation Jean Dupont"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div className="w-32">
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Montant *
                  </label>
                  <input
                    type="number"
                    value={split.amount || ''}
                    onChange={(e) => updateSplitLine(index, 'amount', parseFloat(e.target.value) || 0)}
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="w-40">
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Catégorie
                  </label>
                  <div className="relative">
                    <select
                      value={split.categorie || ''}
                      onChange={(e) => {
                        updateSplitLine(index, 'categorie', e.target.value);
                        // Auto-sélectionner le code comptable associé
                        const category = categories.find(c => c.id === e.target.value);
                        if (category?.compte_comptable) {
                          updateSplitLine(index, 'code_comptable', category.compte_comptable);
                        }
                      }}
                      className="w-full pl-3 pr-10 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none"
                    >
                      <option value="">Sélectionner</option>
                      {categories.filter(cat => 
                        transaction.montant < 0 ? cat.type === 'depense' : cat.type === 'revenu'
                      ).map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.nom}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-dark-text-muted pointer-events-none" />
                  </div>
                </div>

                <div className="w-48">
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Code comptable
                  </label>
                  <div className="relative">
                    <select
                      value={split.code_comptable || ''}
                      onChange={(e) => updateSplitLine(index, 'code_comptable', e.target.value)}
                      className="w-full pl-3 pr-10 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none text-xs"
                    >
                      <option value="">Sélectionner</option>
                      {accountCodes.map(code => (
                        <option key={code.code} value={code.code}>
                          {code.code}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-dark-text-muted pointer-events-none" />
                  </div>
                  {split.code_comptable && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-muted truncate">
                      {accountCodes.find(c => c.code === split.code_comptable)?.label}
                    </p>
                  )}
                </div>

                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Notes
                  </label>
                  <input
                    type="text"
                    value={split.notes || ''}
                    onChange={(e) => updateSplitLine(index, 'notes', e.target.value)}
                    placeholder="Optionnel"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="pt-7">
                  <button
                    onClick={() => removeSplitLine(index)}
                    className="p-2 rounded-lg transition-colors hover:bg-red-100 text-red-600"
                    title="Supprimer cette ligne"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
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

        {/* Récapitulatif et validation */}
        <div className="border-t p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="space-y-1">
              <div className="flex items-center space-x-4">
                <span className="text-gray-600 dark:text-dark-text-secondary">Total ventilé:</span>
                <span className={cn(
                  "font-semibold text-lg",
                  Math.abs(difference) < 0.01 ? "text-green-600" : "text-orange-600"
                )}>
                  {formatMontant(totalAmount)}
                </span>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-gray-600 dark:text-dark-text-secondary">Montant à ventiler:</span>
                <span className="font-semibold">{formatMontant(targetAmount)}</span>
              </div>
              {Math.abs(difference) >= 0.01 && (
                <div className="flex items-center space-x-2 text-orange-600">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm">
                    Différence: {formatMontant(difference)}
                  </span>
                </div>
              )}
            </div>

            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 dark:text-dark-text-primary bg-gray-100 dark:bg-dark-bg-tertiary hover:bg-gray-200 rounded-lg transition-colors"
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
                    : "bg-gray-300 text-gray-500 cursor-not-allowed"
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
                    <span>Enregistrer la ventilation</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {!isValid && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-start space-x-2">
              <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5" />
              <div className="text-sm text-orange-800">
                <p className="font-medium">Validation requise:</p>
                <ul className="list-disc list-inside mt-1">
                  {splits.some(s => !s.description) && (
                    <li>Toutes les lignes doivent avoir une description</li>
                  )}
                  {splits.some(s => s.amount <= 0) && (
                    <li>Tous les montants doivent être supérieurs à zéro</li>
                  )}
                  {Math.abs(difference) >= 0.01 && (
                    <li>Le total doit correspondre au montant de la transaction</li>
                  )}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}