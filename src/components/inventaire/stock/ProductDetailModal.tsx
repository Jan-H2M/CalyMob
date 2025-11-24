import React, { useState } from 'react';
import { X, Save, Package } from 'lucide-react';
import { StockService } from '@/services/stockService';
import { StockProduct } from '@/types/inventory';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/utils/utils';
import toast from 'react-hot-toast';

interface Props {
  product: StockProduct;
  isCreateMode: boolean;
  onClose: () => void;
  onSave: () => void;
}

export function ProductDetailModal({ product, isCreateMode, onClose, onSave }: Props) {
  const { clubId } = useAuth();
  const [formData, setFormData] = useState<Partial<StockProduct>>({
    nom: product.nom || '',
    reference: product.reference || '',
    categorie: product.categorie || '',
    prix_achat: product.prix_achat || 0,
    prix_vente: product.prix_vente || 0,
    quantite_stock: product.quantite_stock || 0,
    seuil_alerte: product.seuil_alerte || 5,
    description: product.description || ''
  });
  const [saving, setSaving] = useState(false);

  // Auto-save handler for individual fields
  const handleFieldSave = async (field: string, value: any) => {
    if (isCreateMode || !clubId || !product.id) return;

    try {
      // Validation
      if (field === 'nom' && (!value || !value.trim())) {
        toast.error('Le nom est obligatoire');
        return;
      }
      if (field === 'prix_vente' && (!value || value <= 0)) {
        toast.error('Le prix de vente doit être supérieur à 0');
        return;
      }

      await StockService.updateProduct(clubId, product.id, { [field]: value });
      toast.success('✓ Sauvegardé', { duration: 1500, position: 'bottom-right' });
    } catch (error) {
      console.error(`Error saving ${field}:`, error);
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  const handleSave = async () => {
    if (!clubId) return;

    // Validation
    if (!formData.nom) {
      toast.error('Le nom est obligatoire');
      return;
    }

    if (formData.prix_vente === undefined || formData.prix_vente <= 0) {
      toast.error('Le prix de vente doit être supérieur à 0');
      return;
    }

    setSaving(true);

    try {
      if (isCreateMode) {
        await StockService.createProduct(clubId, formData as any);
        toast.success('Produit créé');
      } else {
        await StockService.updateProduct(clubId, product.id, formData);
        toast.success('Produit mis à jour');
      }

      onSave();
    } catch (error: any) {
      console.error('Erreur sauvegarde produit:', error);
      toast.error(error.message || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-30 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Slide-out Panel */}
      <div className="fixed right-0 top-0 h-full w-full md:w-2/3 lg:w-1/2 bg-white dark:bg-dark-bg-secondary shadow-xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 h-10 w-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
              <Package className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                {isCreateMode ? 'Nouveau produit' : product.nom}
              </h2>
              {!isCreateMode && product.reference && (
                <p className="text-sm text-gray-500 dark:text-dark-text-secondary">Réf: {product.reference}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-dark-text-primary"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                  Nom *
                </label>
                <input
                  type="text"
                  value={formData.nom}
                  onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                  onBlur={() => handleFieldSave('nom', formData.nom)}
                  disabled={isCreateMode}
                  placeholder="Masque Cressi"
                  className={cn(
                    "w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary",
                    isCreateMode && "opacity-100"
                  )}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                  Référence
                </label>
                <input
                  type="text"
                  value={formData.reference}
                  onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                  onBlur={() => handleFieldSave('reference', formData.reference)}
                  disabled={isCreateMode}
                  placeholder="MASK-001"
                  className={cn(
                    "w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary",
                    isCreateMode && "opacity-100"
                  )}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                  Catégorie
                </label>
                <input
                  type="text"
                  value={formData.categorie}
                  onChange={(e) => setFormData({ ...formData, categorie: e.target.value })}
                  onBlur={() => handleFieldSave('categorie', formData.categorie)}
                  disabled={isCreateMode}
                  placeholder="Masques"
                  className={cn(
                    "w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary",
                    isCreateMode && "opacity-100"
                  )}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                  Quantité en stock
                </label>
                <input
                  type="number"
                  value={formData.quantite_stock}
                  onChange={(e) => setFormData({ ...formData, quantite_stock: parseInt(e.target.value) || 0 })}
                  onBlur={() => handleFieldSave('quantite_stock', formData.quantite_stock)}
                  disabled={isCreateMode}
                  min="0"
                  className={cn(
                    "w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary",
                    isCreateMode && "opacity-100"
                  )}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                  Seuil d'alerte
                </label>
                <input
                  type="number"
                  value={formData.seuil_alerte}
                  onChange={(e) => setFormData({ ...formData, seuil_alerte: parseInt(e.target.value) || 0 })}
                  onBlur={() => handleFieldSave('seuil_alerte', formData.seuil_alerte)}
                  disabled={isCreateMode}
                  min="0"
                  className={cn(
                    "w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary",
                    isCreateMode && "opacity-100"
                  )}
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-secondary">
                  Alerte si stock ≤ ce seuil
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                  Prix d'achat (€)
                </label>
                <input
                  type="number"
                  value={formData.prix_achat}
                  onChange={(e) => setFormData({ ...formData, prix_achat: parseFloat(e.target.value) || 0 })}
                  onBlur={() => handleFieldSave('prix_achat', formData.prix_achat)}
                  disabled={isCreateMode}
                  min="0"
                  step="0.01"
                  className={cn(
                    "w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary",
                    isCreateMode && "opacity-100"
                  )}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                  Prix de vente (€) *
                </label>
                <input
                  type="number"
                  value={formData.prix_vente}
                  onChange={(e) => setFormData({ ...formData, prix_vente: parseFloat(e.target.value) || 0 })}
                  onBlur={() => handleFieldSave('prix_vente', formData.prix_vente)}
                  disabled={isCreateMode}
                  min="0"
                  step="0.01"
                  className={cn(
                    "w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary",
                    isCreateMode && "opacity-100"
                  )}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                onBlur={() => handleFieldSave('description', formData.description)}
                disabled={isCreateMode}
                rows={3}
                placeholder="Description du produit..."
                className={cn(
                  "w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary",
                  isCreateMode && "opacity-100"
                )}
              />
            </div>

            {/* Calcul marge */}
            {formData.prix_achat && formData.prix_vente && formData.prix_vente > formData.prix_achat && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-green-900 dark:text-green-200">
                    Marge
                  </span>
                  <span className="text-lg font-bold text-green-900 dark:text-green-100">
                    {((formData.prix_vente - formData.prix_achat) / formData.prix_achat * 100).toFixed(1)} %
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer - Only show in create mode */}
        {isCreateMode && (
          <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-dark-border">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-dark-text-secondary bg-white dark:bg-dark-bg-primary border border-gray-300 dark:border-dark-border rounded-md hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !formData.nom || !formData.prix_vente}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="h-4 w-4 mr-2" />
              Créer
            </button>
          </div>
        )}
      </div>
    </>
  );
}
