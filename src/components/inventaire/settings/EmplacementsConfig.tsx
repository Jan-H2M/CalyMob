import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, X, MapPin, ToggleLeft, ToggleRight } from 'lucide-react';
import { InventoryConfigService } from '@/services/inventoryConfigService';
import { Location } from '@/types/inventory';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { cn } from '@/utils/utils';

export function EmplacementsConfig() {
  const { clubId } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<Partial<Location>>({
    nom: '',
    description: '',
    actif: true
  });

  useEffect(() => {
    loadLocations();
  }, [clubId]);

  const loadLocations = async () => {
    if (!clubId) return;

    try {
      setLoading(true);
      const locationsData = await InventoryConfigService.getLocations(clubId);
      setLocations(locationsData);
    } catch (error) {
      console.error('Erreur chargement emplacements:', error);
      toast.error('Erreur lors du chargement des emplacements');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setIsCreating(true);
    setEditingLocation(null);
    setFormData({
      nom: '',
      description: '',
      actif: true
    });
  };

  const handleEdit = (location: Location) => {
    setEditingLocation(location);
    setIsCreating(false);
    setFormData({
      nom: location.nom,
      description: location.description,
      actif: location.actif
    });
  };

  const handleCancel = () => {
    setEditingLocation(null);
    setIsCreating(false);
    setFormData({
      nom: '',
      description: '',
      actif: true
    });
  };

  const handleSave = async () => {
    if (!clubId || !formData.nom) {
      toast.error('Le nom est obligatoire');
      return;
    }

    try {
      if (editingLocation) {
        await InventoryConfigService.updateLocation(clubId, editingLocation.id, formData);
        toast.success('Emplacement mis à jour');
      } else {
        await InventoryConfigService.createLocation(clubId, formData as Omit<Location, 'id' | 'createdAt' | 'updatedAt'>);
        toast.success('Emplacement créé');
      }

      await loadLocations();
      handleCancel();
    } catch (error) {
      console.error('Erreur sauvegarde emplacement:', error);
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  const handleDelete = async (location: Location) => {
    if (!clubId) return;

    const confirmed = window.confirm(
      `Êtes-vous sûr de vouloir supprimer l'emplacement "${location.nom}" ?\n\n` +
      `Cette action est irréversible. Si du matériel est stocké à cet emplacement, la suppression sera bloquée.`
    );

    if (!confirmed) return;

    try {
      await InventoryConfigService.deleteLocation(clubId, location.id);
      toast.success('Emplacement supprimé');
      await loadLocations();
    } catch (error: any) {
      console.error('Erreur suppression emplacement:', error);
      toast.error(error.message || 'Erreur lors de la suppression');
    }
  };

  const handleToggleStatus = async (location: Location) => {
    if (!clubId) return;

    try {
      await InventoryConfigService.updateLocation(clubId, location.id, {
        actif: !location.actif
      });

      toast.success(
        location.actif
          ? 'Emplacement désactivé'
          : 'Emplacement activé'
      );

      await loadLocations();
    } catch (error) {
      console.error('Erreur changement statut:', error);
      toast.error('Erreur lors du changement de statut');
    }
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
          <h2 className="text-xl font-semibold text-gray-900">Emplacements de Stockage</h2>
          <p className="mt-1 text-sm text-gray-500">
            Configurez les emplacements où le matériel est stocké
          </p>
        </div>
        <button
          onClick={handleCreate}
          disabled={isCreating || editingLocation !== null}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nouvel emplacement
        </button>
      </div>

      {/* Create/Edit Form */}
      {(isCreating || editingLocation) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            {isCreating ? 'Créer un emplacement' : 'Modifier l\'emplacement'}
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nom de l'emplacement *
              </label>
              <input
                type="text"
                value={formData.nom || ''}
                onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                placeholder="Ex: Local du club"
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
                placeholder="Description de l'emplacement (adresse, détails...)"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>

            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.actif ?? true}
                  onChange={(e) => setFormData({ ...formData, actif: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-sm font-medium text-gray-700">Emplacement actif</span>
              </label>
              <p className="mt-1 text-xs text-gray-500">
                Les emplacements inactifs ne seront pas proposés lors de l'ajout de nouveau matériel
              </p>
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
                disabled={!formData.nom}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="h-4 w-4 inline mr-1" />
                Sauvegarder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Locations List */}
      <div className="bg-white shadow-sm rounded-lg overflow-hidden">
        {locations.length === 0 ? (
          <div className="text-center py-12">
            <MapPin className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Aucun emplacement</h3>
            <p className="mt-1 text-sm text-gray-500">
              Commencez par créer votre premier emplacement de stockage
            </p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Emplacement
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
              {locations.map((location) => (
                <tr key={location.id} className={cn(!location.actif && 'opacity-50')}>
                  <td className="px-6 py-4">
                    <div className="flex items-start">
                      <MapPin className="h-5 w-5 text-gray-400 mt-0.5 mr-3 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-medium text-gray-900">{location.nom}</div>
                        {location.description && (
                          <div className="text-sm text-gray-500 mt-1">{location.description}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => handleToggleStatus(location)}
                      disabled={isCreating || editingLocation !== null}
                      className={cn(
                        'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium transition-colors',
                        location.actif
                          ? 'bg-green-100 text-green-800 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-800 hover:bg-gray-200',
                        (isCreating || editingLocation !== null) && 'cursor-not-allowed opacity-50'
                      )}
                    >
                      {location.actif ? (
                        <>
                          <ToggleRight className="h-3 w-3 mr-1" />
                          Actif
                        </>
                      ) : (
                        <>
                          <ToggleLeft className="h-3 w-3 mr-1" />
                          Inactif
                        </>
                      )}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleEdit(location)}
                      disabled={isCreating || editingLocation !== null}
                      className="text-blue-600 hover:text-blue-900 mr-4 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Edit2 className="h-4 w-4 inline" />
                    </button>
                    <button
                      onClick={() => handleDelete(location)}
                      disabled={isCreating || editingLocation !== null}
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

      {/* Info Note */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-2">Conseils</h3>
        <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
          <li>Créez un emplacement pour chaque lieu de stockage physique du matériel</li>
          <li>Utilisez des noms clairs et explicites (ex: "Local Club", "Camionnette", "Chez responsable")</li>
          <li>Désactivez temporairement un emplacement au lieu de le supprimer pour conserver l'historique</li>
          <li>La suppression est bloquée si du matériel est encore associé à l'emplacement</li>
        </ul>
      </div>
    </div>
  );
}
