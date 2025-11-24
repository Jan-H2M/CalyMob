import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, Package, AlertTriangle, Eye, Trash2 } from 'lucide-react';
import { StockService } from '@/services/stockService';
import { StockProduct } from '@/types/inventory';
import { useAuth } from '@/contexts/AuthContext';
import { ProductDetailModal } from './ProductDetailModal';
import toast from 'react-hot-toast';
import { cn } from '@/utils/utils';

interface Props {
  onRefresh: () => void;
}

export function ProduitsTab({ onRefresh }: Props) {
  const { clubId } = useAuth();
  const [products, setProducts] = useState<StockProduct[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtres
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategorie, setFilterCategorie] = useState('');

  // Modal
  const [detailProduct, setDetailProduct] = useState<StockProduct | null>(null);
  const [isCreateMode, setIsCreateMode] = useState(false);

  // Categories (dynamiques depuis les produits)
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    if (clubId) {
      loadProducts();
    }
  }, [clubId, filterCategorie, searchTerm]);

  const loadProducts = async () => {
    if (!clubId) return;

    try {
      setLoading(true);

      const filters: any = {};
      if (filterCategorie) filters.categorie = filterCategorie;
      if (searchTerm) filters.search = searchTerm;

      const productsData = await StockService.getProducts(clubId, filters);
      setProducts(productsData);

      // Extraire catégories uniques
      const cats = Array.from(new Set(productsData.map(p => p.categorie).filter(Boolean)));
      setCategories(cats);
    } catch (error: any) {
      console.error('Erreur chargement produits:', error);
      toast.error(error.message || 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = () => {
    const emptyProduct: StockProduct = {
      id: '',
      nom: '',
      reference: '',
      categorie: '',
      prix_achat: 0,
      prix_vente: 0,
      quantite_stock: 0,
      seuil_alerte: 5,
      createdAt: undefined as any,
      updatedAt: undefined as any
    };

    setDetailProduct(emptyProduct);
    setIsCreateMode(true);
  };

  const handleEdit = (product: StockProduct) => {
    setDetailProduct(product);
    setIsCreateMode(false);
  };

  const handleCloseModal = () => {
    setDetailProduct(null);
    setIsCreateMode(false);
  };

  const handleSaveModal = () => {
    loadProducts();
    onRefresh();
    handleCloseModal();
  };

  const handleDelete = async (product: StockProduct) => {
    if (!clubId) return;

    const confirmed = window.confirm(
      `Supprimer le produit "${product.nom}" ?\n\n` +
      `Cette action est irréversible.`
    );

    if (!confirmed) return;

    try {
      await StockService.deleteProduct(clubId, product.id);
      toast.success('Produit supprimé');
      loadProducts();
      onRefresh();
    } catch (error: any) {
      console.error('Erreur suppression produit:', error);
      toast.error(error.message || 'Erreur lors de la suppression');
    }
  };

  const getStockBadge = (product: StockProduct) => {
    const isLow = product.quantite_stock <= product.seuil_alerte;
    const isOut = product.quantite_stock === 0;

    if (isOut) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
          <AlertTriangle className="h-3 w-3" />
          Rupture
        </span>
      );
    }

    if (isLow) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
          <AlertTriangle className="h-3 w-3" />
          Stock bas
        </span>
      );
    }

    return (
      <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
        OK
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">
          Liste des produits
        </h3>
        <button
          onClick={handleCreateNew}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nouveau produit
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow p-4">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-5 w-5 text-gray-400" />
          <h4 className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">Filtres</h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher un produit..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
            />
          </div>

          {/* Categorie */}
          <select
            value={filterCategorie}
            onChange={(e) => setFilterCategorie(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
          >
            <option value="">Toutes les catégories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
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
                Produit
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                Catégorie
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                Stock
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                Prix vente
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                Statut
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
            {products.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500 dark:text-dark-text-secondary">
                  Aucun produit trouvé
                </td>
              </tr>
            ) : (
              products.map((product) => (
                <tr
                  key={product.id}
                  className="hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary transition-colors"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <Package className="h-5 w-5 text-gray-400 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                          {product.nom}
                        </p>
                        {product.reference && (
                          <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
                            Réf: {product.reference}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-dark-text-secondary">
                    {product.categorie || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-dark-text-primary">
                    {product.quantite_stock}
                    <span className="text-xs text-gray-500 dark:text-dark-text-secondary ml-1">
                      (seuil: {product.seuil_alerte})
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-dark-text-primary">
                    {product.prix_vente.toFixed(2)} €
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStockBadge(product)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleEdit(product)}
                        className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                        title="Consulter"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(product)}
                        className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                        title="Supprimer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {detailProduct && (
        <ProductDetailModal
          product={detailProduct}
          isCreateMode={isCreateMode}
          onClose={handleCloseModal}
          onSave={handleSaveModal}
        />
      )}
    </div>
  );
}
