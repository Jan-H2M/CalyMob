import { logger } from '@/utils/logger';
/**
 * BoutiquePage - Beheer van boutique stock
 *
 * Tabbladen voor:
 * - Boutique Club (merchandise, accessoires)
 * - Boutique LIFRAS (LIFRAS materiaal)
 *
 * De stockwaarde wordt automatisch berekend en gebruikt
 * voor Bilan codes 02.01.01 en 02.01.02
 */

import { useState, useEffect, useMemo } from 'react';
import {
  Package,
  Plus,
  Search,
  Euro,
  TrendingUp,
  Edit,
  Trash2,
  ShoppingBag,
  Archive,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { BoutiqueStockService } from '@/services/boutiqueStockService';
import { BoutiqueItem, BoutiqueType, BoutiqueStockSummary } from '@/types/boutique';
import { BoutiqueItemForm } from './BoutiqueItemForm';
import { cn } from '@/utils/utils';
import toast from 'react-hot-toast';

type Tab = 'boutique' | 'boutique_lifras';

export function BoutiquePage() {
  const { clubId } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('boutique');
  const [items, setItems] = useState<BoutiqueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [summary, setSummary] = useState<BoutiqueStockSummary | null>(null);

  // Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BoutiqueItem | null>(null);

  // Load data
  useEffect(() => {
    loadData();
  }, [clubId, activeTab]);

  const loadData = async () => {
    if (!clubId) return;

    setLoading(true);
    try {
      const [itemsData, summaryData] = await Promise.all([
        BoutiqueStockService.getItems(clubId, activeTab as BoutiqueType),
        BoutiqueStockService.getStockSummary(clubId, activeTab as BoutiqueType)
      ]);

      setItems(itemsData);
      setSummary(summaryData);
    } catch (error) {
      logger.error('Erreur chargement boutique:', error);
      toast.error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  // Filtered items
  const filteredItems = useMemo(() => {
    let result = items;

    // Filter by active/inactive
    if (!showInactive) {
      result = result.filter(item => item.actif);
    }

    // Filter by search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(item =>
        item.nom.toLowerCase().includes(term) ||
        item.description?.toLowerCase().includes(term) ||
        item.reference?.toLowerCase().includes(term) ||
        item.fournisseur?.toLowerCase().includes(term)
      );
    }

    return result;
  }, [items, showInactive, searchTerm]);

  // Handlers
  const handleAddItem = () => {
    setEditingItem(null);
    setIsFormOpen(true);
  };

  const handleEditItem = (item: BoutiqueItem) => {
    setEditingItem(item);
    setIsFormOpen(true);
  };

  const handleDeleteItem = async (item: BoutiqueItem) => {
    if (!clubId) return;

    const confirmed = window.confirm(
      `Êtes-vous sûr de vouloir supprimer "${item.nom}" ?\n\nCette action est irréversible.`
    );

    if (!confirmed) return;

    try {
      await BoutiqueStockService.deleteItem(clubId, item.id);
      toast.success('Article supprimé');
      loadData();
    } catch (error) {
      logger.error('Erreur suppression:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  const handleToggleActive = async (item: BoutiqueItem) => {
    if (!clubId) return;

    try {
      await BoutiqueStockService.updateItem(clubId, item.id, {
        actif: !item.actif
      });
      toast.success(item.actif ? 'Article désactivé' : 'Article réactivé');
      loadData();
    } catch (error) {
      logger.error('Erreur mise à jour:', error);
      toast.error('Erreur lors de la mise à jour');
    }
  };

  const handleFormSave = async () => {
    setIsFormOpen(false);
    setEditingItem(null);
    loadData();
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingItem(null);
  };

  // Format currency
  const formatEuro = (value: number) => {
    return new Intl.NumberFormat('fr-BE', {
      style: 'currency',
      currency: 'EUR'
    }).format(value);
  };

  const tabLabels: Record<Tab, string> = {
    boutique: 'Boutique Club',
    boutique_lifras: 'Boutique LIFRAS'
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-dark-text-muted mb-2">
            <span>Paramètres</span>
            <span>/</span>
            <span>Comptabilité</span>
            <span>/</span>
            <span className="text-gray-900 dark:text-dark-text-primary">Boutique</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
            Gestion du Stock Boutique
          </h1>
          <p className="text-gray-600 dark:text-dark-text-secondary mt-1">
            Gérez le stock de la boutique club et LIFRAS. Les valeurs sont automatiquement reportées au Bilan.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-dark-border mb-6">
          {(['boutique', 'boutique_lifras'] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-6 py-3 font-medium text-sm border-b-2 transition-colors',
                activeTab === tab
                  ? 'border-calypso-blue text-calypso-blue dark:text-calypso-aqua'
                  : 'border-transparent text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:text-dark-text-primary dark:hover:text-dark-text-primary'
              )}
            >
              <div className="flex items-center gap-2">
                {tab === 'boutique' ? (
                  <ShoppingBag className="h-4 w-4" />
                ) : (
                  <Package className="h-4 w-4" />
                )}
                {tabLabels[tab]}
              </div>
            </button>
          ))}
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white dark:bg-dark-bg-secondary rounded-xl p-4 border border-gray-200 dark:border-dark-border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Articles</p>
                  <p className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary">
                    {summary.totalItems}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-dark-bg-secondary rounded-xl p-4 border border-gray-200 dark:border-dark-border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                  <Archive className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Total en stock</p>
                  <p className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary">
                    {summary.totalQuantite} pièces
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-dark-bg-secondary rounded-xl p-4 border border-gray-200 dark:border-dark-border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <Euro className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Valeur stock</p>
                  <p className="text-xl font-semibold text-green-600 dark:text-green-400">
                    {formatEuro(summary.totalValue)}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-dark-bg-secondary rounded-xl p-4 border border-gray-200 dark:border-dark-border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Valeur vente</p>
                  <p className="text-xl font-semibold text-amber-600 dark:text-amber-400">
                    {formatEuro(summary.totalSaleValue || 0)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Info Banner */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="p-1 bg-blue-100 dark:bg-blue-900/50 rounded">
              <Euro className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                Lien avec le Bilan
              </p>
              <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                La valeur du stock ({formatEuro(summary?.totalValue || 0)}) est automatiquement utilisée pour le code{' '}
                <strong>{activeTab === 'boutique' ? '02.01.01 Boutique' : '02.01.02 Boutique LIFRAS'}</strong>{' '}
                dans le Bilan.
              </p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border">
          <div className="p-4 border-b border-gray-200 dark:border-dark-border">
            <div className="flex flex-col sm:flex-row justify-between gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
                  <input
                    type="text"
                    placeholder="Rechercher un article..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-dark-text-secondary">
                  <input
                    type="checkbox"
                    checked={showInactive}
                    onChange={(e) => setShowInactive(e.target.checked)}
                    className="h-4 w-4 text-calypso-blue rounded focus:ring-calypso-blue"
                  />
                  Afficher inactifs
                </label>
                <button
                  onClick={loadData}
                  className="p-2 text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
                  title="Actualiser"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button
                  onClick={handleAddItem}
                  className="flex items-center gap-2 px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue/90 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Nouvel article
                </button>
              </div>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="p-12 text-center">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-calypso-blue" />
              <p className="mt-2 text-gray-500 dark:text-dark-text-muted">Chargement...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-12 text-center text-gray-500 dark:text-dark-text-muted">
              {searchTerm ? (
                <>
                  <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Aucun article trouvé pour "{searchTerm}"</p>
                </>
              ) : (
                <>
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Aucun article dans la boutique</p>
                  <button
                    onClick={handleAddItem}
                    className="mt-4 text-calypso-blue hover:underline"
                  >
                    Ajouter un premier article
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-dark-bg-tertiary">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-dark-text-primary uppercase">
                      Article
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 dark:text-dark-text-primary uppercase">
                      Qté
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-dark-text-primary uppercase">
                      Prix achat
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-dark-text-primary uppercase">
                      Prix vente
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-dark-text-primary uppercase">
                      Valeur stock
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 dark:text-dark-text-primary uppercase">
                      Statut
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-dark-text-primary uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                  {filteredItems.map((item) => (
                    <tr
                      key={item.id}
                      className={cn(
                        "hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary",
                        !item.actif && "opacity-50"
                      )}
                    >
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-dark-text-primary">
                            {item.nom}
                          </p>
                          {item.reference && (
                            <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                              Réf: {item.reference}
                            </p>
                          )}
                          {item.description && (
                            <p className="text-xs text-gray-500 dark:text-dark-text-muted line-clamp-1">
                              {item.description}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          "font-medium",
                          item.quantite === 0 && "text-red-600 dark:text-red-400",
                          item.quantite > 0 && item.quantite <= 3 && "text-amber-600 dark:text-amber-400",
                          item.quantite > 3 && "text-gray-900 dark:text-dark-text-primary"
                        )}>
                          {item.quantite}
                        </span>
                        {item.quantite === 0 && (
                          <AlertTriangle className="h-3 w-3 inline ml-1 text-red-500" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-700 dark:text-dark-text-primary">
                        {formatEuro(item.prix_achat)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-700 dark:text-dark-text-primary">
                        {item.prix_vente ? formatEuro(item.prix_vente) : '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-green-600 dark:text-green-400">
                        {formatEuro(item.quantite * item.prix_achat)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          "px-2 py-1 text-xs rounded-full",
                          item.actif
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-gray-100 dark:bg-dark-bg-tertiary text-gray-600 dark:text-dark-text-secondary dark:bg-gray-800 dark:text-dark-text-muted"
                        )}>
                          {item.actif ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEditItem(item)}
                            className="p-1 text-gray-400 dark:text-dark-text-muted hover:text-calypso-blue rounded transition-colors"
                            title="Modifier"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleToggleActive(item)}
                            className="p-1 text-gray-400 dark:text-dark-text-muted hover:text-amber-500 rounded transition-colors"
                            title={item.actif ? 'Désactiver' : 'Réactiver'}
                          >
                            <Archive className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item)}
                            className="p-1 text-gray-400 dark:text-dark-text-muted hover:text-red-500 rounded transition-colors"
                            title="Supprimer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Form Modal */}
      {isFormOpen && (
        <BoutiqueItemForm
          item={editingItem}
          type={activeTab as BoutiqueType}
          onSave={handleFormSave}
          onClose={handleFormClose}
        />
      )}
    </div>
  );
}
