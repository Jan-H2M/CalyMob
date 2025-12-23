/**
 * ValueListDetailView Component
 *
 * Side panel (800px rechts) voor het bewerken van een waardelijst.
 * Details en Items in een enkele scrollbare view (geen tabs).
 *
 * LAYOUT: Volgt LAYOUT_STANDARDS.md - Side Panel Pattern (Option A)
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ValueListService } from '@/services/valueListService';
import type { ValueList, ValueListItem, ValueListCategory, ValueListType, CreateValueListItemDTO } from '@/types/valueList.types';
import { TYPE_LABELS } from '@/types/valueList.types';
import IconPicker from '../commun/IconPicker';
import ColorPicker from '../commun/ColorPicker';
import { renderIcon } from '@/utils/iconHelper';
import {
  X, Save, Star, Plus,
  AlertCircle, Loader, Trash2
} from 'lucide-react';
import toast from 'react-hot-toast';

interface ValueListDetailViewProps {
  valueList: ValueList | null;
  isCreateMode: boolean;
  onClose: () => void;
}

export default function ValueListDetailView({ valueList, isCreateMode, onClose }: ValueListDetailViewProps) {
  const { clubId, appUser } = useAuth();
  const [loading, setLoading] = useState(false);

  // Form data for list metadata
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<ValueListType>('club');

  // Items data
  const [items, setItems] = useState<ValueListItem[]>([]);
  // plain list view: no accordion/expanded rows
  const [newItem, setNewItem] = useState<Partial<CreateValueListItemDTO>>({});
  const [showNewItemForm, setShowNewItemForm] = useState(false);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');

  // Initialize form data
  useEffect(() => {
    if (valueList) {
      setName(valueList.name);
      setDescription(valueList.description || '');
      setType(valueList.type);
      setItems([...valueList.items].sort((a, b) => a.order - b.order));
    } else {
      setName('');
      setDescription('');
      setType('club');
      setItems([]);
    }
  }, [valueList]);

  // ESC key handler
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Close entire panel on Escape
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscKey);
    return () => document.removeEventListener('keydown', handleEscKey);
  }, [onClose]);

  const isSystemList = valueList?.type === 'system';
  const canEdit = !isSystemList;

  // Save list metadata
  const handleSaveMetadata = async () => {
    if (!clubId || !appUser) return;

    if (!name.trim()) {
      toast.error('Le nom est obligatoire');
      return;
    }

    try {
      setLoading(true);

      if (isCreateMode) {
        // Create new list
        await ValueListService.createValueList(
          clubId,
          {
            name: name.trim(),
            description: description.trim(),
            type,
            category: 'users', // Default category (required field but no longer editable)
            items: []
          },
          appUser.id
        );

        toast.success('Liste créée avec succès');
        onClose();
      } else if (valueList) {
        // Update existing list
        await ValueListService.updateValueList(clubId, valueList.id, {
          name: name.trim(),
          description: description.trim()
        });

        toast.success('✓ Sauvegardé', { duration: 1500, position: 'bottom-right' });
      }
    } catch (error: any) {
      console.error('Error saving metadata:', error);
      toast.error(error.message || 'Erreur lors de la sauvegarde');
    } finally {
      setLoading(false);
    }
  };

  // Update single item field
  const handleUpdateItemField = async (itemValue: string, field: keyof ValueListItem, value: any) => {
    if (!clubId || !valueList || !canEdit) return;

    try {
      await ValueListService.updateValueListItem(clubId, valueList.id, itemValue, { [field]: value });

      // Update local state
      setItems(prev => prev.map(item =>
        item.value === itemValue ? { ...item, [field]: value } : item
      ));

      toast.success('✓ Sauvegardé', { duration: 1500, position: 'bottom-right' });
    } catch (error: any) {
      console.error('Error updating item:', error);
      toast.error(error.message || 'Erreur lors de la mise à jour');
    }
  };

  // Toggle favorite
  const handleToggleFavorite = async (itemValue: string) => {
    if (!clubId || !valueList || !canEdit) return;

    try {
      await ValueListService.toggleItemFavorite(clubId, valueList.id, itemValue);

      // Update local state
      setItems(prev => prev.map(item =>
        item.value === itemValue ? { ...item, isFavorite: !item.isFavorite } : item
      ));

      toast.success('✓ Sauvegardé', { duration: 1500, position: 'bottom-right' });
    } catch (error: any) {
      console.error('Error toggling favorite:', error);
      toast.error(error.message || 'Erreur lors de la mise à jour');
    }
  };

  // Toggle active
  const handleToggleActive = async (itemValue: string) => {
    if (!clubId || !valueList || !canEdit) return;

    const item = items.find(i => i.value === itemValue);
    if (!item) return;

    await handleUpdateItemField(itemValue, 'active', !item.active);
  };

  // Delete item
  const handleDeleteItem = async (itemValue: string) => {
    if (!clubId || !valueList || !canEdit) return;

    if (!confirm('Supprimer cet item ?')) return;

    try {
      await ValueListService.deleteValueListItem(clubId, valueList.id, itemValue);

      // Update local state
      setItems(prev => prev.filter(item => item.value !== itemValue));

      toast.success('Item supprimé');
    } catch (error: any) {
      console.error('Error deleting item:', error);
      toast.error(error.message || 'Erreur lors de la suppression');
    }
  };

  // Add new item
  const handleAddItem = async () => {
    if (!clubId || !valueList || !canEdit) return;

    // Validate
    const errors = ValueListService.validateValueListItem(newItem);
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }

    try {
      await ValueListService.addValueListItem(clubId, valueList.id, newItem as CreateValueListItemDTO);

      // Reload items
      const updatedList = await ValueListService.getValueList(clubId, valueList.id);
      if (updatedList) {
        setItems([...updatedList.items].sort((a, b) => a.order - b.order));
      }

      // Reset form
      setNewItem({});
      setShowNewItemForm(false);

      toast.success('Item ajouté');
    } catch (error: any) {
      console.error('Error adding item:', error);
      toast.error(error.message || 'Erreur lors de l\'ajout');
    }
  };

  // Move item up/down
  const handleMoveItem = async (itemValue: string, direction: 'up' | 'down') => {
    if (!clubId || !valueList || !canEdit) return;

    const index = items.findIndex(i => i.value === itemValue);
    if (index === -1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= items.length) return;

    // Swap order values
    const newItems = [...items];
    const temp = newItems[index].order;
    newItems[index].order = newItems[newIndex].order;
    newItems[newIndex].order = temp;

    // Sort by new order
    newItems.sort((a, b) => a.order - b.order);

    try {
      // Update in Firestore
      await ValueListService.reorderValueListItems(
        clubId,
        valueList.id,
        newItems.map(item => ({ value: item.value, order: item.order }))
      );

      // Update local state
      setItems(newItems);

      toast.success('✓ Ordre mis à jour', { duration: 1500, position: 'bottom-right' });
    } catch (error: any) {
      console.error('Error reordering items:', error);
      toast.error(error.message || 'Erreur lors du réordonnancement');
    }
  };

  // Delete handler
  const handleDelete = async () => {
    if (!clubId || !valueList || deleteInput !== 'SUPPRIMER') return;

    try {
      setLoading(true);
      await ValueListService.deleteValueList(clubId, valueList.id);
      toast.success('Liste supprimée avec succès');
      onClose(); // Return to list view
    } catch (error: any) {
      console.error('Error deleting value list:', error);
      toast.error(error.message || 'Erreur lors de la suppression');
    } finally {
      setLoading(false);
      setDeleteConfirm(false);
      setDeleteInput('');
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 flex items-end justify-end z-[100]"
        onClick={onClose}
      >
        {/* Side Panel - 800px */}
        <div
          className="bg-white dark:bg-dark-bg-primary h-full w-full md:w-[800px] flex flex-col shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-dark-border flex-shrink-0">
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
                {isCreateMode ? 'Nouvelle liste de valeurs' : name}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {/* Delete Button - Only for edit mode and club lists */}
              {!isCreateMode && !isSystemList && (
                <button
                  onClick={() => setDeleteConfirm(true)}
                  className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                  title="Supprimer cette liste"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-gray-200 dark:hover:bg-dark-bg-secondary rounded-md transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* System List Warning */}
          {isSystemList && (
            <div className="mx-6 mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Cette liste est de type <strong>Système</strong> et ne peut pas être modifiée.
              </p>
            </div>
          )}

          {/* Content - Scrollable */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* Details Section */}
            <div className="space-y-3">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                    Nom <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => !isCreateMode && handleSaveMetadata()}
                    disabled={!canEdit && !isCreateMode}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg
                      bg-white dark:bg-dark-bg-secondary
                      text-gray-900 dark:text-dark-text-primary
                      focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                      disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onBlur={() => !isCreateMode && handleSaveMetadata()}
                    disabled={!canEdit && !isCreateMode}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg
                      bg-white dark:bg-dark-bg-secondary
                      text-gray-900 dark:text-dark-text-primary
                      focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                      disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Type (only in create mode) */}
                {isCreateMode && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                      Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value as ValueListType)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg
                        bg-white dark:bg-dark-bg-secondary
                        text-gray-900 dark:text-dark-text-primary
                        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="club">{TYPE_LABELS.club}</option>
                      <option value="system">{TYPE_LABELS.system}</option>
                    </select>
                    <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-secondary">
                      Les listes Système ne peuvent pas être modifiées après création
                    </p>
                  </div>
                )}
              </div>

            {/* Items Section - Only in edit mode */}
            {!isCreateMode && valueList && (
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-dark-border space-y-3">
                {/* Header with Add Button */}
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                    Items ({items.length})
                  </h3>
                  {canEdit && (
                    <button
                      onClick={() => setShowNewItemForm(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Ajouter un item</span>
                    </button>
                  )}
                </div>

                {/* Items - Plain List View */}
                {items.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 dark:bg-dark-bg-secondary rounded-lg">
                    <p className="text-gray-600 dark:text-dark-text-secondary">
                      Aucun item. Ajoutez votre premier item.
                    </p>
                  </div>
                ) : (
                  <div className="bg-white dark:bg-dark-bg-primary border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
                    <ul className="divide-y divide-gray-200 dark:divide-dark-border">
                      {items.map((item, index) => (
                        <li key={item.value} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-dark-bg-secondary">
                          <div className="flex items-center gap-3 min-w-0">
                            <button
                              onClick={() => handleToggleFavorite(item.value)}
                              disabled={!canEdit}
                              className={`p-1 rounded transition-colors ${canEdit ? 'hover:bg-amber-50 dark:hover:bg-amber-900/20' : 'opacity-50 cursor-not-allowed'}`}
                            >
                              <Star className={`w-4 h-4 ${item.isFavorite ? 'fill-amber-400 text-amber-400' : 'text-gray-300 dark:text-gray-600'}`} />
                            </button>

                            {item.icon && renderIcon(item.icon, 'w-4 h-4 text-gray-500 dark:text-gray-400')}

                            <div className="min-w-0">
                              <input
                                type="text"
                                defaultValue={item.label}
                                onBlur={(e) => handleUpdateItemField(item.value, 'label', e.target.value)}
                                className="w-full text-sm px-1 py-0.5 bg-transparent border-0 focus:ring-0 text-gray-900 dark:text-dark-text-primary"
                              />
                              <div className="text-xs text-gray-600 dark:text-dark-text-secondary font-mono">{item.shortCode}</div>
                            </div>

                            {item.color && (
                              <div
                                className="w-3 h-3 rounded-full border border-gray-300 dark:border-gray-600"
                                style={{ backgroundColor: item.color }}
                              />
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleToggleActive(item.value)}
                              disabled={!canEdit}
                              className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                                item.active
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300'
                                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                              }`}
                            >
                              {item.active ? 'Actif' : 'Inactif'}
                            </button>

                            <button
                              onClick={() => handleMoveItem(item.value, 'up')}
                              disabled={index === 0}
                              className="px-2 py-1 border border-gray-300 dark:border-dark-border rounded text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                              ▲
                            </button>
                            <button
                              onClick={() => handleMoveItem(item.value, 'down')}
                              disabled={index === items.length - 1}
                              className="px-2 py-1 border border-gray-300 dark:border-dark-border rounded text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                              ▼
                            </button>

                            <button
                              onClick={() => handleDeleteItem(item.value)}
                              disabled={!canEdit}
                              className="px-2 py-1 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                            >
                              Suppr.
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Add Item Form */}
                {canEdit && showNewItemForm && (
                  <div className="bg-gray-50 dark:bg-dark-bg-secondary rounded-lg p-3 space-y-2">
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                              Valeur BD <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={newItem.value || ''}
                              onChange={(e) => setNewItem({ ...newItem, value: e.target.value })}
                              placeholder="ca"
                              className="w-full px-2 py-1.5 border border-gray-300 dark:border-dark-border rounded text-sm font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                              Label <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={newItem.label || ''}
                              onChange={(e) => setNewItem({ ...newItem, label: e.target.value })}
                              placeholder="Comité d'Administration"
                              className="w-full px-2 py-1.5 border border-gray-300 dark:border-dark-border rounded text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                              Abréviation <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={newItem.shortCode || ''}
                              onChange={(e) => setNewItem({ ...newItem, shortCode: e.target.value })}
                              placeholder="CA"
                              maxLength={10}
                              className="w-full px-2 py-1.5 border border-gray-300 dark:border-dark-border rounded text-sm font-mono"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                              Icône
                            </label>
                            <IconPicker
                              value={newItem.icon}
                              onChange={(icon) => setNewItem({ ...newItem, icon })}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                              Couleur
                            </label>
                            <ColorPicker
                              value={newItem.color}
                              onChange={(color) => setNewItem({ ...newItem, color })}
                            />
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setShowNewItemForm(false);
                              setNewItem({});
                            }}
                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-white dark:hover:bg-dark-bg-primary transition-colors text-sm"
                          >
                            Annuler
                          </button>
                          <button
                            onClick={handleAddItem}
                            disabled={!newItem.value || !newItem.label || !newItem.shortCode}
                            className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                          >
                            Ajouter
                          </button>
                        </div>
                      </div>
                )}
              </div>
            )}
            </div>

          {/* Footer - Create Button (only in create mode) */}
          {isCreateMode && (
            <div className="flex-shrink-0 border-t border-gray-200 dark:border-dark-border p-6 bg-gray-50 dark:bg-dark-bg-secondary">
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-white dark:hover:bg-dark-bg-primary transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSaveMetadata}
                  disabled={loading || !name.trim()}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      <span>Création...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Créer</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]"
          onClick={() => {
            setDeleteConfirm(false);
            setDeleteInput('');
          }}
        >
          <div
            className="bg-white dark:bg-dark-bg-primary rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-dark-text-primary">
                  Supprimer la liste "{name}"?
                </h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-dark-text-secondary">
                  Cette action est irréversible. Tous les items de cette liste seront définitivement supprimés.
                </p>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                Tapez <span className="font-mono font-bold">SUPPRIMER</span> pour confirmer:
              </label>
              <input
                type="text"
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg
                  bg-white dark:bg-dark-bg-secondary
                  text-gray-900 dark:text-dark-text-primary
                  focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="SUPPRIMER"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setDeleteConfirm(false);
                  setDeleteInput('');
                }}
                className="flex-1 px-4 py-2 bg-gray-100 dark:bg-dark-bg-secondary text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                disabled={loading}
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                disabled={loading || deleteInput !== 'SUPPRIMER'}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    <span>Suppression...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Supprimer</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
