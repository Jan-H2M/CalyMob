import { logger } from '@/utils/logger';
/**
 * BoutiqueItemForm - Formulier voor het aanmaken/bewerken van boutique items
 */

import React, { useState, useEffect } from 'react';
import { X, Save, Package, Euro, Calendar, Building, Hash } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { BoutiqueStockService } from '@/services/boutiqueStockService';
import { BoutiqueItem, BoutiqueType, BoutiqueItemFormData } from '@/types/boutique';
import { cn } from '@/utils/utils';
import toast from 'react-hot-toast';

interface BoutiqueItemFormProps {
  item: BoutiqueItem | null;
  type: BoutiqueType;
  onSave: () => void;
  onClose: () => void;
}

export function BoutiqueItemForm({ item, type, onSave, onClose }: BoutiqueItemFormProps) {
  const { clubId, user } = useAuth();
  const isEditing = !!item;

  const [formData, setFormData] = useState<BoutiqueItemFormData>({
    type: type,
    nom: '',
    description: '',
    quantite: 0,
    prix_achat: 0,
    prix_vente: undefined,
    date_achat: new Date(),
    fournisseur: '',
    reference: '',
    photo_url: '',
    actif: true
  });

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize form with existing item data
  useEffect(() => {
    if (item) {
      setFormData({
        type: item.type,
        nom: item.nom,
        description: item.description || '',
        quantite: item.quantite,
        prix_achat: item.prix_achat,
        prix_vente: item.prix_vente,
        date_achat: item.date_achat,
        fournisseur: item.fournisseur || '',
        reference: item.reference || '',
        photo_url: item.photo_url || '',
        actif: item.actif
      });
    } else {
      setFormData(prev => ({
        ...prev,
        type: type
      }));
    }
  }, [item, type]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.nom.trim()) {
      newErrors.nom = 'Le nom est obligatoire';
    }

    if (formData.quantite < 0) {
      newErrors.quantite = 'La quantité ne peut pas être négative';
    }

    if (formData.prix_achat < 0) {
      newErrors.prix_achat = "Le prix d'achat ne peut pas être négatif";
    }

    if (formData.prix_vente !== undefined && formData.prix_vente < 0) {
      newErrors.prix_vente = 'Le prix de vente ne peut pas être négatif';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;
    if (!clubId) {
      toast.error('Club non trouvé');
      return;
    }

    setSaving(true);
    try {
      if (isEditing && item) {
        await BoutiqueStockService.updateItem(clubId, item.id, formData);
        toast.success('Article mis à jour');
      } else {
        await BoutiqueStockService.addItem(clubId, formData, user?.uid);
        toast.success('Article ajouté');
      }
      onSave();
    } catch (error) {
      logger.error('Erreur sauvegarde:', error);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: keyof BoutiqueItemFormData, value: unknown) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Clear error when field is modified
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const typeLabels: Record<BoutiqueType, string> = {
    boutique: 'Boutique Club',
    boutique_lifras: 'Boutique LIFRAS'
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-calypso-blue/10 rounded-lg">
              <Package className="h-5 w-5 text-calypso-blue" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                {isEditing ? 'Modifier article' : 'Nouvel article'}
              </h2>
              <p className="text-sm text-gray-500 dark:text-dark-text-muted">
                {typeLabels[formData.type]}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 dark:text-dark-text-muted hover:text-gray-600 dark:text-dark-text-secondary dark:hover:text-dark-text-primary rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Nom */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
              Nom de l'article *
            </label>
            <input
              type="text"
              value={formData.nom}
              onChange={(e) => handleChange('nom', e.target.value)}
              className={cn(
                "w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-calypso-blue dark:bg-dark-bg-tertiary dark:text-dark-text-primary",
                errors.nom ? "border-red-500" : "border-gray-300 dark:border-dark-border"
              )}
              placeholder="Ex: T-shirt Calypso"
            />
            {errors.nom && (
              <p role="alert" className="mt-1 text-sm text-red-500">{errors.nom}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
              placeholder="Description optionnelle..."
            />
          </div>

          {/* Reference & Fournisseur */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                <Hash className="h-3 w-3 inline mr-1" />
                Référence
              </label>
              <input
                type="text"
                value={formData.reference}
                onChange={(e) => handleChange('reference', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                placeholder="REF-001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                <Building className="h-3 w-3 inline mr-1" />
                Fournisseur
              </label>
              <input
                type="text"
                value={formData.fournisseur}
                onChange={(e) => handleChange('fournisseur', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                placeholder="Nom du fournisseur"
              />
            </div>
          </div>

          {/* Quantité & Date achat */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                Quantité en stock
              </label>
              <input
                type="number"
                min="0"
                value={formData.quantite}
                onChange={(e) => handleChange('quantite', parseInt(e.target.value) || 0)}
                className={cn(
                  "w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-calypso-blue dark:bg-dark-bg-tertiary dark:text-dark-text-primary",
                  errors.quantite ? "border-red-500" : "border-gray-300 dark:border-dark-border"
                )}
              />
              {errors.quantite && (
                <p role="alert" className="mt-1 text-sm text-red-500">{errors.quantite}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                <Calendar className="h-3 w-3 inline mr-1" />
                Date d'achat
              </label>
              <input
                type="date"
                value={formData.date_achat.toISOString().split('T')[0]}
                onChange={(e) => handleChange('date_achat', new Date(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
              />
            </div>
          </div>

          {/* Prix */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                <Euro className="h-3 w-3 inline mr-1" />
                Prix d'achat (unitaire)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.prix_achat}
                onChange={(e) => handleChange('prix_achat', parseFloat(e.target.value) || 0)}
                className={cn(
                  "w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-calypso-blue dark:bg-dark-bg-tertiary dark:text-dark-text-primary",
                  errors.prix_achat ? "border-red-500" : "border-gray-300 dark:border-dark-border"
                )}
              />
              {errors.prix_achat && (
                <p role="alert" className="mt-1 text-sm text-red-500">{errors.prix_achat}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                <Euro className="h-3 w-3 inline mr-1" />
                Prix de vente (optionnel)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.prix_vente || ''}
                onChange={(e) => handleChange('prix_vente', e.target.value ? parseFloat(e.target.value) : undefined)}
                className={cn(
                  "w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-calypso-blue dark:bg-dark-bg-tertiary dark:text-dark-text-primary",
                  errors.prix_vente ? "border-red-500" : "border-gray-300 dark:border-dark-border"
                )}
              />
              {errors.prix_vente && (
                <p role="alert" className="mt-1 text-sm text-red-500">{errors.prix_vente}</p>
              )}
            </div>
          </div>

          {/* Calculated value */}
          <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-dark-text-secondary">
                Valeur totale du stock:
              </span>
              <span className="text-lg font-semibold text-green-600 dark:text-green-400">
                {new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(
                  formData.quantite * formData.prix_achat
                )}
              </span>
            </div>
          </div>

          {/* Actif checkbox */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="actif"
              checked={formData.actif}
              onChange={(e) => handleChange('actif', e.target.checked)}
              className="h-4 w-4 text-calypso-blue rounded focus:ring-calypso-blue"
            />
            <label htmlFor="actif" className="text-sm text-gray-700 dark:text-dark-text-primary">
              Article actif (disponible à la vente)
            </label>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-dark-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue/90 transition-colors disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
