import { useState, useEffect } from 'react';
import { Plus, Filter, Search, Eye } from 'lucide-react';
import { InventoryItemService } from '@/services/inventoryItemService';
import { InventoryConfigService } from '@/services/inventoryConfigService';
import { AmortizationService, DepreciationSummary } from '@/services/amortizationService';
import { InventoryItem, ItemType } from '@/types/inventory';
import { useAuth } from '@/contexts/AuthContext';
import { MaterielDetailView } from './MaterielDetailView';
import { InventoryStats, InventoryStatsData, TankInspectionAlert } from '../common/InventoryStats';
import { ConditionBadge, getConditionRowClass, ConditionType } from '../common/ConditionBadge';
import toast from 'react-hot-toast';
import { cn } from '@/utils/utils';
import { logger } from '@/utils/logger';

export function MaterielPage() {
  const { clubId } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [types, setTypes] = useState<ItemType[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtres
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterStatut, setFilterStatut] = useState<'' | 'disponible' | 'prete' | 'maintenance' | 'hors_service'>('');

  // Modal
  const [detailViewItem, setDetailViewItem] = useState<InventoryItem | null>(null);
  const [isCreateMode, setIsCreateMode] = useState(false);

  // Stats
  const [stats, setStats] = useState<InventoryStatsData>({
    total: 0,
    disponible: 0,
    prete: 0,
    maintenance: 0,
    hors_service: 0
  });

  // Tank inspection alerts
  const [tankAlerts, setTankAlerts] = useState<TankInspectionAlert | null>(null);

  // Depreciation summary
  const [depreciation, setDepreciation] = useState<DepreciationSummary | null>(null);

  // Filter for condition
  const [filterCondition, setFilterCondition] = useState<string>('');

  // Filter for location
  const [filterLocation, setFilterLocation] = useState<string>('');

  useEffect(() => {
    if (clubId) {
      loadData();
    }
  }, [clubId, filterType, filterStatut, filterCondition, filterLocation, searchTerm]);

  const loadData = async () => {
    if (!clubId) return;

    try {
      setLoading(true);

      // Charger types
      const typesData = await InventoryConfigService.getItemTypes(clubId);
      setTypes(typesData);

      // Charger matériel avec filtres
      const filters: any = {};
      if (filterType) filters.typeId = filterType;
      if (filterStatut) filters.statut = filterStatut;
      if (filterCondition) filters.etat = filterCondition;
      if (filterLocation) filters.lieu_utilisation = filterLocation;
      if (searchTerm) filters.search = searchTerm;

      const itemsData = await InventoryItemService.getItems(clubId, filters);
      setItems(itemsData);

      // Calculer stats
      const statsData: InventoryStatsData = {
        total: itemsData.length,
        disponible: itemsData.filter(i => i.statut === 'disponible').length,
        prete: itemsData.filter(i => i.statut === 'prete').length,
        maintenance: itemsData.filter(i => i.statut === 'en_maintenance').length,
        hors_service: itemsData.filter(i => i.etat === 'hors_service').length
      };
      setStats(statsData);

      // Calculate tank inspection alerts
      try {
        const alertsData = await InventoryItemService.getTanksWithInspectionAlerts(clubId);
        setTankAlerts({
          overdue: alertsData.overdue.length,
          upcoming: alertsData.upcoming.length,
          ok: alertsData.ok.length
        });
      } catch (e) {
        logger.warn('Could not load tank alerts:', e);
      }

      // Calculate depreciation summary
      try {
        const typesMap: Record<string, ItemType> = {};
        typesData.forEach(t => { typesMap[t.id] = t; });
        const depSummary = AmortizationService.calculateDepreciationSummary(itemsData, typesMap);
        setDepreciation(depSummary);
      } catch (e) {
        logger.warn('Could not calculate depreciation:', e);
      }
    } catch (error: any) {
      logger.error('Erreur chargement matériel:', error);
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
    const emptyItem = {
      id: '',
      numero_serie: '',
      typeId: types[0].id,
      statut: 'disponible',
      valeur_achat: 0,
    } as InventoryItem;

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

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-BE', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">Matériel Unitaire</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
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

      {/* Stats Dashboard */}
      <InventoryStats
        stats={stats}
        tankAlerts={tankAlerts || undefined}
        depreciation={depreciation || undefined}
      />

      {/* Filters */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow p-4">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-5 w-5 text-gray-400 dark:text-dark-text-muted" />
          <h3 className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">Filtres</h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
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

          {/* Condition */}
          <select
            value={filterCondition}
            onChange={(e) => setFilterCondition(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
          >
            <option value="">Toutes conditions</option>
            <option value="excellent">✅ Excellent</option>
            <option value="bon">🟢 Bon</option>
            <option value="correct">🟡 Correct</option>
            <option value="mauvais">🟠 Usé</option>
            <option value="hors_service">🔴 Hors service</option>
          </select>

          {/* Statut */}
          <select
            value={filterStatut}
            onChange={(e) => setFilterStatut(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
          >
            <option value="">Tous les statuts</option>
            <option value="disponible">📍 Disponible</option>
            <option value="prete">👤 Prêté</option>
            <option value="en_maintenance">🔧 Maintenance</option>
          </select>

          {/* Lieu d'utilisation */}
          <select
            value={filterLocation}
            onChange={(e) => setFilterLocation(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
          >
            <option value="">Tous les lieux</option>
            <option value="carriere">🏔️ Carrière</option>
            <option value="piscine">🏊 Piscine</option>
            <option value="les_deux">📍 Les deux</option>
          </select>

        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
            <thead className="bg-gray-50 dark:bg-dark-bg-tertiary">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary uppercase tracking-wider">
                  Code
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary uppercase tracking-wider">
                  Marque / Modèle
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary uppercase tracking-wider">
                  Condition
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary uppercase tracking-wider">
                  Statut
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary uppercase tracking-wider">
                  Valeur
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
                    Aucun matériel trouvé
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const itemCondition = (item.etat || 'bon') as ConditionType;

                  // Statut badge styling
                  const getStatutBadge = (statut: string) => {
                    switch (statut) {
                      case 'disponible':
                        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">📍 Disponible</span>;
                      case 'prete':
                        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">👤 Prêté</span>;
                      case 'en_maintenance':
                        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">🔧 Maintenance</span>;
                      default:
                        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-dark-bg-tertiary text-gray-800 dark:bg-gray-900/30 dark:text-dark-text-muted">{statut}</span>;
                    }
                  };

                  return (
                    <tr
                      key={item.id}
                      onClick={() => handleRowClick(item)}
                      className={cn(
                        'hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors cursor-pointer',
                        getConditionRowClass(itemCondition)
                      )}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono font-medium text-gray-900 dark:text-dark-text-primary">
                            {item.code || item.numero_serie}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm text-gray-600 dark:text-dark-text-secondary">
                          {getTypeName(item.typeId)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                            {item.fabricant || '-'}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
                            {item.modele || item.nom || '-'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <ConditionBadge condition={itemCondition} size="sm" />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {getStatutBadge(item.statut)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        {item.valeur_achat ? (
                          <div className="flex flex-col items-end">
                            <span className="text-sm font-medium text-gray-900 dark:text-dark-text-primary dark:text-white">
                              {formatCurrency(item.valeur_actuelle || 0)}
                            </span>
                            <span className="text-xs text-gray-400 dark:text-dark-text-muted">
                              / {formatCurrency(item.valeur_achat)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400 dark:text-dark-text-muted">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRowClick(item);
                          }}
                          className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                          title="Consulter"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
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
