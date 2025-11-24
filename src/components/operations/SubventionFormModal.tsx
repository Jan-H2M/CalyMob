import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Operation } from '@/types';
import toast from 'react-hot-toast';

interface SubventionFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<Operation>) => Promise<void>;
  subvention?: Operation | null;
}

export function SubventionFormModal({ isOpen, onClose, onSave, subvention }: SubventionFormModalProps) {
  const [formData, setFormData] = useState({
    titre: subvention?.titre || '',
    description: subvention?.description || '',
    montant_prevu: subvention?.montant_prevu || 0,
    date_demande: subvention?.date_debut ? new Date(subvention.date_debut).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    date_reception: subvention?.date_fin ? new Date(subvention.date_fin).toISOString().split('T')[0] : '',
    organisme: '',
    statut: subvention?.statut || 'brouillon'
  });

  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.titre.trim()) {
      toast.error('Le titre est obligatoire');
      return;
    }

    if (formData.montant_prevu <= 0) {
      toast.error('Le montant doit être supérieur à 0');
      return;
    }

    try {
      setSaving(true);

      // Build operation data - only include date_fin if it has a value
      const operationData: Partial<Operation> = {
        type: 'subvention',
        titre: formData.titre,
        description: formData.description,
        montant_prevu: formData.montant_prevu,
        date_debut: new Date(formData.date_demande),
        statut: formData.statut as any
      };

      // Only add date_fin if date_reception is provided
      if (formData.date_reception) {
        operationData.date_fin = new Date(formData.date_reception);
      }

      await onSave(operationData);
      onClose();
    } catch (error) {
      console.error('Error saving subvention:', error);
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
            {subvention?.id ? 'Modifier la subvention' : 'Nouvelle subvention'}
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
          {/* Titre/Organisme */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Titre/Organisme *
            </label>
            <input
              type="text"
              value={formData.titre}
              onChange={(e) => setFormData({ ...formData, titre: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              placeholder="Ex: Subvention ADEPS 2025"
              required
            />
          </div>

          {/* Montant */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Montant prévu/reçu (€) *
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.montant_prevu}
              onChange={(e) => setFormData({ ...formData, montant_prevu: parseFloat(e.target.value) || 0 })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              required
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                Date de demande *
              </label>
              <input
                type="date"
                value={formData.date_demande}
                onChange={(e) => setFormData({ ...formData, date_demande: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                Date de réception
              </label>
              <input
                type="date"
                value={formData.date_reception}
                onChange={(e) => setFormData({ ...formData, date_reception: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Description/Conditions */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Description / Conditions
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              placeholder="Détails sur la subvention, conditions, documents requis..."
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
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
            >
              <option value="brouillon">Brouillon</option>
              <option value="ouvert">Demandé</option>
              <option value="ferme">Reçu</option>
              <option value="annule">Refusé</option>
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
              className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Enregistrement...' : subvention?.id ? 'Modifier' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
