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
  X, Save, Star, Plus, Edit2,
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
  const [expandedItemValue, setExpandedItemValue] = useState<string | null>(null);
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
        if (expandedItemValue) {
          // Close expanded item first
          setExpandedItemValue(null);
        } else {
          // Close entire modal
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleEscKey);
    return () => document.removeEventListener('keydown', handleEscKey);
  }, [onClose, expandedItemValue]);

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

                {/* Items Table - Accordion Style */}
                {items.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 dark:bg-dark-bg-secondary rounded-lg">
                    <p className="text-gray-600 dark:text-dark-text-secondary">
                      Aucun item. Ajoutez votre premier item.
                    </p>
                  </div>
                ) : (
                  <div className="bg-white dark:bg-dark-bg-primary border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-dark-bg-secondary border-b border-gray-200 dark:border-dark-border">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase w-10">⭐</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase">Label</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase w-24">Abrév.</th>
                          <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase w-20">Actif</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase w-16">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                        {items.map((item, index) => (
                          <>
                            {/* Compact Row */}
                            <tr
                              key={item.value}
                              className={`cursor-pointer transition-colors ${
                                expandedItemValue === item.value
                                  ? 'bg-blue-50 dark:bg-blue-900/10'
                                  : 'hover:bg-gray-50 dark:hover:bg-dark-bg-secondary'
                              }`}
                              onClick={() => canEdit && setExpandedItemValue(expandedItemValue === item.value ? null : item.value)}
                            >
                              {/* Favorite */}
                              <td className="px-3 py-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleFavorite(item.value);
                                  }}
                                  disabled={!canEdit}
                                  className={`p-1 rounded transition-colors ${canEdit ? 'hover:bg-amber-50 dark:hover:bg-amber-900/20' : 'opacity-50 cursor-not-allowed'}`}
                                >
                                  <Star className={`w-4 h-4 ${item.isFavorite ? 'fill-amber-400 text-amber-400' : 'text-gray-300 dark:text-gray-600'}`} />
                                </button>
                              </td>

                              {/* Label */}
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2">
                                  {item.icon && renderIcon(item.icon, 'w-4 h-4 text-gray-500 dark:text-gray-400')}
                                  <span className="text-sm text-gray-900 dark:text-dark-text-primary">
                                    {item.label}
                                  </span>
                                  {item.color && (
                                    <div
                                      className="w-3 h-3 rounded-full border border-gray-300 dark:border-gray-600"
                                      style={{ backgroundColor: item.color }}
                                    />
                                  )}
                                </div>
                              </td>

                              {/* ShortCode */}
                              <td className="px-3 py-2">
                                <span className="text-sm text-gray-600 dark:text-dark-text-secondary font-mono">
                                  {item.shortCode}
                                </span>
                              </td>

                              {/* Active */}
                              <td className="px-3 py-2 text-center">
                                <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                                  item.active
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300'
                                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                                }`}>
                                  {item.active ? 'Actif' : 'Inactif'}
                                </span>
                              </td>

                              {/* Edit Icon */}
                              <td className="px-3 py-2 text-right">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedItemValue(expandedItemValue === item.value ? null : item.value);
                                  }}
                                  disabled={!canEdit}
                                  className={`p-1.5 rounded transition-colors ${
                                    canEdit
                                      ? 'text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                                      : 'text-gray-400 cursor-not-allowed'
                                  }`}
                                  title="Modifier"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>

                            {/* Expanded Row */}
                            {expandedItemValue === item.value && (
                              <tr key={`${item.value}-expanded`}>
                                <td colSpan={5} className="px-0 py-0">
                                  <div className="bg-blue-50 dark:bg-blue-900/10 border-t border-blue-200 dark:border-blue-800">
                                    <div className="p-4 space-y-4">
                                      {/* Valeur BD (read-only) */}
                                      <div>
                                        <label className="block text-xs font-medium text-gray-600 dark:text-dark-text-secondary mb-1">
                                          Valeur BD
                                        </label>
                                        <input
                                          type="text"
                                          value={item.value}
                                          disabled
                                          className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-sm font-mono text-gray-600 dark:text-gray-400 cursor-not-allowed"
                                        />
                                      </div>

                                      <div className="grid grid-cols-2 gap-4">
                                        {/* Label */}
                                        <div>
                                          <label className="block text-xs font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                                            Label
                                          </label>
                                          <input
                                            type="text"
                                            defaultValue={item.label}
                                            onBlur={(e) => handleUpdateItemField(item.value, 'label', e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded text-sm
                                              bg-white dark:bg-dark-bg-secondary
                                              text-gray-900 dark:text-dark-text-primary
                                              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                          />
                                        </div>

                                        {/* ShortCode */}
                                        <div>
                                          <label className="block text-xs font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                                            Abréviation
                                          </label>
                                          <input
                                            type="text"
                                            defaultValue={item.shortCode}
                                            maxLength={10}
                                            onBlur={(e) => handleUpdateItemField(item.value, 'shortCode', e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded text-sm font-mono
                                              bg-white dark:bg-dark-bg-secondary
                                              text-gray-900 dark:text-dark-text-primary
                                              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                          />
                                        </div>
                                      </div>

                                      <div className="grid grid-cols-2 gap-4">
                                        {/* Icon Picker */}
                                        <div>
                                          <label className="block text-xs font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                                            Icône
                                          </label>
                                          <IconPicker
                                            value={item.icon}
                                            onChange={(icon) => handleUpdateItemField(item.value, 'icon', icon)}
                                            disabled={!canEdit}
                                          />
                                        </div>

                                        {/* Color Picker */}
                                        <div>
                                          <label className="block text-xs font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                                            Couleur
                                          </label>
                                          <ColorPicker
                                            value={item.color}
                                            onChange={(color) => handleUpdateItemField(item.value, 'color', color)}
                                            disabled={!canEdit}
                                          />
                                        </div>
                                      </div>

                                      <div className="grid grid-cols-2 gap-4">
                                        {/* Order */}
                                        <div>
                                          <label className="block text-xs font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                                            Ordre
                                          </label>
                                          <div className="flex items-center gap-2">
                                            <button
                                              onClick={() => handleMoveItem(item.value, 'up')}
                                              disabled={index === 0}
                                              className="px-3 py-2 border border-gray-300 dark:border-dark-border rounded text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                            >
                                              ▲
                                            </button>
                                            <span className="text-sm text-gray-600 dark:text-dark-text-secondary min-w-[40px] text-center">
                                              {item.order}
                                            </span>
                                            <button
                                              onClick={() => handleMoveItem(item.value, 'down')}
                                              disabled={index === items.length - 1}
                                              className="px-3 py-2 border border-gray-300 dark:border-dark-border rounded text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                            >
                                              ▼
                                            </button>
                                          </div>
                                        </div>

                                        {/* Active Toggle */}
                                        <div>
                                          <label className="block text-xs font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                                            Statut
                                          </label>
                                          <select
                                            value={item.active ? 'true' : 'false'}
                                            onChange={(e) => handleUpdateItemField(item.value, 'active', e.target.value === 'true')}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded text-sm
                                              bg-white dark:bg-dark-bg-secondary
                                              text-gray-900 dark:text-dark-text-primary
                                              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                          >
                                            <option value="true">Actif</option>
                                            <option value="false">Inactif</option>
                                          </select>
                                        </div>
                                      </div>

                                      {/* Action Buttons */}
                                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-blue-200 dark:border-blue-800">
                                        <button
                                          onClick={() => setExpandedItemValue(null)}
                                          className="px-4 py-2 text-sm text-gray-700 dark:text-dark-text-primary hover:bg-white dark:hover:bg-dark-bg-secondary rounded transition-colors"
                                        >
                                          Fermer
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        ))}
                      </tbody>
                    </table>
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
