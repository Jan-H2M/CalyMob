import React, { useState, useEffect } from 'react';
import { logger } from '@/utils/logger';
import {
  X,
  Tag,
  Trash2,
  Star,
  CheckCircle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Categorie } from '@/types';
import { cn } from '@/utils/utils';
import toast from 'react-hot-toast';

interface CategoryDetailViewProps {
  category: Categorie | null;
  isOpen: boolean;
  isNew?: boolean;
  onClose: () => void;
  onSave?: (category: Categorie) => void;
  onDelete?: (categoryId: string) => void;
  onNavigate?: (direction: 'prev' | 'next') => void;
  canNavigatePrev?: boolean;
  canNavigateNext?: boolean;
}

export function CategoryDetailView({
  category,
  isOpen,
  isNew = false,
  onClose,
  onSave,
  onDelete,
  onNavigate,
  canNavigatePrev = false,
  canNavigateNext = false
}: CategoryDetailViewProps) {
  const isCreateMode = isNew;

  // Edited fields state
  const [editedNom, setEditedNom] = useState(category?.nom || '');
  const [editedType, setEditedType] = useState<'revenu' | 'depense'>(category?.type || 'depense');
  const [editedLabelCourt, setEditedLabelCourt] = useState(category?.label_court || '');
  const [editedIsFrequent, setEditedIsFrequent] = useState(category?.isFrequent || false);

  // Auto-save handler
  const handleFieldSave = async (field: string, value: any) => {
    if (isCreateMode || !onSave || !category) return;

    try {
      if (field === 'nom' && (!value || !value.trim())) {
        toast.error('Le nom de la catégorie est obligatoire');
        return;
      }

      const updatedCategory: Categorie = {
        ...category,
        [field]: value,
        ...(field === 'type' && {
          couleur: value === 'revenu' ? '#10b981' : '#ef4444'
        })
      };

      await onSave(updatedCategory);
      toast.success('✓ Sauvegardé', { duration: 1500, position: 'bottom-right' });
    } catch (error) {
      logger.error(`Error saving ${field}:`, error);
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  // Reset form when category changes
  useEffect(() => {
    if (isCreateMode) {
      setEditedNom('');
      setEditedType('depense');
      setEditedLabelCourt('');
      setEditedIsFrequent(false);
    } else if (category) {
      setEditedNom(category.nom || '');
      setEditedType(category.type || 'depense');
      setEditedLabelCourt(category.label_court || '');
      setEditedIsFrequent(category.isFrequent || false);
    }
  }, [category, isCreateMode]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      const target = e.target as HTMLElement;
      const isInputField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
      if (!isInputField && onNavigate) {
        if (e.key === 'ArrowLeft' && canNavigatePrev) onNavigate('prev');
        else if (e.key === 'ArrowRight' && canNavigateNext) onNavigate('next');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, onNavigate, canNavigatePrev, canNavigateNext]);

  if (!isOpen) return null;

  const handleCreate = () => {
    if (!editedNom.trim()) {
      toast.error('Le nom de la catégorie est obligatoire');
      return;
    }

    if (onSave) {
      const newCategory: Categorie = {
        id: `cat_${Date.now()}`,
        nom: editedNom,
        type: editedType,
        couleur: editedType === 'revenu' ? '#10b981' : '#ef4444',
        label_court: editedLabelCourt,
        isFrequent: editedIsFrequent
      };
      onSave(newCategory);
      toast.success('Catégorie créée');
      onClose();
    }
  };

  const handleDelete = () => {
    if (window.confirm(`Supprimer la catégorie "${category?.nom}" ?`)) {
      if (onDelete && category) {
        onDelete(category.id);
      }
      toast.success('Catégorie supprimée');
      onClose();
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-30 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className={cn(
        "fixed right-0 top-0 h-full w-full md:w-2/3 lg:w-1/2 bg-white dark:bg-dark-bg-secondary shadow-xl z-50",
        "transform transition-transform duration-300 ease-in-out",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}>
        {/* Header */}
        <div className="bg-gray-50 dark:bg-dark-bg-tertiary border-b border-gray-200 dark:border-dark-border px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-gray-700 dark:text-dark-text-primary" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                {isCreateMode ? 'Nouvelle catégorie' : category?.nom}
              </h2>
            </div>

            <div className="flex items-center gap-1">
              {!isCreateMode && onNavigate && (
                <>
                  <button
                    onClick={() => onNavigate('prev')}
                    disabled={!canNavigatePrev}
                    className={cn(
                      "p-1.5 rounded transition-colors",
                      canNavigatePrev
                        ? "hover:bg-gray-200 dark:hover:bg-dark-bg-primary text-gray-700 dark:text-dark-text-primary"
                        : "text-gray-400 dark:text-dark-text-muted cursor-not-allowed"
                    )}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => onNavigate('next')}
                    disabled={!canNavigateNext}
                    className={cn(
                      "p-1.5 rounded transition-colors",
                      canNavigateNext
                        ? "hover:bg-gray-200 dark:hover:bg-dark-bg-primary text-gray-700 dark:text-dark-text-primary"
                        : "text-gray-400 dark:text-dark-text-muted cursor-not-allowed"
                    )}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </>
              )}
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-gray-200 dark:hover:bg-dark-bg-primary rounded transition-colors"
              >
                <X className="h-4 w-4 text-gray-500 dark:text-dark-text-muted" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 120px)' }}>
          {/* Nom + Label court side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-dark-text-secondary mb-1">
                Nom
              </label>
              <input
                type="text"
                value={editedNom}
                onChange={(e) => setEditedNom(e.target.value)}
                onBlur={() => handleFieldSave('nom', editedNom)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-dark-border rounded focus:ring-1 focus:ring-blue-500 dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                placeholder="Cotisations"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-dark-text-secondary mb-1">
                Label court
              </label>
              <input
                type="text"
                value={editedLabelCourt}
                onChange={(e) => setEditedLabelCourt(e.target.value)}
                onBlur={() => handleFieldSave('label_court', editedLabelCourt)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-dark-border rounded focus:ring-1 focus:ring-blue-500 dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                placeholder="Cotis."
              />
            </div>
          </div>

          {/* Type + Favori on same row */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-dark-text-secondary mb-1">
                Type
              </label>
              <select
                value={editedType}
                onChange={(e) => {
                  const newType = e.target.value as 'revenu' | 'depense';
                  setEditedType(newType);
                  setEditedSelectedCodes([]); // Reset codes when type changes
                  if (!isCreateMode) handleFieldSave('type', newType);
                }}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-dark-border rounded focus:ring-1 focus:ring-blue-500 dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
              >
                <option value="revenu">Revenu</option>
                <option value="depense">Dépense</option>
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer pt-5">
              <input
                type="checkbox"
                checked={editedIsFrequent}
                onChange={(e) => {
                  setEditedIsFrequent(e.target.checked);
                  if (!isCreateMode) handleFieldSave('isFrequent', e.target.checked);
                }}
                className="w-4 h-4 text-blue-600 border-gray-300 dark:border-dark-border rounded focus:ring-blue-500"
              />
              <Star className={cn("h-4 w-4", editedIsFrequent ? "fill-yellow-500 text-yellow-500" : "text-gray-400 dark:text-dark-text-muted")} />
              <span className="text-sm text-gray-700 dark:text-dark-text-primary">Favori</span>
            </label>
          </div>

          {/* Info: Les codes comptables sont maintenant liés via AccountCode.categories */}
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              Les codes comptables sont liés à cette catégorie via le Plan Comptable.
              Modifiez les codes dans "Plan Comptable" pour changer les associations.
            </p>
          </div>

          {/* Action buttons */}
          <div className="pt-4 border-t border-gray-200 dark:border-dark-border flex gap-2">
            {isCreateMode ? (
              <button
                onClick={handleCreate}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <CheckCircle className="h-4 w-4" />
                Créer
              </button>
            ) : (
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400 rounded-lg hover:bg-red-200 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Supprimer
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
