import React, { useState, useEffect } from 'react';
import { ShoppingCart, Package, TrendingUp, ShoppingBag, Plus, AlertTriangle } from 'lucide-react';
import { StockService } from '@/services/stockService';
import { StockProduct, Sale, Order } from '@/types/inventory';
import { useAuth } from '@/contexts/AuthContext';
import { ProduitsTab } from './ProduitsTab';
import { VentesTab } from './VentesTab';
import { CommandesTab } from './CommandesTab';
import toast from 'react-hot-toast';
import { cn } from '@/utils/utils';

type TabType = 'produits' | 'ventes' | 'commandes';

export function StockPage() {
  const { clubId } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('produits');
  const [loading, setLoading] = useState(true);

  // Stats
  const [stats, setStats] = useState({
    total_produits: 0,
    valeur_stock_totale: 0,
    produits_alerte: 0,
    ventes_mois: 0,
    ca_mois: 0,
    commandes_en_cours: 0
  });

  useEffect(() => {
    if (clubId) {
      loadStats();
    }
  }, [clubId]);

  const loadStats = async () => {
    if (!clubId) return;

    try {
      setLoading(true);
      const statsData = await StockService.getStats(clubId);
      setStats(statsData);
    } catch (error: any) {
      console.error('Erreur chargement stats:', error);
      toast.error(error.message || 'Erreur lors du chargement');
    } finally {
      setLoading(false);
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
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">Produits en Stock</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-dark-text-secondary">
          Gestion du stock, ventes et commandes fournisseurs
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-dark-text-secondary">Produits</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">{stats.total_produits}</p>
            </div>
            <Package className="h-8 w-8 text-gray-400" />
          </div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-700 dark:text-blue-300">Valeur stock</p>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                {stats.valeur_stock_totale.toFixed(0)} €
              </p>
            </div>
            <ShoppingBag className="h-8 w-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-orange-700 dark:text-orange-300">Alertes</p>
              <p className="text-2xl font-bold text-orange-900 dark:text-orange-100">{stats.produits_alerte}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-orange-600" />
          </div>
        </div>

        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-700 dark:text-green-300">Ventes mois</p>
              <p className="text-2xl font-bold text-green-900 dark:text-green-100">{stats.ventes_mois}</p>
            </div>
            <TrendingUp className="h-8 w-8 text-green-600" />
          </div>
        </div>

        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-purple-700 dark:text-purple-300">CA mois</p>
              <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                {stats.ca_mois.toFixed(0)} €
              </p>
            </div>
            <ShoppingCart className="h-8 w-8 text-purple-600" />
          </div>
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-yellow-700 dark:text-yellow-300">Commandes</p>
              <p className="text-2xl font-bold text-yellow-900 dark:text-yellow-100">{stats.commandes_en_cours}</p>
            </div>
            <ShoppingBag className="h-8 w-8 text-yellow-600" />
          </div>
        </div>
      </div>

      {/* Alert - Stock bas */}
      {stats.produits_alerte > 0 && (
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-orange-900 dark:text-orange-200">
                Stock bas
              </h3>
              <p className="mt-1 text-sm text-orange-800 dark:text-orange-300">
                {stats.produits_alerte} produit(s) ont atteint le seuil d'alerte. Pensez à réapprovisionner.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-dark-border">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('produits')}
            className={cn(
              activeTab === 'produits'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-dark-text-secondary dark:hover:text-dark-text-primary',
              'group inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium transition-colors'
            )}
          >
            <Package className={cn(
              activeTab === 'produits' ? 'text-blue-500' : 'text-gray-400',
              '-ml-0.5 mr-2 h-5 w-5'
            )} />
            <span>Produits</span>
          </button>

          <button
            onClick={() => setActiveTab('ventes')}
            className={cn(
              activeTab === 'ventes'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-dark-text-secondary dark:hover:text-dark-text-primary',
              'group inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium transition-colors'
            )}
          >
            <ShoppingCart className={cn(
              activeTab === 'ventes' ? 'text-blue-500' : 'text-gray-400',
              '-ml-0.5 mr-2 h-5 w-5'
            )} />
            <span>Ventes</span>
          </button>

          <button
            onClick={() => setActiveTab('commandes')}
            className={cn(
              activeTab === 'commandes'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-dark-text-secondary dark:hover:text-dark-text-primary',
              'group inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium transition-colors'
            )}
          >
            <ShoppingBag className={cn(
              activeTab === 'commandes' ? 'text-blue-500' : 'text-gray-400',
              '-ml-0.5 mr-2 h-5 w-5'
            )} />
            <span>Commandes</span>
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'produits' && <ProduitsTab onRefresh={loadStats} />}
        {activeTab === 'ventes' && <VentesTab onRefresh={loadStats} />}
        {activeTab === 'commandes' && <CommandesTab onRefresh={loadStats} />}
      </div>
    </div>
  );
}
