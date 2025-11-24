import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, X, Package } from 'lucide-react';
import { InventoryConfigService } from '@/services/inventoryConfigService';
import { ItemType, CustomField } from '@/types/inventory';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { cn } from '@/utils/utils';

const FIELD_TYPES = [
  { value: 'text', label: 'Texte' },
  { value: 'number', label: 'Nombre' },
  { value: 'select', label: 'Liste déroulante' },
  { value: 'date', label: 'Date' }
];

export function TypesMaterielConfig() {
  const { clubId } = useAuth();
  const [itemTypes, setItemTypes] = useState<ItemType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingType, setEditingType] = useState<ItemType | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<Partial<ItemType>>({
    nom: '',
    description: '',
    code_prefix: '',
    custom_fields: [],
    actif: true
  });

  useEffect(() => {
    loadItemTypes();
  }, [clubId]);

  const loadItemTypes = async () => {
    if (!clubId) return;

    try {
      setLoading(true);
      const types = await InventoryConfigService.getItemTypes(clubId);
      setItemTypes(types);
    } catch (error) {
      console.error('Erreur chargement types:', error);
      toast.error('Erreur lors du chargement des types de matériel');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setIsCreating(true);
    setEditingType(null);
    setFormData({
      nom: '',
      description: '',
      code_prefix: '',
      custom_fields: [],
      actif: true
    });
  };

  const handleEdit = (type: ItemType) => {
    setEditingType(type);
    setIsCreating(false);
    setFormData({
      nom: type.nom,
      description: type.description,
      code_prefix: type.code_prefix,
      custom_fields: [...type.custom_fields],
      actif: type.actif
    });
  };

  const handleCancel = () => {
    setEditingType(null);
    setIsCreating(false);
    setFormData({
      nom: '',
      description: '',
      code_prefix: '',
      custom_fields: [],
      actif: true
    });
  };

  const handleSave = async () => {
    if (!clubId || !formData.nom || !formData.code_prefix) {
      toast.error('Nom et préfixe de code sont obligatoires');
      return;
    }

    try {
      if (editingType) {
        // Update existing type
        await InventoryConfigService.updateItemType(clubId, editingType.id, formData);
        toast.success('Type de matériel mis à jour');
      } else {
        // Create new type
        await InventoryConfigService.createItemType(clubId, formData as Omit<ItemType, 'id' | 'createdAt' | 'updatedAt'>);
        toast.success('Type de matériel créé');
      }

      await loadItemTypes();
      handleCancel();
    } catch (error) {
      console.error('Erreur sauvegarde type:', error);
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  const handleDelete = async (type: ItemType) => {
    if (!clubId) return;

    const confirmed = window.confirm(
      `Êtes-vous sûr de vouloir supprimer le type "${type.nom}" ?\n\n` +
      `Cette action est irréversible. Si du matériel utilise ce type, la suppression sera bloquée.`
    );

    if (!confirmed) return;

    try {
      await InventoryConfigService.deleteItemType(clubId, type.id);
      toast.success('Type de matériel supprimé');
      await loadItemTypes();
    } catch (error: any) {
      console.error('Erreur suppression type:', error);
      toast.error(error.message || 'Erreur lors de la suppression');
    }
  };

  const addCustomField = () => {
    setFormData({
      ...formData,
      custom_fields: [
        ...(formData.custom_fields || []),
        {
          id: `field_${Date.now()}`,
          nom: '',
          type: 'text',
          obligatoire: false,
          options: []
        }
      ]
    });
  };

  const updateCustomField = (index: number, field: Partial<CustomField>) => {
    const updatedFields = [...(formData.custom_fields || [])];
    updatedFields[index] = { ...updatedFields[index], ...field };
    setFormData({ ...formData, custom_fields: updatedFields });
  };

  const removeCustomField = (index: number) => {
    const updatedFields = (formData.custom_fields || []).filter((_, i) => i !== index);
    setFormData({ ...formData, custom_fields: updatedFields });
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
          <h2 className="text-xl font-semibold text-gray-900">Types de Matériel</h2>
          <p className="mt-1 text-sm text-gray-500">
            Configurez les types de matériel et leurs champs personnalisés
          </p>
        </div>
        <button
          onClick={handleCreate}
          disabled={isCreating || editingType !== null}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nouveau type
        </button>
      </div>

      {/* Create/Edit Form */}
      {(isCreating || editingType) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            {isCreating ? 'Créer un type de matériel' : 'Modifier le type de matériel'}
          </h3>

          <div className="space-y-4">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom du type *
                </label>
                <input
                  type="text"
                  value={formData.nom || ''}
                  onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                  placeholder="Ex: Régulateur"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Préfixe de code *
                </label>
                <input
                  type="text"
                  value={formData.code_prefix || ''}
                  onChange={(e) => setFormData({ ...formData, code_prefix: e.target.value.toUpperCase() })}
                  placeholder="Ex: REG"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md uppercase"
                  maxLength={5}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Description du type de matériel"
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>

            {/* Custom Fields */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Champs personnalisés
                </label>
                <button
                  onClick={addCustomField}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  + Ajouter un champ
                </button>
              </div>

              {formData.custom_fields && formData.custom_fields.length > 0 ? (
                <div className="space-y-3">
                  {formData.custom_fields.map((field, index) => (
                    <div key={field.id} className="bg-white border border-gray-300 rounded-md p-3">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <input
                            type="text"
                            value={field.nom}
                            onChange={(e) => updateCustomField(index, { nom: e.target.value })}
                            placeholder="Nom du champ"
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                          />
                        </div>

                        <div>
                          <select
                            value={field.type}
                            onChange={(e) => updateCustomField(index, { type: e.target.value as any })}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                          >
                            {FIELD_TYPES.map(ft => (
                              <option key={ft.value} value={ft.value}>{ft.label}</option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center justify-between">
                          <label className="flex items-center text-sm">
                            <input
                              type="checkbox"
                              checked={field.obligatoire}
                              onChange={(e) => updateCustomField(index, { obligatoire: e.target.checked })}
                              className="mr-2"
                            />
                            Obligatoire
                          </label>

                          <button
                            onClick={() => removeCustomField(index)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {field.type === 'select' && (
                        <div className="mt-2">
                          <input
                            type="text"
                            value={field.options?.join(', ') || ''}
                            onChange={(e) => updateCustomField(index, {
                              options: e.target.value.split(',').map(o => o.trim()).filter(o => o)
                            })}
                            placeholder="Options (séparées par virgule)"
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">Aucun champ personnalisé</p>
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
                <span className="text-sm font-medium text-gray-700">Type actif</span>
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
                disabled={!formData.nom || !formData.code_prefix}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="h-4 w-4 inline mr-1" />
                Sauvegarder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Types List */}
      <div className="bg-white shadow-sm rounded-lg overflow-hidden">
        {itemTypes.length === 0 ? (
          <div className="text-center py-12">
            <Package className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Aucun type de matériel</h3>
            <p className="mt-1 text-sm text-gray-500">
              Commencez par créer votre premier type de matériel
            </p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Préfixe
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Champs personnalisés
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
              {itemTypes.map((type) => (
                <tr key={type.id} className={cn(!type.actif && 'opacity-50')}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{type.nom}</div>
                      {type.description && (
                        <div className="text-sm text-gray-500">{type.description}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {type.code_prefix}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {type.custom_fields.length > 0 ? (
                      <div className="text-sm text-gray-900">
                        {type.custom_fields.map(f => f.nom).join(', ')}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400 italic">Aucun</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={cn(
                      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                      type.actif
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    )}>
                      {type.actif ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleEdit(type)}
                      disabled={isCreating || editingType !== null}
                      className="text-blue-600 hover:text-blue-900 mr-4 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Edit2 className="h-4 w-4 inline" />
                    </button>
                    <button
                      onClick={() => handleDelete(type)}
                      disabled={isCreating || editingType !== null}
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
