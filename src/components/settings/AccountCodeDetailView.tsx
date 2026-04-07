import React, { useState, useEffect } from 'react';
import { logger } from '@/utils/logger';
import {
  X,
  Tag,
  FileText,
  Info,
  Trash2,
  AlertCircle
} from 'lucide-react';
import { AccountCode, Categorie } from '@/types';
import { cn } from '@/utils/utils';
import toast from 'react-hot-toast';

interface AccountCodeDetailViewProps {
  accountCode: AccountCode | null;
  isOpen: boolean;
  onClose: () => void;
  onSave?: (updatedCode: AccountCode) => void;
  onDelete?: (code: string) => void;
  isNew?: boolean;
  categories?: Categorie[];
}

export function AccountCodeDetailView({
  accountCode,
  isOpen,
  onClose,
  onSave,
  onDelete,
  isNew = false,
  categories = []
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

    // Update local state first
    const updated = { ...editedCode, [field]: value };
    setEditedCode(updated);

    // Pour un nouveau code, ne sauvegarder que si code ET label sont remplis
    if (isNew) {
      const codeValue = field === 'code' ? value : updated.code;
      const labelValue = field === 'label' ? value : updated.label;

      if (!codeValue || !codeValue.trim() || !labelValue || !labelValue.trim()) {
        // Ne pas sauvegarder encore, attendre que les deux champs soient remplis
        return;
      }
    } else {
      // Pour un code existant, validation normale
      if (field === 'code' && (!value || !value.trim())) {
        toast.error('Le code est obligatoire');
        return;
      }
      if (field === 'label' && (!value || !value.trim())) {
        toast.error('Le libellé est obligatoire');
        return;
      }
    }

    try {
      await onSave(updated);
      toast.success('✓ Sauvegardé', { duration: 1500, position: 'bottom-right' });
    } catch (error) {
      logger.error(`Error saving ${field}:`, error);
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
                <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary">
                  {isNew ? 'Nouveau code comptable' : 'Détails du code comptable'}
                </h2>
                {!isNew && accountCode.code && (
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                    {accountCode.code}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <X className="h-5 w-5 text-gray-500 dark:text-dark-text-muted" />
            </button>
          </div>

          {/* Action buttons - only show for existing codes */}
          {!isNew && (
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Désactiver
              </button>
            </div>
          )}
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
                    Catégories
                  </label>
                  <div className="border border-gray-300 dark:border-dark-border rounded-lg p-2 max-h-48 overflow-y-auto bg-white dark:bg-dark-bg-secondary">
                    {categories
                      .filter((cat) => {
                        // Filter categories based on account code type
                        if (editedCode.type === 'revenue') return cat.type === 'revenu';
                        if (editedCode.type === 'expense') return cat.type === 'depense';
                        // For asset/liability, show all categories
                        return true;
                      })
                      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
                      .map((cat) => {
                        const isChecked = editedCode.categories?.includes(cat.id) || false;
                        return (
                          <label
                            key={cat.id}
                            className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const currentCategories = editedCode.categories || [];
                                let newCategories: string[];
                                if (e.target.checked) {
                                  newCategories = [...currentCategories, cat.id];
                                } else {
                                  newCategories = currentCategories.filter(id => id !== cat.id);
                                }
                                setEditedCode({ ...editedCode, categories: newCategories });
                                handleFieldSave('categories', newCategories);
                              }}
                              className="w-4 h-4 text-blue-600 border-gray-300 dark:border-dark-border rounded focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700 dark:text-dark-text-primary">
                              {cat.nom}
                            </span>
                            {cat.isFrequent && (
                              <span className="text-yellow-500 text-xs">★</span>
                            )}
                          </label>
                        );
                      })}
                    {categories.filter((cat) => {
                      if (editedCode.type === 'revenue') return cat.type === 'revenu';
                      if (editedCode.type === 'expense') return cat.type === 'depense';
                      return true;
                    }).length === 0 && (
                      <p className="text-sm text-gray-500 dark:text-dark-text-muted px-2 py-1">
                        Aucune catégorie disponible pour ce type
                      </p>
                    )}
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
                  {editedCode.categories && editedCode.categories.length > 0 && (
                    <p>
                      <span className="font-medium">Catégories:</span> {editedCode.categories.map(catId => {
                        const cat = categories.find(c => c.id === catId);
                        return cat?.nom || catId.replace(/_/g, ' ');
                      }).join(', ')}
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
