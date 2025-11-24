import React, { useState, useEffect } from 'react';
import { Package, Plus, Filter, Search, Camera, AlertCircle, Eye } from 'lucide-react';
import { InventoryItemService } from '@/services/inventoryItemService';
import { InventoryConfigService } from '@/services/inventoryConfigService';
import { InventoryItem, ItemType, Location } from '@/types/inventory';
import { useAuth } from '@/contexts/AuthContext';
import { MaterielDetailView } from './MaterielDetailView';
import toast from 'react-hot-toast';
import { cn } from '@/utils/utils';

export function MaterielPage() {
  const { clubId } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [types, setTypes] = useState<ItemType[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtres
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterStatut, setFilterStatut] = useState<'' | 'disponible' | 'prete' | 'maintenance' | 'hors_service'>('');
  const [filterEmplacement, setFilterEmplacement] = useState<string>('');

  // Modal
  const [detailViewItem, setDetailViewItem] = useState<InventoryItem | null>(null);
  const [isCreateMode, setIsCreateMode] = useState(false);

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    disponible: 0,
    prete: 0,
    maintenance: 0,
    hors_service: 0
  });

  useEffect(() => {
    if (clubId) {
      loadData();
    }
  }, [clubId, filterType, filterStatut, filterEmplacement, searchTerm]);

  const loadData = async () => {
    if (!clubId) return;

    try {
      setLoading(true);

      // Charger types et emplacements en parallèle
      const [typesData, locationsData] = await Promise.all([
        InventoryConfigService.getItemTypes(clubId),
        InventoryConfigService.getLocations(clubId)
      ]);

      setTypes(typesData);
      setLocations(locationsData);

      // Charger matériel avec filtres
      const filters: any = {};
      if (filterType) filters.typeId = filterType;
      if (filterStatut) filters.statut = filterStatut;
      if (filterEmplacement) filters.emplacementId = filterEmplacement;
      if (searchTerm) filters.search = searchTerm;

      const itemsData = await InventoryItemService.getItems(clubId, filters);
      setItems(itemsData);

      // Calculer stats
      const statsData = {
        total: itemsData.length,
        disponible: itemsData.filter(i => i.statut === 'disponible').length,
        prete: itemsData.filter(i => i.statut === 'prete').length,
        maintenance: itemsData.filter(i => i.statut === 'maintenance').length,
        hors_service: itemsData.filter(i => i.statut === 'hors_service').length
      };
      setStats(statsData);
    } catch (error: any) {
      console.error('Erreur chargement matériel:', error);
      toast.error(error.message || 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = () => {
    if (types.length === 0) {
      toast.error('Veuillez d\'abord créer au moins un type de matériel dans les paramètres');
      return;
    }

    // Créer un matériel vide pour le mode création
    const emptyItem: InventoryItem = {
      id: '',
      numero_serie: '',
      typeId: types[0].id,
      statut: 'disponible',
      emplacementId: locations.length > 0 ? locations[0].id : '',
      photos: [],
      valeur_achat: 0,
      createdAt: undefined as any,
      updatedAt: undefined as any
    };

    setDetailViewItem(emptyItem);
    setIsCreateMode(true);
  };

  const handleRowClick = (item: InventoryItem) => {
    setDetailViewItem(item);
    setIsCreateMode(false);
  };

  const handleCloseDetail = () => {
    setDetailViewItem(null);
    setIsCreateMode(false);
  };

  const handleSaveDetail = () => {
    loadData();
    handleCloseDetail();
  };

  const getTypeName = (typeId: string) => {
    const type = types.find(t => t.id === typeId);
    return type?.nom || 'Type inconnu';
  };

  const getLocationName = (locationId: string) => {
    const location = locations.find(l => l.id === locationId);
    return location?.nom || 'Emplacement inconnu';
  };

  const getStatutBadge = (statut: string) => {
    const badges = {
      disponible: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      prete: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      maintenance: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
      hors_service: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
    };

    const labels = {
      disponible: 'Disponible',
      prete: 'Prêté',
      maintenance: 'Maintenance',
      hors_service: 'Hors service'
    };

    return (
      <span className={cn('px-2 py-1 text-xs font-medium rounded-full', badges[statut as keyof typeof badges])}>
        {labels[statut as keyof typeof labels]}
      </span>
    );
  };

  const itemsNeedingMaintenance = items.filter(item => {
    if (!item.date_prochaine_maintenance) return false;
    return item.date_prochaine_maintenance.toMillis() <= Date.now();
  }).length;

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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">Matériel Unitaire</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-dark-text-secondary">
            Gestion du matériel individuel (régulateurs, BC, lampes...)
          </p>
        </div>

        <button
          onClick={handleCreateNew}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nouveau matériel
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-dark-text-secondary">Total</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">{stats.total}</p>
            </div>
            <Package className="h-8 w-8 text-gray-400" />
          </div>
        </div>

        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-700 dark:text-green-300">Disponible</p>
              <p className="text-2xl font-bold text-green-900 dark:text-green-100">{stats.disponible}</p>
            </div>
            <Package className="h-8 w-8 text-green-600" />
          </div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-700 dark:text-blue-300">Prêté</p>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{stats.prete}</p>
            </div>
            <Package className="h-8 w-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-yellow-700 dark:text-yellow-300">Maintenance</p>
              <p className="text-2xl font-bold text-yellow-900 dark:text-yellow-100">{stats.maintenance}</p>
            </div>
            <Package className="h-8 w-8 text-yellow-600" />
          </div>
        </div>

        <div className="bg-red-50 dark:bg-red-900/20 rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-700 dark:text-red-300">Hors service</p>
              <p className="text-2xl font-bold text-red-900 dark:text-red-100">{stats.hors_service}</p>
            </div>
            <Package className="h-8 w-8 text-red-600" />
          </div>
        </div>
      </div>

      {/* Alert - Maintenance */}
      {itemsNeedingMaintenance > 0 && (
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-orange-900 dark:text-orange-200">
                Maintenance requise
              </h3>
              <p className="mt-1 text-sm text-orange-800 dark:text-orange-300">
                {itemsNeedingMaintenance} matériel(s) nécessitent une maintenance ou révision.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow p-4">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-5 w-5 text-gray-400" />
          <h3 className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">Filtres</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
            />
          </div>

          {/* Type */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
          >
            <option value="">Tous les types</option>
            {types.map(type => (
              <option key={type.id} value={type.id}>{type.nom}</option>
            ))}
          </select>

          {/* Statut */}
          <select
            value={filterStatut}
            onChange={(e) => setFilterStatut(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
          >
            <option value="">Tous les statuts</option>
            <option value="disponible">Disponible</option>
            <option value="prete">Prêté</option>
            <option value="maintenance">Maintenance</option>
            <option value="hors_service">Hors service</option>
          </select>

          {/* Emplacement */}
          <select
            value={filterEmplacement}
            onChange={(e) => setFilterEmplacement(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
          >
            <option value="">Tous les emplacements</option>
            {locations.filter(l => l.actif).map(location => (
              <option key={location.id} value={location.id}>{location.nom}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
          <thead className="bg-gray-50 dark:bg-dark-bg-tertiary">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                N° Série
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                Nom
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                Emplacement
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                Statut
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                Photos
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-500 dark:text-dark-text-secondary">
                  Aucun matériel trouvé
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary transition-colors"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                    {item.numero_serie}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-dark-text-secondary">
                    {getTypeName(item.typeId)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-dark-text-primary">
                    {item.nom || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-dark-text-secondary">
                    {getLocationName(item.emplacementId)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatutBadge(item.statut)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-dark-text-secondary">
                    <div className="flex items-center gap-1">
                      <Camera className="h-4 w-4" />
                      <span>{item.photos?.length || 0}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleRowClick(item)}
                      className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                      title="Consulter"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {detailViewItem && (
        <MaterielDetailView
          item={detailViewItem}
          isCreateMode={isCreateMode}
          onClose={handleCloseDetail}
          onSave={handleSaveDetail}
        />
      )}
    </div>
  );
}
