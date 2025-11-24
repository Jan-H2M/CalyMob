import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Tag,
  FileText,
  Info,
  Trash2,
  AlertCircle,
  Star,
  CheckCircle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Categorie } from '@/types';
import { cn } from '@/utils/utils';
import { CategorizationService } from '@/services/categorizationService';
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
  // Mode detection
  const isCreateMode = isNew;

  // Edited fields state
  const [editedNom, setEditedNom] = useState(category?.nom || '');
  const [editedType, setEditedType] = useState<'revenu' | 'depense'>(category?.type || 'depense');
  const [editedLabelCourt, setEditedLabelCourt] = useState(category?.label_court || '');
  const [editedDescription, setEditedDescription] = useState(category?.description || '');
  const [editedCompteComptable, setEditedCompteComptable] = useState(category?.compte_comptable || '');
  const [editedIsFrequent, setEditedIsFrequent] = useState(category?.isFrequent || false);

  // Auto-save handler for individual fields
  const handleFieldSave = async (field: string, value: any) => {
    if (isCreateMode || !onSave || !category) return; // Don't auto-save in create mode

    try {
      // Validate before saving
      if (field === 'nom' && (!value || !value.trim())) {
        toast.error('Le nom de la catégorie est obligatoire');
        return;
      }

      // Build updated category
      const updatedCategory: Categorie = {
        ...category,
        [field]: value,
        // Auto-update couleur when type changes
        ...(field === 'type' && {
          couleur: value === 'revenu' ? '#10b981' : '#ef4444'
        })
      };

      // Save to Firestore
      await onSave(updatedCategory);

      // Success feedback
      toast.success('✓ Sauvegardé', {
        duration: 1500,
        position: 'bottom-right'
      });
    } catch (error) {
      console.error(`Error saving ${field}:`, error);
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  // Validation intelligente : calcul en temps réel du nombre de codes correspondants
  const matchingCodesInfo = useMemo(() => {
    if (!editedCompteComptable || !editedType) {
      return { count: 0, codes: [] };
    }

    const isExpense = editedType === 'depense';
    const filtered = CategorizationService.getAccountCodesForCategory(
      category?.id || '',
      isExpense
    );

    return { count: filtered.length, codes: filtered.slice(0, 5) }; // Limiter à 5 pour l'aperçu
  }, [editedCompteComptable, editedType, category?.id]);

  // Reset form fields when category changes or when entering create mode
  useEffect(() => {
    if (isCreateMode) {
      // Reset to empty values for create mode
      setEditedNom('');
      setEditedType('depense');
      setEditedLabelCourt('');
      setEditedDescription('');
      setEditedCompteComptable('');
      setEditedIsFrequent(false);
    } else if (category) {
      // Load values from category in edit mode
      setEditedNom(category.nom || '');
      setEditedType(category.type || 'depense');
      setEditedLabelCourt(category.label_court || '');
      setEditedDescription(category.description || '');
      setEditedCompteComptable(category.compte_comptable || '');
      setEditedIsFrequent(category.isFrequent || false);
    }
  }, [category, isCreateMode]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      // ESC to close
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // Arrow navigation (only if not in an input field)
      const target = e.target as HTMLElement;
      const isInputField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';

      if (!isInputField && onNavigate) {
        if (e.key === 'ArrowLeft' && canNavigatePrev) {
          onNavigate('prev');
        } else if (e.key === 'ArrowRight' && canNavigateNext) {
          onNavigate('next');
        }
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
        description: editedDescription,
        compte_comptable: editedCompteComptable,
        isFrequent: editedIsFrequent
      };

      onSave(newCategory);
      toast.success('Catégorie créée');
      onClose();
    }
  };

  const handleDelete = () => {
    if (window.confirm(`Êtes-vous sûr de vouloir supprimer la catégorie "${category?.nom}" ?`)) {
      if (onDelete && category) {
        onDelete(category.id);
      }
      toast.success('Catégorie supprimée');
      onClose();
    }
  };

  const typeLabels = {
    revenu: 'Revenu',
    depense: 'Dépense'
  };

  const typeColors = {
    revenu: 'bg-green-100 text-green-700',
    depense: 'bg-red-100 text-red-700'
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
        "fixed right-0 top-0 h-full w-full md:w-2/3 lg:w-1/2 bg-white dark:bg-dark-bg-secondary shadow-xl z-50",
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
                  {isCreateMode ? 'Nouvelle catégorie' : 'Détails de la catégorie'}
                </h2>
                {!isCreateMode && category && (
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                    {category.nom}
                  </p>
                )}
              </div>
            </div>

            {/* Navigation buttons */}
            <div className="flex items-center gap-2">
              {!isCreateMode && onNavigate && (
                <>
                  <button
                    onClick={() => onNavigate('prev')}
                    disabled={!canNavigatePrev}
                    className={cn(
                      "p-2 rounded-lg transition-colors",
                      canNavigatePrev
                        ? "hover:bg-gray-200 dark:hover:bg-dark-bg-primary text-gray-700 dark:text-dark-text-primary"
                        : "text-gray-400 dark:text-dark-text-muted cursor-not-allowed"
                    )}
                    title="Catégorie précédente (←)"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => onNavigate('next')}
                    disabled={!canNavigateNext}
                    className={cn(
                      "p-2 rounded-lg transition-colors",
                      canNavigateNext
                        ? "hover:bg-gray-200 dark:hover:bg-dark-bg-primary text-gray-700 dark:text-dark-text-primary"
                        : "text-gray-400 dark:text-dark-text-muted cursor-not-allowed"
                    )}
                    title="Catégorie suivante (→)"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-200 dark:hover:bg-dark-bg-primary rounded-lg transition-colors"
                title="Fermer (ESC)"
              >
                <X className="h-5 w-5 text-gray-500 dark:text-dark-text-muted" />
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 mt-4">
            {isCreateMode ? (
              <button
                onClick={handleCreate}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <CheckCircle className="h-4 w-4" />
                Créer la catégorie
              </button>
            ) : (
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/30 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Supprimer
              </button>
            )}
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
                {/* Nom de la catégorie */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Nom de la catégorie
                  </label>
                  <input
                    type="text"
                    value={editedNom}
                    onChange={(e) => setEditedNom(e.target.value)}
                    onBlur={() => handleFieldSave('nom', editedNom)}
                    disabled={isCreateMode}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                    placeholder="Ex: Cotisations"
                  />
                </div>

                {/* Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Type
                  </label>
                  <select
                    value={editedType}
                    onChange={(e) => {
                      const newType = e.target.value as 'revenu' | 'depense';
                      setEditedType(newType);
                      if (!isCreateMode) handleFieldSave('type', newType);
                    }}
                    disabled={isCreateMode}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                  >
                    <option value="revenu">Revenu</option>
                    <option value="depense">Dépense</option>
                  </select>
                </div>

                {/* Favori */}
                <div>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editedIsFrequent}
                      onChange={(e) => {
                        setEditedIsFrequent(e.target.checked);
                        if (!isCreateMode) handleFieldSave('isFrequent', e.target.checked);
                      }}
                      disabled={isCreateMode}
                      className="w-4 h-4 text-blue-600 border-gray-300 dark:border-dark-border rounded focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-dark-text-primary flex items-center gap-2">
                      <Star className={cn("h-4 w-4", editedIsFrequent && "fill-yellow-500 text-yellow-500")} />
                      Marquer comme favori (affichée en premier dans les listes)
                    </span>
                  </label>
                </div>

                {/* Label court */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Label court
                  </label>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editedLabelCourt}
                      onChange={(e) => setEditedLabelCourt(e.target.value)}
                      onBlur={() => handleFieldSave('label_court', editedLabelCourt)}
                      disabled={isCreateMode}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                      placeholder="Ex: Cotis, Sorties, Matériel"
                    />
                    <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                      Nom court pour affichage dans les filtres rapides (badges). Si vide, le premier mot du nom sera utilisé.
                    </p>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Description
                  </label>
                  <textarea
                    value={editedDescription}
                    onChange={(e) => setEditedDescription(e.target.value)}
                    onBlur={() => handleFieldSave('description', editedDescription)}
                    disabled={isCreateMode}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                    placeholder="Description de la catégorie (optionnel)"
                    rows={3}
                  />
                </div>

                {/* Code comptable par défaut */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Code comptable par défaut
                  </label>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editedCompteComptable}
                      onChange={(e) => setEditedCompteComptable(e.target.value)}
                      onBlur={() => handleFieldSave('compte_comptable', editedCompteComptable)}
                      disabled={isCreateMode}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                      placeholder="Ex: 730-00"
                    />

                    {/* Indicateur de validation en temps réel */}
                    {editedCompteComptable && (
                      <div className={cn(
                        "flex items-start gap-2 p-3 rounded-lg text-sm",
                        matchingCodesInfo.count > 0
                          ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
                          : "bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800"
                      )}>
                        <div className="flex-shrink-0 mt-0.5">
                          {matchingCodesInfo.count > 0 ? (
                            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                          )}
                        </div>
                        <div className="flex-1">
                          {matchingCodesInfo.count > 0 ? (
                            <>
                              <p className="font-medium text-green-800 dark:text-green-300">
                                ✓ {matchingCodesInfo.count} code{matchingCodesInfo.count > 1 ? 's' : ''} sera{matchingCodesInfo.count > 1 ? 'ont' : ''} filtré{matchingCodesInfo.count > 1 ? 's' : ''}
                              </p>
                              {matchingCodesInfo.codes.length > 0 && (
                                <div className="mt-2 space-y-1">
                                  <p className="text-xs text-green-700 dark:text-green-400">Exemples de codes filtrés :</p>
                                  {matchingCodesInfo.codes.map(code => (
                                    <p key={code.code} className="text-xs font-mono text-green-700 dark:text-green-400">
                                      • {code.code} - {code.label}
                                    </p>
                                  ))}
                                  {matchingCodesInfo.count > 5 && (
                                    <p className="text-xs text-green-600 dark:text-green-400 italic">
                                      ... et {matchingCodesInfo.count - 5} autre{matchingCodesInfo.count - 5 > 1 ? 's' : ''}
                                    </p>
                                  )}
                                </div>
                              )}
                            </>
                          ) : (
                            <>
                              <p className="font-medium text-yellow-800 dark:text-yellow-300">
                                ⚠️ Aucun code trouvé pour ce préfixe
                              </p>
                              <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-1">
                                Exemples de préfixes valides :
                              </p>
                              <ul className="text-xs text-yellow-700 dark:text-yellow-400 mt-1 space-y-0.5">
                                <li>• <code className="font-mono bg-yellow-100 dark:bg-yellow-900/30 px-1 rounded">730-00</code> → filtre 730-00-XXX</li>
                                <li>• <code className="font-mono bg-yellow-100 dark:bg-yellow-900/30 px-1 rounded">613</code> → filtre 613-XX-XXX</li>
                                <li>• <code className="font-mono bg-yellow-100 dark:bg-yellow-900/30 px-1 rounded">618-00-732</code> → code exact uniquement</li>
                              </ul>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Aperçu visuel */}
            <div>
              <h3 className="font-medium text-gray-900 dark:text-dark-text-primary mb-4 flex items-center gap-2">
                <Info className="h-5 w-5" />
                Aperçu visuel
              </h3>
              <div className="bg-gray-50 dark:bg-dark-bg-tertiary border border-gray-200 dark:border-dark-border rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-gray-900 dark:text-dark-text-primary">
                    {editedNom || 'Nom de la catégorie'}
                  </span>
                  <span className={cn(
                    "px-2 py-0.5 text-xs rounded-full",
                    typeColors[editedType]
                  )}>
                    {typeLabels[editedType]}
                  </span>
                  {editedLabelCourt && (
                    <span className="text-xs text-gray-500 dark:text-dark-text-muted">
                      Badge: {editedLabelCourt}
                    </span>
                  )}
                </div>
                {editedDescription && (
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-2">
                    {editedDescription}
                  </p>
                )}
              </div>
            </div>

            {/* Note d'information */}
            {!isCreateMode && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex gap-3">
                  <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-300">Auto-sauvegarde activée</p>
                    <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
                      Vos modifications sont automatiquement sauvegardées lorsque vous quittez un champ.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
