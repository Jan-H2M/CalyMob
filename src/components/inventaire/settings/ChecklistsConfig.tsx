import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, X, ClipboardList, Copy, GripVertical, Check } from 'lucide-react';
import { InventoryConfigService } from '@/services/inventoryConfigService';
import { Checklist, ChecklistItem, ItemType } from '@/types/inventory';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { cn } from '@/utils/utils';

export function ChecklistsConfig() {
  const { clubId } = useAuth();
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [itemTypes, setItemTypes] = useState<ItemType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingChecklist, setEditingChecklist] = useState<Checklist | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<Partial<Checklist>>({
    nom: '',
    description: '',
    items: [],
    type_materiel_ids: [],
    actif: true
  });

  useEffect(() => {
    loadData();
  }, [clubId]);

  const loadData = async () => {
    if (!clubId) return;

    try {
      setLoading(true);
      const [checklistsData, typesData] = await Promise.all([
        InventoryConfigService.getChecklists(clubId),
        InventoryConfigService.getItemTypes(clubId)
      ]);
      setChecklists(checklistsData);
      setItemTypes(typesData);
    } catch (error) {
      console.error('Erreur chargement données:', error);
      toast.error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setIsCreating(true);
    setEditingChecklist(null);
    setFormData({
      nom: '',
      description: '',
      items: [],
      type_materiel_ids: [],
      actif: true
    });
  };

  const handleEdit = (checklist: Checklist) => {
    setEditingChecklist(checklist);
    setIsCreating(false);
    setFormData({
      nom: checklist.nom,
      description: checklist.description,
      items: [...checklist.items],
      type_materiel_ids: [...checklist.type_materiel_ids],
      actif: checklist.actif
    });
  };

  const handleCancel = () => {
    setEditingChecklist(null);
    setIsCreating(false);
    setFormData({
      nom: '',
      description: '',
      items: [],
      type_materiel_ids: [],
      actif: true
    });
  };

  const handleSave = async () => {
    if (!clubId || !formData.nom) {
      toast.error('Le nom est obligatoire');
      return;
    }

    if (!formData.items || formData.items.length === 0) {
      toast.error('Ajoutez au moins un élément à la checklist');
      return;
    }

    try {
      if (editingChecklist) {
        await InventoryConfigService.updateChecklist(clubId, editingChecklist.id, formData);
        toast.success('Checklist mise à jour');
      } else {
        await InventoryConfigService.createChecklist(clubId, formData as Omit<Checklist, 'id' | 'createdAt' | 'updatedAt'>);
        toast.success('Checklist créée');
      }

      await loadData();
      handleCancel();
    } catch (error) {
      console.error('Erreur sauvegarde checklist:', error);
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  const handleDelete = async (checklist: Checklist) => {
    if (!clubId) return;

    const confirmed = window.confirm(
      `Êtes-vous sûr de vouloir supprimer la checklist "${checklist.nom}" ?\n\nCette action est irréversible.`
    );

    if (!confirmed) return;

    try {
      await InventoryConfigService.deleteChecklist(clubId, checklist.id);
      toast.success('Checklist supprimée');
      await loadData();
    } catch (error: any) {
      console.error('Erreur suppression checklist:', error);
      toast.error(error.message || 'Erreur lors de la suppression');
    }
  };

  const handleDuplicate = async (checklist: Checklist) => {
    if (!clubId) return;

    const newName = window.prompt(
      `Nom de la copie de "${checklist.nom}":`,
      `${checklist.nom} (copie)`
    );

    if (!newName) return;

    try {
      await InventoryConfigService.duplicateChecklist(clubId, checklist.id, newName);
      toast.success('Checklist dupliquée');
      await loadData();
    } catch (error: any) {
      console.error('Erreur duplication checklist:', error);
      toast.error(error.message || 'Erreur lors de la duplication');
    }
  };

  const addChecklistItem = () => {
    setFormData({
      ...formData,
      items: [
        ...(formData.items || []),
        {
          id: `item_${Date.now()}`,
          description: '',
          ordre: (formData.items?.length || 0) + 1,
          obligatoire: true
        }
      ]
    });
  };

  const updateChecklistItem = (index: number, item: Partial<ChecklistItem>) => {
    const updatedItems = [...(formData.items || [])];
    updatedItems[index] = { ...updatedItems[index], ...item };
    setFormData({ ...formData, items: updatedItems });
  };

  const removeChecklistItem = (index: number) => {
    const updatedItems = (formData.items || []).filter((_, i) => i !== index);
    // Recalculate order
    updatedItems.forEach((item, i) => {
      item.ordre = i + 1;
    });
    setFormData({ ...formData, items: updatedItems });
  };

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const items = [...(formData.items || [])];
    const newIndex = direction === 'up' ? index - 1 : index + 1;

    if (newIndex < 0 || newIndex >= items.length) return;

    [items[index], items[newIndex]] = [items[newIndex], items[index]];

    // Recalculate order
    items.forEach((item, i) => {
      item.ordre = i + 1;
    });

    setFormData({ ...formData, items });
  };

  const toggleTypeAssociation = (typeId: string) => {
    const current = formData.type_materiel_ids || [];
    const updated = current.includes(typeId)
      ? current.filter(id => id !== typeId)
      : [...current, typeId];
    setFormData({ ...formData, type_materiel_ids: updated });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Checklists d'Inspection</h2>
          <p className="mt-1 text-sm text-gray-500">
            Configurez les checklists pour l'inspection du matériel au retour
          </p>
        </div>
        <button
          onClick={handleCreate}
          disabled={isCreating || editingChecklist !== null}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nouvelle checklist
        </button>
      </div>

      {/* Create/Edit Form */}
      {(isCreating || editingChecklist) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            {isCreating ? 'Créer une checklist' : 'Modifier la checklist'}
          </h3>

          <div className="space-y-4">
            {/* Basic Info */}
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom de la checklist *
                </label>
                <input
                  type="text"
                  value={formData.nom || ''}
                  onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                  placeholder="Ex: Inspection régulateur"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Description de la checklist"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>

            {/* Type Associations */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Types de matériel associés
              </label>
              <div className="flex flex-wrap gap-2">
                {itemTypes.filter(t => t.actif).map((type) => (
                  <button
                    key={type.id}
                    onClick={() => toggleTypeAssociation(type.id)}
                    className={cn(
                      'inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border transition-colors',
                      (formData.type_materiel_ids || []).includes(type.id)
                        ? 'bg-blue-100 border-blue-300 text-blue-800'
                        : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
                    )}
                  >
                    {(formData.type_materiel_ids || []).includes(type.id) && (
                      <Check className="h-3 w-3 mr-1" />
                    )}
                    {type.nom}
                  </button>
                ))}
              </div>
              {itemTypes.filter(t => t.actif).length === 0 && (
                <p className="text-sm text-gray-500 italic">
                  Aucun type de matériel actif. Créez-en d'abord dans l'onglet "Types de Matériel".
                </p>
              )}
            </div>

            {/* Checklist Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Éléments de la checklist *
                </label>
                <button
                  onClick={addChecklistItem}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  + Ajouter un élément
                </button>
              </div>

              {formData.items && formData.items.length > 0 ? (
                <div className="space-y-2">
                  {formData.items.map((item, index) => (
                    <div key={item.id} className="bg-white border border-gray-300 rounded-md p-3">
                      <div className="flex items-start gap-3">
                        {/* Drag Handle */}
                        <div className="flex flex-col gap-1 pt-2">
                          <button
                            onClick={() => moveItem(index, 'up')}
                            disabled={index === 0}
                            className="text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <GripVertical className="h-4 w-4" />
                          </button>
                        </div>

                        {/* Order Number */}
                        <div className="flex-shrink-0 w-8 pt-2">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-xs font-medium text-gray-600">
                            {index + 1}
                          </span>
                        </div>

                        {/* Description */}
                        <div className="flex-1">
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => updateChecklistItem(index, { description: e.target.value })}
                            placeholder="Description de l'élément à vérifier"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
                          />
                        </div>

                        {/* Obligatoire */}
                        <div className="flex items-center pt-2">
                          <label className="flex items-center text-sm whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={item.obligatoire}
                              onChange={(e) => updateChecklistItem(index, { obligatoire: e.target.checked })}
                              className="mr-2"
                            />
                            Obligatoire
                          </label>
                        </div>

                        {/* Delete */}
                        <div className="pt-2">
                          <button
                            onClick={() => removeChecklistItem(index)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">Aucun élément. Ajoutez au moins un élément.</p>
              )}
            </div>

            {/* Active Toggle */}
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.actif ?? true}
                  onChange={(e) => setFormData({ ...formData, actif: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-sm font-medium text-gray-700">Checklist active</span>
              </label>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t">
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                <X className="h-4 w-4 inline mr-1" />
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={!formData.nom || !formData.items || formData.items.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="h-4 w-4 inline mr-1" />
                Sauvegarder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Checklists List */}
      <div className="bg-white shadow-sm rounded-lg overflow-hidden">
        {checklists.length === 0 ? (
          <div className="text-center py-12">
            <ClipboardList className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Aucune checklist</h3>
            <p className="mt-1 text-sm text-gray-500">
              Commencez par créer votre première checklist d'inspection
            </p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Checklist
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Éléments
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Types associés
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Statut
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {checklists.map((checklist) => (
                <tr key={checklist.id} className={cn(!checklist.actif && 'opacity-50')}>
                  <td className="px-6 py-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{checklist.nom}</div>
                      {checklist.description && (
                        <div className="text-sm text-gray-500">{checklist.description}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      {checklist.items.length} élément{checklist.items.length > 1 ? 's' : ''}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {checklist.type_materiel_ids.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {checklist.type_materiel_ids.map(typeId => {
                          const type = itemTypes.find(t => t.id === typeId);
                          return type ? (
                            <span key={typeId} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                              {type.nom}
                            </span>
                          ) : null;
                        })}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400 italic">Aucun</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={cn(
                      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                      checklist.actif
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    )}>
                      {checklist.actif ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleDuplicate(checklist)}
                      disabled={isCreating || editingChecklist !== null}
                      className="text-gray-600 hover:text-gray-900 mr-4 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Dupliquer"
                    >
                      <Copy className="h-4 w-4 inline" />
                    </button>
                    <button
                      onClick={() => handleEdit(checklist)}
                      disabled={isCreating || editingChecklist !== null}
                      className="text-blue-600 hover:text-blue-900 mr-4 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Edit2 className="h-4 w-4 inline" />
                    </button>
                    <button
                      onClick={() => handleDelete(checklist)}
                      disabled={isCreating || editingChecklist !== null}
                      className="text-red-600 hover:text-red-900 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="h-4 w-4 inline" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
