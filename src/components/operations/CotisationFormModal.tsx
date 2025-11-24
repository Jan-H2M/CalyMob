import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Operation } from '@/types';
import toast from 'react-hot-toast';

interface CotisationFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<Operation>) => Promise<void>;
  cotisation?: Operation | null;
}

export function CotisationFormModal({ isOpen, onClose, onSave, cotisation }: CotisationFormModalProps) {
  const [formData, setFormData] = useState({
    titre: '',
    description: '',
    montant_prevu: 0,
    periode_debut: '',
    periode_fin: '',
    statut: 'brouillon'
  });

  const [saving, setSaving] = useState(false);

  // Update form when cotisation changes (for edit mode)
  useEffect(() => {
    if (cotisation) {
      setFormData({
        titre: cotisation.titre || '',
        description: cotisation.description || '',
        montant_prevu: cotisation.montant_prevu || 0,
        periode_debut: cotisation.periode_debut ? new Date(cotisation.periode_debut).toISOString().split('T')[0] : '',
        periode_fin: cotisation.periode_fin ? new Date(cotisation.periode_fin).toISOString().split('T')[0] : '',
        statut: cotisation.statut || 'brouillon'
      });
    } else {
      // Reset for new cotisation
      setFormData({
        titre: '',
        description: '',
        montant_prevu: 0,
        periode_debut: '',
        periode_fin: '',
        statut: 'brouillon'
      });
    }
  }, [cotisation, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.titre.trim()) {
      toast.error('Le titre est obligatoire');
      return;
    }

    try {
      setSaving(true);

      // Build the operation object, only including date fields if they have values
      const operationData: Partial<Operation> = {
        type: 'cotisation',
        titre: formData.titre,
        description: formData.description,
        montant_prevu: formData.montant_prevu,
        statut: formData.statut as any
      };

      // Only add date fields if they have values (Firestore doesn't accept undefined)
      if (formData.periode_debut) {
        operationData.periode_debut = new Date(formData.periode_debut);
      }
      if (formData.periode_fin) {
        operationData.periode_fin = new Date(formData.periode_fin);
      }

      await onSave(operationData);
      onClose();
    } catch (error) {
      console.error('Error saving cotisation:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-dark-border">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
            {cotisation?.id ? 'Modifier la cotisation' : 'Nouvelle cotisation'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 dark:text-dark-text-muted hover:text-gray-600 dark:text-dark-text-secondary transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Titre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Titre *
            </label>
            <input
              type="text"
              value={formData.titre}
              onChange={(e) => setFormData({ ...formData, titre: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="Ex: Cotisation annuelle 2025"
              required
            />
          </div>

          {/* Montant */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Montant prévu (€)
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.montant_prevu}
              onChange={(e) => setFormData({ ...formData, montant_prevu: parseFloat(e.target.value) || 0 })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="Optionnel"
            />
          </div>

          {/* Période */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                Période début
              </label>
              <input
                type="date"
                value={formData.periode_debut}
                onChange={(e) => setFormData({ ...formData, periode_debut: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                Période fin
              </label>
              <input
                type="date"
                value={formData.periode_fin}
                onChange={(e) => setFormData({ ...formData, periode_fin: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="Notes ou détails supplémentaires..."
            />
          </div>

          {/* Statut */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Statut
            </label>
            <select
              value={formData.statut}
              onChange={(e) => setFormData({ ...formData, statut: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="brouillon">Brouillon</option>
              <option value="ouvert">Ouvert</option>
              <option value="ferme">Fermé</option>
              <option value="annule">Annulé</option>
            </select>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-dark-border">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:bg-dark-bg-tertiary transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Enregistrement...' : cotisation?.id ? 'Modifier' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
