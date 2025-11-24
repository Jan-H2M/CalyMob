import React, { useState, useEffect } from 'react';
import {
  X,
  Tag,
  FileText,
  Info,
  Trash2,
  AlertCircle,
  Star
} from 'lucide-react';
import { AccountCode } from '@/types';
import { cn } from '@/utils/utils';
import toast from 'react-hot-toast';

interface AccountCodeDetailViewProps {
  accountCode: AccountCode | null;
  isOpen: boolean;
  onClose: () => void;
  onSave?: (updatedCode: AccountCode) => void;
  onDelete?: (code: string) => void;
}

export function AccountCodeDetailView({
  accountCode,
  isOpen,
  onClose,
  onSave,
  onDelete
}: AccountCodeDetailViewProps) {
  const [editedCode, setEditedCode] = useState<AccountCode | null>(null);

  useEffect(() => {
    if (accountCode) {
      setEditedCode({ ...accountCode });
    }
  }, [accountCode]);

  // Auto-save handler for individual fields
  const handleFieldSave = async (field: string, value: any) => {
    if (!onSave || !editedCode) return;

    try {
      // Validation
      if (field === 'code' && (!value || !value.trim())) {
        toast.error('Le code est obligatoire');
        return;
      }
      if (field === 'label' && (!value || !value.trim())) {
        toast.error('Le libellé est obligatoire');
        return;
      }

      // Update local state and save
      const updated = { ...editedCode, [field]: value };
      setEditedCode(updated);
      await onSave(updated);

      toast.success('✓ Sauvegardé', { duration: 1500, position: 'bottom-right' });
    } catch (error) {
      console.error(`Error saving ${field}:`, error);
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  if (!isOpen || !accountCode || !editedCode) return null;

  const handleDelete = () => {
    if (window.confirm(`Êtes-vous sûr de vouloir supprimer le code ${accountCode.code} ?`)) {
      if (onDelete) {
        onDelete(accountCode.code);
      }

      toast.success('Code comptable désactivé');
      onClose();
    }
  };

  const typeLabels = {
    revenue: 'Revenu',
    expense: 'Dépense',
    asset: 'Actif',
    liability: 'Passif'
  };

  const typeColors = {
    revenue: 'bg-green-100 text-green-700',
    expense: 'bg-red-100 text-red-700',
    asset: 'bg-blue-100 text-blue-700',
    liability: 'bg-purple-100 text-purple-700'
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-30 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Slide-out Panel */}
      <div className={cn(
        "fixed right-0 top-0 h-full w-full md:w-2/3 lg:w-1/2 bg-white shadow-xl z-50",
        "transform transition-transform duration-300 ease-in-out",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}>
        {/* Header */}
        <div className="bg-gray-50 dark:bg-dark-bg-tertiary border-b border-gray-200 dark:border-dark-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Tag className="h-6 w-6 text-gray-700 dark:text-dark-text-primary" />
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary">Détails du code comptable</h2>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                  {accountCode.code}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <X className="h-5 w-5 text-gray-500 dark:text-dark-text-muted" />
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Désactiver
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6" style={{ maxHeight: 'calc(100vh - 180px)' }}>
          <div className="space-y-6">
            {/* Informations principales */}
            <div>
              <h3 className="font-medium text-gray-900 dark:text-dark-text-primary mb-4 flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Informations principales
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Code comptable
                  </label>
                  <input
                    type="text"
                    value={editedCode.code}
                    onChange={(e) => setEditedCode({ ...editedCode, code: e.target.value })}
                    onBlur={() => handleFieldSave('code', editedCode.code)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                    placeholder="Ex: 730-00-712"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Libellé
                  </label>
                  <input
                    type="text"
                    value={editedCode.label}
                    onChange={(e) => setEditedCode({ ...editedCode, label: e.target.value })}
                    onBlur={() => handleFieldSave('label', editedCode.label)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Ex: Cotisations des membres plongeurs"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Type de compte
                  </label>
                  <select
                    value={editedCode.type}
                    onChange={(e) => {
                      const newType = e.target.value as 'revenue' | 'expense' | 'asset' | 'liability';
                      setEditedCode({ ...editedCode, type: newType });
                      handleFieldSave('type', newType);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="revenue">Revenu</option>
                    <option value="expense">Dépense</option>
                    <option value="asset">Actif</option>
                    <option value="liability">Passif</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Catégorie
                  </label>
                  <input
                    type="text"
                    value={editedCode.category || ''}
                    onChange={(e) => setEditedCode({ ...editedCode, category: e.target.value })}
                    onBlur={() => handleFieldSave('category', editedCode.category)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Ex: cotisations, piscine, sorties..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Utilisation fréquente
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isFrequent"
                      checked={editedCode.isFrequent || false}
                      onChange={(e) => {
                        const newValue = e.target.checked;
                        setEditedCode({ ...editedCode, isFrequent: newValue });
                        handleFieldSave('isFrequent', newValue);
                      }}
                      className="w-4 h-4 text-blue-600 border-gray-300 dark:border-dark-border rounded focus:ring-blue-500"
                    />
                    <label htmlFor="isFrequent" className="text-sm text-gray-700 dark:text-dark-text-primary flex items-center gap-1">
                      <Star className="h-4 w-4 text-yellow-500" />
                      Marquer comme fréquemment utilisé
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Informations sur l'utilisation */}
            <div>
              <h3 className="font-medium text-gray-900 dark:text-dark-text-primary mb-4 flex items-center gap-2">
                <Info className="h-5 w-5" />
                Informations d'utilisation
              </h3>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="space-y-2 text-sm text-blue-900">
                  <p>
                    <span className="font-medium">Code original:</span> {accountCode.code}
                  </p>
                  <p>
                    <span className="font-medium">Type:</span> {
                      editedCode.type === 'revenue' ? 'Compte de produit' :
                      editedCode.type === 'expense' ? 'Compte de charge' :
                      editedCode.type === 'asset' ? "Compte d'actif" :
                      'Compte de passif'
                    }
                  </p>
                  {editedCode.category && (
                    <p>
                      <span className="font-medium">Catégorie:</span> {editedCode.category.replace(/_/g, ' ')}
                    </p>
                  )}
                  <p className="mt-3 text-xs text-blue-700">
                    Ce code fait partie du plan comptable belge adapté pour le club de plongée Calypso.
                  </p>
                </div>
              </div>
            </div>

            {/* Note sur les modifications */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-yellow-900">Attention</p>
                  <p className="text-sm text-yellow-700 mt-1">
                    Les modifications sont sauvegardées automatiquement. Les codes comptables sont stockés dans Firebase pour votre club. Le plan comptable original reste intact.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
