/**
 * Événements Settings
 * Main page for managing dive locations and their tariffs
 * Layout: List (left) + Detail Panel (right 800px)
 */

import { useState, useEffect } from 'react';
import { Plus, Search, Eye } from 'lucide-react';
import { DiveLocation } from '@/types/tariff.types';
import { DiveLocationService } from '@/services/diveLocationService';
import { LocationDetailView } from './LocationDetailView';
import { SettingsHeader } from './SettingsHeader';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

export function EvenementsSettings() {
  const { clubId, user } = useAuth();
  const [locations, setLocations] = useState<DiveLocation[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<DiveLocation | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // Safety check: wait for clubId to load
  if (!clubId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 mb-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
          </div>
          <p className="text-gray-500 dark:text-dark-text-muted">
            Chargement...
          </p>
        </div>
      </div>
    );
  }

  // Load locations
  useEffect(() => {
    const loadLocations = async () => {
      if (!clubId) return;

      try {
        setLoading(true);
        const data = await DiveLocationService.getAllLocations(clubId);
        setLocations(data);
      } catch (error) {
        console.error('Error loading locations:', error);
        toast.error('Erreur lors du chargement des lieux');
      } finally {
        setLoading(false);
      }
    };

    loadLocations();
  }, [clubId]);

  // Filter locations by search query
  const filteredLocations = locations.filter(location => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      location.name.toLowerCase().includes(query) ||
      location.country.toLowerCase().includes(query) ||
      location.region?.toLowerCase().includes(query)
    );
  });

  // Handle update location
  const handleUpdateLocation = async (locationId: string, updates: Partial<DiveLocation>) => {
    if (!clubId) return;

    try {
      await DiveLocationService.updateLocation(clubId, locationId, updates);

      // Update local state
      setLocations(locations.map(loc =>
        loc.id === locationId ? { ...loc, ...updates } : loc
      ));

      // Update selected location if it's the one being edited
      if (selectedLocation?.id === locationId) {
        setSelectedLocation({ ...selectedLocation, ...updates });
      }
    } catch (error) {
      console.error('Error updating location:', error);
      throw error; // Re-throw to let LocationDetailView handle toast
    }
  };

  // Handle create location
  const handleCreateLocation = async (data: Omit<DiveLocation, 'id' | 'created_at' | 'updated_at' | 'created_by'>) => {
    if (!clubId || !user) return;

    try {
      const locationId = await DiveLocationService.createLocation(clubId, user.uid, data);

      // Reload locations
      const updatedLocations = await DiveLocationService.getAllLocations(clubId);
      setLocations(updatedLocations);

      setIsCreating(false);
    } catch (error) {
      console.error('Error creating location:', error);
      throw error; // Re-throw to let LocationDetailView handle toast
    }
  };

  // Handle delete location with cascade check
  const handleDeleteLocation = async (locationId: string) => {
    if (!clubId) return;

    try {
      // Check if location has tariffs
      const location = locations.find(loc => loc.id === locationId);
      if (location && location.tariffs && location.tariffs.length > 0) {
        // Show warning about cascade delete
        const confirmMessage = `Ce lieu contient ${location.tariffs.length} tarif(s).\n\nLa suppression du lieu supprimera également tous ses tarifs.\n\nÊtes-vous sûr de vouloir continuer ?`;
        if (!window.confirm(confirmMessage)) {
          return;
        }
      }

      await DiveLocationService.deleteLocation(clubId, locationId);

      // Update local state - remove deleted location
      setLocations(locations.filter(loc => loc.id !== locationId));
    } catch (error) {
      console.error('Error deleting location:', error);
      throw error; // Re-throw to let LocationDetailView handle toast
    }
  };

  // Handle close detail panel
  const handleClosePanel = () => {
    setSelectedLocation(null);
    setIsCreating(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-7xl mx-auto">
        <SettingsHeader
          breadcrumb={['Paramètres', 'Événements']}
          title="Événements"
          description="Gestion des lieux de plongée et tarifs"
        />

        <div className="mb-6 flex justify-end">
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
          >
            <Plus className="h-4 w-4" />
            Nouveau lieu
          </button>
        </div>

        {/* Search Bar */}
        <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border mb-6">
        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
            <input
              type="text"
              placeholder="Rechercher un lieu..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 dark:border-dark-border rounded-lg focus:ring-1 focus:ring-gray-400 focus:border-gray-400 bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary placeholder:text-gray-400 dark:placeholder:text-dark-text-muted"
            />
          </div>
        </div>
        </div>

        {/* Locations Table */}
        <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 mb-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
              </div>
              <p className="text-gray-500 dark:text-dark-text-muted">
                Chargement...
              </p>
            </div>
          </div>
        ) : filteredLocations.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-dark-bg-tertiary mb-4">
              <Search className="h-8 w-8 text-gray-400 dark:text-dark-text-muted" />
            </div>
            <p className="text-gray-500 dark:text-dark-text-muted text-sm">
              {searchQuery ? 'Aucun lieu trouvé' : 'Aucun lieu pour le moment'}
            </p>
            {!searchQuery && (
              <p className="text-gray-400 dark:text-dark-text-muted text-xs mt-1">
                Utilisez le bouton ci-dessus pour en créer un
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50 dark:bg-dark-bg-tertiary border-b border-gray-200 dark:border-dark-border">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                    Nom
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                    Adresse
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                    Tarifs
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                {filteredLocations.map(location => (
                  <tr
                    key={location.id}
                    className="hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary cursor-pointer transition-colors"
                    onClick={() => setSelectedLocation(location)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                      {location.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-dark-text-secondary">
                      {location.address || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-600 dark:text-dark-text-secondary">
                      {location.tariffs?.length || 0} tarif(s)
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLocation(location);
                        }}
                        className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded transition-colors"
                        title="Voir les détails"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </div>

        {/* Detail Panel */}
        {(selectedLocation || isCreating) && (
        <LocationDetailView
          location={selectedLocation}
          isCreateMode={isCreating}
          onClose={handleClosePanel}
          onUpdate={handleUpdateLocation}
          onCreate={handleCreateLocation}
          onDelete={handleDeleteLocation}
        />
        )}
      </div>
    </div>
  );
}
