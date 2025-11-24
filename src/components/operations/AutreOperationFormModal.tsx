import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Operation } from '@/types';
import toast from 'react-hot-toast';

interface AutreOperationFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<Operation>) => Promise<void>;
  operation?: Operation | null;
}

export function AutreOperationFormModal({ isOpen, onClose, onSave, operation }: AutreOperationFormModalProps) {
  const [formData, setFormData] = useState({
    titre: operation?.titre || '',
    description: operation?.description || '',
    montant_prevu: operation?.montant_prevu || 0,
    date: operation?.date_debut ? new Date(operation.date_debut).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    statut: operation?.statut || 'brouillon'
  });

  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.titre.trim()) {
      toast.error('Le titre est obligatoire');
      return;
    }

    if (formData.montant_prevu === 0) {
      toast.error('Le montant ne peut pas être 0');
      return;
    }

    try {
      setSaving(true);
      await onSave({
        type: 'autre',
        titre: formData.titre,
        description: formData.description,
        montant_prevu: formData.montant_prevu,
        date_debut: new Date(formData.date),
        statut: formData.statut as any
      });
      onClose();
    } catch (error) {
      console.error('Error saving operation:', error);
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
            {operation?.id ? 'Modifier l\'activité' : 'Nouvelle activité'}
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
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent"
              placeholder="Titre de l'activité"
              required
            />
          </div>

          {/* Montant */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Montant (€) *
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.montant_prevu}
              onChange={(e) => setFormData({ ...formData, montant_prevu: parseFloat(e.target.value) || 0 })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent"
              required
            />
            <p className="text-sm text-gray-500 dark:text-dark-text-muted mt-1">
              Montant positif pour une entrée, négatif pour une sortie
            </p>
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Date *
            </label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Description *
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent"
              placeholder="Description détaillée de l'activité..."
              required
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
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent"
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
              className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Enregistrement...' : operation?.id ? 'Modifier' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
